// Headless race sim: how fast is the AI field? Runs a full field (no player)
// on each track and reports finishing times and boost-pad pickups, so AI
// changes can be compared before/after. Times are in sim seconds (60 frames
// per second, dt = 1). Run with: npx tsx scripts/test-ai-pace.ts [races-per-track] [track-index]

import * as THREE from 'three';
import { OpponentManager } from '../src/game/OpponentManager';
import { TRACKS } from '../src/game/TrackDefinitions';
import { createTrackCurve } from '../src/game/TrackFactory';
import { createCanyonWallLimit } from '../src/game/CanyonTerrain';
import { createWind } from '../src/game/WindSystem';

const RACES = Number(process.argv[2] ?? 3);
const ONLY = process.argv[3] !== undefined ? Number(process.argv[3]) : undefined;
const MAX_FRAMES = 60 * 60 * 10;

const fmt = (s: number) => {
    const tenths = Math.round(s * 10);
    return `${Math.floor(tenths / 600)}:${((tenths % 600) / 10).toFixed(1).padStart(4, '0')}`;
};

for (const [ti, track] of TRACKS.entries()) {
    if (ONLY !== undefined && ti !== ONLY) continue;
    const curve = createTrackCurve(track.points);
    const trackLength = curve.getLength();
    const wallLimit = track.terrain === 'canyon'
        ? createCanyonWallLimit(curve, track.id, track.widthProfile)
        : undefined;
    const wind = createWind(curve, track);
    const hazards = track.hazards ?? [];

    const winners: number[] = [], medians: number[] = [], spreads: number[] = [];
    let boosts = 0, ships = 0, dnf = 0;
    for (let r = 0; r < RACES; r++) {
        const scene = new THREE.Scene();
        const roster = OpponentManager.generateRoster(19);
        const om = new OpponentManager(scene, curve, roster, true, wallLimit, wind.enabled ? wind.lateralForce : undefined, track.recharge);
        const done: (number | null)[] = om.opponents.map(() => null);
        const lastPad = om.opponents.map(() => -1);
        let frame = 0;
        for (; frame < MAX_FRAMES; frame++) {
            om.update(1, trackLength, track.pads, true, frame * 1000 / 60, hazards);
            om.opponents.forEach((o, i) => {
                const p = o.state.lastBoostPadIndex;
                if (p !== -1 && p !== lastPad[i] && !o.finished) boosts++;
                lastPad[i] = p;
                if (o.finished && done[i] === null) done[i] = o.retired ? -1 : frame / 60;
            });
            if (om.opponents.every(o => o.finished)) break;
        }
        const times = done.filter((t): t is number => t !== null && t > 0).sort((a, b) => a - b);
        dnf += done.filter(t => t === -1).length;
        ships += om.opponents.length;
        if (times.length) {
            winners.push(times[0]);
            medians.push(times[Math.floor(times.length / 2)]);
            spreads.push(times[times.length - 1] - times[0]);
        }
    }
    const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
    console.log(`${track.name.padEnd(22)} winner ${fmt(avg(winners))}  median ${fmt(avg(medians))}  ` +
        `first→last ${avg(spreads).toFixed(1)}s  boosts/ship/race ${(boosts / ships).toFixed(1)}  DNF ${dnf}/${ships}`);
}
