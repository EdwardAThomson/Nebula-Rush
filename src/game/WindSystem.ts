import * as THREE from 'three';
import { getTrackFrame } from './TrackFactory';
import type { TrackConfig } from './TrackDefinitions';

// WindSystem — steady lateral storm wind for canyon tracks (Sandstorm Pass).
// Like createCanyonWallLimit, it's a factory closing over the curve + track
// config and exposing pure functions the game loop calls each frame:
//   lateralForce(t, ms) → velocity.x delta this frame (applied to player + AI)
//   gust(ms)            → 0.3 baseline .. ~1.6 peak gust envelope (visuals)
//   exposure(t)         → 0 (becalmed lee) .. ~1.1 (exposed crest)   (visuals)
//
// FORCE BUDGET: strength × maxExposure × maxGust must stay below the weakest
// ship's strafeSpeed (0.009/frame) on a SUSTAINED basis — strafe is the AI's
// only steering, so a constant wind stronger than it makes the downwind wall an
// inescapable trap. Gust peaks may transiently graze the budget because events
// are short (1.4–3.3s); the drama is drift integrated over seconds, not
// per-frame overpowering. See .claude/skills/track-creation.

const GUST_PERIOD = 5200; // ms between gust-event windows

// Deterministic per-window hash (no Math.random → identical every run).
const hash01 = (n: number): number => {
    let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
};

// A low baseline breeze punctuated by sporadic gust events (fast ramp-in, brief
// hold, slower die-off). Shared by physics and visuals so they stay in lockstep.
const gustAt = (ms: number): number => {
    let g = 0.3; // baseline breeze — always pushing, always visible
    for (const k of [0, -1]) { // current + previous window (events can straddle)
        const n = Math.floor(ms / GUST_PERIOD) + k;
        const start = n * GUST_PERIOD + hash01(n * 3 + 1) * GUST_PERIOD * 0.55;
        const dur = 1400 + hash01(n * 3 + 2) * 1900;   // 1.4–3.3s event
        const peak = 0.4 + hash01(n * 3 + 3) * 1.0;    // 0.4–1.4
        const x = (ms - start) / dur;
        if (x > 0 && x < 1) {
            const env = Math.min(x / 0.22, (1 - x) / 0.35, 1); // fast in, slow out
            const sm = env * env * (3 - 2 * env);
            g = Math.max(g, 0.3 + peak * sm);
        }
    }
    return g;
};

export interface WindSystem {
    enabled: boolean;
    dir: THREE.Vector2;                       // world-XZ direction the wind blows toward
    lateralForce: (t: number, ms: number) => number;
    gust: (ms: number) => number;
    exposure: (t: number) => number;
}

export const createWind = (curve: THREE.Curve<THREE.Vector3>, track: TrackConfig): WindSystem => {
    const cfg = track.wind;
    const dir = cfg ? new THREE.Vector2(cfg.dir[0], cfg.dir[1]).normalize() : new THREE.Vector2(1, 0);
    const strength = cfg?.strength ?? 0;

    // Periodic linear interpolation of the exposure profile (wraps on the loop).
    const exposure = (t: number): number => {
        const prof = cfg?.exposure;
        if (!prof || prof.length === 0) return 0;
        const pts = [...prof].sort((a, b) => a.t - b.t);
        const tt = ((t % 1) + 1) % 1;
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            const aT = a.t, bT = i + 1 < pts.length ? b.t : b.t + 1;
            const x = tt >= aT ? tt : tt + 1;
            if (x >= aT && x <= bT) return a.e + (b.e - a.e) * ((x - aT) / (bT - aT));
        }
        return pts[0].e;
    };

    // Pure-lateral force: wind direction projected onto the local (flat) binormal.
    const lateralForce = (t: number, ms: number): number => {
        if (!cfg) return 0;
        const f = getTrackFrame(curve, ((t % 1) + 1) % 1, false); // flat frame (canyon)
        const lat = dir.x * f.binormal.x + dir.y * f.binormal.z;
        return lat * strength * exposure(t) * gustAt(ms);
    };

    return { enabled: !!cfg, dir, lateralForce, gust: gustAt, exposure };
};
