HOW THE AI SCAN MODEL WORKS (free, no API key, runs fully offline)
=====================================================================

This folder contains the trained injury-detection model that powers
the Scan feature. It runs locally via TensorFlow Lite (through the
Ultralytics YOLO runtime) - no internet connection, no API key, and
no per-request cost, either during development or after deployment
on the Raspberry Pi.

FILES IN THIS FOLDER
---------------------
  injury-baseline.tflite   The trained YOLO26 Nano object-detection
                            model (float32), exported from a custom
                            checkpoint trained on ~1,800 labeled
                           injury photos across 5 classes.
  labels.json               Maps the model's class indices to names:
                              0: Abrasion
                              1: Bruise
                              2: Burn
                              3: Cut
                              4: Swelling

HOW IT'S LOADED
----------------
BACKEND/local_detector.py loads injury-baseline.tflite once when
Flask starts (see load_detector_from_env() in that file, called from
BACKEND/app.py). Every /api/scan request reuses that already-loaded
model - the model is never reloaded per request.

The detector's raw output (predicted_class, confidence, detections)
is then mapped to a guide in injuries.json via MODEL_TO_INJURY_KEY in
app.py. Not every trained class has a 1:1 dedicated guide - for
example, "Swelling" is mapped to the "sprains" guide, since that's
the closest validated first-aid match for a visible-swelling symptom.

HOW THE MODEL WAS TRAINED
---------------------------
1. Source data: ~1,837 images across 5 classes (Abrasion, Bruise,
   Burn, Cut, Swelling), collected and balanced via Roboflow
   (workspace: ffotatoff, project: injury-baseline).
2. Dataset was exported in YOLO format directly from Roboflow's free
   Dataset tab (Roboflow's paid-tier "Download Weights" feature was
   NOT used/available - training was done independently instead).
3. Training was run in Google Colab (free T4 GPU) using Ultralytics,
   starting from a COCO-pretrained yolo26n.pt checkpoint.
4. The resulting best.pt was exported to TensorFlow Lite at 320x320
   input resolution (chosen for Raspberry Pi 4B's CPU-only inference,
   versus the 640x640 used during cloud-side training/testing).
5. Both float32 and INT8-quantized TFLite exports were compared side
   by side; float32 was selected for deployment because INT8's
   confidence scores were poorly calibrated (compressed toward 0.50
   regardless of true detection quality) - a meaningful problem for
   an app that thresholds decisions on confidence.

CONFIGURATION
--------------
These environment variables (optional - sensible defaults are baked
into local_detector.py) can override the model path, labels path, and
confidence threshold. See .env.example:

  TFLITE_MODEL_PATH=FRONTEND/MODEL/injury-baseline.tflite
  TFLITE_LABELS_PATH=FRONTEND/MODEL/labels.json
  SCAN_CONFIDENCE_THRESHOLD=0.35

RETRAINING / IMPROVING THE MODEL
-----------------------------------
To retrain with more or better data:
  1. Add/replace images in the Roboflow project (or your own labeled
     set in Ultralytics YOLO format).
  2. Retrain via Ultralytics (see the Colab notebook used originally,
     AIDE_train_yolo26.ipynb, for the exact training/export steps).
  3. Export a new .tflite, replace injury-baseline.tflite in this
     folder (and update labels.json if the class list changed).
  4. Restart app.py - no other code changes needed, since the model
     path and contract stay the same.

NOTES
-----
- If the model file is missing or fails to load, /api/scan/status
  will correctly report the scan feature as unavailable rather than
  crashing the app - see local_detector.py's load_detector_from_env().
- This app previously used Roboflow's hosted cloud API for inference
  during early development/testing. That approach required an
  internet connection and API key at runtime and has been fully
  replaced by the local TFLite model described above, in order to
  meet the project's fully-offline requirement.