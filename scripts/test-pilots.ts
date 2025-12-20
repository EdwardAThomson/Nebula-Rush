// Pilot Performance Test Script
// Simulates how pilot stats modify ship performance
// Run with: npx tsx scripts/test-pilots.ts

import { PILOTS } from '../src/game/PilotDefinitions';
import { SHIP_STATS } from '../src/game/ShipFactory';

// How pilot stats are applied (from Game.tsx):
// - Acceleration: +/- 5% per point to accelFactor
// - Handling: +/- 10% per point to turnSpeed and strafeSpeed
// - Velocity: +/- 0.0002 per point to friction

interface PilotSimResult {
    name: string;
    velocity: number;
    acceleration: number;
    handling: number;
    statTotal: number;
    // Effective stats when applied to fighter (baseline ship)
    effectiveTopSpeed: number;
    effectiveAccel: number;
    effectiveTurnSpeed: number;
    timeToTopSpeed: number;
}

function simulatePilot(pilot: typeof PILOTS[0]): PilotSimResult {
    // Use fighter as baseline ship
    const baseStats = { ...SHIP_STATS.fighter };
    
    // Apply pilot modifiers (same logic as Game.tsx)
    const accelModifier = 1 + (pilot.stats.acceleration * 0.05);
    const handlingModifier = 1 + (pilot.stats.handling * 0.1);
    const frictionBonus = pilot.stats.velocity * 0.0002;
    
    const effectiveAccel = baseStats.accelFactor * accelModifier;
    const effectiveFriction = baseStats.friction + frictionBonus;
    const effectiveTurnSpeed = baseStats.turnSpeed * handlingModifier;
    
    // Calculate effective top speed
    const effectiveTopSpeed = effectiveAccel / (1 - effectiveFriction);
    
    // Simulate time to 90% top speed
    let velocity = 0;
    const target = effectiveTopSpeed * 0.90;
    let timeToTopSpeed = -1;
    
    for (let frame = 0; frame < 600; frame++) {
        velocity += effectiveAccel;
        velocity *= effectiveFriction;
        if (timeToTopSpeed < 0 && velocity >= target) {
            timeToTopSpeed = frame / 60;
            break;
        }
    }
    
    return {
        name: pilot.name,
        velocity: pilot.stats.velocity,
        acceleration: pilot.stats.acceleration,
        handling: pilot.stats.handling,
        statTotal: pilot.stats.velocity + pilot.stats.acceleration + pilot.stats.handling,
        effectiveTopSpeed,
        effectiveAccel,
        effectiveTurnSpeed,
        timeToTopSpeed
    };
}

console.log('='.repeat(100));
console.log('PILOT PERFORMANCE COMPARISON (applied to Fighter baseline)');
console.log('='.repeat(100));
console.log('');

// Raw stats table
console.log('RAW PILOT STATS:');
console.log('-'.repeat(100));
console.log(
    'Pilot'.padEnd(22) + '| ' +
    'VEL'.padEnd(5) + '| ' +
    'ACC'.padEnd(5) + '| ' +
    'HND'.padEnd(5) + '| ' +
    'Total'.padEnd(7) + '| ' +
    'Archetype'
);
console.log('-'.repeat(100));

for (const pilot of PILOTS) {
    const total = pilot.stats.velocity + pilot.stats.acceleration + pilot.stats.handling;
    
    // Determine archetype based on stats
    let archetype = 'Balanced';
    if (pilot.stats.velocity >= 2) archetype = 'Speed Demon';
    else if (pilot.stats.acceleration >= 2) archetype = 'Quick Start';
    else if (pilot.stats.handling >= 2) archetype = 'Precision';
    else if (pilot.stats.velocity <= -1 && pilot.stats.handling >= 1) archetype = 'Technical';
    else if (pilot.stats.acceleration <= -1 && pilot.stats.velocity >= 1) archetype = 'Cruiser';
    else if (total === 3) archetype = 'All-Rounder';
    
    const vel = pilot.stats.velocity >= 0 ? `+${pilot.stats.velocity}` : `${pilot.stats.velocity}`;
    const acc = pilot.stats.acceleration >= 0 ? `+${pilot.stats.acceleration}` : `${pilot.stats.acceleration}`;
    const hnd = pilot.stats.handling >= 0 ? `+${pilot.stats.handling}` : `${pilot.stats.handling}`;
    
    console.log(
        pilot.name.padEnd(22) + '| ' +
        vel.padEnd(5) + '| ' +
        acc.padEnd(5) + '| ' +
        hnd.padEnd(5) + '| ' +
        total.toString().padEnd(7) + '| ' +
        archetype
    );
}

console.log('');
console.log('EFFECTIVE PERFORMANCE (on Fighter ship):');
console.log('-'.repeat(100));
console.log(
    'Pilot'.padEnd(22) + '| ' +
    'Top Speed'.padEnd(11) + '| ' +
    'Accel'.padEnd(8) + '| ' +
    'Turn'.padEnd(10) + '| ' +
    'Time to 90%'.padEnd(12) + '| ' +
    'Speed Δ%'
);
console.log('-'.repeat(100));

const results = PILOTS.map(simulatePilot);
const baseTopSpeed = SHIP_STATS.fighter.accelFactor / (1 - SHIP_STATS.fighter.friction);

// Sort by top speed
results.sort((a, b) => b.effectiveTopSpeed - a.effectiveTopSpeed);

for (const r of results) {
    const speedDelta = ((r.effectiveTopSpeed / baseTopSpeed) - 1) * 100;
    const deltaStr = speedDelta >= 0 ? `+${speedDelta.toFixed(1)}%` : `${speedDelta.toFixed(1)}%`;
    
    console.log(
        r.name.padEnd(22) + '| ' +
        r.effectiveTopSpeed.toFixed(2).padEnd(11) + '| ' +
        r.effectiveAccel.toFixed(3).padEnd(8) + '| ' +
        r.effectiveTurnSpeed.toFixed(5).padEnd(10) + '| ' +
        `${r.timeToTopSpeed.toFixed(2)}s`.padEnd(12) + '| ' +
        deltaStr
    );
}

console.log('');
console.log('STAT BALANCE CHECK:');
console.log('-'.repeat(100));

const statTotals = PILOTS.map(p => ({
    name: p.name,
    total: p.stats.velocity + p.stats.acceleration + p.stats.handling
}));

const minTotal = Math.min(...statTotals.map(s => s.total));
const maxTotal = Math.max(...statTotals.map(s => s.total));

console.log(`Stat total range: ${minTotal} to ${maxTotal}`);
console.log('');

if (minTotal !== maxTotal) {
    console.log('⚠️  WARNING: Pilots have unequal stat totals!');
    console.log('');
    for (const s of statTotals.sort((a, b) => b.total - a.total)) {
        const indicator = s.total === maxTotal ? '(strongest)' : s.total === minTotal ? '(weakest)' : '';
        console.log(`   ${s.name.padEnd(22)} Total: ${s.total} ${indicator}`);
    }
} else {
    console.log('✓ All pilots have equal stat totals (balanced)');
}

console.log('');
console.log('MODIFIER FORMULAS (from Game.tsx):');
console.log('-'.repeat(100));
console.log('  Velocity:     friction += (velocity * 0.0002)');
console.log('  Acceleration: accelFactor *= (1 + acceleration * 0.05)');
console.log('  Handling:     turnSpeed *= (1 + handling * 0.1), strafeSpeed *= (1 + handling * 0.1)');
console.log('');
console.log('Fighter baseline: accel=0.55, friction=0.9912, turnSpeed=0.001, topSpeed=62.50');
console.log('');
