/**
 * Track Analysis Simulation
 * 
 * Simulates a ship traveling around each track and outputs frame data
 * to identify jitter sources (sudden changes in normal, binormal, banking).
 * 
 * Run with: npx tsx scripts/analyze-tracks.ts
 */

import * as THREE from 'three';

// Re-implement track definitions inline (can't import from src due to module issues)
const SCALE = 12.0;

const TRACKS = [
    {
        id: 'track_1',
        name: 'The Awakening',
        points: [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -400),
            new THREE.Vector3(100, 20, -600),
            new THREE.Vector3(300, 40, -800),
            new THREE.Vector3(500, 20, -600),
            new THREE.Vector3(600, 0, -300),
            new THREE.Vector3(500, -20, 0),
            new THREE.Vector3(300, 0, 200),
            new THREE.Vector3(0, 50, 400),
            new THREE.Vector3(-300, 30, 600),
            new THREE.Vector3(-600, 0, 400),
            new THREE.Vector3(-400, 0, 200),
            new THREE.Vector3(0, 0, 200)
        ].map(p => p.multiplyScalar(SCALE * 2)),
    },
    {
        id: 'track_2',
        name: 'Asteroid Slalom',
        points: [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -500),
            new THREE.Vector3(-150, 0, -1000),
            new THREE.Vector3(0, 0, -1400),
            new THREE.Vector3(150, 0, -1800),
            new THREE.Vector3(0, 0, -2200),
            new THREE.Vector3(-150, 0, -2600),
            new THREE.Vector3(0, 0, -3000),
            new THREE.Vector3(150, 0, -3400),
            new THREE.Vector3(0, 0, -3800),
            new THREE.Vector3(0, 0, -4200),
            new THREE.Vector3(300, 0, -4400),
            new THREE.Vector3(700, 0, -4200),
            new THREE.Vector3(900, 0, -3600),
            new THREE.Vector3(900, 0, -3000),
            new THREE.Vector3(900, 0, -500),
            new THREE.Vector3(500, 0, 300),
        ].map(p => p.multiplyScalar(SCALE * 1.5)),
    },
    {
        id: 'track_3',
        name: 'Nebula Complex',
        points: [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -500),
            new THREE.Vector3(100, 10, -600),
            new THREE.Vector3(250, 40, -500),
            new THREE.Vector3(350, 60, -400),
            new THREE.Vector3(400, 80, -300),
            new THREE.Vector3(350, 60, -200),
            new THREE.Vector3(250, 40, -100),
            new THREE.Vector3(100, 80, -200),
            new THREE.Vector3(0, 120, -300),
            new THREE.Vector3(-100, 80, -400),
            new THREE.Vector3(-200, -40, -500),
            new THREE.Vector3(-300, -60, -650),
            new THREE.Vector3(-400, -80, -800),
            new THREE.Vector3(-300, -40, -950),
            new THREE.Vector3(-200, 0, -1100),
            new THREE.Vector3(0, 0, -1300),
            new THREE.Vector3(300, 0, -1100),
            new THREE.Vector3(200, 0, -500),
            new THREE.Vector3(250, 0, -200),
            new THREE.Vector3(300, 0, 100),
            new THREE.Vector3(250, 0, 300),
            new THREE.Vector3(100, 0, 400),
            new THREE.Vector3(0, 0, 300),
        ].map(p => p.multiplyScalar(SCALE * 2.5)),
    },
    {
        id: 'track_4',
        name: 'Hyperion Raceway',
        points: [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -600),
            new THREE.Vector3(100, 0, -900),
            new THREE.Vector3(300, 20, -1100),
            new THREE.Vector3(500, 50, -1000),
            new THREE.Vector3(650, 70, -900),
            new THREE.Vector3(700, 80, -800),
            new THREE.Vector3(650, 70, -700),
            new THREE.Vector3(500, 60, -600),
            new THREE.Vector3(200, 80, -500),
            new THREE.Vector3(0, 150, -400),
            new THREE.Vector3(-200, 80, -350),
            new THREE.Vector3(-300, 0, -300),
            new THREE.Vector3(-500, 20, -500),
            new THREE.Vector3(-600, 80, -800),
            new THREE.Vector3(-500, 100, -1100),
            new THREE.Vector3(-200, 50, -1400),
            new THREE.Vector3(0, 20, -1600),
            new THREE.Vector3(200, 50, -1800),
            new THREE.Vector3(0, 80, -2100),
            new THREE.Vector3(-200, 40, -2300),
            new THREE.Vector3(-400, 20, -2500),
            new THREE.Vector3(-600, 0, -2400),
            new THREE.Vector3(-800, 0, -2300),
            new THREE.Vector3(-950, 0, -2100),
            new THREE.Vector3(-950, 0, -1900),
            new THREE.Vector3(-800, 0, -1700),
            new THREE.Vector3(-600, 0, -1500),
            new THREE.Vector3(-550, 0, -1200),
            new THREE.Vector3(-600, 0, -600),
            new THREE.Vector3(-500, 0, 0),
            new THREE.Vector3(-300, 0, 500),
            new THREE.Vector3(0, 0, 600),
        ].map(p => p.multiplyScalar(SCALE * 2)),
    },
    {
        id: 'track_5',
        name: 'Stellar Vortex',
        points: [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -600),
            new THREE.Vector3(-400, -50, -1000),
            new THREE.Vector3(-800, 0, -1400),
            new THREE.Vector3(-600, 100, -1800),
            new THREE.Vector3(0, 150, -1600),
            new THREE.Vector3(400, 50, -1400),
            new THREE.Vector3(600, 0, -1000),
            new THREE.Vector3(400, -100, -600),
            new THREE.Vector3(0, -50, -400),
            new THREE.Vector3(-400, 50, -600),
            new THREE.Vector3(-600, 100, -1000),
            new THREE.Vector3(-400, 50, -1200),
            new THREE.Vector3(-200, 20, -1000),
            new THREE.Vector3(-400, 0, -500),
            new THREE.Vector3(-600, 0, 200),
            new THREE.Vector3(-400, 0, 700),
            new THREE.Vector3(0, 0, 800),
        ].map(p => p.multiplyScalar(SCALE * 2)),
    }
];

// Create track curve
function createTrackCurve(points: THREE.Vector3[]): THREE.CatmullRomCurve3 {
    return new THREE.CatmullRomCurve3(points, true, 'centripetal');
}

// Get track frame (same logic as TrackFactory.ts)
function getTrackFrame(trackCurve: THREE.Curve<THREE.Vector3>, t: number) {
    const point = trackCurve.getPoint(t);
    const tangent = trackCurve.getTangent(t).normalize();

    // Smooth curvature calculation with wider sampling
    const sampleOffset = 0.04;
    
    const samples: THREE.Vector3[] = [];
    for (let i = -3; i <= 3; i++) {
        const sampleT = (t + i * sampleOffset + 1) % 1;
        const nextT = (sampleT + sampleOffset + 1) % 1;
        const tangentA = trackCurve.getTangent(sampleT).normalize();
        const tangentB = trackCurve.getTangent(nextT).normalize();
        samples.push(new THREE.Vector3().crossVectors(tangentA, tangentB));
    }

    const weights = [0.05, 0.1, 0.2, 0.3, 0.2, 0.1, 0.05];
    const curvatureVector = new THREE.Vector3();
    samples.forEach((sample, i) => {
        curvatureVector.add(sample.clone().multiplyScalar(weights[i]));
    });

    const bankingFactor = 4.0;
    let bankAngle = -curvatureVector.y * bankingFactor;

    // Smooth deadzone
    const deadzone = 0.1;
    const smoothRange = 0.15;
    const absBankAngle = Math.abs(bankAngle);
    
    if (absBankAngle < deadzone + smoothRange) {
        const tSmooth = Math.max(0, (absBankAngle - deadzone) / smoothRange);
        const smoothT = tSmooth * tSmooth * (3 - 2 * tSmooth);
        bankAngle = Math.sign(bankAngle) * absBankAngle * smoothT;
    }

    const maxBank = Math.PI / 3;
    bankAngle = Math.max(-maxBank, Math.min(maxBank, bankAngle));

    const up = new THREE.Vector3(0, 1, 0);
    let binormal = new THREE.Vector3().crossVectors(tangent, up).normalize();
    if (binormal.length() < 0.01) binormal.set(1, 0, 0);
    binormal.applyAxisAngle(tangent, bankAngle);
    const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();

    return { position: point, tangent, normal, binormal, bankAngle };
}

// Analyze a single track
function analyzeTrack(track: typeof TRACKS[0]) {
    const curve = createTrackCurve(track.points);
    const samples = 500; // High resolution
    
    const data: {
        t: number;
        bankAngle: number;
        normalY: number;
        binormalY: number;
        deltaNormal: number;
        deltaBinormal: number;
        deltaBankAngle: number;
    }[] = [];

    let prevNormal: THREE.Vector3 | null = null;
    let prevBinormal: THREE.Vector3 | null = null;
    let prevBankAngle: number | null = null;

    for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const frame = getTrackFrame(curve, t);

        let deltaNormal = 0;
        let deltaBinormal = 0;
        let deltaBankAngle = 0;

        if (prevNormal && prevBinormal && prevBankAngle !== null) {
            deltaNormal = frame.normal.distanceTo(prevNormal);
            deltaBinormal = frame.binormal.distanceTo(prevBinormal);
            deltaBankAngle = Math.abs(frame.bankAngle - prevBankAngle);
        }

        data.push({
            t,
            bankAngle: frame.bankAngle * 180 / Math.PI, // Convert to degrees
            normalY: frame.normal.y,
            binormalY: frame.binormal.y,
            deltaNormal,
            deltaBinormal,
            deltaBankAngle: deltaBankAngle * 180 / Math.PI,
        });

        prevNormal = frame.normal.clone();
        prevBinormal = frame.binormal.clone();
        prevBankAngle = frame.bankAngle;
    }

    return data;
}

// Find jitter hotspots
function findHotspots(data: ReturnType<typeof analyzeTrack>, threshold: number = 0.05) {
    return data.filter(d => d.deltaNormal > threshold || d.deltaBinormal > threshold);
}

// Main
console.log('='.repeat(80));
console.log('TRACK JITTER ANALYSIS');
console.log('='.repeat(80));
console.log('');

for (const track of TRACKS) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`TRACK: ${track.name} (${track.id})`);
    console.log(`Control Points: ${track.points.length}`);
    console.log(`${'─'.repeat(60)}`);

    const data = analyzeTrack(track);
    const hotspots = findHotspots(data, 0.03); // Lower threshold to catch more issues

    // Statistics
    const maxDeltaNormal = Math.max(...data.map(d => d.deltaNormal));
    const maxDeltaBinormal = Math.max(...data.map(d => d.deltaBinormal));
    const maxDeltaBankAngle = Math.max(...data.map(d => d.deltaBankAngle));
    const avgDeltaNormal = data.reduce((sum, d) => sum + d.deltaNormal, 0) / data.length;
    const avgDeltaBinormal = data.reduce((sum, d) => sum + d.deltaBinormal, 0) / data.length;

    console.log(`\nSTATISTICS:`);
    console.log(`  Max ΔNormal:     ${maxDeltaNormal.toFixed(4)} (avg: ${avgDeltaNormal.toFixed(4)})`);
    console.log(`  Max ΔBinormal:   ${maxDeltaBinormal.toFixed(4)} (avg: ${avgDeltaBinormal.toFixed(4)})`);
    console.log(`  Max ΔBankAngle:  ${maxDeltaBankAngle.toFixed(2)}°`);

    if (hotspots.length > 0) {
        console.log(`\nHOTSPOTS (${hotspots.length} found where Δ > 0.03):`);
        console.log(`  ${'t%'.padEnd(8)} ${'ΔNormal'.padEnd(10)} ${'ΔBinormal'.padEnd(10)} ${'ΔBank°'.padEnd(10)} ${'NormalY'.padEnd(10)}`);
        
        // Group consecutive hotspots and show worst in each region
        let lastT = -1;
        for (const h of hotspots) {
            if (h.t - lastT > 0.02) { // New region
                console.log(`  ${(h.t * 100).toFixed(1).padEnd(8)} ${h.deltaNormal.toFixed(4).padEnd(10)} ${h.deltaBinormal.toFixed(4).padEnd(10)} ${h.deltaBankAngle.toFixed(2).padEnd(10)} ${h.normalY.toFixed(3).padEnd(10)}`);
            }
            lastT = h.t;
        }
    } else {
        console.log(`\n✓ No significant hotspots detected. Track is smooth.`);
    }

    // Show the worst 5 spots
    const worst = [...data].sort((a, b) => b.deltaNormal - a.deltaNormal).slice(0, 5);
    console.log(`\nWORST 5 SPOTS (by ΔNormal):`);
    for (const w of worst) {
        console.log(`  t=${(w.t * 100).toFixed(1)}%  ΔNormal=${w.deltaNormal.toFixed(4)}  ΔBinormal=${w.deltaBinormal.toFixed(4)}  Bank=${w.bankAngle.toFixed(1)}°`);
    }
}

// ===========================================================================
// DIFFICULTY SCORING (objective, hand-tunable). Analysis-only — NOT used at
// runtime.
//
// The game is track-bound with autopilot: holding forward finishes the race,
// and you can't fly off a corner. So curvature / elevation / length are largely
// "feel", not skill gates. The thing that actually challenges the player —
// the one thing autopilot doesn't solve — is HAZARDS: you must strafe to dodge
// blocks and avoid slicks, and hitting them costs the time/rank that decides a
// cup. So the model is HAZARD-DOMINANT; the geometry terms are minor modifiers.
//
// Hazard threat per obstacle "wall" = avoidability × type × reaction:
//   - avoidability: how much of the road it blocks (the widest clear lane left).
//     A 3-block cluster or a near-full-width hazard ≫ a single offset block with
//     a clear lane beside it. Clusters fall out of this automatically.
//   - type: a block (speed-bleed + knockback) hurts more than a slick (speed cap).
//   - reaction: a hazard on a sharp bend gives less time to read/dodge it.
//
// FUTURE LEVERS (hooks noted, not modelled yet):
//   - temporary fog / spray / dust obscuring the track  → VISIBILITY below
//     (drops < 1 to multiply hazard threat: harder to see = harder to dodge).
//   - variable track width at points → ROAD_WIDTH is global here; a per-hazard
//     local width would feed straight into the avoidability gap math.
// ===========================================================================

const ROAD_WIDTH = 120;          // flat-bottom road width (TrackFactory)
const ROAD_HALF = ROAD_WIDTH / 2;
const SHIP_WIDTH = 12;           // approx ship lateral footprint
const CLUSTER_T = 0.02;          // hazards within this Δt act as one wall
const TYPE_WEIGHT: Record<string, number> = { block: 1.0, slick: 0.5 };
const REACT_K = 0.6;             // how much a sharp bend amplifies a hazard

// Per-track hazards & boost pads. KEEP IN SYNC with src/game/TrackDefinitions.ts
// (this script can't import from src).
type Hz = { type: 'block' | 'slick'; t: number; lat: number; w: number };
const HAZARDS: Record<string, Hz[]> = {
    track_1: [
        { type: 'slick', t: 0.25, lat: -22, w: 32 },
        { type: 'slick', t: 0.62, lat: 22, w: 32 },
    ],
    track_2: [
        { type: 'block', t: 0.30, lat: -36, w: 16 }, { type: 'block', t: 0.30, lat: -18, w: 16 }, { type: 'block', t: 0.30, lat: 0, w: 16 },
        { type: 'block', t: 0.55, lat: 0, w: 16 }, { type: 'block', t: 0.55, lat: 18, w: 16 }, { type: 'block', t: 0.55, lat: 36, w: 16 },
        { type: 'slick', t: 0.85, lat: 22, w: 32 },
    ],
    track_3: [
        { type: 'slick', t: 0.30, lat: 22, w: 32 },
        { type: 'block', t: 0.60, lat: 0, w: 16 }, { type: 'block', t: 0.60, lat: 18, w: 16 }, { type: 'block', t: 0.60, lat: 36, w: 16 },
        { type: 'block', t: 0.82, lat: -36, w: 16 }, { type: 'block', t: 0.82, lat: -18, w: 16 }, { type: 'block', t: 0.82, lat: 0, w: 16 },
    ],
    track_4: [
        { type: 'slick', t: 0.20, lat: -22, w: 32 },
        { type: 'block', t: 0.45, lat: -36, w: 16 }, { type: 'block', t: 0.45, lat: -18, w: 16 }, { type: 'block', t: 0.45, lat: 0, w: 16 },
        { type: 'block', t: 0.72, lat: 0, w: 16 }, { type: 'block', t: 0.72, lat: 18, w: 16 }, { type: 'block', t: 0.72, lat: 36, w: 16 },
        { type: 'slick', t: 0.82, lat: 22, w: 32 },
    ],
    track_5: [
        { type: 'slick', t: 0.15, lat: -22, w: 32 },
        { type: 'block', t: 0.35, lat: 0, w: 16 }, { type: 'block', t: 0.35, lat: 18, w: 16 }, { type: 'block', t: 0.35, lat: 36, w: 16 },
        { type: 'slick', t: 0.55, lat: 22, w: 32 },
        { type: 'block', t: 0.75, lat: -36, w: 16 }, { type: 'block', t: 0.75, lat: -18, w: 16 }, { type: 'block', t: 0.75, lat: 0, w: 16 },
    ],
};
const PADS: Record<string, number> = { track_1: 4, track_2: 3, track_3: 4, track_4: 4, track_5: 5 };
// 1.0 = clear visibility. Future fog/spray/dust would drop this for affected
// tracks, multiplying hazard threat by (2 − visibility).
const VISIBILITY: Record<string, number> = { track_1: 1, track_2: 1, track_3: 1, track_4: 1, track_5: 1 };

// Cup membership — mirror of src/game/CupDefinitions.ts. Only cups whose tracks
// exist are scored.
const CUPS: { name: string; trackIds: string[] }[] = [
    { name: 'Nebula Cup', trackIds: ['track_1', 'track_2', 'track_3', 'track_4', 'track_5'] },
];

// Hand-tunable weights, applied to each metric normalized 0..1 across the tracks.
// Hazards dominate (the only real skill gate); geometry terms are minor; pads
// subtract (boosts let you recover lost time).
const WEIGHTS = {
    hazards: 0.75,    // the real skill gate under autopilot
    curvature: 0.12,  // feel / optimal line
    elevation: 0.08,  // spectacle, mild
    length: 0.00,     // duration, not difficulty — left in the table for info only
    padRelief: 0.05,  // boosts help recovery, but only a nudge
};

// Widest clear lateral lane (world units) a cluster of hazards leaves open.
function clearGap(group: Hz[]): number {
    const iv = group
        .map(h => [Math.max(-ROAD_HALF, h.lat - h.w / 2), Math.min(ROAD_HALF, h.lat + h.w / 2)] as [number, number])
        .sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const seg of iv) {
        const last = merged[merged.length - 1];
        if (last && seg[0] <= last[1]) last[1] = Math.max(last[1], seg[1]);
        else merged.push([seg[0], seg[1]]);
    }
    let maxGap = 0;
    let cursor = -ROAD_HALF;
    for (const [s, e] of merged) {
        maxGap = Math.max(maxGap, s - cursor);
        cursor = Math.max(cursor, e);
    }
    return Math.max(maxGap, ROAD_HALF - cursor);
}

// Local turn rate (0..1) over a short window around t — proxy for reaction time.
function localTurnNorm(curve: THREE.CatmullRomCurve3, t: number): number {
    const d = 0.012;
    const a = curve.getTangent((t - d + 1) % 1).normalize();
    const b = curve.getTangent((t + d) % 1).normalize();
    const ang = Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
    return Math.min(1, ang / 0.35); // ~0.35 rad over the window ≈ a hard corner
}

function hazardDifficulty(track: typeof TRACKS[0]): number {
    const hz = HAZARDS[track.id] ?? [];
    if (hz.length === 0) return 0;
    const curve = createTrackCurve(track.points);
    // Group hazards into "walls" by proximity along the track.
    const sorted = [...hz].sort((a, b) => a.t - b.t);
    const groups: Hz[][] = [];
    for (const h of sorted) {
        const g = groups[groups.length - 1];
        if (g && Math.abs(h.t - g[0].t) <= CLUSTER_T) g.push(h);
        else groups.push([h]);
    }
    const vis = VISIBILITY[track.id] ?? 1;
    let total = 0;
    for (const g of groups) {
        const gap = clearGap(g);
        const avoid = 1 - Math.min(gap, ROAD_WIDTH) / ROAD_WIDTH;   // 0 open … 1 walled off
        const typeW = Math.max(...g.map(h => TYPE_WEIGHT[h.type]));
        const react = 1 + REACT_K * localTurnNorm(curve, g[0].t);
        const tooTight = gap < SHIP_WIDTH ? 1.3 : 1;                // can't fit → extra spike
        total += avoid * typeW * react * tooTight * (2 - vis);
    }
    return total;
}

// Geometry metrics (minor modifiers under autopilot).
function geoMetrics(track: typeof TRACKS[0]) {
    const curve = createTrackCurve(track.points);
    const N = 600;
    let totalTurn = 0;
    let minY = Infinity, maxY = -Infinity;
    let prevTan: THREE.Vector3 | null = null;
    for (let i = 0; i <= N; i++) {
        const t = i / N;
        const p = curve.getPoint(t);
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
        const tan = curve.getTangent(t).normalize();
        if (prevTan) totalTurn += Math.acos(Math.max(-1, Math.min(1, tan.dot(prevTan))));
        prevTan = tan;
    }
    return { curvature: totalTurn * 180 / Math.PI, length: curve.getLength(), elevation: maxY - minY };
}

const norm = (v: number, min: number, max: number) => (max - min < 1e-6 ? 0 : (v - min) / (max - min));

const allRaw = TRACKS.map(t => {
    const g = geoMetrics(t);
    return { track: t, curvature: g.curvature, length: g.length, elevation: g.elevation, hazard: hazardDifficulty(t), pads: PADS[t.id] ?? 0 };
});
const range = (sel: (r: typeof allRaw[0]) => number) => ({ min: Math.min(...allRaw.map(sel)), max: Math.max(...allRaw.map(sel)) });
const R = {
    hazard: range(r => r.hazard),
    curvature: range(r => r.curvature),
    elevation: range(r => r.elevation),
    length: range(r => r.length),
    pads: range(r => r.pads),
};

const scored = allRaw.map(r => {
    const hN = norm(r.hazard, R.hazard.min, R.hazard.max);
    const cN = norm(r.curvature, R.curvature.min, R.curvature.max);
    const eN = norm(r.elevation, R.elevation.min, R.elevation.max);
    const lN = norm(r.length, R.length.min, R.length.max);
    const pN = norm(r.pads, R.pads.min, R.pads.max);
    const score01 = Math.max(0, Math.min(1,
        WEIGHTS.hazards * hN + WEIGHTS.curvature * cN + WEIGHTS.elevation * eN
        + WEIGHTS.length * lN - WEIGHTS.padRelief * pN));
    return { ...r, score: Math.round(score01 * 100) };
});
type Scored = (typeof scored)[number];
const scoreById = new Map<string, Scored>(scored.map(s => [s.track.id, s]));

console.log(`\n${'='.repeat(80)}`);
console.log('DIFFICULTY SCORES (hazard-dominant, hand-tunable — analysis only)');
console.log('='.repeat(80));
console.log('Weights:', JSON.stringify(WEIGHTS));
console.log('');
console.log(`  ${'TRACK'.padEnd(20)} ${'SCORE'.padEnd(6)} ${'hazard'.padEnd(8)} ${'turn°'.padEnd(7)} ${'length'.padEnd(8)} ${'elev'.padEnd(7)} pads`);
for (const s of [...scored].sort((a, b) => b.score - a.score)) {
    console.log(
        `  ${s.track.name.padEnd(20)} ${String(s.score).padEnd(6)} ` +
        `${s.hazard.toFixed(2).padEnd(8)} ${s.curvature.toFixed(0).padEnd(7)} ` +
        `${s.length.toFixed(0).padEnd(8)} ${s.elevation.toFixed(0).padEnd(7)} ${s.pads}`
    );
}

console.log('\nPER-CUP (listed easy → hard; flag = authored position if different):');
for (const cup of CUPS) {
    const members = cup.trackIds
        .map(id => scoreById.get(id))
        .filter((m): m is Scored => !!m);
    if (members.length === 0) { console.log(`\n  ${cup.name}: (no authored tracks yet)`); continue; }
    const avg = Math.round(members.reduce((sum, m) => sum + m.score, 0) / members.length);
    console.log(`\n  ${cup.name}  —  avg ${avg}`);
    [...members].sort((a, b) => a.score - b.score).forEach((m, i) => {
        const authoredIdx = cup.trackIds.indexOf(m.track.id);
        const flag = authoredIdx === i ? '' : `   ← authored #${authoredIdx + 1}`;
        console.log(`    ${i + 1}. ${m.track.name.padEnd(20)} ${m.score}${flag}`);
    });
}

console.log(`\n${'='.repeat(80)}`);
console.log('ANALYSIS COMPLETE');
console.log('='.repeat(80));
