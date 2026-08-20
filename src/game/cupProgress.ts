import { CUPS, isCupReady, type Cup } from './CupDefinitions';
import { getProfile, updateProfile } from './profile';

// Tracks which cups the player has cleared (finished top 3 in the cup
// standings). Clearing a cup unlocks the next one, plus pilot/ship rewards
// (see unlocks.ts). Stored in the versioned player profile (profile.ts);
// the old standalone localStorage key is migrated on first load.

export function getClearedCups(): string[] {
    return getProfile().cupsCleared;
}

export function markCupCleared(cupId: string): void {
    updateProfile((profile) => {
        if (!profile.cupsCleared.includes(cupId)) {
            profile.cupsCleared.push(cupId);
        }
    });
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
