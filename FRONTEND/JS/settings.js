// FRONTEND/JS/settings.js

import { state, setSettings } from './state.js';

const DEFAULT_SETTINGS = { 
    textSize: 'normal', 
    darkMode: false,
    voice: false, 
    language: 'en', 
    voiceName: 'auto'
};

export function loadSettings() {
    try {
        // Remove legacy High Contrast setting from older builds.
        const legacy = JSON.parse(localStorage.getItem('aide-settings') || 'null');
        if (legacy && Object.prototype.hasOwnProperty.call(legacy, 'highContrast')) {
            delete legacy.highContrast;
            localStorage.setItem('aide-settings', JSON.stringify(legacy));
        }
        localStorage.removeItem('aide-high-contrast');
        const saved = legacy;
        if (saved) {
            setSettings({ ...DEFAULT_SETTINGS, ...saved });
        } else {
            setSettings({ ...DEFAULT_SETTINGS });
        }
    } catch (err) {
        setSettings({ ...DEFAULT_SETTINGS });
    }
}

export function saveSettings() {
    localStorage.setItem('aide-settings', JSON.stringify(state.settings));
}

export function updateSettingsUI() {
    const s = state.settings;
    
    const textSizeControl = document.getElementById('text-size-control');
    if (textSizeControl) {
        textSizeControl.querySelectorAll('.segmented-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === s.textSize);
        });
    }
    
    const languageControl = document.getElementById('language-control');
    if (languageControl) {
        languageControl.querySelectorAll('.segmented-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === s.language);
        });
    }
    
    const idleControl = document.getElementById('idle-control');
    if (idleControl) {
        const timeout = state.idleTimeout || 300;
        idleControl.querySelectorAll('.segmented-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.value) === timeout);
        });
    }
    
    const darkToggle = document.getElementById('dark-toggle');
    if (darkToggle) {
        darkToggle.setAttribute('aria-checked', String(s.darkMode));
    }
    
    const voiceToggle = document.getElementById('voice-toggle');
    if (voiceToggle) {
        voiceToggle.setAttribute('aria-checked', String(s.voice));
    }
}

export function applySettings() {
    const s = state.settings;
    document.documentElement.dataset.textsize = s.textSize;
    document.documentElement.dataset.dark = s.darkMode ? 'true' : 'false';
    applyTranslations();
    updateSettingsUI();
}

// --- Voice selection ---
export function populateVoiceSelector() {
    const select = document.getElementById('voice-select');
    if (!select) return;
    
    select.innerHTML = '<option value="auto">Auto-detect</option>';
    
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) {
        window.speechSynthesis.onvoiceschanged = () => populateVoiceSelector();
        return;
    }
    
    const seen = new Set();
    voices.forEach(voice => {
        const key = voice.name + voice.lang;
        if (seen.has(key)) return;
        seen.add(key);
        
        const option = document.createElement('option');
        option.value = voice.name;
        option.textContent = `${voice.name} (${voice.lang})`;
        select.appendChild(option);
    });
    
    if (state.settings.voiceName) {
        select.value = state.settings.voiceName;
    }
}

export function setupVoiceSelector() {
    const select = document.getElementById('voice-select');
    if (!select) return;
    
    select.addEventListener('change', () => {
        state.settings.voiceName = select.value;
        saveSettings();
        if (window._updateVoice) window._updateVoice(select.value);
    });
}

// --- Translations ---
const TRANSLATIONS = {
  en: {
    tagline: "AI-Guided Instructional Device for Emergencies",
    hotlineLabel: "EMERGENCY HOTLINES:",
    helperText: "Point the camera at the injury to scan it, or type / tap the injury below.",
    searchPlaceholder: "Type an injury...",
    searchBtn: "Search",
    scanBtn: "📷 Scan",
    commonInjuries: "All Injuries & Conditions",
    backBtn: "← Back",
    disclaimer: "This is first-aid guidance only and does not replace professional medical care. Call emergency services for serious injuries.",
    settingsTitle: "Settings",
    textSizeLabel: "Text Size",
    sizeNormal: "Normal",
    sizeLarge: "Large",
    sizeXLarge: "Extra Large",
    darkModeLabel: "Dark Mode",
    voiceLabel: "Read Instructions Aloud",
    languageLabel: "Language",
    scanInstruction: "Point the camera at the injury and hold steady...",
    scanCapture: "📸 Capture & Analyze",
    scanCancel: "Cancel",
    scanLoadingModel: "Loading AI model...",
    scanNoModel: "No trained model found. Use Search instead.",
    scanNoCamera: "Could not access the camera. Use Search instead.",
    scanAnalyzing: "Analyzing...",
    scanLowConfidence: "Not confident enough. Try adjusting lighting/angle, or use Search instead.",
  },
  tl: {
    tagline: "AI na Gabay sa Pang-emergency na Tulong",
    hotlineLabel: "EMERGENCY HOTLINES:",
    helperText: "I-tapat ang camera sa sugat para i-scan, o i-type/pindutin ang sugat sa baba.",
    searchPlaceholder: "I-type ang sugat...",
    searchBtn: "Hanapin",
    scanBtn: "📷 I-scan",
    commonInjuries: "Lahat ng Sugat at Kondisyon",
    backBtn: "← Bumalik",
    disclaimer: "Gabay lamang ito sa first-aid at hindi kapalit ng propesyonal na medikal na pangangalaga. Tumawag sa emergency services para sa malalang sugat.",
    settingsTitle: "Mga Setting",
    textSizeLabel: "Laki ng Teksto",
    sizeNormal: "Normal",
    sizeLarge: "Malaki",
    sizeXLarge: "Sobrang Laki",
    darkModeLabel: "Madilim na Mode",
    voiceLabel: "Basahin nang Malakas",
    languageLabel: "Wika",
    scanInstruction: "I-tapat ang camera sa sugat at huwag gagalaw...",
    scanCapture: "📸 Kunan at I-analisa",
    scanCancel: "Kanselahin",
    scanLoadingModel: "Nilo-load ang AI model...",
    scanNoModel: "Wala pang trained model. Gamitin ang Search.",
    scanNoCamera: "Hindi ma-access ang camera. Gamitin ang Search.",
    scanAnalyzing: "Sinusuri...",
    scanLowConfidence: "Hindi sigurado. Subukang ayusin ang liwanag/anggulo, o gamitin ang Search.",
  },
};

export function t(key) {
    const lang = state.settings.language;
    return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || TRANSLATIONS.en[key] || key;
}

export function applyTranslations() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
        const key = el.dataset.i18n;
        el.textContent = t(key);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
        const key = el.dataset.i18nPlaceholder;
        el.placeholder = t(key);
    });
}