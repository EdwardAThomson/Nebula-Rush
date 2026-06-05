import * as THREE from 'three';
import { createShip, type ShipType } from './ShipFactory';
import { updatePhysics, INITIAL_GAME_STATE, type GameState } from './PhysicsEngine';
import { type InputSource } from './InputManager';
import { getTrackFrame } from './TrackFactory';
import type { BoostPad, Hazard } from './TrackDefinitions';
import { audioManager } from './AudioManager';

export interface ShipConfig {
    color: number;
    accentColor?: number; // Secondary livery color (wings/trim); defaults to white
    accelFactor: number;
    turnSpeed: number;
    friction: number;
    strafeSpeed: number;
    slideFactor: number; // NEW
    type: ShipType;
    id?: string;
    name?: string;
}

export class Ship {
    public mesh: THREE.Group;
    public state: GameState;
    public isPlayer: boolean;
    public lap: number = 0; // 0 = Pitting / Grid, 1 = First Lap

    public id: string;
    public name: string;

    public finished: boolean = false;
    public finishTime: number = 0;

    // Visual components if we need to animate them (e.g. engine glow)
    private glows: THREE.Mesh[] = [];
    private boostFlash = 0;                     // 0..1, spikes on boost pickup, then decays
    private flamePhase = Math.random() * 100;   // desync flame flicker per ship

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
            if (config.slideFactor !== undefined) this.state.slideFactor = config.slideFactor;
        }

        this.id = config?.id || 'player';
        this.name = config?.name || 'Player';

        // Initialize Visuals
        const color = config?.color !== undefined ? config.color : 0xcc0000;
        const type = config?.type || 'fighter';
        const { mesh, glows } = createShip(color, type, config?.accentColor);
        this.mesh = mesh;
        this.glows = glows;
        // Own our glow/flame materials so brightness animates per-ship
        // (createShip shares them across ships via a cache otherwise).
        this.glows.forEach(g => {
            if (g.material) g.material = (g.material as THREE.Material).clone();
            g.children.forEach(child => {
                const m = child as THREE.Mesh;
                if (m.material) m.material = (m.material as THREE.Material).clone();
            });
        });

        scene.add(this.mesh);
    }

    public update(
        dt: number,
        inputManager: InputSource,
        trackLength: number,
        pads: BoostPad[],
        onLapComplete?: (msg: any) => void,
        raceStarted: boolean = true,
        gameTime: number = 0,  // Game time in ms (pauses when tab inactive)
        hazards: Hazard[] = []
    ) {
        // Update Physics
        // For AI, we would pass a Mock InputManager or different logic

        // If finished, we might want AI to auto-pilot or just coast?
        // For now, let's allow physics updates but maybe cut throttle if finished?
        // Actually, preventing progress increment is enough for rank, 
        // but we want them to stop racing eventually.

        updatePhysics(this.state, inputManager, trackLength, pads, dt, (msg) => {
            if (this.finished) return; // Don't process lap events if finished

            if (msg === "BOOST") {
                this.boostFlash = 1; // pickup punch (decays in the visual update below)
                // Play boost sound (only for player ship to avoid spam)
                if (this.isPlayer) {
                    audioManager.playBoost();
                }
                return; // Don't pass boost signal to lap handler
            }

            if (msg === "HAZARD") {
                // Hook for hit feedback (SFX/visual). Physics penalty already applied.
                return;
            }

            if (msg === 1) {
                this.lap = 1;
            } else if (msg === "INCREMENT") {
                this.lap++;
                if (this.lap > 5) {
                    this.finished = true;
                    this.finishTime = gameTime; // Use game time, not wall-clock
                }
                // Play lap complete sound
                if (this.isPlayer) {
                    audioManager.playLapComplete();
                }
            }

            if (onLapComplete) onLapComplete(msg);
        }, raceStarted, hazards);

        // Visual Updates — a steady "circle of light" at each engine, a gently
        // flickering saturated cyan flame, and a hot near-white inner core.
        // Boost expands the circle, grows/brightens the core, and bumps the
        // cones modestly (not a big white flare).
        if (this.glows.length > 0) {
            this.boostFlash = Math.max(0, this.boostFlash - 0.05); // decay the pickup punch
            const boosting = this.state.boostTimer > 0;
            const heat = Math.min(1, (boosting ? 0.6 : 0) + this.boostFlash); // 0..1 "hotness"

            const time = performance.now() * 0.001 + this.flamePhase;
            // Gentle flicker for the cones only — small amplitude so it reads as
            // a live flame, not strobing.
            const flicker = 0.96 + 0.04 * Math.sin(time * 18) + (Math.random() - 0.5) * 0.02;
            const throttle = this.state.throttle;

            // Glow disc: steady size/brightness, expands on boost + pickup punch.
            const glowScale = 1 + 0.4 * heat + 0.3 * this.boostFlash;
            const glowOpacity = Math.min(1, 0.7 + 0.2 * heat);

            // Outer flame: throttle-driven length, modest boost bump.
            const outerLen = (0.5 + throttle * 1.5) * flicker * (1 + 0.2 * heat + 0.35 * this.boostFlash);
            const outerWide = 1 + 0.1 * heat;
            // Inner core: a touch shorter, grows/brightens more with heat.
            const coreLen = outerLen * 0.9 * (1 + 0.25 * heat);
            const coreWide = 1 + 0.3 * heat + 0.4 * this.boostFlash;

            this.glows.forEach(glowMesh => {
                glowMesh.scale.setScalar(glowScale); // steady circle (no flicker)
                if (glowMesh.material instanceof THREE.MeshBasicMaterial) {
                    glowMesh.material.opacity = glowOpacity;
                }

                const outer = glowMesh.children[0] as THREE.Mesh | undefined;
                if (outer) {
                    outer.scale.set(
                        outerWide * (1 + 0.03 * Math.sin(time * 20)),
                        outerLen,
                        outerWide * (1 + 0.03 * Math.cos(time * 17))
                    );
                    if (outer.material instanceof THREE.MeshBasicMaterial) {
                        outer.material.opacity = 0.3 + 0.15 * heat; // saturated cyan, no white-out
                    }
                }

                const core = glowMesh.children[1] as THREE.Mesh | undefined;
                if (core) {
                    core.scale.set(coreWide, coreLen, coreWide);
                    if (core.material instanceof THREE.MeshBasicMaterial) {
                        core.material.opacity = 0.5 + 0.35 * heat; // hot centre brightens on boost
                    }
                }
            });
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
