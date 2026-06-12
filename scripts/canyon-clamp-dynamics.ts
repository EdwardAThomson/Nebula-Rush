/**
 * Canyon clamp DYNAMICS check — hunts for "sticky wall" pathologies.
 *
 * The collision soft-spot script verifies the clamp keeps the ship out of the
 * rock. This one verifies the clamp behaves sanely AS T ADVANCES, i.e. the
 * things that make a ship feel stuck or paralyzed at the edge:
 *   1. INVERSION:  minL > maxL (contradictory clamps fight each frame)
 *   2. COLLAPSE:   a side's offset hits the max(8, ...) floor (radius-cap spike
 *                  at a tangent kink) → the limit teleports across the road
 *   3. INWARD JUMP: the limit moves inward faster per world-unit travelled than
 *                  a ship can strafe away → continuous re-clamping (pinned)
 *
 * Run: npx tsx scripts/canyon-clamp-dynamics.ts
 */
import * as THREE from 'three';

const SCALE = 12.0;

const TRACKS = [
    {
        id: 'track_6', name: 'Mesa Run',
        points: [
            [0, 0, 0], [0, 0, -460], [220, 0, -780], [180, 0, -1180], [-80, 0, -1460],
            [-180, 0, -1880], [60, 0, -2240], [460, 0, -2380], [820, 0, -2260], [980, 0, -1900],
            [900, 0, -1520], [560, 0, -1260], [560, 0, -820], [420, 0, -360], [160, 0, 140],
            [-220, 0, 260], [-360, 0, 40], [-120, 0, 120],
        ],
    },
    {
        id: 'track_7', name: "Beggar's Gorge",
        points: [
            [0, 0, 0], [0, 9, -300], [0, 10, -620], [-80, 4, -940], [-260, -8, -1300],
            [-300, -24, -1680], [-160, -30, -2020], [140, -18, -2200], [520, -8, -2180], [800, -2, -1900],
            [860, 1, -1520], [740, 0, -1160], [520, 0, -900], [360, 0, -680], [180, 0, -540],
            [0, 0, -420], [-220, 0, -260], [-260, 0, 100], [-60, 0, 220],
        ],
    },
];

const WIDTH: Record<string, { t: number; half: number }[]> = {
    track_7: [
        { t: 0.00, half: 58 }, { t: 0.10, half: 56 }, { t: 0.18, half: 46 }, { t: 0.26, half: 38 },
        { t: 0.34, half: 48 }, { t: 0.42, half: 66 }, { t: 0.50, half: 78 }, { t: 0.58, half: 72 }, { t: 0.68, half: 60 },
    ],
};
const CANYON_DEFAULT_HALF = 60;
const widthAt = (id: string, t: number): number => {
    const prof = WIDTH[id];
    if (!prof) return CANYON_DEFAULT_HALF;
    const pts = [...prof].sort((a, b) => a.t - b.t);
    const tt = ((t % 1) + 1) % 1;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const aT = a.t, bT = i + 1 < pts.length ? b.t : b.t + 1;
        if (tt >= aT && tt <= bT) return a.half + (b.half - a.half) * ((tt - aT) / (bT - aT));
        if (i === pts.length - 1) return a.half + (b.half - a.half) * ((tt + 1 - aT) / (bT - aT));
    }
    return pts[0].half;
};

const TAU = Math.PI * 2;
const hashString = (s: string): number => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 0xffffffff;
};
const pnoise = (t: number, seed: number): number =>
    Math.sin(t * TAU * 3 + seed * 6.28) * 0.5 + Math.sin(t * TAU * 7 + seed * 14.1) * 0.3 + Math.sin(t * TAU * 13 + seed * 4.7) * 0.2;

const SHOULDER = 6, OFF_VAR = 3, SHIP_HALF = 8, EDGE_MARGIN = 3, WIN = 6;

for (const track of TRACKS) {
    const pts = track.points.map(([x, y, z]) => new THREE.Vector3(x, y, z).multiplyScalar(SCALE * 2));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const trackLength = curve.getLength();
    const N = Math.max(240, Math.min(900, Math.floor(trackLength / 70)));
    const segLen = trackLength / N;
    const seed = hashString(track.id);

    const wallOffset = (t: number, side: number): number => {
        const tt = ((t % 1) + 1) % 1;
        const tan = curve.getTangent(tt).normalize();
        const tn = curve.getTangent((tt + 1 / N) % 1).normalize();
        const latX = tan.z, latZ = -tan.x;
        const latLen = Math.hypot(latX, latZ) || 1;
        const base = WIDTH[track.id] ? widthAt(track.id, tt) + SHOULDER : 66;
        let off = base + pnoise(tt, seed) * OFF_VAR;
        const ang = Math.atan2(tan.x * tn.z - tan.z * tn.x, tan.x * tn.x + tan.z * tn.z);
        const radius = Math.abs(ang) > 1e-4 ? segLen / Math.abs(ang) : 1e9;
        const innerness = (latX / latLen * side) * (tn.x - tan.x) + (latZ / latLen * side) * (tn.z - tan.z);
        if (innerness > 0) off = Math.min(off, radius * 0.9);
        return Math.max(8, off);
    };
    const clampOffset = (t: number, side: number): number => {
        let m = Infinity;
        for (let k = -WIN; k <= WIN; k++) m = Math.min(m, wallOffset(t + k / N, side));
        return m;
    };
    const inset = SHIP_HALF + EDGE_MARGIN;
    const limits = (t: number): [number, number] => [-(clampOffset(t, 1) - inset), clampOffset(t, -1) - inset];

    const STEPS = 6000;
    let inversions = 0, collapses = 0;
    let worstJumpL = { jump: 0, t: 0 }, worstJumpR = { jump: 0, t: 0 };
    let minBand = { w: Infinity, t: 0 };
    const stepWorld = trackLength / STEPS; // world units of forward travel per step
    let [prevMin, prevMax] = limits(0);
    for (let s = 1; s <= STEPS; s++) {
        const t = s / STEPS;
        const [minL, maxL] = limits(t);
        if (minL > maxL && inversions++ < 4) console.log(`  !! INVERTED at t=${(t * 100).toFixed(1)}%: [${minL.toFixed(1)}, ${maxL.toFixed(1)}]`);
        for (const side of [-1, 1]) {
            const off = wallOffset(t, side);
            if (off <= 8.01 && collapses++ < 4) console.log(`  !! COLLAPSED offset (radius-cap floor) at t=${(t * 100).toFixed(1)}% side ${side}`);
        }
        const band = maxL - minL;
        if (band < minBand.w) minBand = { w: band, t };
        // Inward movement of each limit per world-unit travelled. A ship strafes
        // ~0.5 lateral units per 1 forward unit at speed; much above that and a
        // wall-hugging ship is continuously re-clamped (feels pinned/sticky).
        const jumpL = (minL - prevMin) / stepWorld;   // left limit moving right (inward)
        const jumpR = (prevMax - maxL) / stepWorld;   // right limit moving left (inward)
        if (jumpL > worstJumpL.jump) worstJumpL = { jump: jumpL, t };
        if (jumpR > worstJumpR.jump) worstJumpR = { jump: jumpR, t };
        prevMin = minL; prevMax = maxL;
    }
    console.log(`─ ${track.name} (${track.id})  N=${N}`);
    console.log(`    inversions: ${inversions}   offset collapses: ${collapses}`);
    console.log(`    narrowest drivable band: ${minBand.w.toFixed(1)}u at t=${(minBand.t * 100).toFixed(1)}%`);
    console.log(`    worst inward limit slope: L ${worstJumpL.jump.toFixed(3)} u/u at t=${(worstJumpL.t * 100).toFixed(1)}%, R ${worstJumpR.jump.toFixed(3)} u/u at t=${(worstJumpR.t * 100).toFixed(1)}%`);
    console.log('');
}
