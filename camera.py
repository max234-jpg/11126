"""Lecture de la caméra Wi-Fi en arrière-plan.

Sources acceptées :
  * flux MJPEG HTTP   ex. http://192.168.1.50:81/stream      (ESP32-CAM)
                          http://192.168.1.50:8080/video     (appli « IP Webcam »)
  * photo HTTP        ex. http://192.168.1.50/capture  ou  .../snapshot.jpg
  * flux RTSP         ex. rtsp://admin:motdepasse@192.168.1.50:554/stream1
  * webcam USB        ex. 0
"""
import threading
import time
from urllib.parse import urlparse

import cv2
import numpy as np
import requests

SNAPSHOT_HINTS = ("snapshot", "capture", "shot", "photo", "still", "image", "picture",
                  ".jpg", ".jpeg", ".png", ".cgi")


def guess_kind(source):
    s = (source or "").strip().lower()
    if not s:
        return "none"
    if s.isdigit():
        return "device"
    if s.startswith(("rtsp://", "rtmp://")):
        return "rtsp"
    if s.startswith(("http://", "https://")):
        path = urlparse(s).path + "?" + urlparse(s).query
        if any(h in path for h in SNAPSHOT_HINTS) and "stream" not in path and "video" not in path \
                and "mjpg" not in path and "mjpeg" not in path:
            return "snapshot"
        return "mjpeg"
    return "rtsp"  # on laisse OpenCV/FFmpeg essayer


class Camera:
    def __init__(self):
        self._cond = threading.Condition()
        self._frame = None
        self._frame_id = 0
        self._thread = None
        self._stop = threading.Event()
        self.source = ""
        self.kind = "none"
        self.auth = None
        self.error = None
        self.fps = 0.0
        self._last_t = 0.0

    # -- configuration -----------------------------------------------------
    def configure(self, source, kind="auto", user="", password=""):
        self.stop()
        self.source = (source or "").strip()
        self.kind = guess_kind(self.source) if kind in ("", "auto", None) else kind
        self.auth = (user, password) if user else None
        self.error = None
        with self._cond:
            self._frame, self._frame_id, self.fps = None, 0, 0.0
        if self.kind != "none":
            self._stop = threading.Event()
            self._thread = threading.Thread(target=self._run, args=(self._stop,), daemon=True)
            self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3)
        self._thread = None

    # -- accès aux images --------------------------------------------------
    def status(self):
        with self._cond:
            f = self._frame
            fresh = f is not None and time.time() - self._last_t < 5
        return {
            "source": self.source, "kind": self.kind,
            "connected": fresh, "error": None if fresh else self.error,
            "width": int(f.shape[1]) if f is not None else 0,
            "height": int(f.shape[0]) if f is not None else 0,
            "fps": round(self.fps, 1),
        }

    def latest(self):
        with self._cond:
            return self._frame, self._frame_id

    def wait_frame(self, after_id, timeout=5.0):
        with self._cond:
            self._cond.wait_for(lambda: self._frame_id > after_id, timeout=timeout)
            return self._frame, self._frame_id

    def grab(self, count=1, timeout=8.0):
        """Récupère `count` images successives (nouvelles) de la caméra."""
        frames = []
        _, last = self.latest()
        deadline = time.time() + timeout
        while len(frames) < count and time.time() < deadline:
            f, fid = self.wait_frame(last, timeout=max(0.1, deadline - time.time()))
            if fid > last and f is not None:
                frames.append(f.copy())
                last = fid
        if not frames:  # au pire, on prend la dernière image connue si elle est récente
            f, _ = self.latest()
            if f is not None and time.time() - self._last_t < 5:
                frames.append(f.copy())
        return frames

    def _publish(self, frame):
        now = time.time()
        with self._cond:
            if self._last_t:
                dt = now - self._last_t
                if dt > 0:
                    self.fps = 0.8 * self.fps + 0.2 * (1.0 / dt) if self.fps else 1.0 / dt
            self._frame = frame
            self._frame_id += 1
            self._last_t = now
            self.error = None
            self._cond.notify_all()

    # -- boucles de lecture ------------------------------------------------
    def _run(self, stop):
        while not stop.is_set():
            try:
                if self.kind == "snapshot":
                    self._run_snapshot(stop)
                elif self.kind == "mjpeg":
                    self._run_mjpeg(stop)
                else:
                    self._run_opencv(stop)
            except Exception as e:  # noqa: BLE001 - on veut juste réessayer
                self.error = f"{type(e).__name__}: {e}"
            stop.wait(2.0)  # petite pause avant reconnexion

    def _run_snapshot(self, stop):
        session = requests.Session()
        while not stop.is_set():
            r = session.get(self.source, auth=self.auth, timeout=6)
            r.raise_for_status()
            img = cv2.imdecode(np.frombuffer(r.content, np.uint8), cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError("la réponse n'est pas une image (vérifiez l'adresse)")
            self._publish(img)
            stop.wait(0.15)

    def _run_mjpeg(self, stop):
        with requests.get(self.source, auth=self.auth, stream=True, timeout=(6, 10)) as r:
            r.raise_for_status()
            ctype = r.headers.get("Content-Type", "")
            if ctype.startswith("image/"):  # en fait c'est une simple photo
                self.kind = "snapshot"
                return
            buf = b""
            for chunk in r.iter_content(chunk_size=16384):
                if stop.is_set():
                    return
                buf += chunk
                while True:
                    start = buf.find(b"\xff\xd8")
                    end = buf.find(b"\xff\xd9", start + 2) if start != -1 else -1
                    if start == -1 or end == -1:
                        if start > 0:
                            buf = buf[start:]
                        elif start == -1 and len(buf) > 1_000_000:
                            buf = b""
                        break
                    jpg, buf = buf[start:end + 2], buf[end + 2:]
                    img = cv2.imdecode(np.frombuffer(jpg, np.uint8), cv2.IMREAD_COLOR)
                    if img is not None:
                        self._publish(img)
        raise ConnectionError("flux interrompu")

    def _run_opencv(self, stop):
        src = int(self.source) if self.source.isdigit() else self.source
        cap = cv2.VideoCapture(src)
        try:
            if not cap.isOpened():
                raise ConnectionError("impossible d'ouvrir la caméra (adresse, identifiant ?)")
            fails = 0
            while not stop.is_set():
                ok, img = cap.read()
                if not ok or img is None:
                    fails += 1
                    if fails > 25:
                        raise ConnectionError("plus d'images reçues")
                    time.sleep(0.05)
                    continue
                fails = 0
                self._publish(img)
        finally:
            cap.release()
