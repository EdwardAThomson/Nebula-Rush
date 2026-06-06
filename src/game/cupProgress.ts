import { CUPS, isCupReady, type Cup } from './CupDefinitions';

// Tracks which cups the player has cleared (finished top 3 in the cup
// standings). Clearing a cup unlocks the next one. Persisted in localStorage.
const STORAGE_KEY = 'nebula-rush-cups-cleared';

export function getClearedCups(): string[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
        return [];
    }
}

export function markCupCleared(cupId: string): void {
    try {
        const cleared = getClearedCups();
        if (!cleared.includes(cupId)) {
            cleared.push(cupId);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cleared));
        }
    } catch {
        /* ignore — progression just won't persist */
    }
}

// A cup is unlocked if it's the first cup, or the cup before it has been cleared.
export function isCupUnlocked(cup: Cup, cleared: string[] = getClearedCups()): boolean {
    const index = CUPS.findIndex((c) => c.id === cup.id);
    if (index <= 0) return true;
    return cleared.includes(CUPS[index - 1].id);
}

// Selectable = authored (tracks exist) AND unlocked.
export function isCupSelectable(cup: Cup, cleared: string[] = getClearedCups()): boolean {
    return isCupReady(cup) && isCupUnlocked(cup, cleared);
}
