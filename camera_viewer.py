#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Visionneuse de caméra IP en direct — sans l'application du fabricant,
sans Internet, sans box/routeur.

Principe : l'ordinateur se connecte directement au point d'accès Wi-Fi
émis par la caméra (ou par câble Ethernet si la caméra en a un). Le
logiciel trouve tout seul la caméra sur ce petit réseau local, devine
l'adresse du flux vidéo (RTSP, MJPEG/HTTP ou ONVIF) et l'affiche en direct.

Utilisation rapide :
    python camera_viewer.py                 # recherche automatique puis affichage
    python camera_viewer.py --ip 192.168.1.1 --user admin --password 1234
    python camera_viewer.py --url rtsp://admin:1234@192.168.1.1:554/live
    python camera_viewer.py --scan          # recherche seulement, sans affichage

Touches dans la fenêtre vidéo :
    Q / Échap  quitter
    S          capture d'écran (photo JPG)
    R          démarrer / arrêter l'enregistrement vidéo
    F          plein écran on/off
"""

from __future__ import annotations

import argparse
import base64
import collections
import datetime as _dt
import errno
import hashlib
import ipaddress
import json
import os
import re
import platform
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# Options FFmpeg pour une latence minimale. Doit être défini AVANT l'import de cv2.
os.environ.setdefault(
    "OPENCV_FFMPEG_CAPTURE_OPTIONS",
    "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay|max_delay;500000",
)

try:
    import cv2  # noqa: E402
except ImportError:  # pragma: no cover - message pour l'utilisateur
    print("OpenCV n'est pas installé. Lancez :  pip install -r requirements.txt")
    sys.exit(1)

IS_MAC = sys.platform == "darwin"
IS_WIN = sys.platform.startswith("win")


def _raise_file_limit() -> int:
    """macOS limite à 256 fichiers ouverts : trop peu pour scanner vite le réseau."""
    try:
        import resource
        soft, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
        want = 4096 if hard == resource.RLIM_INFINITY else min(4096, hard)
        if soft < want:
            resource.setrlimit(resource.RLIMIT_NOFILE, (want, hard))
            soft = want
        return soft
    except Exception:
        return 512 if IS_WIN else 256


MAX_WORKERS = max(32, min(400, _raise_file_limit() - 64))

APP_DIR = Path(__file__).resolve().parent
CONFIG_FILE = APP_DIR / "camera_config.json"
CAPTURE_DIR = APP_DIR / "captures"

# --------------------------------------------------------------------------- #
#  Connaissances sur les caméras courantes                                    #
# --------------------------------------------------------------------------- #

# Ports à tester sur chaque appareil du réseau.
RTSP_PORTS = [554, 8554, 10554, 5544, 8080, 88]
HTTP_PORTS = [80, 81, 8080, 8081, 8000, 88, 5000]
ONVIF_PORTS = [80, 8000, 8080, 8899, 2020, 5000]
ALL_PORTS = sorted(set(RTSP_PORTS + HTTP_PORTS + ONVIF_PORTS))

# Chemins RTSP fréquents (mini-caméras Wi-Fi, Hikvision, Dahua, Tapo, Reolink,
# Wansview, Foscam, caméras « V380 / YI / HiSilicon », etc.).
RTSP_PATHS = [
    "",
    "live",
    "live/ch00_0",
    "live/ch00_1",
    "live/ch0",
    "live/main",
    "onvif1",
    "onvif2",
    "11",
    "12",
    "1",
    "0",
    "stream1",
    "stream2",
    "stream0",
    "h264",
    "h264_stream",
    "h264/ch1/main/av_stream",
    "ch0_0.h264",
    "ch01.264",
    "av0_0",
    "live.sdp",
    "video.h264",
    "videoMain",
    "media/video1",
    "unicast",
    "Streaming/Channels/101",
    "Streaming/Channels/102",
    "cam/realmonitor?channel=1&subtype=0",
    "cam/realmonitor?channel=1&subtype=1",
    "h264Preview_01_main",
    "h264Preview_01_sub",
    "user={user}&password={password}&channel=1&stream=0.sdp?",
]

# Chemins HTTP qui renvoient un flux MJPEG ou une image JPEG.
HTTP_PATHS = [
    "stream",                       # ESP32-CAM (port 81)
    "?action=stream",               # mjpg-streamer
    "video",
    "mjpeg",
    "mjpg/video.mjpg",
    "video.mjpg",
    "video.cgi",
    "videostream.cgi",
    "videostream.cgi?user={user}&pwd={password}",
    "videostream.asf?user={user}&pwd={password}",
    "cgi-bin/mjpg/video.cgi",
    "mjpg/1/video.mjpg",
    "axis-cgi/mjpg/video.cgi",
    "nphMotionJpeg?Resolution=640x480",
    "video.mjpeg",
    "livestream",
    "live",
    "capture",                      # ESP32-CAM (image fixe, rafraîchie en boucle)
    "snapshot.cgi?user={user}&pwd={password}",
    "snapshot.jpg",
    "shot.jpg",                     # IP Webcam (Android)
    "image.jpg",
    "jpg/image.jpg",
]

# Identifiants usine les plus répandus, essayés si aucun n'est fourni.
DEFAULT_CREDENTIALS = [
    ("", ""),
    ("admin", ""),
    ("admin", "admin"),
    ("admin", "123456"),
    ("admin", "12345"),
    ("admin", "888888"),
    ("admin", "password"),
    ("root", ""),
    ("user", "user"),
]

# Adresses habituelles d'une caméra en mode point d'accès Wi-Fi.
TYPICAL_AP_IPS = [
    "192.168.1.1",
    "192.168.4.1",       # ESP32-CAM
    "192.168.0.1",
    "192.168.10.1",
    "192.168.8.1",
    "192.168.100.1",
    "192.168.169.1",
    "192.168.1.254",
    "10.10.10.1",
    "172.16.0.1",
    "192.168.234.1",
    "192.168.25.1",
]


def log(msg: str) -> None:
    print(msg, flush=True)


# --------------------------------------------------------------------------- #
#  Réseau local                                                               #
# --------------------------------------------------------------------------- #

def local_ipv4_addresses() -> list[str]:
    """Adresses IPv4 de cet ordinateur (hors 127.x)."""
    ips: set[str] = set()
    # Méthode 1 : "connexion" UDP fictive (aucun paquet n'est envoyé).
    for target in ("192.168.1.1", "10.255.255.255", "8.8.8.8"):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect((target, 1))
                ips.add(s.getsockname()[0])
        except OSError:
            pass
    # Méthode 2 : résolution du nom de la machine.
    try:
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            ips.add(ip)
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith(("127.", "0.", "169.254.")))


def candidate_hosts() -> list[str]:
    """Liste ordonnée des adresses à sonder : passerelle probable d'abord."""
    hosts: list[str] = []
    for ip in local_ipv4_addresses():
        net = ipaddress.ip_network(f"{ip}/24", strict=False)
        prio = [str(net.network_address + 1), str(net.network_address + 254)]
        for h in prio + [str(h) for h in net.hosts()]:
            if h != ip and h not in hosts:
                hosts.append(h)
    for h in TYPICAL_AP_IPS:
        if h not in hosts:
            hosts.append(h)
    return hosts


def tcp_check(host: str, port: int, timeout: float = 0.6) -> str:
    """'open', 'refused' (appareil présent, port fermé), 'timeout' ou 'err:<errno>'."""
    for _ in range(3):
        try:
            with socket.create_connection((host, port), timeout=timeout):
                return "open"
        except ConnectionRefusedError:
            return "refused"
        except socket.timeout:
            return "timeout"
        except OSError as e:
            if e.errno == errno.EMFILE:  # trop de fichiers ouverts : on réessaie
                time.sleep(0.2)
                continue
            return f"err:{e.errno}"
    return "timeout"


def port_open(host: str, port: int, timeout: float = 0.6) -> bool:
    return tcp_check(host, port, timeout) == "open"


SCAN_ERRORS: collections.Counter = collections.Counter()


def scan_network(hosts: list[str], ports: list[int], timeout: float = 0.6,
                 alive: set[str] | None = None) -> dict[str, list[int]]:
    """Retourne {hôte: [ports ouverts]}. Les hôtes qui répondent (même port
    fermé) sont ajoutés à `alive`."""
    found: dict[str, list[int]] = {}
    lock = threading.Lock()

    def probe(hp: tuple[str, int]) -> None:
        h, p = hp
        st = tcp_check(h, p, timeout)
        with lock:
            if st == "open":
                found.setdefault(h, []).append(p)
            if st in ("open", "refused") and alive is not None:
                alive.add(h)
            if st.startswith("err:"):
                SCAN_ERRORS[st] += 1

    pairs = [(h, p) for h in hosts for p in ports]
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        list(ex.map(probe, pairs))
    for h in found:
        found[h].sort()
    # Garder l'ordre de priorité des hôtes.
    return {h: found[h] for h in hosts if h in found}


# --------------------------------------------------------------------------- #
#  ONVIF (WS-Discovery + GetStreamUri)                                        #
# --------------------------------------------------------------------------- #

_PROBE = """<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
 xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
 xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
 xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
<e:Header><w:MessageID>uuid:{id}</w:MessageID>
<w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
<w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
</e:Header><e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body>
</e:Envelope>"""


def onvif_discover(timeout: float = 2.5) -> list[str]:
    """Diffuse une requête WS-Discovery ; renvoie les URL de service ONVIF."""
    xaddrs: list[str] = []
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
        sock.settimeout(timeout)
        sock.sendto(_PROBE.format(id=uuid.uuid4()).encode(), ("239.255.255.250", 3702))
        end = time.time() + timeout
        while time.time() < end:
            try:
                data, _ = sock.recvfrom(65535)
            except socket.timeout:
                break
            for m in re.findall(r"XAddrs>([^<]+)<", data.decode(errors="ignore")):
                for url in m.split():
                    if url.startswith("http") and url not in xaddrs:
                        xaddrs.append(url)
        sock.close()
    except OSError:
        pass
    return xaddrs


def _wsse_header(user: str, password: str) -> str:
    if not user:
        return ""
    nonce = os.urandom(16)
    created = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    digest = base64.b64encode(
        hashlib.sha1(nonce + created.encode() + password.encode()).digest()
    ).decode()
    return (
        '<s:Header><Security s:mustUnderstand="1" xmlns="http://docs.oasis-open.org/wss/'
        '2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"><UsernameToken>'
        f"<Username>{user}</Username>"
        '<Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-'
        f'username-token-profile-1.0#PasswordDigest">{digest}</Password>'
        '<Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-'
        f'soap-message-security-1.0#Base64Binary">{base64.b64encode(nonce).decode()}</Nonce>'
        '<Created xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-'
        f'wssecurity-utility-1.0.xsd">{created}</Created>'
        "</UsernameToken></Security></s:Header>"
    )


def _soap(url: str, body: str, user: str, password: str, timeout: float = 4) -> str | None:
    env = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" '
        'xmlns:tds="http://www.onvif.org/ver10/device/wsdl" '
        'xmlns:trt="http://www.onvif.org/ver10/media/wsdl" '
        'xmlns:tt="http://www.onvif.org/ver10/schema">'
        f"{_wsse_header(user, password)}<s:Body>{body}</s:Body></s:Envelope>"
    )
    req = urllib.request.Request(
        url, data=env.encode(), headers={"Content-Type": "application/soap+xml; charset=utf-8"}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode(errors="ignore")
    except urllib.error.HTTPError as e:
        try:
            return e.read().decode(errors="ignore") if e.code == 500 else None
        except Exception:
            return None
    except (OSError, ValueError):
        return None


def onvif_stream_uris(device_url: str, creds: list[tuple[str, str]]) -> list[tuple[str, str, str]]:
    """Interroge le service ONVIF pour obtenir les adresses RTSP officielles.

    Renvoie [(uri, user, password), ...].
    """
    results: list[tuple[str, str, str]] = []
    for user, pwd in creds:
        caps = _soap(device_url, '<tds:GetCapabilities><tds:Category>Media</tds:Category>'
                                 '</tds:GetCapabilities>', user, pwd)
        if not caps or "NotAuthorized" in caps or "Fault" in caps and "XAddr" not in caps:
            continue
        m = re.search(r"Media>.*?XAddr>([^<]+)<", caps, re.S)
        media_url = m.group(1).strip() if m else device_url
        profiles = _soap(media_url, "<trt:GetProfiles/>", user, pwd) or ""
        tokens = re.findall(r'Profiles[^>]*token="([^"]+)"', profiles)
        for tok in tokens:
            resp = _soap(
                media_url,
                "<trt:GetStreamUri><trt:StreamSetup><tt:Stream>RTP-Unicast</tt:Stream>"
                "<tt:Transport><tt:Protocol>RTSP</tt:Protocol></tt:Transport></trt:StreamSetup>"
                f"<trt:ProfileToken>{tok}</trt:ProfileToken></trt:GetStreamUri>",
                user, pwd,
            ) or ""
            m = re.search(r"Uri>([^<]+)<", resp)
            if m:
                uri = m.group(1).strip().replace("&amp;", "&")
                results.append((uri, user, pwd))
        if results:
            break
    return results


# --------------------------------------------------------------------------- #
#  Sondes RTSP / HTTP rapides (sans ouvrir la vidéo)                          #
# --------------------------------------------------------------------------- #

def _digest_auth(www: str, method: str, uri: str, user: str, pwd: str) -> str:
    fields = dict(re.findall(r'(\w+)="?([^",]*)"?', www))
    realm, nonce = fields.get("realm", ""), fields.get("nonce", "")
    ha1 = hashlib.md5(f"{user}:{realm}:{pwd}".encode()).hexdigest()
    ha2 = hashlib.md5(f"{method}:{uri}".encode()).hexdigest()
    resp = hashlib.md5(f"{ha1}:{nonce}:{ha2}".encode()).hexdigest()
    return (f'Digest username="{user}", realm="{realm}", nonce="{nonce}", '
            f'uri="{uri}", response="{resp}"')


def rtsp_describe(host: str, port: int, path: str, user: str, pwd: str,
                  timeout: float = 2.5) -> int | None:
    """Envoie un DESCRIBE RTSP. Renvoie le code de réponse (200, 401, 404…)."""
    uri = f"rtsp://{host}:{port}/{path}"
    auth_header = ""
    for attempt in range(2):
        try:
            with socket.create_connection((host, port), timeout=timeout) as s:
                s.settimeout(timeout)
                req = (f"DESCRIBE {uri} RTSP/1.0\r\nCSeq: {attempt + 2}\r\n"
                       f"Accept: application/sdp\r\nUser-Agent: CamViewer\r\n"
                       f"{auth_header}\r\n")
                s.sendall(req.encode())
                data = b""
                while b"\r\n\r\n" not in data and len(data) < 8192:
                    chunk = s.recv(4096)
                    if not chunk:
                        break
                    data += chunk
        except OSError:
            return None
        text = data.decode(errors="ignore")
        m = re.match(r"RTSP/1\.\d (\d{3})", text)
        if not m:
            return None
        code = int(m.group(1))
        if code == 401 and attempt == 0 and user:
            www = re.search(r"WWW-Authenticate:\s*(.+)", text, re.I)
            if not www:
                return code
            www_val = www.group(1).strip()
            if www_val.lower().startswith("digest"):
                auth_header = f"Authorization: {_digest_auth(www_val, 'DESCRIBE', uri, user, pwd)}\r\n"
            else:
                token = base64.b64encode(f"{user}:{pwd}".encode()).decode()
                auth_header = f"Authorization: Basic {token}\r\n"
            continue
        return code
    return None


def http_probe(url: str, user: str, pwd: str, timeout: float = 2.5) -> str | None:
    """Renvoie 'mjpeg', 'jpeg' ou None selon ce que sert l'URL HTTP."""
    handlers = []
    if user:
        mgr = urllib.request.HTTPPasswordMgrWithDefaultRealm()
        mgr.add_password(None, url, user, pwd)
        handlers += [urllib.request.HTTPBasicAuthHandler(mgr),
                     urllib.request.HTTPDigestAuthHandler(mgr)]
    opener = urllib.request.build_opener(*handlers)
    try:
        with opener.open(url, timeout=timeout) as r:
            ctype = (r.headers.get("Content-Type") or "").lower()
            head = r.read(4)
    except (OSError, ValueError, urllib.error.HTTPError):
        return None
    except Exception:
        return None
    if "multipart" in ctype:
        return "mjpeg"
    if ctype.startswith("image/jpeg") or head[:2] == b"\xff\xd8":
        return "jpeg"
    return None


def with_auth(url: str, user: str, pwd: str) -> str:
    if not user:
        return url
    p = urllib.parse.urlsplit(url)
    if p.username:
        return url
    cred = urllib.parse.quote(user, safe="")
    if pwd:
        cred += ":" + urllib.parse.quote(pwd, safe="")
    return urllib.parse.urlunsplit(p._replace(netloc=f"{cred}@{p.netloc}"))


def hide_password(url: str) -> str:
    return re.sub(r"(://[^:/@]+:)[^@]+@", r"\1****@", url)


# --------------------------------------------------------------------------- #
#  Recherche du flux                                                          #
# --------------------------------------------------------------------------- #

def find_streams(hosts_ports: dict[str, list[int]],
                 creds: list[tuple[str, str]],
                 stop_at_first: bool = True) -> list[dict]:
    """Essaie les chemins connus sur chaque hôte/port ouvert."""
    found: list[dict] = []

    def done() -> bool:
        return stop_at_first and bool(found)

    for host, ports in hosts_ports.items():
        log(f"  → {host}  (ports ouverts : {', '.join(map(str, ports))})")

        # 1) ONVIF : l'adresse officielle donnée par la caméra elle-même.
        for p in [p for p in ports if p in ONVIF_PORTS]:
            uris = onvif_stream_uris(f"http://{host}:{p}/onvif/device_service", creds)
            for uri, u, pw in uris:
                log(f"     ONVIF : {uri}")
                found.append({"url": with_auth(uri, u, pw), "type": "rtsp", "source": "onvif"})
            if done():
                return found

        # 2) RTSP
        for p in [p for p in ports if p in RTSP_PORTS]:
            if rtsp_describe(host, p, "", "", "") is None:
                continue  # ce port ne parle pas RTSP
            hit = False
            for user, pwd in creds:
                for path in RTSP_PATHS:
                    path_f = path.format(user=user, password=pwd)
                    code = rtsp_describe(host, p, path_f, user, pwd)
                    if code == 200:
                        url = with_auth(f"rtsp://{host}:{p}/{path_f}", user, pwd)
                        log(f"     RTSP trouvé : {hide_password(url)}")
                        found.append({"url": url, "type": "rtsp", "source": "rtsp"})
                        hit = True
                        if done():
                            return found
                        break
                    if code is None:
                        break
                if hit:
                    break

        # 3) HTTP / MJPEG
        for p in [p for p in ports if p in HTTP_PORTS]:
            for user, pwd in creds:
                hit = False
                for path in HTTP_PATHS:
                    path_f = path.format(user=user, password=pwd)
                    url = f"http://{host}:{p}/{path_f}"
                    kind = http_probe(url, user, pwd)
                    if kind:
                        full = with_auth(url, user, pwd) if "{user}" not in path else url
                        log(f"     HTTP {kind.upper()} trouvé : {hide_password(full)}")
                        found.append({"url": full, "type": kind, "source": "http"})
                        hit = True
                        if done():
                            return found
                        if kind == "mjpeg":
                            break
                if hit:
                    break
    return found


def discover(user: str | None, password: str | None, only_ip: str | None = None,
             stop_at_first: bool = True) -> list[dict]:
    creds = [(user, password or "")] if user is not None else DEFAULT_CREDENTIALS

    if only_ip:
        hosts = [only_ip]
        log(f"Analyse de la caméra {only_ip}…")
    else:
        my_ips = local_ipv4_addresses()
        if not my_ips:
            log("⚠  Aucune connexion réseau détectée. Connectez d'abord l'ordinateur au")
            log("   Wi-Fi de la caméra (ou branchez un câble Ethernet).")
        else:
            log(f"Adresse(s) de cet ordinateur : {', '.join(my_ips)}")
        hosts = candidate_hosts()

    log("Recherche ONVIF (WS-Discovery)…")
    onvif_hosts: list[str] = []
    for xaddr in onvif_discover():
        h = urllib.parse.urlsplit(xaddr).hostname
        log(f"  caméra ONVIF détectée : {xaddr}")
        if h and h not in onvif_hosts:
            onvif_hosts.append(h)
    hosts = onvif_hosts + [h for h in hosts if h not in onvif_hosts]

    log(f"Recherche des appareils sur le réseau ({len(hosts)} adresses)…")
    t0 = time.time()
    alive: set[str] = set()
    hp = scan_network(hosts, ALL_PORTS, alive=alive)
    others = [h for h in hosts if h in alive and h not in hp]
    log(f"  {len(hp)} appareil(s) avec un port vidéo en {time.time() - t0:.1f} s"
        + (f" ; autre(s) appareil(s) présent(s) : {', '.join(others)}" if others else ""))
    if SCAN_ERRORS:
        log(f"  erreurs réseau : {dict(SCAN_ERRORS)}")
    if not hp:
        return []

    log("Recherche du flux vidéo…")
    return find_streams(hp, creds, stop_at_first=stop_at_first)


# --------------------------------------------------------------------------- #
#  Diagnostic : pourquoi la caméra n'est pas trouvée ?                        #
# --------------------------------------------------------------------------- #

def _run(cmd: list[str], timeout: float = 8) -> str:
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout,
                              errors="ignore").stdout
    except Exception:
        return ""


def default_gateway() -> str | None:
    if IS_MAC:
        m = re.search(r"gateway:\s*([\d.]+)", _run(["route", "-n", "get", "default"]))
    elif IS_WIN:
        m = re.search(r"(?:Gateway|Passerelle)[^:\r\n]*:\s*([\d.]+)", _run(["ipconfig"]))
    else:
        m = re.search(r"default via ([\d.]+)", _run(["ip", "route", "show", "default"]))
    if m:
        return m.group(1)
    ips = local_ipv4_addresses()
    return str(ipaddress.ip_network(f"{ips[0]}/24", strict=False).network_address + 1) if ips else None


def ping(host: str) -> bool:
    if IS_WIN:
        cmd = ["ping", "-n", "2", "-w", "1000", host]
    elif IS_MAC:
        cmd = ["ping", "-c", "2", "-t", "3", host]
    else:
        cmd = ["ping", "-c", "2", "-w", "3", host]
    out = _run(cmd, 6)
    return bool(re.search(r"ttl[=:]", out, re.I))


def arp_entry(host: str) -> str:
    out = _run(["arp", "-a", host] if IS_WIN else ["arp", "-n", host], 5)
    m = re.search(r"([0-9a-fA-F]{1,2}[:-]){5}[0-9a-fA-F]{1,2}", out)
    return m.group(0) if m else ""


def full_port_scan(host: str, timeout: float = 0.5) -> tuple[list[int], collections.Counter]:
    """Teste les 65535 ports TCP d'un appareil."""
    opened: list[int] = []
    stats: collections.Counter = collections.Counter()
    lock = threading.Lock()
    done = [0]

    def probe(port: int) -> None:
        st = tcp_check(host, port, timeout)
        with lock:
            stats[st] += 1
            if st == "open":
                opened.append(port)
                log(f"     port TCP ouvert : {port}")
            done[0] += 1
            if done[0] % 8192 == 0:
                log(f"     … {done[0] * 100 // 65535} %")

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        list(ex.map(probe, range(1, 65536)))
    return sorted(opened), stats


def _broadcast_targets(gw: str | None) -> list[str]:
    t = ["255.255.255.255"]
    for ip in local_ipv4_addresses():
        t.append(str(ipaddress.ip_network(f"{ip}/24", strict=False).broadcast_address))
    if gw:
        t.append(gw)
    return list(dict.fromkeys(t))


def udp_probe(payload: bytes, port: int, targets: list[str],
              timeout: float = 2.0) -> list[tuple[str, bytes]]:
    replies: list[tuple[str, bytes]] = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        s.settimeout(0.3)
        s.bind(("", 0))
        for t in targets:
            try:
                s.sendto(payload, (t, port))
            except OSError:
                pass
        end = time.time() + timeout
        while time.time() < end:
            try:
                data, addr = s.recvfrom(4096)
                replies.append((addr[0], data))
            except socket.timeout:
                continue
            except OSError:
                break
        s.close()
    except OSError:
        pass
    return replies


def parse_pppp_id(data: bytes) -> str:
    """Réponse 'PunchPkt' du protocole P2P CS2/PPPP : préfixe + numéro + code."""
    body = data[4:]
    if len(body) < 12:
        return data.hex()
    prefix = body[:8].split(b"\0")[0].decode(errors="ignore")
    serial = int.from_bytes(body[8:12], "big")
    check = body[12:20].split(b"\0")[0].decode(errors="ignore")
    return f"{prefix}-{serial:06d}-{check}"


def diagnose(target: str | None = None) -> None:
    log("\n================ DIAGNOSTIC ================")
    log(f"Système : {platform.system()} {platform.release()}  —  Python {platform.python_version()}")
    ips = local_ipv4_addresses()
    log(f"Adresse(s) de cet ordinateur : {', '.join(ips) or 'aucune'}")
    gw = default_gateway()
    host = target or gw
    log(f"Passerelle (normalement la caméra) : {gw or 'inconnue'}")
    if not host:
        log("→ Pas de réseau : connectez l'ordinateur au Wi-Fi de la caméra.")
        return

    log(f"\n[1] Ping de {host} : " + ("répond ✔" if ping(host) else "ne répond pas ✘"))
    mac = arp_entry(host)
    log(f"[2] Adresse matérielle (MAC) de {host} : {mac or 'inconnue'}")

    st = tcp_check(host, 80, 1.5)
    meaning = {
        "open": "port 80 ouvert ✔",
        "refused": "l'appareil répond (port 80 fermé) ✔",
        "timeout": "aucune réponse TCP",
    }.get(st, f"ERREUR {st}")
    log(f"[3] Connexion TCP à {host} : {meaning}")
    blocked = st in (f"err:{errno.EHOSTUNREACH}", f"err:{errno.ENETUNREACH}",
                     f"err:{errno.EPERM}", f"err:{errno.EACCES}")
    if blocked and IS_MAC:
        log("   ⚠  macOS BLOQUE l'accès au réseau local pour le Terminal.")
        log("      Réglages Système → Confidentialité et sécurité → Réseau local")
        log("      → activez « Terminal », puis quittez complètement le Terminal")
        log("      (Cmd+Q) et relancez-le.")

    log("[4] Recherche de caméras P2P (UDP 32108 / 32100)…")
    targets = _broadcast_targets(gw)
    pppp = udp_probe(b"\xf1\x30\x00\x00", 32108, targets) + \
        udp_probe(b"\xf1\x30\x00\x00", 32100, targets)
    seen = set()
    for addr, data in pppp:
        if data[:1] == b"\xf1" and (addr, data[:2]) not in seen:
            seen.add((addr, data[:2]))
            log(f"     réponse P2P de {addr} : type 0x{data[1]:02x}  id={parse_pppp_id(data)}")
    if not seen:
        log("     aucune")

    log("[5] Recherche XMEye / iCSee (UDP 34569)…")
    xm = udp_probe(bytes.fromhex("ff00000000000000000000000000fa0500000000"), 34569, targets)
    for addr, data in xm[:3]:
        log(f"     réponse de {addr} : {data[20:200].decode(errors='ignore')!r}")
    if not xm:
        log("     aucune")

    log("[6] Recherche UPnP / SSDP…")
    ssdp = udp_probe(b"M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\n"
                     b"MAN: \"ssdp:discover\"\r\nMX: 1\r\nST: ssdp:all\r\n\r\n",
                     1900, ["239.255.255.250"] + targets)
    srv: dict[str, str] = {}
    for a, d in ssdp:
        m = re.search(rb"SERVER:\s*([^\r\n]+)", d, re.I)
        srv.setdefault(a, m.group(1).decode(errors="ignore")[:80] if m else "?")
    for a, sv in list(srv.items())[:5]:
        log(f"     {a} : {sv}")
    if not ssdp:
        log("     aucune")

    if blocked:
        log("\n(Scan complet des ports ignoré : l'accès réseau est bloqué.)")
    else:
        log(f"[7] Scan complet des 65535 ports TCP de {host} (jusqu'à 1-2 minutes)…")
        opened, stats = full_port_scan(host)
        log(f"     ports ouverts : {opened or 'aucun'}")
        errs = {k: v for k, v in stats.items() if k.startswith("err")}
        if errs:
            log(f"     erreurs : {errs}")

    log("\n=> Copiez tout ce texte (depuis « DIAGNOSTIC ») et envoyez-le,")
    log("   avec le NOM DE L'APPLICATION de la caméra et le NOM DU WI-FI de la caméra.")
    log("============================================\n")


# --------------------------------------------------------------------------- #
#  Lecture vidéo                                                              #
# --------------------------------------------------------------------------- #

class JpegPoller:
    """Pour les caméras qui ne servent qu'une image JPEG fixe : on la redemande en boucle."""

    def __init__(self, url: str):
        p = urllib.parse.urlsplit(url)
        self.user = urllib.parse.unquote(p.username or "")
        self.pwd = urllib.parse.unquote(p.password or "")
        netloc = p.hostname + (f":{p.port}" if p.port else "")
        self.url = urllib.parse.urlunsplit(p._replace(netloc=netloc))
        handlers = []
        if self.user:
            mgr = urllib.request.HTTPPasswordMgrWithDefaultRealm()
            mgr.add_password(None, self.url, self.user, self.pwd)
            handlers += [urllib.request.HTTPBasicAuthHandler(mgr),
                         urllib.request.HTTPDigestAuthHandler(mgr)]
        self.opener = urllib.request.build_opener(*handlers)
        self.ok = True

    def isOpened(self) -> bool:  # noqa: N802 - même API qu'OpenCV
        return self.ok

    def read(self):
        import numpy as np
        try:
            with self.opener.open(self.url, timeout=5) as r:
                buf = np.frombuffer(r.read(), dtype=np.uint8)
            frame = cv2.imdecode(buf, cv2.IMREAD_COLOR)
            return frame is not None, frame
        except Exception:
            return False, None

    def release(self) -> None:
        self.ok = False


def open_capture(url: str, kind: str = "auto"):
    if kind == "jpeg":
        return JpegPoller(url)
    params = []
    if hasattr(cv2, "CAP_PROP_OPEN_TIMEOUT_MSEC"):
        params = [cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 6000, cv2.CAP_PROP_READ_TIMEOUT_MSEC, 6000]
    try:
        cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG, params)
    except TypeError:
        cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
    try:
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    except Exception:
        pass
    return cap


class FrameGrabber(threading.Thread):
    """Lit le flux en continu dans un thread et ne garde que l'image la plus récente
    (évite le retard qui s'accumule) ; se reconnecte automatiquement."""

    def __init__(self, url: str, kind: str):
        super().__init__(daemon=True)
        self.url, self.kind = url, kind
        self.frame = None
        self.frame_id = 0
        self.status = "Connexion…"
        self.fps = 0.0
        self._stop = threading.Event()
        self._lock = threading.Lock()

    def run(self) -> None:
        while not self._stop.is_set():
            cap = open_capture(self.url, self.kind)
            if not cap.isOpened():
                self.status = "Caméra injoignable — nouvelle tentative…"
                cap.release()
                self._stop.wait(2)
                continue
            self.status = ""
            fails, count, t0 = 0, 0, time.time()
            while not self._stop.is_set():
                ok, frame = cap.read()
                if not ok or frame is None:
                    fails += 1
                    if fails > 25:
                        break
                    time.sleep(0.02)
                    continue
                fails = 0
                with self._lock:
                    self.frame = frame
                    self.frame_id += 1
                count += 1
                dt = time.time() - t0
                if dt >= 1:
                    self.fps, count, t0 = count / dt, 0, time.time()
            cap.release()
            if not self._stop.is_set():
                self.status = "Flux interrompu — reconnexion…"
                self._stop.wait(1)

    def latest(self):
        with self._lock:
            return self.frame_id, self.frame

    def stop(self) -> None:
        self._stop.set()


def timestamp() -> str:
    return _dt.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")


def view(url: str, kind: str = "auto", title: str = "Camera IP - direct") -> None:
    grabber = FrameGrabber(url, kind)
    grabber.start()
    log(f"\nAffichage de {hide_password(url)}")
    log("Touches : [Q] quitter  [S] photo  [R] enregistrer  [F] plein écran\n")

    cv2.namedWindow(title, cv2.WINDOW_NORMAL)
    fullscreen = False
    writer = None
    rec_file = None
    last_id = -1
    blank = None
    try:
        while True:
            fid, frame = grabber.latest()
            if frame is not None:
                display = frame.copy()
                if writer is not None and fid != last_id:
                    writer.write(frame)
                last_id = fid
            else:
                import numpy as np
                if blank is None:
                    blank = np.zeros((360, 640, 3), dtype=np.uint8)
                display = blank.copy()

            # Bandeau d'informations
            info = grabber.status or f"{grabber.fps:4.1f} img/s"
            if frame is not None:
                h, w = frame.shape[:2]
                info += f"   {w}x{h}"
            cv2.putText(display, info, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 3)
            cv2.putText(display, info, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
            if writer is not None:
                cv2.circle(display, (display.shape[1] - 25, 25), 9, (0, 0, 255), -1)
                cv2.putText(display, "REC", (display.shape[1] - 75, 31),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

            cv2.imshow(title, display)
            key = cv2.waitKey(15) & 0xFF

            if key in (ord("q"), ord("Q"), 27):
                break
            try:
                if cv2.getWindowProperty(title, cv2.WND_PROP_VISIBLE) < 1:
                    break
            except cv2.error:
                break
            if key in (ord("s"), ord("S")) and frame is not None:
                CAPTURE_DIR.mkdir(exist_ok=True)
                path = CAPTURE_DIR / f"photo_{timestamp()}.jpg"
                cv2.imwrite(str(path), frame)
                log(f"Photo enregistrée : {path}")
            if key in (ord("r"), ord("R")):
                if writer is None and frame is not None:
                    CAPTURE_DIR.mkdir(exist_ok=True)
                    rec_file = CAPTURE_DIR / f"video_{timestamp()}.avi"
                    h, w = frame.shape[:2]
                    fps = grabber.fps if grabber.fps > 1 else 15
                    writer = cv2.VideoWriter(str(rec_file), cv2.VideoWriter_fourcc(*"MJPG"),
                                             fps, (w, h))
                    log(f"Enregistrement démarré : {rec_file}")
                elif writer is not None:
                    writer.release()
                    writer = None
                    log(f"Enregistrement terminé : {rec_file}")
            if key in (ord("f"), ord("F")):
                fullscreen = not fullscreen
                cv2.setWindowProperty(title, cv2.WND_PROP_FULLSCREEN,
                                      cv2.WINDOW_FULLSCREEN if fullscreen else cv2.WINDOW_NORMAL)
    finally:
        if writer is not None:
            writer.release()
            log(f"Enregistrement terminé : {rec_file}")
        grabber.stop()
        cv2.destroyAllWindows()


# --------------------------------------------------------------------------- #
#  Configuration enregistrée                                                  #
# --------------------------------------------------------------------------- #

def load_config() -> dict | None:
    try:
        return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def save_config(stream: dict) -> None:
    try:
        CONFIG_FILE.write_text(json.dumps(stream, indent=2), encoding="utf-8")
        log(f"Adresse mémorisée dans {CONFIG_FILE.name} (lancement direct la prochaine fois).")
    except OSError:
        pass


def guess_kind(url: str) -> str:
    if url.lower().startswith("http"):
        kind = http_probe(url, "", "")
        return kind or "auto"
    return "rtsp"


# --------------------------------------------------------------------------- #
#  Programme principal                                                        #
# --------------------------------------------------------------------------- #

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Affiche en direct une caméra IP sans l'application du fabricant.")
    ap.add_argument("--url", help="adresse complète du flux (rtsp://… ou http://…)")
    ap.add_argument("--ip", help="adresse IP de la caméra (sinon : recherche automatique)")
    ap.add_argument("--user", help="identifiant de la caméra (souvent 'admin')")
    ap.add_argument("--password", help="mot de passe de la caméra")
    ap.add_argument("--scan", action="store_true",
                    help="rechercher et lister les flux, sans afficher la vidéo")
    ap.add_argument("--new", action="store_true",
                    help="ignorer l'adresse mémorisée et refaire une recherche")
    ap.add_argument("--diag", action="store_true",
                    help="diagnostic détaillé si la caméra n'est pas trouvée")
    args = ap.parse_args(argv)

    if args.diag:
        diagnose(args.ip)
        return 0

    if args.url:
        url = with_auth(args.url, args.user or "", args.password or "")
        view(url, guess_kind(url))
        return 0

    if not args.scan and not args.new and not args.ip:
        cfg = load_config()
        if cfg and cfg.get("url"):
            host = urllib.parse.urlsplit(cfg["url"]).hostname
            port = urllib.parse.urlsplit(cfg["url"]).port or (
                554 if cfg["url"].startswith("rtsp") else 80)
            if host and port_open(host, port, 1.5):
                log("Caméra mémorisée trouvée.")
                view(cfg["url"], cfg.get("type", "auto"))
                return 0
            log("Caméra mémorisée injoignable, nouvelle recherche…")

    streams = discover(args.user, args.password, args.ip, stop_at_first=not args.scan)

    if not streams:
        log("\n✗ Aucun flux vidéo trouvé.")
        log("  • Vérifiez que l'ordinateur est bien connecté au Wi-Fi de la caméra.")
        log("  • Si la caméra a un mot de passe :  --user admin --password VOTRE_MDP")
        log("  • Certaines mini-caméras bon marché n'utilisent qu'un protocole")
        log("    propriétaire chiffré : voir le README (section « Ça ne marche pas »).")
        diagnose(args.ip)
        return 1

    if args.scan:
        log("\nFlux trouvés :")
        for s in streams:
            log(f"  [{s['type']}] {hide_password(s['url'])}")
        return 0

    save_config(streams[0])
    view(streams[0]["url"], streams[0]["type"])
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(0)
