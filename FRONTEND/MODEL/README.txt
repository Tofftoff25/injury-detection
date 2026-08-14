HOW TO ADD THE AI SCAN MODEL (free, no API key, runs fully offline)
=====================================================================

The Scan button loads a TensorFlow.js image model from this folder.
Right now this folder is empty, so Scan will show:
"No trained model found yet."

TO TRAIN ONE (takes about 15-30 minutes, completely free):

1. Go to https://teachablemachine.withgoogle.com in a browser.
2. Click "Get Started" -> "Image Project" -> "Standard image model".
3. Create ONE CLASS PER INJURY, and name each class EXACTLY like the
   matching key in BACKEND/app.py's INJURY_DATABASE (lowercase):
     - cuts and wounds
     - burns
     - sprains
     - nosebleed
     - choking
     - fainting
     - bruises
     - insect bites
   (You don't need all 8 to start - even 2-3 classes work for testing.
   Skip any injury that's hard to photograph safely/ethically, like
   choking or fainting - those may be better left to Search only.)
4. For each class, upload or webcam-capture 20-50 sample photos.
   Use varied lighting, angles, and backgrounds so the model
   generalizes instead of memorizing your test photos.
5. Click "Train Model" (runs in your browser, no cost).
6. Click "Export Model" -> tab "Tensorflow.js" -> "Download my model".
7. Unzip the download. You'll get three files:
     model.json
     weights.bin
     metadata.json
8. Copy all three directly into this folder (FRONTEND/MODEL/), so you
   have:
     FRONTEND/MODEL/model.json
     FRONTEND/MODEL/weights.bin
     FRONTEND/MODEL/metadata.json
9. Restart app.py and reload the page. Scan should now work.

NOTES
-----
- Everything runs on-device in the browser (TensorFlow.js). No internet
  connection is needed after the page has loaded once, no API key, no
  per-request cost - this satisfies the "free, no API" requirement.
- If confidence is below 65% (see SCAN_CONFIDENCE_THRESHOLD in
  script.js), the app will ask the user to try again or use Search
  instead, rather than guessing.
- You can retrain and re-export anytime as you collect more/better
  training photos - just overwrite the three files above.
