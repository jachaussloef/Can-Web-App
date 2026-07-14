# Can-Web-App

A small LAN-friendly web app for decoding Vector BLF or ASC logs with one or more DBC files, plotting selected numeric channels against relative time in seconds, and exporting selected channels to CSV.

Plotting can be downsampled with the max-points control for browser performance. Selected channels can be shown in one combined chart or split into one stacked chart per channel. CSV export still decodes and writes all selected-channel samples; it is not limited by the plot point count.

## Run locally

```powershell
.\.venv\Scripts\python.exe app.py --host 127.0.0.1 --port 5050
```

Open `http://127.0.0.1:5050`.

## Install on another machine

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m waitress --listen=127.0.0.1:5050 --max-request-body-size=4294967296 app:app
```

On Linux:

```bash
python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
./.venv/bin/python -m waitress --listen=127.0.0.1:5050 --max-request-body-size=4294967296 app:app
```

Upload `.blf`, `.asc`, and `.dbc` files through the UI. Multiple BLF/ASC logs can be selected together: the chart merges their decoded points on a shared absolute-time axis, while CSV export creates one CSV per source log using its filename. ASC logs need a `date` header for reliable ordering across files. Chromium-based browsers opened over HTTPS (or `localhost`) can choose the destination folder; other browsers and plain HTTP LAN access download each CSV to the configured download folder. Chinese filenames are preserved. The `can_files` folder is only for local examples and is not auto-loaded by the app.

ASC logs are plain text and can be much larger than BLF logs, so the Waitress examples above raise the upload request-body limit to 4 GB.

For an NSSM Windows service, set the executable to the venv Python and keep the Waitress module form in the arguments, for example:

```text
Application: D:\Projects\Can-Web-App\.venv\Scripts\python.exe
Arguments: -m waitress --listen=0.0.0.0:5050 --max-request-body-size=4294967296 app:app
Startup directory: D:\Projects\Can-Web-App
```

## Linux deployment with systemd

The following example deploys the application to `/opt/Can-Web-App` and binds
Waitress to the loopback interface for use behind a reverse proxy. Replace the
directory, service user, and upload-size limit to suit your environment.

On Debian or Ubuntu, install the system packages, create a dedicated service
account, and give it ownership of the deployed application directory:

```bash
sudo apt update
sudo apt install -y python3 python3-venv
sudo useradd --system --home /opt/Can-Web-App --shell /usr/sbin/nologin canwebapp
sudo mkdir -p /opt/Can-Web-App
sudo chown -R canwebapp:canwebapp /opt/Can-Web-App
```

Copy or clone this repository into `/opt/Can-Web-App`, then create the
environment and install the application dependencies as the service user:

```bash
cd /opt/Can-Web-App
sudo -u canwebapp python3 -m venv .venv
sudo -u canwebapp ./.venv/bin/python -m pip install -r requirements.txt
```

Create `/etc/systemd/system/can-web-app.service` with the following content:

```ini
[Unit]
Description=Can-Web-App
After=network.target

[Service]
Type=simple
User=canwebapp
Group=canwebapp
WorkingDirectory=/opt/Can-Web-App
Environment=PYTHONUNBUFFERED=1
ExecStart=/opt/Can-Web-App/.venv/bin/python -m waitress --listen=127.0.0.1:5050 --max-request-body-size=4294967296 app:app
Restart=on-failure
RestartSec=5
UMask=0027

[Install]
WantedBy=multi-user.target
```

Enable the service, start it now, and inspect its state or logs when needed:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now can-web-app
sudo systemctl status can-web-app
sudo journalctl -u can-web-app -f
```

The application writes temporary session uploads below `uploads/`, so the
service user must retain write permission to that directory.

### Direct LAN access without Nginx

For a simple internal-only deployment, change the `ExecStart` listener in the
service file from `127.0.0.1:5050` to `0.0.0.0:5050`, then reload and restart
the service:

```bash
sudo systemctl daemon-reload
sudo systemctl restart can-web-app
```

Allow inbound port `5050` only from the required LAN subnets in the host
firewall. Users can then access `http://<server-ip>:5050` directly.

### Optional Nginx reverse proxy

Install Nginx with `sudo apt install -y nginx`, keep the systemd `ExecStart`
listener as `127.0.0.1:5050`, then create
`/etc/nginx/sites-available/can-web-app` with the following reverse proxy
configuration. `client_max_body_size` must be at least as large as the Waitress
request-body limit; the example allows 4 GB uploads.

```nginx
server {
    listen 80;
    server_name can-web-app.lan;

    client_max_body_size 4g;
    proxy_request_buffering off;
    proxy_connect_timeout 30s;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;

    location / {
        proxy_pass http://127.0.0.1:5050;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the Nginx site and validate the configuration before reloading it:

```bash
sudo ln -s /etc/nginx/sites-available/can-web-app /etc/nginx/sites-enabled/can-web-app
sudo nginx -t
sudo systemctl reload nginx
```

Open port 80 only to the required LAN subnets in the host firewall. When using
Nginx, do not expose Waitress port `5050`: it is bound to `127.0.0.1` and
intended for Nginx only. For HTTPS, add a TLS certificate and a `listen 443 ssl`
server block.

If a large ASC upload fails immediately in the browser with `Failed to fetch`, the request is usually being closed before Flask receives it. Check the NSSM Waitress arguments above, any reverse proxy upload limit, and the host firewall or security software.

Uploaded files are isolated per browser session under `uploads/<session_id>`. Refreshing the page starts a new session and removes that tab's previous session. Orphaned sessions are cleaned when a new session is created after 4 idle hours; active API requests refresh the session timestamp.

## Timestamp handling

The log reader returns message timestamps as seconds. The app uses the first CAN message as `t = 0` and plots all channels on an X axis of relative seconds. For ASC files, the app also reads the header `date` line when available so absolute timestamps can be reconstructed from the log start time.

Vector ASC header dates do not always carry timezone information. The app treats ASC header dates as a UTC baseline, then uses the `绝对时区` selector to display and export wall-clock time in the desired timezone. The app selects the detected server/browser local timezone by default, falling back to a timezone with the same UTC offset when the operating system only exposes a platform-specific name. The selector is populated from the browser's IANA timezone database and shows timezone offsets with representative cities, for example `UTC`, `Asia/Shanghai`, `Europe/Berlin`, or `America/New_York`.

After an ASC file has been parsed, changing `绝对时区` updates the absolute-time axis immediately without re-decoding the log. CSV export uses the timezone currently selected at export time. On Windows, `tzdata` is included in `requirements.txt` so Python can also resolve IANA timezone names when exporting.

CSV exports include:

- `absolute_time`: absolute timestamp in the selected timezone
- `relative_time_s`: relative seconds from the first CAN message
- selected channels named as `message::signal`

The second CSV row contains the DBC signal comments aligned under the selected channel columns. Data samples start on the third row.
