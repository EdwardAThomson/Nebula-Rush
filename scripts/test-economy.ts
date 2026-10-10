// Garage economy sim: how fast credits come in, what they buy, and how the
// player's parts compare with the AI compensation at each cup tier.
// Run with: npx tsx scripts/test-economy.ts
//
// Tuning targets (what the tables in economy.ts / garage.ts aim for):
// - A podium player affords a first Mk I part within the first cup.
// - Average part level for a typical (front-runner) player stays roughly level
//   with the AI's per-tier compensation, so later cups don't get easier.
// - A full Mk III garage takes about one podium run through all five cups.

import { racePayout, cupBonus, tierMultiplier, PLACEMENT_PAYOUT } from '../src/game/economy';
import { PARTS, AI_LEVEL_PER_TIER } from '../src/game/garage';

const CUP_NAMES = ['Nebula', 'Sunscorch', 'Skyline', 'Cryo', 'Inferno'];
const RACES_PER_CUP = 5;

// Typical finishing positions per player archetype (each race, and cup rank).
const ARCHETYPES = [
    { name: 'Winner (avg 1st-2nd)', races: [1, 2, 1, 1, 2], cupRank: 1 },
    { name: 'Podium (avg 3rd)', races: [2, 4, 3, 3, 2], cupRank: 3 },
    { name: 'Front-runner (avg 5th)', races: [4, 6, 5, 5, 6], cupRank: 5 },
    { name: 'Mid-pack (avg 8th)', races: [7, 9, 8, 8, 8], cupRank: 8 },
    { name: 'Back-marker (avg 12th)', races: [11, 13, 12, 12, 12], cupRank: 12 },
];

// Greedy shopper: always buys the cheapest available next level.
function shop(credits: number, levels: number[]): number {
    for (;;) {
        let best = -1;
        let bestPrice = Infinity;
        PARTS.forEach((p, i) => {
            const price = p.prices[levels[i]];
            if (price !== undefined && price < bestPrice) { best = i; bestPrice = price; }
        });
        if (best < 0 || bestPrice > credits) return credits;
        credits -= bestPrice;
        levels[best]++;
    }
}

const fullGarage = PARTS.reduce((sum, p) => sum + p.prices.reduce((a, b) => a + b, 0), 0);
const perfSlots = PARTS.filter((p) => p.slot !== 'capacitor').length;

console.log('='.repeat(92));
console.log('GARAGE ECONOMY');
console.log('='.repeat(92));
console.log(`Placement payout (tier 0): 1st ${PLACEMENT_PAYOUT[0]}, 3rd ${PLACEMENT_PAYOUT[2]}, 10th ${PLACEMENT_PAYOUT[9]}, 11th+ 0`);
console.log(`Full garage (all four slots to Mk III): ${fullGarage.toLocaleString()} CR`);
console.log('Part prices: ' + PARTS.map((p) => `${p.name} ${p.prices.join('/')}`).join(' · '));
console.log('');

for (const a of ARCHETYPES) {
    console.log(`-- ${a.name} ${'-'.repeat(Math.max(0, 76 - a.name.length))}`);
    console.log('Cup        Tier  ×Pay   Earned   Banked total   Parts (eng/thr/fin/cap)  Avg perf lvl  AI lvl');
    let credits = 0;
    let lifetime = 0;
    const levels = PARTS.map(() => 0);
    CUP_NAMES.forEach((cup, tier) => {
        // The AI level is what rivals carry IN this cup; compare with what the
        // player could have bought BEFORE racing it.
        const perfAvg = levels.slice(0, perfSlots).reduce((x, y) => x + y, 0) / perfSlots;
        const aiLevel = Math.min(3, tier * AI_LEVEL_PER_TIER);
        let earned = a.races.slice(0, RACES_PER_CUP).reduce((sum, r) => sum + racePayout(r, false, tier, true), 0);
        earned += cupBonus(a.cupRank, tier);
        credits += earned;
        lifetime += earned;
        credits = shop(credits, levels);
        console.log(
            `${cup.padEnd(10)} ${String(tier).padStart(4)}  ${tierMultiplier(tier).toFixed(2)}  ${String(earned).padStart(7)}  ${String(lifetime).padStart(13)}   ${levels.join('/').padEnd(23)}  ${perfAvg.toFixed(2).padStart(12)}  ${aiLevel.toFixed(2).padStart(6)}`,
        );
    });
    console.log('');
}

// First purchase: how many Nebula races until the cheapest Mk I?
const cheapest = Math.min(...PARTS.map((p) => p.prices[0]));
for (const a of ARCHETYPES) {
    let credits = 0;
    let races = 0;
    while (credits < cheapest && races < 50 && a.races.some((r) => r <= PLACEMENT_PAYOUT.length)) {
        credits += racePayout(a.races[races % a.races.length], false, 0, true);
        races++;
        if (races % RACES_PER_CUP === 0) credits += cupBonus(a.cupRank, 0);
    }
    console.log(`${a.name.padEnd(26)} ${credits >= cheapest ? `first part after ${races} Nebula race(s)` : 'never paid (outside the top 10)'}`);
}

// Single Race grinding check: credits per race vs the campaign.
console.log('');
console.log(`Single Race (tier 0, 1st place): ${racePayout(1, false, 0, false)} CR vs campaign ${racePayout(1, false, 0, true)} CR`);
