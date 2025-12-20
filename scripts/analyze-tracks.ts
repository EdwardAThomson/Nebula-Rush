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
        ].map(p => p.multiplyScalar(SCALE)),
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
        ].map(p => p.multiplyScalar(SCALE)),
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
        ].map(p => p.multiplyScalar(SCALE)),
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
        ].map(p => p.multiplyScalar(SCALE)),
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
        ].map(p => p.multiplyScalar(SCALE)),
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

console.log(`\n${'='.repeat(80)}`);
console.log('ANALYSIS COMPLETE');
console.log('='.repeat(80));
