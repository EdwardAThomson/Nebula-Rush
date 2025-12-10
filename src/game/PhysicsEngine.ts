import * as THREE from 'three';
import type { InputSource } from './InputManager';

export interface GameState {
    trackProgress: number;
    velocity: THREE.Vector2; // x = lateral, y = longitudinal (forward)
    yaw: number;
    lateralPosition: number;
    verticalPosition: number;
    verticalVelocity: number;
    rotation: number;     // Roll for visual effect
    targetRotation: number;

    // Physics Constants & State
    hoverHeight: number;
    hoverStrength: number;
    hoverDamping: number;
    gravity: number;
    throttle: number;
    friction: number; // NEW: Air drag
    slideFactor: number;
    accelFactor: number;
    turnSpeed: number;
    strafeSpeed: number; // New: Side thruster power
    cameraLateral: number; // Visual-only laggy camera position
    boostTimer: number; // Time remaining for speed boost
    hasCrossedStartLine: boolean; // True once the player crosses the line for the first time
}

// Racing Grid Configuration
export const PLAYER_START_T = 0.94; // 94% around the track (just before 0.0/1.0 loop)

export const INITIAL_GAME_STATE: GameState = {
    trackProgress: PLAYER_START_T, // Start behind the grid
    velocity: new THREE.Vector2(0, 0),
    yaw: 0,
    lateralPosition: 0,
    verticalPosition: 2.0,
    verticalVelocity: 0,
    rotation: 0,
    targetRotation: 0,

    hoverHeight: 2.0,
    hoverStrength: 0.15,
    hoverDamping: 0.3,
    gravity: -0.015, // Stronger gravity for "heavy" feel
    throttle: 0,
    friction: 0.99, // Default Air Drag
    slideFactor: 0.99, // what is this really doing?
    accelFactor: 0.5,
    turnSpeed: 0.001,  // turn speed 0.02 was too fast
    strafeSpeed: 0.01, // 0.01 best
    cameraLateral: 0, // Visual-only laggy camera position
    boostTimer: 0,
    hasCrossedStartLine: false
};

export interface BoostPad {
    trackProgress: number; // 0.0 to 1.0
    lateralPosition: number; // Center of pad
    width: number;
    length: number; // In track progress units (approx)
}


// Define Pad Locations
export const BOOST_PADS: BoostPad[] = [
    { trackProgress: 0.15, lateralPosition: 0, width: 40, length: 0.02 },
    { trackProgress: 0.35, lateralPosition: -30, width: 40, length: 0.02 },
    { trackProgress: 0.55, lateralPosition: 30, width: 40, length: 0.02 },
    { trackProgress: 0.85, lateralPosition: 0, width: 40, length: 0.02 },
];


// Straight 1 (Southbound): 0.0 -> 0.35
/*
{ trackProgress: 0.1, lateralPosition: 0, width: 40, length: 0.002 },
{ trackProgress: 0.25, lateralPosition: 20, width: 40, length: 0.002 },
*/

// Straight 2 (Northbound): 0.6 -> 0.85
/*
{ trackProgress: 0.65, lateralPosition: -20, width: 40, length: 0.002 },
{ trackProgress: 0.8, lateralPosition: 0, width: 40, length: 0.002 },
*/



export const updatePhysics = (
    state: GameState,
    inputManager: InputSource,
    trackLength: number,
    dt: number = 1.0,
    onLapComplete?: (msg: any) => void,
    raceStarted: boolean = true // NEW Param
) => {
    // --- INPUT HANDLING ---

    // 1. Throttle
    // Rate of change per 60Hz frame
    const throttleRate = 0.05;
    const decayRate = 0.03;

    if (raceStarted && (inputManager.isKeyPressed('ArrowUp') || inputManager.isKeyPressed('w'))) {
        state.throttle = Math.min(state.throttle + throttleRate * dt, 1.0);
    } else {
        state.throttle = Math.max(state.throttle - decayRate * dt, 0);
    }

    // 2. Steering (Yaw)
    // Swapped A<->Q, D<->E per user request
    if (inputManager.isKeyPressed('q')) {
        state.yaw += state.turnSpeed * dt;
    } else if (inputManager.isKeyPressed('e')) {
        state.yaw -= state.turnSpeed * dt;
        // state.targetRotation = -0.4; // Removed per user request
    } else {
        state.yaw *= Math.pow(0.98, dt); // Self-align
        state.targetRotation = 0;
    }

    // --- PHYSICS INTEGRATION ---

    // 3. Main Thruster (Forward via Yaw)
    let thrustPower = state.throttle * state.accelFactor;

    // Apply Boost
    if (state.boostTimer > 0) {
        thrustPower *= 1.35; // +50% Speed, was 25%
        state.boostTimer -= dt / 60; // Approx seconds (assuming 60fps update)
    }

    state.velocity.x -= Math.sin(state.yaw) * thrustPower; // sideways movement when yawin (A or D?)
    state.velocity.y += Math.cos(state.yaw) * thrustPower;

    // 4. Side Thrusters (Strafing / Leaning) - NEW
    // Swapped per user request: A = Left, D = Right (Natural Strafe)
    if (inputManager.isKeyPressed('ArrowRight') || inputManager.isKeyPressed('d')) { // Right Strafe
        state.velocity.x += state.strafeSpeed * dt;
        state.targetRotation = 0.4;
    }
    if (inputManager.isKeyPressed('ArrowLeft') || inputManager.isKeyPressed('a')) { // Left Strafe
        state.velocity.x -= state.strafeSpeed * dt;
        state.targetRotation = -0.4;
    }

    // 5. Friction / Drag
    // 5. Friction / Drag
    state.velocity.y *= Math.pow(state.friction, dt); // Air drag
    state.velocity.x *= Math.pow(state.slideFactor, dt); // Grip/Slide

    // 6. Jump / Vertical Impulse
    if ((inputManager.isKeyPressed(' ') || inputManager.isKeyPressed('ArrowDown') || inputManager.isKeyPressed('s'))) {
        // Only jump if hovering and not already moving up too fast
        if (state.verticalPosition < state.hoverHeight * 1.5) {
            const jumpCap = 0.25;
            if (state.verticalVelocity < jumpCap) {
                state.verticalVelocity += 0.05 * dt; // Scale impulse accumulation? 
                // Impulse is usually instantaneous, but here we add velocity per frame while holding key.
                // So yes, scale by dt.
            }
        }
    }

    // --- POSITION UPDATE ---

    // Longitudinal
    const longitudinalSpeed = state.velocity.y;
    const progressChange = (longitudinalSpeed * dt) / trackLength;

    // Check Boost Pad Collisions (Simple AABB-like check on 1D track + 1D lateral)
    // We check if we are currently INSIDE a pad region
    BOOST_PADS.forEach(pad => {
        const progressDiff = Math.abs(state.trackProgress - pad.trackProgress);
        // Handle wrap-around for pads near 0/1 if needed (simplified here)

        if (progressDiff < pad.length / 2) {
            if (Math.abs(state.lateralPosition - pad.lateralPosition) < pad.width / 2) {
                state.boostTimer = 5.0; // 5 Seconds boost
            }
        }
    });
    // --- Lap Counting & Position Update ---

    state.trackProgress += progressChange;

    // Wrap around (0.0 -> 1.0)
    // let newLap = currentLap; // Local tracking if needed, but we use callback

    if (state.trackProgress >= 1.0) {
        state.trackProgress -= 1.0;

        // Crossed the line (Forward)
        if (!state.hasCrossedStartLine) {
            state.hasCrossedStartLine = true;
            // This is effectively Start of Lap 1
            if (onLapComplete) onLapComplete(1);
        } else {
            // Regular lap complete
            // if (onLapComplete) onLapComplete(currentLap + 1);
            if (onLapComplete) onLapComplete("INCREMENT");
        }
    } else if (state.trackProgress < 0.0) {
        state.trackProgress += 1.0;
        // Backwards crossing? (Ignore for now or decrement lap)
    }

    // Call callback only on change? The original code called it via logic inside Game.tsx maybe? 
    // Wait, the original signature had onLapComplete passed in.
    // We should be careful not to spam it.
    // The previous code probably did this logic in Game.tsx?
    // Let's check how the previous code handled it. 
    // It seems I'm replacing the integration block.
    // I need to make sure I don't break simple movement.

    // Actually, looking at the snippet, I'm replacing the integration part.
    // Let's ensure the previous logic for 'newLap' is adapted.
    // The previous logic likely just checked wrapped progress.

    // Simplified logic:
    // If we wrapped forward:
    //   If !started -> started = true, lap = 1
    //   Else -> lap++

    // We need to return or call onLapComplete.
    // The passed function signature is (newLap: number) => void.
    // We should call it ONLY when lap changes.
    // But PhysicsEngine doesn't store 'currentLap' permanently except via closure or passing?
    // Ah, 'newLap' argument is not passed to updatePhysics?
    // The function signature is: (..., onLapComplete?: (msg: any) => void)
    // It doesn't take currentLap. It expects Game.tsx to manage it.

    // So we just notify "Crossed Line".
    // Game.tsx maintains lap count.
    // If we send "1", Game.tsx sets lap to 1.
    // If we send "next", Game.tsx increments.
    // Let's standardise: notify with the *intended* lap number if possible, or just a signal.
    // For now, let's assume onLapComplete takes the NEW lap number.
    // But we don't know the current lap number here!

    // Solution:
    // If !hasCrossedStartLine -> signal "1" (Start Race).
    // If hasCrossedStartLine -> signal "INCREMENT" (or just call it, and Game handles it).
    // Actually, Game.tsx setLap(newLap). If I send 0, it sets to 0.
    // I'll update Game.tsx to handle a special "Increment" signal if needed, or just pass a special object?

    // Let's use `onLapComplete("INCREMENT")`? Typescript might complain.
    // The signature is `(msg: any) => void`. ANY. So I can send anything.

    // Lateral
    state.lateralPosition += state.velocity.x * dt;

    // Vertical (Hover Physics)
    // Vertical (Hover Physics)
    state.verticalVelocity += state.gravity * dt; // Gravity

    if (state.verticalPosition < state.hoverHeight) {
        const displacement = state.hoverHeight - state.verticalPosition;
        const springForce = displacement * state.hoverStrength;
        const dampingForce = -state.verticalVelocity * state.hoverDamping;
        state.verticalVelocity += (springForce + dampingForce) * dt;
    }
    state.verticalPosition += state.verticalVelocity * dt;

    // --- COLLISION DETECTION ---
    checkCollision(state);

    // --- VISUAL ROTATION LAG ---
    // Smoothly interpolate current rotation to target rotation
    // --- VISUAL ROTATION LAG ---
    // Smoothly interpolate current rotation to target rotation
    state.rotation += (state.targetRotation - state.rotation) * 0.1 * dt;

    // --- CAMERA LAG ---
    // Smoothly interpolate camera lateral position towards ship lateral position
    // A lower factor (0.05) creates more "weight" and delay
    state.cameraLateral += (state.lateralPosition - state.cameraLateral) * 0.05 * dt;

    return state.trackProgress === 0 && progressChange > 0; // Return true if lap completed (rough check)
};

const checkCollision = (state: GameState) => {
    // Exact visual boundaries
    // Track Width 120 -> Half Width = 60. Wall goes 60->70.
    // Tweak to 68.0 to keep ship fully inside the visible mesh
    const visualWallLimit = 60.0; // Exact edge of flat track
    const softWallLimit = visualWallLimit - 5.0; // Start pushing back earlier (55.0)

    // Soft wall force
    const wallForceStrength = 2.0; // Stronger than engine (beats boost of ~1.35)

    if (Math.abs(state.lateralPosition) > softWallLimit) {
        const penetration = Math.abs(state.lateralPosition) - softWallLimit;
        const sign = Math.sign(state.lateralPosition);

        // Repulsive Force
        state.velocity.x -= sign * penetration * wallForceStrength;

        // Wall Friction/Damping
        if (sign * state.velocity.x > 0) {
            if (Math.abs(state.lateralPosition) > visualWallLimit - 1.0) {
                state.velocity.x *= -0.4; // Hard bounce
            } else {
                state.velocity.x *= 0.95; // Soft drag
            }
        }
    }

    // Hard clamp
    if (Math.abs(state.lateralPosition) > visualWallLimit) {
        state.lateralPosition = Math.sign(state.lateralPosition) * (visualWallLimit - 0.1);
        state.velocity.x *= -0.2;
    }

    // Ground Floor
    const minHeight = 1.5;
    if (state.verticalPosition < minHeight) {
        state.verticalPosition = minHeight;
        if (state.verticalVelocity < 0) {
            state.verticalVelocity = 0;
        }
    }
};
