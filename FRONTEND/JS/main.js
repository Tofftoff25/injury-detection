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
import { startCamera, stopCamera, captureAndClassify, ensureModelLoaded, checkModelExists } from './scan.js';

// ---- DOM refs ----
const afkScreen = document.getElementById('afk-screen');
const loadingScreen = document.getElementById('loading-screen');
const scanOverlay = document.getElementById('scan-overlay');
const scanVideo = document.getElementById('scan-video');
const scanCanvas = document.getElementById('scan-canvas');
const scanStatus = document.getElementById('scan-status');
const scanCaptureBtn = document.getElementById('scan-capture-btn');
const scanCancelBtn = document.getElementById('scan-cancel-btn');

// ---- AFK / IDLE ----
let afkTimer = null;
let idleTimeout = 300;

function showAfkScreen() {
    afkScreen.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function hideAfkScreen() {
    setAfk(false);
    afkScreen.classList.add('hidden');
    document.body.style.overflow = '';
    resetIdleTimer();
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
    window._showAfkScreen = () => { setAfk(true); showAfkScreen(); };
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

function closeScanOverlay() {
    scanOverlay.classList.add('hidden');
    stopCamera(scanVideo);
    scanCaptureBtn.textContent = '📸 Capture';
    scanCaptureBtn.disabled = false;
}

async function handleCapture() {
    if (!scanVideo.videoWidth) {
        scanStatus.textContent = '❌ Camera not ready.';
        return;
    }
    scanStatus.textContent = '📸 Capturing...';
    scanCaptureBtn.disabled = true;
    try {
        const result = await new Promise((resolve) => {
            captureAndClassify(scanVideo, scanCanvas, resolve);
        });
        if (result.success && result.label !== 'unknown') {
            scanStatus.textContent = `✅ ${result.label} (${Math.round(result.confidence * 100)}%)`;
            setTimeout(() => {
                closeScanOverlay();
                openInjury(result.label);
            }, 1500);
        } else {
            scanStatus.textContent = '📸 Image captured. Use search to find injury.';
            setTimeout(() => {
                closeScanOverlay();
                const statusEl = document.getElementById('status-message');
                statusEl.textContent = '📷 Image captured! Use Search to find the right injury.';
                statusEl.classList.add('info');
                setTimeout(() => {
                    statusEl.textContent = '';
                    statusEl.classList.remove('info');
                }, 3000);
            }, 1500);
        }
    } catch (err) {
        scanStatus.textContent = '❌ Error: ' + err.message;
        scanCaptureBtn.disabled = false;
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