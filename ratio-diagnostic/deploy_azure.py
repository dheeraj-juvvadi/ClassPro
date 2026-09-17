"""Run as root on the VM after building and testing IMAGE. Preserve container config."""
import http.client
import json
import os
from pathlib import Path
import shutil
import socket
import time
import urllib.request

IMAGE = os.environ.get("DEPLOY_IMAGE", "classpro-diag:20260917-safe")
NAME = "classpro-azure"
ROLLBACK = os.environ.get("ROLLBACK_NAME", "classpro-azure-before-20260917-safe")


class DockerConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect("/var/run/docker.sock")


def docker(method, path, body=None):
    conn = DockerConnection("localhost", timeout=120)
    conn.request(method, path, body=json.dumps(body) if body is not None else None,
                 headers={"Content-Type": "application/json"})
    response = conn.getresponse()
    data = response.read()
    if response.status >= 300:
        raise RuntimeError(f"Docker {method} {path}: HTTP {response.status}")
    conn.close()
    return json.loads(data) if data else None


def main():
    version = docker("GET", "/version")["ApiVersion"]
    api = f"/v{version}"
    old = docker("GET", f"{api}/containers/{NAME}/json")
    if old["Config"]["Image"] == IMAGE:
        raise RuntimeError("Target image already deployed")
    docker("GET", f"{api}/images/{IMAGE}/json")
    config = old["Config"].copy()
    config["Image"] = IMAGE
    changes = {"APP_ORIGIN": "https://anon-tracker.vercel.app", "SESSION_LIMIT": "2000",
               "API_CONCURRENCY": "8", "OCR_CONCURRENCY": "2", "IO_THREADS": "8",
               "REFRESH_CONCURRENCY": "4", "MEMORY_RESERVE_MB": "160",
               "CLIENT_LOG_DIR": "/app/client-logs"}
    config["Env"] = [v for v in config["Env"] if v.split("=", 1)[0] not in changes]
    config["Env"] += [f"{key}={value}" for key, value in changes.items()]
    config["HostConfig"] = old["HostConfig"].copy()
    # 90% of this two-vCPU VM; leave at least 10% CPU for the host.
    config["HostConfig"]["NanoCpus"] = 1800000000
    config["HostConfig"]["LogConfig"] = {"Type": "json-file",
                                         "Config": {"max-size": "10m", "max-file": "3"}}
    log_root = Path("/var/log/anon/client")
    log_root.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chown(log_root, 65534, 65534)
    mounts = config["HostConfig"].get("Binds") or []
    if not any(":/app/client-logs" in mount for mount in mounts):
        config["HostConfig"]["Binds"] = mounts + [f"{log_root}:/app/client-logs:rw"]
    backup = Path("/root") / ROLLBACK
    backup.mkdir(mode=0o700, exist_ok=True)
    (backup / "container.json").write_text(json.dumps(old))
    os.chmod(backup / "container.json", 0o600)
    store = next(m["Source"] for m in old["Mounts"] if m["Destination"] == "/app/session-data")
    docker("POST", f"{api}/containers/{NAME}/stop?t=100")
    renamed = created = False
    try:
        shutil.copytree(store, backup / "session-data", dirs_exist_ok=True)
        docker("POST", f"{api}/containers/{NAME}/rename?name={ROLLBACK}")
        renamed = True
        docker("POST", f"{api}/containers/create?name={NAME}", config)
        created = True
        docker("POST", f"{api}/containers/{NAME}/start")
        for _ in range(30):
            try:
                with urllib.request.urlopen("http://127.0.0.1:8080/health", timeout=2) as response:
                    if json.load(response).get("ok"):
                        print(json.dumps({"deployed": IMAGE, "rollback": ROLLBACK, "health": "ok"}))
                        return
            except (OSError, ValueError):
                time.sleep(1)
        raise RuntimeError("New container did not become healthy")
    except Exception:
        if created:
            docker("DELETE", f"{api}/containers/{NAME}?force=true")
        if renamed:
            docker("POST", f"{api}/containers/{ROLLBACK}/rename?name={NAME}")
        docker("POST", f"{api}/containers/{NAME}/start")
        raise


if __name__ == "__main__":
    main()
