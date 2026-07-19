from __future__ import annotations

import argparse
import csv
import io
import logging
import math
import os
import re
import shutil
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import can
import cantools
from flask import Flask, Response, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge


ROOT = Path(__file__).resolve().parent
UPLOAD_DIR = ROOT / "uploads"
STATIC_DIR = ROOT / "static"
LOG_EXTENSIONS = {".blf", ".asc"}
ALLOWED_EXTENSIONS = {*LOG_EXTENSIONS, ".dbc"}
SESSION_HEADER = "X-CAN-Session"
SESSION_MAX_AGE_SECONDS = 4 * 60 * 60
MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024
WINDOWS_TIMEZONE_TO_IANA = {
    "China Standard Time": "Asia/Shanghai",
    "中国标准时间": "Asia/Shanghai",
    "Taipei Standard Time": "Asia/Taipei",
    "Tokyo Standard Time": "Asia/Tokyo",
    "Korea Standard Time": "Asia/Seoul",
    "Singapore Standard Time": "Asia/Singapore",
    "GMT Standard Time": "Europe/London",
    "W. Europe Standard Time": "Europe/Berlin",
    "Central European Standard Time": "Europe/Berlin",
    "Eastern Standard Time": "America/New_York",
    "Central Standard Time": "America/Chicago",
    "Mountain Standard Time": "America/Denver",
    "Pacific Standard Time": "America/Los_Angeles",
}

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES
CORS(app)
logging.getLogger("cantools").setLevel(logging.ERROR)


@app.after_request
def add_cache_headers(response: Response) -> Response:
    if request.path == "/" or request.path.endswith((".html", ".js", ".css")):
        response.headers["Cache-Control"] = "no-store, max-age=0"
    return response


@app.errorhandler(RequestEntityTooLarge)
def handle_upload_too_large(_: RequestEntityTooLarge) -> tuple[Response, int]:
    return jsonify({"error": "上传文件超过服务端上限。请确认 Waitress 使用 --max-request-body-size=4294967296，反向代理也允许足够大的 client_max_body_size。"}), 413


@dataclass(frozen=True)
class CanFile:
    id: str
    name: str
    path: Path
    size: int
    kind: str


def _safe_display_name(name: str) -> str:
    name = Path(name).name
    name = re.sub(r"[\x00-\x1f<>:\"/\\|?*]+", "_", name).strip()
    return name or f"can-file-{uuid.uuid4().hex}"


def _file_id(path: Path) -> str:
    try:
        rel = path.resolve().relative_to(ROOT)
    except ValueError:
        rel = path.name
    return str(rel).replace("\\", "/")


def _valid_session_id(session_id: str) -> str:
    if not re.fullmatch(r"[a-f0-9]{32}", session_id or ""):
        raise ValueError("Invalid file session.")
    return session_id


def _request_session_id() -> str:
    session_id = _valid_session_id(request.headers.get(SESSION_HEADER, ""))
    _touch_session(session_id)
    return session_id


def _session_dir(session_id: str) -> Path:
    return UPLOAD_DIR / _valid_session_id(session_id)


def _touch_session(session_id: str) -> None:
    folder = _session_dir(session_id)
    if not folder.exists():
        return
    try:
        os.utime(folder, None)
    except OSError:
        pass


def _cleanup_old_sessions() -> None:
    if not UPLOAD_DIR.exists():
        return
    now = time.time()
    for folder in UPLOAD_DIR.iterdir():
        if not folder.is_dir():
            continue
        try:
            if now - folder.stat().st_mtime > SESSION_MAX_AGE_SECONDS:
                shutil.rmtree(folder, ignore_errors=True)
        except OSError:
            continue


def _resolve_file(file_id: str, expected_ext: str | None = None, session_id: str | None = None) -> Path:
    session_root = _session_dir(session_id or _request_session_id()).resolve()
    path = (ROOT / file_id).resolve()
    if not (path == session_root or session_root in path.parents):
        raise ValueError("File is outside the current session.")
    if expected_ext and path.suffix.lower() != expected_ext:
        raise ValueError(f"Expected a {expected_ext} file.")
    if not path.exists() or not path.is_file():
        raise ValueError("File does not exist.")
    return path


def _resolve_log_file(file_id: str) -> Path:
    path = _resolve_file(file_id)
    if path.suffix.lower() not in LOG_EXTENSIONS:
        raise ValueError("Expected a .blf or .asc log file.")
    return path


def _resolve_log_files(data: dict[str, Any]) -> list[Path]:
    file_ids = data.get("logFiles")
    if file_ids is None:
        file_ids = [data.get("blfFile", "")]
    if not isinstance(file_ids, list):
        raise ValueError("日志文件列表无效。")
    paths = [_resolve_log_file(file_id) for file_id in dict.fromkeys(file_ids) if file_id]
    if not paths:
        raise ValueError("请选择至少一个 .blf 或 .asc 日志文件。")
    return paths


def _unique_upload_path(folder: Path, filename: str) -> Path:
    candidate = folder / filename
    if not candidate.exists():
        return candidate
    stem = Path(filename).stem
    suffix = Path(filename).suffix
    index = 2
    while candidate.exists():
        candidate = folder / f"{stem} ({index}){suffix}"
        index += 1
    return candidate


def _list_can_files(session_id: str) -> list[CanFile]:
    files: list[CanFile] = []
    folder = _session_dir(session_id)
    if not folder.exists():
        return files
    for path in sorted(folder.rglob("*"), key=lambda p: p.name.lower()):
        ext = path.suffix.lower()
        if path.is_file() and ext in ALLOWED_EXTENSIONS:
            files.append(
                CanFile(
                    id=_file_id(path),
                    name=path.name,
                    path=path,
                    size=path.stat().st_size,
                    kind=ext.lstrip("."),
                )
            )
    return files


def _load_database(dbc_paths: list[Path]) -> cantools.database.Database:
    db = cantools.database.Database(strict=False)
    for dbc_path in dbc_paths:
        db.add_dbc_file(str(dbc_path), encoding=_detect_dbc_encoding(dbc_path))
    db.refresh()
    return db


def _detect_dbc_encoding(dbc_path: Path) -> str:
    candidates: list[tuple[int, str]] = []
    for encoding in ("utf-8", "gb18030"):
        try:
            probe = cantools.database.Database(strict=False)
            probe.add_dbc_file(str(dbc_path), encoding=encoding)
            probe.refresh()
        except UnicodeError:
            continue
        except Exception:
            if encoding == "utf-8":
                continue
            raise
        candidates.append((_database_text_score(probe), encoding))
    if not candidates:
        return "utf-8"
    return max(candidates)[1]


def _database_text_score(db: cantools.database.Database) -> int:
    score = 0
    for message in db.messages:
        score += _text_score(getattr(message, "comment", "") or "")
        for signal in message.signals:
            score += _text_score(getattr(signal, "comment", "") or "")
    return score


def _text_score(value: str) -> int:
    replacement_penalty = value.count("\ufffd") * 100
    cjk_bonus = sum(1 for char in value if "\u4e00" <= char <= "\u9fff")
    return cjk_bonus - replacement_penalty


def _signal_key(message: Any, signal: Any) -> str:
    return f"{message.frame_id:X}:{message.name}.{signal.name}"


def _signal_catalog(db: cantools.database.Database) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for message in sorted(db.messages, key=lambda msg: (msg.frame_id, msg.name)):
        for signal in message.signals:
            key = _signal_key(message, signal)
            if key in seen:
                continue
            seen.add(key)
            rows.append(
                {
                    "key": key,
                    "name": signal.name,
                    "message": message.name,
                    "frameId": f"0x{message.frame_id:X}",
                    "start": signal.start,
                    "length": signal.length,
                    "unit": signal.unit or "",
                    "minimum": signal.minimum,
                    "maximum": signal.maximum,
                    "comment": getattr(signal, "comment", "") or "",
                }
            )
    return rows


def _selected_messages_by_frame(
    db: cantools.database.Database,
    selected_keys: list[str],
) -> dict[int, list[tuple[Any, set[str]]]]:
    unassigned = set(selected_keys)
    by_frame: dict[int, list[tuple[Any, set[str]]]] = {}
    for message in db.messages:
        keys = {_signal_key(message, signal) for signal in message.signals}
        selected = keys.intersection(unassigned)
        if selected:
            by_frame.setdefault(message.frame_id, []).append((message, selected))
            # The signal catalog exposes the first occurrence of an identical key.
            # Decode that same definition instead of duplicating samples when two
            # DBC files contain an identical message/signal declaration.
            unassigned.difference_update(selected)
    return by_frame


def _csv_column_name(message: Any, signal: Any) -> str:
    return f"{message.name}::{signal.name}"


def _content_disposition_filename(filename: str) -> str:
    ascii_name = re.sub(r"[^A-Za-z0-9._-]+", "_", filename).strip("._") or "can_export.csv"
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"


def _downsample_points(points: list[tuple[float, float]], limit: int) -> list[tuple[float, float]]:
    if limit <= 0 or len(points) <= limit:
        return points
    step = len(points) / limit
    return [points[min(len(points) - 1, math.floor(i * step))] for i in range(limit)]


def _parse_capture_timezone_offset(value: Any) -> int | None:
    if value in (None, "", "local"):
        return None
    try:
        minutes = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("绝对时区无效。") from exc
    if minutes < -14 * 60 or minutes > 14 * 60:
        raise ValueError("绝对时区超出有效范围。")
    return minutes


def _parse_capture_timezone(value: Any) -> str | None:
    if value in (None, "", "local"):
        return None
    if not isinstance(value, str):
        raise ValueError("绝对时区无效。")
    timezone_name = value.strip()
    if not timezone_name:
        return None
    if timezone_name != "UTC" and not re.fullmatch(r"[A-Za-z0-9_+\-]+(?:/[A-Za-z0-9_+\-]+){1,3}", timezone_name):
        raise ValueError("绝对时区无效。")
    return timezone_name


def _server_timezone_info() -> dict[str, Any]:
    now = datetime.now().astimezone()
    offset = now.utcoffset()
    offset_minutes = int(offset.total_seconds() // 60) if offset is not None else None
    timezone_name = _detect_server_timezone_name(now)
    return {
        "serverTimezone": timezone_name,
        "serverTimezoneOffsetMinutes": offset_minutes,
        "serverTimezoneLabel": str(now.tzinfo or ""),
    }


def _detect_server_timezone_name(now: datetime) -> str:
    candidates = [
        os.environ.get("TZ"),
        getattr(now.tzinfo, "key", None),
        str(now.tzinfo or ""),
        *time.tzname,
        _linux_timezone_file(),
        _linux_localtime_zone(),
    ]
    for candidate in candidates:
        if not candidate:
            continue
        name = WINDOWS_TIMEZONE_TO_IANA.get(candidate, candidate)
        if name == "UTC" or re.fullmatch(r"[A-Za-z0-9_+\-]+(?:/[A-Za-z0-9_+\-]+){1,3}", name):
            return name
    return ""


def _linux_timezone_file() -> str:
    try:
        return Path("/etc/timezone").read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def _linux_localtime_zone() -> str:
    try:
        target = Path("/etc/localtime").resolve()
    except OSError:
        return ""
    marker = "zoneinfo"
    parts = target.parts
    if marker not in parts:
        return ""
    index = parts.index(marker)
    return "/".join(parts[index + 1 :])


def _asc_header_datetime(log_path: Path) -> datetime | None:
    if log_path.suffix.lower() != ".asc":
        return None
    try:
        with log_path.open("r", encoding="utf-8", errors="ignore") as handle:
            first_line = handle.readline().strip()
    except OSError:
        return None
    if not first_line.lower().startswith("date "):
        return None

    date_text = first_line[5:].strip().upper()
    for fmt in ("%a %b %d %I:%M:%S.%f %p %Y", "%a %b %d %H:%M:%S.%f %Y", "%a %b %d %H:%M:%S %Y"):
        try:
            return datetime.strptime(date_text, fmt)
        except ValueError:
            continue
    return None


def _datetime_parts(value: datetime | None) -> list[int] | None:
    if value is None:
        return None
    return [value.year, value.month, value.day, value.hour, value.minute, value.second, value.microsecond // 1000]


def _datetime_to_epoch(
    value: datetime | None,
    capture_timezone: str | None = None,
    capture_timezone_offset_minutes: int | None = None,
) -> float | None:
    if value is None:
        return None
    if capture_timezone:
        if capture_timezone == "UTC":
            return value.replace(tzinfo=timezone.utc).timestamp()
        try:
            return value.replace(tzinfo=ZoneInfo(capture_timezone)).timestamp()
        except ZoneInfoNotFoundError:
            if capture_timezone_offset_minutes is None:
                raise ValueError("当前 Python 环境缺少 IANA 时区数据，请安装 tzdata 或改用服务器本地时区。")
    if capture_timezone_offset_minutes is not None:
        return value.replace(tzinfo=timezone(timedelta(minutes=capture_timezone_offset_minutes))).timestamp()
    return value.timestamp()


def _asc_start_epoch(
    log_path: Path,
    capture_timezone: str | None = None,
    capture_timezone_offset_minutes: int | None = None,
) -> float | None:
    return _datetime_to_epoch(_asc_header_datetime(log_path), capture_timezone, capture_timezone_offset_minutes)


def _output_timezone(
    capture_timezone: str | None = None,
    capture_timezone_offset_minutes: int | None = None,
) -> timezone | ZoneInfo | None:
    if capture_timezone:
        if capture_timezone == "UTC":
            return timezone.utc
        try:
            return ZoneInfo(capture_timezone)
        except ZoneInfoNotFoundError:
            if capture_timezone_offset_minutes is None:
                raise ValueError("当前 Python 环境缺少 IANA 时区数据，请安装 tzdata 或改用默认本地时区。")
    if capture_timezone_offset_minutes is not None:
        return timezone(timedelta(minutes=capture_timezone_offset_minutes))
    return None


def _format_absolute_timestamp(
    timestamp: float,
    capture_timezone: str | None = None,
    capture_timezone_offset_minutes: int | None = None,
) -> str:
    output_tz = _output_timezone(capture_timezone, capture_timezone_offset_minutes)
    if output_tz is None:
        return datetime.fromtimestamp(timestamp).isoformat(timespec="milliseconds")
    return datetime.fromtimestamp(timestamp, tz=output_tz).isoformat(timespec="milliseconds")


def _blf_header_datetime(reader: Any) -> datetime | None:
    """Recover the timezone-free wall-clock time stored in a BLF header.

    python-can exposes the BLF SYSTEMTIME fields as an epoch after assuming UTC.
    Converting that value back through UTC recovers the original calendar fields
    without applying the server's local timezone.
    """
    start_timestamp = getattr(reader, "start_timestamp", None)
    if not isinstance(start_timestamp, (int, float)) or not math.isfinite(start_timestamp) or start_timestamp <= 0:
        return None
    return datetime.fromtimestamp(float(start_timestamp), tz=timezone.utc).replace(tzinfo=None)


def _decode_selected(
    log_path: Path,
    db: cantools.database.Database,
    selected_keys: list[str],
    max_points: int,
    for_csv: bool = False,
    capture_timezone: str | None = None,
    capture_timezone_offset_minutes: int | None = None,
) -> dict[str, Any]:
    by_frame = _selected_messages_by_frame(db, selected_keys)
    if not by_frame:
        return {"series": [], "rows": [], "stats": {"messages": 0, "decodedMessages": 0}}

    csv_columns = {
        _signal_key(message, signal): _csv_column_name(message, signal)
        for message in db.messages
        for signal in message.signals
    }
    values: dict[str, list[tuple[float, float]]] = {key: [] for key in selected_keys}
    rows: list[dict[str, Any]] = []
    first_ts: float | None = None
    last_ts: float | None = None
    total = 0
    decoded_messages = 0
    decode_errors = 0
    asc_header = _asc_header_datetime(log_path)
    asc_start_epoch = _datetime_to_epoch(asc_header, capture_timezone, capture_timezone_offset_minutes)
    blf_header: datetime | None = None
    timestamp_adjustment = 0.0
    first_absolute_ts: float | None = None

    with can.LogReader(str(log_path)) as reader:
        if log_path.suffix.lower() == ".blf":
            blf_header = _blf_header_datetime(reader)
            blf_start_epoch = _datetime_to_epoch(blf_header, capture_timezone, capture_timezone_offset_minutes)
            reader_start_timestamp = getattr(reader, "start_timestamp", None)
            if blf_start_epoch is not None and isinstance(reader_start_timestamp, (int, float)):
                timestamp_adjustment = blf_start_epoch - float(reader_start_timestamp)

        for msg in reader:
            total += 1
            message_ts = float(msg.timestamp)
            if first_ts is None:
                first_ts = message_ts
            last_ts = message_ts
            if asc_start_epoch is not None:
                absolute_ts = asc_start_epoch + message_ts
            elif blf_header is not None:
                absolute_ts = message_ts + timestamp_adjustment
            else:
                absolute_ts = message_ts
            if first_absolute_ts is None:
                first_absolute_ts = absolute_ts

            selected_messages = by_frame.get(msg.arbitration_id)
            if not selected_messages:
                continue

            rel_time = message_ts - first_ts
            csv_row: dict[str, Any] | None = None
            if for_csv:
                csv_row = {
                    "absolute_time": _format_absolute_timestamp(
                        absolute_ts,
                        capture_timezone,
                        capture_timezone_offset_minutes,
                    ),
                    "relative_time_s": f"{rel_time:.6f}",
                }

            decoded_any = False
            for message, selected_for_message in selected_messages:
                try:
                    decoded = message.decode(
                        msg.data,
                        decode_choices=False,
                        scaling=True,
                        allow_truncated=True,
                    )
                except Exception:
                    decode_errors += 1
                    continue

                decoded_any = True
                for signal in message.signals:
                    key = _signal_key(message, signal)
                    if key not in selected_for_message or signal.name not in decoded:
                        continue
                    value = decoded[signal.name]
                    if isinstance(value, bool):
                        numeric = 1.0 if value else 0.0
                    elif isinstance(value, (int, float)) and math.isfinite(float(value)):
                        numeric = float(value)
                    else:
                        continue
                    values.setdefault(key, []).append((rel_time, numeric))
                    if csv_row is not None:
                        csv_row[csv_columns.get(key, key)] = numeric

            if decoded_any:
                decoded_messages += 1

            if csv_row is not None and any(csv_columns.get(key, key) in csv_row for key in selected_keys):
                rows.append(csv_row)

    catalog_by_key = {item["key"]: item for item in _signal_catalog(db)}
    series = []
    for key in selected_keys:
        item = catalog_by_key.get(key, {})
        points = values.get(key, [])
        plot_points = _downsample_points(points, max_points)
        series.append(
            {
                "key": key,
                "label": f"{item.get('message', '')}::{item.get('name', key)}",
                "comment": item.get("comment", ""),
                "message": item.get("message", ""),
                "name": item.get("name", key),
                "frameId": item.get("frameId", ""),
                "count": len(points),
                "x": [round(point[0], 6) for point in plot_points],
                "y": [point[1] for point in plot_points],
            }
        )

    return {
        "series": series,
        "rows": rows,
        "stats": {
            "messages": total,
            "decodedMessages": decoded_messages,
            "decodeErrors": decode_errors,
            "startEpoch": first_absolute_ts,
            "startUtc": (
                datetime.fromtimestamp(first_absolute_ts, tz=timezone.utc).isoformat()
                if first_absolute_ts is not None
                else None
            ),
            "startLocal": (
                _format_absolute_timestamp(
                    first_absolute_ts,
                    capture_timezone,
                    capture_timezone_offset_minutes,
                )
                if first_absolute_ts is not None
                else None
            ),
            "logKind": log_path.suffix.lower().lstrip("."),
            "ascHeaderParts": _datetime_parts(asc_header),
            "blfHeaderParts": _datetime_parts(blf_header),
            "firstMessageTimestamp": first_ts,
            "captureTimezone": capture_timezone,
            "captureTimezoneOffsetMinutes": capture_timezone_offset_minutes,
            "absoluteTimeAvailable": asc_header is not None if log_path.suffix.lower() == ".asc" else blf_header is not None,
            "durationSeconds": round((last_ts - first_ts), 6) if first_ts is not None and last_ts is not None else 0,
        },
    }


def _decode_logs_for_plot(
    log_paths: list[Path],
    db: cantools.database.Database,
    selected_keys: list[str],
    max_points: int,
    capture_timezone: str | None = None,
    capture_timezone_offset_minutes: int | None = None,
) -> dict[str, Any]:
    decoded_logs = [
        _decode_selected(
            log_path,
            db,
            selected_keys,
            0,
            for_csv=False,
            capture_timezone=capture_timezone,
            capture_timezone_offset_minutes=capture_timezone_offset_minutes,
        )
        for log_path in log_paths
    ]
    starts = [result["stats"].get("startEpoch") for result in decoded_logs]
    valid_starts = [float(start) for start in starts if isinstance(start, (int, float)) and math.isfinite(start)]
    global_start = min(valid_starts) if valid_starts else 0.0

    merged_points: dict[str, list[tuple[float, float]]] = {key: [] for key in selected_keys}
    series_info: dict[str, dict[str, Any]] = {}
    latest = global_start
    for result in decoded_logs:
        stats = result["stats"]
        start = stats.get("startEpoch")
        if not isinstance(start, (int, float)) or not math.isfinite(start):
            start = global_start
        offset = float(start) - global_start
        latest = max(latest, offset + global_start + float(stats.get("durationSeconds") or 0))
        for series in result["series"]:
            key = series["key"]
            series_info.setdefault(key, series)
            merged_points.setdefault(key, []).extend((offset + float(x), float(y)) for x, y in zip(series["x"], series["y"]))

    merged_series = []
    for key in selected_keys:
        info = series_info.get(key, {"key": key, "label": key, "comment": "", "message": "", "name": key, "frameId": ""})
        points = sorted(merged_points.get(key, []), key=lambda point: point[0])
        plot_points = _downsample_points(points, max_points)
        merged_series.append(
            {
                **{field: info.get(field, "") for field in ("key", "label", "comment", "message", "name", "frameId")},
                "count": len(points),
                "x": [round(point[0], 6) for point in plot_points],
                "y": [point[1] for point in plot_points],
            }
        )

    first_result = decoded_logs[0]["stats"] if decoded_logs else {}
    has_asc_logs = any(path.suffix.lower() == ".asc" for path in log_paths)
    absolute_time_available = all(result["stats"].get("absoluteTimeAvailable") for result in decoded_logs)
    return {
        "series": merged_series,
        "rows": [],
        "stats": {
            "messages": sum(result["stats"].get("messages", 0) for result in decoded_logs),
            "decodedMessages": sum(result["stats"].get("decodedMessages", 0) for result in decoded_logs),
            "decodeErrors": sum(result["stats"].get("decodeErrors", 0) for result in decoded_logs),
            "startEpoch": global_start if valid_starts else None,
            "startUtc": datetime.fromtimestamp(global_start, tz=timezone.utc).isoformat() if valid_starts else None,
            "startLocal": (
                _format_absolute_timestamp(global_start, capture_timezone, capture_timezone_offset_minutes)
                if valid_starts
                else None
            ),
            "logKind": log_paths[0].suffix.lower().lstrip(".") if len(log_paths) == 1 else "multiple",
            "logCount": len(log_paths),
            "hasAscLogs": has_asc_logs,
            "absoluteTimeAvailable": absolute_time_available,
            "ascHeaderParts": first_result.get("ascHeaderParts") if len(log_paths) == 1 else None,
            "firstMessageTimestamp": first_result.get("firstMessageTimestamp") if len(log_paths) == 1 else 0,
            "captureTimezone": capture_timezone,
            "captureTimezoneOffsetMinutes": capture_timezone_offset_minutes,
            "durationSeconds": round(latest - global_start, 6) if valid_starts else 0,
        },
    }


@app.get("/")
def index() -> Response:
    return send_from_directory(STATIC_DIR, "index.html")


@app.post("/api/session")
def create_session() -> Response:
    data = request.get_json(silent=True) or {}
    previous_session = data.get("previousSession")
    if previous_session:
        try:
            shutil.rmtree(_session_dir(previous_session), ignore_errors=True)
        except ValueError:
            pass
    _cleanup_old_sessions()
    session_id = uuid.uuid4().hex
    _session_dir(session_id).mkdir(parents=True, exist_ok=True)
    return jsonify({"sessionId": session_id, **_server_timezone_info()})


@app.get("/api/files")
def files() -> Response:
    session_id = _request_session_id()
    return jsonify(
        [
            {
                "id": item.id,
                "name": item.name,
                "size": item.size,
                "kind": item.kind,
            }
            for item in _list_can_files(session_id)
        ]
    )


@app.post("/api/upload")
def upload() -> Response:
    session_id = _request_session_id()
    session_dir = _session_dir(session_id)
    session_dir.mkdir(parents=True, exist_ok=True)
    saved = []
    for file in request.files.getlist("files"):
        original_name = _safe_display_name(file.filename or "")
        ext = Path(original_name).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            continue
        target = _unique_upload_path(session_dir, original_name)
        file.save(target)
        saved.append({"id": _file_id(target), "name": target.name, "kind": ext.lstrip("."), "size": target.stat().st_size})
    return jsonify({"files": saved})


@app.delete("/api/files")
def delete_file() -> Response:
    session_id = _request_session_id()
    data = request.get_json(force=True)
    try:
        path = _resolve_file(data.get("fileId", ""), session_id=session_id)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400
    path.unlink(missing_ok=True)
    return jsonify({"ok": True})


@app.post("/api/signals")
def signals() -> Response:
    data = request.get_json(force=True)
    dbc_ids = data.get("dbcFiles") or []
    if not dbc_ids:
        return jsonify({"error": "Choose at least one DBC file."}), 400
    try:
        dbc_paths = [_resolve_file(file_id, ".dbc") for file_id in dict.fromkeys(dbc_ids)]
        db = _load_database(dbc_paths)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400
    catalog = _signal_catalog(db)
    return jsonify({"signals": catalog, "messageCount": len(db.messages), "signalCount": len(catalog)})


@app.post("/api/plot")
def plot() -> Response:
    data = request.get_json(force=True)
    selected = data.get("signals") or []
    if not selected:
        return jsonify({"error": "Choose at least one signal."}), 400
    try:
        log_paths = _resolve_log_files(data)
        dbc_paths = [_resolve_file(file_id, ".dbc") for file_id in dict.fromkeys(data.get("dbcFiles") or [])]
        db = _load_database(dbc_paths)
        capture_timezone = _parse_capture_timezone(data.get("captureTimezone"))
        capture_timezone_offset_minutes = _parse_capture_timezone_offset(data.get("captureTimezoneOffsetMinutes"))
        result = _decode_logs_for_plot(
            log_paths,
            db,
            selected,
            int(data.get("maxPoints") or 5000),
            capture_timezone=capture_timezone,
            capture_timezone_offset_minutes=capture_timezone_offset_minutes,
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result)


@app.post("/api/export")
def export_csv() -> Response:
    data = request.get_json(force=True)
    selected = data.get("signals") or []
    if not selected:
        return jsonify({"error": "Choose at least one signal."}), 400
    try:
        log_path = _resolve_log_file(data.get("blfFile", ""))
        dbc_paths = [_resolve_file(file_id, ".dbc") for file_id in dict.fromkeys(data.get("dbcFiles") or [])]
        db = _load_database(dbc_paths)
        capture_timezone = _parse_capture_timezone(data.get("captureTimezone"))
        capture_timezone_offset_minutes = _parse_capture_timezone_offset(data.get("captureTimezoneOffsetMinutes"))
        result = _decode_selected(
            log_path,
            db,
            selected,
            int(data.get("maxPoints") or 5000),
            for_csv=True,
            capture_timezone=capture_timezone,
            capture_timezone_offset_minutes=capture_timezone_offset_minutes,
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400

    output = io.StringIO(newline="")
    catalog_by_key = {item["key"]: item for item in _signal_catalog(db)}
    selected_catalog = [catalog_by_key[key] for key in selected if key in catalog_by_key]
    signal_columns = [f"{item['message']}::{item['name']}" for item in selected_catalog]
    fieldnames = ["absolute_time", "relative_time_s", *signal_columns]
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    comment_row = {"absolute_time": "comment", "relative_time_s": ""}
    for item, column in zip(selected_catalog, signal_columns):
        comment_row[column] = item.get("comment", "")
    writer.writerow(comment_row)
    for row in result["rows"]:
        writer.writerow(row)

    filename = f"{log_path.stem}.csv"
    return Response(
        output.getvalue().encode("utf-8-sig"),
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": _content_disposition_filename(filename)},
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="CAN BLF/ASC/DBC web viewer")
    parser.add_argument("--host", default=os.environ.get("CAN_VIEWER_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("CAN_VIEWER_PORT", "5050")))
    args = parser.parse_args()
    app.run(host=args.host, port=args.port, debug=False)


if __name__ == "__main__":
    main()
