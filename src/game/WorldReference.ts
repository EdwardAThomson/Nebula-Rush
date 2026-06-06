import * as THREE from 'three';
import { getTrackFrame } from './TrackFactory';

// WorldReference adds static, fixed-altitude scenery so the eye can perceive the
// track rising and falling. Without it the chase camera rises with the track and
// elevation changes are invisible. Three cues, all referenced to a single floor
// plane below the lowest point of the course:
//   1. a neon grid floor (recession cue — it gets nearer as you dive, further as
//      you climb). It follows the player in XZ, snapped to the cell size so the
//      lines read as world-fixed (the classic infinite-grid trick).
//   2. support pillars dropped from the track down to the floor (the strongest
//      rise/fall cue — you read altitude off how much pillar is showing).
//   3. a blob shadow on the floor under the ship (the ship↔blob gap is a direct
//      height gauge; real shadow maps aren't enabled on this renderer).
// Procedural "infinite grid" floor. Lines are computed in world space in the
// fragment shader, so the plane can track the player while the lines stay
// world-locked (parallax intact). Adds layered major/minor lines, a faint dark
// base so it reads as a surface, a slow pulse on the majors, and a radial fade
// so the edges melt into the fog instead of ending in a hard square.
const GRID_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const GRID_FRAG = /* glsl */ `
precision highp float;
varying vec3 vWorld;
uniform vec3 uAccent;
uniform vec2 uCenter;
uniform float uTime;
uniform float uMinor;
uniform float uMajor;
uniform float uFadeStart;
uniform float uFadeEnd;

// Per-axis g-unit distance to the nearest grid line at multiples of 'size'.
// 0 on a line, 0.5 mid-cell.
vec2 lineDist(vec2 coord, float size) {
    vec2 g = coord / size;
    return 0.5 - abs(fract(g) - 0.5);
}

void main() {
    vec2 p = vWorld.xz;

    // Solid-ish dark energy floor as a base surface (reads as ground, not
    // floating lines). Slight blue lift on top of the accent tint.
    vec3 col = uAccent * 0.05 + vec3(0.01, 0.015, 0.03);
    float alpha = 0.55;

    // --- Minor grid: subtle crisp lines (screen-space AA) ---
    vec2 dMin = lineDist(p, uMinor);
    vec2 pxMin = dMin / fwidth(p / uMinor);
    float minor = 1.0 - min(min(pxMin.x, pxMin.y), 1.0);
    col += uAccent * 0.45 * minor;
    alpha = max(alpha, 0.55 + 0.3 * minor);

    // --- Major grid: bright crisp core + soft world-space glow halo ---
    vec2 dMaj = lineDist(p, uMajor);
    vec2 pxMaj = dMaj / fwidth(p / uMajor);
    float majCore = 1.0 - min(min(pxMaj.x, pxMaj.y), 1.0);
    float majGlow = 1.0 - smoothstep(0.0, 90.0, min(dMaj.x, dMaj.y) * uMajor);
    // Flowing pulse of light travelling along the major lines.
    float flow = 0.55 + 0.45 * sin((p.x + p.y) * 0.0035 - uTime * 2.2);
    col += uAccent * (1.5 * majCore + 0.6 * majGlow * flow);
    alpha = max(alpha, max(majCore, majGlow * 0.55));

    // --- Glowing nodes at the major intersections (pulsing) ---
    float nodeW = max(dMaj.x, dMaj.y) * uMajor;
    float node = 1.0 - smoothstep(0.0, 130.0, nodeW);
    float nodePulse = 0.6 + 0.4 * sin(uTime * 3.0);
    col += uAccent * 1.8 * node * nodePulse;
    alpha = max(alpha, node * nodePulse * 0.9);

    // --- Sonar ring radiating out from the ship ---
    float dist = distance(p, uCenter);
    float ring = smoothstep(0.82, 1.0, sin(dist * 0.010 - uTime * 2.6));
    col += uAccent * 0.7 * ring;
    alpha = max(alpha, ring * 0.4);

    // Gentle far-edge fade only, so the plane has no hard edge but stays visible
    // across the whole near/mid field.
    float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);
    alpha *= fade;
    col *= fade;

    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col, alpha);
}
`;

export class WorldReference {
    private scene: THREE.Scene;
    private grid: THREE.Mesh | null = null;
    private gridMat: THREE.ShaderMaterial | null = null;
    private blob: THREE.Mesh | null = null;
    private floorY = 0;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    public setup(trackCurve: THREE.Curve<THREE.Vector3>, accent: number) {
        // 1. Sample the curve once: used to find the floor and, later, to detect
        //    flyovers so pillars don't spear a lower deck.
        const SAMPLES = 400;
        const scan: THREE.Vector3[] = [];
        let minY = Infinity;
        for (let i = 0; i < SAMPLES; i++) {
            const p = trackCurve.getPoint(i / SAMPLES);
            scan.push(p);
            if (p.y < minY) minY = p.y;
        }
        const CLEARANCE = 500; // gap from the lowest track point to the floor
        this.floorY = minY - CLEARANCE;

        // 2. Grid floor. A big plane that tracks the player; the shader draws
        //    world-locked major/minor lines and fades them radially so the patch
        //    has no hard edge. Span comfortably exceeds the fade radius.
        const GRID_SPAN = 13000;
        const FADE_END = 5200;
        const gridGeo = new THREE.PlaneGeometry(GRID_SPAN, GRID_SPAN);
        gridGeo.rotateX(-Math.PI / 2); // lay flat in the XZ plane
        this.gridMat = new THREE.ShaderMaterial({
            vertexShader: GRID_VERT,
            fragmentShader: GRID_FRAG,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            uniforms: {
                uAccent: { value: new THREE.Color(accent) },
                uCenter: { value: new THREE.Vector2(0, 0) },
                uTime: { value: 0 },
                uMinor: { value: 200 },
                uMajor: { value: 1000 },
                uFadeStart: { value: 3200 },
                uFadeEnd: { value: FADE_END },
            },
        });
        const grid = new THREE.Mesh(gridGeo, this.gridMat);
        grid.position.y = this.floorY;
        grid.renderOrder = -2; // behind pillars and the blob
        this.scene.add(grid);
        this.grid = grid;

        // 3. Support pillars. One shared unit box + material, scaled per pillar so
        //    a tall stack shows where the track is high and a stub where it's low.
        //    Count scales with track length to keep spacing roughly constant.
        const trackLength = (trackCurve as THREE.CatmullRomCurve3).getLength?.() ?? 30000;
        const PILLAR_COUNT = Math.max(40, Math.min(140, Math.round(trackLength / 700)));
        const pillarGeo = new THREE.BoxGeometry(1, 1, 1);
        const pillarMat = new THREE.MeshStandardMaterial({
            color: 0x18222e,
            emissive: accent,
            emissiveIntensity: 0.22,
            roughness: 0.6,
            metalness: 0.4,
        });
        const PILLAR_WIDTH = 18;
        // Keep pillar tops well clear of the road. The road banks and curves, so
        // a thin margin lets a strut peek through the driving surface; sink them
        // below the underside (the gap is hidden from the chase camera anyway).
        const ROAD_UNDERSIDE_GAP = 28;
        // Flyover guard: skip a pillar if a *different* stretch of track passes
        // below its column (an upper deck at a flyover/overpass). Radius covers the
        // road half-width (~70) plus margin so an overlap at the road edge counts.
        const CLEAR_RADIUS_SQ = 120 * 120;
        const BELOW_MARGIN = 45;
        // Ignore scan points on the pillar's own stretch of track (within this
        // fraction of the lap), so the deck's own gradient doesn't trip the guard.
        const SELF_WINDOW = 0.04;
        for (let i = 0; i < PILLAR_COUNT; i++) {
            const tPillar = i / PILLAR_COUNT;
            const { position } = getTrackFrame(trackCurve, tPillar);
            const top = position.y - ROAD_UNDERSIDE_GAP;
            const height = top - this.floorY;
            if (height <= 0) continue;

            let blocked = false;
            for (let j = 0; j < scan.length; j++) {
                // Skip the pillar's own segment (circular distance in curve param).
                let dt = Math.abs(j / scan.length - tPillar);
                if (dt > 0.5) dt = 1 - dt;
                if (dt < SELF_WINDOW) continue;

                const q = scan[j];
                if (q.y > top - BELOW_MARGIN) continue; // not below us → not a lower deck
                const dx = q.x - position.x;
                const dz = q.z - position.z;
                if (dx * dx + dz * dz < CLEAR_RADIUS_SQ) { blocked = true; break; }
            }
            if (blocked) continue;

            const pillar = new THREE.Mesh(pillarGeo, pillarMat);
            pillar.scale.set(PILLAR_WIDTH, height, PILLAR_WIDTH);
            pillar.position.set(position.x, this.floorY + height / 2, position.z);
            this.scene.add(pillar);
        }

        // 4. Blob shadow on the floor, directly under the ship.
        const blobGeo = new THREE.CircleGeometry(48, 24);
        blobGeo.rotateX(-Math.PI / 2);
        const blobMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.35,
            depthWrite: false,
        });
        const blob = new THREE.Mesh(blobGeo, blobMat);
        blob.position.y = this.floorY + 1;
        blob.renderOrder = -1; // draw under the grid lines
        this.scene.add(blob);
        this.blob = blob;
    }

    public update(playerPos: THREE.Vector3) {
        if (this.grid && this.gridMat) {
            // Move the plane with the player; the lines are world-space in the
            // shader, so they stay locked while the visible patch follows.
            this.grid.position.x = playerPos.x;
            this.grid.position.z = playerPos.z;
            const u = this.gridMat.uniforms;
            u.uCenter.value.set(playerPos.x, playerPos.z);
            u.uTime.value = performance.now() * 0.001;
        }
        if (this.blob) {
            this.blob.position.x = playerPos.x;
            this.blob.position.z = playerPos.z;
        }
    }
}
