// FRONTEND/JS/state.js

export const state = {
    // Settings
    settings: {
        textSize: 'normal',
        voice: false,
        language: 'en',
        voiceName: null, // will store selected voice name
    },
    idleTimeout: 300, // seconds

    // UI state
    currentInjuryData: null,
    currentStepIndex: 0,
    isSpeaking: false,
    speechUtterance: null,

    // Data caches
    injuryCache: [],

    // Other flags
    isAfk: false,
};

// Convenience setters
export function setState(key, value) {
    state[key] = value;
}

export function setSettings(newSettings) {
    state.settings = { ...state.settings, ...newSettings };
}

export function setCurrentInjury(data) {
    state.currentInjuryData = data;
    state.currentStepIndex = 0;
}

export function setStepIndex(index) {
    state.currentStepIndex = index;
}

export function setSpeaking(flag) {
    state.isSpeaking = flag;
}

export function setSpeechUtterance(utterance) {
    state.speechUtterance = utterance;
}

export function setInjuryCache(cache) {
    state.injuryCache = cache;
}

export function setIdleTimeout(seconds) {
    state.idleTimeout = seconds;
}

export function setAfk(flag) {
    state.isAfk = flag;
}