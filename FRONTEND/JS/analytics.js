// FRONTEND/JS/analytics.js

const ANALYTICS_KEY = 'aide_analytics';
const TIPS_KEY = 'aide_tips_dismissed';

// ----- Track Injury Views -----
export function trackView(injuryKey, injuryName) {
    try {
        const data = getAnalytics();
        const today = new Date().toISOString().split('T')[0];
        
        let todayEntry = data.find(entry => entry.date === today);
        if (!todayEntry) {
            todayEntry = { date: today, views: {} };
            data.push(todayEntry);
        }
        
        if (!todayEntry.views[injuryKey]) {
            todayEntry.views[injuryKey] = 0;
        }
        todayEntry.views[injuryKey]++;
        
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const cutoffStr = cutoff.toISOString().split('T')[0];
        const filtered = data.filter(entry => entry.date >= cutoffStr);
        
        localStorage.setItem(ANALYTICS_KEY, JSON.stringify(filtered));
    } catch (e) {
        console.debug('Analytics error:', e);
    }
}

// ----- Get Analytics Data -----
export function getAnalytics() {
    try {
        const data = localStorage.getItem(ANALYTICS_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

// ----- Get Most Viewed Injuries (last N days) -----
export function getMostViewedInjuries(days = 7) {
    const data = getAnalytics();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    
    const recent = data.filter(entry => entry.date >= cutoffStr);
    
    const totals = {};
    recent.forEach(entry => {
        Object.entries(entry.views).forEach(([key, count]) => {
            if (!totals[key]) totals[key] = 0;
            totals[key] += count;
        });
    });
    
    return Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => ({ key, count }));
}

// ----- Get Total Views -----
export function getTotalViews() {
    const data = getAnalytics();
    let total = 0;
    data.forEach(entry => {
        Object.values(entry.views).forEach(count => {
            total += count;
        });
    });
    return total;
}

// ----- Get Today's Views -----
export function getTodayViews() {
    const data = getAnalytics();
    const today = new Date().toISOString().split('T')[0];
    const todayEntry = data.find(entry => entry.date === today);
    if (!todayEntry) return 0;
    
    let total = 0;
    Object.values(todayEntry.views).forEach(count => {
        total += count;
    });
    return total;
}

// ----- Get Injury Name -----
export function getInjuryName(key) {
    const names = {
        'cuts and wounds': 'Cuts and Wounds',
        'burns': 'Burns',
        'sprains': 'Sprains',
        'nosebleed': 'Nosebleed',
        'choking': 'Choking',
        'fainting': 'Fainting',
        'bruises': 'Bruises',
        'insect bites': 'Insect Bites',
        'cardiac arrest': 'Cardiac Arrest',
        'stroke': 'Stroke',
        'seizures': 'Seizures',
        'allergic reaction': 'Allergic Reaction',
        'heat stroke': 'Heat Stroke',
        'hypothermia': 'Hypothermia',
        'concussion': 'Concussion',
        'fracture': 'Fracture',
        'anaphylaxis': 'Anaphylaxis',
        'poisoning': 'Poisoning',
        'drowning': 'Drowning',
        'snake bite': 'Snake Bite'
    };
    return names[key] || key;
}

// ----- Get Tips -----
export function getTips() {
    const mostViewed = getMostViewedInjuries(7);
    const total = getTotalViews();
    const today = getTodayViews();
    const tips = [];
    const dismissed = getDismissedTips();
    
    if (total === 0) {
        tips.push({
            id: 'intro',
            icon: '💡',
            text: 'Start by searching or tapping an injury to get first-aid guidance.',
            priority: 1
        });
    } else if (today > 0) {
        tips.push({
            id: 'today',
            icon: '📊',
            text: `You viewed ${today} injury guide${today > 1 ? 's' : ''} today. Keep learning!`,
            priority: 1
        });
    }
    
    if (mostViewed.length > 0) {
        const top = mostViewed[0];
        const name = getInjuryName(top.key);
        tips.push({
            id: 'top',
            icon: '🔥',
            text: `Most viewed: ${name} (${top.count} time${top.count > 1 ? 's' : ''})`,
            priority: 2
        });
    }
    
    if (mostViewed.length > 1) {
        const second = mostViewed[1];
        const name = getInjuryName(second.key);
        tips.push({
            id: 'second',
            icon: '📈',
            text: `Second most viewed: ${name} (${second.count} time${second.count > 1 ? 's' : ''})`,
            priority: 3
        });
    }
    
    if (total > 0 && total % 5 === 0) {
        tips.push({
            id: 'milestone',
            icon: '🎯',
            text: `You've reached ${total} total guide views! Great job staying prepared!`,
            priority: 4
        });
    }
    
    if (!dismissed.includes('safety_tip')) {
        const safetyTips = [
            { icon: '💊', text: 'Always have a first-aid kit accessible at home and in your car.' },
            { icon: '📞', text: 'Save emergency numbers (911, 117, 143) in your phone contacts.' },
            { icon: '🔄', text: 'Review first-aid procedures regularly to stay prepared.' },
            { icon: '👨‍👩‍👧', text: 'Teach family members basic first-aid techniques.' },
            { icon: '📱', text: 'Consider taking a first-aid certification course.' },
            { icon: '🧊', text: 'Keep ice packs in your freezer for sprains and bruises.' },
            { icon: '💧', text: 'Stay hydrated to prevent heat-related emergencies.' },
            { icon: '⚠️', text: 'Learn CPR – it can save a life during cardiac arrest.' },
            { icon: '🩹', text: 'Keep adhesive bandages in different sizes for various wounds.' },
            { icon: '🧴', text: 'Store antiseptic wipes and cream for cleaning wounds.' },
            { icon: '🌡️', text: 'A digital thermometer helps monitor fever during emergencies.' },
            { icon: '🔦', text: 'Keep a flashlight with your first-aid kit for dark environments.' },
        ];
        const randomTip = safetyTips[Math.floor(Math.random() * safetyTips.length)];
        tips.push({
            id: 'safety_tip',
            icon: randomTip.icon,
            text: randomTip.text,
            priority: 5,
            dismissible: true
        });
    }
    
    return tips.sort((a, b) => a.priority - b.priority);
}

// ----- Dismiss Tips -----
export function dismissTip(tipId) {
    try {
        const dismissed = getDismissedTips();
        if (!dismissed.includes(tipId)) {
            dismissed.push(tipId);
            localStorage.setItem(TIPS_KEY, JSON.stringify(dismissed));
        }
    } catch (e) {
        console.debug('Dismiss tip error:', e);
    }
}

export function getDismissedTips() {
    try {
        const data = localStorage.getItem(TIPS_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

// ----- Clear Analytics Data -----
export function clearAnalytics() {
    try {
        localStorage.removeItem(ANALYTICS_KEY);
        localStorage.removeItem(TIPS_KEY);
        return true;
    } catch (e) {
        return false;
    }
}