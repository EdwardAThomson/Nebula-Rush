import * as THREE from 'three';
import { createShip, type ShipType } from './ShipFactory';
import { updatePhysics, INITIAL_GAME_STATE, type GameState } from './PhysicsEngine';
import { type InputSource } from './InputManager';
import { getTrackFrame } from './TrackFactory';
import type { BoostPad, Hazard } from './TrackDefinitions';
import { audioManager } from './AudioManager';

// Thruster palette: cyan at cruise, shifting to hot orange while boosting so a
// boost is unmistakable from behind. Core stays near-white, warmed slightly.
const FLAME_BASE = new THREE.Color(0x00ffff);
const FLAME_BOOST = new THREE.Color(0xff8c2a);
const CORE_BASE = new THREE.Color(0xeaf6ff);
const CORE_BOOST = new THREE.Color(0xffe8c0);
// Energy-beam colour drift (Rapier binders): violet <-> electric blue.
const BEAM_A = new THREE.Color(0x8a5cff);
const BEAM_B = new THREE.Color(0x4fb8ff);
const AURA_BASE = new THREE.Color(0x44ccff);
const AURA_BOOST = new THREE.Color(0xffa040);
// Lightning arcs crackling over the aura: electric blue-white, warmed slightly
// at full boost so they pop against (not blend into) the orange flames.
const ARC_BASE = new THREE.Color(0xaaeeff);
const ARC_BOOST = new THREE.Color(0xffe9b0);
// Shield bubble shown on energy hits: cyan when healthy, shading to red as
// energy runs low; green shimmer while topping up on the recharge pad.
const SHIELD_HEALTHY = new THREE.Color(0x55ddff);
const SHIELD_LOW = new THREE.Color(0xff3322);
const SHIELD_CHARGE = new THREE.Color(0x44ff88);
const SPARK_COUNT = 24;
const SHIELD_PAD = 1.1; // clearance between the furthest hull point and the bubble
const AURA_OVER_SHIELD = 1.06; // boost aura sits just outside the shield bubble
const AURA_RING_SPAN = 2.2;    // unit-sphere distance nose → tail (+ a beat before the next ripple)

// Fit an ellipsoid round a hull (engine flames excluded): proportioned to the
// hull's bounding box, then grown until every vertex is inside. Cached per
// ship type, since all hulls of a type share geometry.
const shieldFitCache = new Map<string, { center: THREE.Vector3; radii: THREE.Vector3 }>();
const fitShield = (type: string, mesh: THREE.Object3D, glows: THREE.Object3D[]) => {
    const cached = shieldFitCache.get(type);
    if (cached) return cached;
    const skip = new Set<THREE.Object3D>();
    glows.forEach(g => g.traverse(o => skip.add(o)));
    mesh.updateMatrixWorld(true);
    const inv = mesh.matrixWorld.clone().invert();
    const pts: THREE.Vector3[] = [];
    const box = new THREE.Box3();
    mesh.traverse(o => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || skip.has(o)) return;
        const pos = m.geometry.getAttribute('position');
        if (!pos) return;
        const toShip = inv.clone().multiply(m.matrixWorld);
        for (let i = 0; i < pos.count; i++) {
            const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(toShip);
            pts.push(v);
            box.expandByPoint(v);
        }
    });
    const center = box.getCenter(new THREE.Vector3());
    const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5).max(new THREE.Vector3(0.5, 0.5, 0.5));
    let k = 0;
    for (const v of pts) {
        const d = v.clone().sub(center).divide(half);
        k = Math.max(k, d.length());
    }
    const fit = { center, radii: half.multiplyScalar(Math.max(k, 1) * SHIELD_PAD) };
    shieldFitCache.set(type, fit);
    return fit;
};

// Soft round dot for spark points (shared; built once on first use).
let sparkTexture: THREE.Texture | null = null;
const getSparkTexture = (): THREE.Texture | null => {
    if (sparkTexture) return sparkTexture;
    if (typeof document === 'undefined') return null; // headless scripts
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    if (!g) return null;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,220,150,0.8)');
    grad.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    sparkTexture = new THREE.CanvasTexture(c);
    return sparkTexture;
};

// Fresnel bubble with an impact hotspot and a ripple ring spreading from it.
// Positions are on the unit sphere (the mesh scale makes the ellipsoid), so
// the normalised object position doubles as the normal. Includes the logdepth
// chunks because the race renderer uses a logarithmic depth buffer.
const SHIELD_VERT = `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vObj;
varying vec3 vN;
varying vec3 vV;
void main() {
    vObj = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * position);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
}`;
const SHIELD_FRAG = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uOpacity;
uniform float uRim;
uniform vec3 uHitPos;
uniform float uHit;
uniform float uRing;
uniform float uFocus;
varying vec3 vObj;
varying vec3 vN;
varying vec3 vV;
void main() {
    #include <logdepthbuf_fragment>
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
    float d = distance(vObj, uHitPos);
    float spot = uHit * (1.0 - smoothstep(0.0, 1.2, d));
    float ring = uHit * exp(-pow((d - uRing) * 5.0, 2.0));
    // uFocus concentrates the shell near the impact (hits); 0 = even glow (recharge).
    float near = mix(1.0, 0.35 + 0.65 * (1.0 - smoothstep(0.3, 1.8, d)), uFocus);
    float a = clamp(uOpacity * (uRim * fres + 0.12) * near + spot * 1.1 + ring * 0.8, 0.0, 1.0);
    gl_FragColor = vec4(uColor, a);
}`;

type ShieldUniforms = {
    uColor: { value: THREE.Color }; uOpacity: { value: number }; uHitPos: { value: THREE.Vector3 };
    uHit: { value: number }; uRing: { value: number }; uFocus: { value: number };
};
// One shell material over a shared uniform set (rim = fresnel strength).
const makeShieldMaterial = (uniforms: ShieldUniforms, rim: number) => new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uRim: { value: rim } },
    vertexShader: SHIELD_VERT,
    fragmentShader: SHIELD_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // Both faces: from the chase cam a nose hit is on the FAR side of the
    // bubble and must still read through it.
    side: THREE.DoubleSide,
});

export interface ShipConfig {
    color: number;
    accentColor?: number; // Secondary livery color (wings/trim); defaults to white
    accelFactor: number;
    turnSpeed: number;
    friction: number;
    strafeSpeed: number;
    slideFactor: number; // NEW
    throttleRate?: number; // throttle ramp/frame (pilot accel stat); default 0.05
    energyEnabled?: boolean; // hazard/wall/contact damage + DNF at zero
    maxEnergy?: number;      // per-ship capacity (from SHIP_STATS)
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
    public retired: boolean = false; // energy hit 0 → DNF (sorts last via finishTime)

    // Visual components if we need to animate them (e.g. engine glow)
    private glows: THREE.Mesh[] = [];
    private beams: THREE.Mesh[] = [];           // energy binders (Rapier); own material clones
    private aura: THREE.Group | null = null;    // shield-style shell around the hull while boosting
    private auraUniforms: ShieldUniforms | null = null;
    private auraScale = new THREE.Vector3(1, 1, 1);
    private auraRing = 0;                       // 0..AURA_RING_SPAN, the bow-wave ripple sweeping nose → tail
    private arcs: THREE.Line[] = [];            // lightning crackling over the aura shell
    private lastArcTime = 0;                    // when the arc shapes were last re-rolled
    private boostFlash = 0;                     // 0..1, spikes on boost pickup, then decays
    private boostLevel = 0;                     // 0..1, eases toward 1 while boosting (drives color)
    private flamePhase = Math.random() * 100;   // desync flame flicker per ship

    // Damage feedback: shield bubble + lattice, a spark burst at the impact
    // point. Driven from energy deltas, so every damage source (blocks, wall
    // scraping, contact) and the recharge pad show up without extra wiring.
    private shield: THREE.Group;
    private shieldScale = new THREE.Vector3(1, 1, 1); // per-hull ellipsoid radii (fitShield)
    private shieldUniforms: ShieldUniforms;
    private sparks: THREE.Points;
    private sparkVel = new Float32Array(SPARK_COUNT * 3);
    private sparkLife = 0;                      // 0..1, burst fades out as it decays
    private shieldHit = 0;                      // 0..1 hit intensity, decays per frame
    private shieldCharge = 0;                   // 0..1 recharge shimmer level
    private lastEnergy = 0;
    private hitDir = new THREE.Vector3(0, 0, -1); // ship-local impact direction (unit)
    private hitDirPending = false;              // a caller supplied the direction for the next hit
    // Set to a 0..1 intensity on each new hit; the owner (Game.tsx) reads and
    // clears it for player-only feedback (camera shake, sound, HUD flash).
    public pendingHit = 0;

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
            if (config.throttleRate !== undefined) this.state.throttleRate = config.throttleRate;
            if (config.energyEnabled !== undefined) this.state.energyEnabled = config.energyEnabled;
            if (config.maxEnergy !== undefined) {
                this.state.maxEnergy = config.maxEnergy;
                this.state.energy = config.maxEnergy; // spawn with a full tank
            }
        }

        this.id = config?.id || 'player';
        this.name = config?.name || 'Player';

        // Initialize Visuals
        const color = config?.color !== undefined ? config.color : 0xcc0000;
        const type = config?.type || 'lancer';
        const { mesh, glows, beams } = createShip(color, type, config?.accentColor);
        this.mesh = mesh;
        this.glows = glows;
        this.beams = beams;
        this.beams.forEach(b => {
            if (b.material) b.material = (b.material as THREE.Material).clone();
            b.children.forEach(child => {
                const m = child as THREE.Mesh;
                if (m.material) m.material = (m.material as THREE.Material).clone();
            });
        });
        // Own our glow/flame materials so brightness animates per-ship
        // (createShip shares them across ships via a cache otherwise).
        this.glows.forEach(g => {
            if (g.material) g.material = (g.material as THREE.Material).clone();
            g.children.forEach(child => {
                const m = child as THREE.Mesh;
                if (m.material) m.material = (m.material as THREE.Material).clone();
            });
        });

        // Hull-fitted ellipsoid shared by the boost aura and the shield bubble.
        const fit = fitShield(type, this.mesh, this.glows);

        // Boost aura: the shield's look (fresnel shell + icosphere lattice) on
        // a slightly larger fitted ellipsoid, lit only while boostTimer runs.
        // A bright bow wave sits on the nose and ripples sweep back along the
        // hull, so it reads as speed rather than as a hit.
        const auraUniforms: ShieldUniforms = {
            uColor: { value: AURA_BASE.clone() },
            uOpacity: { value: 0 },
            uHitPos: { value: new THREE.Vector3(0, 0, -1) },
            uHit: { value: 0 },
            uRing: { value: 0 },
            uFocus: { value: 0.6 },
        };
        this.auraUniforms = auraUniforms;
        this.aura = new THREE.Group();
        this.aura.add(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), makeShieldMaterial(auraUniforms, 0.9)));
        this.aura.add(new THREE.LineSegments(
            new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.01, 2)), makeShieldMaterial(auraUniforms, 1.6)));
        this.auraScale.copy(fit.radii).multiplyScalar(AURA_OVER_SHIELD);
        this.aura.scale.copy(this.auraScale);
        this.aura.position.copy(fit.center);
        this.aura.visible = false;
        this.mesh.add(this.aura);

        // Lightning arcs: jagged polylines re-rolled every few frames while
        // boosting. Children of the aura, so they live on the same ellipsoid
        // (paths are built on the unit sphere; the aura's scale shapes them)
        // and share its visibility gate.
        for (let i = 0; i < 5; i++) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
            const arc = new THREE.Line(geo, new THREE.LineBasicMaterial({
                color: 0xaaeeff,
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            }));
            this.aura.add(arc);
            this.arcs.push(arc);
        }

        // Shield bubble: two materials over shared uniforms — a soft fresnel
        // shell and a brighter icosphere lattice for the "energy shield" read.
        const shared: ShieldUniforms = {
            uColor: { value: SHIELD_HEALTHY.clone() },
            uOpacity: { value: 0 },
            uHitPos: { value: new THREE.Vector3(0, 0, -1) },
            uHit: { value: 0 },
            uRing: { value: 0 },
            uFocus: { value: 0 },
        };
        this.shieldUniforms = shared;
        this.shield = new THREE.Group();
        this.shield.add(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), makeShieldMaterial(shared, 0.9)));
        this.shield.add(new THREE.LineSegments(
            new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.01, 2)), makeShieldMaterial(shared, 1.6)));
        this.shieldScale.copy(fit.radii);
        this.shield.scale.copy(this.shieldScale);
        this.shield.position.copy(fit.center);
        this.shield.visible = false;
        this.mesh.add(this.shield);

        // Spark burst: a small pool of additive points flung from the impact.
        const sparkGeo = new THREE.BufferGeometry();
        sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_COUNT * 3), 3));
        this.sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
            color: 0xffb347,
            map: getSparkTexture(),
            size: 0.5,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        }));
        this.sparks.visible = false;
        this.sparks.frustumCulled = false;
        this.mesh.add(this.sparks);
        this.lastEnergy = this.state.energy;

        scene.add(this.mesh);
    }

    // Tell the ship where the next energy hit comes from, in ship-local space
    // (−Z forward, +X right). Optional — unhinted hits read as frontal, or
    // side-on while scraping a wall.
    public setHitDirection(x: number, y: number, z: number) {
        this.hitDir.set(x, y, z).normalize();
        this.hitDirPending = true;
    }

    public update(
        dt: number,
        inputManager: InputSource,
        trackLength: number,
        pads: BoostPad[],
        onLapComplete?: (msg: any) => void,
        raceStarted: boolean = true,
        gameTime: number = 0,  // Game time in ms (pauses when tab inactive)
        hazards: Hazard[] = [],
        lateralLimit?: (t: number) => [number, number] // canyon wall clamp (optional)
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
                // Block strike: impact on the nose, biased to the side that hit.
                const side = Math.sign(this.state.velocity.x) || 1;
                this.setHitDirection(-side * 0.5, 0, -1);
                // Physics penalty already applied; forward to the HUD for a hit
                // flash (player only, to avoid AI spam).
                if (this.isPlayer && onLapComplete) onLapComplete("HAZARD");
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
        }, raceStarted, hazards, lateralLimit);

        // Retirement: out of energy → DNF. finished=true with a sentinel time
        // so the existing rank sort places retirees behind every real finisher.
        if (this.state.energyEnabled && this.state.energy <= 0 && !this.retired && !this.finished) {
            this.retired = true;
            this.finished = true;
            this.finishTime = Number.MAX_SAFE_INTEGER;
        }

        this.updateVisuals(dt);
    }

    // Shield + sparks, driven by how energy moved since last frame.
    private updateDamageFx(dt: number) {
        const energy = this.state.energy;
        const delta = energy - this.lastEnergy;
        this.lastEnergy = energy;

        if (delta < -0.01) {
            // A discrete hit (block 18, contact 5) flashes hard; the per-frame
            // trickle of a wall scrape holds a steady flicker instead.
            const discrete = delta < -1;
            const strength = discrete ? Math.min(1, 0.55 + -delta / 30) : 0.35;
            if (!this.hitDirPending) {
                if (this.state.wallContact) this.hitDir.set(this.state.wallContact, 0, -0.3).normalize();
                else this.hitDir.set(0, 0, -1);
            }
            this.hitDirPending = false;
            if (discrete || this.shieldHit < strength) {
                if (discrete) this.shieldUniforms.uRing.value = 0; // restart the ripple
                this.shieldUniforms.uHitPos.value.copy(this.hitDir);
                this.shieldHit = Math.max(this.shieldHit, strength);
            }
            if (discrete) {
                this.emitSparks(strength);
                this.pendingHit = Math.max(this.pendingHit, strength);
            } else if (Math.random() < 0.25 * dt) {
                this.emitSparks(0.3); // scraping: intermittent small showers
            }
        }
        // Recharging: green shimmer while energy climbs.
        const charging = delta > 0.01;
        this.shieldCharge += ((charging ? 1 : 0) - this.shieldCharge) * Math.min(1, 0.15 * dt);

        this.shieldHit = Math.max(0, this.shieldHit - 0.035 * dt);
        this.shieldUniforms.uRing.value += 0.06 * dt;
        const opacity = Math.max(this.shieldHit, 0.35 * this.shieldCharge);
        this.shield.visible = opacity > 0.01;
        if (this.shield.visible) {
            const frac = Math.max(0, Math.min(1, energy / (this.state.maxEnergy || 100)));
            const u = this.shieldUniforms;
            u.uOpacity.value = opacity;
            u.uHit.value = this.shieldHit;
            u.uFocus.value = this.shieldHit > 0.35 * this.shieldCharge ? 1 : 0;
            // Health tint (red when low), blended to green while recharging.
            u.uColor.value.copy(SHIELD_LOW).lerp(SHIELD_HEALTHY, Math.min(1, frac * 1.6))
                .lerp(SHIELD_CHARGE, this.shieldCharge * (1 - this.shieldHit));
            const wobble = 1 + 0.04 * this.shieldHit * Math.sin(performance.now() * 0.05);
            this.shield.scale.copy(this.shieldScale).multiplyScalar(wobble);
        }

        // Sparks: ballistic drift in ship space with drag, fading out.
        if (this.sparkLife > 0) {
            this.sparkLife = Math.max(0, this.sparkLife - 0.045 * dt);
            const pos = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
            const v = this.sparkVel;
            const drag = Math.pow(0.9, dt);
            for (let i = 0; i < SPARK_COUNT; i++) {
                pos.setXYZ(i, pos.getX(i) + v[i * 3] * dt, pos.getY(i) + v[i * 3 + 1] * dt, pos.getZ(i) + v[i * 3 + 2] * dt);
                v[i * 3] *= drag;
                v[i * 3 + 1] = v[i * 3 + 1] * drag - 0.01 * dt;
                v[i * 3 + 2] = v[i * 3 + 2] * drag + 0.05 * dt; // trail back past the ship
            }
            pos.needsUpdate = true;
            (this.sparks.material as THREE.PointsMaterial).opacity = this.sparkLife;
        }
        this.sparks.visible = this.sparkLife > 0;
    }

    private emitSparks(strength: number) {
        const pos = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
        const origin = this.hitDir.clone().multiply(this.shieldScale).add(this.shield.position);
        const v = this.sparkVel;
        const speed = 0.25 + 0.35 * strength;
        const dir = new THREE.Vector3();
        for (let i = 0; i < SPARK_COUNT; i++) {
            pos.setXYZ(i, origin.x, origin.y, origin.z);
            // Spray outward from the impact in a wide cone.
            dir.copy(this.hitDir).add(new THREE.Vector3().randomDirection().multiplyScalar(0.9)).normalize();
            const s = speed * (0.4 + Math.random() * 0.8);
            v[i * 3] = dir.x * s;
            v[i * 3 + 1] = Math.abs(dir.y) * s + 0.05;
            v[i * 3 + 2] = dir.z * s;
        }
        pos.needsUpdate = true;
        this.sparkLife = Math.max(this.sparkLife, 0.5 + 0.5 * strength);
    }

    // Kick off the boost-pickup punch (flame flare + aura flash) without going
    // through physics — used by the start-screen attract mode, which moves its
    // ships kinematically. Pair it with setting state.boostTimer.
    public triggerBoostFlash() {
        this.boostFlash = 1;
    }

    // Engine flame / boost aura animation, driven by state.throttle,
    // state.boostTimer and the pickup flash. dt is in 60fps frames.
    public updateVisuals(dt: number) {
        this.updateDamageFx(dt);
        // Visual Updates — a steady "circle of light" at each engine, a gently
        // flickering saturated cyan flame, and a hot near-white inner core.
        // Boost expands the circle, grows/brightens the core, and bumps the
        // cones modestly (not a big white flare).
        if (this.glows.length > 0) {
            this.boostFlash = Math.max(0, this.boostFlash - 0.05); // decay the pickup punch
            const boosting = this.state.boostTimer > 0;
            const heat = Math.min(1, (boosting ? 0.6 : 0) + this.boostFlash); // 0..1 "hotness"
            // Eased 0..1 boost level: snaps up fast on pickup, fades out gently
            // when the timer ends. Drives the color shift and the aura.
            this.boostLevel += ((boosting ? 1 : 0) - this.boostLevel) * Math.min(1, 0.12 * dt);

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
                    glowMesh.material.color.copy(FLAME_BASE).lerp(FLAME_BOOST, this.boostLevel);
                }

                const outer = glowMesh.children[0] as THREE.Mesh | undefined;
                if (outer) {
                    outer.scale.set(
                        outerWide * (1 + 0.03 * Math.sin(time * 20)),
                        outerLen,
                        outerWide * (1 + 0.03 * Math.cos(time * 17))
                    );
                    if (outer.material instanceof THREE.MeshBasicMaterial) {
                        outer.material.opacity = 0.3 + 0.15 * heat; // saturated flame, no white-out
                        // Cruise cyan → boost orange, eased by boostLevel.
                        outer.material.color.copy(FLAME_BASE).lerp(FLAME_BOOST, this.boostLevel);
                    }
                }

                const core = glowMesh.children[1] as THREE.Mesh | undefined;
                if (core) {
                    core.scale.set(coreWide, coreLen, coreWide);
                    if (core.material instanceof THREE.MeshBasicMaterial) {
                        core.material.opacity = 0.5 + 0.35 * heat; // hot centre brightens on boost
                        core.material.color.copy(CORE_BASE).lerp(CORE_BOOST, this.boostLevel);
                    }
                }
            });

            // Energy beams: a lazy violet-to-blue drift with a nervous flicker,
            // the core swelling in and out; brighter and whiter under boost.
            this.beams.forEach((beam, i) => {
                const t = time * 6 + i * 1.7;
                const flick = 0.78 + 0.16 * Math.sin(t * 2.3) + 0.06 * Math.sin(t * 7.1) + (Math.random() - 0.5) * 0.06;
                const mat = beam.material as THREE.MeshBasicMaterial;
                mat.opacity = Math.min(1, flick * (0.55 + 0.35 * heat));
                mat.color.copy(BEAM_A).lerp(BEAM_B, 0.5 + 0.5 * Math.sin(time * 1.3 + i)).lerp(CORE_BOOST, 0.4 * this.boostLevel);
                const core = beam.children[0] as THREE.Mesh | undefined;
                if (core) {
                    const swell = 1 + 0.3 * Math.sin(t * 5.3) + 0.6 * heat;
                    core.scale.set(swell, 1, swell);
                    if (core.material instanceof THREE.MeshBasicMaterial) core.material.opacity = 0.6 + 0.3 * flick;
                }
            });

            // Aura envelope: the shield-style shell, only while boosting.
            // Flares on pickup; a bow wave glows on the nose and ripples run
            // nose → tail for the boost's duration.
            if (this.aura && this.auraUniforms) {
                const auraOpacity = 0.45 * this.boostLevel + 0.5 * this.boostFlash;
                this.aura.visible = auraOpacity > 0.01;
                if (this.aura.visible) {
                    const pulse = 1 + 0.03 * Math.sin(time * 9) + 0.12 * this.boostFlash;
                    this.aura.scale.copy(this.auraScale).multiplyScalar(pulse);
                    const u = this.auraUniforms;
                    u.uOpacity.value = auraOpacity;
                    u.uColor.value.copy(AURA_BASE).lerp(AURA_BOOST, this.boostLevel);
                    u.uHit.value = Math.min(1, 0.3 * this.boostLevel + 0.7 * this.boostFlash);
                    this.auraRing = (this.auraRing + 0.035 * dt) % AURA_RING_SPAN;
                    if (this.boostFlash > 0.95) this.auraRing = 0; // pickup restarts the wave at the nose
                    u.uRing.value = this.auraRing;

                    // Lightning: re-roll the jagged paths ~every 50ms so the
                    // arcs jump around the shell; flicker opacity per frame.
                    if (time - this.lastArcTime > 0.05) {
                        this.lastArcTime = time;
                        this.arcs.forEach(arc => this.rerollArc(arc));
                    }
                    const arcStrength = Math.min(1, 0.7 * this.boostLevel + this.boostFlash);
                    this.arcs.forEach(arc => {
                        const am = arc.material as THREE.LineBasicMaterial;
                        am.opacity = (0.3 + 0.7 * Math.random()) * arcStrength;
                        am.color.copy(ARC_BASE).lerp(ARC_BOOST, this.boostLevel);
                    });
                }
            }
        }
    }

    // Build one jagged lightning path between two random points on the unit
    // sphere (the parent aura's scale stretches it onto the ellipsoid).
    // Endpoints stay anchored to the shell; midpoints jitter radially.
    private rerollArc(arc: THREE.Line) {
        const a = new THREE.Vector3().randomDirection();
        const b = new THREE.Vector3().randomDirection();
        if (a.dot(b) < -0.6) b.negate(); // avoid near-antipodal pairs (degenerate lerp)
        const pos = arc.geometry.getAttribute('position') as THREE.BufferAttribute;
        const p = new THREE.Vector3();
        const n = pos.count;
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            p.copy(a).lerp(b, t).normalize();
            const midness = Math.min(t, 1 - t) * 4; // 0 at endpoints → jitter-free anchors
            const r = 1.04 + (Math.random() - 0.5) * 0.22 * Math.min(1, midness);
            pos.setXYZ(i, p.x * r, p.y * r, p.z * r);
        }
        pos.needsUpdate = true;
    }

    public getPosition(): THREE.Vector3 {
        return this.mesh.position;
    }

    public updateMesh(trackCurve: THREE.Curve<THREE.Vector3>, bank: boolean = true) {
        const { position: trackPos, normal, binormal: trackBinormal, rotationMatrix: frameRot } = getTrackFrame(trackCurve, this.state.trackProgress, bank);

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
