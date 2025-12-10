import * as THREE from 'three';
import { createShip, type ShipType } from './ShipFactory';
import { updatePhysics, INITIAL_GAME_STATE, type GameState } from './PhysicsEngine';
import { type InputSource } from './InputManager';
import { getTrackFrame } from './TrackFactory';

export interface ShipConfig {
    color: number;
    accelFactor: number;
    turnSpeed: number;
    friction: number;
    strafeSpeed: number;
    type: ShipType; // NEW
}

export class Ship {
    public mesh: THREE.Group;
    public state: GameState;
    public isPlayer: boolean;
    public lap: number = 0; // 0 = Pitting / Grid, 1 = First Lap

    public finished: boolean = false;
    public finishTime: number = 0;

    // Visual components if we need to animate them (e.g. engine glow)
    private glowLeft: THREE.Mesh;
    private glowRight: THREE.Mesh;

    constructor(scene: THREE.Scene, isPlayer: boolean = false, config?: Partial<ShipConfig>) {
        this.isPlayer = isPlayer;

        // Initialize State (Clone initial state to avoid shared reference)
        this.state = { ...INITIAL_GAME_STATE };
        this.state.velocity = new THREE.Vector2(0, 0); // NEW INSTANCE! Fixes shared state bug.

        // Apply Config Overrides
        if (config) {
            if (config.accelFactor !== undefined) this.state.accelFactor = config.accelFactor;
            if (config.turnSpeed !== undefined) this.state.turnSpeed = config.turnSpeed;
            if (config.friction !== undefined) this.state.friction = config.friction;
            if (config.strafeSpeed !== undefined) this.state.strafeSpeed = config.strafeSpeed;
        }

        // Initialize Visuals
        const color = config?.color !== undefined ? config.color : 0xcc0000;
        const type = config?.type || 'fighter';
        const { mesh, glowLeft, glowRight } = createShip(color, type);
        this.mesh = mesh;
        this.glowLeft = glowLeft;
        this.glowRight = glowRight;

        scene.add(this.mesh);
    }

    public update(
        dt: number,
        inputManager: InputSource,
        trackLength: number,
        onLapComplete?: (msg: any) => void,
        raceStarted: boolean = true // NEW
    ) {
        // Update Physics
        // For AI, we would pass a Mock InputManager or different logic

        // If finished, we might want AI to auto-pilot or just coast?
        // For now, let's allow physics updates but maybe cut throttle if finished?
        // Actually, preventing progress increment is enough for rank, 
        // but we want them to stop racing eventually.

        updatePhysics(this.state, inputManager, trackLength, dt, (msg) => {
            if (this.finished) return; // Don't process lap events if finished

            if (msg === 1) {
                this.lap = 1;
            } else if (msg === "INCREMENT") {
                this.lap++;
                if (this.lap > 5) {
                    this.finished = true;
                    this.finishTime = Date.now(); // Will be overridden by Game controller with precise race time
                }
            }

            if (onLapComplete) onLapComplete(msg);
        }, raceStarted);

        // Visual Updates (Engine Glow based on Throttle)
        if (this.glowLeft && this.glowRight) {
            const glow = 0.5 + this.state.throttle * 0.5;
            (this.glowLeft.material as THREE.MeshBasicMaterial).opacity = glow;
            (this.glowRight.material as THREE.MeshBasicMaterial).opacity = glow;

            // Animate Spray (Children of Glow)
            const sprayScale = 0.5 + this.state.throttle * 1.5; // Scale from 0.5x to 2.0x

            if (this.glowLeft.children[0]) {
                const spray = this.glowLeft.children[0] as THREE.Mesh;
                // Scale Y because Cone aligns to Y by default (before rotation)
                // But we attached it rotated... wait.
                // We rotated the geometry or the mesh?
                // created mesh, set rotation.x = PI/2.
                // Scaling the Mesh's LOCAL Y axis will stretch it along the cone's length.
                spray.scale.set(1, sprayScale, 1);

                // Jitter effect for "flame"
                spray.scale.x = 1.0 + (Math.random() - 0.5) * 0.1;
                spray.scale.z = 1.0 + (Math.random() - 0.5) * 0.1;
            }

            if (this.glowRight.children[0]) {
                const spray = this.glowRight.children[0] as THREE.Mesh;
                spray.scale.set(1, sprayScale, 1);
                // Jitter effect
                spray.scale.x = 1.0 + (Math.random() - 0.5) * 0.1;
                spray.scale.z = 1.0 + (Math.random() - 0.5) * 0.1;
            }
        }
    }

    public getPosition(): THREE.Vector3 {
        return this.mesh.position;
    }

    public updateMesh(trackCurve: THREE.Curve<THREE.Vector3>) {
        const { position: trackPos, normal, binormal: trackBinormal, rotationMatrix: frameRot } = getTrackFrame(trackCurve, this.state.trackProgress);

        this.mesh.position.copy(trackPos);
        this.mesh.position.add(trackBinormal.clone().multiplyScalar(this.state.lateralPosition));
        this.mesh.position.add(normal.clone().multiplyScalar(this.state.verticalPosition));
        this.mesh.quaternion.setFromRotationMatrix(frameRot);
        this.mesh.rotateZ(-this.state.rotation);
        this.mesh.rotateY(this.state.yaw);
    }

    public dispose(scene: THREE.Scene) {
        scene.remove(this.mesh);
        // Traverse and dispose geometries/materials if needed
    }

    public getTotalProgress(): number {
        return this.lap + this.state.trackProgress;
    }
}
