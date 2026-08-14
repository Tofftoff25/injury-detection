// FRONTEND/JS/captures.js

import { moveToTrash } from './history.js';

const CAPTURES_KEY = 'aide_captures';
const MAX_CAPTURES = 20;

export function saveCapture(imageData, label) {
    try {
        const captures = getCaptures();
        const entry = {
            id: Date.now(),
            timestamp: Date.now(),
            label: label || 'Unknown',
            imageData: imageData,
            date: new Date().toLocaleString()
        };
        captures.unshift(entry);
        if (captures.length > MAX_CAPTURES) {
            const old = captures.pop();
            moveToTrash({ ...old, item: 'Capture: ' + old.label });
        }
        localStorage.setItem(CAPTURES_KEY, JSON.stringify(captures));
        return entry;
    } catch (e) {
        console.warn('Could not save capture:', e);
        return null;
    }
}

export function getCaptures() {
    try {
        const data = localStorage.getItem(CAPTURES_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

export function deleteCapture(id) {
    try {
        const captures = getCaptures();
        const index = captures.findIndex(c => c.id === id);
        if (index !== -1) {
            moveToTrash({ ...captures[index], item: 'Capture: ' + captures[index].label });
            captures.splice(index, 1);
            localStorage.setItem(CAPTURES_KEY, JSON.stringify(captures));
            return true;
        }
        return false;
    } catch (e) {
        console.warn('Could not delete capture:', e);
        return false;
    }
}