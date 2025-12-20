// Ship Performance Test Script
// Simulates ships at full throttle to compare top speeds and acceleration
// Run with: npx tsx scripts/test-ships.ts

import { SHIP_STATS } from '../src/game/ShipFactory';

interface SimResult {
    name: string;
    theoreticalTopSpeed: number;
    simulatedTopSpeed: number;
    time_to_90_percent: number;
    time_to_99_percent: number;
}

function simulateShip(name: string, accelFactor: number, friction: number): SimResult {
    // Physics formula per frame (dt=1):
    // velocity += throttle * accelFactor
    // velocity *= friction
    
    // At equilibrium: accelFactor = velocity * (1 - friction)
    // So: topSpeed = accelFactor / (1 - friction)
    
    const theoreticalTopSpeed = accelFactor / (1 - friction);
    
    // Simulate 600 frames (10 seconds at 60fps)
    let velocity = 0;
    const throttle = 1.0;
    const dt = 1;
    
    let time_to_90 = -1;
    let time_to_99 = -1;
    const target_90 = theoreticalTopSpeed * 0.90;
    const target_99 = theoreticalTopSpeed * 0.99;
    
    for (let frame = 0; frame < 600; frame++) {
        // Apply thrust
        velocity += throttle * accelFactor * dt;
        // Apply friction
        velocity *= Math.pow(friction, dt);
        
        if (time_to_90 < 0 && velocity >= target_90) {
            time_to_90 = frame / 60; // Convert to seconds
        }
        if (time_to_99 < 0 && velocity >= target_99) {
            time_to_99 = frame / 60;
        }
    }
    
    return {
        name,
        theoreticalTopSpeed,
        simulatedTopSpeed: velocity,
        time_to_90_percent: time_to_90,
        time_to_99_percent: time_to_99
    };
}

console.log('='.repeat(80));
console.log('SHIP PERFORMANCE COMPARISON');
console.log('='.repeat(80));
console.log('');

const results: SimResult[] = [];

for (const [name, stats] of Object.entries(SHIP_STATS)) {
    const result = simulateShip(name, stats.accelFactor, stats.friction);
    results.push(result);
}

// Sort by top speed
results.sort((a, b) => b.theoreticalTopSpeed - a.theoreticalTopSpeed);

console.log('SHIP STATS (from ShipFactory.ts):');
console.log('-'.repeat(80));
console.log(`${'Ship'.padEnd(12)} | ${'AccelFactor'.padEnd(12)} | ${'Friction'.padEnd(10)} | ${'Top Speed'.padEnd(12)}`);
console.log('-'.repeat(80));
for (const [name, stats] of Object.entries(SHIP_STATS)) {
    const topSpeed = stats.accelFactor / (1 - stats.friction);
    console.log(`${name.padEnd(12)} | ${stats.accelFactor.toFixed(4).padEnd(12)} | ${stats.friction.toFixed(4).padEnd(10)} | ${topSpeed.toFixed(2).padEnd(12)}`);
}

console.log('');
console.log('PERFORMANCE RESULTS (sorted by top speed):');
console.log('-'.repeat(80));
console.log(`${'Ship'.padEnd(12)} | ${'Top Speed'.padEnd(12)} | ${'Time to 90%'.padEnd(12)} | ${'Time to 99%'.padEnd(12)}`);
console.log('-'.repeat(80));

for (const result of results) {
    console.log(
        `${result.name.padEnd(12)} | ${result.theoreticalTopSpeed.toFixed(2).padEnd(12)} | ${result.time_to_90_percent.toFixed(2).padEnd(12)}s | ${result.time_to_99_percent.toFixed(2).padEnd(12)}s`
    );
}

console.log('');
console.log('ANALYSIS:');
console.log('-'.repeat(80));
console.log('Top Speed Formula: topSpeed = accelFactor / (1 - friction)');
console.log('');
console.log('The issue is that accelFactor and friction BOTH affect top speed.');
console.log('Higher friction (closer to 1) = higher top speed');
console.log('Higher accelFactor = higher top speed AND faster acceleration');
console.log('');
console.log('To make speedster fastest, you need:');
console.log('  speedster.accelFactor / (1 - speedster.friction) > fighter.accelFactor / (1 - fighter.friction)');
console.log('');

// Calculate what speedster friction should be to match fighter top speed
const fighterTopSpeed = SHIP_STATS.fighter.accelFactor / (1 - SHIP_STATS.fighter.friction);
const requiredSpeedsterFriction = 1 - (SHIP_STATS.speedster.accelFactor / fighterTopSpeed);
console.log(`Current fighter top speed: ${fighterTopSpeed.toFixed(2)}`);
console.log(`Current speedster top speed: ${(SHIP_STATS.speedster.accelFactor / (1 - SHIP_STATS.speedster.friction)).toFixed(2)}`);
console.log('');
console.log(`To make speedster MATCH fighter top speed, speedster friction should be: ${requiredSpeedsterFriction.toFixed(4)}`);
console.log(`To make speedster FASTER, friction should be > ${requiredSpeedsterFriction.toFixed(4)}`);
