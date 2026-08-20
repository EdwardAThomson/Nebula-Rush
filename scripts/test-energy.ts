// Headless sanity checks for the energy system (PhysicsEngine).
// Run with: npx tsx scripts/test-energy.ts

import * as THREE from 'three';
import {
    updatePhysics, INITIAL_GAME_STATE, ENERGY_MAX, ENERGY_BLOCK_HIT,
    type GameState,
} from '../src/game/PhysicsEngine';
import { RECHARGE_ZONE } from '../src/game/TrackDefinitions';

let failures = 0;
function check(name: string, cond: boolean) {
    console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}`);
    if (!cond) failures++;
}

const throttleInput = { isKeyPressed: (k: string) => k === 'w' };
const idleInput = { isKeyPressed: () => false };
const trackLength = 5000;

function freshState(overrides: Partial<GameState> = {}): GameState {
    return { ...INITIAL_GAME_STATE, velocity: new THREE.Vector2(0, 0), energyEnabled: true, ...overrides };
}

// 1. Hazard block hit drains a flat chunk
{
    const s = freshState({ trackProgress: 0.30 });
    const hazards = [{ type: 'block' as const, trackProgress: 0.32, lateralPosition: 0, width: 30, length: 0.01 }];
    for (let i = 0; i < 600 && s.energy === ENERGY_MAX; i++) updatePhysics(s, throttleInput, trackLength, [], 1, undefined, true, hazards);
    check('block hit drains energy', s.energy === ENERGY_MAX - ENERGY_BLOCK_HIT);
}

// 2. Wall scraping drains over time
{
    const s = freshState({ trackProgress: 0.30, lateralPosition: 59 });
    for (let i = 0; i < 120; i++) {
        s.lateralPosition = 59; // hold against the wall
        updatePhysics(s, idleInput, trackLength, [], 1, undefined, true, []);
    }
    check('wall scrape drains (~20/2s)', s.energy < ENERGY_MAX - 15 && s.energy > ENERGY_MAX - 25);
}

// 3. Recharge pad refills (when ON it laterally), clamped at max
{
    const s = freshState({ energy: 40, trackProgress: RECHARGE_ZONE.start + 0.001, velocity: new THREE.Vector2(0, 0) });
    for (let i = 0; i < 120; i++) {
        s.trackProgress = RECHARGE_ZONE.start + 0.001; // parked on the pad band
        s.lateralPosition = RECHARGE_ZONE.lateralPosition; // and on the pad itself
        updatePhysics(s, idleInput, trackLength, [], 1, undefined, true, []);
    }
    check('pad recharges (~70/2s)', s.energy > 100 ? false : s.energy > 105 - 40 && s.energy <= ENERGY_MAX);
    for (let i = 0; i < 600; i++) {
        s.trackProgress = RECHARGE_ZONE.start + 0.001;
        s.lateralPosition = RECHARGE_ZONE.lateralPosition;
        updatePhysics(s, idleInput, trackLength, [], 1, undefined, true, []);
    }
    check('recharge clamps at max', s.energy === ENERGY_MAX);
}

// 3b. Pad is tactical: same track band but off the pad laterally → no regen
{
    const s = freshState({ energy: 40, trackProgress: RECHARGE_ZONE.start + 0.001 });
    for (let i = 0; i < 120; i++) {
        s.trackProgress = RECHARGE_ZONE.start + 0.001;
        s.lateralPosition = RECHARGE_ZONE.lateralPosition - RECHARGE_ZONE.width; // clearly off it
        updatePhysics(s, idleInput, trackLength, [], 1, undefined, true, []);
    }
    check('off-pad lateral gets no recharge', s.energy === 40);
}

// 3c. Per-track zone override: custom pad works, default location goes inert
{
    const custom = { start: 0.5, end: 0.53, lateralPosition: -30, width: 30 };
    const s = freshState({ energy: 40, rechargeZone: custom });
    for (let i = 0; i < 120; i++) {
        s.trackProgress = 0.51;
        s.lateralPosition = -30;
        updatePhysics(s, idleInput, trackLength, [], 1, undefined, true, []);
    }
    check('per-track pad recharges', s.energy > 60);

    const s2 = freshState({ energy: 40, rechargeZone: custom });
    for (let i = 0; i < 120; i++) {
        s2.trackProgress = RECHARGE_ZONE.start + 0.001;
        s2.lateralPosition = RECHARGE_ZONE.lateralPosition;
        updatePhysics(s2, idleInput, trackLength, [], 1, undefined, true, []);
    }
    check('default location inert when track overrides', s2.energy === 40);
}

// 4. Energy floors at 0, never negative
{
    const s = freshState({ energy: 5, trackProgress: 0.30, lateralPosition: 59 });
    for (let i = 0; i < 300; i++) {
        s.lateralPosition = 59;
        updatePhysics(s, idleInput, trackLength, [], 1, undefined, true, []);
    }
    check('energy floors at 0', s.energy === 0);
}

// 5. Disabled (AI / tutorial): no drain from anything
{
    const s = freshState({ energyEnabled: false, trackProgress: 0.30, lateralPosition: 59 });
    const hazards = [{ type: 'block' as const, trackProgress: 0.32, lateralPosition: 0, width: 130, length: 0.01 }];
    for (let i = 0; i < 300; i++) {
        s.lateralPosition = 59;
        updatePhysics(s, throttleInput, trackLength, [], 1, undefined, true, hazards);
    }
    check('energyEnabled=false never drains', s.energy === ENERGY_MAX);
}

console.log(failures === 0 ? '\nAll energy checks passed.' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
