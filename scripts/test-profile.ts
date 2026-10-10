// Headless sanity checks for the player profile store (profile.ts).
// Run with: npx tsx scripts/test-profile.ts

// Minimal localStorage stub so the module works under Node.
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
};

import { getProfile, updateProfile, resetProfileCache } from '../src/game/profile';

let failures = 0;
function check(name: string, cond: boolean) {
    console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}`);
    if (!cond) failures++;
}

// 1. Fresh start: defaults
store.clear(); resetProfileCache();
let p = getProfile();
check('fresh profile has 0 credits, no cups', p.credits === 0 && p.cupsCleared.length === 0);
check('fresh profile persisted immediately', store.has('nebula-rush-profile'));

// 2. Legacy cup-clears key migrates in
store.clear(); resetProfileCache();
store.set('nebula-rush-cups-cleared', JSON.stringify(['nebula', 'sunscorch']));
p = getProfile();
check('legacy cups migrated', p.cupsCleared.includes('nebula') && p.cupsCleared.includes('sunscorch'));

// 3. Writes persist and round-trip
updateProfile((prof) => { prof.credits += 250; prof.cupsCleared.push('skyline'); });
resetProfileCache();
p = getProfile();
check('credits round-trip', p.credits === 250);
check('cup write round-trips', p.cupsCleared.includes('skyline'));

// 4. Corrupt store recovers to defaults (no throw)
store.clear(); resetProfileCache();
store.set('nebula-rush-profile', '{not json!!');
p = getProfile();
check('corrupt profile falls back to defaults', p.credits === 0 && p.version === 2);

// 5. Corrupt fields sanitized
store.clear(); resetProfileCache();
store.set('nebula-rush-profile', JSON.stringify({ version: 1, credits: -50, cupsCleared: ['ok', 42, null] }));
p = getProfile();
check('negative credits sanitized', p.credits === 0);
check('non-string cup ids dropped', p.cupsCleared.length === 1 && p.cupsCleared[0] === 'ok');

// 6. v1 profile upgrades to v2 with stock parts, keeping credits and cups
store.clear(); resetProfileCache();
store.set('nebula-rush-profile', JSON.stringify({ version: 1, credits: 900, cupsCleared: ['nebula'] }));
p = getProfile();
check('v1 upgrades to v2', p.version === 2 && p.credits === 900 && p.cupsCleared[0] === 'nebula');
check('v1 upgrade gets stock parts', p.parts.engine === 0 && p.parts.capacitor === 0);

// 7. Part levels clamp to 0..3 and drop junk
store.clear(); resetProfileCache();
store.set('nebula-rush-profile', JSON.stringify({ version: 2, credits: 0, cupsCleared: [], parts: { engine: 9, fins: -2, thrusters: 'x', capacitor: 1.5 } }));
p = getProfile();
check('part levels sanitized', p.parts.engine === 3 && p.parts.fins === 0 && p.parts.thrusters === 0 && p.parts.capacitor === 0);

console.log(failures === 0 ? '\nAll profile checks passed.' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
