# A.I.D.E. - AI-Guided Instructional Device for Emergencies

# Overview

A.I.D.E. is a touchscreen-based first-aid guidance system designed for emergency situations. It provides step-by-step instructions for treating common injuries, with support for voice guidance, camera scanning, and multiple languages (English/Filipino).
Features

* 20+ injury guides with step-by-step instructions
* Voice-guided instructions (English/Filipino)
* AI-powered camera scanning (optional) - runs fully offline, no internet or API key required
* Dark mode
* Smart search with suggestions
* Analytics & tips
* History with 30-day trash recovery
* Touchscreen-optimized interface

Installation

1. Install Python dependencies:

```
pip install -r requirements.txt
```

This includes `ultralytics` and `ai-edge-litert`, used for local AI scan inference (see below). No Roboflow account, API key, or internet connection is required to use any part of this app, including scanning.

2. (Optional) copy the example environment file if you want to override any defaults:
   ```bash
   cp .env.example .env
   ```
   None of the values in `.env` are required - `local_detector.py` has working defaults for the model path, labels path, and confidence threshold already baked in. Only edit `.env` if you want to point at a different model file or tune the confidence threshold.

3. Run the app:

```
python3 BACKEND/app.py
```

or, on the Raspberry Pi deployment target, `./run.sh`.

AI-Powered Camera Scanning
The camera-scan feature runs a locally-stored, pre-trained object detection model (YOLO26 Nano, exported to TensorFlow Lite) directly on-device to identify visible injuries from one captured photo, then maps the result to a first-aid guide in `injuries.json`. No photo, request, or data of any kind leaves the device during a scan.

* Backend: `BACKEND/local_detector.py` loads `FRONTEND/MODEL/injury-baseline.tflite` once when Flask starts (see `load_detector_from_env()`), and reuses that loaded model for every `/api/scan` request - the model is never reloaded per request. `LocalInjuryDetector.predict()` returns a structured result (`predicted_class`, `confidence`, `supported`, `detections`, `inference_ms`); `BACKEND/app.py`'s `api_scan()` route calls it directly, with no network dependency of any kind.
* Model details, training process, and how to retrain: see `FRONTEND/MODEL/README.txt`.
* Frontend: `FRONTEND/JS/scan.js` captures a frame from the camera (or accepts an uploaded photo), POSTs it to `/api/scan`, and maps the response to the matching first-aid guide via `injury_key`.
* Config: optional overrides only - `TFLITE_MODEL_PATH`, `TFLITE_LABELS_PATH`, `SCAN_CONFIDENCE_THRESHOLD` - see `.env.example`. None are required for the app to run with its default, bundled model.
* If the model file is missing or fails to load, `/api/scan/status` reports the feature as unavailable and the frontend degrades gracefully (scan button still opens the camera, but reports "no AI model found" rather than crashing) - the rest of the app works the same either way.

Note on architecture history: earlier development builds used a hosted Roboflow Workflow (cloud API) for scan inference during testing. This was fully replaced with the local TFLite model described above so the deployed app has no internet dependency at runtime, per the project's offline-first requirement for Raspberry Pi deployment.
