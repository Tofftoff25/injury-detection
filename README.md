# A.I.D.E. - AI-Guided Instructional Device for Emergencies

## Overview
A.I.D.E. is a touchscreen-based first-aid guidance system designed for emergency situations. It provides step-by-step instructions for treating common injuries, with support for voice guidance, camera scanning, and multiple languages (English/Filipino).

## Features
-  20+ injury guides with step-by-step instructions
-  Voice-guided instructions (English/Filipino)
-  AI-powered camera scanning (optional)
-  Dark mode
-  Smart search with suggestions
-  Analytics & tips
-  History with 30-day trash recovery
-  Touchscreen-optimized interface

## Installation
1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
```

2. Configure the Roboflow scan integration:
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and set `ROBOFLOW_API_KEY` to your own key from
   https://app.roboflow.com/settings/api. Never commit a real key -
   `.env` is already gitignored, and `.env.example` should only ever
   hold a placeholder.

3. Run the app:
   ```bash
   python3 BACKEND/app.py
   ```
   or, on the Raspberry Pi deployment target, `./run.sh`.

## AI-Powered Camera Scanning

The optional camera-scan feature sends one captured photo to a hosted
Roboflow Workflow ("Visible Injury Baseline") for detection, then maps
the result to a first-aid guide in `injuries.json`.

- **Backend:** `BACKEND/app.py` - `run_injury_workflow()` posts the
  image to
  `https://serverless.roboflow.com/<workspace>/workflows/<workflow_id>`,
  retries a couple of times with backoff on timeouts/connection errors/5xx
  responses, and raises `RoboflowConfigError` / `RoboflowTimeoutError` /
  `RoboflowServiceError` on failure. `parse_workflow_response()` parses
  the real response shape defensively (list of one dict, keyed by the
  workflow's own output names: `predicted_class`, `confidence`,
  `supported`, `predictions`, and an optional `output_image`).
- **Annotated images:** if the workflow returns an `output_image`
  (an annotated preview, base64-encoded), it's decoded and written to
  `captures/annotated/<uuid>.jpg` on disk rather than being logged or
  held in memory - that directory is already covered by `.gitignore`.
- **Frontend:** `FRONTEND/JS/scan.js` captures a frame from the camera,
  POSTs it to `/api/scan`, and maps the response to the matching
  first-aid guide via `injury_key`.
- **Config:** all Roboflow settings (`ROBOFLOW_API_KEY`,
  `ROBOFLOW_API_URL`, `ROBOFLOW_WORKSPACE`, `ROBOFLOW_WORKFLOW_ID`) are
  read from environment variables - see `.env.example`.
- **Smoke test:** `python3 test_roboflow.py` downloads one sample
  image, runs it through `run_injury_workflow()`, and checks that the
  parsed result has the keys the rest of the app relies on. Requires
  `ROBOFLOW_API_KEY` to be set first.

If camera scanning isn't configured (no API key), `/api/scan/status`
reports it as unavailable and the frontend hides/disables the feature
gracefully - the rest of the app works the same either way.