import { getProfile, updateProfile, MAX_PART_LEVEL, PART_SLOTS, type PartSlot } from './profile';
import type { TuningPoints } from './tuning';

// The Garage: parts bought with credits (economy.ts). Each slot maps one-to-one
// onto a decoupled stat knob (tuning.ts), and parts belong to the pilot's
// garage, not one hull, so they carry over whichever ship is picked.
// Each part level is worth a third of a pilot stat point, so a full Mk III
// slot equals one pilot point: upgrades sharpen a pick, they don't replace it.
// Prices are tuned with scripts/test-economy.ts.

export const POINTS_PER_LEVEL = 1 / 3;
export const ENERGY_PER_LEVEL = 0.1; // +10% max energy per capacitor level

export interface PartDef {
    slot: PartSlot;
    name: string;           // slot name on the card
    stat: string;           // what it tunes, in the player's words
    levelNames: string[];   // part name per level (index 0 = Mk I)
    prices: number[];       // credits per level (index 0 = Mk I)
    accent: string;         // card accent (CSS colour)
    statLabel: string;      // short label for the effect line
}

export const PARTS: PartDef[] = [
    {
        slot: 'engine',
        name: 'Engine',
        stat: 'Top speed',
        levelNames: ['Ion Core Mk I', 'Ion Core Mk II', 'Fusion Core Mk III'],
        prices: [1500, 3500, 7000],
        accent: '#22d3ee',
        statLabel: 'top speed',
    },
    {
        slot: 'thrusters',
        name: 'Thrusters',
        stat: 'Acceleration',
        levelNames: ['Vector Jets Mk I', 'Vector Jets Mk II', 'Plasma Jets Mk III'],
        prices: [1500, 3500, 7000],
        accent: '#facc15',
        statLabel: 'acceleration',
    },
    {
        slot: 'fins',
        name: 'Fins',
        stat: 'Handling',
        levelNames: ['Trim Fins Mk I', 'Trim Fins Mk II', 'Active Fins Mk III'],
        prices: [1500, 3500, 7000],
        accent: '#a855f7',
        statLabel: 'handling',
    },
    {
        slot: 'capacitor',
        name: 'Capacitor',
        stat: 'Energy',
        levelNames: ['Cell Bank Mk I', 'Cell Bank Mk II', 'Flux Capacitor Mk III'],
        prices: [1000, 2500, 5000],
        accent: '#22c55e',
        statLabel: 'max energy',
    },
];

export function getPart(slot: PartSlot): PartDef {
    return PARTS.find((p) => p.slot === slot)!;
}

export function getPartLevels(): Record<PartSlot, number> {
    return getProfile().parts;
}

// Price of the next level for a slot, or null when the slot is maxed.
export function nextPrice(slot: PartSlot, level: number = getPartLevels()[slot]): number | null {
    return level >= MAX_PART_LEVEL ? null : getPart(slot).prices[level];
}

export type BuyResult = 'ok' | 'maxed' | 'insufficient';

export function buyPart(slot: PartSlot): BuyResult {
    const profile = getProfile();
    const price = nextPrice(slot, profile.parts[slot]);
    if (price === null) return 'maxed';
    if (profile.credits < price) return 'insufficient';
    updateProfile((p) => {
        p.credits -= price;
        p.parts[slot] += 1;
    });
    return 'ok';
}

// Stat points the installed parts add on top of the pilot's own stats.
export function partPoints(levels: Record<PartSlot, number> = getPartLevels()): TuningPoints {
    return {
        velocity: levels.engine * POINTS_PER_LEVEL,
        acceleration: levels.thrusters * POINTS_PER_LEVEL,
        handling: levels.fins * POINTS_PER_LEVEL,
        energy: levels.capacitor * ENERGY_PER_LEVEL,
    };
}

// AI compensation: rivals in later cups race with the parts an average player
// would have bought by then, so upgrades keep pace with the cups instead of
// eroding them. Half a level per cup tier on every performance slot
// (Nebula stock, Sunscorch 0.5, Skyline 1, Cryo 1.5, Inferno 2).
// AI never uses energy, so the capacitor isn't mirrored.
export const AI_LEVEL_PER_TIER = 0.5;

export function aiPartPoints(tier: number): TuningPoints {
    const level = Math.min(MAX_PART_LEVEL, tier * AI_LEVEL_PER_TIER);
    return {
        velocity: level * POINTS_PER_LEVEL,
        acceleration: level * POINTS_PER_LEVEL,
        handling: level * POINTS_PER_LEVEL,
    };
}

export { PART_SLOTS, MAX_PART_LEVEL };
export type { PartSlot };
