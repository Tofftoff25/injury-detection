// FRONTEND/JS/search.js

import { fuzzySearch, getSearchScore, debounce } from './utils.js';
import { state, setInjuryCache } from './state.js';
import { logAction } from './history.js';
import { showInstructionScreen } from './ui.js';
import { stopSpeaking } from './voice.js';
import { trackView } from './analytics.js';

// ---- API calls ----
export async function loadInjuryCache() {
    try {
        const res = await fetch('/api/injuries?lang=en');
        if (res.ok) {
            const data = await res.json();
            setInjuryCache(data);
            return data;
        }
    } catch (e) {
        console.warn('Cache load failed:', e);
    }
    return [];
}

export async function openInjury(key) {
    const lang = state.settings.language;
    const statusEl = document.getElementById('status-message');
    try {
        const res = await fetch(`/api/injury/${encodeURIComponent(key)}?lang=${lang}`);
        if (!res.ok) {
            const fallback = state.injuryCache.find(i => i.key === key);
            if (fallback) {
                trackView(key, fallback.name);
                showInstructionScreen({
                    key: fallback.key,
                    name: fallback.name,
                    icon: fallback.icon,
                    level: fallback.level,
                    steps: ['1. Seek medical help immediately.', '2. Stay calm and assess the situation.']
                });
                return;
            }
            statusEl.textContent = 'Could not load that injury. Please try again.';
            return;
        }
        const data = await res.json();
        trackView(key, data.name);
        showInstructionScreen(data);
    } catch (error) {
        const statusEl = document.getElementById('status-message');
        statusEl.textContent = 'Error loading injury. Please try again.';
        console.error(error);
    }
}

export async function handleSearch(query) {
    query = (query || document.getElementById('search-input').value).trim();
    const statusEl = document.getElementById('status-message');
    if (!query) return;
    hideSuggestions();
    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
            const data = await res.json();
            logAction('searched', query, `Matched: ${data.key}`);
            stopSpeaking();
            openInjury(data.key);
            return;
        }
    } catch (e) {}
    const cache = state.injuryCache.length ? state.injuryCache : await loadInjuryCache();
    let bestMatch = null, bestScore = 0;
    for (const injury of cache) {
        const name = injury.name || injury.key;
        const score = getSearchScore(query, name);
        if (score > bestScore) {
            bestScore = score;
            bestMatch = injury;
        }
    }
    if (bestMatch && bestScore > 30) {
        logAction('searched', query, `Fuzzy matched: ${bestMatch.key} (${Math.round(bestScore)}%)`);
        stopSpeaking();
        openInjury(bestMatch.key);
        return;
    }
    statusEl.textContent = `No match found for "${query}". Try a different term.`;
    statusEl.classList.remove('info');
    logAction('searched', query, 'No match found');
}

// ---- Suggestions ----
const suggestionList = document.getElementById('suggestion-list');
let suggestionActiveIndex = -1;

export function hideSuggestions() {
    suggestionList.classList.add('hidden');
    suggestionList.innerHTML = '';
    suggestionActiveIndex = -1;
}

function renderSuggestions(matches) {
    suggestionActiveIndex = -1;
    if (!matches.length) {
        hideSuggestions();
        return;
    }
    suggestionList.innerHTML = '';
    matches.forEach((m, i) => {
        const li = document.createElement('li');
        li.textContent = m.name;
        li.dataset.key = m.key;
        li.addEventListener('click', () => selectSuggestion(i));
        suggestionList.appendChild(li);
    });
    suggestionList.classList.remove('hidden');
}

function selectSuggestion(index) {
    const items = suggestionList.querySelectorAll('li');
    const item = items[index];
    if (!item) return;
    document.getElementById('search-input').value = item.textContent;
    hideSuggestions();
    logAction('searched', item.textContent, 'Selected from suggestions');
    stopSpeaking();
    openInjury(item.dataset.key);
}

function moveSuggestionSelection(delta) {
    const items = suggestionList.querySelectorAll('li');
    if (!items.length) return;
    suggestionActiveIndex = (suggestionActiveIndex + delta + items.length) % items.length;
    items.forEach((li, i) => li.classList.toggle('active', i === suggestionActiveIndex));
}

// ---- Setup search events ----
export function setupSearch() {
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');

    searchBtn.addEventListener('click', () => handleSearch());

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (suggestionActiveIndex >= 0) {
                selectSuggestion(suggestionActiveIndex);
            } else {
                handleSearch();
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            moveSuggestionSelection(1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            moveSuggestionSelection(-1);
        } else if (e.key === 'Escape') {
            hideSuggestions();
        }
    });

    const debouncedSuggest = debounce(async () => {
        const query = searchInput.value.trim();
        if (!query) { hideSuggestions(); return; }
        const cache = state.injuryCache.length ? state.injuryCache : await loadInjuryCache();
        const matches = [];
        const q = query.toLowerCase();
        for (const injury of cache) {
            const name = injury.name || injury.key;
            if (fuzzySearch(q, name)) {
                const score = getSearchScore(q, name);
                matches.push({ ...injury, score });
            }
        }
        matches.sort((a, b) => b.score - a.score);
        const top = matches.slice(0, 8).map(m => ({ key: m.key, name: m.name || m.key }));
        if (top.length) {
            renderSuggestions(top);
        } else {
            try {
                const res = await fetch(`/api/suggest?q=${encodeURIComponent(query)}`);
                const apiMatches = await res.json();
                renderSuggestions(apiMatches);
            } catch (e) {
                hideSuggestions();
            }
        }
    }, 150);

    searchInput.addEventListener('input', () => {
        document.getElementById('status-message').textContent = '';
        debouncedSuggest();
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-wrap')) hideSuggestions();
    });
}