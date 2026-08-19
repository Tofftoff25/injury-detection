"""A.I.D.E. - AI-Guided Instructional Device for Emergencies
Flask backend serving the web-based touchscreen UI.
"""

from flask import Flask, jsonify, request, send_from_directory
import os
import webbrowser
from threading import Timer
import traceback
import sys
import json
import base64
import time
import hashlib
import uuid
import requests
from dotenv import load_dotenv
from PIL import Image, ImageOps
from local_detector import load_detector_from_env, LocalDetectorError
import io

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, "FRONTEND")

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")

import logging
app.logger.setLevel(logging.INFO)

# Load environment variables
load_dotenv()

# ---------------------------------------------------------------------------
# SCAN 
# ---------------------------------------------------------------------------

app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB upload limit

# Local TFLite detector — loaded once at startup, reused for every
# /api/scan request. No internet, no API key, no per-request network
# call. If the model file is missing, `detector` will be None and
# /api/scan/status will correctly report the scan feature as
# unavailable rather than crashing the whole app.
detector = load_detector_from_env(
    default_model_path=os.path.join(FRONTEND_DIR, "MODEL", "injury-baseline.tflite"),
    default_labels_path=os.path.join(FRONTEND_DIR, "MODEL", "labels.json"),
)

if detector is None:
    app.logger.warning(
        "Local detector failed to load — scanning will be unavailable "
        "until FRONTEND/MODEL/injury-baseline.tflite is present."
    )
else:
    app.logger.info("Local TFLite detector loaded. Labels: %s", detector.labels)
# Where annotated images returned by the workflow are written to disk.
# Already covered by .gitignore's "captures/" entry.
ANNOTATED_IMAGE_DIR = os.path.join(BASE_DIR, "captures", "annotated")

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}

# Maps model labels to keys in injuries.json
MODEL_TO_INJURY_KEY = {
    "abrasions": "cuts and wounds",
    "abrasion": "cuts and wounds",
    "cut": "cuts and wounds",
    "cuts": "cuts and wounds",
    "wound": "cuts and wounds",
    "bruise": "bruises",
    "bruises": "bruises",
    "burn": "burns",
    "burns": "burns",
    "swelling": "sprains"
}

# ---------------------------------------------------------------------------
# LOAD INJURY DATABASE FROM JSON (with fallback)
# ---------------------------------------------------------------------------
INJURY_FILE = os.path.join(BASE_DIR, "injuries.json")

def load_injury_database():
    try:
        with open(INJURY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        app.logger.warning("injuries.json not found – using hardcoded fallback.")
        return INJURY_DATABASE_FALLBACK

# Fallback – now we must make it complete, otherwise the app will be broken.
# But the JSON should always exist; we keep this as a last resort.
INJURY_DATABASE_FALLBACK = {
    "cuts and wounds": {
        "icon_file": "cuts_and_wounds.png",
        "level": "Moderate",
        "steps": [
            "Wash your hands before touching the wound.",
            "Apply gentle pressure with a clean cloth or gauze to stop bleeding.",
            "Rinse the wound with clean water to remove dirt.",
            "Apply antiseptic wipes around (not inside) the wound.",
            "Cover with a sterile bandage or gauze pad.",
            "Seek medical help if bleeding does not stop after 10 minutes."
        ],
        "steps_tl": [
            "Hugasan ang iyong mga kamay bago hawakan ang sugat.",
            "Idiin nang bahagya gamit ang malinis na tela o gasa para mapigilan ang pagdugo.",
            "Banlawan ang sugat gamit ang malinis na tubig para matanggal ang dumi.",
            "Maglagay ng antiseptic wipes sa paligid (hindi sa loob) ng sugat.",
            "Takpan ng sterile na bandage o gasa.",
            "Humingi ng tulong medikal kung hindi tumitigil ang pagdugo pagkalipas ng 10 minuto."
        ]
    },
    # ... add all other injuries here if you want the fallback to work,
    # but it's easier to just rely on the JSON file.
}

# Now set INJURY_DATABASE to the loaded version
INJURY_DATABASE = load_injury_database()

# ---------------------------------------------------------------------------
# FILIPINO DISPLAY NAMES (keep as is)
# ---------------------------------------------------------------------------
NAME_TL = {
    "cuts and wounds": "Sugat",
    "burns": "Paso",
    "sprains": "Pilay",
    "nosebleed": "Dumudugong Ilong",
    "choking": "Nabubulunan",
    "fainting": "Himatay",
    "bruises": "Pasa",
    "insect bites": "Kagat ng Insekto",
    "cardiac arrest": "Atake sa Puso",
    "stroke": "Stroke",
    "seizures": "Kumbulsyon",
    "allergic reaction": "Allergic Reaction",
    "heat stroke": "Heat Stroke",
    "hypothermia": "Hipotermya",
    "concussion": "Pinsala sa Ulo",
    "fracture": "Bali",
    "anaphylaxis": "Anaphylaxis",
    "poisoning": "Pagkalason",
    "drowning": "Nalunod",
    "snake bite": "Kagat ng Ahas"
}

# ---------------------------------------------------------------------------
# SYNONYM MAPPING (keep as is)
# ---------------------------------------------------------------------------
SYNONYM_MAP = {
    "break": "sprains",
    "fracture": "sprains",
    "broken bone": "sprains",
    "sugat": "cuts and wounds",
    "hiwa": "cuts and wounds",
    "wound": "cuts and wounds",
    "cut": "cuts and wounds",
    "pasa": "bruises",
    "bruise": "bruises",
    "sunog": "burns",
    "paso": "burns",
    "burn": "burns",
    "lamog": "sprains",
    "pilay": "sprains",
    "sprain": "sprains",
    "ilong dumudugo": "nosebleed",
    "dumudugong ilong": "nosebleed",
    "bleeding nose": "nosebleed",
    "nabubulunan": "choking",
    "choke": "choking",
    "himatay": "fainting",
    "nahimatay": "fainting",
    "faint": "fainting",
    "unconscious": "fainting",
    "kagat ng insekto": "insect bites",
    "bite": "insect bites",
    "sting": "insect bites",
    "kagat": "insect bites",
    "atake sa puso": "cardiac arrest",
    "heart attack": "cardiac arrest",
    "stroke": "stroke",
    "seizure": "seizures",
    "kumbulsyon": "seizures",
    "pangingisay": "seizures",
    "epilepsy": "seizures",
    "allergy": "allergic reaction",
    "heat stroke": "heat stroke",
    "heatstroke": "heat stroke",
    "init": "heat stroke",
    "hypothermia": "hypothermia",
    "lamig": "hypothermia",
    "concussion": "concussion",
    "ulo": "concussion",
    "bali": "fracture",
    "anaphylaxis": "anaphylaxis",
    "allergic": "anaphylaxis",
    "poison": "poisoning",
    "lason": "poisoning",
    "drowning": "drowning",
    "nalunod": "drowning",
    "ahas": "snake bite",
    "snake": "snake bite"
}

# ---------------------------------------------------------------------------
# HELPER FUNCTIONS
# ---------------------------------------------------------------------------
def display_name(key, lang):
    if lang == "tl" and key in NAME_TL:
        return NAME_TL[key]
    return key.title()

def resolve_injury_key(query):
    query = (query or "").strip().lower()
    if not query:
        return None
    if query in SYNONYM_MAP:
        mapped = SYNONYM_MAP[query]
        if mapped in INJURY_DATABASE:
            return mapped
    if query in INJURY_DATABASE:
        return query
    for key in INJURY_DATABASE:
        if query in key or key in query:
            return key
    for syn_key, mapped in SYNONYM_MAP.items():
        if query in syn_key or syn_key in query:
            if mapped in INJURY_DATABASE:
                return mapped
    return None

def search_suggestions(query):
    query = (query or "").strip().lower()
    if not query:
        return []
    matches = set()
    for key in INJURY_DATABASE:
        if query in key:
            matches.add(key)
    for syn_key, mapped in SYNONYM_MAP.items():
        if query in syn_key and mapped in INJURY_DATABASE:
            matches.add(mapped)
    return sorted(matches)

def normalize_model_label(value):
    return str(value or "").strip().lower()

def map_model_label_to_injury(model_label):
    """Map a detector class to a safe injuries.json key."""
    normalized = normalize_model_label(model_label)
    mapped = MODEL_TO_INJURY_KEY.get(normalized)

    if mapped and mapped in INJURY_DATABASE:
        return mapped

    return None

def normalize_to_jpeg(image_bytes):
    """
    Decode whatever image format was uploaded and re-encode as JPEG.
    Roboflow's inference backend has been unreliable with non-JPEG
    input (e.g. WebP) in testing, so we normalize everything before
    sending it, regardless of the original upload format.

    EXIF orientation is applied so photos from phone cameras are not
    sent to the model sideways or upside down.
    """
    with Image.open(io.BytesIO(image_bytes)) as img:
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")  # drops alpha channel if present, e.g. PNG
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=90)
        return buffer.getvalue()

# ---------------------------------------------------------------------------
# ROUTES WITH IMPROVED ERROR HANDLING
# ---------------------------------------------------------------------------
@app.route("/")
def home():
    try:
        return send_from_directory(os.path.join(FRONTEND_DIR, "HTML"), "index.html")
    except Exception as e:
        app.logger.error(f"Error serving home: {traceback.format_exc()}")
        return "Internal Server Error", 500

@app.route("/<path:filename>")
def serve_frontend_assets(filename):
    try:
        return send_from_directory(FRONTEND_DIR, filename)
    except Exception as e:
        app.logger.error(f"Error serving asset {filename}: {traceback.format_exc()}")
        return "Not Found", 404

@app.route("/icons/<path:filename>")
def icons(filename):
    try:
        return send_from_directory(os.path.join(FRONTEND_DIR, "ICONS"), filename)
    except Exception as e:
        app.logger.error(f"Error serving icon {filename}: {traceback.format_exc()}")
        return "Not Found", 404

@app.route("/api/injuries")
def api_injuries():
    try:
        lang = request.args.get("lang", "en")
        result = [
            {
                "key": key,
                "name": display_name(key, lang),
                "icon": f"/icons/{data['icon_file']}",
                "level": data["level"],
            }
            for key, data in INJURY_DATABASE.items()
        ]
        return jsonify(result)
    except Exception as e:
        app.logger.error(f"Error in /api/injuries: {traceback.format_exc()}")
        return jsonify({"error": "Failed to load injuries"}), 500

@app.route("/api/suggest")
def api_suggest():
    try:
        query = request.args.get("q", "")
        matches = search_suggestions(query)
        result = [{"key": key, "name": key.title()} for key in matches]
        return jsonify(result)
    except Exception as e:
        app.logger.error(f"Error in /api/suggest: {traceback.format_exc()}")
        return jsonify([]), 500

@app.route("/api/search")
def api_search():
    try:
        query = request.args.get("q", "")
        key = resolve_injury_key(query)
        if key is None:
            return jsonify({"found": False, "query": query}), 404
        return jsonify({"found": True, "key": key})
    except Exception as e:
        app.logger.error(f"Error in /api/search: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/injury/<key>")
def api_injury_detail(key):
    try:
        key = key.strip().lower()
        data = INJURY_DATABASE.get(key)
        if data is None:
            return jsonify({"error": "not found"}), 404
        lang = request.args.get("lang", "en")
        steps = data.get("steps_tl") if lang == "tl" and data.get("steps_tl") else data["steps"]
        return jsonify({
            "key": key,
            "name": display_name(key, lang),
            "icon": f"/icons/{data['icon_file']}",
            "level": data["level"],
            "steps": steps,
        })
    except Exception as e:
        app.logger.error(f"Error in /api/injury/{key}: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/scan/status", methods=["GET"])
def api_scan_status():
    """Let the frontend check whether the local model is loaded and ready."""
    return jsonify({
        "available": detector is not None,
        "runtime": "local-tflite",
        "offline_capable": True,
    })

@app.route("/api/scan", methods=["POST"])
def api_scan():
    
    """
    Accept one captured image, run the Roboflow Workflow, and return a
    stable contract that can later be implemented by a local TFLite runtime.
    """
    try:
        if detector is None:
            return jsonify({
                "success": False,
                "supported": False,
                "predicted_class": "unsupported",
                "confidence": 0.0,
                "error": "The scan service is not configured.",
            }), 503

        uploaded = request.files.get("image")

        if uploaded is None:
            return jsonify({
                "success": False,
                "supported": False,
                "predicted_class": "unsupported",
                "confidence": 0.0,
                "error": "No image was provided.",
            }), 400

        content_type = (uploaded.mimetype or "").lower()

        if content_type not in ALLOWED_IMAGE_TYPES:
            return jsonify({
                "success": False,
                "supported": False,
                "predicted_class": "unsupported",
                "confidence": 0.0,
                "error": "Only JPEG, PNG, and WebP images are supported.",
            }), 415

        image_bytes = uploaded.read()
        app.logger.info(
            "Scan upload: bytes=%d content_type=%s sha256=%s",
            len(image_bytes), uploaded.mimetype, hashlib.sha256(image_bytes).hexdigest(),
        )
        
        if not image_bytes:
            return jsonify({
                "success": False,
                "supported": False,
                "predicted_class": "unsupported",
                "confidence": 0.0,
                "error": "The uploaded image is empty.",
            }), 400

        jpeg_bytes = normalize_to_jpeg(image_bytes)
        result = detector.predict(jpeg_bytes)
        app.logger.info("Local detector raw result: %s", result)

        model_class = str(result.get("predicted_class", "unsupported")).strip()

        try:
            confidence = float(result.get("confidence", 0.0))
        except (TypeError, ValueError):
            confidence = 0.0

        confidence = max(0.0, min(confidence, 1.0))

        workflow_supported = bool(result.get("supported", False))
        injury_key = map_model_label_to_injury(model_class)

        supported = bool(workflow_supported and injury_key)

        detections = result.get("detections", [])
        if not isinstance(detections, list):
            detections = []

        response_data = {
            "success": supported,
            "supported": supported,
            "predicted_class": model_class if supported else "unsupported",
            "model_class": model_class,
            "injury_key": injury_key if supported else None,
            "confidence": confidence,
            "detections": detections,
        }

        if not supported:
            if workflow_supported and not injury_key:
                response_data["message"] = (
                    "The model found a possible condition, but no validated "
                    "first-aid guide is mapped to that class."
                )
            else:
                response_data["message"] = (
                    "The image could not be classified with enough confidence."
                )

        return jsonify(response_data)

    except LocalDetectorError as exc:
        app.logger.error("Local detector failed: %s", exc)
        return jsonify({
            "success": False,
            "supported": False,
            "predicted_class": "unsupported",
            "confidence": 0.0,
            "error": "The analysis service is unavailable.",
        }), 502

    except Exception:
        app.logger.error(
            "Error in /api/scan: %s",
            traceback.format_exc(),
        )
        return jsonify({
            "success": False,
            "supported": False,
            "predicted_class": "unsupported",
            "confidence": 0.0,
            "error": "The image could not be analyzed.",
        }), 500

@app.errorhandler(413)
def image_too_large(_error):
    return jsonify({
        "success": False,
        "supported": False,
        "predicted_class": "unsupported",
        "confidence": 0.0,
        "error": "The image is too large. Maximum size is 10 MB.",
    }), 413

if __name__ == "__main__":
    print("🚑 Starting A.I.D.E. server...")
    if not any('--no-browser' in arg for arg in sys.argv):
        Timer(1, lambda: webbrowser.open("http://127.0.0.1:5000/")).start()
    app.run(host="0.0.0.0", port=5000, debug=False)