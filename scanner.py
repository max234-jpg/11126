"""Traitement d'image façon « scanner » :
détection du document, redressement de la perspective,
fusion de plusieurs images (réduction du bruit) et amélioration de la qualité.
"""
import cv2
import numpy as np

MODES = ("couleur", "gris", "nb", "photo")


# ---------------------------------------------------------------------------
# Outils
# ---------------------------------------------------------------------------
def _odd(n, minimum=3):
    n = max(int(n), minimum)
    return n if n % 2 == 1 else n + 1


def sharpness(img):
    """Netteté d'une image (variance du Laplacien)."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def order_points(pts):
    """Ordonne 4 points : haut-gauche, haut-droit, bas-droit, bas-gauche."""
    pts = np.asarray(pts, dtype=np.float32).reshape(4, 2)
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()
    return np.array([pts[np.argmin(s)], pts[np.argmin(d)],
                     pts[np.argmax(s)], pts[np.argmax(d)]], dtype=np.float32)


# ---------------------------------------------------------------------------
# Fusion de plusieurs images (réduit fortement le bruit des petites caméras)
# ---------------------------------------------------------------------------
def stack_frames(frames):
    frames = [f for f in frames if f is not None]
    if not frames:
        return None
    if len(frames) == 1:
        return frames[0]

    # On prend l'image la plus nette comme référence et on écarte les floues.
    scores = [sharpness(f) for f in frames]
    best = int(np.argmax(scores))
    ref = frames[best]
    h, w = ref.shape[:2]
    keep = [f for f, s in zip(frames, scores)
            if f.shape == ref.shape and s >= 0.6 * scores[best]]

    ref_g = cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY).astype(np.float32)
    win = cv2.createHanningWindow((w, h), cv2.CV_32F)
    acc = np.zeros_like(ref, dtype=np.float32)
    n = 0
    for f in keep:
        if f is ref:
            acc += f
            n += 1
            continue
        g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32)
        (dx, dy), resp = cv2.phaseCorrelate(ref_g, g, win)
        if abs(dx) > 0.05 * w or abs(dy) > 0.05 * h:
            continue  # la caméra a trop bougé, on ignore cette image
        m = np.float32([[1, 0, -dx], [0, 1, -dy]])
        acc += cv2.warpAffine(f, m, (w, h), borderMode=cv2.BORDER_REFLECT)
        n += 1
    return np.clip(acc / max(n, 1), 0, 255).astype(np.uint8)


# ---------------------------------------------------------------------------
# Détection du document
# ---------------------------------------------------------------------------
def detect_document(img):
    """Renvoie les 4 coins du document (en pixels) ou None."""
    h, w = img.shape[:2]
    scale = 500.0 / max(h, w)
    small = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    sh, sw = small.shape[:2]
    area_img = sh * sw

    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    # Fermeture morphologique : efface le texte pour ne garder que la feuille
    closed = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=3)

    edge_maps = []
    med = float(np.median(closed))
    canny = cv2.Canny(closed, int(max(0, 0.5 * med)), int(min(255, 1.3 * med)))
    edge_maps.append(cv2.dilate(canny, np.ones((3, 3), np.uint8), iterations=2))
    edge_maps.append(cv2.Canny(closed, 30, 90))
    _, otsu = cv2.threshold(closed, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    edge_maps.append(otsu)

    best, best_area = None, 0.0
    for edges in edge_maps:
        cnts, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        for c in sorted(cnts, key=cv2.contourArea, reverse=True)[:8]:
            peri = cv2.arcLength(c, True)
            for eps in (0.02, 0.03, 0.05):
                approx = cv2.approxPolyDP(c, eps * peri, True)
                if len(approx) != 4 or not cv2.isContourConvex(approx):
                    continue
                a = cv2.contourArea(approx)
                if 0.15 * area_img < a < 0.985 * area_img and a > best_area:
                    best, best_area = approx, a
                break
    if best is None:
        return None
    return order_points(best.reshape(4, 2) / scale)


def warp(img, corners, trim=0.0):
    """Redresse le document délimité par les 4 coins."""
    tl, tr, br, bl = order_points(corners)
    width = int(max(np.linalg.norm(br - bl), np.linalg.norm(tr - tl)))
    height = int(max(np.linalg.norm(tr - br), np.linalg.norm(tl - bl)))
    width, height = max(width, 10), max(height, 10)
    dst = np.array([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]], dtype=np.float32)
    m = cv2.getPerspectiveTransform(np.array([tl, tr, br, bl], dtype=np.float32), dst)
    out = cv2.warpPerspective(img, m, (width, height), flags=cv2.INTER_CUBIC)
    if trim:  # retire un fin liseré pour ne pas garder le bord de la table
        my, mx = int(height * trim), int(width * trim)
        out = out[my:height - my, mx:width - mx]
    return out


# ---------------------------------------------------------------------------
# Amélioration
# ---------------------------------------------------------------------------
def _background(channel):
    """Estime le fond (éclairage + ombres) en effaçant le texte et les aplats.
    Calculé en basse résolution : plus rapide et sans stries."""
    h, w = channel.shape[:2]
    s = 400.0 / max(h, w)
    small = cv2.resize(channel, (max(1, int(w * s)), max(1, int(h * s))), interpolation=cv2.INTER_AREA)
    bg = cv2.dilate(small, np.ones((17, 17), np.uint8))
    bg = cv2.medianBlur(bg, 31)
    bg = cv2.GaussianBlur(bg, (0, 0), 6)
    return cv2.resize(bg, (w, h), interpolation=cv2.INTER_CUBIC)


def _flatten(channel):
    """Supprime ombres et éclairage inégal : le papier devient blanc uniforme."""
    bg = _background(channel).astype(np.float32)
    out = channel.astype(np.float32) / np.maximum(bg, 1.0) * 255.0
    return np.clip(out, 0, 255).astype(np.uint8)


def _levels(img, low_pct=1.0, high_pct=99.0, gamma=1.0):
    lo, hi = np.percentile(img, (low_pct, high_pct))
    if hi - lo < 10:
        return img
    x = np.clip((img.astype(np.float32) - lo) / (hi - lo), 0, 1)
    if gamma != 1.0:
        x = x ** gamma
    return (x * 255).astype(np.uint8)


def _paper_white(img, gray=None):
    """Rend le papier parfaitement blanc : le grain restant sur le fond disparaît."""
    g = gray if gray is not None else (img if img.ndim == 2 else cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
    white = float(np.percentile(g, 60)) * 0.93  # le papier occupe la majorité d'un document
    if white < 120:  # page très sombre / photo : on ne touche à rien
        return img
    x = np.clip(img.astype(np.float32) * (255.0 / white), 0, 255)
    return x.astype(np.uint8)


def _unsharp(img, amount=0.8, sigma=1.2):
    blur = cv2.GaussianBlur(img, (0, 0), sigma)
    return cv2.addWeighted(img, 1 + amount, blur, -amount, 0)


def _upscale(img, target=2000, max_factor=3.0):
    """Agrandit les petites images (caméras basse résolution) avant traitement."""
    long_side = max(img.shape[:2])
    if long_side >= target:
        return img
    f = min(target / long_side, max_factor)
    return cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC)


def _denoise(img):
    if img.shape[0] * img.shape[1] <= 1_500_000:
        return cv2.fastNlMeansDenoisingColored(img, None, 4, 4, 7, 21)
    return cv2.bilateralFilter(img, 5, 30, 30)


def enhance(img, mode="couleur"):
    img = _upscale(_denoise(img))

    if mode == "couleur":
        b, g, r = cv2.split(img)
        flat = cv2.merge([_flatten(b), _flatten(g), _flatten(r)])
        flat = _paper_white(_levels(flat, 0.5, 99.5, gamma=1.1))
        hsv = cv2.cvtColor(flat, cv2.COLOR_BGR2HSV).astype(np.float32)
        hsv[..., 1] = np.clip(hsv[..., 1] * 1.25, 0, 255)
        out = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
        return _unsharp(out, 0.7)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    if mode == "gris":
        flat = _paper_white(_levels(_flatten(gray), 0.5, 99.0, gamma=1.15))
        return _unsharp(flat, 0.8)

    if mode == "nb":
        flat = cv2.medianBlur(_flatten(gray), 3)
        block = _odd(max(flat.shape) / 60, 15)
        local = cv2.adaptiveThreshold(flat, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                      cv2.THRESH_BINARY, block, 9)
        # seuil global en plus : les grands aplats sombres restent noirs (pas évidés)
        otsu, _ = cv2.threshold(flat, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        _, glob = cv2.threshold(flat, 0.55 * otsu, 255, cv2.THRESH_BINARY)
        return cv2.bitwise_and(local, glob)

    # "photo" : couleurs naturelles, juste plus de contraste et de netteté
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(l)
    out = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)
    return _unsharp(_levels(out, 0.3, 99.7), 0.6)


def rotate(img, rotation):
    rotation %= 360
    if rotation == 90:
        return cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    if rotation == 180:
        return cv2.rotate(img, cv2.ROTATE_180)
    if rotation == 270:
        return cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return img


def full_corners(img):
    h, w = img.shape[:2]
    return np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype=np.float32)


def process(img, mode="couleur", corners=None, rotation=0):
    """Pipeline complet. `corners` : 4 points en pixels (None = détection auto).
    Renvoie (image_résultat, coins_utilisés, document_détecté)."""
    detected = True
    if corners is None:
        corners = detect_document(img)
        if corners is None:
            corners, detected = full_corners(img), False
    corners = order_points(corners)
    out = warp(img, corners, trim=0.012 if detected else 0.0)
    out = enhance(out, mode if mode in MODES else "couleur")
    return rotate(out, rotation), corners, detected
