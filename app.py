"""Scanner Wi-Fi : serveur web.

Lancement :   python app.py
Puis ouvrez  http://<adresse-du-PC>:8765  depuis votre téléphone (même Wi-Fi).
"""
import io
import ipaddress
import json
import os
import socket
import threading
import time
import uuid
import webbrowser
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np
from flask import Flask, Response, abort, jsonify, request, send_file, send_from_directory
from PIL import Image

import scanner
from camera import Camera

BASE = os.path.dirname(os.path.abspath(__file__))
SCANS = os.path.join(BASE, "scans")
CONFIG = os.path.join(BASE, "config.json")
os.makedirs(SCANS, exist_ok=True)

app = Flask(__name__, static_folder=os.path.join(BASE, "static"), static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = 40 * 1024 * 1024
camera = Camera()
_lock = threading.Lock()

# 8765 et pas 5000 : sur Mac, le port 5000 est déjà pris par AirPlay.
PORT = int(os.environ.get("PORT", "8765"))

DEFAULT_CONFIG = {"source": "", "kind": "auto", "user": "", "password": "",
                  "mode": "couleur", "frames": 5}


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
def load_config():
    cfg = dict(DEFAULT_CONFIG)
    try:
        with open(CONFIG, encoding="utf-8") as f:
            cfg.update(json.load(f))
    except (OSError, ValueError):
        pass
    return cfg


def save_config(cfg):
    with open(CONFIG, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)


def apply_config(cfg):
    camera.configure(cfg.get("source", ""), cfg.get("kind", "auto"),
                     cfg.get("user", ""), cfg.get("password", ""))


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/config")
def get_config():
    cfg = load_config()
    cfg["password"] = "••••••" if cfg.get("password") else ""
    return jsonify(cfg)


@app.post("/api/config")
def set_config():
    data = request.get_json(force=True) or {}
    cfg = load_config()
    camera_changed = False
    for k in ("source", "kind", "user", "password", "mode", "frames"):
        if k not in data:
            continue
        if k == "password" and data[k] == "••••••":
            continue
        if k == "frames":
            data[k] = max(1, min(10, int(data[k])))
        if k in ("source", "kind", "user", "password") and cfg.get(k) != data[k]:
            camera_changed = True
        cfg[k] = data[k]
    save_config(cfg)
    if camera_changed or data.get("reconnect"):
        apply_config(cfg)
    return jsonify({"ok": True})


@app.get("/api/status")
def status():
    return jsonify(camera.status())


# ---------------------------------------------------------------------------
# Vidéo en direct (avec contour du document détecté)
# ---------------------------------------------------------------------------
def _placeholder(text):
    img = np.full((360, 640, 3), 40, np.uint8)
    for i, line in enumerate(text.split("\n")):
        cv2.putText(img, line, (24, 160 + 40 * i), cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                    (220, 220, 220), 2, cv2.LINE_AA)
    return cv2.imencode(".jpg", img)[1].tobytes()


@app.get("/video_feed")
def video_feed():
    overlay = request.args.get("overlay", "1") == "1"

    def gen():
        last_id, last_detect, corners = -1, 0.0, None
        while True:
            frame, fid = camera.wait_frame(last_id, timeout=2.0)
            if frame is None or fid == last_id:
                jpg = _placeholder("Camera non connectee\nVerifiez les reglages")
                yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpg + b"\r\n"
                time.sleep(1.0)
                continue
            last_id = fid
            h, w = frame.shape[:2]
            s = min(1.0, 960.0 / max(h, w))
            view = cv2.resize(frame, (int(w * s), int(h * s))) if s < 1 else frame.copy()
            if overlay:
                now = time.time()
                if now - last_detect > 0.3:
                    last_detect = now
                    c = scanner.detect_document(view)
                    corners = c
                if corners is not None:
                    pts = corners.astype(np.int32).reshape(-1, 1, 2)
                    tint = view.copy()
                    cv2.fillPoly(tint, [pts], (255, 160, 40))
                    view = cv2.addWeighted(tint, 0.18, view, 0.82, 0)
                    cv2.polylines(view, [pts], True, (255, 170, 30), 3, cv2.LINE_AA)
            jpg = cv2.imencode(".jpg", view, [cv2.IMWRITE_JPEG_QUALITY, 75])[1].tobytes()
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpg + b"\r\n"
            time.sleep(0.05)

    return Response(gen(), mimetype="multipart/x-mixed-replace; boundary=frame",
                    headers={"Cache-Control": "no-store"})


@app.get("/api/frame.jpg")
def frame_jpg():
    frame, _ = camera.latest()
    if frame is None:
        abort(503)
    return Response(cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 92])[1].tobytes(),
                    mimetype="image/jpeg", headers={"Cache-Control": "no-store"})


# ---------------------------------------------------------------------------
# Scans
# ---------------------------------------------------------------------------
def _paths(sid):
    if not sid.replace("-", "").isalnum():
        abort(404)
    return (os.path.join(SCANS, f"{sid}_orig.jpg"), os.path.join(SCANS, f"{sid}.jpg"),
            os.path.join(SCANS, f"{sid}.json"))


def _meta(sid):
    try:
        with open(_paths(sid)[2], encoding="utf-8") as f:
            return json.load(f)
    except OSError:
        abort(404)


def _run_process(sid, original, mode, corners=None, rotation=0):
    out, used, detected = scanner.process(original, mode, corners, rotation)
    o_path, r_path, m_path = _paths(sid)
    cv2.imwrite(r_path, out, [cv2.IMWRITE_JPEG_QUALITY, 92])
    h, w = original.shape[:2]
    meta = {
        "id": sid, "mode": mode, "rotation": rotation % 360,
        "corners": [[float(x) / w, float(y) / h] for x, y in used],
        "detected": bool(detected),
        "created": _meta(sid)["created"] if os.path.exists(m_path) else time.time(),
        "updated": time.time(),
        "width": int(out.shape[1]), "height": int(out.shape[0]),
    }
    with open(m_path, "w", encoding="utf-8") as f:
        json.dump(meta, f)
    return meta


def _new_scan(original, mode):
    sid = time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:6]
    cv2.imwrite(_paths(sid)[0], original, [cv2.IMWRITE_JPEG_QUALITY, 95])
    return _run_process(sid, original, mode)


@app.post("/api/scan")
def scan():
    cfg = load_config()
    data = request.get_json(silent=True) or {}
    mode = data.get("mode", cfg.get("mode", "couleur"))
    count = max(1, min(10, int(data.get("frames", cfg.get("frames", 5)))))
    frames = camera.grab(count)
    if not frames:
        return jsonify({"error": "Aucune image reçue de la caméra. Vérifiez la connexion dans Réglages."}), 503
    original = scanner.stack_frames(frames)
    with _lock:
        meta = _new_scan(original, mode)
    meta["frames_used"] = len(frames)
    return jsonify(meta)


@app.post("/api/upload")
def upload():
    files = request.files.getlist("file")
    mode = request.form.get("mode", load_config().get("mode", "couleur"))
    results = []
    for f in files:
        img = cv2.imdecode(np.frombuffer(f.read(), np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            continue
        with _lock:
            results.append(_new_scan(img, mode))
    if not results:
        return jsonify({"error": "Fichier image invalide"}), 400
    return jsonify(results[-1] if len(results) == 1 else {"scans": results})


def _all_scans():
    items = []
    for name in os.listdir(SCANS):
        if name.endswith(".json"):
            try:
                with open(os.path.join(SCANS, name), encoding="utf-8") as f:
                    items.append(json.load(f))
            except (OSError, ValueError):
                pass
    items.sort(key=lambda m: m.get("created", 0), reverse=True)
    return items


@app.get("/api/scans")
def list_scans():
    return jsonify(_all_scans())


@app.post("/api/scans/<sid>/process")
def reprocess(sid):
    meta = _meta(sid)
    data = request.get_json(force=True) or {}
    original = cv2.imread(_paths(sid)[0])
    if original is None:
        abort(404)
    h, w = original.shape[:2]
    mode = data.get("mode", meta["mode"])
    rotation = int(data.get("rotation", meta["rotation"]))
    c = data.get("corners", meta["corners"])
    if c == "auto":
        corners = None
    elif c == "full":
        corners = scanner.full_corners(original)
    else:
        corners = np.array([[x * w, y * h] for x, y in c], dtype=np.float32)
    with _lock:
        return jsonify(_run_process(sid, original, mode, corners, rotation))


@app.delete("/api/scans/<sid>")
def delete_scan(sid):
    for p in _paths(sid):
        if os.path.exists(p):
            os.remove(p)
    return jsonify({"ok": True})


@app.get("/scans/<sid>.jpg")
def scan_image(sid):
    path = _paths(sid)[1]
    if not os.path.exists(path):
        abort(404)
    return send_file(path, mimetype="image/jpeg", download_name=f"scan-{sid}.jpg",
                     as_attachment=request.args.get("dl") == "1", max_age=0)


@app.get("/scans/<sid>/original.jpg")
def scan_original(sid):
    path = _paths(sid)[0]
    if not os.path.exists(path):
        abort(404)
    return send_file(path, mimetype="image/jpeg", max_age=0)


@app.get("/scans/<sid>/thumb.jpg")
def scan_thumb(sid):
    img = cv2.imread(_paths(sid)[1])
    if img is None:
        abort(404)
    s = 360.0 / max(img.shape[:2])
    img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    return Response(cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 80])[1].tobytes(),
                    mimetype="image/jpeg", headers={"Cache-Control": "no-store"})


@app.get("/api/pdf")
def export_pdf():
    ids = [i for i in request.args.get("ids", "").split(",") if i]
    if not ids:
        ids = [m["id"] for m in reversed(_all_scans())]
    pages = []
    for sid in ids:
        path = _paths(sid)[1]
        if os.path.exists(path):
            pages.append(Image.open(path).convert("RGB"))
    if not pages:
        abort(404)
    buf = io.BytesIO()
    pages[0].save(buf, format="PDF", save_all=True, append_images=pages[1:], resolution=200)
    buf.seek(0)
    return send_file(buf, mimetype="application/pdf", as_attachment=True,
                     download_name=time.strftime("scan-%Y%m%d-%H%M%S.pdf"))


# ---------------------------------------------------------------------------
# Recherche de caméras sur le réseau local
# ---------------------------------------------------------------------------
def local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


CAM_PORTS = {
    81: ["http://{ip}:81/stream"],
    554: ["rtsp://{ip}:554/stream1", "rtsp://{ip}:554/"],
    8080: ["http://{ip}:8080/video", "http://{ip}:8080/shot.jpg"],
    8554: ["rtsp://{ip}:8554/"],
    80: ["http://{ip}/capture", "http://{ip}/snapshot.jpg"],
}


def _probe(ip):
    found = []
    for port in CAM_PORTS:
        try:
            with socket.create_connection((ip, port), timeout=0.35):
                found.append(port)
        except OSError:
            pass
    return ip, found


@app.get("/api/discover")
def discover():
    me = local_ip()
    net = ipaddress.ip_network(me + "/24", strict=False)
    hosts = [str(h) for h in net.hosts() if str(h) != me]
    results = []
    with ThreadPoolExecutor(max_workers=64) as ex:
        for ip, ports in ex.map(_probe, hosts):
            if ports:
                urls = [u.format(ip=ip) for p in ports for u in CAM_PORTS[p]]
                results.append({"ip": ip, "ports": ports, "urls": urls})
    # Les appareils avec un port typique de caméra (81, 554, 8080, 8554) en premier
    results.sort(key=lambda r: (r["ports"] == [80], r["ip"]))
    return jsonify({"me": me, "devices": results})


@app.get("/api/info")
def info():
    return jsonify({"phone_url": f"http://{local_ip()}:{PORT}"})


@app.get("/api/qr.svg")
def qr_svg():
    """QR code de l'adresse à ouvrir sur le téléphone."""
    try:
        import qrcode
        import qrcode.image.svg
    except ImportError:
        abort(404)
    img = qrcode.make(f"http://{local_ip()}:{PORT}", image_factory=qrcode.image.svg.SvgPathFillImage,
                      box_size=10, border=2)
    buf = io.BytesIO()
    img.save(buf)
    return Response(buf.getvalue(), mimetype="image/svg+xml", headers={"Cache-Control": "no-store"})


if __name__ == "__main__":
    apply_config(load_config())
    port = PORT
    ip = local_ip()
    print("\n  Scanner Wi-Fi démarré !")
    print(f"  Sur ce PC        : http://localhost:{port}")
    print(f"  Sur le téléphone : http://{ip}:{port}   (même réseau Wi-Fi)\n")
    if os.environ.get("NO_BROWSER") != "1":
        threading.Timer(1.5, lambda: webbrowser.open(f"http://localhost:{port}")).start()
    app.run(host="0.0.0.0", port=port, threaded=True, debug=False)
