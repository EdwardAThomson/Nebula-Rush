import { CUPS, getCupForTrack } from './CupDefinitions';
import { updateProfile } from './profile';

// Credits: the garage currency, earned from race placement and spent on parts
// (garage.ts). Payouts scale with the cup tier so later, harder cups are where
// the money is, and campaign pays more than replaying one track in Single Race.
// Tuned with scripts/test-economy.ts; change the tables there first.

// Finishing-position payout in a 20-ship field (index 0 = 1st). A DNF earns 0.
export const PLACEMENT_PAYOUT = [
    1000, 800, 650, 550, 480, 430, 390, 350, 320, 290,
    260, 240, 220, 200, 180, 160, 140, 120, 110, 100,
];

// Cup podium bonus, paid on the final race of a cup (index 0 = cup winner).
export const CUP_PODIUM_BONUS = [3000, 2000, 1500];

// Single Race pays half: it's for practice and favourite tracks, while the
// campaign (and its cup bonus) is the main way to fund the garage.
export const SINGLE_RACE_FACTOR = 0.5;

// Cup tier: 0 for the first cup, +1 per cup along the unlock chain. Tracks with
// no cup (the tutorial loop) count as tier 0.
export function getCupTier(cupId: string | undefined): number {
    const index = CUPS.findIndex((c) => c.id === cupId);
    return index < 0 ? 0 : index;
}

export function getTrackTier(trackId: string): number {
    return getCupTier(getCupForTrack(trackId)?.id);
}

// +25% per tier: Nebula ×1, Sunscorch ×1.25 … Inferno ×2.
export function tierMultiplier(tier: number): number {
    return 1 + 0.25 * tier;
}

// Credits for one race. Rounded to 10 so the numbers read cleanly.
export function racePayout(rank: number, retired: boolean, tier: number, isCampaign: boolean): number {
    if (retired || rank < 1) return 0;
    const base = PLACEMENT_PAYOUT[rank - 1] ?? PLACEMENT_PAYOUT[PLACEMENT_PAYOUT.length - 1];
    const factor = tierMultiplier(tier) * (isCampaign ? 1 : SINGLE_RACE_FACTOR);
    return Math.round((base * factor) / 10) * 10;
}

// Bonus for finishing a cup on the podium (cup standings rank 1–3).
export function cupBonus(cupRank: number, tier: number): number {
    const base = CUP_PODIUM_BONUS[cupRank - 1] ?? 0;
    return Math.round((base * tierMultiplier(tier)) / 10) * 10;
}

// Bank credits into the profile; returns the new balance.
export function addCredits(amount: number): number {
    return updateProfile((profile) => {
        profile.credits += Math.max(0, Math.round(amount));
    }).credits;
}

// Credits as the UI shows them: "12,450 CR".
export function formatCredits(amount: number): string {
    return `${amount.toLocaleString('en-US')} CR`;
}
