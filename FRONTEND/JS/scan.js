import { saveCapture } from './captures.js';
import { logAction } from './history.js';

let scanStream = null;
let modelExists = null;

// Medical photos should not be stored by default.
// Change this only after adding clear user consent.
const SAVE_SCANS_LOCALLY = false;

export async function checkModelExists() {
    if (modelExists !== null) return modelExists;

    try {
        const response = await fetch('/api/scan/status', {
            method: 'GET',
            cache: 'no-store'
        });

        if (!response.ok) {
            modelExists = false;
            return false;
        }

        const status = await response.json();
        modelExists = Boolean(status.available);
        return modelExists;
    } catch (error) {
        console.warn('Scan service detection failed:', error);
        modelExists = false;
        return false;
    }
}

// Retain this function because main.js may already call it.
export async function ensureModelLoaded() {
    return checkModelExists();
}

export async function startCamera(videoElement) {
    stopCamera(videoElement);

    if (!videoElement) {
        throw new Error('Camera preview element was not found.');
    }

    if (
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
        throw new Error(
            'Camera access is unavailable. Use HTTPS or localhost and allow camera permission.'
        );
    }

    const attempts = [
        {
            audio: false,
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        },
        {
            audio: false,
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        },
        { audio: false, video: true }
    ];

    let stream = null;
    let lastError = null;

    for (const constraints of attempts) {
        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            if (stream) break;
        } catch (error) {
            lastError = error;
        }
    }

    if (!stream) {
        const name = lastError?.name || 'CameraError';

        if (name === 'NotAllowedError' || name === 'SecurityError') {
            throw new Error(
                'Camera permission was denied. Allow camera access and try again.'
            );
        }

        if (
            name === 'NotFoundError' ||
            name === 'DevicesNotFoundError'
        ) {
            throw new Error('No camera was found on this device.');
        }

        if (!window.isSecureContext) {
            throw new Error('Camera access requires HTTPS or localhost.');
        }

        throw new Error(
            lastError?.message || 'Unable to access the camera.'
        );
    }

    scanStream = stream;
    videoElement.srcObject = stream;
    videoElement.muted = true;
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.setAttribute('playsinline', '');
    videoElement.setAttribute('autoplay', '');

    await new Promise((resolve, reject) => {
        if (
            videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            videoElement.videoWidth > 0
        ) {
            resolve();
            return;
        }

        const timeout = setTimeout(() => {
            cleanup();
            reject(
                new Error(
                    'Camera opened, but no video frame was received.'
                )
            );
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
    } catch (error) {
        console.warn('Camera preview play was deferred:', error);
    }

    return stream;
}

export function stopCamera(
    videoElement = document.getElementById('scan-video')
) {
    if (scanStream) {
        scanStream.getTracks().forEach(track => track.stop());
        scanStream = null;
    }

    if (videoElement) {
        videoElement.srcObject = null;
    }
}

function canvasToBlob(canvasElement) {
    return new Promise((resolve, reject) => {
        canvasElement.toBlob(
            blob => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Could not encode the captured image.'));
                }
            },
            'image/jpeg',
            0.85
        );
    });
}

export async function classifyWithBackend(imageBlob) {
    const formData = new FormData();
    formData.append('image', imageBlob, 'injury-capture.jpg');

    const response = await fetch('/api/scan', {
        method: 'POST',
        body: formData
    });

    let result;

    try {
        result = await response.json();
    } catch (_error) {
        throw new Error('The scan service returned an invalid response.');
    }

    if (!response.ok) {
        throw new Error(
            result.error ||
            result.message ||
            'The image could not be analyzed.'
        );
    }

    return result;
}

export async function captureAndClassify(
    videoElement,
    canvasElement,
    onResult,
    onCaptured
) {
    if (videoElement.paused && videoElement.srcObject) {
        try {
            await videoElement.play();
        } catch (_error) {
            // Continue if the current camera frame is still available.
        }
    }

    if (!videoElement.videoWidth || !videoElement.videoHeight) {
        throw new Error('Camera is not ready.');
    }

    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;

    const context = canvasElement.getContext('2d', {
        alpha: false
    });

    context.drawImage(
        videoElement,
        0,
        0,
        canvasElement.width,
        canvasElement.height
    );

    const imageBlob = await canvasToBlob(canvasElement);

    // Used only for displaying the current result in the UI.
    // It is not sent to localStorage unless SAVE_SCANS_LOCALLY is enabled.
    const imageData = canvasElement.toDataURL('image/jpeg', 0.75);
    
    // NEW — let the caller switch UI states here
    if (typeof onCaptured === 'function') {
        onCaptured();
    }

    try {
        const result = await classifyWithBackend(imageBlob);
        const confidence = Number(result.confidence || 0);
        const injuryKey = result.injury_key || null;

        if (result.supported && injuryKey) {
            if (SAVE_SCANS_LOCALLY) {
                saveCapture(imageData, injuryKey);
            }

            logAction(
                'scanned',
                injuryKey,
                `${Math.round(confidence * 100)}%`
            );

            onResult({
                success: true,
                supported: true,
                label: injuryKey,
                predictedClass: result.predicted_class,
                modelClass: result.model_class,
                confidence,
                detections: result.detections || [],
                imageData
            });

            return;
        }

        if (SAVE_SCANS_LOCALLY) {
            saveCapture(imageData, 'unsupported');
        }

        logAction(
            'scanned',
            'Unsupported image',
            `${Math.round(confidence * 100)}%`
        );

        onResult({
            success: false,
            supported: false,
            label: 'unknown',
            predictedClass: 'unsupported',
            modelClass: result.model_class,
            confidence,
            detections: result.detections || [],
            imageData,
            message:
                result.message ||
                'No supported visible injury was identified confidently.'
        });
    } catch (error) {
        console.error('Scan error:', error);

        onResult({
            success: false,
            supported: false,
            label: 'error',
            confidence: 0,
            imageData,
            error,
            message:
                error.message ||
                'The image could not be analyzed.'
        });
    }
}