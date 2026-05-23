import base64
import json
import logging
import os
import re
from typing import Dict, List, Tuple, Optional

import cv2
import numpy as np
from urllib import error, request

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constantes HSV — plages validées expérimentalement (H en [0,179] OpenCV)
# ---------------------------------------------------------------------------
HSV_RANGES: Dict[str, List[Tuple[np.ndarray, np.ndarray]]] = {
    # Rouge : wraparound 0/180 → deux plages
    'R': [
        (np.array([0,   120, 70],  np.uint8), np.array([8,   255, 255], np.uint8)),
        (np.array([172, 120, 70],  np.uint8), np.array([179, 255, 255], np.uint8)),
    ],
    # Orange
    'L': [
        (np.array([9,  130, 80],  np.uint8), np.array([20, 255, 255], np.uint8)),
    ],
    # Jaune
    'D': [
        (np.array([21, 120, 100], np.uint8), np.array([35, 255, 255], np.uint8)),
    ],
    # Vert
    'F': [
        (np.array([36, 80,  60],  np.uint8), np.array([85, 255, 255], np.uint8)),
    ],
    # Bleu
    'B': [
        (np.array([86, 80,  60],  np.uint8), np.array([135, 255, 255], np.uint8)),
    ],
    # Blanc — faible saturation + haute luminance
    'U': [
        (np.array([0,  0,  160], np.uint8), np.array([179, 55, 255], np.uint8)),
    ],
}

# Correspondance couleur → BGR (pour dessin OpenCV)
COLOR_BGR: Dict[str, Tuple[int, int, int]] = {
    'U': (255, 255, 255),  # Blanc
    'R': (0,   0,   255),  # Rouge
    'F': (0,   200,  0),   # Vert
    'D': (0,   220, 220),  # Jaune
    'L': (0,   140, 255),  # Orange
    'B': (255,  0,   0),   # Bleu
}


# ---------------------------------------------------------------------------
# Utilitaires géométriques
# ---------------------------------------------------------------------------

def _contour_center(contour) -> Tuple[float, float]:
    M = cv2.moments(contour)
    if M['m00'] == 0:
        x, y, w, h = cv2.boundingRect(contour)
        return x + w / 2, y + h / 2
    return M['m10'] / M['m00'], M['m01'] / M['m00']


def _aspect_ratio(contour) -> float:
    _, _, w, h = cv2.boundingRect(contour)
    if h == 0:
        return 0.0
    return w / h


def _is_square_like(contour, tolerance: float = 0.35) -> bool:
    """Vérifie qu'un contour est quasi-carré."""
    ar = _aspect_ratio(contour)
    return (1 - tolerance) <= ar <= (1 + tolerance)


def _median_area(contours) -> float:
    areas = [cv2.contourArea(c) for c in contours]
    return float(np.median(areas)) if areas else 0.0


# ---------------------------------------------------------------------------
# Pipeline de prétraitement
# ---------------------------------------------------------------------------

def _preprocess(image: np.ndarray) -> np.ndarray:
    """
    Retourne un masque binaire mettant en évidence les bords des stickers.
    Chaîne : resize → blur → Canny → dilatation → fermeture
    """
    # Resize pour uniformiser (le détecteur attend ~640px de large max)
    h, w = image.shape[:2]
    if w > 800:
        scale = 800 / w
        image = cv2.resize(image, (800, int(h * scale)), interpolation=cv2.INTER_AREA)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Égalisation CLAHE pour réduire les effets d'éclairage
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)

    # Flou pour réduire le bruit avant Canny
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Canny avec seuils automatiques (médiane × 0.66 / 1.33)
    median_val = float(np.median(blurred))
    low  = int(max(10, 0.66 * median_val))
    high = int(min(255, 1.33 * median_val))
    edges = cv2.Canny(blurred, low, high)

    # Dilatation puis fermeture pour relier les bords fragmentés
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    edges = cv2.dilate(edges, kernel, iterations=2)
    edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)

    return edges


# ---------------------------------------------------------------------------
# Détection et filtrage des contours carrés
# ---------------------------------------------------------------------------

def _find_square_contours(binary: np.ndarray,
                           min_area: int = 300,
                           max_area_ratio: float = 0.12) -> List:
    """
    Extrait les contours approximativement carrés.
    max_area_ratio : fraction max de l'image qu'un sticker peut occuper.
    """
    frame_area = binary.shape[0] * binary.shape[1]
    max_area = frame_area * max_area_ratio

    # RETR_LIST conserve aussi des contours internes utiles quand les stickers
    # partagent des bords ou quand le contour externe du cube domine l'image.
    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    candidates = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < min_area or area > max_area:
            continue

        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.03 * peri, True)

        # On accepte 4 à 6 sommets (les coins du sticker peuvent être légèrement arrondis)
        if not (4 <= len(approx) <= 6):
            continue

        if not _is_square_like(c, tolerance=0.5):
            continue

        # Écarte les formes très concaves / bruitées.
        hull = cv2.convexHull(c)
        hull_area = cv2.contourArea(hull)
        if hull_area <= 1:
            continue
        solidity = area / hull_area
        if solidity < 0.72:
            continue

        candidates.append(c)

    return candidates


def _filter_by_median_size(contours, tolerance: float = 0.6) -> List:
    """
    Conserve uniquement les contours dont l'aire est proche de la médiane.
    Élimine les faux positifs (très grands ou très petits) lorsqu'on a ≥5 candidats.
    """
    if len(contours) < 5:
        return contours

    median = _median_area(contours)
    lo = median * (1 - tolerance)
    hi = median * (1 + tolerance)
    return [c for c in contours if lo <= cv2.contourArea(c) <= hi]


# ---------------------------------------------------------------------------
# Validation et tri de la grille 3×3
# ---------------------------------------------------------------------------

def _sort_grid(contours, expected: int = 9) -> Optional[List]:
    """
    Tente de former une grille 3×3 régulière à partir des centres des contours.
    Retourne la liste ordonnée (ligne par ligne, gauche → droite) ou None.
    """
    if len(contours) < expected:
        return None

    centers = [_contour_center(c) for c in contours]

    # On ne garde que les `expected` contours les plus grands si on en a trop
    if len(contours) > expected:
        areas = [(cv2.contourArea(c), i) for i, c in enumerate(contours)]
        areas.sort(reverse=True)
        idx = [i for _, i in areas[:expected]]
        contours = [contours[i] for i in idx]
        centers  = [centers[i]  for i in idx]

    # Tri primaire : Y (lignes), secondaire : X (colonnes)
    pairs = sorted(zip(centers, contours), key=lambda p: (round(p[0][1] / 20) * 20, p[0][0]))
    sorted_contours = [c for _, c in pairs]

    # Validation : les 9 centres doivent former une grille cohérente.
    # On vérifie que l'écart-type des espacements est raisonnable.
    sorted_centers = [_contour_center(c) for c in sorted_contours]
    xs = sorted([p[0] for p in sorted_centers])
    ys = sorted([p[1] for p in sorted_centers])
    x_gaps = [xs[i+1] - xs[i] for i in range(len(xs)-1)]
    y_gaps = [ys[i+1] - ys[i] for i in range(len(ys)-1)]

    if x_gaps and y_gaps:
        x_cv = np.std(x_gaps) / (np.mean(x_gaps) + 1e-5)
        y_cv = np.std(y_gaps) / (np.mean(y_gaps) + 1e-5)
        # Coefficient de variation acceptable : < 0.8
        if x_cv > 0.8 or y_cv > 0.8:
            logger.debug("Grid validation failed: x_cv=%.2f y_cv=%.2f", x_cv, y_cv)
            return None

    return sorted_contours


# ---------------------------------------------------------------------------
# Classification couleur HSV
# ---------------------------------------------------------------------------

def _classify_color_hsv(roi_hsv: np.ndarray) -> str:
    """
    Classifie la couleur dominante d'une région HSV.
    Utilise des masques par plage HSV plutôt qu'une simple comparaison de moyennes.
    """
    if roi_hsv.size == 0:
        return 'U'

    # Flou léger pour lisser
    roi = cv2.GaussianBlur(roi_hsv, (5, 5), 0)

    # Heuristique prioritaire pour le blanc:
    # une zone majoritairement peu saturée doit rester blanche,
    # même si la teinte dérive avec l'exposition/capteur.
    s_chan = roi[:, :, 1]
    v_chan = roi[:, :, 2]
    total_pixels = roi.shape[0] * roi.shape[1]
    low_sat_bright_ratio = float(np.count_nonzero((s_chan < 70) & (v_chan > 80))) / max(1, total_pixels)
    mean_s = float(np.mean(s_chan))
    mean_v = float(np.mean(v_chan))

    if low_sat_bright_ratio >= 0.45:
        return 'U'
    if mean_s < 65 and mean_v > 70:
        return 'U'

    best_color = 'U'
    best_score = -1
    scores: Dict[str, int] = {}

    for color, ranges in HSV_RANGES.items():
        mask = np.zeros(roi.shape[:2], dtype=np.uint8)
        for (lo, hi) in ranges:
            mask |= cv2.inRange(roi, lo, hi)
        score = int(cv2.countNonZero(mask))
        scores[color] = score
        if score > best_score:
            best_score = score
            best_color = color

    # Seuil minimal : au moins 15 % des pixels doivent correspondre
    if best_score < total_pixels * 0.15:
        return 'U'

    # Si une couleur saturée gagne de peu face au blanc, on conserve blanc.
    white_score = scores.get('U', 0)
    if best_color != 'U' and white_score >= int(best_score * 0.78) and mean_s < 110 and mean_v > 70:
        return 'U'

    return best_color


# ---------------------------------------------------------------------------
# Fallback : grille forcée centrée sur l'image
# ---------------------------------------------------------------------------

def _fallback_grid(hsv: np.ndarray, margin: float = 0.1) -> List[str]:
    """
    Si la détection de contours échoue, découpe le centre de l'image en 9 cellules.
    Un margin de 10 % est retiré de chaque côté pour éviter les bords.
    """
    h, w = hsv.shape[:2]
    x0 = int(w * margin)
    y0 = int(h * margin)
    x1 = int(w * (1 - margin))
    y1 = int(h * (1 - margin))

    roi = hsv[y0:y1, x0:x1]
    rh, rw = roi.shape[:2]
    cw, ch = rw // 3, rh // 3

    colors = []
    for row in range(3):
        for col in range(3):
            cell = roi[row*ch:(row+1)*ch, col*cw:(col+1)*cw]
            colors.append(_classify_color_hsv(cell))
    return colors


def _score_dark_ratio(dark_ratio: float) -> float:
    """Score triangulaire: optimum autour d'un ratio de traits sombres modéré."""
    if dark_ratio <= 0.02 or dark_ratio >= 0.40:
        return 0.0
    if dark_ratio <= 0.12:
        return (dark_ratio - 0.02) / 0.10
    if dark_ratio <= 0.28:
        return 1.0
    return max(0.0, 1.0 - (dark_ratio - 0.28) / 0.12)


def _find_density_line_centers(density: np.ndarray, threshold: float, min_run: int = 3) -> List[float]:
    """Extrait les centres de pics (runs) au-dessus d'un seuil dans un profil 1D."""
    centers: List[float] = []
    start = -1
    for i, value in enumerate(density):
        if value >= threshold:
            if start < 0:
                start = i
        elif start >= 0:
            end = i - 1
            if (end - start + 1) >= min_run:
                centers.append((start + end) / 2.0)
            start = -1

    if start >= 0:
        end = len(density) - 1
        if (end - start + 1) >= min_run:
            centers.append((start + end) / 2.0)

    return centers


def _regularity_score(centers: List[float]) -> float:
    """Mesure la régularité de l'espacement des lignes détectées."""
    if len(centers) < 3:
        return 0.0
    sorted_centers = sorted(centers)
    gaps = np.diff(sorted_centers)
    if gaps.size == 0:
        return 0.0
    mean_gap = float(np.mean(gaps))
    if mean_gap <= 1e-6:
        return 0.0
    cv = float(np.std(gaps) / mean_gap)
    return max(0.0, 1.0 - min(1.0, cv))


def _estimate_cube_roi(hsv: np.ndarray) -> Tuple[int, int, int, int]:
    """
    Estime la zone la plus probable du cube via saturation + forme quasi carrée.
    Retourne (x0, y0, x1, y1). Si aucun candidat fiable, renvoie une zone centrale.
    """
    h, w = hsv.shape[:2]

    sat = hsv[:, :, 1]
    val = hsv[:, :, 2]
    mask = cv2.inRange(sat, 45, 255)
    mask &= cv2.inRange(val, 40, 255)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    best = None
    best_score = -1.0
    frame_area = float(h * w)
    cx_img, cy_img = w / 2.0, h / 2.0

    for c in contours:
        x, y, cw, ch = cv2.boundingRect(c)
        area = float(cw * ch)
        if area < frame_area * 0.015:
            continue

        ar = cw / max(ch, 1)
        ar_score = max(0.0, 1.0 - abs(ar - 1.0))

        cx, cy = x + cw / 2.0, y + ch / 2.0
        dist = np.hypot(cx - cx_img, cy - cy_img)
        max_dist = np.hypot(cx_img, cy_img) + 1e-5
        center_score = max(0.0, 1.0 - dist / max_dist)

        area_score = min(1.0, area / (frame_area * 0.22))
        score = area_score * 0.6 + ar_score * 0.25 + center_score * 0.15

        if score > best_score:
            best_score = score
            best = (x, y, x + cw, y + ch)

    if best is None:
        # Repli: zone centrale plus serrée que la version initiale.
        x0, y0 = int(w * 0.2), int(h * 0.15)
        x1, y1 = int(w * 0.8), int(h * 0.85)
        return x0, y0, x1, y1

    x0, y0, x1, y1 = best
    pad_x = int((x1 - x0) * 0.1)
    pad_y = int((y1 - y0) * 0.1)
    x0 = max(0, x0 - pad_x)
    y0 = max(0, y0 - pad_y)
    x1 = min(w, x1 + pad_x)
    y1 = min(h, y1 + pad_y)
    return x0, y0, x1, y1


def _fallback_grid_debug(hsv: np.ndarray) -> Tuple[List[str], List[np.ndarray], List[Dict[str, int]], Dict[str, float]]:
    """
    Version debug du fallback: renvoie couleurs + pseudo-contours + stats HSV.
    Cela évite d'afficher des positions/hsv à 0 côté frontend.
    """
    h, w = hsv.shape[:2]
    x0, y0, x1, y1 = _estimate_cube_roi(hsv)

    # Sécurité minimale
    if x1 <= x0 or y1 <= y0:
        x0, y0, x1, y1 = int(w * 0.2), int(h * 0.15), int(w * 0.8), int(h * 0.85)

    roi = hsv[y0:y1, x0:x1]
    rh, rw = roi.shape[:2]
    cw, ch = max(1, rw // 3), max(1, rh // 3)

    colors: List[str] = []
    contours: List[np.ndarray] = []
    hsv_stats: List[Dict[str, int]] = []

    for row in range(3):
        for col in range(3):
            sx0 = col * cw
            sy0 = row * ch
            sx1 = rw if col == 2 else (col + 1) * cw
            sy1 = rh if row == 2 else (row + 1) * ch

            # On ne prend que le cœur de la cellule pour éviter
            # les interstices noirs + fond autour du cube.
            cell_w = max(1, sx1 - sx0)
            cell_h = max(1, sy1 - sy0)
            inner_mx = max(1, int(cell_w * 0.18))
            inner_my = max(1, int(cell_h * 0.18))

            ix0 = min(sx1 - 1, sx0 + inner_mx)
            iy0 = min(sy1 - 1, sy0 + inner_my)
            ix1 = max(ix0 + 1, sx1 - inner_mx)
            iy1 = max(iy0 + 1, sy1 - inner_my)

            cell = roi[iy0:iy1, ix0:ix1]
            color = _classify_color_hsv(cell)
            colors.append(color)

            mean_h = int(np.mean(cell[:, :, 0])) if cell.size else 0
            mean_s = int(np.mean(cell[:, :, 1])) if cell.size else 0
            mean_v = int(np.mean(cell[:, :, 2])) if cell.size else 0
            hsv_stats.append({'h': mean_h, 's': mean_s, 'v': mean_v})

            # Pseudo-contour rectangle en coordonnées image.
            ax0 = x0 + sx0
            ay0 = y0 + sy0
            ax1 = x0 + sx1
            ay1 = y0 + sy1
            contour = np.array([
                [[ax0, ay0]],
                [[ax1, ay0]],
                [[ax1, ay1]],
                [[ax0, ay1]],
            ], dtype=np.int32)
            contours.append(contour)

    meta = {
        'roi_x0': float(x0),
        'roi_y0': float(y0),
        'roi_x1': float(x1),
        'roi_y1': float(y1),
        'roi_area_ratio': float(((x1 - x0) * (y1 - y0)) / max(1, w * h)),
    }

    return colors, contours, hsv_stats, meta


def _estimate_cube_presence(image: np.ndarray,
                            hsv: np.ndarray,
                            contours,
                            fallback: bool,
                            fallback_meta: Optional[Dict[str, float]] = None) -> Tuple[bool, float, str]:
    """
    Estime si un cube est réellement visible.
    Retourne (present, score[0..1], reason).
    """
    frame_h, frame_w = image.shape[:2]
    frame_area = float(max(1, frame_h * frame_w))

    if not fallback:
        if not contours:
            return False, 0.0, 'no_contours'

        xs = []
        ys = []
        total_contour_area = 0.0
        for c in contours:
            x, y, w, h = cv2.boundingRect(c)
            xs.extend([x, x + w])
            ys.extend([y, y + h])
            total_contour_area += float(cv2.contourArea(c))

        bbox_w = max(xs) - min(xs)
        bbox_h = max(ys) - min(ys)
        bbox_area_ratio = float((bbox_w * bbox_h) / frame_area)
        fill_ratio = float(total_contour_area / max(1.0, bbox_w * bbox_h))
        contour_count_score = min(1.0, len(contours) / 9.0)
        size_score = min(1.0, bbox_area_ratio / 0.22)
        fill_score = min(1.0, fill_ratio / 0.75)

        score = contour_count_score * 0.55 + size_score * 0.25 + fill_score * 0.20
        present = len(contours) >= 7 and bbox_area_ratio > 0.03 and score >= 0.52
        reason = 'contour_grid_ok' if present else 'contour_grid_weak'
        return present, float(score), reason

    meta = fallback_meta or {}
    x0 = int(float(meta.get('roi_x0') or (frame_w * 0.2)))
    y0 = int(float(meta.get('roi_y0') or (frame_h * 0.15)))
    x1 = int(float(meta.get('roi_x1') or (frame_w * 0.8)))
    y1 = int(float(meta.get('roi_y1') or (frame_h * 0.85)))

    x0 = max(0, min(frame_w - 1, x0))
    y0 = max(0, min(frame_h - 1, y0))
    x1 = max(x0 + 1, min(frame_w, x1))
    y1 = max(y0 + 1, min(frame_h, y1))

    roi_gray = cv2.cvtColor(image[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY)
    roi_hsv = hsv[y0:y1, x0:x1]

    edges = cv2.Canny(roi_gray, 45, 120)
    edge_density = float(np.count_nonzero(edges)) / float(max(1, edges.size))

    roi_v = roi_hsv[:, :, 2]
    dark_ratio = float(np.count_nonzero(roi_v < 60)) / float(max(1, roi_v.size))

    roi_area_ratio = float(((x1 - x0) * (y1 - y0)) / frame_area)

    # Score de structure grille: recherche de lignes sombres traversantes
    # sur profils colonnes/lignes (interstices du cube).
    dark_mask = (roi_gray < max(45, int(np.mean(roi_gray) * 0.72))).astype(np.uint8)
    col_density = np.mean(dark_mask, axis=0)
    row_density = np.mean(dark_mask, axis=1)
    col_thresh = max(0.14, float(np.percentile(col_density, 85) * 0.72))
    row_thresh = max(0.14, float(np.percentile(row_density, 85) * 0.72))
    min_col_run = max(2, roi_gray.shape[1] // 90)
    min_row_run = max(2, roi_gray.shape[0] // 90)

    v_centers = _find_density_line_centers(col_density, col_thresh, min_run=min_col_run)
    h_centers = _find_density_line_centers(row_density, row_thresh, min_run=min_row_run)

    count_score = min(1.0, min(len(v_centers), len(h_centers)) / 4.0)
    spacing_score = (_regularity_score(v_centers) + _regularity_score(h_centers)) / 2.0
    grid_score = count_score * 0.6 + spacing_score * 0.4

    size_score = min(1.0, roi_area_ratio / 0.30)
    edge_score = min(1.0, edge_density / 0.085)
    dark_score = _score_dark_ratio(dark_ratio)

    score = edge_score * 0.30 + dark_score * 0.20 + size_score * 0.10 + grid_score * 0.40
    present = edge_density >= 0.03 and grid_score >= 0.38 and score >= 0.50
    reason = 'fallback_grid_ok' if present else 'fallback_grid_weak'
    return present, float(score), reason


# ---------------------------------------------------------------------------
# Dessin d'annotations sur l'image de debug
# ---------------------------------------------------------------------------

def _annotate_image(image: np.ndarray,
                    contours,
                    colors: List[str],
                    hsv_stats: Optional[List[Dict]] = None) -> np.ndarray:
    out = image.copy()
    for i, (c, color) in enumerate(zip(contours, colors)):
        bgr = COLOR_BGR.get(color, (128, 128, 128))
        cv2.drawContours(out, [c], -1, bgr, 2)
        x, y, w, h = cv2.boundingRect(c)
        label = color
        if hsv_stats and i < len(hsv_stats):
            s = hsv_stats[i]
            label = f"{color} H{s['h']}S{s['s']}V{s['v']}"
        cv2.putText(out, label, (x, max(12, y - 4)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, bgr, 1, cv2.LINE_AA)
    return out


# ---------------------------------------------------------------------------
# Classe principale
# ---------------------------------------------------------------------------

class CubeDetector:
    """Détecte l'état d'un Rubik's cube à partir d'une image."""

    def __init__(self):
        self.cube_state: Dict[str, List[str]] = {
            'U': [], 'R': [], 'F': [], 'D': [], 'L': [], 'B': []
        }
        self.provider_mode  = os.getenv('DETECTOR_PROVIDER', 'auto').lower()
        self.ollama_base_url = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434').rstrip('/')
        self.ollama_model    = os.getenv('OLLAMA_VISION_MODEL', 'qwen2.5vl:7b')
        self.ollama_timeout  = float(os.getenv('OLLAMA_TIMEOUT_SECONDS', '12'))

    # ------------------------------------------------------------------
    # API publique
    # ------------------------------------------------------------------

    def detect_from_image(self, image_path: str) -> Optional[Dict]:
        image = cv2.imread(image_path)
        if image is None:
            return None
        return self.process_image(image)

    def detect_from_base64(self, base64_data: str) -> Optional[Dict]:
        nparr = np.frombuffer(base64.b64decode(base64_data), np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            return None
        return self.process_image(image)

    def detect_with_debug(self, base64_data: str, provider_override: Optional[str] = None) -> Dict:
        """Point d'entrée debug : provider sélectionnable à la requête."""
        provider = (provider_override or self.provider_mode or 'auto').strip().lower()

        if provider in {'classic', 'opencv'}:
            return self._detect_with_classic_debug(base64_data)

        if provider in {'ollama', 'vision'}:
            try:
                return self._detect_with_ollama_debug(base64_data)
            except Exception as exc:
                logger.warning('Ollama failed in forced mode, no fallback: %s', exc)
                return {
                    'success': False,
                    'provider': 'ollama',
                    'model': self.ollama_model,
                    'contours_found': 0,
                    'stickers': [],
                    'warnings': ['Ollama indisponible ou erreur modèle'],
                    'cube_present': False,
                    'cube_presence_score': 0,
                    'presence_reason': 'ollama_error',
                    'error': f'Ollama error: {exc}',
                }

        if provider in {'yolo', 'rubik-yolo', 'rubikyolo'}:
            try:
                return self._detect_with_yolo_debug(base64_data)
            except Exception as exc:
                logger.exception('YOLO provider failed: %s', exc)
                return {
                    'success': False,
                    'provider': 'yolo',
                    'model': os.getenv('YOLO_MODEL_PATH', 'rubik-yolo'),
                    'contours_found': 0,
                    'stickers': [],
                    'warnings': ['YOLO provider error'],
                    'cube_present': False,
                    'cube_presence_score': 0,
                    'presence_reason': 'yolo_error',
                    'error': f'YOLO error: {exc}',
                }

        # auto (par défaut): essaie Ollama puis fallback classique
        try:
            return self._detect_with_ollama_debug(base64_data)
        except Exception as exc:
            logger.warning('Ollama failed, falling back to classic: %s', exc)
            return self._detect_with_classic_debug(base64_data)

    def process_image(self, image: np.ndarray) -> Optional[Dict]:
        """Traite une image BGR et retourne les couleurs des 6 faces."""
        colors, info = self._detect_stickers(image)
        if not info.get('cube_present', False):
            return None
        detected_state: Dict[str, List[str]] = {}
        for face in ['U', 'R', 'F', 'D', 'L', 'B']:
            detected_state[face] = colors[:9] if len(colors) >= 9 else colors + ['U'] * (9 - len(colors))
        return detected_state

    # ------------------------------------------------------------------
    # Détection classique (pipeline complète)
    # ------------------------------------------------------------------

    def _detect_stickers(self, image: np.ndarray) -> Tuple[List[str], Dict]:
        """
        Retourne (liste_couleurs_9, info_debug).
        info_debug contient les contours, stats HSV, mode utilisé.
        """
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        binary = _preprocess(image)

        # --- Étape 1 : candidats carrés ---------------------------------
        frame_h, frame_w = image.shape[:2]
        frame_area = frame_h * frame_w

        # Seuils adaptatifs: utiles quand le cube est proche/loin de la caméra.
        min_area = max(120, int(frame_area * 0.00035))
        max_area_ratio = 0.22

        candidates = _find_square_contours(binary, min_area=min_area, max_area_ratio=max_area_ratio)
        logger.debug("Raw square candidates: %d", len(candidates))

        # --- Étape 2 : filtrage par taille cohérente --------------------
        candidates = _filter_by_median_size(candidates)
        logger.debug("After median filter: %d", len(candidates))

        # --- Étape 3 : validation de la grille 3×3 ----------------------
        grid = _sort_grid(candidates, expected=9)

        used_fallback = False
        fallback_meta: Dict[str, float] = {}
        if grid is not None:
            # On peut avoir plus de 9 candidats ; _sort_grid a sélectionné les 9 meilleurs
            contours_for_color = grid
            colors = []
            hsv_stats = []
            for c in contours_for_color:
                x, y, w, h = cv2.boundingRect(c)
                # Rognage intérieur de 15 % pour éviter les bords noirs du sticker
                margin_x = max(1, int(w * 0.15))
                margin_y = max(1, int(h * 0.15))
                roi = hsv[y+margin_y:y+h-margin_y, x+margin_x:x+w-margin_x]
                color = _classify_color_hsv(roi)
                colors.append(color)
                mean_h = int(np.mean(roi[:, :, 0])) if roi.size else 0
                mean_s = int(np.mean(roi[:, :, 1])) if roi.size else 0
                mean_v = int(np.mean(roi[:, :, 2])) if roi.size else 0
                hsv_stats.append({'h': mean_h, 's': mean_s, 'v': mean_v})
        else:
            # --- Fallback : grille forcée --------------------------------
            logger.info("Grid validation failed, using fallback grid")
            used_fallback = True
            colors, contours_for_color, hsv_stats, fallback_meta = _fallback_grid_debug(hsv)

        while len(colors) < 9:
            colors.append('U')

        cube_present, cube_presence_score, presence_reason = _estimate_cube_presence(
            image=image,
            hsv=hsv,
            contours=contours_for_color,
            fallback=used_fallback,
            fallback_meta=fallback_meta,
        )

        info = {
            'contours': contours_for_color,
            'colors': colors,
            'hsv_stats': hsv_stats,
            'fallback': used_fallback,
            'candidates_count': len(candidates),
            'cube_present': cube_present,
            'cube_presence_score': cube_presence_score,
            'presence_reason': presence_reason,
        }
        return colors, info

    def _detect_with_classic_debug(self, base64_data: str) -> Dict:
        """Détection classique + image annotée pour le debug frontend."""
        nparr = np.frombuffer(base64.b64decode(base64_data), np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if image is None:
            return {'error': 'Failed to decode image', 'success': False}

        colors, info = self._detect_stickers(image)

        # Construire stickers_info au format attendu par le frontend
        stickers_info = []
        for i, color in enumerate(colors):
            entry: Dict = {'index': i, 'color': color}

            if i < len(info['contours']):
                c = info['contours'][i]
                x, y, w, h = cv2.boundingRect(c)
                entry['position'] = {'x': int(x), 'y': int(y), 'w': int(w), 'h': int(h)}
            else:
                entry['position'] = {'x': 0, 'y': 0, 'w': 0, 'h': 0}

            if i < len(info['hsv_stats']):
                s = info['hsv_stats'][i]
                entry['hsv_mean'] = s
            else:
                entry['hsv_mean'] = {'h': 0, 's': 0, 'v': 0}

            stickers_info.append(entry)

        # Image annotée
        debug_image = _annotate_image(image, info['contours'], colors, info['hsv_stats'])
        _, buf = cv2.imencode('.jpg', debug_image)
        debug_b64 = base64.b64encode(buf).decode('utf-8')

        warnings = list(info.get('warnings') or [])
        if info['fallback']:
            warnings.append('Fallback grid used — cube not clearly detected')
        if not info.get('cube_present', False):
            warnings.append('No reliable cube face detected in frame')

        return {
            'success': bool(info.get('cube_present', False)),
            'provider': 'classic',
            'model': 'opencv-canny-hsv',
            'contours_found': len(info['contours']) if not info['fallback'] else 0,
            'stickers': stickers_info,
            'debug_image': f'data:image/jpeg;base64,{debug_b64}',
            'warnings': warnings,
            'cube_present': bool(info.get('cube_present', False)),
            'cube_presence_score': int(round(float(info.get('cube_presence_score', 0.0)) * 100)),
            'presence_reason': str(info.get('presence_reason', 'unknown')),
            'error': None if info.get('cube_present', False) else 'No reliable cube face detected',
        }

    # ------------------------------------------------------------------
    # Détection Ollama (LLM vision)
    # ------------------------------------------------------------------

    def _detect_with_ollama_debug(self, base64_data: str) -> Dict:
        """Détection assistée par un modèle vision local via Ollama."""
        image_bytes = base64.b64decode(base64_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if image is None:
            return {'error': 'Failed to decode image', 'success': False}

        height, width = image.shape[:2]
        prompt = (
            'You analyze a camera frame of a Rubik\'s cube held in hand. '
            'Return valid JSON only, no markdown, no explanation. '
            'First decide if a 3x3 Rubik face is clearly visible. '
            'If no clear Rubik face is visible, set cube_present=false and return an empty stickers array. '
            'Goal when cube_present=true: identify the 9 visible stickers as accurately as possible despite worn colors. '
            'Use only cube labels U,R,F,D,L,B for colors. '
            'Schema: {"success":true,"provider":"ollama","model":"...","cube_present":true,'
            '"cube_presence_score":0,"contours_found":9,'
            '"stickers":[{"index":0,"color":"U","position":{"x":0,"y":0,"w":0,"h":0},'
            '"hsv_mean":{"h":0,"s":0,"v":0},"confidence":0,"notes":""}],"warnings":[],"face_hint":"..."}. '
            f'Image size is {width}x{height} pixels. '
            'When cube_present=true, return exactly 9 sticker entries in reading order from top-left to bottom-right. '
            'When cube_present=false, return stickers as []. '
            'If a sticker is uncertain, keep the best guess and lower confidence. '
            'cube_presence_score and confidence must be between 0 and 100. '
            'Position values must be integers in the original image coordinate system.'
        )

        payload = {
            'model': self.ollama_model,
            'messages': [{'role': 'user', 'content': prompt, 'images': [base64_data]}],
            'stream': False,
            'options': {'temperature': 0, 'num_ctx': 2048},
        }

        response_payload = None
        last_error: object | None = None
        for base_url in self._ollama_candidate_base_urls():
            try:
                req = request.Request(
                    f'{base_url}/api/chat',
                    data=json.dumps(payload).encode('utf-8'),
                    headers={'Content-Type': 'application/json'},
                    method='POST',
                )
                with request.urlopen(req, timeout=self.ollama_timeout) as resp:
                    response_payload = json.loads(resp.read().decode('utf-8'))
                    self.ollama_base_url = base_url
                    break
            except error.HTTPError as exc:
                last_error = self._read_http_error_body(exc)
            except Exception as exc:
                last_error = exc

        if response_payload is None:
            raise RuntimeError(f'Ollama unavailable on all candidate URLs: {last_error}')

        raw_text = (response_payload.get('message', {}).get('content', '')
                    or response_payload.get('response', ''))
        parsed = self._parse_json_response(raw_text)
        if not isinstance(parsed, dict):
            raise ValueError('Ollama response is not a JSON object')

        cube_present_raw = parsed.get('cube_present', True)
        if isinstance(cube_present_raw, bool):
            cube_present = cube_present_raw
        else:
            cube_present = str(cube_present_raw).strip().lower() in {'1', 'true', 'yes', 'y'}

        cube_presence_score = self._clamp_int(parsed.get('cube_presence_score', 0 if not cube_present else 70), 0, 100)

        stickers = parsed.get('stickers') or []
        normalized = [self._normalize_sticker(s, i, width, height) for i, s in enumerate(stickers[:9])]
        if cube_present:
            while len(normalized) < 9:
                normalized.append({'index': len(normalized), 'color': 'U',
                                    'position': {'x': 0, 'y': 0, 'w': 0, 'h': 0},
                                    'hsv_mean': {'h': 0, 's': 0, 'v': 0},
                                    'confidence': 0, 'notes': 'Missing'})
        else:
            # Pas de cube fiable: on renvoie des placeholders neutres.
            normalized = [{
                'index': i,
                'color': 'U',
                'position': {'x': 0, 'y': 0, 'w': 0, 'h': 0},
                'hsv_mean': {'h': 0, 's': 0, 'v': 0},
                'confidence': 0,
                'notes': 'No cube',
            } for i in range(9)]

        debug_image = image.copy()
        for sticker in normalized:
            self._draw_model_sticker(debug_image, sticker)

        _, buf = cv2.imencode('.jpg', debug_image)
        debug_b64 = base64.b64encode(buf).decode('utf-8')

        warnings = parsed.get('warnings') or []
        if not cube_present:
            warnings = [*warnings, 'No reliable cube face detected by vision model']

        summary = {
            'success': bool(cube_present),
            'provider': 'ollama',
            'model': self.ollama_model,
            'cube_present': bool(cube_present),
            'cube_presence_score': cube_presence_score,
            'contours_found': int(parsed.get('contours_found') or (len(normalized) if cube_present else 0)),
            'stickers': normalized,
            'warnings': warnings,
            'face_hint': parsed.get('face_hint', ''),
            'raw_response': raw_text,
            'debug_image': f'data:image/jpeg;base64,{debug_b64}',
            'error': None if cube_present else 'No reliable cube face detected',
        }
        if cube_present and summary['contours_found'] <= 0:
            summary['contours_found'] = len(normalized)
        return summary

    # ------------------------------------------------------------------
    # Helpers Ollama
    # ------------------------------------------------------------------

    def _ollama_candidate_base_urls(self) -> List[str]:
        candidates: List[str] = []
        def add(url: str) -> None:
            n = url.rstrip('/')
            if n and n not in candidates:
                candidates.append(n)
        add(self.ollama_base_url)
        add('http://localhost:11434')
        add('http://host.docker.internal:11434')
        return candidates

    def _read_http_error_body(self, exc: error.HTTPError) -> str:
        try:
            body = exc.read().decode('utf-8', errors='replace')
            if body:
                return f'{exc.code}: {body}'
        except Exception:
            pass
        return f'{exc.code}: {exc.reason}'

    def _draw_model_sticker(self, image: np.ndarray, sticker: Dict) -> None:
        pos = sticker.get('position') or {}
        x, y, w, h = int(pos.get('x', 0)), int(pos.get('y', 0)), int(pos.get('w', 0)), int(pos.get('h', 0))
        color = self._normalize_color_label(str(sticker.get('color', 'U')))
        bgr = COLOR_BGR.get(color, (128, 128, 128))
        confidence = int(sticker.get('confidence', 0))
        if w > 0 and h > 0:
            cv2.rectangle(image, (x, y), (x + w, y + h), bgr, 2)
            cv2.putText(image, f"{color} {confidence}%", (x, max(12, y - 5)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, bgr, 1, cv2.LINE_AA)

    def _detect_with_yolo_debug(self, base64_data: str) -> Dict:
        """Utilise un modèle YOLO (si disponible) pour localiser le cube, puis exécute le pipeline classique sur le crop."""
        image_bytes = base64.b64decode(base64_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if image is None:
            return {'error': 'Failed to decode image', 'success': False}

        model_path = os.getenv('YOLO_MODEL_PATH', '')
        boxes = []

        # Tentative 1: Ultralytics YOLO
        try:
            from ultralytics import YOLO

            if not model_path:
                model_path = '/models/rubik_yolo.pt'

            model = YOLO(model_path)
            results = model(image, imgsz=640)
            if len(results) > 0:
                r = results[0]
                if hasattr(r, 'boxes') and r.boxes is not None:
                    try:
                        xyxy = r.boxes.xyxy.cpu().numpy()
                        confs = r.boxes.conf.cpu().numpy() if hasattr(r.boxes, 'conf') else np.ones(len(xyxy))
                    except Exception:
                        # Structure inattendue, ignorer
                        xyxy = np.array([])
                        confs = np.array([])

                    for i, bb in enumerate(xyxy):
                        x0, y0, x1, y1 = [int(float(v)) for v in bb[:4]]
                        boxes.append({'x': x0, 'y': y0, 'w': max(1, x1 - x0), 'h': max(1, y1 - y0), 'conf': float(confs[i]) if i < len(confs) else 1.0})
        except Exception:
            boxes = []

        # Tentative 2: module local rubik_yolo (si présent)
        if not boxes:
            try:
                import rubik_yolo
                if hasattr(rubik_yolo, 'detect'):
                    # detect devrait renvoyer une liste de dicts avec x,y,w,h
                    found = rubik_yolo.detect(image)
                    if isinstance(found, list):
                        boxes = found
            except Exception:
                boxes = boxes or []

        if not boxes:
            return {
                'success': False,
                'provider': 'yolo',
                'model': model_path or 'rubik-yolo',
                'contours_found': 0,
                'stickers': [],
                'warnings': ['No YOLO detections'],
                'cube_present': False,
                'cube_presence_score': 0,
                'presence_reason': 'yolo_no_detections',
                'error': 'No YOLO detections',
            }

        # Choisir la boîte la plus grande
        best = max(boxes, key=lambda b: b.get('w', 0) * b.get('h', 0))
        x, y, w, h = int(best.get('x', 0)), int(best.get('y', 0)), int(best.get('w', 0)), int(best.get('h', 0))
        h_img, w_img = image.shape[:2]
        x0 = max(0, min(w_img - 1, x))
        y0 = max(0, min(h_img - 1, y))
        x1 = max(0, min(w_img, x + w))
        y1 = max(0, min(h_img, y + h))

        crop = image[y0:y1, x0:x1]
        colors, info = self._detect_stickers(crop)

        stickers_info = []
        for i, color in enumerate(colors):
            entry = {'index': i, 'color': color}
            if i < len(info.get('contours', [])):
                c = info['contours'][i]
                bx, by, bw, bh = cv2.boundingRect(c)
                entry['position'] = {'x': int(bx + x0), 'y': int(by + y0), 'w': int(bw), 'h': int(bh)}
            else:
                entry['position'] = {'x': 0, 'y': 0, 'w': 0, 'h': 0}

            entry['hsv_mean'] = info.get('hsv_stats', [])[i] if i < len(info.get('hsv_stats', [])) else {'h': 0, 's': 0, 'v': 0}
            stickers_info.append(entry)

        out = image.copy()
        cv2.rectangle(out, (x0, y0), (x1, y1), (0, 255, 0), 2)
        for s in stickers_info:
            self._draw_model_sticker(out, s)

        _, buf = cv2.imencode('.jpg', out)
        debug_b64 = base64.b64encode(buf).decode('utf-8')

        return {
            'success': bool(info.get('cube_present', False)),
            'provider': 'yolo',
            'model': model_path or 'rubik-yolo',
            'cube_present': bool(info.get('cube_present', False)),
            'cube_presence_score': int(round(float(info.get('cube_presence_score', 0.0)) * 100)),
            'contours_found': len(info.get('contours', [])),
            'stickers': stickers_info,
            'warnings': info.get('warnings', []),
            'presence_reason': info.get('presence_reason', ''),
            'debug_image': f'data:image/jpeg;base64,{debug_b64}',
            'error': None if info.get('cube_present', False) else 'No reliable cube face detected by YOLO+classic',
        }

    def _normalize_sticker(self, sticker: Dict, index: int, frame_w: int, frame_h: int) -> Dict:
        color = self._normalize_color_label(str(sticker.get('color', 'U')))
        pos = sticker.get('position') or {}
        x = self._clamp_int(pos.get('x', 0), 0, frame_w)
        y = self._clamp_int(pos.get('y', 0), 0, frame_h)
        w = self._clamp_int(pos.get('w', max(1, frame_w // 5)), 1, frame_w)
        h = self._clamp_int(pos.get('h', max(1, frame_h // 5)), 1, frame_h)
        return {
            'index': index,
            'color': color,
            'position': {'x': x, 'y': y, 'w': w, 'h': h},
            'hsv_mean': {'h': 0, 's': 0, 'v': 0},
            'confidence': self._clamp_int(sticker.get('confidence', 0), 0, 100),
            'notes': str(sticker.get('notes', '')).strip(),
        }

    def _normalize_color_label(self, color: str) -> str:
        aliases = {
            'WHITE': 'U', 'W': 'U',
            'YELLOW': 'D', 'Y': 'D',
            'RED': 'R',
            'GREEN': 'F', 'G': 'F',
            'BLUE': 'B',
            'ORANGE': 'L', 'O': 'L',
            'U': 'U', 'R': 'R', 'F': 'F', 'D': 'D', 'L': 'L', 'B': 'B',
        }
        return aliases.get(color.strip().upper(), 'U')

    def _clamp_int(self, value, minimum: int, maximum: int) -> int:
        try:
            n = int(round(float(value)))
        except (TypeError, ValueError):
            n = minimum
        return max(minimum, min(maximum, n))

    def _parse_json_response(self, raw_text: str):
        cleaned = raw_text.strip()
        if cleaned.startswith('```'):
            cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r'\s*```$', '', cleaned)
        cleaned = cleaned.replace('“', '"').replace('”', '"').replace('’', "'")
        cleaned = re.sub(r',\s*([}\]])', r'\1', cleaned)
        match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if match:
            cleaned = match.group(0)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            logger.debug('Could not parse Ollama JSON, raw: %s', raw_text)
            raise
