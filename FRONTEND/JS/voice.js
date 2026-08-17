// FRONTEND/JS/voice.js
// A.I.D.E. v5 — speech is session-scoped and aggressively cancelled on navigation.

import { state, setSpeaking, setSpeechUtterance, setStepIndex } from './state.js';

let selectedVoice = null;
let currentUtterance = null;
let speechTimer = null;
let speechSession = 0;
let hardStopTimer = null;
let speechBlockedUntil = 0;
// A hard gate prevents delayed/queued speech from restarting after the user leaves a guide.
let speechSuppressed = true;

export function updateSelectedVoice(voiceName) {
    selectedVoice = voiceName === 'auto' ? null :
        window.speechSynthesis.getVoices().find(v => v.name === voiceName) || null;
}

export function getVoiceForLanguage(language) {
    const voices = window.speechSynthesis.getVoices();
    if (selectedVoice) return selectedVoice;

    if (language === 'tl') {
        const priorities = ['fil-ph', 'fil', 'tl-ph', 'tl', 'filipino', 'tagalog'];
        for (const priority of priorities) {
            const found = voices.find(v =>
                v.lang.toLowerCase().includes(priority) || v.name.toLowerCase().includes(priority)
            );
            if (found) return found;
        }
    }
    return voices[0] || null;
}

function clearSpeechTimer() {
    if (speechTimer !== null) {
        clearTimeout(speechTimer);
        speechTimer = null;
    }
}

function cancelBrowserSpeech() {
    try {
        // cancel() clears queued utterances. pause() is an additional guard
        // for browsers that briefly keep a cancelled utterance alive.
        window.speechSynthesis.cancel();
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
            window.speechSynthesis.pause();
            window.speechSynthesis.cancel();
        }
    } catch (_) {}
}

function beginHardStopGuard(duration = 900) {
    if (hardStopTimer) clearInterval(hardStopTimer);
    speechBlockedUntil = Date.now() + duration;
    cancelBrowserSpeech();
    hardStopTimer = setInterval(() => {
        // Check the block window FIRST. If something (e.g. enableSpeech()
        // for the next step) has already lowered speechBlockedUntil since
        // this guard started, stop immediately instead of issuing one more
        // cancel() that would kill speech that's legitimately supposed to
        // be playing now.
        if (Date.now() >= speechBlockedUntil) {
            clearInterval(hardStopTimer);
            hardStopTimer = null;
            return;
        }
        cancelBrowserSpeech();
    }, 50);
}

function resetSpeechState() {
    clearSpeechTimer();
    currentUtterance = null;
    setSpeaking(false);
    setSpeechUtterance(null);
    updateSpeakingUI(false);
}

export function speakCurrentStep(callback, sessionOverride) {
    if (speechSuppressed) return;
    if (!state.currentInjuryData) return callback?.();
    if (Date.now() < speechBlockedUntil) return;

    const steps = state.currentInjuryData.steps || [];
    const idx = state.currentStepIndex;
    if (!steps[idx]) return callback?.();

    // When called as part of an ongoing speakAllSteps() sequence, reuse
    // that sequence's session id instead of minting a new one — otherwise
    // the sequence's own "is this still the active session?" check would
    // permanently fail after the very first step, silently stopping
    // playback (this was the "only reads step 1" bug).
    const session = sessionOverride !== undefined ? sessionOverride : ++speechSession;
    clearSpeechTimer();
    cancelBrowserSpeech();
    resetSpeechState();

    const step = steps[idx];
    const title = String(step.title || '').trim();
    const text = String(step.text || step.description || step.instruction || step || '').trim();
    const fullText = [title, text].filter(Boolean).join('. ');
    if (!fullText || session !== speechSession) return callback?.();

    const utterance = new SpeechSynthesisUtterance(fullText);
    const voice = getVoiceForLanguage(state.settings.language);
    if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
    } else {
        utterance.lang = state.settings.language === 'tl' ? 'fil-PH' : 'en-US';
    }
    utterance.rate = 0.85;
    utterance.pitch = 1;
    utterance.volume = 1;

    currentUtterance = utterance;
    setSpeaking(true);
    setSpeechUtterance(utterance);
    updateSpeakingUI(true);

    const finish = (cancelled = false) => {
        if (session !== speechSession) return;
        resetSpeechState();
        if (!cancelled && Date.now() >= speechBlockedUntil) callback?.();
    };

    utterance.onstart = () => {
        if (session !== speechSession || Date.now() < speechBlockedUntil) {
            cancelBrowserSpeech();
        }
    };
    utterance.onend = () => finish(false);
    utterance.onerror = (event) => {
        const cancelled = event.error === 'canceled' || event.error === 'interrupted';
        finish(cancelled);
    };

    try {
        window.speechSynthesis.resume();
        window.speechSynthesis.speak(utterance);
    } catch (_) {
        finish(true);
    }
}

export function speakAllSteps() {
    if (!state.currentInjuryData) return;
    speechSuppressed = false;

    const runSession = ++speechSession;
    clearSpeechTimer();
    cancelBrowserSpeech();
    resetSpeechState();

    let idx = state.currentStepIndex;
    const total = state.currentInjuryData.steps?.length || 0;

    const speakNext = () => {
        if (runSession !== speechSession || !state.currentInjuryData || idx >= total) {
            if (runSession === speechSession) resetSpeechState();
            return;
        }

        setStepIndex(idx);
        speakCurrentStep(() => {
            if (runSession !== speechSession) return;
            idx += 1;
            speechTimer = setTimeout(() => {
                speechTimer = null;
                if (runSession === speechSession) speakNext();
            }, 350);
        }, runSession);
    };

    speakNext();
}

export function enableSpeech() {
    speechSuppressed = false;
    speechBlockedUntil = 0;
}

export function stopSpeaking() {
    // Invalidate callbacks FIRST, then stop the browser speech engine.
    // Speech remains suppressed until enableSpeech() or speakAllSteps() is called
    // explicitly for a new/active guide session.
    speechSession += 1;
    clearSpeechTimer();
    currentUtterance = null;
    setSpeaking(false);
    setSpeechUtterance(null);
    updateSpeakingUI(false);

    // The repeated cancellation is intentional: some Chromium speech engines
    // can finish an already-dispatched utterance a little after cancel().
    speechSuppressed = true;
    beginHardStopGuard(2500);
}

// Stop speech whenever the document/page is left as another safety net.
window.addEventListener('pagehide', stopSpeaking);
window.addEventListener('beforeunload', stopSpeaking);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopSpeaking();
});

function updateSpeakingUI(isSpeaking) {
    const speakBtn = document.getElementById('speak-btn');
    const speakStopBtn = document.getElementById('speak-stop-btn');
    speakBtn?.classList.toggle('speaking', isSpeaking);
    speakStopBtn?.classList.toggle('hidden', !isSpeaking);
    speakBtn?.setAttribute('aria-label', isSpeaking ? 'Stop speaking' : 'Read instructions aloud');
}

window._updateVoice = updateSelectedVoice;