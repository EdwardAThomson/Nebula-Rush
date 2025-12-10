import * as THREE from 'three';
import { Ship } from './Ship';
import { type ShipType, SHIP_STATS } from './ShipFactory';

import type { InputSource } from './InputManager';
import type { GameState } from './PhysicsEngine';

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

export class OpponentManager {
    public opponents: Ship[] = [];
    private controllers: AIInputController[] = [];

    private scene: THREE.Scene;
    private trackCurve: THREE.Curve<THREE.Vector3>;
    private count: number;

    constructor(
        scene: THREE.Scene,
        trackCurve: THREE.Curve<THREE.Vector3>,
        count: number = 19
    ) {
        this.scene = scene;
        this.trackCurve = trackCurve;
        this.count = count;
        this.spawnOpponents();
    }

    private spawnOpponents() {
        const colors = [0x00cc00, 0x0000cc, 0xcccc00, 0xcc00cc, 0x00cccc, 0xff8800];

        for (let i = 0; i < this.count; i++) {
            // Select Random Ship Type
            const shipTypes: ShipType[] = ['fighter', 'speedster', 'tank'];
            // Weighted randomness? Or equal? Equal is fine.
            const type = shipTypes[Math.floor(Math.random() * shipTypes.length)];

            // Create Ship with Config
            // We'll calculate base stats for the type, then apply some variance
            let basetoConfig = {
                ...SHIP_STATS[type],
                color: colors[i % colors.length],
                type: type
            };

            // BASE STATS PER ARCHETYPE - LOADED FROM SHIP_STATS

            // Apply Random Variance (+/- 5-10%)
            basetoConfig.accelFactor *= 1.0 + (Math.random() * 0.1 - 0.05);
            basetoConfig.friction += (Math.random() * 0.002 - 0.001); // Tiny variance on drag has huge speed impact
            basetoConfig.turnSpeed *= 1.0 + (Math.random() * 0.2 - 0.1);

            // Override color with the cycling list to keep the grid colorful, 
            // OR keep archetype colors? 
            // User probably wants diversity. Let's keep the cycling colors but maybe tint them?
            // Actually, the cycling colors (Green, Blue, Yellow, Pink, Cyan, Orange) exist.
            // Let's us the cycling color as the overriding factor.
            basetoConfig.color = colors[i % colors.length];

            const opponent = new Ship(this.scene, false, basetoConfig);

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
        }
    }

    public update(dt: number, trackLength: number, raceStarted: boolean) {
        for (let i = 0; i < this.opponents.length; i++) {
            const opponent = this.opponents[i];
            const controller = this.controllers[i];

            // 1. Update AI Decision
            controller.update(opponent.state);

            // 2. Update Physics
            opponent.update(dt, controller, trackLength, (_msg) => {
                // Handle lap complete if needed (e.g. AI lap counter)
                // For now, ignore
            }, raceStarted);

            // 3. Update Mesh
            opponent.updateMesh(this.trackCurve);
        }
    }
}
