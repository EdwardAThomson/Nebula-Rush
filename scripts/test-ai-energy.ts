// Headless race sim: does the AI field take energy damage, dodge blocks, use
// the recharge pad, and (rarely) retire? Runs every track with a full field,
// no player. Run with: npx tsx scripts/test-ai-energy.ts [races-per-track] [track-index]

import * as THREE from 'three';
import { OpponentManager } from '../src/game/OpponentManager';
import { TRACKS, RECHARGE_ZONE } from '../src/game/TrackDefinitions';
import { createTrackCurve } from '../src/game/TrackFactory';
import { createCanyonWallLimit } from '../src/game/CanyonTerrain';
import { createWind } from '../src/game/WindSystem';

const RACES = Number(process.argv[2] ?? 3);
const ONLY = process.argv[3] !== undefined ? Number(process.argv[3]) : undefined;
const MAX_FRAMES = 60 * 60 * 8; // 8 minutes of sim per race, generous

for (const [ti, track] of TRACKS.entries()) {
    if (ONLY !== undefined && ti !== ONLY) continue;
    const curve = createTrackCurve(track.points);
    const trackLength = curve.getLength();
    const wallLimit = track.terrain === 'canyon'
        ? createCanyonWallLimit(curve, track.id, track.widthProfile)
        : undefined;
    const wind = createWind(curve, track);
    const hazards = track.hazards ?? [];
    const blocks = hazards.filter(h => h.type === 'block').length;
    const rz = track.recharge ?? RECHARGE_ZONE;

    let hits = 0, recharges = 0, retired = 0, minEnergySum = 0, ships = 0, unfinished = 0;
    for (let r = 0; r < RACES; r++) {
        const scene = new THREE.Scene();
        const roster = OpponentManager.generateRoster(19);
        const om = new OpponentManager(scene, curve, roster, true, wallLimit, wind.enabled ? wind.lateralForce : undefined, track.recharge);
        const last = om.opponents.map(o => o.state.energy);
        const minE = om.opponents.map(o => o.state.energy / o.state.maxEnergy);
        const charged = om.opponents.map(() => false);
        let frame = 0;
        for (; frame < MAX_FRAMES; frame++) {
            om.update(1, trackLength, track.pads, true, frame * 1000 / 60, hazards);
            om.opponents.forEach((o, i) => {
                const e = o.state.energy;
                if (e < last[i] - 1) hits++;
                if (e > last[i] + 0.01) {
                    const t = o.state.trackProgress;
                    if (t >= rz.start && t <= rz.end) charged[i] = true;
                }
                last[i] = e;
                minE[i] = Math.min(minE[i], e / o.state.maxEnergy);
            });
            if (om.opponents.every(o => o.finished)) break;
        }
        if (frame >= MAX_FRAMES) console.log(`  ${track.name}: race ${r + 1} hit the frame cap`);
        om.opponents.forEach((o, i) => {
            ships++;
            if (o.retired) retired++;
            if (!o.finished) unfinished++;
            if (charged[i]) recharges++;
            minEnergySum += minE[i];
        });
    }
    console.log(`${track.name.padEnd(22)} blocks=${blocks}  block hits/ship/race=${(hits / ships).toFixed(2)}  ` +
        `used pad=${(100 * recharges / ships).toFixed(0)}%  avg min energy=${(100 * minEnergySum / ships).toFixed(0)}%  ` +
        `DNF=${retired}/${ships}${unfinished ? `  UNFINISHED=${unfinished}` : ''}`);
}
