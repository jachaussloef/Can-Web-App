const CHANNEL_PRESETS_KEY = "canViewerChannelPresetsV1";

const state = {
  sessionId: "",
  files: [],
  signals: [],
  selectedSignals: new Set(),
  channelPresets: loadChannelPresets(),
  lastSeries: [],
  lastStats: null,
  plotState: "idle",
  timeMode: "relative",
  labelMode: "path",
  plotMode: "combined",
  hover: null,
  zoom: null,
  dragStart: null,
  dragCurrent: null,
  dragMode: null,
  panStartRange: null,
  serverTimezone: "",
  serverTimezoneOffsetMinutes: null,
};

const colors = ["#4ea1ff", "#4bd17b", "#ff6b66", "#f5b84b", "#a78bfa", "#22d3ee", "#f472b6", "#c4d64a"];
const chartColors = {
  background: "#0b1118",
  grid: "#253243",
  axis: "#5d6c80",
  text: "#b8c3d4",
  strongText: "#e5edf7",
  crosshair: "#d7e3f4",
  zoomFill: "rgba(34, 211, 238, 0.14)",
  zoomStroke: "#22d3ee",
};

const representativeTimezoneCities = {
  UTC: "UTC, GMT",
  "Africa/Cairo": "Cairo, Khartoum, Tripoli",
  "Africa/Johannesburg": "Johannesburg, Pretoria, Harare",
  "Africa/Lagos": "Lagos, Kinshasa, Luanda",
  "Africa/Nairobi": "Nairobi, Addis Ababa, Dar es Salaam",
  "America/Anchorage": "Anchorage, Juneau, Nome",
  "America/Argentina/Buenos_Aires": "Buenos Aires, Cordoba, Rosario",
  "America/Bogota": "Bogota, Lima, Quito",
  "America/Caracas": "Caracas, La Paz",
  "America/Chicago": "Chicago, Dallas, Houston",
  "America/Denver": "Denver, Phoenix, Salt Lake City",
  "America/Halifax": "Halifax, Moncton, Bermuda",
  "America/Los_Angeles": "Los Angeles, San Francisco, Seattle",
  "America/Mexico_City": "Mexico City, Guadalajara, Monterrey",
  "America/New_York": "New York, Toronto, Miami",
  "America/Puerto_Rico": "San Juan, Santo Domingo, Port of Spain",
  "America/Sao_Paulo": "Sao Paulo, Rio de Janeiro, Brasilia",
  "America/St_Johns": "St. John's",
  "Asia/Bangkok": "Bangkok, Hanoi, Jakarta",
  "Asia/Dhaka": "Dhaka, Thimphu",
  "Asia/Dubai": "Dubai, Abu Dhabi, Muscat",
  "Asia/Hong_Kong": "Hong Kong, Macau",
  "Asia/Jakarta": "Jakarta, Bangkok, Hanoi",
  "Asia/Jerusalem": "Jerusalem, Tel Aviv",
  "Asia/Karachi": "Karachi, Islamabad, Tashkent",
  "Asia/Kathmandu": "Kathmandu",
  "Asia/Kolkata": "New Delhi, Mumbai, Kolkata",
  "Asia/Seoul": "Seoul, Pyongyang",
  "Asia/Shanghai": "Beijing, Shanghai, Chongqing, Urumqi",
  "Asia/Singapore": "Singapore, Kuala Lumpur, Manila",
  "Asia/Taipei": "Taipei, Kaohsiung",
  "Asia/Tehran": "Tehran",
  "Asia/Tokyo": "Tokyo, Osaka, Sapporo",
  "Asia/Yangon": "Yangon, Cocos",
  "Australia/Adelaide": "Adelaide, Darwin",
  "Australia/Brisbane": "Brisbane, Port Moresby",
  "Australia/Perth": "Perth, Singapore",
  "Australia/Sydney": "Sydney, Melbourne, Canberra",
  "Europe/Athens": "Athens, Helsinki, Bucharest",
  "Europe/Berlin": "Berlin, Rome, Madrid, Paris",
  "Europe/Istanbul": "Istanbul",
  "Europe/London": "London, Dublin, Lisbon",
  "Europe/Moscow": "Moscow, St. Petersburg, Minsk",
  "Pacific/Auckland": "Auckland, Wellington",
  "Pacific/Chatham": "Chatham Islands",
  "Pacific/Honolulu": "Honolulu, Tahiti",
  "Pacific/Midway": "Midway, Samoa",
  "Pacific/Noumea": "Noumea, Solomon Islands",
};

const fallbackTimezones = [
  "UTC",
  "Pacific/Midway",
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Halifax",
  "America/St_Johns",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const els = {
  upload: document.querySelector(".upload"),
  blfSelect: document.querySelector("#blfSelect"),
  captureTimezone: document.querySelector("#captureTimezone"),
  dbcSelect: document.querySelector("#dbcSelect"),
  removeBlf: document.querySelector("#removeBlf"),
  removeDbc: document.querySelector("#removeDbc"),
  refreshFiles: document.querySelector("#refreshFiles"),
  fileUpload: document.querySelector("#fileUpload"),
  selectVisible: document.querySelector("#selectVisible"),
  clearSignals: document.querySelector("#clearSignals"),
  channelPresetSelect: document.querySelector("#channelPresetSelect"),
  saveChannelPreset: document.querySelector("#saveChannelPreset"),
  applyChannelPreset: document.querySelector("#applyChannelPreset"),
  deleteChannelPreset: document.querySelector("#deleteChannelPreset"),
  searchSignals: document.querySelector("#searchSignals"),
  signals: document.querySelector("#signals"),
  signalCount: document.querySelector("#signalCount"),
  plotButton: document.querySelector("#plotButton"),
  exportButton: document.querySelector("#exportButton"),
  relativeTime: document.querySelector("#relativeTime"),
  absoluteTime: document.querySelector("#absoluteTime"),
  pathLabel: document.querySelector("#pathLabel"),
  commentLabel: document.querySelector("#commentLabel"),
  combinedPlot: document.querySelector("#combinedPlot"),
  splitPlot: document.querySelector("#splitPlot"),
  resetZoom: document.querySelector("#resetZoom"),
  maxPoints: document.querySelector("#maxPoints"),
  status: document.querySelector("#status"),
  stats: document.querySelector("#stats"),
  plotWrap: document.querySelector(".plot-wrap"),
  plot: document.querySelector("#plot"),
  crosshair: document.querySelector("#crosshair"),
  legend: document.querySelector("#legend"),
};

function setStatus(text, busy = false) {
  els.status.textContent = text;
  for (const button of document.querySelectorAll("button")) {
    button.disabled = busy;
  }
  if (!busy) updateControls();
}

function updateControls() {
  updateFileControls();
  updateZoomControls();
  updateChannelPresetControls();
}

function updateFileControls() {
  const logFileCount = selectedLogFiles().length;
  els.removeBlf.disabled = !logFileCount;
  els.exportButton.textContent = logFileCount > 1 ? "批量导出CSV" : "导出CSV";
  els.removeDbc.disabled = !currentDbcFiles().length;
}

function updateZoomControls() {
  const hasZoom = Boolean(state.zoom);
  els.resetZoom.hidden = !hasZoom;
  els.resetZoom.disabled = !hasZoom;
}

function currentDbcFiles() {
  return state.files.filter((file) => file.kind === "dbc");
}

function selectedDbcFiles() {
  return currentDbcFiles().map((file) => file.id);
}

function highlightedDbcFiles() {
  return Array.from(els.dbcSelect.selectedOptions).map((option) => option.value);
}

function dbcSignature(files = currentDbcFiles()) {
  return files
    .map((file) => `${file.name}\u0000${file.size}`)
    .sort((a, b) => a.localeCompare(b))
    .join("\u0001");
}

function dbcLabel(files = currentDbcFiles()) {
  return files.map((file) => file.name).sort((a, b) => a.localeCompare(b)).join(" + ");
}

function currentSignalKeys() {
  return new Set(state.signals.map((item) => item.key));
}

function retainAvailableSignalSelection(previousSelection) {
  const available = currentSignalKeys();
  state.selectedSignals = new Set(Array.from(previousSelection).filter((key) => available.has(key)));
}

function loadChannelPresets() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHANNEL_PRESETS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((preset) => preset && typeof preset.name === "string" && typeof preset.dbcSignature === "string" && Array.isArray(preset.signals))
      .map((preset) => ({
        id: String(preset.id || crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
        name: preset.name,
        dbcSignature: preset.dbcSignature,
        dbcLabel: preset.dbcLabel || "",
        signals: preset.signals.filter((key) => typeof key === "string"),
        createdAt: preset.createdAt || new Date().toISOString(),
        updatedAt: preset.updatedAt || preset.createdAt || new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

function saveChannelPresets() {
  try {
    localStorage.setItem(CHANNEL_PRESETS_KEY, JSON.stringify(state.channelPresets));
    return true;
  } catch {
    setStatus("浏览器无法保存通道组合，可能是本地存储已满或被禁用。");
    return false;
  }
}

function presetsForCurrentDbc() {
  const signature = dbcSignature();
  if (!signature) return [];
  return state.channelPresets.filter((preset) => preset.dbcSignature === signature);
}

function renderChannelPresets(selectedId = els.channelPresetSelect.value) {
  const presets = presetsForCurrentDbc();
  if (!dbcSignature()) {
    els.channelPresetSelect.innerHTML = `<option value="">请先加载 DBC</option>`;
  } else if (!presets.length) {
    els.channelPresetSelect.innerHTML = `<option value="">无已保存组合</option>`;
  } else {
    els.channelPresetSelect.innerHTML = presets
      .map((preset) => `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.name)} (${preset.signals.length})</option>`)
      .join("");
    if (presets.some((preset) => preset.id === selectedId)) els.channelPresetSelect.value = selectedId;
  }
  updateChannelPresetControls();
}

function updateChannelPresetControls() {
  const hasDbc = Boolean(dbcSignature());
  const hasPreset = Boolean(els.channelPresetSelect.value);
  els.channelPresetSelect.disabled = !hasDbc || !presetsForCurrentDbc().length;
  els.saveChannelPreset.disabled = !hasDbc || !state.selectedSignals.size;
  els.applyChannelPreset.disabled = !hasPreset;
  els.deleteChannelPreset.disabled = !hasPreset;
}

function defaultChannelPresetName() {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join("");
  return `组合 ${state.selectedSignals.size} 通道 ${timestamp}`;
}

function saveCurrentChannelPreset() {
  const signature = dbcSignature();
  const available = currentSignalKeys();
  const signals = Array.from(state.selectedSignals).filter((key) => available.has(key));
  if (!signature || !state.signals.length) {
    setStatus("请先加载 DBC 通道后再保存组合。");
    return;
  }
  if (!signals.length) {
    setStatus("请先选择至少一个通道。");
    return;
  }
  const rawName = window.prompt("保存当前通道组合名称", defaultChannelPresetName());
  const name = rawName?.trim();
  if (!name) return;
  const existing = state.channelPresets.find((preset) => preset.dbcSignature === signature && preset.name === name);
  const now = new Date().toISOString();
  const preset = {
    id: existing?.id || crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    dbcSignature: signature,
    dbcLabel: dbcLabel(),
    signals,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  if (existing) Object.assign(existing, preset);
  else state.channelPresets.push(preset);
  if (!saveChannelPresets()) return;
  renderChannelPresets(preset.id);
  setStatus(`已保存通道组合“${name}”，共 ${signals.length} 个通道。`);
}

function applySelectedChannelPreset() {
  const preset = state.channelPresets.find((item) => item.id === els.channelPresetSelect.value);
  if (!preset) return;
  const available = currentSignalKeys();
  const signals = preset.signals.filter((key) => available.has(key));
  state.selectedSignals = new Set(signals);
  renderSignals();
  setStatus(`已套用通道组合“${preset.name}”，匹配到 ${signals.length} / ${preset.signals.length} 个通道。`);
}

function deleteSelectedChannelPreset() {
  const preset = state.channelPresets.find((item) => item.id === els.channelPresetSelect.value);
  if (!preset) return;
  state.channelPresets = state.channelPresets.filter((item) => item.id !== preset.id);
  if (!saveChannelPresets()) return;
  renderChannelPresets();
  setStatus(`已删除通道组合“${preset.name}”。`);
}

function selectedLogFiles() {
  const selectedIds = new Set(Array.from(els.blfSelect.selectedOptions, (option) => option.value));
  return state.files.filter((file) => selectedIds.has(file.id));
}

function selectedLogFile() {
  return selectedLogFiles()[0] || null;
}

function selectedLogKind() {
  const selected = selectedLogFiles();
  if (selected.length > 1) return "multiple";
  if (selected[0]?.kind) return selected[0].kind;
  const name = selected[0]?.name || els.blfSelect.value || "";
  const match = /\.([^.\\/]+)$/.exec(name);
  return match ? match[1].toLowerCase() : "";
}

function selectedCaptureTimezone() {
  return els.captureTimezone.value;
}

function selectedCaptureTimezoneOffsetMinutes() {
  const timeZone = selectedCaptureTimezone();
  if (!timeZone) return Number.isFinite(state.serverTimezoneOffsetMinutes) ? state.serverTimezoneOffsetMinutes : null;
  if (state.lastStats?.ascHeaderParts) {
    const epoch = epochFromCaptureTimezone(state.lastStats.ascHeaderParts, "UTC");
    if (Number.isFinite(epoch)) return timeZoneOffsetMinutes(timeZone, new Date(epoch * 1000));
  }
  const fallbackEpoch = state.lastStats?.fallbackStartEpoch ?? state.lastStats?.startEpoch;
  return timeZoneOffsetMinutes(timeZone, Number.isFinite(fallbackEpoch) ? new Date(fallbackEpoch * 1000) : new Date());
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function setupCaptureTimezones() {
  const zones =
    typeof Intl.supportedValuesOf === "function"
      ? ["UTC", ...Intl.supportedValuesOf("timeZone").filter((zone) => zone !== "UTC")]
      : fallbackTimezones;
  const uniqueZones = Array.from(new Set(zones));
  const now = new Date();
  const options = uniqueZones
    .map((zone) => ({
      zone,
      offset: timeZoneOffsetMinutes(zone, now),
      label: timeZoneOptionText(zone, now),
    }))
    .sort((a, b) => a.offset - b.offset || a.label.localeCompare(b.label));

  els.captureTimezone.innerHTML = "";
  els.captureTimezone.append(new Option("默认本地时区", ""));

  let group = null;
  let groupLabel = "";
  for (const option of options) {
    const nextGroupLabel = formatOffset(option.offset);
    if (nextGroupLabel !== groupLabel) {
      groupLabel = nextGroupLabel;
      group = document.createElement("optgroup");
      group.label = groupLabel;
      els.captureTimezone.append(group);
    }
    group.append(new Option(option.label, option.zone));
  }
  applyDefaultCaptureTimezone(options);
}

function applyDefaultCaptureTimezone(options = null) {
  const optionRows =
    options ||
    Array.from(els.captureTimezone.options)
      .filter((option) => option.value)
      .map((option) => ({
        zone: option.value,
        offset: timeZoneOffsetMinutes(option.value, new Date()),
      }));
  const optionZones = new Set(optionRows.map((option) => option.zone));
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const defaultZone =
    (state.serverTimezone && optionZones.has(state.serverTimezone) && state.serverTimezone) ||
    (browserTimezone && optionZones.has(browserTimezone) && browserTimezone) ||
    timezoneForOffset(state.serverTimezoneOffsetMinutes, optionRows);
  if (defaultZone) {
    els.captureTimezone.value = defaultZone;
  }
}

function timezoneForOffset(offsetMinutes, options) {
  if (!Number.isFinite(offsetMinutes)) return "";
  const candidates = options.filter((option) => option.offset === offsetMinutes);
  if (!candidates.length) return "";
  const preferred = ["Asia/Shanghai", "UTC", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles"];
  for (const zone of preferred) {
    if (candidates.some((option) => option.zone === zone)) return zone;
  }
  return candidates[0].zone;
}

function timeZoneOptionText(zone, date) {
  const cities = representativeTimezoneCities[zone] || cityNameFromZone(zone);
  return `${formatOffset(timeZoneOffsetMinutes(zone, date))} ${cities} (${zone})`;
}

function cityNameFromZone(zone) {
  const name = zone.split("/").pop() || zone;
  return name.replace(/_/g, " ");
}

function formatOffset(minutes) {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, "0");
  const mins = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${hours}:${mins}`;
}

function timeZoneOffsetMinutes(timeZone, date) {
  if (!timeZone) return -date.getTimezoneOffset();
  if (timeZone === "UTC") return 0;
  const parts = timeZoneDateParts(timeZone, date);
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((localAsUtc - date.getTime()) / 60000);
}

function timeZoneDateParts(timeZone, date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const values = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function epochFromCaptureTimezone(parts, timeZone) {
  if (!Array.isArray(parts) || parts.length < 6) return null;
  const [year, month, day, hour, minute, second, millisecond = 0] = parts;
  if (!timeZone) {
    return new Date(year, month - 1, day, hour, minute, second, millisecond).getTime() / 1000;
  }
  let epochMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  for (let attempt = 0; attempt < 4; attempt++) {
    const offset = timeZoneOffsetMinutes(timeZone, new Date(epochMs));
    const nextEpochMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - offset * 60000;
    if (Math.abs(nextEpochMs - epochMs) < 1) break;
    epochMs = nextEpochMs;
  }
  return epochMs / 1000;
}

function absoluteDisplayTimeZone(captureTimezone = selectedCaptureTimezone()) {
  return captureTimezone || null;
}

function updateStatsForSelectedTimezone(stats) {
  if (!stats || !Number.isFinite(stats.startEpoch)) return stats;
  const captureTimezone = selectedCaptureTimezone();
  const startDate = new Date(stats.startEpoch * 1000);
  return {
    ...stats,
    startLocal: formatDateTime(startDate, true, absoluteDisplayTimeZone(captureTimezone)),
    captureTimezone,
    captureTimezoneOffsetMinutes: selectedCaptureTimezoneOffsetMinutes(),
  };
}

async function api(path, options = {}) {
  const headers = options.body instanceof FormData ? {} : { "Content-Type": "application/json" };
  if (state.sessionId) headers["X-CAN-Session"] = state.sessionId;
  const response = await fetch(path, {
    headers,
    ...options,
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {
      // Keep the HTTP fallback.
    }
    throw new Error(message);
  }
  return response;
}

async function startFreshSession() {
  const previousSession = sessionStorage.getItem("canViewerSession");
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ previousSession }),
  });
  if (!response.ok) throw new Error("无法创建新的文件会话。");
  const body = await response.json();
  state.sessionId = body.sessionId;
  state.serverTimezone = body.serverTimezone || "";
  state.serverTimezoneOffsetMinutes = Number.isFinite(body.serverTimezoneOffsetMinutes) ? body.serverTimezoneOffsetMinutes : null;
  sessionStorage.setItem("canViewerSession", state.sessionId);
  applyDefaultCaptureTimezone();
}

async function loadFiles({ forceSignalReload = false } = {}) {
  setStatus("正在检查已上传文件...", true);
  try {
    const previousDbcSignature = dbcSignature();
    const previousSelection = new Set(state.selectedSignals);
    const response = await api("/api/files");
    state.files = await response.json();
    renderFileOptions();
    state.lastSeries = [];
    state.lastStats = null;
    state.plotState = "idle";
    state.hover = null;
    state.zoom = null;
    state.dragStart = null;
    state.dragCurrent = null;
    state.dragMode = null;
    state.panStartRange = null;
    els.stats.textContent = "";
    els.legend.innerHTML = "";
    drawPlot();
    if (selectedDbcFiles().length) {
      if (!forceSignalReload && dbcSignature() === previousDbcSignature && state.signals.length) {
        retainAvailableSignalSelection(previousSelection);
        renderSignals();
        setStatus("文件列表已刷新，DBC 未变化，已保留通道选择。");
      } else {
        await loadSignals({ auto: true, previousSelection });
      }
    } else {
      state.signals = [];
      state.selectedSignals.clear();
      renderSignals();
      setStatus(state.files.length ? "请选择 CAN 日志和一个或多个 DBC 文件。" : "请先上传一个 BLF/ASC 日志和一个或多个 DBC 文件。");
    }
  } catch (error) {
    setStatus(error.message);
  }
}

function renderFileOptions() {
  const previousLogs = new Set(Array.from(els.blfSelect.selectedOptions, (option) => option.value));
  const previousHighlightedDbcs = new Set(highlightedDbcFiles());
  const blfs = state.files.filter((file) => file.kind === "blf" || file.kind === "asc");
  const dbcs = currentDbcFiles();
  els.blfSelect.innerHTML = blfs.length
    ? blfs.map((file) => `<option value="${escapeHtml(file.id)}">${escapeHtml(file.name)} (${formatBytes(file.size)})</option>`).join("")
    : `<option value="">请上传 .blf 或 .asc 文件</option>`;
  for (const option of els.blfSelect.options) {
    option.selected = previousLogs.size ? previousLogs.has(option.value) : true;
  }
  els.dbcSelect.innerHTML = dbcs.map((file) => `<option value="${escapeHtml(file.id)}">${escapeHtml(file.name)}</option>`).join("");
  for (const option of els.dbcSelect.options) {
    option.selected = previousHighlightedDbcs.size ? previousHighlightedDbcs.has(option.value) : true;
  }
  updateFileControls();
  renderChannelPresets();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

async function uploadFileList(files) {
  if (!files.length) return;
  const data = new FormData();
  for (const file of files) data.append("files", file);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const hasDbcUpload = files.some((file) => /\.dbc$/i.test(file.name));
  const bigUpload = totalBytes >= 1024 * 1024 * 1024 || files.some((file) => /\.asc$/i.test(file.name));
  setStatus(`正在上传 ${files.length} 个文件，共 ${formatBytes(totalBytes)}${bigUpload ? "，ASC/大文件可能需要一点时间..." : "..."}`, true);
  try {
    await api("/api/upload", { method: "POST", body: data });
    els.fileUpload.value = "";
    await loadFiles({ forceSignalReload: hasDbcUpload });
  } catch (error) {
    setStatus(friendlyUploadError(error));
  }
}

function friendlyUploadError(error) {
  const message = error?.message || "上传失败。";
  if (/413|request entity too large|payload too large|too large|超过服务端上限/i.test(message)) {
    return "上传文件超过服务端上限。请确认服务使用 python -m waitress --max-request-body-size=4294967296，反向代理 client_max_body_size 也足够大。";
  }
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "上传连接被中断。大 ASC 文件通常是 Waitress/Nginx 上传上限或服务被提前断开导致；请确认服务使用 python -m waitress --max-request-body-size=4294967296，反向代理 client_max_body_size 也足够大。";
  }
  return message;
}

async function uploadFiles() {
  await uploadFileList(Array.from(els.fileUpload.files));
}

async function handleUploadDrop(event) {
  event.preventDefault();
  els.upload.classList.remove("drag-over");
  const files = Array.from(event.dataTransfer?.files || []).filter((file) => /\.(blf|asc|dbc)$/i.test(file.name));
  if (!files.length) {
    setStatus("请拖放 .blf、.asc 或 .dbc 文件。");
    return;
  }
  await uploadFileList(files);
}

async function removeFiles(fileIds) {
  const ids = fileIds.filter(Boolean);
  if (!ids.length) return;
  setStatus("正在移除所选文件...", true);
  try {
    const previousSelection = new Set(state.selectedSignals);
    const removesDbc = ids.some((id) => state.files.some((file) => file.id === id && file.kind === "dbc"));
    for (const fileId of ids) {
      await api("/api/files", { method: "DELETE", body: JSON.stringify({ fileId }) });
    }
    state.lastSeries = [];
    state.lastStats = null;
    state.plotState = "idle";
    state.zoom = null;
    state.dragStart = null;
    state.dragCurrent = null;
    state.dragMode = null;
    state.panStartRange = null;
    els.stats.textContent = "";
    els.legend.innerHTML = "";
    drawPlot([]);
    await loadFiles({ forceSignalReload: removesDbc });
  } catch (error) {
    setStatus(error.message);
  }
}

async function loadSignals({ auto = false, previousSelection = new Set(state.selectedSignals) } = {}) {
  const dbcFiles = selectedDbcFiles();
  if (!dbcFiles.length) {
    state.signals = [];
    state.selectedSignals.clear();
    state.lastSeries = [];
    state.lastStats = null;
    state.plotState = "idle";
    els.stats.textContent = "";
    els.legend.innerHTML = "";
    renderSignals();
    drawPlot();
    if (!auto) setStatus("请至少选择一个 DBC 文件。");
    return false;
  }
  setStatus(auto ? "DBC 文件已变化，正在自动刷新通道..." : "正在读取 DBC 通道...", true);
  try {
    const response = await api("/api/signals", { method: "POST", body: JSON.stringify({ dbcFiles }) });
    const body = await response.json();
    state.signals = body.signals;
    retainAvailableSignalSelection(previousSelection);
    state.lastSeries = [];
    state.lastStats = null;
    state.plotState = "idle";
    els.stats.textContent = "";
    els.legend.innerHTML = "";
    drawPlot();
    renderSignals();
    const preservedText = state.selectedSignals.size ? `，已保留 ${state.selectedSignals.size} 个已选通道` : "";
    setStatus(`${auto ? "已自动刷新" : "已加载"} ${body.signalCount} 个通道，来自 ${body.messageCount} 个报文${preservedText}。`);
    return true;
  } catch (error) {
    setStatus(error.message);
    return false;
  }
}

function renderSignals() {
  const visible = visibleSignals();
  const hasSearch = els.searchSignals.value.trim().length > 0;
  els.signalCount.textContent = `${state.selectedSignals.size} / ${state.signals.length}`;
  renderChannelPresets();
  const groups = groupSignals(visible);
  els.signals.innerHTML = groups
    .map(
      (group) => `
        <details class="signal-group" ${hasSearch ? "open" : ""}>
          <summary>
            <input class="group-check" type="checkbox" data-group="${escapeHtml(group.id)}" ${group.keys.every((key) => state.selectedSignals.has(key)) ? "checked" : ""} />
            <span>
              <strong>${escapeHtml(group.message)}</strong>
              <small>${escapeHtml(group.frameId)} · ${group.items.length} 个通道</small>
            </span>
          </summary>
          <div class="signal-children">
            ${group.items
              .map(
                (item) => `
                  <label class="signal" title="${escapeHtml([item.message, item.name, item.comment].filter(Boolean).join(" · "))}">
                    <input type="checkbox" value="${escapeHtml(item.key)}" ${state.selectedSignals.has(item.key) ? "checked" : ""} />
                    <span>
                      <strong>${escapeHtml(item.name)}</strong>
                      <small class="signal-comment">${escapeHtml(item.comment || "无注释")}</small>
                    </span>
                  </label>
                `,
              )
              .join("")}
          </div>
        </details>
      `,
    )
    .join("");
}

function visibleSignals() {
  const query = els.searchSignals.value.trim().toLowerCase();
  return state.signals.filter((item) => {
    const haystack = `${item.name} ${item.comment || ""} ${item.message} ${item.frameId}`.toLowerCase();
    return haystack.includes(query);
  });
}

function selectVisibleSignals() {
  for (const item of visibleSignals()) {
    state.selectedSignals.add(item.key);
  }
  renderSignals();
}

function clearSignalSelection() {
  state.selectedSignals.clear();
  renderSignals();
}

function groupSignals(items) {
  const grouped = new Map();
  for (const item of items) {
    const id = `${item.frameId}:${item.message}`;
    if (!grouped.has(id)) grouped.set(id, { id, frameId: item.frameId, message: item.message, items: [], keys: [] });
    grouped.get(id).items.push(item);
    grouped.get(id).keys.push(item.key);
  }
  return Array.from(grouped.values());
}

function onSignalChange(event) {
  if (event.target.classList.contains("group-check")) {
    const details = event.target.closest(".signal-group");
    for (const checkbox of details.querySelectorAll(".signal:not(.group-check) input[type='checkbox']")) {
      checkbox.checked = event.target.checked;
      if (event.target.checked) state.selectedSignals.add(checkbox.value);
      else state.selectedSignals.delete(checkbox.value);
    }
    els.signalCount.textContent = `${state.selectedSignals.size} / ${state.signals.length}`;
    updateChannelPresetControls();
    return;
  }
  if (event.target.type !== "checkbox") return;
  if (event.target.checked) state.selectedSignals.add(event.target.value);
  else state.selectedSignals.delete(event.target.value);
  els.signalCount.textContent = `${state.selectedSignals.size} / ${state.signals.length}`;
  updateChannelPresetControls();
}

async function plotSelected() {
  const signals = Array.from(state.selectedSignals);
  const logFiles = selectedLogFiles();
  if (!logFiles.length || !selectedDbcFiles().length || !signals.length) {
    setStatus("请选择至少一个 CAN 日志、DBC，并至少选择一个通道。");
    return;
  }
  setStatus(`正在解析 ${logFiles.length} 个 CAN 日志并按绝对时间合并绘图...`, true);
  state.lastSeries = [];
  state.lastStats = null;
  state.plotState = "loading";
  state.hover = null;
  state.zoom = null;
  state.dragStart = null;
  state.dragCurrent = null;
  state.dragMode = null;
  state.panStartRange = null;
  els.stats.textContent = "";
  els.legend.innerHTML = "";
  drawPlot();
  try {
    const response = await api("/api/plot", {
      method: "POST",
      body: JSON.stringify({
        logFiles: logFiles.map((file) => file.id),
        dbcFiles: selectedDbcFiles(),
        signals,
        maxPoints: Number(els.maxPoints.value) || 5000,
        captureTimezone: selectedCaptureTimezone(),
        captureTimezoneOffsetMinutes: selectedCaptureTimezoneOffsetMinutes(),
      }),
    });
    const body = await response.json();
    state.lastSeries = enrichSeriesLabels(body.series);
    state.lastStats = updateStatsForSelectedTimezone(body.stats);
    state.plotState = seriesHasPoints(state.lastSeries) ? "ready" : "empty";
    state.hover = null;
    state.zoom = null;
    state.dragStart = null;
    state.dragCurrent = null;
    state.dragMode = null;
    state.panStartRange = null;
    drawPlot();
    renderLegend(state.lastSeries);
    renderStats(state.lastStats);
    if (state.plotState === "empty") {
      setStatus("解析完成，但所选通道没有可绘制的数值数据。");
    } else {
      const timeWarning = body.stats.absoluteTimeAvailable === false ? " 部分日志缺少可用的开始时间，无法保证跨文件的绝对时间顺序。" : "";
      setStatus(`已按绝对时间合并 ${logFiles.length} 个日志并绘制 ${state.lastSeries.length} 个通道。CSV 将按日志分别导出。${timeWarning}`);
    }
  } catch (error) {
    state.plotState = "idle";
    drawPlot();
    setStatus(error.message);
  }
}

async function exportSelected() {
  const signals = Array.from(state.selectedSignals);
  const logFiles = selectedLogFiles();
  if (!logFiles.length || !selectedDbcFiles().length || !signals.length) {
    setStatus("请选择至少一个 CAN 日志、DBC，并至少选择一个通道。");
    return;
  }
  let directoryHandle = null;
  try {
    if (window.showDirectoryPicker) directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  } catch (error) {
    setStatus(error.name === "AbortError" ? "已取消 CSV 导出。" : error.message);
    return;
  }
  const filenames = uniqueCsvFilenames(logFiles);
  setStatus(`正在分别导出 ${logFiles.length} 个日志的 CSV...`, true);
  try {
    for (const [index, logFile] of logFiles.entries()) {
      setStatus(`正在导出 ${index + 1}/${logFiles.length}：${logFile.name}...`, true);
      const response = await api("/api/export", {
        method: "POST",
        body: JSON.stringify({
          blfFile: logFile.id,
          dbcFiles: selectedDbcFiles(),
          signals,
          captureTimezone: selectedCaptureTimezone(),
          captureTimezoneOffsetMinutes: selectedCaptureTimezoneOffsetMinutes(),
        }),
      });
      const blob = await response.blob();
      if (directoryHandle) {
        const fileHandle = await directoryHandle.getFileHandle(filenames[index], { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        downloadBlob(blob, filenames[index]);
      }
    }
    const target = directoryHandle ? "所选文件夹" : "浏览器默认下载目录";
    setStatus(`${logFiles.length} 个 CSV 已分别导出到${target}，均包含所选通道的全部解码点。`);
  } catch (error) {
    setStatus(error.name === "AbortError" ? "已取消 CSV 保存。" : error.message);
  }
}

function uniqueCsvFilenames(logFiles) {
  const used = new Map();
  return logFiles.map((file) => {
    const baseName = (file.name || "can_export").replace(/\.[^.]+$/, "") || "can_export";
    const key = baseName.toLocaleLowerCase();
    const count = (used.get(key) || 0) + 1;
    used.set(key, count);
    return `${baseName}${count > 1 ? ` (${count})` : ""}.csv`;
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function renderStats(stats) {
  if (!stats) {
    els.stats.textContent = "";
    return;
  }
  const logText = stats.logCount > 1 ? `${stats.logCount} 个日志 · ` : "";
  const timezoneText = ` · 采集时区 ${captureTimezoneDisplay(stats.captureTimezone)}`;
  els.stats.textContent = `${logText}${stats.messages.toLocaleString()} 帧 · ${stats.decodedMessages.toLocaleString()} 已解码 · ${stats.durationSeconds}s · 开始 ${stats.startLocal || stats.startUtc || ""}${timezoneText}`;
}

function captureTimezoneDisplay(value) {
  if (!value) return "默认本地";
  if (value === "UTC") return "UTC";
  return representativeTimezoneCities[value] || cityNameFromZone(value);
}

function renderLegend(series) {
  els.legend.innerHTML = series
    .map((item, index) => `<span class="legend-item"><span class="swatch" style="background:${colors[index % colors.length]}"></span>${escapeHtml(seriesLabel(item))} (${item.count.toLocaleString()})</span>`)
    .join("");
}

function enrichSeriesLabels(series) {
  const catalog = new Map(state.signals.map((item) => [item.key, item]));
  return series.map((item) => {
    const signal = catalog.get(item.key);
    if (!signal) return { ...item, label: normalizePathLabel(item.label || item.key) };
    return {
      ...item,
      label: `${signal.message}::${signal.name}`,
      comment: item.comment || signal.comment || "",
      message: item.message || signal.message,
      name: item.name || signal.name,
    };
  });
}

function seriesLabel(item) {
  if (state.labelMode === "comment" && item.comment) return item.comment;
  return normalizePathLabel(item.label || [item.message, item.name].filter(Boolean).join("::") || item.key);
}

function normalizePathLabel(label) {
  return String(label).replace(/^([^.]+)\.([^.]+)$/, "$1::$2");
}

function setTimeMode(mode) {
  state.timeMode = mode;
  els.relativeTime.classList.toggle("active", mode === "relative");
  els.absoluteTime.classList.toggle("active", mode === "absolute");
  drawPlot();
}

function setLabelMode(mode) {
  state.labelMode = mode;
  els.pathLabel.classList.toggle("active", mode === "path");
  els.commentLabel.classList.toggle("active", mode === "comment");
  renderLegend(state.lastSeries);
  drawPlot();
}

function setPlotMode(mode) {
  state.plotMode = mode;
  state.hover = null;
  state.dragStart = null;
  state.dragCurrent = null;
  state.dragMode = null;
  state.panStartRange = null;
  hideCrosshair();
  els.combinedPlot.classList.toggle("active", mode === "combined");
  els.splitPlot.classList.toggle("active", mode === "split");
  drawPlot();
}

function resetZoom() {
  state.zoom = null;
  state.dragStart = null;
  state.dragCurrent = null;
  state.dragMode = null;
  state.panStartRange = null;
  state.hover = null;
  hideCrosshair();
  drawPlot();
  updateZoomControls();
}

function handleCaptureTimezoneChange() {
  if (!state.lastSeries.length && !state.lastStats) return;
  state.lastStats = updateStatsForSelectedTimezone(state.lastStats);
  state.hover = null;
  hideCrosshair();
  renderStats(state.lastStats);
  drawPlot();
  setStatus("采集时区已切换；绝对时间轴已直接偏移，CSV 导出也会使用当前时区。");
}

function displayXValue(relativeSeconds) {
  if (state.timeMode === "absolute" && state.lastStats?.startEpoch) {
    return state.lastStats.startEpoch + relativeSeconds;
  }
  return relativeSeconds;
}

function formatTimeValue(relativeSeconds) {
  if (state.timeMode === "absolute" && state.lastStats?.startEpoch) {
    const date = new Date((state.lastStats.startEpoch + relativeSeconds) * 1000);
    return formatDateTime(date, true, absoluteDisplayTimeZone());
  }
  return `${relativeSeconds.toFixed(3)} s`;
}

function formatAxisTime(relativeSeconds) {
  if (state.timeMode === "absolute" && state.lastStats?.startEpoch) {
    const date = new Date((state.lastStats.startEpoch + relativeSeconds) * 1000);
    return formatDateTime(date, false, absoluteDisplayTimeZone());
  }
  return relativeSeconds.toFixed(1);
}

function formatDateTime(date, includeDate, timeZone = null) {
  if (timeZone) {
    const parts = timeZoneDateParts(timeZone, date);
    const millisecond = String(date.getMilliseconds()).padStart(3, "0");
    const time = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}:${String(parts.second).padStart(2, "0")}`;
    if (!includeDate) return time;
    return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")} ${time}.${millisecond}`;
  }
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  if (!includeDate) return time;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}.${pad(date.getMilliseconds(), 3)}`;
}

function drawPlot() {
  updateZoomControls();
  const series = state.lastSeries;
  const canvas = els.plot;
  const ratio = window.devicePixelRatio || 1;
  const splitMode = state.plotMode === "split" && seriesHasPoints(series);
  els.plotWrap.classList.toggle("split-mode", splitMode);
  const viewportHeight = Math.max(1, els.plotWrap.clientHeight || els.plotWrap.getBoundingClientRect().height);
  const cssHeight = splitMode ? splitPlotHeight(series.length, viewportHeight) : Math.max(360, viewportHeight);
  canvas.style.height = `${cssHeight}px`;
  const viewportWidth = Math.max(1, els.plotWrap.clientWidth || els.plotWrap.getBoundingClientRect().width);
  const cssWidth = Math.max(600, viewportWidth);
  canvas.style.width = `${cssWidth}px`;
  canvas.width = Math.floor(cssWidth * ratio);
  canvas.height = Math.floor(cssHeight * ratio);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const width = cssWidth;
  const height = cssHeight;
  ctx.clearRect(0, 0, width, height);

  if (!seriesHasPoints(series)) {
    const message =
      state.plotState === "empty"
        ? "所选通道没有可绘制的数值数据。"
        : state.plotState === "loading"
          ? "正在解析 CAN 日志..."
          : "请选择通道并点击绘制曲线。";
    drawEmpty(ctx, width, height, message);
    hideCrosshair();
    return;
  }

  const layout = buildPlotLayout(series, width, height);

  ctx.fillStyle = chartColors.background;
  ctx.fillRect(0, 0, width, height);

  for (const panel of layout.panels) {
    drawGrid(ctx, panel, layout.minX, layout.maxX, panel.minY, panel.maxY, { showXLabels: panel.showXLabels });
    if (layout.mode === "split") drawPanelTitle(ctx, panel);
    const panelSeries = layout.mode === "combined" ? series.map((item, index) => ({ item, index })) : [{ item: panel.item, index: panel.index }];
    ctx.save();
    ctx.beginPath();
    ctx.rect(panel.left, panel.top, panel.width, panel.height);
    ctx.clip();
    for (const { item, index } of panelSeries) drawSeriesLine(ctx, item, index, panel, layout.minX, layout.maxX);
    ctx.restore();
  }

  if (state.hover && !state.dragStart) drawCrosshair(ctx, layout, width, height);
  if (state.dragMode === "box" && state.dragStart && state.dragCurrent) drawZoomSelection(ctx);

  ctx.fillStyle = chartColors.strongText;
  ctx.font = "12px Inter, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(state.timeMode === "absolute" ? "绝对时间" : "时间 (s)", layout.left + layout.width / 2, height - 14);
}

function splitPlotHeight(seriesCount, wrapHeight) {
  const panelHeight = 126;
  const margin = basePlotMargin();
  const gap = 18;
  return Math.max(360, wrapHeight, margin.top + margin.bottom + seriesCount * panelHeight + Math.max(0, seriesCount - 1) * gap);
}

function basePlotMargin() {
  return { left: 78, right: 24, top: 22, bottom: 48 };
}

function buildPlotLayout(series, width, height) {
  const margin = basePlotMargin();
  const left = margin.left;
  const plotWidth = Math.max(1, width - margin.left - margin.right);
  const fullRange = getFullRange(series);
  const range = getActiveRange(fullRange);
  if (state.plotMode !== "split") {
    const panel = {
      mode: "combined",
      index: -1,
      left,
      top: margin.top,
      width: plotWidth,
      height: Math.max(1, height - margin.top - margin.bottom),
      minY: range.minY,
      maxY: range.maxY,
      showXLabels: true,
    };
    return {
      mode: "combined",
      left,
      width: plotWidth,
      minX: range.minX,
      maxX: range.maxX,
      chartTop: panel.top,
      chartBottom: panel.top + panel.height,
      panels: [panel],
    };
  }

  const gap = 18;
  const count = series.length;
  const availableHeight = Math.max(1, height - margin.top - margin.bottom - Math.max(0, count - 1) * gap);
  const panelHeight = Math.max(64, availableHeight / Math.max(1, count));
  const panels = series.map((item, index) => {
    const yRange = getSeriesYRange(item);
    return {
      mode: "split",
      item,
      index,
      left,
      top: margin.top + index * (panelHeight + gap),
      width: plotWidth,
      height: panelHeight,
      minY: yRange.minY,
      maxY: yRange.maxY,
      showXLabels: index === count - 1,
    };
  });
  return {
    mode: "split",
    left,
    width: plotWidth,
    minX: range.minX,
    maxX: range.maxX,
    chartTop: panels[0]?.top || margin.top,
    chartBottom: panels.length ? panels[panels.length - 1].top + panels[panels.length - 1].height : height - margin.bottom,
    panels,
  };
}

function getSeriesYRange(item) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const value of item.y) {
    if (value < minY) minY = value;
    if (value > maxY) maxY = value;
  }
  if (!Number.isFinite(minY)) return { minY: -1, maxY: 1 };
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }
  const pad = (maxY - minY) * 0.08;
  return { minY: minY - pad, maxY: maxY + pad };
}

function drawPanelTitle(ctx, panel) {
  ctx.fillStyle = colors[panel.index % colors.length];
  ctx.font = "12px Inter, Segoe UI, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(seriesLabel(panel.item), panel.left + 8, panel.top + 7);
}

function drawSeriesLine(ctx, item, index, panel, minRelX, maxRelX) {
  if (!item.x.length) return;
  const displayMinX = displayXValue(minRelX);
  const displayMaxX = displayXValue(maxRelX);
  ctx.beginPath();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = colors[index % colors.length];
  item.x.forEach((xValue, pointIndex) => {
    const displayX = displayXValue(xValue);
    const x = panel.left + ((displayX - displayMinX) / (displayMaxX - displayMinX)) * panel.width;
    const y = panel.top + panel.height - ((item.y[pointIndex] - panel.minY) / (panel.maxY - panel.minY)) * panel.height;
    if (pointIndex === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function seriesHasPoints(series) {
  return series.some((item) => item.x.length && item.y.length);
}

function getFullRange(series) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const item of series) {
    const length = Math.min(item.x.length, item.y.length);
    for (let i = 0; i < length; i++) {
      const x = item.x[i];
      const y = item.y[i];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { minX: 0, maxX: 1, minY: -1, maxY: 1 };
  }
  if (minX === maxX) maxX = minX + 1;
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }
  const yPad = (maxY - minY) * 0.08;
  minY -= yPad;
  maxY += yPad;
  return { minX, maxX, minY, maxY };
}

function getActiveRange(fullRange = getFullRange(state.lastSeries)) {
  if (!state.zoom) return fullRange;
  return {
    minX: Math.max(fullRange.minX, state.zoom.minX),
    maxX: Math.min(fullRange.maxX, state.zoom.maxX),
    minY: Math.max(fullRange.minY, state.zoom.minY ?? fullRange.minY),
    maxY: Math.min(fullRange.maxY, state.zoom.maxY ?? fullRange.maxY),
  };
}

function drawGrid(ctx, panel, minRelX, maxRelX, minY, maxY, options = {}) {
  ctx.strokeStyle = chartColors.grid;
  ctx.lineWidth = 1;
  ctx.font = "11px Inter, Segoe UI, sans-serif";
  ctx.fillStyle = chartColors.text;
  ctx.textBaseline = "middle";

  const xTicks = 10;
  for (let i = 0; i <= xTicks; i++) {
    const x = panel.left + (panel.width * i) / xTicks;
    const value = minRelX + ((maxRelX - minRelX) * i) / xTicks;
    ctx.beginPath();
    ctx.moveTo(x, panel.top);
    ctx.lineTo(x, panel.top + panel.height);
    ctx.stroke();
    if (options.showXLabels) {
      ctx.textAlign = "center";
      ctx.fillText(formatAxisTime(value), x, panel.top + panel.height + 18);
    }
  }

  for (let i = 0; i <= 5; i++) {
    const y = panel.top + (panel.height * i) / 5;
    const value = maxY - ((maxY - minY) * i) / 5;
    ctx.beginPath();
    ctx.moveTo(panel.left, y);
    ctx.lineTo(panel.left + panel.width, y);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(shortNumber(value), panel.left - 8, y);
  }

  ctx.strokeStyle = chartColors.axis;
  ctx.strokeRect(panel.left, panel.top, panel.width, panel.height);
}

function drawCrosshair(ctx, layout, width, height) {
  const activePanel = layout.panels.find((panel) => panel.index === state.hover.panelIndex) || layout.panels[0];
  if (!activePanel) return;
  const relativeX = layout.minX + ((state.hover.x - layout.left) / layout.width) * (layout.maxX - layout.minX);
  const clampedRelX = Math.min(layout.maxX, Math.max(layout.minX, relativeX));
  const displayMinX = displayXValue(layout.minX);
  const displayMaxX = displayXValue(layout.maxX);
  const displayX = displayXValue(clampedRelX);
  const canvasX = layout.left + ((displayX - displayMinX) / (displayMaxX - displayMinX)) * layout.width;
  const canvasY = Math.min(activePanel.top + activePanel.height, Math.max(activePanel.top, state.hover.y));
  const hits = nearestSeriesPoints(clampedRelX, layout);

  ctx.save();
  ctx.strokeStyle = chartColors.crosshair;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(canvasX, layout.chartTop);
  ctx.lineTo(canvasX, layout.chartBottom);
  ctx.moveTo(activePanel.left, canvasY);
  ctx.lineTo(activePanel.left + activePanel.width, canvasY);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const hit of hits) {
    ctx.fillStyle = hit.color;
    ctx.beginPath();
    ctx.arc(canvasX, hit.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  showCrosshair(canvasX, canvasY, hits, formatTimeValue(clampedRelX), width, height);
}

function nearestSeriesPoints(relativeX, layout) {
  const entries =
    layout.mode === "combined"
      ? state.lastSeries.map((item, index) => ({ item, index, panel: layout.panels[0] }))
      : layout.panels.map((panel) => ({ item: panel.item, index: panel.index, panel }));
  return entries
    .map(({ item, index, panel }) => {
      if (!item.x.length) return null;
      let bestIndex = 0;
      let bestDistance = Infinity;
      for (let i = 0; i < item.x.length; i++) {
        const distance = Math.abs(item.x[i] - relativeX);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = i;
        }
      }
      const value = item.y[bestIndex];
      return {
        label: seriesLabel(item),
        color: colors[index % colors.length],
        time: item.x[bestIndex],
        value,
        y: panel.top + panel.height - ((value - panel.minY) / (panel.maxY - panel.minY)) * panel.height,
      };
    })
    .filter(Boolean);
}

function showCrosshair(x, y, hits, timeLabel, width, height) {
  const rows = hits
    .map(
      (hit) => `
        <div class="crosshair-row">
          <span class="swatch" style="background:${hit.color}"></span>
          <span>${escapeHtml(hit.label)}</span>
          <strong>${shortNumber(hit.value)}</strong>
        </div>
      `,
    )
    .join("");
  els.crosshair.innerHTML = `<div class="crosshair-time">${escapeHtml(timeLabel)}</div>${rows}`;
  els.crosshair.style.display = "block";
  const cardWidth = Math.max(240, els.crosshair.offsetWidth || 280);
  const cardHeight = els.crosshair.offsetHeight || 120;
  const left = x + cardWidth + 18 > width ? x - cardWidth - 14 : x + 14;
  const top = y + cardHeight + 18 > height ? y - cardHeight - 14 : y + 14;
  els.crosshair.style.left = `${Math.max(8, left)}px`;
  els.crosshair.style.top = `${Math.max(8, top)}px`;
}

function hideCrosshair() {
  els.crosshair.style.display = "none";
}

function drawZoomSelection(ctx) {
  const left = Math.min(state.dragStart.x, state.dragCurrent.x);
  const top = Math.min(state.dragStart.y, state.dragCurrent.y);
  const width = Math.abs(state.dragCurrent.x - state.dragStart.x);
  const height = Math.abs(state.dragCurrent.y - state.dragStart.y);
  ctx.save();
  ctx.fillStyle = chartColors.zoomFill;
  ctx.strokeStyle = chartColors.zoomStroke;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  ctx.fillRect(left, top, width, height);
  ctx.strokeRect(left, top, width, height);
  ctx.restore();
}

function shortNumber(value) {
  if (Math.abs(value) >= 1000) return value.toExponential(1);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function drawEmpty(ctx, width, height, message) {
  ctx.fillStyle = chartColors.background;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = chartColors.text;
  ctx.font = "14px Inter, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(message, width / 2, height / 2);
}

function handlePlotPointer(event) {
  if (!state.lastSeries.length) return;
  if (state.dragStart) {
    state.dragCurrent = clampPointToPlot(event);
    if (!state.dragCurrent) return;
    if (state.dragMode === "pan") panZoomToPoint(state.dragCurrent);
    drawPlot();
    return;
  }
  const point = pointFromEvent(event);
  if (!point) {
    state.hover = null;
    drawPlot();
    hideCrosshair();
    return;
  }
  state.hover = { x: point.x, y: point.y, panelIndex: point.panelIndex };
  drawPlot();
}

function clampPointToPlot(event) {
  const { rect, layout } = currentPlotLayout();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const panel =
    (state.dragStart && layout.panels.find((item) => item.index === state.dragStart.panelIndex)) || findPanelAtPoint(layout, x, y);
  if (!panel) return null;
  return {
    x: Math.min(layout.left + layout.width, Math.max(layout.left, x)),
    y: Math.min(panel.top + panel.height, Math.max(panel.top, y)),
    panelIndex: panel.index,
    panel,
  };
}

function currentPlotLayout() {
  const rect = els.plot.getBoundingClientRect();
  return { rect, layout: buildPlotLayout(state.lastSeries, rect.width, rect.height) };
}

function findPanelAtPoint(layout, x, y) {
  if (x < layout.left || x > layout.left + layout.width) return null;
  return layout.panels.find((panel) => y >= panel.top && y <= panel.top + panel.height) || null;
}

function pointFromEvent(event) {
  const { rect, layout } = currentPlotLayout();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const panel = findPanelAtPoint(layout, x, y);
  if (!panel) return null;
  return { x, y, panelIndex: panel.index, panel, layout };
}

function pointInPlot(point) {
  return Boolean(point);
}

function pixelToRange(point, range, panel = point.panel) {
  const { layout } = currentPlotLayout();
  return {
    x: range.minX + ((point.x - layout.left) / layout.width) * (range.maxX - range.minX),
    y: panel.maxY - ((point.y - panel.top) / panel.height) * (panel.maxY - panel.minY),
  };
}

function handlePlotMouseDown(event) {
  if (!state.lastSeries.length || (event.button !== 0 && event.button !== 1)) return;
  const point = pointFromEvent(event);
  if (!pointInPlot(point)) return;
  event.preventDefault();
  state.hover = null;
  hideCrosshair();
  state.dragStart = point;
  state.dragCurrent = point;
  state.dragMode = event.button === 1 ? "pan" : "box";
  state.panStartRange = state.dragMode === "pan" ? getActiveRange() : null;
  drawPlot();
}

function handlePlotMouseUp(event) {
  if (!state.dragStart || !state.lastSeries.length) return;
  const end = clampPointToPlot(event);
  if (!end) {
    state.dragStart = null;
    state.dragCurrent = null;
    state.dragMode = null;
    state.panStartRange = null;
    drawPlot();
    return;
  }
  const width = Math.abs(end.x - state.dragStart.x);
  const height = Math.abs(end.y - state.dragStart.y);
  const canZoom = state.plotMode === "split" ? width > 8 : width > 8 && height > 8;
  if (state.dragMode === "box" && canZoom) {
    const full = getFullRange(state.lastSeries);
    const range = getActiveRange(full);
    const a = pixelToRange(state.dragStart, range, state.dragStart.panel);
    const b = pixelToRange(end, range, end.panel);
    state.zoom = {
      minX: Math.min(a.x, b.x),
      maxX: Math.max(a.x, b.x),
      minY: state.plotMode === "split" ? full.minY : Math.min(a.y, b.y),
      maxY: state.plotMode === "split" ? full.maxY : Math.max(a.y, b.y),
    };
    setStatus("已缩放到框选范围。点击“恢复缩放”可回到完整范围。");
  }
  state.dragStart = null;
  state.dragCurrent = null;
  state.dragMode = null;
  state.panStartRange = null;
  drawPlot();
}

function panZoomToPoint(point) {
  if (!state.panStartRange) return;
  const { layout } = currentPlotLayout();
  const full = getFullRange(state.lastSeries);
  const start = state.panStartRange;
  const dx = point.x - state.dragStart.x;
  const dy = point.y - state.dragStart.y;
  const xShift = -(dx / layout.width) * (start.maxX - start.minX);
  const yShift = state.plotMode === "split" ? 0 : (dy / point.panel.height) * (start.maxY - start.minY);
  state.zoom = clampZoom(
    {
      minX: start.minX + xShift,
      maxX: start.maxX + xShift,
      minY: start.minY + yShift,
      maxY: start.maxY + yShift,
    },
    full,
  );
}

function handlePlotWheel(event) {
  if (!state.lastSeries.length) return;
  const point = pointFromEvent(event);
  if (!pointInPlot(point)) return;
  event.preventDefault();
  const full = getFullRange(state.lastSeries);
  const current = getActiveRange(full);
  const center = pixelToRange(point, current, point.panel);
  const factor = event.deltaY < 0 ? 0.8 : 1.25;
  const zoomX = !event.shiftKey;
  const zoomY = state.plotMode === "combined" && (event.shiftKey || event.ctrlKey || event.metaKey);
  const next = { ...current };
  if (zoomX) {
    const left = center.x - current.minX;
    const right = current.maxX - center.x;
    next.minX = center.x - left * factor;
    next.maxX = center.x + right * factor;
  }
  if (zoomY) {
    const bottom = center.y - current.minY;
    const top = current.maxY - center.y;
    next.minY = center.y - bottom * factor;
    next.maxY = center.y + top * factor;
  }
  state.zoom = clampZoom(next, full);
  state.hover = null;
  hideCrosshair();
  drawPlot();
}

function clampZoom(next, full) {
  const minXSpan = (full.maxX - full.minX) / 100000 || 0.001;
  const minYSpan = (full.maxY - full.minY) / 100000 || 0.001;
  let minX = Math.max(full.minX, next.minX);
  let maxX = Math.min(full.maxX, next.maxX);
  let minY = Math.max(full.minY, next.minY);
  let maxY = Math.min(full.maxY, next.maxY);
  if (maxX - minX < minXSpan) {
    const center = (minX + maxX) / 2;
    minX = center - minXSpan / 2;
    maxX = center + minXSpan / 2;
  }
  if (maxY - minY < minYSpan) {
    const center = (minY + maxY) / 2;
    minY = center - minYSpan / 2;
    maxY = center + minYSpan / 2;
  }
  const clamped = {
    minX: Math.max(full.minX, minX),
    maxX: Math.min(full.maxX, maxX),
    minY: Math.max(full.minY, minY),
    maxY: Math.min(full.maxY, maxY),
  };
  const isFullRange = Object.keys(clamped).every((key) => clamped[key] === full[key]);
  return isFullRange ? null : clamped;
}

els.refreshFiles.addEventListener("click", loadFiles);
els.fileUpload.addEventListener("change", uploadFiles);
els.upload.addEventListener("dragenter", (event) => {
  event.preventDefault();
  els.upload.classList.add("drag-over");
});
els.upload.addEventListener("dragover", (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  els.upload.classList.add("drag-over");
});
els.upload.addEventListener("dragleave", (event) => {
  if (!els.upload.contains(event.relatedTarget)) els.upload.classList.remove("drag-over");
});
els.upload.addEventListener("drop", handleUploadDrop);
els.removeBlf.addEventListener("click", () => removeFiles(selectedLogFiles().map((file) => file.id)));
els.blfSelect.addEventListener("change", updateFileControls);
els.removeDbc.addEventListener("click", () => removeFiles(highlightedDbcFiles()));
els.dbcSelect.addEventListener("keydown", (event) => {
  if (event.key === "Delete") removeFiles(highlightedDbcFiles());
});
els.selectVisible.addEventListener("click", selectVisibleSignals);
els.clearSignals.addEventListener("click", clearSignalSelection);
els.saveChannelPreset.addEventListener("click", saveCurrentChannelPreset);
els.applyChannelPreset.addEventListener("click", applySelectedChannelPreset);
els.deleteChannelPreset.addEventListener("click", deleteSelectedChannelPreset);
els.channelPresetSelect.addEventListener("change", updateChannelPresetControls);
els.searchSignals.addEventListener("input", renderSignals);
els.signals.addEventListener("click", (event) => {
  if (event.target.classList.contains("group-check")) event.stopPropagation();
});
els.signals.addEventListener("change", onSignalChange);
els.plotButton.addEventListener("click", plotSelected);
els.exportButton.addEventListener("click", exportSelected);
els.relativeTime.addEventListener("click", () => setTimeMode("relative"));
els.absoluteTime.addEventListener("click", () => setTimeMode("absolute"));
els.pathLabel.addEventListener("click", () => setLabelMode("path"));
els.commentLabel.addEventListener("click", () => setLabelMode("comment"));
els.combinedPlot.addEventListener("click", () => setPlotMode("combined"));
els.splitPlot.addEventListener("click", () => setPlotMode("split"));
els.captureTimezone.addEventListener("change", handleCaptureTimezoneChange);
els.resetZoom.addEventListener("click", resetZoom);
els.plot.addEventListener("mousedown", handlePlotMouseDown);
els.plot.addEventListener("mousemove", handlePlotPointer);
window.addEventListener("mouseup", handlePlotMouseUp);
els.plot.addEventListener("wheel", handlePlotWheel, { passive: false });
els.plot.addEventListener("mouseleave", () => {
  if (state.dragStart) return;
  state.hover = null;
  drawPlot();
  hideCrosshair();
});
window.addEventListener("resize", () => drawPlot());

setupCaptureTimezones();
startFreshSession()
  .then(loadFiles)
  .catch((error) => setStatus(error.message));
