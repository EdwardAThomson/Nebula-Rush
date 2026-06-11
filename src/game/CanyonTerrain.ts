import * as THREE from 'three';
import { getTrackFrame } from './TrackFactory';

// CanyonTerrain is the desert/Sunscorch counterpart to WorldReference's space
// grid: instead of a neon floor it lines the track with procedurally-generated
// rock canyon walls over a sandy floor, so you race *through a gorge*. The walls
// are static (you pass them); the floor and the drifting dust follow the player
// so the desert reads as endless. Wall height and gorge width vary along the
// track via a per-track seeded periodic noise (continuous across the closed
// loop), so each track's canyon is distinct but stable.

const TAU = Math.PI * 2;

// FNV-1a string hash → [0,1) seed.
const hashString = (s: string): number => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 0xffffffff;
};

// Periodic noise over t∈[0,1] (harmonics on the loop) so the wall has no seam
// where the closed track wraps. Returns ~[-1, 1].
const pnoise = (t: number, seed: number): number =>
    Math.sin(t * TAU * 3 + seed * 6.28) * 0.5 +
    Math.sin(t * TAU * 7 + seed * 14.1) * 0.3 +
    Math.sin(t * TAU * 13 + seed * 4.7) * 0.2;

// Gorge half-width baseline / variation, and the ship half-width used for the
// collision clamp. Shared so the rock you SEE is the rock you HIT.
const CANYON_BASE_OFF = 66;
const CANYON_OFF_VAR = 3;
export const CANYON_SHIP_HALF = 8;

// Inner-face offset of the wall on `side` (+1/−1) at t. Capped on the inside of
// a bend so the offset curve never folds across the track. Single source of
// truth for the wall MESH (in setup) and the physics clamp (createCanyonWallLimit).
const wallOffsetAt = (curve: THREE.Curve<THREE.Vector3>, t: number, side: number, seed: number, N: number, segLen: number): number => {
    const tan = getTrackFrame(curve, t).tangent; // banking doesn't affect the tangent
    const tn = curve.getTangent((t + 1 / N) % 1);
    const latX = tan.z, latZ = -tan.x;
    const latLen = Math.hypot(latX, latZ) || 1;
    const lx = latX / latLen, lz = latZ / latLen;
    let off = CANYON_BASE_OFF + pnoise(t, seed) * CANYON_OFF_VAR;
    const ang = Math.atan2(tan.x * tn.z - tan.z * tn.x, tan.x * tn.x + tan.z * tn.z);
    const radius = Math.abs(ang) > 1e-4 ? segLen / Math.abs(ang) : 1e9;
    const innerness = (lx * side) * (tn.x - tan.x) + (lz * side) * (tn.z - tan.z);
    if (innerness > 0) off = Math.min(off, radius * 0.9);
    return Math.max(8, off);
};

// Look-ahead window (facets) and edge margin for the wall clamp. The per-t
// PERPENDICULAR offset alone lets the hull graze rock facets that jut in on
// bends (an old soft-wall bug — visible on Mesa Run's tighter kinks): the clamp
// thinks the wall is straight out at distance `wallOffset(t)`, but a neighbouring
// facet sits closer. Taking the MIN offset over ±WINDOW facets pulls the clamp in
// where a facet protrudes, and EDGE_MARGIN covers convex-corner chords the
// perpendicular min can't see. Verified to remove all soft spots via
// scripts/canyon-collision-check.ts.
const WALL_CLAMP_WINDOW = 6;
const WALL_EDGE_MARGIN = 3;

// Per-t lateral clamp [min, max] for the physics engine, inset by the ship
// half-width (+ margin). Side mapping matches lateralPosition: wall(+1) bounds the
// negative side, wall(−1) the positive side. Used for both the player and the AI.
export const createCanyonWallLimit = (curve: THREE.Curve<THREE.Vector3>, trackId: string): ((t: number) => [number, number]) => {
    const seed = hashString(trackId);
    const trackLength = (curve as THREE.CatmullRomCurve3).getLength?.() ?? 30000;
    const N = Math.max(240, Math.min(900, Math.floor(trackLength / 70)));
    const segLen = trackLength / N;
    const inset = CANYON_SHIP_HALF + WALL_EDGE_MARGIN;
    // Minimum wall offset over a small window of facets on `side`.
    const clampOffset = (t: number, side: number): number => {
        let m = Infinity;
        for (let k = -WALL_CLAMP_WINDOW; k <= WALL_CLAMP_WINDOW; k++) {
            m = Math.min(m, wallOffsetAt(curve, ((t + k / N) % 1 + 1) % 1, side, seed, N, segLen));
        }
        return m;
    };
    return (t: number): [number, number] => [
        -(clampOffset(t, 1) - inset),
        clampOffset(t, -1) - inset,
    ];
};

// Small seeded RNG for texture grain.
const makeRng = (seed: number) => {
    let s = (Math.floor(seed * 1e9) % 2147483647) + 1;
    return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
};

// Sandstone wall texture: horizontal strata bands (vary along height = V) plus
// fine grain. Tiles along the track (U).
const createSandstoneTexture = (seed: number): THREE.CanvasTexture => {
    const W = 128, H = 256;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    const rnd = makeRng(seed);

    ctx.fillStyle = '#5e3c1f'; // deep warm sandstone — dark enough to survive a harsh sun
    ctx.fillRect(0, 0, W, H);

    // Strata: stacked horizontal bands of warm ochre / rust / terracotta.
    const bands = ['#4a2c15', '#6b4226', '#553318', '#744a2c', '#3e2410', '#623a20'];
    let y = 0;
    while (y < H) {
        const bh = 7 + rnd() * 26;
        ctx.fillStyle = bands[Math.floor(rnd() * bands.length)];
        ctx.globalAlpha = 0.3 + rnd() * 0.45;
        ctx.fillRect(0, y, W, bh);
        y += bh;
    }
    ctx.globalAlpha = 1;

    // Grain speckle for close-up detail.
    for (let i = 0; i < 2400; i++) {
        const x = rnd() * W, yy = rnd() * H;
        ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,240,210,0.10)' : 'rgba(55,38,18,0.13)';
        ctx.fillRect(x, yy, 1, 1);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
};

// Sandy floor texture: grain + faint wind ripples. Tiles both ways.
const createSandFloorTexture = (seed: number): THREE.CanvasTexture => {
    const S = 256;
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const ctx = c.getContext('2d')!;
    const rnd = makeRng(seed + 0.5);

    ctx.fillStyle = '#c2a878';
    ctx.fillRect(0, 0, S, S);

    // Mottled tone patches so the sand reads as more than one flat colour.
    const tones = ['#b89a68', '#cdb487', '#a98e5e', '#d4be90', '#9c8154'];
    for (let i = 0; i < 60; i++) {
        const x = rnd() * S, y = rnd() * S, r = 16 + rnd() * 70;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, tones[Math.floor(rnd() * tones.length)]); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.18 + rnd() * 0.22; ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Faint ripple lines.
    ctx.strokeStyle = 'rgba(150,120,80,0.18)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
        const yy = rnd() * S;
        ctx.beginPath();
        for (let x = 0; x <= S; x += 8) ctx.lineTo(x, yy + Math.sin(x * 0.05 + i) * 6);
        ctx.stroke();
    }
    // Grain.
    for (let i = 0; i < 4000; i++) {
        const x = rnd() * S, yy = rnd() * S;
        ctx.fillStyle = rnd() > 0.5 ? 'rgba(210,190,150,0.18)' : 'rgba(120,95,60,0.16)';
        ctx.fillRect(x, yy, 1, 1);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.repeat.set(60, 60);
    return tex;
};

const FLOOR_SIZE = 16000;
const FLOOR_REPEAT = 60;

// Sand normal map: rolling dunes + wavy wind ripples, so the sun rakes relief
// across the floor instead of flat colour. Seeded per track; linear (not sRGB).
const createSandNormalTexture = (seed: number): THREE.CanvasTexture => {
    const S = 256;
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    const ph = seed * 6.28;
    const H = (x: number, y: number) =>
        Math.sin((x * 0.02 + y * 0.015) + ph) * 1.6 +        // rolling dunes
        Math.sin(y * 0.07 + Math.sin(x * 0.05) * 2) * 0.7 +  // wavy ripples
        Math.sin(y * 0.20) * 0.5;                            // tight ripples
    const strength = 1.6;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const hL = H(x - 1, y), hR = H(x + 1, y), hD = H(x, y - 1), hU = H(x, y + 1);
        let nx = (hL - hR) * strength, ny = (hD - hU) * strength, nz = 1;
        const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
        const i = (y * S + x) * 4;
        img.data[i] = (nx * 0.5 + 0.5) * 255;
        img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
        img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.NoColorSpace;
    tex.repeat.set(FLOOR_REPEAT, FLOOR_REPEAT);
    return tex;
};

export class CanyonTerrain {
    private scene: THREE.Scene;
    private ground: THREE.Mesh | null = null;
    private floorTex: THREE.Texture | null = null;
    private floorNormal: THREE.Texture | null = null;
    private dust: THREE.Points | null = null;
    private dustPos: Float32Array | null = null;
    private dustSpeed: Float32Array | null = null;
    private floorY = 0;
    private lastT = 0;

    // Dust drift volume (relative to the player) and wind.
    private static readonly DHX = 1500;
    private static readonly DHZ = 1500;
    private static readonly DYLO = -80;
    private static readonly DYHI = 440;
    private static readonly WIND = new THREE.Vector3(95, 0, 140);

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    public setup(trackCurve: THREE.Curve<THREE.Vector3>, trackId: string) {
        const seed = hashString(trackId);

        // 1. Floor height: just below the lowest point of the track.
        const SAMPLES = 240;
        let minY = Infinity;
        for (let i = 0; i < SAMPLES; i++) {
            const y = trackCurve.getPoint(i / SAMPLES).y;
            if (y < minY) minY = y;
        }
        this.floorY = minY - 25;

        // 2. Sandy floor — big textured plane that follows the player; the texture
        //    offset is driven by player position so the sand stays world-locked.
        this.floorTex = createSandFloorTexture(seed);
        this.floorNormal = createSandNormalTexture(seed);
        const groundGeo = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE);
        groundGeo.rotateX(-Math.PI / 2);
        const groundMat = new THREE.MeshStandardMaterial({ map: this.floorTex, normalMap: this.floorNormal, roughness: 1.0, metalness: 0.0 });
        groundMat.normalScale.set(1.3, 1.3);
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.position.y = this.floorY;
        ground.renderOrder = -2;
        this.scene.add(ground);
        this.ground = ground;

        // 3. Canyon walls — one craggy, sandstone-textured ribbon per side.
        const trackLength = (trackCurve as THREE.CatmullRomCurve3).getLength?.() ?? 30000;
        const N = Math.max(240, Math.min(900, Math.floor(trackLength / 70)));
        const BASE_H = 260;     // wall height baseline
        const H_VAR = 240;      // slow height undulation
        const CRAG = 120;       // higher-frequency top-edge jaggedness
        const LEAN = 45;        // top leans outward → canyon widens upward

        const wallMat = new THREE.MeshStandardMaterial({
            map: createSandstoneTexture(seed),
            roughness: 1.0,
            metalness: 0.0,
            side: THREE.DoubleSide,
            flatShading: true,
        });

        const segLen = trackLength / N;

        // Wall offset for a side at t. On the inside of a bend it's capped just
        // below the local turn radius so the offset curve never folds across the
        // track (offset ≥ radius would form a cusp). Shared by the wall mesh and
        // the collision bounds so the rock you see is the rock you hit.
        // Shared with the physics clamp so the rock you see is the rock you hit.
        const wallOffset = (t: number, side: number): number => wallOffsetAt(trackCurve, t, side, seed, N, segLen);

        for (const side of [-1, 1]) {
            const verts: number[] = [];
            const uvs: number[] = [];
            for (let i = 0; i <= N; i++) {
                const t = i / N;
                const frame = getTrackFrame(trackCurve, t);
                const tan = frame.tangent;
                // Horizontal perpendicular to the tangent (walls stay vertical
                // regardless of track banking).
                const latX = tan.z, latZ = -tan.x;
                const latLen = Math.hypot(latX, latZ) || 1;
                const lx = latX / latLen, lz = latZ / latLen;

                const off = wallOffset(t, side);
                const h = BASE_H
                    + ((pnoise(t, seed + 0.31) + 1) / 2) * H_VAR
                    + Math.abs(pnoise(t, seed + 0.77)) * CRAG;

                const bx = frame.position.x + lx * side * off;
                const bz = frame.position.z + lz * side * off;
                const tx = bx + lx * side * LEAN;
                const tz = bz + lz * side * LEAN;

                verts.push(bx, this.floorY, bz);
                verts.push(tx, this.floorY + h, tz);

                const u = i * 0.25; // tile along the track
                uvs.push(u, 0, u, 1);
            }
            const idx: number[] = [];
            for (let i = 0; i < N; i++) {
                const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
                idx.push(a, c, b, b, c, d);
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geo.setIndex(idx);
            geo.computeVertexNormals();
            this.scene.add(new THREE.Mesh(geo, wallMat));
        }

        // 3b. Rock greebles — instanced low-poly scree nestled against the wall
        // bases at road level, so they stream past as you drive (clamped to the
        // local wall offset so they hug the rock and never poke through). Cosmetic.
        const ROCK_COUNT = 700;
        const rockMesh = new THREE.InstancedMesh(
            new THREE.IcosahedronGeometry(1, 0),
            new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, flatShading: true }),
            ROCK_COUNT,
        );
        {
            const rr = makeRng(seed + 1.3);
            const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
            const p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
            const shades = [0x6b4a2c, 0x7a5634, 0x5e3c1f, 0x866241, 0x4a2c15];
            for (let i = 0; i < ROCK_COUNT; i++) {
                const t = rr();
                const frame = getTrackFrame(trackCurve, t);
                const tan = frame.tangent;
                const latX = tan.z, latZ = -tan.x;
                const latLen = Math.hypot(latX, latZ) || 1;
                const lx = latX / latLen, lz = latZ / latLen;
                const sign = rr() < 0.5 ? -1 : 1;
                const off = Math.max(8, wallOffset(t, sign) - (1 + rr() * 4)); // hug the wall on that side
                p.set(frame.position.x + lx * sign * off, frame.position.y + 0.5 + rr() * 1.5, frame.position.z + lz * sign * off);
                e.set((rr() - 0.5) * 0.5, rr() * Math.PI * 2, (rr() - 0.5) * 0.5);
                q.setFromEuler(e);
                s.set(1.5 + rr() * 3.5, 1.2 + rr() * 2.8, 1.5 + rr() * 3.5);
                m.compose(p, q, s);
                rockMesh.setMatrixAt(i, m);
                col.setHex(shades[(rr() * shades.length) | 0]);
                rockMesh.setColorAt(i, col);
            }
            rockMesh.instanceMatrix.needsUpdate = true;
            if (rockMesh.instanceColor) rockMesh.instanceColor.needsUpdate = true;
            rockMesh.frustumCulled = false;
            this.scene.add(rockMesh);
        }

        // 4. Drifting dust — a wind-blown haze of sand motes around the player.
        const COUNT = 2600;
        this.dustPos = new Float32Array(COUNT * 3);
        this.dustSpeed = new Float32Array(COUNT);
        const rnd = makeRng(seed + 0.9);
        for (let i = 0; i < COUNT; i++) {
            this.dustPos[i * 3] = (rnd() * 2 - 1) * CanyonTerrain.DHX;
            this.dustPos[i * 3 + 1] = CanyonTerrain.DYLO + rnd() * (CanyonTerrain.DYHI - CanyonTerrain.DYLO);
            this.dustPos[i * 3 + 2] = (rnd() * 2 - 1) * CanyonTerrain.DHZ;
            this.dustSpeed[i] = 0.5 + rnd() * 1.1;
        }
        const dustGeo = new THREE.BufferGeometry();
        dustGeo.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3));
        const dustMat = new THREE.PointsMaterial({
            color: 0xd8c39a,
            size: 3,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.4,
            depthWrite: false,
        });
        this.dust = new THREE.Points(dustGeo, dustMat);
        this.dust.frustumCulled = false;
        this.scene.add(this.dust);
    }

    public update(playerPos: THREE.Vector3) {
        // Floor follows the player; texture offset keeps the sand world-locked.
        if (this.ground && this.floorTex) {
            this.ground.position.x = playerPos.x;
            this.ground.position.z = playerPos.z;
            const ox = (playerPos.x / FLOOR_SIZE) * FLOOR_REPEAT;
            const oz = (-playerPos.z / FLOOR_SIZE) * FLOOR_REPEAT;
            this.floorTex.offset.set(ox, oz);
            if (this.floorNormal) this.floorNormal.offset.set(ox, oz); // keep relief world-locked
        }

        // Dust: drift on the wind, recycled within a box centred on the player.
        if (this.dust && this.dustPos && this.dustSpeed) {
            const now = performance.now();
            let dt = this.lastT ? (now - this.lastT) / 1000 : 0.016;
            this.lastT = now;
            dt = Math.min(dt, 0.05);

            const w = CanyonTerrain.WIND;
            const { DHX, DHZ } = CanyonTerrain;
            for (let i = 0; i < this.dustSpeed.length; i++) {
                const spd = this.dustSpeed[i];
                let x = this.dustPos[i * 3] + w.x * spd * dt;
                let z = this.dustPos[i * 3 + 2] + w.z * spd * dt;
                if (x > DHX) x -= 2 * DHX; else if (x < -DHX) x += 2 * DHX;
                if (z > DHZ) z -= 2 * DHZ; else if (z < -DHZ) z += 2 * DHZ;
                this.dustPos[i * 3] = x;
                this.dustPos[i * 3 + 2] = z;
            }
            (this.dust.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
            this.dust.position.copy(playerPos);
        }
    }
}
