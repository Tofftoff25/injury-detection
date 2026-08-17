"""
Smoke test for the Roboflow "Visible Injury Baseline" Workflow integration.

Downloads one sample image, runs it through BACKEND/app.py's
run_injury_workflow(), and checks that the parsed result has the keys
the rest of the app depends on.

Usage:
    pip install -r requirements.txt
    cp .env.example .env   # then fill in your OWN ROBOFLOW_API_KEY
    python3 test_roboflow.py

Never hardcode a real API key in this file - it's read from the
environment (via .env / python-dotenv), same as BACKEND/app.py.
"""
import os
import sys
import json

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "BACKEND"))

import requests

from app import (  # noqa: E402  (import after sys.path tweak, matches app.py's own layout)
    run_injury_workflow,
    RoboflowConfigError,
    RoboflowServiceError,
    RoboflowTimeoutError,
    ROBOFLOW_API_KEY,
)

# A public sample image, used only to confirm the integration works end
# to end - swap in a real injury photo for a more meaningful check.
# (Since this one shows no injury, expect predicted_class/confidence/
# supported to come back None and detections to be empty - that's the
# model correctly finding nothing, not a bug.)
SAMPLE_IMAGE_URL = (
    "https://source.roboflow.com/ETAZ9M3a8MP0YQPdt32OmImYPeT2/"
    "cozC7TScIYaVXiJ6qRhk/original.jpg"
)

REQUIRED_KEYS = {"predicted_class", "confidence", "supported", "detections"}


def load_image_bytes():
    """
    Use a local image path if one was passed on the command line
    (python3 test_roboflow.py path/to/photo.jpg [--debug]), otherwise
    fall back to downloading the generic sample image.
    """
    positional_args = [a for a in sys.argv[1:] if not a.startswith("--")]

    if positional_args:
        local_path = positional_args[0]
        print(f"Reading local image from {local_path} ...")
        with open(local_path, "rb") as f:
            return f.read()

    print(f"Downloading sample image from {SAMPLE_IMAGE_URL} ...")
    image_response = requests.get(SAMPLE_IMAGE_URL, timeout=30)
    image_response.raise_for_status()
    return image_response.content


def _redact_images(obj):
    """Recursively replace any large base64 image 'value' fields with a
    placeholder so debug output never dumps huge blobs or logs image
    data."""
    if isinstance(obj, dict):
        return {
            k: (
                f"<redacted base64, {len(v)} chars>"
                if k == "value" and isinstance(v, str) and len(v) > 200
                else _redact_images(v)
            )
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_redact_images(v) for v in obj]
    return obj


def debug_raw_call(image_bytes):
    """
    Make a one-off raw call (bypassing run_injury_workflow's retry
    logic) purely to show the exact JSON Roboflow returned, for
    troubleshooting. The real app always goes through
    run_injury_workflow() - this is diagnostic only.
    """
    import base64

    from app import ROBOFLOW_API_URL, ROBOFLOW_WORKSPACE, ROBOFLOW_WORKFLOW_ID

    endpoint = f"{ROBOFLOW_API_URL}/{ROBOFLOW_WORKSPACE}/workflows/{ROBOFLOW_WORKFLOW_ID}"
    encoded_image = base64.b64encode(image_bytes).decode("ascii")
    payload = {
        "api_key": ROBOFLOW_API_KEY,
        "inputs": {"image": {"type": "base64", "value": encoded_image}},
    }

    print(f"\n--- DEBUG: POST {endpoint} ---")
    response = requests.post(endpoint, json=payload, timeout=45)
    print(f"HTTP {response.status_code}")

    try:
        data = response.json()
    except ValueError:
        print(response.text[:2000])
        print("--- END DEBUG ---\n")
        return

    print(json.dumps(_redact_images(data), indent=2)[:4000])
    print("--- END DEBUG ---\n")


def main():
    if not ROBOFLOW_API_KEY:
        print(
            "ROBOFLOW_API_KEY is not set. Copy .env.example to .env and "
            "fill in your own key (app.roboflow.com/settings/api) first."
        )
        sys.exit(1)

    image_bytes = load_image_bytes()

    if "--debug" in sys.argv:
        debug_raw_call(image_bytes)

    print("Running the Visible Injury Baseline workflow ...")
    try:
        result = run_injury_workflow(image_bytes)
    except (RoboflowConfigError, RoboflowTimeoutError, RoboflowServiceError) as exc:
        print(f"FAILED: workflow call raised {type(exc).__name__}: {exc}")
        sys.exit(1)

    missing = REQUIRED_KEYS - result.keys()
    if missing:
        print(f"FAILED: missing expected output keys: {sorted(missing)}")
        sys.exit(1)

    print("PASSED (response shape is correct)")
    print(f"  predicted_class = {result['predicted_class']!r}")
    print(f"  confidence      = {result['confidence']}")
    print(f"  supported       = {result['supported']}")
    print(f"  detections      = {len(result['detections'])} detection(s)")
    if result.get("annotated_image_path"):
        print(f"  annotated image saved to {result['annotated_image_path']}")

    if not result["detections"]:
        print(
            "\nNote: no detections came back. If you used the default "
            "sample image, that's expected - it has no visible injury. "
            "Run `python3 test_roboflow.py path/to/injury-photo.jpg` "
            "with a real photo to see a positive detection."
        )


if __name__ == "__main__":
    main()