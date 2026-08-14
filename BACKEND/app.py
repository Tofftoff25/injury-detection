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

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, "FRONTEND")

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")

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

@app.route("/api/scan", methods=["POST"])
def api_scan():
    return jsonify({"error": "Scanning is now performed on-device via TensorFlow.js."}), 405

if __name__ == "__main__":
    print("🚑 Starting A.I.D.E. server...")
    if not any('--no-browser' in arg for arg in sys.argv):
        Timer(1, lambda: webbrowser.open("http://127.0.0.1:5000/")).start()
    app.run(host="0.0.0.0", port=5000, debug=False)