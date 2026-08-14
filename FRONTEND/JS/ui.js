// FRONTEND/JS/ui.js

import { state, setCurrentInjury, setStepIndex } from './state.js';
import { getHistory, getTrashItems, getTotalViews } from './history.js';
import { getCaptures, deleteCapture } from './captures.js';
import { stopSpeaking, enableSpeech, speakCurrentStep } from './voice.js';
import { getTimeAgo } from './utils.js';
import { hideSuggestions, openInjury as openInjuryFromSearch } from './search.js';
import { getTips, dismissTip } from './analytics.js';

// ---- DOM refs ----
const homeScreen = document.getElementById('home-screen');
const instructionScreen = document.getElementById('instruction-screen');
const injuryGrid = document.getElementById('injury-grid');
const quickAccessGrid = document.getElementById('quick-access-grid');
const statusMessage = document.getElementById('status-message');

const instructionIcon = document.getElementById('instruction-icon');
const instructionTitle = document.getElementById('instruction-title');
const instructionCategory = document.getElementById('instruction-category');

const backBtn = document.getElementById('back-btn');

// Stats
const statGuidesViewed = document.getElementById('stat-guides-viewed');
const statCapturesSaved = document.getElementById('stat-captures-saved');
const statTrashCount = document.getElementById('stat-trash-count');

// Tab bar
const tabBar = document.getElementById('app-tabbar');
const tabPanels = {
    guide: document.getElementById('tab-guide'),
    supplies: document.getElementById('tab-supplies'),
    emergency: document.getElementById('tab-emergency'),
    settings: document.getElementById('tab-settings'),
};

// Settings-tab sections
const settingsCapturesGrid = document.getElementById('settings-captures-grid');
const settingsCapturesCount = document.getElementById('settings-captures-count');
const settingsTrashList = document.getElementById('settings-trash-list');
const settingsTrashCount = document.getElementById('settings-trash-count');
const settingsHistoryList = document.getElementById('settings-history-list');

const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmOkBtn = document.getElementById('confirm-ok-btn');
const confirmCancelBtn = document.getElementById('confirm-cancel-btn');

// ---- Carousel DOM refs ----
const carouselSlide = document.getElementById('carousel-slide');
const carouselDots = document.getElementById('carousel-dots');
const carouselPrev = document.getElementById('carousel-prev');
const carouselNext = document.getElementById('carousel-next');
const carouselPause = document.getElementById('carousel-pause');
const carouselProgress = document.getElementById('carousel-progress');

let autoSlideTimer = null;
let isAutoSlidePaused = false;
const AUTO_SLIDE_DELAY = 6000;
let isUserInteracting = false;
let userInteractionTimeout = null;

// ---- TAB SWITCHING ----
let activeTab = 'guide';

export function showTab(tabName) {
    if (!tabPanels[tabName]) return;
    activeTab = tabName;

    Object.entries(tabPanels).forEach(([name, panel]) => {
        panel.classList.toggle('hidden', name !== tabName);
    });

    tabBar.querySelectorAll('.tab-btn').forEach((btn) => {
        const isActive = btn.dataset.tab === tabName;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
    });

    if (tabName !== 'guide') {
        stopSpeaking();
        document.body.classList.remove('instruction-active');
    } else if (!instructionScreen.classList.contains('hidden')) {
        document.body.classList.add('instruction-active');
    }

    if (tabName === 'settings') {
        renderCaptures();
        renderTrashList();
        renderHistoryList();
    }
}

export function getActiveTab() {
    return activeTab;
}

// ---- SCREEN SWITCHING (within the Guide tab) ----
export function showHomeScreen() {
    stopSpeaking();
    clearAutoSlideTimer();
    instructionScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
    document.body.classList.remove('instruction-active');
    statusMessage.textContent = '';
    document.getElementById('search-input').value = '';
    hideSuggestions();
    updateStats();
    showTips();
}

// ---- Carousel Functions (v7 — sliding window, one step per swipe) ----
// Renders ALL steps into a horizontally-scrollable flex track once.
// CSS scroll-snap handles smooth native swiping (with momentum) and
// guarantees the view stops on every single step (scroll-snap-stop:
// always), so a fast flick can't skip past a step. An IntersectionObserver
// keeps state.currentStepIndex / the dots / progress text in sync no
// matter how the user navigates (swipe, buttons, or dots).

let stepObserver = null;
let isProcedureComplete = false;

function cleanStepTitle(title, index) {
    let value = String(title || '').trim();
    if (!value) return '';
    const prefix = new RegExp(`^step\\s*${index + 1}\\s*[:\\-—.]?\\s*`, 'i');
    while (prefix.test(value)) value = value.replace(prefix, '').trim();
    return value;
}

function cleanStepText(text, index) {
    let value = String(text || '').trim();
    const prefix = new RegExp(`^step\\s*${index + 1}\\s*[:\\-—.]?\\s*`, 'i');
    while (prefix.test(value)) value = value.replace(prefix, '').trim();
    return value;
}

function stepMarkup(step, index, data) {
    const title = cleanStepTitle(step.title, index);
    const text = cleanStepText(step.text || step.description || step.instruction || step, index);
    const imgSrc = step.image || data.icon || '';
    const imgHtml = imgSrc
        ? `<img src="${imgSrc}" alt="Step ${index + 1}${title ? ` — ${title}` : ''}" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\'step-number-badge\'>${index + 1}</span>'">`
        : `<span class="step-number-badge">${index + 1}</span>`;
    const tipHtml = step.tip ? `<div class="carousel-step-tip">💡 ${step.tip}</div>` : '';
    return `
      <article class="carousel-slide-item" aria-roledescription="slide" aria-label="Step ${index + 1}">
        <div class="carousel-step-illustration">${imgHtml}</div>
        <div class="carousel-step-label">Step ${index + 1}</div>
        ${title ? `<div class="carousel-step-title">${title}</div>` : ''}
        <div class="carousel-step-instruction">${text}</div>
        ${tipHtml}
      </article>`;
}

function renderAllSteps() {
    const data = state.currentInjuryData;
    if (!data?.steps?.length) return;

    carouselSlide.innerHTML = data.steps.map((step, i) => stepMarkup(step, i, data)).join('');

    // Make every card tappable — tap a peeking/neighboring card to jump
    // straight to it instead of only being able to swipe or use Next/Prev.
    carouselSlide.querySelectorAll('.carousel-slide-item').forEach((card, i) => {
        card.style.cursor = 'pointer';
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        card.addEventListener('click', () => {
            pauseAutoSlideForInteraction();
            goToStep(i);
        });
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                pauseAutoSlideForInteraction();
                goToStep(i);
            }
        });
    });

    carouselDots.innerHTML = '';
    data.steps.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.className = `carousel-dot${i === 0 ? ' active' : ''}`;
        dot.setAttribute('aria-label', `Go to step ${i + 1}`);
        dot.dataset.index = i;
        dot.addEventListener('click', () => {
            pauseAutoSlideForInteraction();
            goToStep(i);
        });
        carouselDots.appendChild(dot);
    });

    setupStepObserver();
}

function setupStepObserver() {
    if (stepObserver) {
        carouselSlide.removeEventListener('scroll', stepObserver);
        stepObserver = null;
    }
    const items = carouselSlide.querySelectorAll('.carousel-slide-item');
    if (!items.length) return;

    let settleTimer = null;
    const handler = () => {
        clearTimeout(settleTimer);
        // Wait for scrolling to settle rather than reacting to every
        // intermediate scroll frame — avoids picking a transient card
        // mid-swipe and only commits once the snap has landed.
        settleTimer = setTimeout(() => {
            const liveItems = carouselSlide.querySelectorAll('.carousel-slide-item');
            if (!liveItems.length) return;
            const trackRect = carouselSlide.getBoundingClientRect();
            const trackCenter = trackRect.left + trackRect.width / 2;
            let closestIdx = 0;
            let closestDist = Infinity;
            liveItems.forEach((item, i) => {
                const r = item.getBoundingClientRect();
                const dist = Math.abs((r.left + r.width / 2) - trackCenter);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestIdx = i;
                }
            });
            if (closestIdx !== state.currentStepIndex) {
                setStepIndex(closestIdx);
                updateProgressUI(closestIdx, liveItems.length);
            }
        }, 120);
    };
    carouselSlide.addEventListener('scroll', handler, { passive: true });
    stepObserver = handler;
}

function updateProgressUI(index, total) {
    carouselProgress.textContent = `Step ${index + 1} of ${total}`;
    carouselPrev.disabled = index === 0;
    carouselNext.disabled = index === total - 1;
    const dots = carouselDots.querySelectorAll('.carousel-dot');
    dots.forEach((d, i) => d.classList.toggle('active', i === index));

    const items = carouselSlide.querySelectorAll('.carousel-slide-item');
    items.forEach((item, i) => item.classList.toggle('is-current', i === index));

    // Move focus to the current step card so screen readers / the voice
    // assistant announce it as guidance advances, not just the first card.
    const current = items[index];
    if (current && document.activeElement !== current && instructionScreen && !instructionScreen.classList.contains('hidden')) {
        current.focus({ preventScroll: true });
    }
}

function scrollToStep(index, behavior = 'smooth') {
    const items = carouselSlide.querySelectorAll('.carousel-slide-item');
    const total = items.length;
    if (!total) return;
    index = Math.max(0, Math.min(index, total - 1));
    const target = items[index];
    if (!target) return;
    carouselSlide.scrollTo({ left: target.offsetLeft - carouselSlide.offsetLeft, behavior });
    updateProgressUI(index, total);
}

function showProcedureComplete() {
    if (isProcedureComplete) return; // already showing it — don't stack duplicates
    isProcedureComplete = true;
    stopSpeaking();
    clearAutoSlideTimer();
    carouselSlide.insertAdjacentHTML('beforeend', `
        <div class="carousel-slide-item carousel-complete">
            <div class="carousel-complete-icon">✅</div>
            <h3>Procedure Complete</h3>
            <p>You have completed all steps for ${state.currentInjuryData.name}.</p>
            <button id="restart-procedure-btn" class="btn btn-primary">🔄 Restart</button>
        </div>`);
    document.getElementById('restart-procedure-btn')?.addEventListener('click', () => {
        isProcedureComplete = false;
        renderAllSteps();
        goToStep(0);
    });
    carouselSlide.lastElementChild.scrollIntoView({ behavior: 'smooth', inline: 'start' });
    carouselProgress.textContent = 'Complete';
    carouselPrev.disabled = true;
    carouselNext.disabled = true;
}

export function goToPage(pageIndex) {
    // Kept for backward compatibility - now maps directly to a step index.
    goToStep(pageIndex);
}

export function goToStep(index) {
    const data = state.currentInjuryData;
    if (!data?.steps?.length) return;

    if (!carouselSlide.children.length) {
        renderAllSteps();
    }

    clearAutoSlideTimer();
    stopSpeaking();
    scrollToStep(index);
    setStepIndex(Math.max(0, Math.min(index, data.steps.length - 1)));

    if (state.settings.voice) {
        enableSpeech();
        speakCurrentStep(() => {
            if (!isAutoSlidePaused && !isUserInteracting && !isProcedureComplete && activeTab === 'guide' && !instructionScreen.classList.contains('hidden')) {
                startAutoSlideTimer();
            }
        });
    } else if (!isAutoSlidePaused && !isUserInteracting && !isProcedureComplete) {
        startAutoSlideTimer();
    }
    updateStats();
}

export function nextStep(isAuto = false) {
    if (!state.currentInjuryData) return;
    const total = state.currentInjuryData.steps.length;
    const next = state.currentStepIndex + 1;
    if (next >= total) {
        showProcedureComplete();
    } else {
        goToStep(next);
    }
    if (!isAuto) pauseAutoSlideForInteraction();
}

export function prevStep() {
    if (!state.currentInjuryData) return;
    const prev = state.currentStepIndex - 1;
    if (prev < 0) return;
    goToStep(prev);
    pauseAutoSlideForInteraction();
}

// ---- Auto-slide ----
function startAutoSlideTimer() {
    clearAutoSlideTimer();
    if (isAutoSlidePaused || isUserInteracting || activeTab !== 'guide' || isProcedureComplete) return;
    autoSlideTimer = setTimeout(() => {
        autoSlideTimer = null;
        nextStep(true);
    }, AUTO_SLIDE_DELAY);
}

function clearAutoSlideTimer() {
    if (autoSlideTimer) {
        clearTimeout(autoSlideTimer);
        autoSlideTimer = null;
    }
}

function updatePauseButtonUI() {
    const icon = carouselPause.querySelector('.carousel-play-icon');
    if (icon) icon.textContent = isAutoSlidePaused ? '▶' : '⏸';
    else carouselPause.textContent = isAutoSlidePaused ? '▶' : '⏸';
    carouselPause.classList.toggle('is-paused', isAutoSlidePaused);
    carouselPause.setAttribute('aria-label', isAutoSlidePaused ? 'Play: resume voice & auto-advance' : 'Pause voice & auto-advance');
}

export function toggleAutoSlide() {
    isAutoSlidePaused = !isAutoSlidePaused;
    updatePauseButtonUI();
    if (isAutoSlidePaused) {
        clearAutoSlideTimer();
        stopSpeaking();
        return;
    }
    if (state.settings.voice) {
        enableSpeech();
        speakCurrentStep(() => {
            if (!isAutoSlidePaused && !isUserInteracting && !isProcedureComplete && activeTab === 'guide' && !instructionScreen.classList.contains('hidden')) {
                startAutoSlideTimer();
            }
        });
    } else {
        startAutoSlideTimer();
    }
}

function pauseAutoSlideForInteraction() {
    isUserInteracting = true;
    clearAutoSlideTimer();
    clearTimeout(userInteractionTimeout);
    userInteractionTimeout = setTimeout(() => {
        isUserInteracting = false;
        if (activeTab === 'guide' && !instructionScreen.classList.contains('hidden') && !isAutoSlidePaused && !isProcedureComplete) {
            startAutoSlideTimer();
        }
    }, 5000);
}

// Native scroll-snap on .carousel-slide handles touch swiping directly —
// no manual touchstart/touchmove/touchend math needed anymore. We just
// pause auto-slide while the user's finger is on the track.
function setupSwipe() {
    if (carouselSlide.dataset.swipeReady) return;
    carouselSlide.dataset.swipeReady = 'true';
    carouselSlide.addEventListener('touchstart', () => pauseAutoSlideForInteraction(), { passive: true });
}

// ---- showInstructionScreen ----
export function showInstructionScreen(data) {
    stopSpeaking();
    setCurrentInjury(data);
    clearAutoSlideTimer();
    isAutoSlidePaused = false;
    isProcedureComplete = false;
    updatePauseButtonUI();

    instructionIcon.src = data.icon;
    instructionIcon.alt = data.name;
    instructionTitle.textContent = data.name;
    instructionCategory.textContent = data.category || '';

    // Normalize all step formats into one predictable structure.
    data.steps = (data.steps || []).map(step => {
        if (typeof step === 'string') return { text: step, title: '', tip: null, image: null };
        return {
            text: step.text || step.description || step.instruction || '',
            title: step.title || '',
            tip: step.tip || null,
            image: step.image || null
        };
    });

    homeScreen.classList.add('hidden');
    instructionScreen.classList.remove('hidden');
    document.body.classList.add('instruction-active');

    renderAllSteps();
    goToStep(0);

    import('./history.js').then(({ logAction }) => {
        logAction('viewed', data.name, `Level: ${data.level}`);
    });

    setupSwipe();
}

// ---- updateStepDisplay (for voice) ----
export function updateStepDisplay() {
    // Progress text/dots are kept in sync by updateProgressUI(), called
    // from the IntersectionObserver and from goToStep(). Kept as a
    // no-op export for backward compatibility with existing imports.
}

// ---- STATS ----
export function updateStats() {
    const totalViews = getTotalViews();
    if (statGuidesViewed) statGuidesViewed.textContent = totalViews;
    const captures = getCaptures();
    if (statCapturesSaved) statCapturesSaved.textContent = captures.length;
    const trash = getTrashItems();
    if (statTrashCount) statTrashCount.textContent = trash.length;
    if (settingsCapturesCount) settingsCapturesCount.textContent = captures.length ? `(${captures.length})` : '';
    if (settingsTrashCount) settingsTrashCount.textContent = trash.length ? `(${trash.length})` : '';
}

// ---- TIPS DISPLAY ----
export function showTips() {
    const container = document.getElementById('tips-container');
    if (!container) return;

    const tips = getTips();
    container.innerHTML = '';

    if (tips.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    const displayTips = tips.slice(0, 3);

    displayTips.forEach((tip, index) => {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            padding: ${index === 0 ? '0' : '6px 0 0 0'};
            font-size: 0.8rem;
            color: var(--text);
            border-top: ${index > 0 ? '1px solid var(--glass-border)' : 'none'};
            margin-top: ${index > 0 ? '6px' : '0'};
            opacity: 0.85;
            transition: opacity 0.2s;
        `;

        wrapper.onmouseenter = () => wrapper.style.opacity = '1';
        wrapper.onmouseleave = () => wrapper.style.opacity = '0.85';

        const iconSpan = document.createElement('span');
        iconSpan.textContent = tip.icon || '💡';
        iconSpan.style.cssText = 'font-size: 1rem; flex-shrink: 0;';

        const textSpan = document.createElement('span');
        textSpan.style.cssText = 'flex: 1; line-height: 1.3;';
        textSpan.textContent = tip.text;

        wrapper.appendChild(iconSpan);
        wrapper.appendChild(textSpan);

        if (tip.dismissible) {
            const dismissBtn = document.createElement('button');
            dismissBtn.style.cssText = `
                background: none;
                border: none;
                color: var(--muted);
                cursor: pointer;
                font-size: 0.7rem;
                padding: 0 4px;
                border-radius: 4px;
                flex-shrink: 0;
                opacity: 0.5;
                transition: opacity 0.2s;
            `;
            dismissBtn.textContent = '✕';
            dismissBtn.title = 'Dismiss this tip';
            dismissBtn.onmouseenter = () => dismissBtn.style.opacity = '1';
            dismissBtn.onmouseleave = () => dismissBtn.style.opacity = '0.5';
            dismissBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                dismissTip(tip.id);
                showTips();
            });
            wrapper.appendChild(dismissBtn);
        }

        container.appendChild(wrapper);
    });
}

// ---- INJURY GRID ----
const CRITICAL_CONDITIONS = [
    'cardiac arrest', 'choking', 'stroke', 'heat stroke', 'fainting',
    'anaphylaxis', 'drowning', 'snake bite', 'poisoning', 'hypothermia'
];

export function renderInjuryCards(injuries) {
    injuryGrid.innerHTML = '';
    quickAccessGrid.innerHTML = '';
    const critical = [];
    const normal = [];
    injuries.forEach(injury => {
        if (CRITICAL_CONDITIONS.includes(injury.key.toLowerCase())) {
            critical.push(injury);
        } else {
            normal.push(injury);
        }
    });
    critical.forEach(injury => renderCard(injury, quickAccessGrid));
    normal.forEach(injury => renderCard(injury, injuryGrid));
    if (injuries.length === 0) {
        injuryGrid.innerHTML = `<p style="text-align:center; color:var(--muted); grid-column:1/-1;">No injuries found.</p>`;
    }
}

function renderCard(injury, container) {
    const card = document.createElement('div');
    card.className = 'injury-card';
    const levelClass = injury.level.toLowerCase();
    card.classList.add(`card-${levelClass}`);
    const iconHtml = injury.icon
        ? `<img src="${injury.icon}" alt="${injury.name}" onerror="this.onerror=null; this.parentElement.innerHTML='🚑';">`
        : `<span style="font-size: 2rem;">🚑</span>`;
    card.innerHTML = `
        <span class="icon-circle ${levelClass}">
            ${iconHtml}
        </span>
        <div class="injury-name">${injury.name}</div>
        <span class="badge ${levelClass}">${injury.level.toUpperCase()}</span>
    `;
    card.addEventListener('click', () => openInjuryFromSearch(injury.key));
    container.appendChild(card);
}

// ---- FOCUS MANAGEMENT ----
let lastFocusedElement = null;

export function trapFocus(modalElement) {
    lastFocusedElement = document.activeElement;
    modalElement.focus();
}

export function releaseFocus() {
    if (lastFocusedElement) {
        lastFocusedElement.focus();
        lastFocusedElement = null;
    }
}

// ---- HISTORY (Settings tab) ----
export function renderHistoryList() {
    const history = getHistory();
    settingsHistoryList.innerHTML = '';
    if (history.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'history-empty';
        empty.textContent = 'No actions yet.';
        settingsHistoryList.appendChild(empty);
        return;
    }
    history.forEach(entry => {
        const li = document.createElement('li');
        const timeAgo = getTimeAgo(entry.timestamp);
        let emoji = '📋';
        if (entry.action === 'viewed') emoji = '👁️';
        else if (entry.action === 'searched') emoji = '🔍';
        else if (entry.action === 'scanned') emoji = '📸';
        li.textContent = `${emoji} ${entry.item} (${timeAgo})`;
        li.title = entry.details || '';
        settingsHistoryList.appendChild(li);
    });
}

// ---- CAPTURES (Settings tab) ----
export function renderCaptures() {
    const captures = getCaptures();
    settingsCapturesGrid.innerHTML = '';
    if (settingsCapturesCount) {
        settingsCapturesCount.textContent = captures.length ? `(${captures.length})` : '';
    }
    if (captures.length === 0) {
        settingsCapturesGrid.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:var(--muted);">No captures yet. Scan something to save images.</p>`;
        return;
    }
    captures.forEach(cap => {
        const div = document.createElement('div');
        div.style.cssText = 'background:var(--card); border-radius:12px; overflow:hidden; border:1px solid var(--border); position:relative;';
        const img = document.createElement('img');
        img.src = cap.imageData;
        img.style.cssText = 'width:100%; aspect-ratio:1; object-fit:cover; display:block;';
        img.alt = cap.label;
        const info = document.createElement('div');
        info.style.cssText = 'padding:6px 8px; font-size:0.7rem;';
        info.innerHTML = `<div style="font-weight:600; color:var(--text);">${cap.label}</div><div style="color:var(--muted); font-size:0.6rem;">${cap.date || ''}</div>`;
        const del = document.createElement('button');
        del.textContent = '🗑️';
        del.style.cssText = 'position:absolute; top:4px; right:4px; background:rgba(0,0,0,0.6); border:none; color:#fff; border-radius:50%; width:24px; height:24px; cursor:pointer; font-size:0.6rem; display:flex; align-items:center; justify-content:center;';
        del.title = 'Delete capture';
        del.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteCapture(cap.id);
            renderCaptures();
            updateStats();
        });
        div.appendChild(img);
        div.appendChild(info);
        div.appendChild(del);
        settingsCapturesGrid.appendChild(div);
    });
}

// ---- TRASH (Settings tab) ----
export function renderTrashList() {
    const trash = getTrashItems();
    if (settingsTrashCount) {
        settingsTrashCount.textContent = trash.length ? `(${trash.length})` : '';
    }
    settingsTrashList.innerHTML = '';
    if (trash.length === 0) {
        settingsTrashList.innerHTML = `<p class="trash-empty">🗑️ Trash is empty.</p>`;
        return;
    }
    trash.forEach(entry => {
        const div = document.createElement('div');
        div.className = 'trash-item';
        const timeAgo = getTimeAgo(entry.deletedAt || entry.timestamp);
        const name = entry.item || 'Unknown';
        const emoji = entry.action === 'viewed' ? '👁️' : entry.action === 'searched' ? '🔍' : '📸';
        const left = document.createElement('div');
        left.className = 'trash-item-left';
        left.innerHTML = `<span class="trash-item-name">${emoji} ${name}</span><span class="trash-item-time">${timeAgo}</span>`;
        const restore = document.createElement('button');
        restore.className = 'trash-restore-btn';
        restore.textContent = '♻️';
        restore.title = 'Restore';
        restore.addEventListener('click', (e) => {
            e.stopPropagation();
            import('./history.js').then(({ restoreFromTrash }) => {
                restoreFromTrash(entry.id);
                renderTrashList();
                renderHistoryList();
                updateStats();
            });
        });
        div.appendChild(left);
        div.appendChild(restore);
        settingsTrashList.appendChild(div);
    });
}

// ---- CONFIRM MODAL ----
let confirmResolve = null;

export function showConfirm(title, message) {
    return new Promise((resolve) => {
        confirmTitle.textContent = title || 'Confirm';
        confirmMessage.textContent = message || 'Are you sure?';
        confirmModal.classList.remove('hidden');
        trapFocus(confirmModal);
        confirmResolve = resolve;
    });
}

export function hideConfirm() {
    confirmModal.classList.add('hidden');
    releaseFocus();
    confirmResolve = null;
}

// ---- INIT UI ----
export function initUI() {
    tabBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (!btn) return;
        showTab(btn.dataset.tab);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!confirmModal.classList.contains('hidden')) hideConfirm();
        }
    });

    backBtn.addEventListener('click', () => {
        stopSpeaking();
        clearAutoSlideTimer();
        showHomeScreen();
    });

    confirmOkBtn.addEventListener('click', () => {
        if (confirmResolve) { confirmResolve(true); hideConfirm(); }
    });
    confirmCancelBtn.addEventListener('click', () => {
        if (confirmResolve) { confirmResolve(false); hideConfirm(); }
    });
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal && confirmResolve) { confirmResolve(false); hideConfirm(); }
    });

    carouselPrev?.addEventListener('click', () => prevStep());
    carouselNext?.addEventListener('click', () => nextStep());
    carouselPause?.addEventListener('click', toggleAutoSlide);

    document.getElementById('settings-afk-btn')?.addEventListener('click', () => {
        if (window._showAfkScreen) window._showAfkScreen();
    });
    document.getElementById('settings-clear-history-btn')?.addEventListener('click', async () => {
        const confirmed = await showConfirm('Clear History', 'All history will be moved to trash. You can restore within 30 days.');
        if (confirmed) {
            import('./history.js').then(({ clearHistory }) => {
                clearHistory();
                renderHistoryList();
                renderTrashList();
                updateStats();
            });
        }
    });
    document.getElementById('settings-analytics-btn')?.addEventListener('click', async () => {
        const confirmed = await showConfirm('Reset Analytics', 'This will clear all analytics data and tips. Continue?');
        if (confirmed) {
            import('./analytics.js').then(({ clearAnalytics }) => {
                clearAnalytics();
                showTips();
                updateStats();
            });
        }
    });
}