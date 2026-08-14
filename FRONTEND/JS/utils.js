// FRONTEND/JS/utils.js

export function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
}

export function fuzzySearch(query, text) {
    if (!query || !text) return false;
    const q = query.toLowerCase().trim();
    const t = text.toLowerCase().trim();
    if (t === q) return true;
    if (t.includes(q)) return true;
    if (q.includes(t)) return true;
    const qWords = q.split(/\s+/);
    const tWords = t.split(/\s+/);
    for (const qWord of qWords) {
        for (const tWord of tWords) {
            if (tWord === qWord) return true;
            if (tWord.includes(qWord)) return true;
            if (qWord.includes(tWord)) return true;
        }
    }
    // Synonym expansion (simplified – you can keep your full map elsewhere)
    return false;
}

export function getSearchScore(query, text) {
    if (!query || !text) return 0;
    const q = query.toLowerCase().trim();
    const t = text.toLowerCase().trim();
    if (t === q) return 100;
    if (t.startsWith(q)) return 90;
    if (t.includes(q)) return 80;
    if (q.includes(t)) return 70;
    const qWords = q.split(/\s+/);
    const tWords = t.split(/\s+/);
    let matches = 0;
    let total = qWords.length;
    for (const qWord of qWords) {
        for (const tWord of tWords) {
            if (tWord === qWord) matches += 2;
            else if (tWord.includes(qWord)) matches += 1;
            else if (qWord.includes(tWord)) matches += 0.5;
        }
    }
    return Math.min(100, (matches / Math.max(total, 1)) * 100);
}

export function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}