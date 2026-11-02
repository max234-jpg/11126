# -*- coding: utf-8 -*-
"""
Client minimal du protocole « PPPP » (CS2 Network / iLnkP2P) utilisé par de
nombreuses mini-caméras Wi-Fi bon marché : applis HDWiFiCam Pro, 365Cam,
YsxLite, FtyCamPro, CamHi… Ces caméras n'ouvrent AUCUN port TCP : tout passe
par UDP (recherche sur le port 32108, puis session sur un port aléatoire).

Fonctionne sans Internet et sans l'appli, directement sur le Wi-Fi de la caméra.

Connaissance du protocole tirée de travaux publics de rétro-ingénierie :
  - cam-reverse  (David Ventura)        https://github.com/DavidVentura/cam-reverse
  - aiopppp      (Ivan Belokobylskiy, licence Apache-2.0)
                                        https://github.com/devbis/aiopppp
    (la table d'obfuscation XOR_TABLE ci-dessous provient d'aiopppp)
  - analyse de Wladimir Palant          https://palant.info/2025/11/05/an-overview-of-the-pppp-protocol-for-iot-cameras/

Deux variantes sont gérées :
  - « JSON »   : paquets obfusqués (XOR), commandes JSON  (préfixes DGB, DGOK…)
  - « binaire »: paquets en clair, commandes binaires     (préfixes BATC, FTYC…)
"""

from __future__ import annotations

import json
import socket
import struct
import threading
import time
import urllib.parse

MAGIC = 0xF1
DISCOVERY_PORT = 32108

# Types de paquets
T_HELLO = 0x00
T_LAN_SEARCH = 0x30
T_PUNCH_PKT = 0x41
T_P2P_RDY = 0x42
T_DRW = 0xD0
T_DRW_ACK = 0xD1
T_ALIVE = 0xE0
T_ALIVE_ACK = 0xE1
T_CLOSE = 0xF0

CH_CMD, CH_VIDEO, CH_AUDIO = 0, 1, 2

VIDEO_MARKER = b"\x55\xaa\x15\xa8"
JPEG_SOI = b"\xff\xd8"

# Commandes binaires (valeurs écrites en petit-boutiste)
B_USER_CHK = 0x1020
B_USER_CHK_ACK = 0x1120
B_LIVEVIDEO_START = 0x3010
B_LIVEVIDEO_START_ACK = 0x3110
B_VIDEOPARAM_SET = 0x3018
B_DEST = {B_USER_CHK: 0x00FF}

# Commandes JSON
J_CHECK_USER, J_GET_PARMS, J_STREAM = 100, 101, 111
J_NAMES = {J_CHECK_USER: "check_user", J_GET_PARMS: "get_parms", J_STREAM: "stream"}

# Mots de passe d'usine fréquents pour ces caméras.
DEFAULT_PASSWORDS = ["6666", "", "admin", "888888", "123456", "12345678"]


class PPPPError(Exception):
    pass


# --------------------------------------------------------------------------- #
#  Obfuscation « XOR1 »                                                       #
# --------------------------------------------------------------------------- #

XOR_TABLE = bytes([
    0x7c, 0x9c, 0xe8, 0x4a, 0x13, 0xde, 0xdc, 0xb2, 0x2f, 0x21, 0x23, 0xe4, 0x30, 0x7b, 0x3d, 0x8c,
    0xbc, 0x0b, 0x27, 0x0c, 0x3c, 0xf7, 0x9a, 0xe7, 0x08, 0x71, 0x96, 0x00, 0x97, 0x85, 0xef, 0xc1,
    0x1f, 0xc4, 0xdb, 0xa1, 0xc2, 0xeb, 0xd9, 0x01, 0xfa, 0xba, 0x3b, 0x05, 0xb8, 0x15, 0x87, 0x83,
    0x28, 0x72, 0xd1, 0x8b, 0x5a, 0xd6, 0xda, 0x93, 0x58, 0xfe, 0xaa, 0xcc, 0x6e, 0x1b, 0xf0, 0xa3,
    0x88, 0xab, 0x43, 0xc0, 0x0d, 0xb5, 0x45, 0x38, 0x4f, 0x50, 0x22, 0x66, 0x20, 0x7f, 0x07, 0x5b,
    0x14, 0x98, 0x1d, 0x9b, 0xa7, 0x2a, 0xb9, 0xa8, 0xcb, 0xf1, 0xfc, 0x49, 0x47, 0x06, 0x3e, 0xb1,
    0x0e, 0x04, 0x3a, 0x94, 0x5e, 0xee, 0x54, 0x11, 0x34, 0xdd, 0x4d, 0xf9, 0xec, 0xc7, 0xc9, 0xe3,
    0x78, 0x1a, 0x6f, 0x70, 0x6b, 0xa4, 0xbd, 0xa9, 0x5d, 0xd5, 0xf8, 0xe5, 0xbb, 0x26, 0xaf, 0x42,
    0x37, 0xd8, 0xe1, 0x02, 0x0a, 0xae, 0x5f, 0x1c, 0xc5, 0x73, 0x09, 0x4e, 0x69, 0x24, 0x90, 0x6d,
    0x12, 0xb3, 0x19, 0xad, 0x74, 0x8a, 0x29, 0x40, 0xf5, 0x2d, 0xbe, 0xa5, 0x59, 0xe0, 0xf4, 0x79,
    0xd2, 0x4b, 0xce, 0x89, 0x82, 0x48, 0x84, 0x25, 0xc6, 0x91, 0x2b, 0xa2, 0xfb, 0x8f, 0xe9, 0xa6,
    0xb0, 0x9e, 0x3f, 0x65, 0xf6, 0x03, 0x31, 0x2e, 0xac, 0x0f, 0x95, 0x2c, 0x5c, 0xed, 0x39, 0xb7,
    0x33, 0x6c, 0x56, 0x7e, 0xb4, 0xa0, 0xfd, 0x7a, 0x81, 0x53, 0x51, 0x86, 0x8d, 0x9f, 0x77, 0xff,
    0x6a, 0x80, 0xdf, 0xe2, 0xbf, 0x10, 0xd7, 0x75, 0x64, 0x57, 0x76, 0xf3, 0x55, 0xcd, 0xd0, 0xc8,
    0x18, 0xe6, 0x36, 0x41, 0x62, 0xcf, 0x99, 0xf2, 0x32, 0x4c, 0x67, 0x60, 0x61, 0x92, 0xca, 0xd3,
    0xea, 0x63, 0x7d, 0x16, 0xb6, 0x8e, 0xd4, 0x68, 0x35, 0xc3, 0x52, 0x9d, 0x46, 0x44, 0x1e, 0x17,
])
XOR_KEY = (0x69, 0x97, 0xCC, 0x19)


def xor_decode(data: bytes) -> bytes:
    out = bytearray(len(data))
    prev = 0
    for i, b in enumerate(data):
        out[i] = b ^ XOR_TABLE[(XOR_KEY[prev & 3] + prev) & 0xFF]
        prev = b
    return bytes(out)


def xor_encode(data: bytes) -> bytes:
    out = bytearray(len(data))
    prev = 0
    for i, b in enumerate(data):
        out[i] = b ^ XOR_TABLE[(XOR_KEY[prev & 3] + prev) & 0xFF]
        prev = out[i]
    return bytes(out)


ENCODINGS = {
    "plain": (lambda d: d, lambda d: d),
    "xor": (xor_decode, xor_encode),
}


def xq_encode(data: bytes, shift: int = 4) -> bytes:
    b = bytes(x - 1 if x & 1 else x + 1 for x in data)
    return b[shift:] + b[:shift]


def xq_decode(data: bytes, shift: int = 4) -> bytes:
    b = bytes(x - 1 if x & 1 else x + 1 for x in data)
    return b[-shift:] + b[:-shift]


# --------------------------------------------------------------------------- #
#  Paquets                                                                    #
# --------------------------------------------------------------------------- #

def packet(ptype: int, payload: bytes = b"") -> bytes:
    return struct.pack(">BBH", MAGIC, ptype, len(payload)) + payload


def parse(data: bytes) -> tuple[int, bytes] | None:
    if len(data) < 4 or data[0] != MAGIC:
        return None
    return data[1], data[4:]


class DeviceInfo:
    def __init__(self, addr: str, port: int, prefix: str, serial: int, suffix: str,
                 encoding: str, raw_id: bytes):
        self.addr, self.port = addr, port
        self.prefix, self.serial, self.suffix = prefix, serial, suffix
        self.encoding = encoding
        self.raw_id = raw_id  # charge utile du PunchPkt, renvoyée telle quelle

    @property
    def dev_id(self) -> str:
        return f"{self.prefix}-{self.serial:06d}-{self.suffix}"

    @property
    def is_json(self) -> bool:
        return self.encoding != "plain"

    def __repr__(self) -> str:
        kind = "JSON" if self.is_json else "binaire"
        return f"{self.dev_id} @ {self.addr}:{self.port} ({kind})"


def parse_punch(payload: bytes, addr, encoding: str) -> DeviceInfo | None:
    if len(payload) < 12:
        return None
    prefix = payload[:4].split(b"\0")[0].decode("ascii", "ignore")
    serial = struct.unpack(">Q", payload[4:12])[0]
    suffix = payload[12:20].split(b"\0")[0].decode("ascii", "ignore")
    return DeviceInfo(addr[0], addr[1], prefix, serial, suffix, encoding, payload[:20])


def discover(targets: list[str], timeout: float = 3.0, port: int = DISCOVERY_PORT) -> list[DeviceInfo]:
    """Envoie une recherche LAN (en clair et obfusquée) et collecte les caméras."""
    found: dict[tuple[str, str], DeviceInfo] = {}
    probes = [enc(packet(T_LAN_SEARCH)) for _, enc in ENCODINGS.values()]
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        s.bind(("", 0))
        s.settimeout(0.25)
    except OSError:
        return []
    end = time.time() + timeout
    next_send = 0.0
    try:
        while time.time() < end:
            if time.time() >= next_send:
                for t in targets:
                    for p in probes:
                        try:
                            s.sendto(p, (t, port))
                        except OSError:
                            pass
                next_send = time.time() + 1.0
            try:
                data, addr = s.recvfrom(2048)
            except socket.timeout:
                continue
            except OSError:
                break
            for name, (dec, _) in ENCODINGS.items():
                p = parse(dec(data))
                if p and p[0] == T_PUNCH_PKT:
                    dev = parse_punch(p[1], addr, name)
                    if dev:
                        found.setdefault((addr[0], dev.dev_id), dev)
                    break
    finally:
        s.close()
    return list(found.values())


# --------------------------------------------------------------------------- #
#  Session                                                                    #
# --------------------------------------------------------------------------- #

class Session:
    def __init__(self, dev: DeviceInfo, user: str = "admin", password: str | None = None,
                 log=print):
        self.dev = dev
        self.user = user or "admin"
        self.password = password
        self.log = log
        self._dec, self._enc = ENCODINGS[dev.encoding]
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.settimeout(0.5)
        self.sock.bind(("", 0))
        self.out_idx = 0
        self.ticket = b"\0\0\0\0"
        self.ready = threading.Event()
        self.closed = threading.Event()
        self.last_rx = time.time()
        self.last_video = 0.0
        self._lock = threading.Lock()
        self._responses: dict[int, object] = {}
        self._resp_cond = threading.Condition()
        # Vidéo
        self._chunks: dict[int, bytes] = {}
        self._starts: set[int] = set()
        self._unwrap_base = 0
        self._last_raw_idx: int | None = None
        self._last_frame_start = -1
        self.frame_cond = threading.Condition()
        self.frame: bytes | None = None
        self.frame_no = 0
        self._rx = threading.Thread(target=self._rx_loop, daemon=True)

    # -- envoi -------------------------------------------------------------- #
    def send(self, ptype: int, payload: bytes = b"") -> None:
        try:
            self.sock.sendto(self._enc(packet(ptype, payload)), (self.dev.addr, self.dev.port))
        except OSError:
            pass

    def send_drw(self, channel: int, data: bytes) -> int:
        with self._lock:
            idx = self.out_idx
            self.out_idx = (self.out_idx + 1) & 0xFFFF
        self.send(T_DRW, struct.pack(">BBH", 0xD1, channel, idx) + data)
        return idx

    def send_json(self, cmd: int, **kw) -> None:
        body = {"pro": J_NAMES.get(cmd, ""), "cmd": cmd, **kw,
                "user": self.user, "pwd": self.password or "", "devmac": "0000"}
        js = json.dumps(body).encode()
        self.send_drw(CH_CMD, b"\x06\x0a\xa0\x80" + struct.pack("<I", len(js)) + js)

    def send_bin(self, cmd: int, payload: bytes = b"") -> None:
        data = struct.pack("<2s3H", b"\x11\x0a", cmd, len(payload) + 4, B_DEST.get(cmd, 0))
        data += self.ticket + (xq_encode(payload) if payload else b"")
        self.send_drw(CH_CMD, data)

    # -- réception ---------------------------------------------------------- #
    def _rx_loop(self) -> None:
        while not self.closed.is_set():
            try:
                data, addr = self.sock.recvfrom(4096)
            except socket.timeout:
                continue
            except OSError:
                break
            if addr[0] != self.dev.addr:
                continue
            p = parse(self._dec(data))
            if not p:
                continue
            ptype, payload = p
            if ptype not in (T_ALIVE, T_ALIVE_ACK):
                self.last_rx = time.time()
            if ptype == T_P2P_RDY:
                self.ready.set()
            elif ptype == T_ALIVE:
                self.send(T_ALIVE_ACK)
            elif ptype == T_DRW and len(payload) >= 4:
                _, ch, idx = struct.unpack(">BBH", payload[:4])
                self.send(T_DRW_ACK, struct.pack(">BBHH", 0xD2, ch, 1, idx))
                body = payload[4:]
                if ch == CH_CMD:
                    self._on_command(body)
                elif ch == CH_VIDEO:
                    self._on_video(idx, body)
            elif ptype == T_CLOSE:
                self.closed.set()

    def _on_command(self, body: bytes) -> None:
        key, value = None, None
        if body[:2] == b"\x06\x0a":
            try:
                value = json.loads(body[8:].split(b"\0")[0].decode("utf-8", "ignore"))
                key = ("json", int(value.get("cmd", -1)))
            except (ValueError, AttributeError):
                return
        elif body[:2] == b"\x11\x0a" and len(body) >= 12:
            _, cmd, _, _ = struct.unpack("<2s3H", body[:8])
            rest = body[12:]
            value = xq_decode(rest) if rest else b""
            key = ("bin", cmd)
            if cmd == B_USER_CHK_ACK and len(value) >= 8:
                self.ticket = value[4:8]
        if key:
            with self._resp_cond:
                self._responses[key] = value
                self._resp_cond.notify_all()

    def wait_response(self, key, timeout: float = 3.0):
        end = time.time() + timeout
        with self._resp_cond:
            while key not in self._responses:
                left = end - time.time()
                if left <= 0 or self.closed.is_set():
                    return None
                self._resp_cond.wait(left)
            return self._responses.pop(key)

    def _unwrap(self, idx: int) -> int:
        if self._last_raw_idx is not None:
            if idx < 0x1000 and self._last_raw_idx > 0xF000:
                self._unwrap_base += 0x10000
            elif idx > 0xF000 and self._last_raw_idx < 0x1000 and self._unwrap_base:
                return self._unwrap_base - 0x10000 + idx  # paquet retardé
        self._last_raw_idx = idx
        return self._unwrap_base + idx

    def _on_video(self, raw_idx: int, body: bytes) -> None:
        self.last_video = time.time()
        idx = self._unwrap(raw_idx)
        if body.startswith(VIDEO_MARKER):
            if len(body) > 4 and body[4] == 0x06:  # trame audio intercalée
                self._chunks[idx] = b""
                return
            self._chunks[idx] = body[0x20:]
            self._starts.add(idx)
        else:
            self._chunks[idx] = body
            if body.startswith(JPEG_SOI + b"\xff"):
                self._starts.add(idx)
        self._assemble()

    def _assemble(self) -> None:
        starts = sorted(s for s in self._starts if s > self._last_frame_start)
        if len(starts) < 2:
            return
        # On part de l'image complète la plus récente.
        for a, b in reversed(list(zip(starts, starts[1:]))):
            if all(i in self._chunks for i in range(a, b)):
                data = b"".join(self._chunks[i] for i in range(a, b))
                self._last_frame_start = a
                with self.frame_cond:
                    self.frame = data
                    self.frame_no += 1
                    self.frame_cond.notify_all()
                break
        # Ménage : on oublie ce qui précède le dernier début d'image.
        keep_from = starts[-1] if len(starts) > 4 else self._last_frame_start
        for i in [i for i in self._chunks if i < keep_from]:
            del self._chunks[i]
        self._starts = {s for s in self._starts if s >= keep_from}

    # -- cycle de vie ------------------------------------------------------- #
    def connect(self, timeout: float = 8.0) -> None:
        self._rx.start()
        end = time.time() + timeout
        while not self.ready.is_set() and time.time() < end:
            self.send(T_PUNCH_PKT, self.dev.raw_id)
            if not self.dev.is_json:
                self.send(T_P2P_RDY, self.dev.raw_id)
            self.ready.wait(0.5)
        if not self.ready.is_set():
            self.close()
            raise PPPPError("la caméra ne répond pas à la demande de connexion")
        if self.dev.is_json:
            self._login_json()
        else:
            self._login_bin()
        threading.Thread(target=self._keepalive, daemon=True).start()

    def _passwords(self) -> list[str]:
        return [self.password] if self.password is not None else DEFAULT_PASSWORDS

    def _login_json(self) -> None:
        last = None
        for pwd in self._passwords():
            self.password = pwd
            for _ in range(3):
                self.send_json(J_CHECK_USER)
                last = self.wait_response(("json", J_CHECK_USER), 2.0)
                if last is not None:
                    break
            if last is None:
                raise PPPPError("pas de réponse à l'identification")
            if int(last.get("result", -1)) == 0:
                self.log(f"     identification OK (utilisateur « {self.user} »)")
                self.send_json(J_GET_PARMS)
                self.start_video()
                return
        raise PPPPError(f"mot de passe refusé ({last}). Utilisez --user/--password "
                        f"avec le mot de passe défini dans l'application.")

    def _login_bin(self) -> None:
        pwd = self.password if self.password is not None else "admin"
        payload = struct.pack(">32s128s", self.user.encode(), pwd.encode())
        self.send_bin(B_USER_CHK, payload)
        if self.wait_response(("bin", B_USER_CHK_ACK), 3.0) is None:
            self.log("     (pas de réponse à l'identification, on tente quand même la vidéo)")
        self.start_video()

    def start_video(self) -> None:
        self.last_video = time.time()
        if self.dev.is_json:
            self.send_json(J_STREAM, video=1)
        else:
            self.send_bin(B_VIDEOPARAM_SET, struct.pack("<II", 1, 2))  # résolution HD
            self.send_bin(B_LIVEVIDEO_START)

    def _keepalive(self) -> None:
        while not self.closed.wait(1.0):
            now = time.time()
            if now - self.last_rx > 1.0:
                self.send(T_ALIVE)
            if now - self.last_rx > 12:
                self.closed.set()
            elif now - self.last_video > 5:
                self.start_video()  # le flux s'est arrêté : on le redemande

    def wait_frame(self, last_no: int, timeout: float = 5.0) -> tuple[int, bytes | None]:
        end = time.time() + timeout
        with self.frame_cond:
            while self.frame_no == last_no and not self.closed.is_set():
                left = end - time.time()
                if left <= 0:
                    break
                self.frame_cond.wait(left)
            return self.frame_no, self.frame

    def close(self) -> None:
        if not self.closed.is_set():
            self.send(T_CLOSE)
        self.closed.set()
        try:
            self.sock.close()
        except OSError:
            pass


# --------------------------------------------------------------------------- #
#  Interface compatible avec cv2.VideoCapture                                 #
# --------------------------------------------------------------------------- #

class PPPPCapture:
    """Ouvre « pppp://[utilisateur[:motdepasse]@]adresse » ; read() renvoie des images."""

    def __init__(self, url: str, log=print):
        import cv2  # import local : pppp.py reste utilisable sans OpenCV
        import numpy as np
        self._cv2, self._np = cv2, np
        p = urllib.parse.urlsplit(url)
        self.host = p.hostname or ""
        user = urllib.parse.unquote(p.username) if p.username else "admin"
        pwd = urllib.parse.unquote(p.password) if p.password is not None else None
        self.session: Session | None = None
        self._last_no = 0
        self._warned = False
        self.log = log
        devs = [d for d in discover([self.host], timeout=4) if d.addr == self.host] or \
            discover([self.host, "255.255.255.255"], timeout=3)
        if not devs:
            log(f"PPPP : aucune caméra ne répond sur {self.host}")
            return
        dev = devs[0]
        try:
            s = Session(dev, user, pwd, log=log)
            s.connect()
            self.session = s
        except PPPPError as e:
            log(f"PPPP : {e}")

    def isOpened(self) -> bool:  # noqa: N802
        return self.session is not None and not self.session.closed.is_set()

    def read(self):
        if not self.isOpened():
            return False, None
        no, data = self.session.wait_frame(self._last_no, 5.0)
        if no == self._last_no or data is None:
            return False, None
        self._last_no = no
        img = self._cv2.imdecode(self._np.frombuffer(data, self._np.uint8),
                                 self._cv2.IMREAD_COLOR)
        if img is None and not self._warned:
            self._warned = True
            self.log(f"PPPP : format d'image inconnu (début : {data[:16].hex(' ')})")
        return img is not None, img

    def set(self, *_):
        return False

    def release(self) -> None:
        if self.session:
            self.session.close()
            self.session = None
