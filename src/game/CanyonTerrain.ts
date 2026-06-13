import * as THREE from 'three';
import { getTrackFrame } from './TrackFactory';
import { widthAt, type TrackConfig } from './TrackDefinitions';

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
// Sand shoulder between the road edge and the rock for tracks that declare a
// per-t widthProfile (base = local half-width + shoulder). Tracks without a
// profile keep the legacy fixed baseline (CANYON_BASE_OFF = default half 60 + 6),
// bit-identical to before.
const CANYON_SHOULDER = 6;
type WidthProfile = { t: number; half: number }[];

// Inner-face offset of the wall on `side` (+1/−1) at t. Capped on the inside of
// a bend so the offset curve never folds across the track. Single source of
// truth for the wall MESH (in setup) and the physics clamp (createCanyonWallLimit).
const wallOffsetAt = (curve: THREE.Curve<THREE.Vector3>, t: number, side: number, seed: number, N: number, segLen: number, profile?: WidthProfile): number => {
    const tan = getTrackFrame(curve, t).tangent; // banking doesn't affect the tangent
    const tn = curve.getTangent((t + 1 / N) % 1);
    const latX = tan.z, latZ = -tan.x;
    const latLen = Math.hypot(latX, latZ) || 1;
    const lx = latX / latLen, lz = latZ / latLen;
    const base = profile ? widthAt(profile, t) + CANYON_SHOULDER : CANYON_BASE_OFF;
    let off = base + pnoise(t, seed) * CANYON_OFF_VAR;
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
export const createCanyonWallLimit = (curve: THREE.Curve<THREE.Vector3>, trackId: string, widthProfile?: WidthProfile): ((t: number) => [number, number]) => {
    const seed = hashString(trackId);
    const trackLength = (curve as THREE.CatmullRomCurve3).getLength?.() ?? 30000;
    const N = Math.max(240, Math.min(900, Math.floor(trackLength / 70)));
    const segLen = trackLength / N;
    const inset = CANYON_SHIP_HALF + WALL_EDGE_MARGIN;
    // Minimum wall offset over a small window of facets on `side`.
    const clampOffset = (t: number, side: number): number => {
        let m = Infinity;
        for (let k = -WALL_CLAMP_WINDOW; k <= WALL_CLAMP_WINDOW; k++) {
            m = Math.min(m, wallOffsetAt(curve, ((t + k / N) % 1 + 1) % 1, side, seed, N, segLen, widthProfile));
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

// --- Zoned-canyon constants (tracks with a `canyon` config, e.g. track_7) ---
// The zoned path builds a SUNKEN canyon cut into a STATIC desert: the flat
// plain is the fixed height reference; the road runs at grade on open desert
// (low broken berm lips), below grade through 'full' zones (slot canyon +
// tunnel bored underground), above it only on a 'viaduct'. Prototyped and
// user-approved in sandbox/gorge.ts.
// 'ridge' and 'crag' (Sandstorm Pass) currently fall through to the berm
// branch in setupZoned — their real treatments arrive with the track_8 port.
type CanyonWallMode = 'full' | 'berm' | 'viaduct' | 'ridge' | 'crag';
const GROUND_DROP = 26;     // open-desert plateau sits this far below the road
const SHOULDER_DROP = 8;    // narrow gutter strip just outside the road edge
const DECK_THK = 14;        // viaduct deck slab thickness
const PARAPET = 4;          // viaduct lip — below the chase camera so you can see over
const ZONED_H_VAR = 70;     // canyon-rim crag noise amplitudes
const ZONED_CRAG = 50;
const ZONED_LEAN = 45;      // full walls lean outward at the top
const EDGE_RAMP = 0.004;    // smoothstep (in t) from berm lip to canyon rim at zone ends
const CEIL_H = 50;          // tunnel vault peak above the road
const ARCH_COLS = 12;       // tunnel vault cross-section resolution
const PLANE_SIZE = 90000;   // static desert plane extent
const TEX_PERIOD = FLOOR_SIZE / FLOOR_REPEAT; // world units per sand tile (matches the legacy floor's grain)

// Box-smooth a periodic array over ±W samples (softens wall-mode transitions).
const smoothPeriodic = (arr: number[], W: number): number[] => {
    const n = arr.length, out = new Array<number>(n);
    for (let i = 0; i < n; i++) {
        let s = 0;
        for (let k = -W; k <= W; k++) s += arr[((i + k) % n + n) % n];
        out[i] = s / (2 * W + 1);
    }
    return out;
};

export class CanyonTerrain {
    private scene: THREE.Scene;
    private ground: THREE.Mesh | null = null;
    // Zoned tracks use a STATIC ground (real relief); update() must not move it.
    private staticGround = false;
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

    public setup(trackCurve: THREE.Curve<THREE.Vector3>, trackId: string, track?: TrackConfig) {
        const seed = hashString(trackId);

        // Tracks with a `canyon` config get the zoned sunken-canyon build;
        // everything else (Mesa Run) keeps the legacy gorge, bit-identical.
        if (track?.canyon) {
            this.setupZoned(trackCurve, track, seed);
            this.setupDust(seed);
            return;
        }

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

        this.setupDust(seed);
    }

    // ZONED sunken-canyon build (tracks with a `canyon` config). The desert is
    // STATIC: a flat plane at the surface level with real holes cut where the
    // road runs below grade, plus a corridor relief apron (gutter / wall band /
    // flanks). Walls are per-t mode: low broken berm lips, full canyon rock
    // whose rim is a FIXED height above the surface (the road sinks, the rim
    // stays — a real descent), or a viaduct (deck + pillars). Tunnels get a
    // vault, portal headwalls, a rim lid, and marker lamps. All placement is
    // seeded — fixed once and for all.
    private setupZoned(trackCurve: THREE.Curve<THREE.Vector3>, track: TrackConfig, seed: number) {
        const scene = this.scene;
        const profile = track.widthProfile;
        const trackLength = (trackCurve as THREE.CatmullRomCurve3).getLength?.() ?? 30000;
        const N = Math.max(240, Math.min(900, Math.floor(trackLength / 70)));
        const segLen = trackLength / N;
        const M = N;
        const wallOffset = (t: number, side: number): number =>
            wallOffsetAt(trackCurve, ((t % 1) + 1) % 1, side, seed, N, segLen, profile);
        const frameAt = (t: number) => getTrackFrame(trackCurve, ((t % 1) + 1) % 1, false); // flat frame
        const roadYAt = (t: number) => frameAt(t).position.y;

        // Per-t wall-mode config.
        const zones = track.canyon?.zones ?? [];

        // The desert surface: GROUND_DROP below "grade". Grade is the median road
        // height over the OPEN-DESERT (berm) sections only — on a mountain track
        // most of the lap is elevated, so a whole-lap median would put the desert
        // surface up the hillside and sink the real plain "underground". Tracks
        // with no berm sections (all-canyon) fall back to the whole-lap median.
        const inNonBerm = (t: number) => zones.some((z) => t >= z.start && t <= z.end && z.mode !== 'berm');
        const ys: number[] = [];
        for (let i = 0; i < 200; i++) { const t = i / 200; if (!inNonBerm(t)) ys.push(roadYAt(t)); }
        if (ys.length === 0) for (let i = 0; i < 200; i++) ys.push(roadYAt(i / 200));
        ys.sort((a, b) => a - b);
        const surfaceY = ys[Math.floor(ys.length / 2)] - GROUND_DROP;
        this.floorY = surfaceY;

        const defMode: CanyonWallMode = track.canyon?.wall?.mode ?? 'berm';
        const defHeight = track.canyon?.wall?.height ?? 14;
        const zoneAt = (t: number) => zones.find((z) => t >= z.start && t <= z.end);
        const modeAt = (t: number): CanyonWallMode => zoneAt(t)?.mode ?? defMode;
        const heightOf = (t: number): number => {
            const z = zoneAt(t);
            if (z) return z.height ?? (z.mode === 'berm' ? defHeight : z.mode === 'viaduct' ? PARAPET : z.mode === 'ridge' ? 10 : z.mode === 'crag' ? 90 : 80);
            return defHeight;
        };

        // Ground material: the same sand textures as the legacy floor, but at
        // repeat 1 — the plane and apron carry world-anchored UVs instead
        // (coords / TEX_PERIOD), so the grain scale matches Mesa Run's.
        this.floorTex = createSandFloorTexture(seed);
        this.floorNormal = createSandNormalTexture(seed);
        this.floorTex.repeat.set(1, 1);
        this.floorNormal.repeat.set(1, 1);
        const groundMat = new THREE.MeshStandardMaterial({
            map: this.floorTex, normalMap: this.floorNormal,
            roughness: 1.0, metalness: 0.0, side: THREE.DoubleSide,
        });
        groundMat.normalScale.set(1.3, 1.3);
        this.staticGround = true;

        // --- Walls: per-t mode targets → one craggy ribbon per side ---------
        const wallMat = new THREE.MeshStandardMaterial({
            map: createSandstoneTexture(seed), roughness: 1.0, metalness: 0.0,
            side: THREE.DoubleSide, flatShading: true,
        });
        const roadYArr: number[] = [];
        for (let i = 0; i <= M; i++) roadYArr[i] = roadYAt(i / M);
        // Canyon rim: a FIXED world height just above the desert surface (zone
        // `height` = rim above the surface) — never road-relative, never raised
        // to meet a high road.
        const zoneRimY = new Map<object, number>();
        for (const z of zones) if (z.mode === 'full') zoneRimY.set(z, surfaceY + (z.height ?? 80));

        const baseT: number[] = [], topT: number[] = [], leanT: number[] = [], cragT: number[] = [];
        for (let i = 0; i <= M; i++) {
            const t = i / M;
            const ry = roadYArr[i];
            const mode = modeAt(t);
            if (mode === 'full') {
                const z = zoneAt(t)!;
                const d = Math.min(1, Math.max(0, Math.min(t - z.start, z.end - t) / EDGE_RAMP));
                const ss = d * d * (3 - 2 * d); // 0 at the zone edge → 1 just inside
                const bermTop = ry + 30;
                baseT[i] = ry - GROUND_DROP - 240; // buried: the gorge floor can sit well below the road
                topT[i] = bermTop + (zoneRimY.get(z)! - bermTop) * ss;
                leanT[i] = 6 + (ZONED_LEAN - 6) * ss;
                cragT[i] = ss;
            } else if (mode === 'viaduct') {
                baseT[i] = ry - DECK_THK;
                topT[i] = ry + heightOf(t);
                leanT[i] = 2;
                cragT[i] = 0;
            } else if (mode === 'crag') {
                // Summit notch: ROAD-RELATIVE rock towers flanking the pinch (the
                // crags sit ON the ridge, unlike 'full' whose rim is surface-fixed).
                const z = zoneAt(t)!;
                const d = Math.min(1, Math.max(0, Math.min(t - z.start, z.end - t) / 0.006));
                const ss = d * d * (3 - 2 * d);
                baseT[i] = ry - GROUND_DROP - 60;
                topT[i] = ry + 10 + (heightOf(t) - 10) * ss;
                leanT[i] = 6 + (ZONED_LEAN - 6) * ss;
                cragT[i] = ss;
            } else { // berm or ridge: low broken lip (35%..100% of h) — open desert / crest
                const h = heightOf(t);
                baseT[i] = ry - GROUND_DROP - 20;
                topT[i] = ry + h * (0.35 + 0.65 * Math.abs(pnoise(t, seed + 0.77)));
                leanT[i] = 6;
                cragT[i] = 0;
            }
        }
        const baseS = smoothPeriodic(baseT, 6), leanS = smoothPeriodic(leanT, 6);
        const topW = smoothPeriodic(topT, 2), cragS = smoothPeriodic(cragT, 2);
        // Crag noise applied AFTER smoothing so it isn't flattened.
        const topS = topW.map((y, i) =>
            y + cragS[i] * (((pnoise(i / M, seed + 0.31) + 1) / 2) * ZONED_H_VAR + Math.abs(pnoise(i / M, seed + 0.77)) * ZONED_CRAG));
        const wallTopYAt = (t: number): number => topS[Math.round((((t % 1) + 1) % 1) * M)];

        const wallTopLine: Record<number, THREE.Vector3[]> = { [-1]: [], [1]: [] };
        for (const side of [-1, 1]) {
            const verts: number[] = [], uvs: number[] = [], idx: number[] = [];
            for (let i = 0; i <= M; i++) {
                const t = i / M;
                const f = frameAt(t);
                const tan = f.tangent;
                const latX = tan.z, latZ = -tan.x;
                const latLen = Math.hypot(latX, latZ) || 1;
                const lx = latX / latLen, lz = latZ / latLen;
                const off = wallOffset(t, side);
                const bx = f.position.x + lx * side * off;
                const bz = f.position.z + lz * side * off;
                const tx = bx + lx * side * leanS[i];
                const tz = bz + lz * side * leanS[i];
                verts.push(bx, baseS[i], bz, tx, topS[i], tz);
                wallTopLine[side].push(new THREE.Vector3(tx, topS[i], tz));
                const u = i * 0.25;
                uvs.push(u, 0, u, 1);
            }
            for (let i = 0; i < M; i++) {
                const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
                idx.push(a, c, b, b, c, d);
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
            g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            g.setIndex(idx); g.computeVertexNormals();
            scene.add(new THREE.Mesh(g, wallMat));
        }

        // Rock LID over each tunnel: spans the wall tops so the tunnel runs
        // through a solid massif instead of a freestanding shell.
        for (const tn of track.tunnels ?? []) {
            const i0 = Math.floor(tn.start * M), i1 = Math.ceil(tn.end * M);
            const lv: number[] = [], luv: number[] = [], lidx: number[] = [];
            for (let i = i0; i <= i1; i++) {
                const a = wallTopLine[1][i], b = wallTopLine[-1][i];
                lv.push(a.x, a.y, a.z, b.x, b.y, b.z);
                luv.push(0, (i - i0) * 0.25, 1, (i - i0) * 0.25);
            }
            for (let i = 0; i < i1 - i0; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; lidx.push(a, c, b, b, c, d); }
            const lg = new THREE.BufferGeometry();
            lg.setAttribute('position', new THREE.Float32BufferAttribute(lv, 3));
            lg.setAttribute('uv', new THREE.Float32BufferAttribute(luv, 2));
            lg.setIndex(lidx); lg.computeVertexNormals();
            scene.add(new THREE.Mesh(lg, wallMat));
        }

        // --- Terrain relief APRON: the real, static ground along the corridor.
        // Stations out from the centreline: gutter / wall band rising to the
        // rim / flanks falling to the surface. Viaduct sections tuck just under
        // the plane so the bridge spans a real drop.
        const ST_LAT = [0, 0, 70, 320, 560, 880];
        const NST = ST_LAT.length;
        const H: number[][] = Array.from({ length: NST }, () => []);
        for (let i = 0; i <= M; i++) {
            const t = i / M;
            const ry = roadYArr[i];
            const mode = modeAt(t);
            const S = surfaceY;
            let hs: number[];
            if (mode === 'viaduct') {
                hs = [S - 1.2, S - 1.2, S - 1.2, S - 1.2, S - 1.2, S];
            } else if (mode === 'full') {
                const gut = ry - SHOULDER_DROP, rim = topS[i];
                hs = [gut, gut, rim, rim + (S - rim) * 0.45, rim + (S - rim) * 0.85, S];
            } else if (mode === 'ridge' || mode === 'crag') {
                // Exposed crest: the ground drops away steeply on BOTH sides — the
                // road rides a mountain spine, not a causeway plateau.
                const gut = ry - SHOULDER_DROP, plat = ry - GROUND_DROP;
                hs = [gut, gut, plat, plat + (S - plat) * 0.62, plat + (S - plat) * 0.93, S];
            } else {
                const gut = ry - SHOULDER_DROP, plat = ry - GROUND_DROP;
                hs = [gut, gut, plat, plat + (S - plat) * 0.5, plat + (S - plat) * 0.9, S];
            }
            for (let s = 0; s < NST; s++) H[s][i] = hs[s];
        }
        const HS = H.map((arr) => smoothPeriodic(arr, 6));
        const cols = 2 * NST - 1; // mirrored stations: -5..0..+5
        const av: number[] = [], auv: number[] = [], aidx: number[] = [];
        for (let i = 0; i <= M; i++) {
            const t = i / M;
            const f = frameAt(t);
            const tan = f.tangent;
            const tn = trackCurve.getTangent((t + 1 / M) % 1);
            const ang = Math.atan2(tan.x * tn.z - tan.z * tn.x, tan.x * tn.x + tan.z * tn.z);
            const radius = Math.abs(ang) > 1e-4 ? segLen / Math.abs(ang) : 1e9;
            // Vertices are placed along the BINORMAL, so the inside-bend fold
            // guard must use the binormal direction too.
            const bnx = -tan.z, bnz = tan.x;
            const blen = Math.hypot(bnx, bnz) || 1;
            const wIn = widthAt(profile, t) + CANYON_SHOULDER + 12;
            for (let c = 0; c < cols; c++) {
                const s = Math.abs(c - (NST - 1));
                const side = Math.sign(c - (NST - 1));
                let lat = s === 0 ? 0 : wIn + ST_LAT[s];
                const innerness = (bnx / blen * side) * (tn.x - tan.x) + (bnz / blen * side) * (tn.z - tan.z);
                if (innerness > 0) lat = Math.min(lat, Math.max(wIn + 20, radius * 0.85));
                const p = f.position.clone().add(f.binormal.clone().multiplyScalar(side * lat));
                av.push(p.x, HS[s][i], p.z);
                auv.push(p.x / TEX_PERIOD, p.z / TEX_PERIOD);
            }
            if (i < M) for (let c = 0; c < cols - 1; c++) {
                const a = i * cols + c, b = a + 1, cc = a + cols, d = cc + 1;
                aidx.push(a, cc, b, b, cc, d);
            }
        }
        const ag = new THREE.BufferGeometry();
        ag.setAttribute('position', new THREE.Float32BufferAttribute(av, 3));
        ag.setAttribute('uv', new THREE.Float32BufferAttribute(auv, 2));
        ag.setIndex(aidx); ag.computeVertexNormals();
        scene.add(new THREE.Mesh(ag, groundMat));

        // --- Static desert plane with CANYON HOLES (a solid plane would roof
        // any below-grade road — the old drive-through "cream sheet").
        let bbMinX = Infinity, bbMaxX = -Infinity, bbMinZ = Infinity, bbMaxZ = -Infinity;
        for (let i = 0; i <= 200; i++) {
            const p = trackCurve.getPoint(i / 200);
            bbMinX = Math.min(bbMinX, p.x); bbMaxX = Math.max(bbMaxX, p.x);
            bbMinZ = Math.min(bbMinZ, p.z); bbMaxZ = Math.max(bbMaxZ, p.z);
        }
        const cxp = (bbMinX + bbMaxX) / 2, czp = (bbMinZ + bbMaxZ) / 2, sq = PLANE_SIZE / 2;
        const floorShape = new THREE.Shape([
            new THREE.Vector2(cxp - sq, czp - sq), new THREE.Vector2(cxp + sq, czp - sq),
            new THREE.Vector2(cxp + sq, czp + sq), new THREE.Vector2(cxp - sq, czp + sq),
        ]);
        const holeLatAt = (t: number, side: number): number => {
            const tan = trackCurve.getTangent(t).normalize();
            const tn = trackCurve.getTangent((t + 0.002) % 1).normalize();
            const ang = Math.atan2(tan.x * tn.z - tan.z * tn.x, tan.x * tn.x + tan.z * tn.z);
            const radius = Math.abs(ang) > 1e-4 ? (trackLength * 0.002) / Math.abs(ang) : 1e9;
            const bnx = -tan.z, bnz = tan.x;
            const blen = Math.hypot(bnx, bnz) || 1;
            const innerness = (bnx / blen * side) * (tn.x - tan.x) + (bnz / blen * side) * (tn.z - tan.z);
            let lat = widthAt(profile, t) + CANYON_SHOULDER + 12 + 800; // inside the apron's outer edge
            if (innerness > 0) lat = Math.min(lat, radius * 0.8);
            return lat;
        };
        const grade = surfaceY + GROUND_DROP;
        for (const z of zones.filter((zz) => zz.mode === 'full')) {
            // Grow the hole past the zone until the road is back above grade.
            let h0 = z.start, h1 = z.end;
            while (h0 > 0.02 && roadYAt(h0) < grade + 8) h0 -= 0.005;
            while (h1 < 0.98 && roadYAt(h1) < grade + 8) h1 += 0.005;
            h0 -= 0.01; h1 += 0.01;
            const HOLE_N = 240;
            const pts: THREE.Vector2[] = [];
            for (let i = 0; i <= HOLE_N; i++) {
                const t = h0 + (i / HOLE_N) * (h1 - h0);
                const f = frameAt(t);
                const p = f.position.clone().add(f.binormal.clone().multiplyScalar(holeLatAt(t, 1)));
                pts.push(new THREE.Vector2(p.x, p.z));
            }
            for (let i = HOLE_N; i >= 0; i--) {
                const t = h0 + (i / HOLE_N) * (h1 - h0);
                const f = frameAt(t);
                const p = f.position.clone().add(f.binormal.clone().multiplyScalar(-holeLatAt(t, -1)));
                pts.push(new THREE.Vector2(p.x, p.z));
            }
            floorShape.holes.push(new THREE.Path(pts));
        }
        const planeGeo = new THREE.ShapeGeometry(floorShape, 1);
        {
            // Shape XY → world XZ, with world-anchored UVs.
            const pos = planeGeo.attributes.position as THREE.BufferAttribute;
            const uv = planeGeo.attributes.uv as THREE.BufferAttribute;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), zc = pos.getY(i);
                pos.setXYZ(i, x, 0, zc);
                uv.setXY(i, x / TEX_PERIOD, zc / TEX_PERIOD);
            }
            planeGeo.computeVertexNormals();
        }
        const ground = new THREE.Mesh(planeGeo, groundMat);
        ground.position.set(0, surfaceY - 0.6, 0); // just under the apron's outer edge — no z-fight
        ground.renderOrder = -2;
        scene.add(ground);
        this.ground = ground;

        // --- Tunnels: vaulted rock arch + portal headwalls + marker lamps ---
        // Springing half-width: at (or just outside) the wall face so the arch
        // foot overlaps the rock and never leaves a side gap.
        const archHalf = (t: number) => widthAt(profile, t) + CANYON_SHOULDER + CANYON_OFF_VAR + 2;
        for (const tn of track.tunnels ?? []) {
            const start = tn.start, end = tn.end;
            const SEG = Math.max(40, Math.ceil((end - start) * 1400));
            const verts: number[] = [], uvs: number[] = [], idx: number[] = [];
            const rowLen = ARCH_COLS + 1;
            for (let i = 0; i <= SEG; i++) {
                const t = start + (i / SEG) * (end - start);
                const f = frameAt(t);
                const half = archHalf(t);
                for (let j = 0; j <= ARCH_COLS; j++) {
                    const a = Math.PI * (j / ARCH_COLS);     // 0..π around the vault
                    const lat = -Math.cos(a) * half;
                    const p = f.position.clone().add(f.binormal.clone().multiplyScalar(lat));
                    p.y = f.position.y + Math.sin(a) * CEIL_H;
                    verts.push(p.x, p.y, p.z);
                    uvs.push((j / ARCH_COLS) * 4, (i / SEG) * (end - start) * 60);
                }
            }
            for (let i = 0; i < SEG; i++) for (let j = 0; j < ARCH_COLS; j++) {
                const a = i * rowLen + j, b = a + 1, c = a + rowLen, d = c + 1;
                idx.push(a, c, b, b, c, d);
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
            g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            g.setIndex(idx); g.computeVertexNormals();
            scene.add(new THREE.Mesh(g, wallMat));

            // Portal headwall: vault profile straight up to the gorge rim, so
            // the mouth reads as a hole bored in a cliff face. Bottom corners
            // widened past the wall lean so no sky sliver shows.
            const buildPortal = (t: number): void => {
                const f = frameAt(t);
                const half = archHalf(t);
                const rimY = wallTopYAt(t);
                const pv: number[] = [], puv: number[] = [], pidx: number[] = [];
                for (let j = 0; j <= ARCH_COLS; j++) {
                    const a = Math.PI * (j / ARCH_COLS);
                    const inner = f.position.clone().add(f.binormal.clone().multiplyScalar(-Math.cos(a) * half));
                    inner.y = f.position.y + Math.sin(a) * CEIL_H;
                    const outer = f.position.clone().add(f.binormal.clone().multiplyScalar(-Math.cos(a) * (half + ZONED_LEAN + 12)));
                    outer.y = rimY;
                    pv.push(inner.x, inner.y, inner.z, outer.x, outer.y, outer.z);
                    puv.push(j / ARCH_COLS * 4, 0, j / ARCH_COLS * 4, 1);
                }
                for (let j = 0; j < ARCH_COLS; j++) { const a = j * 2, b = a + 1, c = a + 2, d = a + 3; pidx.push(a, c, b, b, c, d); }
                const pg = new THREE.BufferGeometry();
                pg.setAttribute('position', new THREE.Float32BufferAttribute(pv, 3));
                pg.setAttribute('uv', new THREE.Float32BufferAttribute(puv, 2));
                pg.setIndex(pidx); pg.computeVertexNormals();
                scene.add(new THREE.Mesh(pg, wallMat));
            };
            buildPortal(start);
            buildPortal(end);

            // Sparse warm marker lamps on the upper walls.
            const lampGeo = new THREE.SphereGeometry(2.0, 8, 6);
            const lampMat = new THREE.MeshBasicMaterial({ color: 0xffc887 });
            const nLamps = Math.max(4, Math.round((end - start) / 0.012));
            for (let i = 1; i < nLamps; i++) {
                const t = start + (i / nLamps) * (end - start);
                const f = frameAt(t);
                const half = archHalf(t);
                for (const a of [Math.PI * 0.22, Math.PI * 0.78]) {
                    const lamp = new THREE.Mesh(lampGeo, lampMat);
                    lamp.position.copy(f.position).add(f.binormal.clone().multiplyScalar(-Math.cos(a) * half * 0.96));
                    lamp.position.y = f.position.y + Math.sin(a) * CEIL_H - 1.5;
                    scene.add(lamp);
                }
            }
        }

        // --- Viaducts: deck slab + pillars down to the surface --------------
        const deckMat = new THREE.MeshStandardMaterial({ color: 0x4a3a26, roughness: 1.0, metalness: 0.0, flatShading: true, side: THREE.DoubleSide });
        // Clear-span: any sampled track point materially below a deck blocks
        // pillars near it (no columns dropped onto a road passing underneath).
        const roadPts: THREE.Vector3[] = [];
        for (let i = 0; i < 400; i++) roadPts.push(trackCurve.getPoint(i / 400));
        const nearLowerRoad = (x: number, z: number, deckY: number): boolean =>
            roadPts.some((p) => p.y < deckY - 40 && Math.hypot(p.x - x, p.z - z) < 160);
        for (const z of zones.filter((zz) => zz.mode === 'viaduct')) {
            const start = z.start, end = z.end;
            const SEG = Math.max(24, Math.ceil((end - start) * 1000));
            const dv: number[] = [], duv: number[] = [], didx: number[] = [];
            for (let i = 0; i <= SEG; i++) {
                const t = start + (i / SEG) * (end - start);
                const f = frameAt(t);
                const half = widthAt(profile, t) + CANYON_SHOULDER;
                const yU = f.position.y - DECK_THK;
                const L = f.position.clone().add(f.binormal.clone().multiplyScalar(-half));
                const R = f.position.clone().add(f.binormal.clone().multiplyScalar(half));
                dv.push(L.x, yU, L.z, R.x, yU, R.z);
                duv.push(0, i, 1, i);
            }
            for (let i = 0; i < SEG; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; didx.push(a, c, b, b, c, d); }
            const dg = new THREE.BufferGeometry();
            dg.setAttribute('position', new THREE.Float32BufferAttribute(dv, 3));
            dg.setAttribute('uv', new THREE.Float32BufferAttribute(duv, 2));
            dg.setIndex(didx); dg.computeVertexNormals();
            scene.add(new THREE.Mesh(dg, deckMat));

            const step = 0.012;
            for (let t = start + step; t < end - 1e-6; t += step) {
                const f = frameAt(t);
                const half = widthAt(profile, t) + CANYON_SHOULDER;
                const yTop = f.position.y - DECK_THK;
                const colH = yTop - surfaceY;
                if (colH < 30) continue;
                for (const s of [-0.6, 0.6]) {
                    const c = f.position.clone().add(f.binormal.clone().multiplyScalar(s * half));
                    if (nearLowerRoad(c.x, c.z, yTop)) continue;
                    const col = new THREE.Mesh(new THREE.BoxGeometry(16, colH, 16), deckMat);
                    col.position.set(c.x, surfaceY + colH / 2, c.z);
                    scene.add(col);
                }
            }
        }

        // --- Rock greebles: feet in the gutter, tops above the road edge ----
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
                let t = rr();
                for (let g = 0; g < 8 && modeAt(t) === 'viaduct'; g++) t = rr(); // no boulders on the deck
                const frame = frameAt(t);
                const tan = frame.tangent;
                const latX = tan.z, latZ = -tan.x;
                const latLen = Math.hypot(latX, latZ) || 1;
                const lx = latX / latLen, lz = latZ / latLen;
                const sign = rr() < 0.5 ? -1 : 1;
                const off = Math.max(8, wallOffset(t, sign) - (1 + rr() * 4));
                p.set(frame.position.x + lx * sign * off, frame.position.y - 1 + rr() * 2, frame.position.z + lz * sign * off);
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
            scene.add(rockMesh);
        }

        // --- Background buttes + hills: a band 2200–5000 off the corridor, --
        // clear of every track leg, sparse around full zones (you can't see out
        // of the canyon). Tall enough to clear the horizon from ROAD level.
        {
            const lineSamples: THREE.Vector3[] = [];
            for (let i = 0; i < 220; i++) lineSamples.push(trackCurve.getPoint(i / 220));
            const shades = [0x6b4a2c, 0x7a5634, 0x5e3c1f, 0x866241];
            const mats = shades.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1.0, metalness: 0.0, flatShading: true }));
            const placed: { x: number; z: number; r: number }[] = [];
            const br = makeRng(seed + 2.7);
            let attempts = 0;
            while (placed.length < 52 && attempts++ < 4000) {
                const t = br();
                if (zoneAt(t)?.mode === 'full' && br() < 0.8) continue; // sparse where unseen
                const f = frameAt(t);
                const side = br() < 0.5 ? -1 : 1;
                const dist = 2200 + br() * 2800;
                const x = f.position.x + f.binormal.x * side * dist;
                const z = f.position.z + f.binormal.z * side * dist;
                const r = 380 + br() * 520;
                if (lineSamples.some((sm) => Math.hypot(sm.x - x, sm.z - z) < r + 1500)) continue;
                if (placed.some((b) => Math.hypot(b.x - x, b.z - z) < (b.r + r) * 0.65)) continue;
                placed.push({ x, z, r });

                const mat = mats[(br() * mats.length) | 0];
                const kind = br(); // <0.2 tall mesa, <0.65 butte, else hill
                if (kind < 0.2) { // tall mesa — a landmark on the skyline
                    const h = 380 + br() * 320;
                    const geo = new THREE.CylinderGeometry(r * (0.3 + br() * 0.15), r * 0.85, h, 8, 1);
                    geo.translate(0, h / 2 - 15, 0);
                    const mm = new THREE.Mesh(geo, mat);
                    mm.position.set(x, surfaceY, z);
                    mm.rotation.y = br() * Math.PI;
                    scene.add(mm);
                    const h2 = h * (0.18 + br() * 0.15); // crown
                    const g2 = new THREE.CylinderGeometry(r * 0.16, r * 0.28, h2, 7, 1);
                    g2.translate((br() - 0.5) * r * 0.15, h - 15 + h2 / 2, (br() - 0.5) * r * 0.15);
                    const m2 = new THREE.Mesh(g2, mat);
                    m2.position.copy(mm.position);
                    m2.rotation.y = br() * Math.PI;
                    scene.add(m2);
                } else if (kind < 0.65) { // classic flat-topped butte
                    const h = 140 + br() * 240;
                    const geo = new THREE.CylinderGeometry(r * (0.45 + br() * 0.2), r, h, 8, 1);
                    geo.translate(0, h / 2 - 15, 0);
                    const mm = new THREE.Mesh(geo, mat);
                    mm.position.set(x, surfaceY, z);
                    mm.rotation.y = br() * Math.PI;
                    scene.add(mm);
                    if (br() < 0.5) { // stepped cap — classic mesa profile
                        const h2 = h * (0.3 + br() * 0.25);
                        const g2 = new THREE.CylinderGeometry(r * 0.3, r * 0.5, h2, 7, 1);
                        g2.translate((br() - 0.5) * r * 0.3, h - 15 + h2 / 2, (br() - 0.5) * r * 0.3);
                        const m2 = new THREE.Mesh(g2, mat);
                        m2.position.copy(mm.position);
                        m2.rotation.y = br() * Math.PI;
                        scene.add(m2);
                    }
                } else { // rounded hill — tall enough to read from road level
                    const mm = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat);
                    mm.scale.set(r * 1.2, 220 + br() * 160, r * 1.2);
                    mm.position.set(x, surfaceY - 12, z);
                    mm.rotation.y = br() * Math.PI;
                    scene.add(mm);
                }
            }
        }
    }

    // Drifting dust — a wind-blown haze of sand motes around the player.
    // Shared by the legacy and zoned builds.
    private setupDust(seed: number) {
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
        // (Zoned tracks have a STATIC ground — never moved, never re-offset.)
        if (!this.staticGround && this.ground && this.floorTex) {
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
