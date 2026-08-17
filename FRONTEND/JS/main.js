// FRONTEND/JS/main.js

import { state, setSettings, setInjuryCache, setIdleTimeout, setAfk, setStepIndex } from './state.js';
import {
    loadSettings, saveSettings, applySettings, t, applyTranslations,
    populateVoiceSelector, setupVoiceSelector
} from './settings.js';
import { cleanTrash } from './history.js';
import { getCaptures } from './captures.js';
import { stopSpeaking, enableSpeech } from './voice.js';
import { loadInjuryCache, openInjury, setupSearch, handleSearch } from './search.js';
import {
    showHomeScreen, showInstructionScreen, updateStats, updateStepDisplay,
    renderInjuryCards, renderCaptures, renderTrashList,
    renderHistoryList, initUI, showConfirm, hideConfirm, showTab
} from './ui.js';
import { startCamera, stopCamera, captureAndClassify, ensureModelLoaded, checkModelExists, classifyWithBackend } from './scan.js';

// ---- DOM refs ----
const afkScreen = document.getElementById('afk-screen');
const loadingScreen = document.getElementById('loading-screen');
const scanOverlay = document.getElementById('scan-overlay');
const scanVideo = document.getElementById('scan-video');
const scanCanvas = document.getElementById('scan-canvas');
const scanStatus = document.getElementById('scan-status');
const scanCaptureBtn = document.getElementById('scan-capture-btn');
const scanCancelBtn = document.getElementById('scan-cancel-btn');
const scanUploadInput = document.getElementById('scan-upload-input');

// ---- AFK / IDLE ----
let afkTimer = null;
let idleTimeout = 300;

function syncAfkToggleUI(isActive) {
    const afkToggle = document.getElementById('afk-toggle');
    if (afkToggle) afkToggle.setAttribute('aria-checked', String(isActive));
}

function showAfkScreen() {
    setAfk(true);
    afkScreen.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    syncAfkToggleUI(true);
}

function hideAfkScreen() {
    setAfk(false);
    afkScreen.classList.add('hidden');
    document.body.style.overflow = '';
    resetIdleTimer();
    syncAfkToggleUI(false);
}

function resetIdleTimer() {
    clearTimeout(afkTimer);
    if (idleTimeout > 0) {
        afkTimer = setTimeout(showAfkScreen, idleTimeout * 1000);
    }
}

function setupIdle() {
    const events = ['click', 'touchstart', 'keydown', 'scroll', 'mousemove'];
    events.forEach(ev => document.addEventListener(ev, resetIdleTimer));
    resetIdleTimer();
    afkScreen.addEventListener('click', hideAfkScreen);
    afkScreen.addEventListener('touchstart', hideAfkScreen);

    window._resetAfkTimer = resetIdleTimer;
    window._showAfkScreen = showAfkScreen;
    window._hideAfkScreen = hideAfkScreen;

    // Screensaver toggle switch (Settings tab) — reflects and controls
    // AFK state in both directions: toggling enters/exits AFK mode, and
    // dismissing the AFK screen by tapping it flips the toggle back off.
    const afkToggle = document.getElementById('afk-toggle');
    if (afkToggle) {
        afkToggle.addEventListener('click', () => {
            if (afkScreen.classList.contains('hidden')) showAfkScreen();
            else hideAfkScreen();
        });
    }
}

function loadIdleTimeout() {
    try {
        const saved = localStorage.getItem('aide-idle-timeout');
        idleTimeout = saved !== null ? parseInt(saved) : 300;
    } catch (e) {
        idleTimeout = 300;
    }
    setIdleTimeout(idleTimeout);
}

function saveIdleTimeout(value) {
    idleTimeout = value;
    setIdleTimeout(value);
    localStorage.setItem('aide-idle-timeout', String(value));
    resetIdleTimer();
    const control = document.getElementById('idle-control');
    if (control) {
        control.querySelectorAll('.segmented-btn').forEach(btn => {
            const val = parseInt(btn.dataset.value);
            btn.classList.toggle('active', val === value);
        });
    }
}

// ---- Register Service Worker ----
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
            .then((registration) => {
                console.log('📦 Service Worker registered:', registration);
            })
            .catch((error) => {
                console.warn('Service Worker registration failed:', error);
            });
    }
}

// ---- Settings UI controls ----
function setupSettingsUI() {
    const textSizeControl = document.getElementById('text-size-control');
    const languageControl = document.getElementById('language-control');
    const darkToggle = document.getElementById('dark-toggle');
    const voiceToggle = document.getElementById('voice-toggle');
    const idleControl = document.getElementById('idle-control');

    textSizeControl?.addEventListener('click', (e) => {
        const btn = e.target.closest('.segmented-btn');
        if (!btn) return;
        state.settings.textSize = btn.dataset.value;
        saveSettings();
        applySettings();
    });

    languageControl?.addEventListener('click', (e) => {
        const btn = e.target.closest('.segmented-btn');
        if (!btn) return;
        state.settings.language = btn.dataset.value;
        saveSettings();
        applySettings();
        loadInjuryGrid();
    });

    darkToggle?.addEventListener('click', () => {
        state.settings.darkMode = !state.settings.darkMode;
        saveSettings();
        applySettings();
    });

    voiceToggle?.addEventListener('click', () => {
        state.settings.voice = !state.settings.voice;
        saveSettings();
        applySettings();
        if (state.settings.voice) enableSpeech();
        else stopSpeaking();
    });

    idleControl?.addEventListener('click', (e) => {
        const btn = e.target.closest('.segmented-btn');
        if (!btn) return;
        const value = parseInt(btn.dataset.value);
        saveIdleTimeout(value);
        const label = btn.textContent;
        const statusEl = document.getElementById('status-message');
        if (statusEl) {
            statusEl.textContent = `Idle timeout set to ${label}`;
            statusEl.classList.add('info');
            setTimeout(() => {
                statusEl.textContent = '';
                statusEl.classList.remove('info');
            }, 2000);
        }
    });
}

// ---- Load injury grid ----
async function loadInjuryGrid() {
    const lang = state.settings.language;
    try {
        const res = await fetch(`/api/injuries?lang=${lang}`);
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        setInjuryCache(data);
        renderInjuryCards(data);
        updateStats();
    } catch (e) {
        console.warn('Failed to load injuries from API, using cache if available');
        if (state.injuryCache.length) {
            renderInjuryCards(state.injuryCache);
        } else {
            const fallback = [
                { key: 'cuts and wounds', name: 'Cuts and Wounds', level: 'Moderate', icon: '/icons/cuts_and_wounds.png' }
            ];
            renderInjuryCards(fallback);
        }
    }
}

// ---- Scan overlay ----
async function handleUpload(file) {
    if (!file) return;

    freezeCapturedFrame();
    const ctx = scanCanvas.getContext('2d');
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    await new Promise((resolve) => {
        img.onload = () => {
            scanCanvas.width = img.naturalWidth;
            scanCanvas.height = img.naturalHeight;
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(objectUrl);
            resolve();
        };
        img.src = objectUrl;
    });

    scanStatus.textContent = '🔍 Analyzing image...';
    scanCaptureBtn.disabled = true;

    try {
        const result = await classifyWithBackend(file);
        const confidence = Number(result.confidence || 0);

        if (result.supported && result.injury_key) {
            scanStatus.textContent = `✅ ${result.model_class} detected (${Math.round(confidence * 100)}%)`;
            setTimeout(() => {
                closeScanOverlay();
                openInjury(result.injury_key);
            }, 1200);
            return;
        }

        const pct = Math.round(confidence * 100);
        const guess = result.model_class && result.model_class !== 'unsupported'
            ? `Best guess: ${result.model_class} (${pct}% confidence)`
            : `No confident detection (${pct}% confidence)`;
        scanStatus.innerHTML = `❓ ${result.message || "Couldn't confidently identify this."}<br><span class="scan-status-detail">${guess}</span>`;

        unfreezeCapturedFrame();
        scanCaptureBtn.disabled = false;
        scanCaptureBtn.textContent = '🔁 Try Again';
    } catch (err) {
        scanStatus.textContent = '⚠️ ' + (err.message || 'The analysis service is unavailable.');
        scanStatus.classList.add('scan-status-error');
        unfreezeCapturedFrame();
        scanCaptureBtn.disabled = false;
        scanCaptureBtn.textContent = '🔁 Try Again';
    }
}

// ---- Scan UI ----
async function openScanOverlay() {
    stopSpeaking();
    scanOverlay.classList.remove('hidden');
    scanStatus.textContent = '📷 Starting camera...';
    scanCaptureBtn.disabled = false;
    scanCaptureBtn.textContent = '📸 Capture';

    try {
        await startCamera(scanVideo);
        const modelExists = await checkModelExists();
        if (modelExists) {
            scanStatus.textContent = '✅ Camera ready. Loading AI...';
            const modelReady = await ensureModelLoaded();
            if (modelReady) {
                scanStatus.textContent = '✅ Camera + AI ready. Tap Capture.';
                scanCaptureBtn.textContent = '📸 Analyze';
            } else {
                scanStatus.textContent = '✅ Camera ready. AI model failed to load.';
            }
        } else {
            scanStatus.textContent = '✅ Camera ready. (No AI model found) Tap Capture.';
            scanCaptureBtn.textContent = '📸 Capture Only';
        }
    } catch (err) {
        scanStatus.textContent = '❌ Camera error: ' + err.message;
        console.error('Camera error:', err);
    }
}

function unfreezeCapturedFrame() {
    scanCanvas.classList.add('hidden');
    scanVideo.classList.remove('hidden');
}

function closeScanOverlay() {
    unfreezeCapturedFrame();   // NEW
    scanOverlay.classList.add('hidden');
    stopCamera(scanVideo);
    scanCaptureBtn.textContent = '📸 Capture';
    scanCaptureBtn.disabled = false;
}

function freezeCapturedFrame() {
    scanVideo.classList.add('hidden');
    scanCanvas.classList.remove('hidden');
}

async function handleCapture() {
    if (!scanVideo.videoWidth) {
        scanStatus.textContent = '❌ Camera not ready.';
        return;
    }

    scanStatus.textContent = '📸 Capturing...';
    scanStatus.classList.remove('scan-status-error');
    scanCaptureBtn.disabled = true;

    try {
        const result = await new Promise((resolve) => {
            captureAndClassify(
                scanVideo,
                scanCanvas,
                resolve,
                () => {
                    freezeCapturedFrame();   // NEW — show the actual captured photo
                    scanStatus.textContent = '🔍 Analyzing image...';
                }
            );
        });

        if (result.success && result.supported) {
            scanStatus.textContent = `✅ ${result.label} detected (${Math.round(result.confidence * 100)}%)`;
            setTimeout(() => {
                closeScanOverlay();
                openInjury(result.label);
            }, 1200);
            return;
        }

        const isServiceError = result.label === 'error';

        if (isServiceError) {
            scanStatus.textContent = '⚠️ ' + (result.message || 'The analysis service is unavailable.');
        } else {
            const pct = Math.round((result.confidence || 0) * 100);
            const guess = result.modelClass && result.modelClass !== 'unsupported'
                ? `Best guess: ${result.modelClass} (${pct}% confidence)`
                : `No confident detection (${pct}% confidence)`;
            scanStatus.innerHTML = `❓ ${result.message || "Couldn't confidently identify this."}<br><span class="scan-status-detail">${guess}</span>`;
        }
        scanStatus.classList.toggle('scan-status-error', isServiceError);

        unfreezeCapturedFrame();   // NEW — back to live video so they can reposition and retry
        scanCaptureBtn.disabled = false;
        scanCaptureBtn.textContent = '🔁 Try Again';

    } catch (err) {
        scanStatus.textContent = '❌ Error: ' + err.message;
        scanStatus.classList.add('scan-status-error');
        unfreezeCapturedFrame();
        scanCaptureBtn.disabled = false;
        scanCaptureBtn.textContent = '🔁 Try Again';
    }
}

// ---- INIT ----
async function init() {
    console.log('🚑 A.I.D.E. starting...');

    // Remove legacy High Contrast data from previous builds.
    localStorage.removeItem('aide-high-contrast');
    try {
        const legacySettings = JSON.parse(localStorage.getItem('aide-settings') || 'null');
        if (legacySettings && Object.prototype.hasOwnProperty.call(legacySettings, 'highContrast')) {
            delete legacySettings.highContrast;
            localStorage.setItem('aide-settings', JSON.stringify(legacySettings));
        }
    } catch (_) {}

    registerServiceWorker();

    loadSettings();
    applySettings();
    loadIdleTimeout();

    if (window.speechSynthesis) {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length) {
            populateVoiceSelector();
        } else {
            window.speechSynthesis.onvoiceschanged = populateVoiceSelector;
        }
        setupVoiceSelector();
    }

    await loadInjuryGrid();
    await loadInjuryCache();

    cleanTrash();

    initUI();
    setupSettingsUI();
    setupSearch();
    setupIdle();

    document.getElementById('scan-btn').addEventListener('click', openScanOverlay);
    scanCancelBtn.addEventListener('click', closeScanOverlay);
    scanCaptureBtn.addEventListener('click', handleCapture);


    scanUploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    handleUpload(file);
    scanUploadInput.value = '';
});

    document.getElementById('trash-restore-all-btn')?.addEventListener('click', async () => {
        const confirmed = await showConfirm('♻️ Restore All', 'Restore all items from trash?');
        if (confirmed) {
            import('./history.js').then(({ getTrashItems, getHistory, emptyTrash }) => {
                const trash = getTrashItems();
                trash.forEach(item => {
                    const history = getHistory();
                    history.unshift({
                        timestamp: item.timestamp || Date.now(),
                        action: item.action || 'viewed',
                        item: item.item || 'Unknown',
                        details: item.details || ''
                    });
                    localStorage.setItem('aide_history', JSON.stringify(history));
                });
                emptyTrash();
                renderHistoryList();
                renderTrashList();
                updateStats();
            });
        }
    });
    document.getElementById('trash-empty-btn')?.addEventListener('click', async () => {
        const confirmed = await showConfirm('🗑️ Empty Trash', 'All items will be permanently deleted. This cannot be undone.');
        if (confirmed) {
            import('./history.js').then(({ emptyTrash }) => {
                emptyTrash();
                renderTrashList();
                updateStats();
            });
        }
    });

    showTab('guide');
    showHomeScreen();

    setTimeout(() => {
        loadingScreen.classList.add('hidden');
        loadingScreen.style.display = 'none';
    }, 500);

    console.log('✅ A.I.D.E. ready!');
}

// Start the app
init();