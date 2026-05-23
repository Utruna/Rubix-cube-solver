from flask import Flask, request, jsonify
from flask_cors import CORS
from detector import CubeDetector
import base64
import logging
import sys

app = Flask(__name__)
CORS(app)
detector = CubeDetector()

# Configuration du logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)


@app.route('/health', methods=['GET'])
def health():
    """Endpoint de santé."""
    logger.info("Health check")
    return jsonify({'status': 'ok', 'message': 'Backend is running'})


@app.route('/api/detect', methods=['POST', 'OPTIONS'])
def detect_cube():
    """
    Détecte l'état du cube à partir d'une image base64.
    """
    if request.method == 'OPTIONS':
        return '', 200

    try:
        logger.info("Detect cube request received")
        data = request.get_json()

        if not data or 'image' not in data:
            logger.error("Missing image in request")
            return jsonify({'error': 'Missing image in request'}), 400

        image_data = data['image']
        logger.info(f"Image data received: {len(image_data)} bytes")

        # Enlever le préfixe data:image/jpeg;base64, si présent
        if ',' in image_data:
            image_data = image_data.split(',')[1]

        logger.info("Processing image...")
        result = detector.detect_from_base64(image_data)

        if result is None:
            logger.error("Failed to process image")
            return jsonify({'error': 'Failed to process image'}), 400

        logger.info(f"Detection successful: {result}")
        return jsonify({
            'state': result,
            'success': True
        })

    except Exception as e:
        logger.exception(f"Error detecting cube: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/debug-detect', methods=['POST', 'OPTIONS'])
def debug_detect():
    """
    Endpoint de debug - retourne une image annotée avec les stickers détectés.
    """
    if request.method == 'OPTIONS':
        return '', 200

    try:
        logger.info("Debug detect request received")
        data = request.get_json()

        if not data or 'image' not in data:
            logger.error("Missing image in request")
            return jsonify({'error': 'Missing image in request'}), 400

        image_data = data['image']

        if ',' in image_data:
            image_data = image_data.split(',')[1]

        logger.info("Processing image with debug...")
        result = detector.detect_with_debug(image_data)

        logger.info(f"Debug detection result: {result.get('contours_found')} contours found")
        return jsonify(result)

    except Exception as e:
        logger.exception(f"Error in debug detect: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/calibrate', methods=['POST'])
def calibrate():
    """Endpoint pour calibrer la détection des couleurs."""
    return jsonify({
        'message': 'Calibration endpoint - not yet implemented'
    }), 501


if __name__ == '__main__':
    logger.info("Starting Flask app...")
    app.run(host='0.0.0.0', port=5000, debug=True)

