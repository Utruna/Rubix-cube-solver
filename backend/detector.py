import base64
import json
import logging
import os
import re
from typing import Dict, List, Tuple, Optional
from urllib import error, request

import cv2
import numpy as np


logger = logging.getLogger(__name__)

class CubeDetector:
    """Détecte l'état d'un Rubik's cube à partir d'une image."""

    def __init__(self):
        self.cube_state: Dict[str, List[str]] = {
            'U': [], 'R': [], 'F': [], 'D': [], 'L': [], 'B': []
        }
        self.provider_mode = os.getenv('DETECTOR_PROVIDER', 'auto').lower()
        self.ollama_base_url = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434').rstrip('/')
        self.ollama_model = os.getenv('OLLAMA_VISION_MODEL', 'qwen2.5-vl:7b-instruct')
        self.ollama_timeout = float(os.getenv('OLLAMA_TIMEOUT_SECONDS', '60'))

    def detect_from_image(self, image_path: str) -> Optional[Dict]:
        """Détecte l'état du cube à partir d'une image."""
        image = cv2.imread(image_path)
        if image is None:
            return None
        return self.process_image(image)

    def detect_from_base64(self, base64_data: str) -> Optional[Dict]:
        """Détecte le cube à partir d'une image base64."""
        nparr = np.frombuffer(base64.b64decode(base64_data), np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            return None
        return self.process_image(image)

    def detect_with_debug(self, base64_data: str) -> Dict:
        """Détecte avec infos de debug (image annotée + détails)."""
        if self.provider_mode != 'classic':
            try:
                return self._detect_with_ollama_debug(base64_data)
            except Exception as exc:
                logger.warning('Vision model detection failed, falling back to classic detector: %s', exc)

        return self._detect_with_classic_debug(base64_data)

    def _detect_with_classic_debug(self, base64_data: str) -> Dict:
        """Détection classique avec contours et couleurs HSV."""
        nparr = np.frombuffer(base64.b64decode(base64_data), np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if image is None:
            return {'error': 'Failed to decode image', 'success': False}

        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        debug_image = image.copy()
        stickers_info = []

        # Détecter les contours
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 100, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

        # Filtrer les contours carrés
        square_contours = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < 500 or area > 100000:
                continue

            epsilon = 0.04 * cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)

            if len(approx) == 4:
                square_contours.append(approx)

        # Dessiner tous les contours détectés
        cv2.drawContours(debug_image, square_contours, -1, (0, 255, 0), 2)

        # Trier et extraire les couleurs
        if len(square_contours) >= 9:
            square_contours.sort(key=cv2.contourArea, reverse=True)
            square_contours = square_contours[:9]
            square_contours.sort(key=lambda x: (x[0, 0, 1], x[0, 0, 0]))

            for i, contour in enumerate(square_contours):
                x, y, w, h = cv2.boundingRect(contour)
                roi = hsv[y:y+h, x:x+w]

                if roi.size > 0:
                    color = self._classify_color_from_roi(roi)
                    color_rgb = self._get_color_rgb(color)

                    # Dessiner le sticker détecté
                    cv2.rectangle(debug_image, (x, y), (x+w, y+h), color_rgb, 3)
                    cv2.putText(debug_image, color, (x, y-5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color_rgb, 2)

                    # Stats HSV
                    mean_h = np.mean(roi[:, :, 0])
                    mean_s = np.mean(roi[:, :, 1])
                    mean_v = np.mean(roi[:, :, 2])

                    stickers_info.append({
                        'index': i,
                        'color': color,
                        'position': {'x': x, 'y': y, 'w': w, 'h': h},
                        'hsv_mean': {'h': int(mean_h), 's': int(mean_s), 'v': int(mean_v)},
                    })
        else:
            stickers_info.append({
                'warning': f'Only {len(square_contours)} contours found, using fallback grid method'
            })

        # Convertir l'image en base64
        _, buffer = cv2.imencode('.jpg', debug_image)
        debug_image_b64 = base64.b64encode(buffer).decode('utf-8')

        return {
            'success': True,
            'provider': 'classic',
            'model': 'opencv-hsv',
            'contours_found': len(square_contours),
            'stickers': stickers_info,
            'debug_image': f'data:image/jpeg;base64,{debug_image_b64}',
        }

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
            'Goal: identify the 9 visible stickers as accurately as possible despite worn colors. '\
            'Use only cube labels U,R,F,D,L,B for colors. '
            'Schema: {"success":true,"provider":"ollama","model":"...","contours_found":9,'
            '"stickers":[{"index":0,"color":"U","position":{"x":0,"y":0,"w":0,"h":0},'
            '"confidence":0,"notes":""}],"warnings":[],"face_hint":"..."}. '
            f'Image size is {width}x{height} pixels. '
            'Return exactly 9 sticker entries in reading order from top-left to bottom-right. '
            'If a sticker is uncertain, keep the best guess and lower confidence. '
            'If a box is approximate, still provide it. '
            'Confidence must be between 0 and 100. '
            'Position values must be integers in the original image coordinate system.'
        )

        payload = {
            'model': self.ollama_model,
            'prompt': prompt,
            'images': [base64_data],
            'stream': False,
            'format': 'json',
            'options': {
                'temperature': 0,
            },
        }

        req = request.Request(
            f'{self.ollama_base_url}/api/generate',
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST',
        )

        with request.urlopen(req, timeout=self.ollama_timeout) as response:
            response_payload = json.loads(response.read().decode('utf-8'))

        raw_text = response_payload.get('response', '')
        parsed = self._parse_json_response(raw_text)
        if not isinstance(parsed, dict):
            raise ValueError('Ollama response is not a JSON object')

        stickers = parsed.get('stickers') or []
        normalized_stickers = []
        for index, sticker in enumerate(stickers[:9]):
            normalized_stickers.append(self._normalize_sticker(sticker, index, width, height))

        while len(normalized_stickers) < 9:
            normalized_stickers.append({
                'index': len(normalized_stickers),
                'color': 'U',
                'position': {'x': 0, 'y': 0, 'w': 0, 'h': 0},
                'confidence': 0,
                'notes': 'Missing sticker from model output',
            })

        debug_image = image.copy()
        for sticker in normalized_stickers:
            self._draw_model_sticker(debug_image, sticker)

        warnings = parsed.get('warnings') or []
        summary = {
            'success': True,
            'provider': 'ollama',
            'model': self.ollama_model,
            'contours_found': int(parsed.get('contours_found') or len(normalized_stickers)),
            'stickers': normalized_stickers,
            'warnings': warnings,
            'face_hint': parsed.get('face_hint', ''),
            'raw_response': raw_text,
        }

        if summary['contours_found'] <= 0:
            summary['contours_found'] = len(normalized_stickers)

        _, buffer = cv2.imencode('.jpg', debug_image)
        debug_image_b64 = base64.b64encode(buffer).decode('utf-8')
        summary['debug_image'] = f'data:image/jpeg;base64,{debug_image_b64}'
        return summary

    def _draw_model_sticker(self, image, sticker: Dict) -> None:
        position = sticker.get('position') or {}
        x = int(position.get('x', 0))
        y = int(position.get('y', 0))
        w = int(position.get('w', 0))
        h = int(position.get('h', 0))
        confidence = int(sticker.get('confidence', 0))
        color = sticker.get('color', 'U')
        color_rgb = self._get_color_rgb(self._normalize_color_label(color))

        if w > 0 and h > 0:
          cv2.rectangle(image, (x, y), (x + w, y + h), color_rgb, 3)
          label = f"{self._normalize_color_label(color)} {confidence}%"
          cv2.putText(image, label, (x, max(12, y - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color_rgb, 2)

    def _normalize_sticker(self, sticker: Dict, index: int, frame_w: int, frame_h: int) -> Dict:
        color = self._normalize_color_label(str(sticker.get('color', 'U')))
        position = sticker.get('position') or {}
        x = self._clamp_int(position.get('x', 0), 0, frame_w)
        y = self._clamp_int(position.get('y', 0), 0, frame_h)
        w = self._clamp_int(position.get('w', max(1, frame_w // 5)), 1, frame_w)
        h = self._clamp_int(position.get('h', max(1, frame_h // 5)), 1, frame_h)
        confidence = self._clamp_int(sticker.get('confidence', 0), 0, 100)

        return {
            'index': index,
            'color': color,
            'position': {'x': x, 'y': y, 'w': w, 'h': h},
            'confidence': confidence,
            'notes': str(sticker.get('notes', '')).strip(),
        }

    def _normalize_color_label(self, color: str) -> str:
        label = color.strip().upper()
        aliases = {
            'WHITE': 'U',
            'W': 'U',
            'YELLOW': 'D',
            'Y': 'D',
            'RED': 'R',
            'R': 'R',
            'GREEN': 'F',
            'G': 'F',
            'BLUE': 'B',
            'B': 'B',
            'ORANGE': 'L',
            'O': 'L',
            'U': 'U',
            'F': 'F',
            'D': 'D',
            'L': 'L',
        }
        return aliases.get(label, 'U')

    def _clamp_int(self, value, minimum: int, maximum: int) -> int:
        try:
            number = int(round(float(value)))
        except (TypeError, ValueError):
            number = minimum
        return max(minimum, min(maximum, number))

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
            logger.debug('Could not parse Ollama JSON, raw text: %s', raw_text)
            raise

    def _get_color_rgb(self, color_char: str) -> Tuple[int, int, int]:
        """Retourne la couleur RGB pour le dessin (BGR pour OpenCV)."""
        colors = {
            'U': (255, 255, 255),  # Blanc -> BGR
            'R': (0, 0, 255),      # Rouge
            'F': (0, 255, 0),      # Vert
            'D': (0, 255, 255),    # Jaune
            'L': (0, 165, 255),    # Orange
            'B': (255, 0, 0),      # Bleu
        }
        return colors.get(color_char, (128, 128, 128))

    def process_image(self, image) -> Dict:
        """Traite l'image pour détecter les couleurs du cube."""
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        detected_state = {}

        for face in ['U', 'R', 'F', 'D', 'L', 'B']:
            detected_state[face] = self._detect_face_stickers(image, hsv, face)

        return detected_state

    def _detect_face_stickers(self, bgr_image, hsv_image, face: str) -> List[str]:
        """Détecte les 9 stickers d'une face."""
        h, w = hsv_image.shape[:2]
        stickers = []

        gray = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 100, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

        square_contours = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < 500 or area > 100000:
                continue

            epsilon = 0.04 * cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)

            if len(approx) == 4:
                square_contours.append(approx)

        if len(square_contours) >= 9:
            square_contours.sort(key=cv2.contourArea, reverse=True)
            square_contours = square_contours[:9]
            square_contours.sort(key=lambda x: (x[0, 0, 1], x[0, 0, 0]))

            for contour in square_contours:
                x, y, w_c, h_c = cv2.boundingRect(contour)
                roi = hsv_image[y:y+h_c, x:x+w_c]
                if roi.size > 0:
                    color = self._classify_color_from_roi(roi)
                    stickers.append(color)
        else:
            stickers = self._detect_by_grid(hsv_image)

        while len(stickers) < 9:
            stickers.append('U')
        return stickers[:9]

    def _detect_by_grid(self, hsv_image) -> List[str]:
        """Détecte en divisant en grille 3x3."""
        h, w = hsv_image.shape[:2]
        stickers = []

        size = min(h, w)
        start_x = (w - size) // 2
        start_y = (h - size) // 2
        roi = hsv_image[start_y:start_y+size, start_x:start_x+size]

        cell_h = size // 3
        cell_w = size // 3

        for row in range(3):
            for col in range(3):
                y1 = row * cell_h
                y2 = (row + 1) * cell_h
                x1 = col * cell_w
                x2 = (col + 1) * cell_w

                cell = roi[y1:y2, x1:x2]
                if cell.size > 0:
                    color = self._classify_color_from_roi(cell)
                    stickers.append(color)

        return stickers

    def _classify_color_from_roi(self, roi) -> str:
        """Classifie la couleur dominante d'une région."""
        roi_blur = cv2.blur(roi, (5, 5))

        mean_h = np.mean(roi_blur[:, :, 0])
        mean_s = np.mean(roi_blur[:, :, 1])
        mean_v = np.mean(roi_blur[:, :, 2])

        if mean_v < 40 or mean_s < 30:
            return 'U'

        if mean_h < 15 or mean_h > 175:
            if mean_s > 150:
                return 'R'
            else:
                return 'L'

        elif 15 <= mean_h < 35:
            return 'L' if mean_h < 25 else 'D'

        elif 35 <= mean_h < 65:
            return 'D' if mean_h < 45 else 'F'

        elif 65 <= mean_h < 100:
            return 'F'

        elif 100 <= mean_h < 140:
            return 'B'

        elif 140 <= mean_h <= 175:
            return 'B'

        if mean_v < 100:
            return 'U'

        return 'U'


