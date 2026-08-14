// FRONTEND/JS/scan.js

import { saveCapture } from './captures.js';
import { logAction } from './history.js';

let scanStream = null;
let scanModel = null;
let scanLabels = null;
let modelExists = null;

const MODEL_URL = '/MODEL/model.json';
const SCAN_CONFIDENCE_THRESHOLD = 0.65;

export async function checkModelExists() {
    if (modelExists !== null) return modelExists;
    
    try {
        const res = await fetch(MODEL_URL, { method: 'HEAD' });
        if (!res.ok) {
            modelExists = false;
            return false;
        }
        const metaRes = await fetch('/MODEL/metadata.json', { method: 'HEAD' });
        modelExists = metaRes.ok;
        return modelExists;
    } catch (err) {
        console.warn('Model detection failed:', err);
        modelExists = false;
        return false;
    }
}

export async function ensureModelLoaded() {
    const exists = await checkModelExists();
    if (!exists) {
        console.warn('Model files not found – skipping AI load');
        return false;
    }
    
    if (scanModel) return true;
    if (typeof tf === 'undefined') {
        console.warn('TensorFlow.js not loaded');
        return false;
    }
    
    try {
        const res = await fetch('/MODEL/metadata.json');
        if (!res.ok) throw new Error('metadata missing');
        const metadata = await res.json();
        scanLabels = metadata.labels;
        scanModel = await tf.loadLayersModel(MODEL_URL);
        console.log('✅ AI model loaded successfully!');
        return true;
    } catch (err) {
        console.warn('Model load failed:', err);
        return false;
    }
}

export async function startCamera(videoElement) {
    stopCamera(videoElement);

    if (!videoElement) throw new Error('Camera preview element was not found.');
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        throw new Error('Camera access is unavailable. Use HTTPS or localhost and allow camera permission.');
    }

    const attempts = [
        { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } } },
        { audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 } } },
        { audio: false, video: true }
    ];

    let stream = null;
    let lastError = null;

    for (const constraints of attempts) {
        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            if (stream) break;
        } catch (err) {
            lastError = err;
        }
    }

    if (!stream) {
        const name = lastError?.name || 'CameraError';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
            throw new Error('Camera permission was denied. Allow camera access for this site and try again.');
        }
        if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
            throw new Error('No camera was found on this device.');
        }
        if (!window.isSecureContext) {
            throw new Error('Camera requires HTTPS or localhost.');
        }
        throw new Error(lastError?.message || 'Unable to access the camera.');
    }

    scanStream = stream;
    videoElement.srcObject = stream;
    videoElement.muted = true;
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.setAttribute('playsinline', '');
    videoElement.setAttribute('autoplay', '');

    await new Promise((resolve, reject) => {
        if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            videoElement.videoWidth > 0) {
            resolve();
            return;
        }

        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Camera opened, but no video frame was received.'));
        }, 7000);

        const onReady = () => {
            if (videoElement.videoWidth > 0) {
                cleanup();
                resolve();
            }
        };
        const cleanup = () => {
            clearTimeout(timeout);
            videoElement.removeEventListener('loadedmetadata', onReady);
            videoElement.removeEventListener('canplay', onReady);
            videoElement.removeEventListener('playing', onReady);
        };

        videoElement.addEventListener('loadedmetadata', onReady);
        videoElement.addEventListener('canplay', onReady);
        videoElement.addEventListener('playing', onReady);
    });

    try {
        await videoElement.play();
    } catch (err) {
        // If autoplay is blocked, the stream is still attached. The Capture
        // button is a user gesture and can retry play() before capturing.
        console.warn('Camera preview play was deferred:', err);
    }

    return stream;
}

export function stopCamera(videoElement = document.getElementById('scan-video')) {
    if (scanStream) {
        scanStream.getTracks().forEach(track => track.stop());
        scanStream = null;
    }
    if (videoElement) videoElement.srcObject = null;
}

export async function captureAndClassify(videoElement, canvasElement, onResult) {
    if (videoElement.paused && videoElement.srcObject) {
        try { await videoElement.play(); } catch (_) {}
    }
    if (!videoElement.videoWidth) {
        throw new Error('Camera not ready');
    }
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    const ctx = canvasElement.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    const imageData = canvasElement.toDataURL('image/jpeg', 0.5);

    if (scanModel && scanLabels) {
        try {
            const size = 224;
            const imgTensor = tf.tidy(() => {
                return tf.browser.fromPixels(canvasElement)
                    .resizeBilinear([size, size])
                    .toFloat()
                    .div(127.5)
                    .sub(1)
                    .expandDims(0);
            });
            const prediction = await scanModel.predict(imgTensor);
            const scores = await prediction.data();
            prediction.dispose();
            imgTensor.dispose();
            let bestIndex = 0;
            scores.forEach((s, i) => { if (s > scores[bestIndex]) bestIndex = i; });
            const confidence = scores[bestIndex];
            const label = (scanLabels[bestIndex] || '').toLowerCase();
            if (confidence >= SCAN_CONFIDENCE_THRESHOLD) {
                saveCapture(imageData, label);
                logAction('scanned', label, `${Math.round(confidence * 100)}%`);
                onResult({ success: true, label, confidence, imageData });
                return;
            } else {
                saveCapture(imageData, 'unknown');
                onResult({ success: false, label: 'unknown', confidence, imageData, message: 'Low confidence' });
                return;
            }
        } catch (err) {
            console.error('AI error:', err);
            saveCapture(imageData, 'error');
            onResult({ success: false, label: 'error', imageData, error: err });
            return;
        }
    }
    saveCapture(imageData, 'unknown');
    logAction('scanned', 'Image captured', 'No AI');
    onResult({ success: true, label: 'unknown', imageData, message: 'Image captured (no AI)' });
}