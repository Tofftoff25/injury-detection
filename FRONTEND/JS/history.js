// FRONTEND/JS/history.js

const HISTORY_KEY = 'aide_history';
const TRASH_KEY = 'aide_trash';
const TRASH_RETENTION_DAYS = 30;
const MAX_HISTORY_ITEMS = 500;

// ---- Total views counter ----
export function incrementTotalViews() {
    let total = parseInt(localStorage.getItem('aide_total_views') || '0');
    total++;
    localStorage.setItem('aide_total_views', String(total));
    return total;
}

export function getTotalViews() {
    return parseInt(localStorage.getItem('aide_total_views') || '0');
}

export function logAction(action, itemName, details) {
    try {
        const history = getHistory();
        const entry = {
            timestamp: Date.now(),
            action: action,
            item: itemName,
            details: details || ''
        };
        history.unshift(entry);
        if (history.length > MAX_HISTORY_ITEMS) {
            history.length = MAX_HISTORY_ITEMS;
        }
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));

        if (action === 'viewed') {
            incrementTotalViews();
        }
    } catch (e) {
        console.debug('History log error:', e);
    }
}

export function getHistory() {
    try {
        const data = localStorage.getItem(HISTORY_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

export function clearHistory() {
    try {
        const history = getHistory();
        history.forEach(item => moveToTrash(item));
        localStorage.removeItem(HISTORY_KEY);
    } catch (e) {
        console.debug('Clear history error:', e);
    }
}

// --- Trash ---
export function moveToTrash(item) {
    try {
        const trash = getTrashItems();
        const entry = {
            ...item,
            id: Date.now() + Math.random() * 1000,
            deletedAt: Date.now(),
            expiresAt: Date.now() + (TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000)
        };
        trash.unshift(entry);
        localStorage.setItem(TRASH_KEY, JSON.stringify(trash));
        cleanTrash();
        return entry;
    } catch (e) {
        console.warn('Could not move to trash:', e);
    }
}

export function getTrashItems() {
    try {
        const data = localStorage.getItem(TRASH_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

export function restoreFromTrash(id) {
    try {
        const trash = getTrashItems();
        const index = trash.findIndex(t => t.id === id);
        if (index !== -1) {
            const item = trash[index];
            trash.splice(index, 1);
            localStorage.setItem(TRASH_KEY, JSON.stringify(trash));
            if (item.timestamp) {
                const history = getHistory();
                history.unshift({
                    timestamp: item.timestamp || Date.now(),
                    action: item.action || 'viewed',
                    item: item.item || 'Unknown',
                    details: item.details || ''
                });
                localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
            }
            return item;
        }
        return null;
    } catch (e) {
        console.warn('Could not restore from trash:', e);
        return null;
    }
}

export function cleanTrash() {
    try {
        const trash = getTrashItems();
        const now = Date.now();
        const filtered = trash.filter(item => item.expiresAt > now);
        if (filtered.length !== trash.length) {
            localStorage.setItem(TRASH_KEY, JSON.stringify(filtered));
        }
        return filtered;
    } catch (e) {
        return [];
    }
}

export function emptyTrash() {
    try {
        localStorage.removeItem(TRASH_KEY);
        return true;
    } catch (e) {
        return false;
    }
}