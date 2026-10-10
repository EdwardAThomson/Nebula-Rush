// Player profile: the ONE versioned localStorage record for progression state
// (credits, cup clears, and later: owned parts, energy upgrades). Preferences
// live elsewhere on purpose (audio in AudioManager's config, gameplay toggles
// in gameSettings.ts): preferences answer "how do you like to play", the
// profile answers "what have you earned". Wiping one shouldn't touch the other.

const STORAGE_KEY = 'nebula-rush-profile';

// Legacy key absorbed by the profile (migrated on first load, then ignored).
const LEGACY_CUPS_KEY = 'nebula-rush-cups-cleared';

// Garage part slots (see garage.ts for what each one tunes).
export const PART_SLOTS = ['engine', 'thrusters', 'fins', 'capacitor'] as const;
export type PartSlot = typeof PART_SLOTS[number];
export const MAX_PART_LEVEL = 3;

export interface PlayerProfile {
    version: 2;
    credits: number;          // earned from race placement (economy.ts), spent in the garage
    cupsCleared: string[];    // cup ids the player finished top 3 in
    parts: Record<PartSlot, number>; // installed garage part level per slot (0 = stock)
}

const stockParts = (): Record<PartSlot, number> => ({ engine: 0, thrusters: 0, fins: 0, capacitor: 0 });

const defaultProfile = (): PlayerProfile => ({
    version: 2,
    credits: 0,
    cupsCleared: [],
    parts: stockParts(),
});

// In-memory cache so reads are cheap and every writer sees the same object.
let cached: PlayerProfile | null = null;

function migrateLegacy(profile: PlayerProfile): PlayerProfile {
    try {
        const raw = localStorage.getItem(LEGACY_CUPS_KEY);
        if (raw) {
            const cleared = JSON.parse(raw) as string[];
            if (Array.isArray(cleared)) {
                profile.cupsCleared = [...new Set([...profile.cupsCleared, ...cleared])];
            }
        }
    } catch { /* legacy record unreadable: start clean */ }
    return profile;
}

// Future schema bumps: raise the version in PlayerProfile, then upgrade any
// older stored shape here, field by field. Never throw: worst case, return
// defaults and the player re-earns progression rather than crashing the game.
function upgrade(stored: unknown): PlayerProfile {
    if (!stored || typeof stored !== 'object') return migrateLegacy(defaultProfile());
    // v1 → v2: v1 had no parts, so it upgrades to stock parts.
    const s = stored as Partial<PlayerProfile>;
    const parts = stockParts();
    if (s.parts && typeof s.parts === 'object') {
        for (const slot of PART_SLOTS) {
            const level = (s.parts as Record<string, unknown>)[slot];
            if (typeof level === 'number' && Number.isInteger(level)) {
                parts[slot] = Math.max(0, Math.min(MAX_PART_LEVEL, level));
            }
        }
    }
    return {
        version: 2,
        credits: typeof s.credits === 'number' && s.credits >= 0 ? s.credits : 0,
        cupsCleared: Array.isArray(s.cupsCleared) ? s.cupsCleared.filter((c) => typeof c === 'string') : [],
        parts,
    };
}

export function getProfile(): PlayerProfile {
    if (cached) return cached;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        cached = raw ? upgrade(JSON.parse(raw)) : migrateLegacy(defaultProfile());
    } catch {
        cached = migrateLegacy(defaultProfile());
    }
    // Persist immediately so migration happens once, not on every load.
    persist(cached);
    return cached;
}

function persist(profile: PlayerProfile): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch { /* storage unavailable: progression lives for this session only */ }
}

// All writes go through here so persistence can never be forgotten.
export function updateProfile(mutate: (profile: PlayerProfile) => void): PlayerProfile {
    const profile = getProfile();
    mutate(profile);
    persist(profile);
    return profile;
}

// Test/dev helper: drop the cache so the next getProfile() re-reads storage.
export function resetProfileCache(): void {
    cached = null;
}
