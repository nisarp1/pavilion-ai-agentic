"""
Cloud Run Celery runner.

Cloud Run requires an HTTP server on $PORT even for background workers.
This script starts a health-check HTTP server and runs Celery as a subprocess.
When Celery exits (crash or signal), this script exits with the same code,
which causes Cloud Run to restart the container correctly.
"""
import http.server
import os
import subprocess
import sys
import threading

PORT = int(os.environ.get("PORT", 8080))


class HealthHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def log_message(self, *args):
        pass  # silence per-request logs


def start_health_server():
    srv = http.server.HTTPServer(("0.0.0.0", PORT), HealthHandler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    print(f"[celery_runner] Health server on :{PORT}", flush=True)
    return srv


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: celery_runner.py <celery command...>")
        sys.exit(1)

    start_health_server()

    cmd = sys.argv[1:]
    print(f"[celery_runner] Starting: {' '.join(cmd)}", flush=True)

    proc = subprocess.run(cmd)

    # Celery exited — propagate the exit code so Cloud Run restarts the container
    print(f"[celery_runner] Celery exited with code {proc.returncode}", flush=True)
    sys.exit(proc.returncode)
