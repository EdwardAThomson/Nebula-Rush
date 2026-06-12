/**
 * Canyon collision soft-spot finder.
 *
 * The shipped canyon collision is an analytic PERPENDICULAR clamp: it stops the
 * ship `CANYON_SHIP_HALF` short of `wallOffset(t)` measured straight out from the
 * ship's current point on the curve. But the wall is a faceted 2-D surface. On a
 * sharp corner a facet faces partly forward, so the ship can satisfy the 1-D
 * lateral limit at its own t yet be physically PAST that facet → it penetrates
 * the wall ("soft surface", engine hidden behind the rock).
 *
 * This replicates the wall geometry (same wallOffsetAt math as CanyonTerrain) and
 * the clamp, then walks the clamp boundary and measures the TRUE nearest distance
 * to the wall polyline. Where that distance is well under the ship half-width, the
 * ship body is inside the rock → a soft spot. Reports the worst per track.
 *
 * Run: npx tsx scripts/canyon-collision-check.ts
 */
import * as THREE from 'three';

const SCALE = 12.0;

// Same per-track points as src/game/TrackDefinitions.ts (canyon tracks).
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

// Per-track width profile (half-width). Beggar's Gorge varies; Mesa is constant 60.
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

// Mesa-style fixed offset (matches shipped CanyonTerrain: base 66 ± 3, capped on
// inside of bends). Beggar's uses the width profile + shoulder; both share the cap.
const SHOULDER = 6, OFF_VAR = 3, SHIP_HALF = 8;
function makeWallOffset(curve: THREE.CatmullRomCurve3, id: string, N: number, segLen: number) {
    const seed = hashString(id);
    const usesProfile = !!WIDTH[id];
    return (t: number, side: number): number => {
        const tan = curve.getTangent(t).normalize();
        const tn = curve.getTangent((t + 1 / N) % 1).normalize();
        const latX = tan.z, latZ = -tan.x;
        const latLen = Math.hypot(latX, latZ) || 1;
        const lx = latX / latLen, lz = latZ / latLen;
        const base = usesProfile ? widthAt(id, t) + SHOULDER : 66;
        let off = base + pnoise(t, seed) * OFF_VAR;
        const ang = Math.atan2(tan.x * tn.z - tan.z * tn.x, tan.x * tn.x + tan.z * tn.z);
        const radius = Math.abs(ang) > 1e-4 ? segLen / Math.abs(ang) : 1e9;
        const innerness = (lx * side) * (tn.x - tan.x) + (lz * side) * (tn.z - tan.z);
        if (innerness > 0) off = Math.min(off, radius * 0.9);
        return Math.max(8, off);
    };
}

// 2-D (x,z) point→segment distance.
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
    const dx = bx - ax, dz = bz - az;
    const L2 = dx * dx + dz * dz || 1;
    let tproj = ((px - ax) * dx + (pz - az) * dz) / L2;
    tproj = Math.max(0, Math.min(1, tproj));
    const cx = ax + tproj * dx, cz = az + tproj * dz;
    return Math.hypot(px - cx, pz - cz);
}

console.log('='.repeat(80));
console.log('CANYON COLLISION SOFT-SPOT CHECK  (true nearest-wall vs the analytic clamp)');
console.log('='.repeat(80));
console.log(`ship half-width = ${SHIP_HALF}; "penetration" = how far the ship body sits INSIDE the rock.\n`);

for (const track of TRACKS) {
    const pts = track.points.map(([x, y, z]) => new THREE.Vector3(x, y, z).multiplyScalar(SCALE * 2));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const trackLength = curve.getLength();
    const N = Math.max(240, Math.min(900, Math.floor(trackLength / 70)));
    const segLen = trackLength / N;
    const wallOffset = makeWallOffset(curve, track.id, N, segLen);

    // Build the two wall base polylines (x,z) exactly as the mesh does.
    const wall: Record<number, { x: number; z: number }[]> = { [-1]: [], [1]: [] };
    for (const side of [-1, 1]) {
        for (let i = 0; i <= N; i++) {
            const t = i / N;
            const p = curve.getPoint(t);
            const tan = curve.getTangent(t).normalize();
            const latX = tan.z, latZ = -tan.x;
            const latLen = Math.hypot(latX, latZ) || 1;
            const lx = latX / latLen, lz = latZ / latLen;
            const off = wallOffset(t, side);
            wall[side].push({ x: p.x + lx * side * off, z: p.z + lz * side * off });
        }
    }

    // Walk the clamp boundary densely; for each ship-centre boundary point find the
    // true nearest distance to that side's wall polyline. Penetration = HALF − dist.
    const STEPS = 4000;
    const worst: { t: number; side: number; pen: number; x: number; z: number }[] = [];
    for (let s = 0; s < STEPS; s++) {
        const t = s / STEPS;
        const p = curve.getPoint(t);
        const tan = curve.getTangent(t).normalize();
        const bnx = -tan.z, bnz = tan.x;            // horizontal binormal (= +lateral dir)
        const blen = Math.hypot(bnx, bnz) || 1;
        const bx = bnx / blen, bz = bnz / blen;
        for (const side of [-1, 1]) {
            // Windowed-min offset: a facet jutting in within ±WIN facets pulls the
            // clamp in. Plus EDGE_MARGIN extra inset to cover convex-corner chords
            // the perpendicular min can't see. (WIN=0, MARGIN=0 = old behaviour.)
            const WIN = 6, EDGE_MARGIN = 3;
            let off = Infinity;
            for (let k = -WIN; k <= WIN; k++) off = Math.min(off, wallOffset(((t + k / N) % 1 + 1) % 1, side));
            const inset = SHIP_HALF + EDGE_MARGIN;
            const limit = side === 1 ? -(off - inset) : (off - inset);        // clamp boundary (lateral)
            const sx = p.x + bx * limit, sz = p.z + bz * limit;               // ship centre at the clamp
            // nearest distance to this side's wall, searching a local window of facets.
            const center = Math.round((t) * N);
            let best = Infinity;
            for (let k = -40; k <= 40; k++) {
                const i = ((center + k) % N + N) % N;
                const a = wall[side][i], b = wall[side][i + 1] ?? wall[side][0];
                const d = segDist(sx, sz, a.x, a.z, b.x, b.z);
                if (d < best) best = d;
            }
            const pen = SHIP_HALF - best;
            if (pen > 1.0) worst.push({ t, side, pen, x: sx, z: sz });
        }
    }
    // Cluster: keep local maxima (suppress neighbours within Δt 0.01).
    worst.sort((a, b) => b.pen - a.pen);
    const kept: typeof worst = [];
    for (const w of worst) {
        if (kept.some((k) => Math.min(Math.abs(k.t - w.t), 1 - Math.abs(k.t - w.t)) < 0.01 && k.side === w.side)) continue;
        kept.push(w);
    }

    console.log(`─ ${track.name} (${track.id})  N=${N} facets/side`);
    if (kept.length === 0) { console.log(`    ✓ no soft spots (ship stays out of the rock everywhere)\n`); continue; }
    console.log(`    ${kept.length} soft spot(s) where the ship body penetrates the wall:`);
    for (const w of kept.slice(0, 8)) {
        console.log(`      t=${(w.t * 100).toFixed(1).padStart(5)}%  side ${w.side === 1 ? 'L' : 'R'}  penetration ${w.pen.toFixed(1)}u  @(${w.x.toFixed(0)},${w.z.toFixed(0)})`);
    }
    console.log('');
}

console.log('='.repeat(80));
console.log('DONE');
console.log('='.repeat(80));
