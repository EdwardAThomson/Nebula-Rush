// Stat tuning: the "decoupled" mapping from stat points onto the physics knobs,
// chosen by playtest on the Physics Test page (Aug 2026). Pilots (±2 points per
// stat) and garage parts (fractional points, see garage.ts) go through the same
// function, so a part is literally "a bit more of that pilot stat". Top speed =
// accelFactor / (1 - friction) at full throttle.

export interface TuningPoints {
    velocity: number;       // top speed
    acceleration: number;   // convergence (how fast the ship reaches top speed)
    handling: number;       // turn + strafe
    energy?: number;        // fractional capacity bonus (0.1 = +10% max energy)
}

interface Tunable {
    accelFactor: number;
    friction: number;
    turnSpeed: number;
    strafeSpeed: number;
    throttleRate?: number;
    maxEnergy?: number;
}

// Mutates and returns `config`; pass a copy if the original must survive.
export function applyTuning<T extends Tunable>(config: T, points: TuningPoints): T {
    // Velocity → friction: SOLE owner of top speed (±0.0004/pt ≈ ±5%/pt).
    // Applied first — the accel co-scaling below builds on the result.
    if (points.velocity !== 0) {
        config.friction += points.velocity * 0.0004;
    }

    // Acceleration → thrust AND drag scaled together (×1.15/pt), so the ship
    // converges on the SAME top speed proportionally faster, spools throttle
    // quicker, and surges harder onto boosts. Off-throttle it also sheds speed
    // faster (responsive vs floaty). Never changes top speed — the old
    // accelFactor-only multiplier made accel a stronger top-speed stat than
    // velocity itself.
    if (points.acceleration !== 0) {
        const k = 1 + points.acceleration * 0.15;
        config.accelFactor *= k;
        config.friction = 1 - (1 - config.friction) * k;
        config.throttleRate = 0.05 * k;
    }

    // Handling: ±10% per point to turnSpeed and strafeSpeed.
    if (points.handling !== 0) {
        const modifier = 1 + points.handling * 0.1;
        config.turnSpeed *= modifier;
        config.strafeSpeed *= modifier;
    }

    if (points.energy && config.maxEnergy !== undefined) {
        config.maxEnergy = Math.round(config.maxEnergy * (1 + points.energy));
    }

    return config;
}

export function addPoints(a: TuningPoints, b: TuningPoints): TuningPoints {
    return {
        velocity: a.velocity + b.velocity,
        acceleration: a.acceleration + b.acceleration,
        handling: a.handling + b.handling,
        energy: (a.energy ?? 0) + (b.energy ?? 0),
    };
}
