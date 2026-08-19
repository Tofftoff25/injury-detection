"""A.I.D.E. - Local TFLite injury detector.

Runs the trained YOLO26 Nano model fully offline, no internet or API key
required. Loaded once at Flask startup and reused for every /api/scan
request, so the model is never re-loaded per request.

This module is a drop-in replacement for the old Roboflow HTTP call
(BACKEND/app.py's run_injury_workflow). It returns the same shaped dict,
so nothing in api_scan() needs to change beyond swapping which function
it calls.
"""

import os
import json
import time

from ultralytics import YOLO


class LocalDetectorError(RuntimeError):
    """Raised when the local model fails to load or run."""


class LocalInjuryDetector:
    """
    Wraps a trained YOLO TFLite model and exposes a single .predict()
    method with a stable, Roboflow-shaped output contract:

        {
            "predicted_class": "Bruise" | None,
            "confidence": 0.0-1.0,
            "supported": bool,
            "detections": [
                {"class": str, "confidence": float,
                 "x": float, "y": float, "width": float, "height": float},
                ...
            ],
            "inference_ms": float,
        }

    "supported" here only reflects "did the model detect *something*
    above the confidence threshold" - the app-level decision of whether
    that class maps to a reviewed injuries.json guide still happens in
    app.py's map_model_label_to_injury(), exactly as it did with the
    Roboflow path. This keeps the same separation of concerns.
    """

    def __init__(self, model_path, labels_path=None, confidence_threshold=0.35):
        if not os.path.isfile(model_path):
            raise LocalDetectorError(f"TFLite model not found at: {model_path}")

        self.confidence_threshold = confidence_threshold
        self._model = YOLO(model_path, task="detect")

        # Prefer an explicit labels.json if provided (keeps class order
        # unambiguous and independent of what happens to be embedded in
        # the .tflite file itself), otherwise fall back to whatever the
        # model reports.
        if labels_path and os.path.isfile(labels_path):
            with open(labels_path, "r", encoding="utf-8") as f:
                raw_labels = json.load(f)
            # labels.json is saved as {"0": "Abrasion", ...} - normalize
            # keys to int so lookups by class index work directly.
            self.labels = {int(k): v for k, v in raw_labels.items()}
        else:
            self.labels = dict(self._model.names)

        if not self.labels:
            raise LocalDetectorError("No class labels available for the local model.")

    def predict(self, image_bytes):
        """
        Run inference on raw image bytes (already JPEG-normalized by the
        caller) and return a Roboflow-shaped result dict.
        """
        start = time.perf_counter()

        try:
            # Ultralytics accepts raw bytes directly via a file-like
            # object is NOT supported for .predict(); it wants a path,
            # PIL Image, numpy array, or URL. We decode via PIL here so
            # we don't need to touch disk at all.
            from PIL import Image
            import io

            img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            results = self._model.predict(
                img,
                conf=self.confidence_threshold,
                verbose=False,
            )
        except Exception as exc:
            raise LocalDetectorError(f"Local inference failed: {exc}") from exc

        inference_ms = (time.perf_counter() - start) * 1000.0

        if not results:
            return self._empty_result(inference_ms)

        result = results[0]
        boxes = result.boxes

        if boxes is None or len(boxes) == 0:
            return self._empty_result(inference_ms)

        detections = []
        for box in boxes:
            class_id = int(box.cls[0])
            confidence = float(box.conf[0])
            # xywh = center x, center y, width, height, in pixel
            # coordinates of the (already resized-back) original image.
            x, y, w, h = [float(v) for v in box.xywh[0]]
            detections.append({
                "class": self.labels.get(class_id, f"class_{class_id}"),
                "confidence": confidence,
                "x": x,
                "y": y,
                "width": w,
                "height": h,
            })

        # Pick the single highest-confidence detection as the "top"
        # result, same selection rule as the old Roboflow Workflow's
        # top_injury_decision block (argmax over confidences).
        best = max(detections, key=lambda d: d["confidence"])

        return {
            "predicted_class": best["class"],
            "confidence": best["confidence"],
            "supported": best["confidence"] >= self.confidence_threshold,
            "detections": detections,
            "inference_ms": round(inference_ms, 1),
        }

    def _empty_result(self, inference_ms):
        return {
            "predicted_class": None,
            "confidence": 0.0,
            "supported": False,
            "detections": [],
            "inference_ms": round(inference_ms, 1),
        }

def load_detector_from_env(default_model_path=None, default_labels_path=None):
    model_path = os.getenv(
        "TFLITE_MODEL_PATH",
        default_model_path or os.path.join("FRONTEND", "MODEL", "injury-baseline.tflite"),
    )
    labels_path = os.getenv(
        "TFLITE_LABELS_PATH",
        default_labels_path or os.path.join("FRONTEND", "MODEL", "labels.json"),
    )
    threshold = float(os.getenv("SCAN_CONFIDENCE_THRESHOLD", "0.35"))

    try:
        return LocalInjuryDetector(
            model_path=model_path,
            labels_path=labels_path,
            confidence_threshold=threshold,
        )
    except LocalDetectorError as exc:
        print(f"[local_detector] Could not load model: {exc}")
        return None