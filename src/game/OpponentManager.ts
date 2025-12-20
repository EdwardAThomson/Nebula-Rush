import * as THREE from 'three';
import { Ship, type ShipConfig } from './Ship';
import { type ShipType, SHIP_STATS } from './ShipFactory';

import type { InputSource } from './InputManager';
import type { GameState } from './PhysicsEngine';
import type { BoostPad } from './TrackDefinitions';

class AIInputController implements InputSource {
    private keys: { [key: string]: boolean } = {};
    public targetLateral: number = 0;

    constructor(target: number) {
        this.targetLateral = target;
    }

    update(state: GameState) {
        // Reset keys
        this.keys = {};

        // Always gas (Throttle)
        this.keys['w'] = true;
        this.keys['ArrowUp'] = true;

        // Steering Logic
        // Coordinate System: Left is Negative, Right is Positive
        const error = state.lateralPosition - this.targetLateral;
        const deadzone = 1.0;

        // If error > 0, current > target. We are to the RIGHT of the target.
        // We need to steer LEFT ('a').
        if (error > deadzone) {
            // We are too far Right
            // Steer Left
            this.keys['a'] = true;
            this.keys['ArrowLeft'] = true;
        } else if (error < -deadzone) {
            // We are too far Left
            // Steer Right
            this.keys['d'] = true;
            this.keys['ArrowRight'] = true;
        }

        // Random Strafe usage for aggression? Maybe later.
    }

    isKeyPressed(key: string): boolean {
        return !!this.keys[key];
    }
}

export interface OpponentConfig extends ShipConfig {
    id: string;
    name: string;
}

export class OpponentManager {
    public opponents: Ship[] = [];
    private controllers: AIInputController[] = [];

    private scene: THREE.Scene;
    private trackCurve: THREE.Curve<THREE.Vector3>;

    constructor(
        scene: THREE.Scene,
        trackCurve: THREE.Curve<THREE.Vector3>,
        roster: OpponentConfig[]
    ) {
        this.scene = scene;
        this.trackCurve = trackCurve;
        this.spawnOpponents(roster);
    }

    private spawnOpponents(roster: OpponentConfig[]) {
        roster.forEach((config, i) => {
            const opponent = new Ship(this.scene, false, config);

            // Grid Positioning
            const row = Math.floor(i / 2) + 1;
            const col = i % 2; // 0 = Left, 1 = Right

            const rowDepth = 0.002;
            const startOffset = 0.93;

            // Move forwards: offset + (row * depth)
            const t = (startOffset + (row * rowDepth)) % 1;
            const lateral = (col === 0 ? -1 : 1) * 15;

            // Set Initial State
            opponent.state.trackProgress = t;
            opponent.state.lateralPosition = lateral;

            // Create Controller
            // Assign a random preferred lane relative to their start side
            const randomLane = (Math.random() - 0.5) * 60;
            const controller = new AIInputController(randomLane);
            this.controllers.push(controller);

            this.opponents.push(opponent);

            // Initial Mesh Update
            opponent.updateMesh(this.trackCurve);
        });
    }

    public static generateRoster(count: number): OpponentConfig[] {
        const colors = [0x00cc00, 0x0000cc, 0xcccc00, 0xcc00cc, 0x00cccc, 0xff8800];
        const roster: OpponentConfig[] = [];

        for (let i = 0; i < count; i++) {
            // Select Random Ship Type (all 5 types now included)
            const shipTypes: ShipType[] = ['fighter', 'speedster', 'tank', 'interceptor', 'corsair'];
            const type = shipTypes[Math.floor(Math.random() * shipTypes.length)];

            // Create Ship with Config
            // We'll calculate base stats for the type, then apply some variance
            let basetoConfig = {
                ...SHIP_STATS[type],
                color: colors[i % colors.length],
                type: type
            };

            // Apply Random Variance (reduced to keep ships clustered)
            basetoConfig.accelFactor *= 1.0 + (Math.random() * 0.1 - 0.05);  // ±5%
            basetoConfig.friction += (Math.random() * 0.0006 - 0.0003);       // ±0.0003 (was ±0.001)
            basetoConfig.turnSpeed *= 1.0 + (Math.random() * 0.2 - 0.1);     // ±10%
            basetoConfig.color = colors[i % colors.length];

            roster.push({
                ...basetoConfig,
                id: `ai_${i}`,
                name: `AI-${Math.floor(Math.random() * 900) + 100}`
            });
        }
        return roster;
    }

    public update(dt: number, trackLength: number, pads: BoostPad[], raceStarted: boolean, gameTime: number = 0) {
        for (let i = 0; i < this.opponents.length; i++) {
            const opponent = this.opponents[i];
            const controller = this.controllers[i];

            // 1. Update AI Decision
            controller.update(opponent.state);

            // 2. Update Physics
            opponent.update(dt, controller, trackLength, pads, (_msg) => {
                // Handle lap complete if needed (e.g. AI lap counter)
                // For now, ignore
            }, raceStarted, gameTime);

            // 3. Update Mesh
            opponent.updateMesh(this.trackCurve);
        }
    }
}
