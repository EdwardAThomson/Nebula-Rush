// Sandbox-FORKED physics — a verbatim copy of src/game/PhysicsEngine.ts's
// updatePhysics, with ONE change: checkCollision no longer applies the fake
// ±60 lateral "wall" (the soft-repel + hard-clamp block). Lateral motion is now
// left entirely to the real-geometry BVH wall collision done in mesa.ts. The
// ground-floor (vertical) clamp is kept. Everything else — throttle, steering,
// strafe, boost pads, hazards, lap counting, hover — is identical to the live
// engine, so the handling feel matches the confirmed Phase-1 baseline exactly.
//
// The GameState type is imported from the real engine, so the ship's state
// shape can't drift from the game.

import type { GameState } from '../src/game/PhysicsEngine';
import type { InputSource } from '../src/game/InputManager';
import type { BoostPad, Hazard } from '../src/game/TrackDefinitions';
import { HAZARD_BLOCK_DEPTH } from '../src/game/TrackDefinitions';

export type { GameState };

export const updatePhysics = (
    state: GameState,
    inputManager: InputSource,
    trackLength: number,
    pads: BoostPad[],
    dt: number = 1.0,
    onLapComplete?: (msg: any) => void,
    raceStarted: boolean = true,
    hazards: Hazard[] = []
) => {
    // --- INPUT HANDLING ---
    const throttleRate = 0.05;
    const decayRate = 0.03;

    if (raceStarted && (inputManager.isKeyPressed('ArrowUp') || inputManager.isKeyPressed('w'))) {
        state.throttle = Math.min(state.throttle + throttleRate * dt, 1.0);
    } else {
        state.throttle = Math.max(state.throttle - decayRate * dt, 0);
    }

    const STEER_GAIN = 3.0;
    const STEER_BANK = 0.35;
    const MAX_YAW = 0.4;
    if (inputManager.isKeyPressed('q')) {
        state.yaw += state.turnSpeed * STEER_GAIN * dt;
        state.targetRotation = -STEER_BANK;
    } else if (inputManager.isKeyPressed('e')) {
        state.yaw -= state.turnSpeed * STEER_GAIN * dt;
        state.targetRotation = STEER_BANK;
    } else {
        state.yaw *= Math.pow(0.98, dt);
        state.targetRotation = 0;
    }
    state.yaw = Math.max(-MAX_YAW, Math.min(MAX_YAW, state.yaw));

    // --- PHYSICS INTEGRATION ---
    let thrustPower = state.throttle * state.accelFactor;
    if (state.boostTimer > 0) {
        thrustPower *= 1.35;
        state.boostTimer -= dt / 60;
    }
    state.velocity.x -= Math.sin(state.yaw) * thrustPower * dt;
    state.velocity.y += Math.cos(state.yaw) * thrustPower * dt;

    if (inputManager.isKeyPressed('ArrowRight') || inputManager.isKeyPressed('d')) {
        state.velocity.x += state.strafeSpeed * dt;
        state.targetRotation = 0.4;
    }
    if (inputManager.isKeyPressed('ArrowLeft') || inputManager.isKeyPressed('a')) {
        state.velocity.x -= state.strafeSpeed * dt;
        state.targetRotation = -0.4;
    }

    state.velocity.y *= Math.pow(state.friction, dt);
    state.velocity.x *= Math.pow(state.slideFactor, dt);

    if ((inputManager.isKeyPressed(' ') || inputManager.isKeyPressed('ArrowDown') || inputManager.isKeyPressed('s'))) {
        if (state.verticalPosition < state.hoverHeight * 1.5) {
            const jumpCap = 0.25;
            if (state.verticalVelocity < jumpCap) {
                state.verticalVelocity += 0.05 * dt;
            }
        }
    }

    // --- POSITION UPDATE ---
    const longitudinalSpeed = state.velocity.y;
    const progressChange = (longitudinalSpeed * dt) / trackLength;

    let hitBoostPad = false;
    pads.forEach((pad, index) => {
        const progressDiff = Math.abs(state.trackProgress - pad.trackProgress);
        if (progressDiff < pad.length / 2) {
            if (Math.abs(state.lateralPosition - pad.lateralPosition) < pad.width / 2) {
                if (state.lastBoostPadIndex !== index) {
                    hitBoostPad = true;
                    state.lastBoostPadIndex = index;
                }
                state.boostTimer = 5.0;
            }
        }
    });
    if (!hitBoostPad && state.boostTimer <= 4.9) {
        state.lastBoostPadIndex = -1;
    }
    if (hitBoostPad) {
        if (onLapComplete) onLapComplete("BOOST");
    }

    // --- Track Hazards ---
    if (state.hazardCooldown > 0) state.hazardCooldown -= dt / 60;
    let onSlick = false;
    const blockMargin = (HAZARD_BLOCK_DEPTH / 2) / trackLength;
    const sweepLo = Math.min(state.trackProgress, state.trackProgress + progressChange) - blockMargin;
    const sweepHi = Math.max(state.trackProgress, state.trackProgress + progressChange) + blockMargin;
    hazards.forEach((h) => {
        const onLane = Math.abs(state.lateralPosition - h.lateralPosition) < h.width / 2;
        if (h.type === 'block') {
            if (onLane && h.trackProgress >= sweepLo && h.trackProgress <= sweepHi && state.hazardCooldown <= 0) {
                state.velocity.y *= 0.4;
                const side = state.lateralPosition >= h.lateralPosition ? 1 : -1;
                state.velocity.x += side * 3.0;
                state.hazardCooldown = 0.6;
                if (onLapComplete) onLapComplete("HAZARD");
            }
        } else if (h.type === 'slick') {
            if (onLane && Math.abs(state.trackProgress - h.trackProgress) < h.length / 2) onSlick = true;
        }
    });
    if (onSlick) {
        const slickCap = 28;
        if (state.velocity.y > slickCap) state.velocity.y *= 0.94;
    }

    // --- Lap Counting & Position Update ---
    state.trackProgress += progressChange;
    if (state.trackProgress >= 1.0) {
        state.trackProgress -= 1.0;
        if (!state.hasCrossedStartLine) {
            state.hasCrossedStartLine = true;
            if (onLapComplete) onLapComplete(1);
        } else {
            if (onLapComplete) onLapComplete("INCREMENT");
        }
    } else if (state.trackProgress < 0.0) {
        state.trackProgress += 1.0;
    }

    // Lateral
    state.lateralPosition += state.velocity.x * dt;

    // Vertical (Hover Physics)
    state.verticalVelocity += state.gravity * dt;
    if (state.verticalPosition < state.hoverHeight) {
        const displacement = state.hoverHeight - state.verticalPosition;
        const springForce = displacement * state.hoverStrength;
        const dampingForce = -state.verticalVelocity * state.hoverDamping;
        state.verticalVelocity += (springForce + dampingForce) * dt;
    }
    state.verticalPosition += state.verticalVelocity * dt;

    // --- COLLISION DETECTION (vertical floor only; lateral walls = BVH in mesa.ts) ---
    checkCollision(state);

    // --- VISUAL ROTATION LAG ---
    state.rotation += (state.targetRotation - state.rotation) * 0.1 * dt;

    // --- CAMERA LAG ---
    state.cameraLateral += (state.lateralPosition - state.cameraLateral) * 0.05 * dt;

    return state.trackProgress === 0 && progressChange > 0;
};

// Vertical ground floor only. The lateral "wall" (soft repel at 55 + hard clamp
// at 60) from the live engine is intentionally removed — real rock geometry now
// owns the lateral limit (see resolveWalls in mesa.ts).
const checkCollision = (state: GameState) => {
    const minHeight = 1.5;
    if (state.verticalPosition < minHeight) {
        state.verticalPosition = minHeight;
        if (state.verticalVelocity < 0) {
            state.verticalVelocity = 0;
        }
    }
};
