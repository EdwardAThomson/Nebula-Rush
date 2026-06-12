// Beggar's Gorge sandbox — prototyping track_7's NEW canyon features before the
// port to src:
//   1. Variable gorge width — the road bed, the rock walls, and the collision
//      clamp all narrow/widen together from a per-track widthProfile (TRACK_7).
//   2. A roofed TUNNEL section (rock vault + portal headwalls + a rock lid up at
//      the gorge rim, sparse marker lamps) over the pinched dive (TRACK_7.tunnels).
//   3. REAL ELEVATION over real ground — a static terrain apron carries the
//      road's relief (causeway shoulders, mesa massif around the tunnel, true
//      surface under the viaduct); the desert never moves with the player.
//
// Built on the confirmed Mesa Run flat-frame canyon: physics from the sandbox
// ./physics fork, the analytic lateral clamp at the real rock offset (no BVH),
// 19 AI sharing that clamp. Nothing in src/ is mutated (TRACK_7 is imported
// data; the geometry features are reproduced locally here, then ported).
//
// Run: with `npm run dev`, open http://localhost:5173/sandbox/gorge.html
// Controls: W/↑ thrust, B brake, A/D strafe, Q/E steer, Space/S hop, R reset, 1-4 time.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { TRACK_7, HAZARD_BLOCK_DEPTH, widthAt } from '../src/game/TrackDefinitions';
import type { BoostPad, Hazard } from '../src/game/TrackDefinitions';
import { createTrackCurve, getTrackFrame } from '../src/game/TrackFactory';
import { Ship } from '../src/game/Ship';
import { CanyonTerrain } from '../src/game/CanyonTerrain';
import { EnvironmentManager, type TimeOfDay } from '../src/game/EnvironmentManager';
import { SHIP_STATS } from '../src/game/ShipFactory';
import { updatePhysics } from './physics';

const TRACK = TRACK_7;
const hud = document.getElementById('hud')!;

// --- Renderer / scene / camera (mirrors Game.tsx) -------------------------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 6000);

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    logarithmicDepthBuffer: true,
    preserveDrawingBuffer: true,
});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

// --- Track ----------------------------------------------------------------
const trackCurve = createTrackCurve(TRACK.points);
const trackLength = trackCurve.getLength();
const PADS: BoostPad[] = TRACK.pads;
const HAZARDS: Hazard[] = TRACK.hazards ?? [];

// --- Width / wall geometry (the new shared math) --------------------------
// Per-t road half-width from the track's profile (default 60 with no profile).
const halfWidthAt = (t: number): number => widthAt(TRACK.widthProfile, t);

const TAU = Math.PI * 2;
const hashString = (s: string): number => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 0xffffffff;
};
const pnoise = (t: number, seed: number): number =>
    Math.sin(t * TAU * 3 + seed * 6.28) * 0.5 +
    Math.sin(t * TAU * 7 + seed * 14.1) * 0.3 +
    Math.sin(t * TAU * 13 + seed * 4.7) * 0.2;
// Seeded PRNG for object placement (rocks, buttes): the landscape is generated
// ONCE AND FOR ALL from the track id — identical on every load / time of day.
const mulberry32 = (seed: number) => (): number => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const SEED = hashString(TRACK.id);
const WALL_N = Math.max(240, Math.min(900, Math.floor(trackLength / 70)));
const WALL_SEG_LEN = trackLength / WALL_N;
const WALL_SHOULDER = 6;   // sand shoulder: walls sit this far outside the road edge
const WALL_OFF_VAR = 3;    // craggy in/out jitter
const SHIP_RADIUS = 8;     // ship half-width; rests this far short of the rock

// Inner-face offset of the wall on `side` (+1/−1) at t. Baseline now follows the
// per-t road half-width (+ shoulder), still capped on the inside of a bend so the
// offset line never folds across the track. Single source for the wall MESH, the
// rocks, and the collision clamp — the rock you see is the rock you hit.
function wallOffset(t: number, side: number): number {
    const tan = getTrackFrame(trackCurve, t).tangent;
    const tn = trackCurve.getTangent((t + 1 / WALL_N) % 1);
    const latX = tan.z, latZ = -tan.x;
    const latLen = Math.hypot(latX, latZ) || 1;
    const lx = latX / latLen, lz = latZ / latLen;
    let off = halfWidthAt(t) + WALL_SHOULDER + pnoise(t, SEED) * WALL_OFF_VAR;
    const ang = Math.atan2(tan.x * tn.z - tan.z * tn.x, tan.x * tn.x + tan.z * tn.z);
    const radius = Math.abs(ang) > 1e-4 ? WALL_SEG_LEN / Math.abs(ang) : 1e9;
    const innerness = (lx * side) * (tn.x - tan.x) + (lz * side) * (tn.z - tan.z);
    if (innerness > 0) off = Math.min(off, radius * 0.9);
    return Math.max(8, off);
}

// FLAT frame: level, horizontal binormal, world-up-ish normal, NO banking. Used
// for the road, ship, walls, and camera so lateral motion is truly horizontal
// and the vertical rock is reachable / hard.
const _UP = new THREE.Vector3(0, 1, 0);
function flatFrame(curve: THREE.Curve<THREE.Vector3>, t: number) {
    const position = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    const binormal = new THREE.Vector3().crossVectors(tangent, _UP);
    if (binormal.lengthSq() < 1e-6) binormal.set(1, 0, 0); else binormal.normalize();
    const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();
    const rotationMatrix = new THREE.Matrix4().makeBasis(binormal, normal, tangent.clone().negate());
    return { position, tangent, normal, binormal, rotationMatrix };
}

// --- Environment + dust (CanyonTerrain used ONLY for the drifting dust) ----
const TIME_KEY = 'gorgeSandboxTime';
const TIMES: TimeOfDay[] = ['morning', 'day', 'evening', 'night'];
const stored = localStorage.getItem(TIME_KEY) as TimeOfDay | null;
const timeOfDay: TimeOfDay = stored && TIMES.includes(stored) ? stored : 'day';
addEventListener('keydown', (e) => {
    const i = ['1', '2', '3', '4'].indexOf(e.key);
    if (i >= 0) { localStorage.setItem(TIME_KEY, TIMES[i]); location.reload(); }
});

const envManager = new EnvironmentManager(scene);
envManager.setup({ timeOfDay, weather: 'clear' }, trackCurve, TRACK.id);
renderer.toneMappingExposure = envManager.exposure;
// Drop glowglobes (point-light heavy) + time-based fog for the open desert.
(envManager.state?.globes ?? []).forEach((g) => { scene.remove(g.mesh); scene.remove(g.light); });
// Faint desert haze instead of the time-based fog: adds horizon depth and fades
// the distant buttes out before the camera far plane (6000) clips them — no
// pop-in. Near geometry is essentially unaffected (fog starts past the canyon).
const HAZE: Record<TimeOfDay, number> = { morning: 0xe6cfae, day: 0xbfdbe8, evening: 0xd99c6a, night: 0x0e1320 };
scene.fog = new THREE.Fog(HAZE[timeOfDay], 3200, 6000);

// CanyonTerrain builds floor + walls + rocks + dust. We want only its dust here
// (we build our own variable-width walls + rich floor + rocks), so hide every
// non-Points object it just added.
const canyon = new CanyonTerrain(scene);
const beforeCanyon = new Set(scene.children);
canyon.setup(trackCurve, TRACK.id);
scene.children.forEach((o) => { if (!beforeCanyon.has(o) && o.type !== 'Points') o.visible = false; });

// --- Rich sand ground (mottled albedo + dune/ripple normal) -----------------
// The ground is STATIC — it never moves with the player. Real relief comes from
// a terrain APRON built along the corridor (see buildWalls): causeway shoulders
// where the road runs high, a solid mesa massif around the tunnel, the true
// surface under the viaduct. A big flat plane at surface level takes over past
// the apron's outer edge. (An earlier version slid one flat plane vertically
// with the player; that made the real elevation read as a camera trick and
// sliced through any low ground seen from afar.)
const TEX_PERIOD = 333;     // world units per sand-texture tile (plane + apron)
const GROUND_DROP = 26;     // open-desert plateau sits this far below the road
const SHOULDER_DROP = 8;    // narrow gutter just outside the road edge
const roadYAt = (t: number) => flatFrame(trackCurve, t).position.y;
// True surface level — the desert under the crossing, the foot of the viaduct
// pillars, and the far field everywhere.
let _underSum = 0; for (let i = 0; i <= 40; i++) _underSum += roadYAt(0.70 + (i / 40) * 0.2);
const SURFACE_Y = _underSum / 41 - GROUND_DROP;

function createRichSandAlbedo(): THREE.Texture {
    const S = 256;
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#c2a878'; ctx.fillRect(0, 0, S, S);
    const tones = ['#b89a68', '#cdb487', '#a98e5e', '#d4be90', '#9c8154'];
    for (let i = 0; i < 70; i++) {
        const x = Math.random() * S, y = Math.random() * S, r = 16 + Math.random() * 70;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, tones[(Math.random() * tones.length) | 0]); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.18 + Math.random() * 0.22; ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 90; i++) {
        const y0 = Math.random() * S;
        ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(150,120,80,0.16)' : 'rgba(220,200,160,0.14)';
        ctx.lineWidth = 1 + Math.random(); ctx.beginPath();
        for (let x = 0; x <= S; x += 6) {
            const y = y0 + Math.sin(x * 0.06 + i) * 4 + Math.sin(x * 0.21) * 1.5;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
    for (let i = 0; i < 6000; i++) {
        const x = Math.random() * S, y = Math.random() * S, v = Math.random();
        ctx.fillStyle = v > 0.7 ? 'rgba(90,68,40,0.5)' : v > 0.4 ? 'rgba(210,190,150,0.4)' : 'rgba(150,120,80,0.3)';
        ctx.fillRect(x, y, v > 0.92 ? 2 : 1, v > 0.92 ? 2 : 1);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return tex;
}
function createSandNormal(): THREE.Texture {
    const S = 256;
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    const H = (x: number, y: number) =>
        Math.sin((x * 0.02 + y * 0.015)) * 1.6 +
        Math.sin(y * 0.07 + Math.sin(x * 0.05) * 2) * 0.7 +
        Math.sin(y * 0.20) * 0.5;
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
    return tex;
}
const sandAlbedo = createRichSandAlbedo();
const sandNormal = createSandNormal();
// World-anchored UVs (coords / TEX_PERIOD) — the plane and the relief apron
// sample one continuous sand pattern (texture repeat stays 1).
const FLOOR_SIZE = 90000;
let bbMinX = Infinity, bbMaxX = -Infinity, bbMinZ = Infinity, bbMaxZ = -Infinity;
for (let i = 0; i <= 200; i++) {
    const p = trackCurve.getPoint(i / 200);
    bbMinX = Math.min(bbMinX, p.x); bbMaxX = Math.max(bbMaxX, p.x);
    bbMinZ = Math.min(bbMinZ, p.z); bbMaxZ = Math.max(bbMaxZ, p.z);
}
const FLOOR_CX = (bbMinX + bbMaxX) / 2, FLOOR_CZ = (bbMinZ + bbMaxZ) / 2;
const richFloorMat = new THREE.MeshStandardMaterial({ map: sandAlbedo, normalMap: sandNormal, roughness: 1.0, metalness: 0.0, side: THREE.DoubleSide });
richFloorMat.normalScale.set(1.3, 1.3);
// The desert plane itself is built after the wall-zone config below — it needs
// the zone list to cut the canyon hole.

// --- Variable-width road bed + edge rails ----------------------------------
// A ribbon between two per-t lateral edges, on the flat frame, lifted slightly.
function ribbon(leftLat: (t: number) => number, rightLat: (t: number) => number, lift: number, material: THREE.Material): THREE.Mesh {
    const SEG = 1200;
    const verts: number[] = [], idx: number[] = [], uvs: number[] = [];
    for (let i = 0; i <= SEG; i++) {
        const t = i / SEG;
        const f = flatFrame(trackCurve, t);
        const up = f.normal.clone().multiplyScalar(lift);
        const L = f.position.clone().add(f.binormal.clone().multiplyScalar(leftLat(t))).add(up);
        const R = f.position.clone().add(f.binormal.clone().multiplyScalar(rightLat(t))).add(up);
        verts.push(L.x, L.y, L.z, R.x, R.y, R.z);
        uvs.push(0, t * 40, 1, t * 40);
    }
    for (let i = 0; i < SEG; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return new THREE.Mesh(g, material);
}

function createRoadTexture(): THREE.Texture {
    const S = 256;
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#5a4a2e'; ctx.fillRect(0, 0, S, S);
    const tones = ['#4e3f26', '#665231', '#574627', '#6e5a38', '#463922'];
    for (let i = 0; i < 55; i++) {
        const x = Math.random() * S, y = Math.random() * S, r = 14 + Math.random() * 55;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, tones[(Math.random() * tones.length) | 0]); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.2 + Math.random() * 0.25; ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 7000; i++) {
        const x = Math.random() * S, y = Math.random() * S, v = Math.random();
        ctx.fillStyle = v > 0.6 ? 'rgba(30,24,12,0.5)' : v > 0.3 ? 'rgba(150,124,80,0.35)' : 'rgba(90,72,44,0.4)';
        ctx.fillRect(x, y, v > 0.95 ? 2 : 1, v > 0.95 ? 2 : 1);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return tex;
}

const accent = TRACK.surface!.accent;
const road = new THREE.Group();
const roadBed = ribbon((t) => -halfWidthAt(t), (t) => halfWidthAt(t), 0.0,
    new THREE.MeshStandardMaterial({ map: createRoadTexture(), roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide }));
road.add(roadBed);
const railMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.2, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
road.add(ribbon((t) => -halfWidthAt(t), (t) => -(halfWidthAt(t) - 4), 0.4, railMat)); // left edge rail
road.add(ribbon((t) => halfWidthAt(t) - 4, (t) => halfWidthAt(t), 0.4, railMat));     // right edge rail
scene.add(road);

// --- Variable-width canyon walls (per-t mode, road-following) ---------------
// Bases hug the local ground (road − GROUND_DROP) so berms never float; the inner
// face = wallOffset (the same offset the collision uses). Sandstone texture:
function createSandstoneTexture(): THREE.CanvasTexture {
    const W = 128, H = 256;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#5e3c1f'; ctx.fillRect(0, 0, W, H);
    const bands = ['#4a2c15', '#6b4226', '#553318', '#744a2c', '#3e2410', '#623a20'];
    let y = 0;
    while (y < H) {
        const bh = 7 + Math.random() * 26;
        ctx.fillStyle = bands[(Math.random() * bands.length) | 0];
        ctx.globalAlpha = 0.3 + Math.random() * 0.45;
        ctx.fillRect(0, y, W, bh);
        y += bh;
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 2400; i++) {
        const x = Math.random() * W, yy = Math.random() * H;
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,240,210,0.10)' : 'rgba(55,38,18,0.13)';
        ctx.fillRect(x, yy, 1, 1);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

// Wall styling is per-t: `full` (tall craggy gorge), `berm` (low rocky bank, open
// desert), or `viaduct` (low parapet + deck + pillars at a crossover). Resolved
// from TRACK.canyon; collision (the lateral clamp) is unaffected by any of this.
type WallMode = 'full' | 'berm' | 'viaduct';
const H_VAR = 70, CRAG = 50, LEAN = 45;
// Parapet kept below the chase camera (road + 5) so you can see over the edge —
// containment is the analytic clamp, the lip is just a visual edge marker.
const DECK_THK = 14, PARAPET = 4;
const canyonCfg = TRACK.canyon;
const defMode: WallMode = canyonCfg?.wall?.mode ?? 'full';
const defHeight = canyonCfg?.wall?.height ?? (defMode === 'berm' ? 30 : 300);
const wallZones = canyonCfg?.zones ?? [];
const zoneAt = (t: number) => wallZones.find((z) => t >= z.start && t <= z.end);
const modeAt = (t: number): WallMode => (zoneAt(t)?.mode ?? defMode);
const heightOf = (t: number): number => {
    const z = zoneAt(t);
    if (z) return z.height ?? (z.mode === 'berm' ? 30 : z.mode === 'viaduct' ? PARAPET : 300);
    return defHeight;
};

// --- Desert plane with the CANYON HOLE --------------------------------------
// The flat desert lives at one fixed height forever. Where the road runs BELOW
// the surface (the sunken gorge + tunnel), the plane gets a real hole cut along
// the corridor — a solid plane would roof the canyon (the old drive-through
// "cream sheet"). The relief apron (buildWalls) owns the ground inside the hole
// and overlaps the cut edge.
const holeLatAt = (t: number, side: number): number => {
    const tan = trackCurve.getTangent(t).normalize();
    const tn = trackCurve.getTangent((t + 0.002) % 1).normalize();
    const ang = Math.atan2(tan.x * tn.z - tan.z * tn.x, tan.x * tn.x + tan.z * tn.z);
    const radius = Math.abs(ang) > 1e-4 ? (trackLength * 0.002) / Math.abs(ang) : 1e9;
    const bnx = -tan.z, bnz = tan.x; // binormal direction (matches the apron)
    const blen = Math.hypot(bnx, bnz) || 1;
    const innerness = (bnx / blen * side) * (tn.x - tan.x) + (bnz / blen * side) * (tn.z - tan.z);
    let lat = halfWidthAt(t) + WALL_SHOULDER + 12 + 800; // inside the apron's outer edge (880)
    if (innerness > 0) lat = Math.min(lat, radius * 0.8); // same fold guard as the apron
    return lat;
};
{
    const sq = FLOOR_SIZE / 2;
    const floorShape = new THREE.Shape([
        new THREE.Vector2(FLOOR_CX - sq, FLOOR_CZ - sq),
        new THREE.Vector2(FLOOR_CX + sq, FLOOR_CZ - sq),
        new THREE.Vector2(FLOOR_CX + sq, FLOOR_CZ + sq),
        new THREE.Vector2(FLOOR_CX - sq, FLOOR_CZ + sq),
    ]);
    const grade = SURFACE_Y + GROUND_DROP;
    for (const z of wallZones.filter((zz) => zz.mode === 'full')) {
        // Grow the hole past the zone until the road is back above grade.
        let h0 = z.start, h1 = z.end;
        while (h0 > 0.02 && roadYAt(h0) < grade + 8) h0 -= 0.005;
        while (h1 < 0.98 && roadYAt(h1) < grade + 8) h1 += 0.005;
        h0 -= 0.01; h1 += 0.01;
        const HOLE_N = 240;
        const pts: THREE.Vector2[] = [];
        for (let i = 0; i <= HOLE_N; i++) {
            const t = h0 + (i / HOLE_N) * (h1 - h0);
            const f = flatFrame(trackCurve, t);
            const p = f.position.clone().add(f.binormal.clone().multiplyScalar(holeLatAt(t, 1)));
            pts.push(new THREE.Vector2(p.x, p.z));
        }
        for (let i = HOLE_N; i >= 0; i--) {
            const t = h0 + (i / HOLE_N) * (h1 - h0);
            const f = flatFrame(trackCurve, t);
            const p = f.position.clone().add(f.binormal.clone().multiplyScalar(-holeLatAt(t, -1)));
            pts.push(new THREE.Vector2(p.x, p.z));
        }
        floorShape.holes.push(new THREE.Path(pts));
    }
    const richFloorGeo = new THREE.ShapeGeometry(floorShape, 1);
    // Shape XY → world XZ, with world-anchored UVs.
    const pos = richFloorGeo.attributes.position as THREE.BufferAttribute;
    const uv = richFloorGeo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), zc = pos.getY(i);
        pos.setXYZ(i, x, 0, zc);
        uv.setXY(i, x / TEX_PERIOD, zc / TEX_PERIOD);
    }
    richFloorGeo.computeVertexNormals();
    const richFloor = new THREE.Mesh(richFloorGeo, richFloorMat);
    // Slightly below the apron's outer edge (SURFACE_Y) so the two never z-fight.
    richFloor.position.set(0, SURFACE_Y - 0.6, 0);
    richFloor.renderOrder = -2;
    scene.add(richFloor);
}

const wallMat = new THREE.MeshStandardMaterial({
    map: createSandstoneTexture(), roughness: 1.0, metalness: 0.0, side: THREE.DoubleSide, flatShading: true,
});
const deckMat = new THREE.MeshStandardMaterial({ color: 0x4a3a26, roughness: 1.0, metalness: 0.0, flatShading: true, side: THREE.DoubleSide });

// Box-smooth a periodic array over ±W (softens mode transitions into ramps).
function smoothPeriodic(arr: number[], W: number): number[] {
    const n = arr.length, out = new Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let k = -W; k <= W; k++) s += arr[((i + k) % n + n) % n]; out[i] = s / (2 * W + 1); }
    return out;
}

// Wall-top height at t (world Y, set by buildWalls) — the gorge rim. Portal
// headwalls and the tunnel lid tie into this line.
let wallTopYAt: (t: number) => number = () => 0;

function buildWalls(): void {
    const M = WALL_N;
    // Per-i targets. Bases hug the local ground (road − GROUND_DROP) for berms;
    // full-gorge bases are buried deeper since the desert plane can sit below a
    // diving road; viaduct bases sit at the deck underside.
    //
    // Full-wall TOPS are the rim of a canyon SUNK INTO the plain: a fixed world
    // height just above the desert surface (zone `height` = rim above the
    // surface), NEVER road-relative and never raised to meet a high road. The
    // road sinks below grade; the rim stays put; the gorge deepens around you —
    // a real descent against the one honest reference (the flat desert). Crag
    // noise is applied AFTER smoothing so it isn't flattened.
    const roadYArr: number[] = [];
    for (let i = 0; i <= M; i++) roadYArr[i] = roadYAt(i / M);
    const zoneRimY = new Map<object, number>();
    for (const z of wallZones) {
        if (z.mode !== 'full') continue;
        zoneRimY.set(z, SURFACE_Y + (z.height ?? 80));
    }
    const baseT: number[] = [], topT: number[] = [], leanT: number[] = [], cragT: number[] = [];
    for (let i = 0; i <= M; i++) {
        const t = i / M;
        const ry = roadYArr[i];
        const mode = modeAt(t), h = heightOf(t);
        if (mode === 'full') {
            const z = zoneAt(t)!;
            const EDGE_RAMP = 0.004;
            const d = Math.min(1, Math.max(0, Math.min(t - z.start, z.end - t) / EDGE_RAMP));
            const ss = d * d * (3 - 2 * d); // 0 at the zone edge → 1 just inside
            const bermTop = ry + 30;
            baseT[i] = ry - GROUND_DROP - 240;
            topT[i] = bermTop + (zoneRimY.get(z)! - bermTop) * ss;
            leanT[i] = 6 + (LEAN - 6) * ss;
            cragT[i] = ss;
        } else if (mode === 'viaduct') {
            baseT[i] = ry - DECK_THK;
            topT[i] = ry + h;
            leanT[i] = 2;
            cragT[i] = 0;
        } else { // berm
            baseT[i] = ry - GROUND_DROP - 20;
            // Broken, dune-like lip: height undulates 35%..100% of h so long
            // stretches sit nearly flush with the road — open desert, not a wall.
            topT[i] = ry + h * (0.35 + 0.65 * Math.abs(pnoise(t, SEED + 0.77)));
            leanT[i] = 6;
            cragT[i] = 0;
        }
    }
    const baseS = smoothPeriodic(baseT, 6), leanS = smoothPeriodic(leanT, 6);
    const topW = smoothPeriodic(topT, 2), cragS = smoothPeriodic(cragT, 2);
    const topS = topW.map((y, i) =>
        y + cragS[i] * (((pnoise(i / M, SEED + 0.31) + 1) / 2) * H_VAR + Math.abs(pnoise(i / M, SEED + 0.77)) * CRAG));
    wallTopYAt = (t: number) => topS[Math.round((((t % 1) + 1) % 1) * M)];

    const wallTopLine: Record<number, THREE.Vector3[]> = { [-1]: [], [1]: [] };
    for (const side of [-1, 1]) {
        const verts: number[] = [], uvs: number[] = [], idx: number[] = [];
        for (let i = 0; i <= M; i++) {
            const t = i / M;
            const f = flatFrame(trackCurve, t);
            const tan = f.tangent;
            const latX = tan.z, latZ = -tan.x;
            const latLen = Math.hypot(latX, latZ) || 1;
            const lx = latX / latLen, lz = latZ / latLen;
            const off = wallOffset(t, side);
            const bx = f.position.x + lx * side * off;
            const bz = f.position.z + lz * side * off;
            const tx = bx + lx * side * leanS[i];
            const tz = bz + lz * side * leanS[i];
            verts.push(bx, baseS[i], bz);
            verts.push(tx, topS[i], tz);
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

    // Rock LID over each tunnel: span the gap between the two wall-top lines so
    // the tunnel runs through a solid massif (cliff above the vault) instead of
    // being a freestanding shell under open sky.
    for (const tn of (TRACK.tunnels ?? [])) {
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

    // --- Terrain relief APRON: the real, static ground along the corridor ---
    // Cross-section stations out from the centreline: a gutter strip just past
    // the road edge, the wall band rising to the rim, then flanks falling to
    // the surface plane at the outer edge. Heights per mode:
    //   full    → gutter / mesa rim / ~45° flanks down to the surface
    //   berm    → gutter / plateau GROUND_DROP below the road / gentle falloff
    //   viaduct → tucked just under the surface plane (the bridge spans it)
    // Station heights are smoothed along t so mode changes roll, not step.
    const ST_LAT = [0, 0, 70, 320, 560, 880]; // added past wIn (station 0 = centreline)
    const NST = ST_LAT.length;
    const H: number[][] = Array.from({ length: NST }, () => []);
    for (let i = 0; i <= M; i++) {
        const t = i / M;
        const ry = roadYArr[i];
        const mode = modeAt(t);
        const S = SURFACE_Y;
        let hs: number[];
        if (mode === 'viaduct') {
            hs = [S - 1.2, S - 1.2, S - 1.2, S - 1.2, S - 1.2, S];
        } else if (mode === 'full') {
            const gut = ry - SHOULDER_DROP, rim = topS[i];
            hs = [gut, gut, rim, rim + (S - rim) * 0.45, rim + (S - rim) * 0.85, S];
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
        const f = flatFrame(trackCurve, t);
        const tan = f.tangent;
        const tn = trackCurve.getTangent((t + 1 / M) % 1);
        const ang = Math.atan2(tan.x * tn.z - tan.z * tn.x, tan.x * tn.x + tan.z * tn.z);
        const radius = Math.abs(ang) > 1e-4 ? WALL_SEG_LEN / Math.abs(ang) : 1e9;
        // Vertices are placed along the BINORMAL (= −latX, −latZ of wallOffset),
        // so innerness must use the binormal direction too.
        const bnx = -tan.z, bnz = tan.x;
        const blen = Math.hypot(bnx, bnz) || 1;
        const wIn = halfWidthAt(t) + WALL_SHOULDER + 12;
        for (let c = 0; c < cols; c++) {
            const s = Math.abs(c - (NST - 1));
            const side = Math.sign(c - (NST - 1));
            let lat = s === 0 ? 0 : wIn + ST_LAT[s];
            // Cap the lateral reach on the inside of bends so the apron can't
            // fold back across itself (same trick as wallOffset).
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
    scene.add(new THREE.Mesh(ag, richFloorMat));
}
buildWalls();

// --- Viaduct decks + pillars (bridge spans where the loop crosses itself) ----
// Sample the lower lane (the return strand near the crossing) so pillars keep a
// CLEAR SPAN over it — no columns dropped onto the road passing underneath.
const lowerLanePts: THREE.Vector3[] = [];
for (let i = 0; i <= 80; i++) lowerLanePts.push(trackCurve.getPoint(0.70 + (i / 80) * 0.20));
const nearLowerLane = (x: number, z: number, r: number): boolean =>
    lowerLanePts.some((p) => Math.hypot(p.x - x, p.z - z) < r);

function buildViaduct(start: number, end: number): void {
    const SEG = Math.max(24, Math.ceil((end - start) * 1000));
    // Deck underside slab spanning the road, giving the bridge thickness (the
    // parapet wall above covers the fascia between road edge and underside).
    const dv: number[] = [], didx: number[] = [], duv: number[] = [];
    for (let i = 0; i <= SEG; i++) {
        const t = start + (i / SEG) * (end - start);
        const f = flatFrame(trackCurve, t);
        const half = halfWidthAt(t) + WALL_SHOULDER;
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

    // Paired pillars down to the surface, skipped where they'd hit the lower lane.
    const step = 0.012;
    for (let t = start + step; t < end - 1e-6; t += step) {
        const f = flatFrame(trackCurve, t);
        const half = halfWidthAt(t) + WALL_SHOULDER;
        const yTop = f.position.y - DECK_THK;
        const colH = yTop - SURFACE_Y;
        if (colH < 30) continue;
        for (const s of [-0.6, 0.6]) {
            const c = f.position.clone().add(f.binormal.clone().multiplyScalar(s * half));
            if (nearLowerLane(c.x, c.z, 160)) continue;
            const col = new THREE.Mesh(new THREE.BoxGeometry(16, colH, 16), deckMat);
            col.position.set(c.x, SURFACE_Y + colH / 2, c.z);
            scene.add(col);
        }
    }
}
wallZones.filter((z) => z.mode === 'viaduct').forEach((z) => buildViaduct(z.start, z.end));

// --- TUNNEL: a vaulted rock arch over a t-range ----------------------------
// A semicircular barrel vault whose feet spring from the wall faces at road
// level, so the sides are CLOSED (road floor + arch = an enclosed tube). The
// peak is a modest height above the road. Each mouth gets a PORTAL headwall
// (vault profile up to the gorge rim) so the entrance reads as a hole bored in
// a cliff face; the rim lid (buildWalls) closes the run in between. Sparse
// marker lamps along the walls. Cosmetic — the lateral clamp still contains you.
const CEIL_H = 50;        // arch peak height above the road
const ARCH_COLS = 12;     // cross-section resolution
// Springing half-width: spring at (or just outside) the wall face so the arch
// foot overlaps the rock and never leaves a side gap.
const archHalf = (t: number) => halfWidthAt(t) + WALL_SHOULDER + WALL_OFF_VAR + 2;
function buildTunnel(start: number, end: number): void {
    const SEG = Math.max(40, Math.ceil((end - start) * 1400));
    const verts: number[] = [], uvs: number[] = [], idx: number[] = [];
    const rowLen = ARCH_COLS + 1;
    for (let i = 0; i <= SEG; i++) {
        const t = start + (i / SEG) * (end - start);
        const f = flatFrame(trackCurve, t);
        const half = archHalf(t);
        for (let j = 0; j <= ARCH_COLS; j++) {
            const a = Math.PI * (j / ARCH_COLS);       // 0..π around the vault
            const lat = -Math.cos(a) * half;           // −half..+half
            const p = f.position.clone().add(f.binormal.clone().multiplyScalar(lat));
            p.y = f.position.y + Math.sin(a) * CEIL_H;  // 0 at the feet, CEIL_H at the crown
            verts.push(p.x, p.y, p.z);
            uvs.push((j / ARCH_COLS) * 4, (i / SEG) * (end - start) * 60);
        }
    }
    for (let i = 0; i < SEG; i++) {
        for (let j = 0; j < ARCH_COLS; j++) {
            const a = i * rowLen + j, b = a + 1, c = a + rowLen, d = c + 1;
            idx.push(a, c, b, b, c, d);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, wallMat));

    // Portal headwall: a curtain from the vault profile straight up to the gorge
    // rim, closing the face above/beside the mouth. Bottom corners are widened
    // past the wall lean so no sliver of sky shows where the walls tip outward.
    const buildPortal = (t: number): void => {
        const f = flatFrame(trackCurve, t);
        const half = archHalf(t);
        const rimY = wallTopYAt(t);
        const pv: number[] = [], puv: number[] = [], pidx: number[] = [];
        for (let j = 0; j <= ARCH_COLS; j++) {
            const a = Math.PI * (j / ARCH_COLS);
            const inner = f.position.clone().add(f.binormal.clone().multiplyScalar(-Math.cos(a) * half));
            inner.y = f.position.y + Math.sin(a) * CEIL_H;
            const outer = f.position.clone().add(f.binormal.clone().multiplyScalar(-Math.cos(a) * (half + LEAN + 12)));
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

    // Sparse warm marker lamps on the upper walls (replaces the old roof bars).
    const lampGeo = new THREE.SphereGeometry(2.0, 8, 6);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffc887 });
    const nLamps = Math.max(4, Math.round((end - start) / 0.012));
    for (let i = 1; i < nLamps; i++) {
        const t = start + (i / nLamps) * (end - start);
        const f = flatFrame(trackCurve, t);
        const half = archHalf(t);
        for (const a of [Math.PI * 0.22, Math.PI * 0.78]) {
            const lamp = new THREE.Mesh(lampGeo, lampMat);
            lamp.position.copy(f.position).add(f.binormal.clone().multiplyScalar(-Math.cos(a) * half * 0.96));
            lamp.position.y = f.position.y + Math.sin(a) * CEIL_H - 1.5;
            scene.add(lamp);
        }
    }
}
(TRACK.tunnels ?? []).forEach((tn) => buildTunnel(tn.start, tn.end));

// --- Decals: boost pads / hazards / start line (flat frame) ----------------
function makeBoostArrowTexture(): THREE.Texture {
    const S = 64;
    const canvas = document.createElement('canvas'); canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#001515'; ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = '#bbffff'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(8, 46); ctx.lineTo(S / 2, 20); ctx.lineTo(S - 8, 46); ctx.stroke();
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}
function makeCheckerTexture(): THREE.Texture {
    const S = 64, c = S / 2;
    const canvas = document.createElement('canvas'); canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext('2d')!;
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        ctx.fillStyle = ((x + y) % 2 === 0) ? '#f5f5f5' : '#141414';
        ctx.fillRect(x * c, y * c, c, c);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    return tex;
}
function flatBoostPads(pads: BoostPad[]): THREE.Mesh[] {
    const arrowTex = makeBoostArrowTexture();
    const material = new THREE.MeshBasicMaterial({
        map: arrowTex, color: 0xffffff, side: THREE.DoubleSide,
        transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    return pads.map((pad) => {
        const geometry = new THREE.BufferGeometry();
        const vertices: number[] = [], uvs: number[] = [];
        const segments = Math.max(20, Math.ceil(pad.length * 2000));
        const startT = pad.trackProgress - pad.length / 2, endT = pad.trackProgress + pad.length / 2;
        const width = pad.width, arrowsPerPad = 6;
        for (let i = 0; i <= segments; i++) {
            let t = startT + (i / segments) * (endT - startT);
            if (t < 0) t += 1; if (t > 1) t -= 1;
            const { position, normal, binormal } = flatFrame(trackCurve, t);
            const lift = normal.clone().multiplyScalar(0.9);
            const left = position.clone().add(binormal.clone().multiplyScalar(pad.lateralPosition - width / 2)).add(lift);
            const right = position.clone().add(binormal.clone().multiplyScalar(pad.lateralPosition + width / 2)).add(lift);
            vertices.push(left.x, left.y, left.z, right.x, right.y, right.z);
            const v = (i / segments) * arrowsPerPad; uvs.push(0, v, 1, v);
        }
        const indices: number[] = [];
        for (let i = 0; i < segments; i++) { const b = i * 2; indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices); geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.onBeforeRender = () => { arrowTex.offset.y = -(performance.now() * 0.0006) % 1; };
        return mesh;
    });
}
function flatHazards(hazards: Hazard[]): THREE.Object3D[] {
    return hazards.map((h) => {
        if (h.type === 'slick') {
            const geometry = new THREE.BufferGeometry();
            const vertices: number[] = [];
            const segments = Math.max(16, Math.ceil(h.length * 2000));
            const startT = h.trackProgress - h.length / 2, endT = h.trackProgress + h.length / 2;
            for (let i = 0; i <= segments; i++) {
                let t = startT + (i / segments) * (endT - startT);
                if (t < 0) t += 1; if (t > 1) t -= 1;
                const f = flatFrame(trackCurve, t);
                const lift = f.normal.clone().multiplyScalar(0.4);
                const left = f.position.clone().add(f.binormal.clone().multiplyScalar(h.lateralPosition - h.width / 2)).add(lift);
                const right = f.position.clone().add(f.binormal.clone().multiplyScalar(h.lateralPosition + h.width / 2)).add(lift);
                vertices.push(left.x, left.y, left.z, right.x, right.y, right.z);
            }
            const indices: number[] = [];
            for (let i = 0; i < segments; i++) { const a = i * 2, b = a + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1; indices.push(a, b, c, b, d, c); }
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setIndex(indices); geometry.computeVertexNormals();
            const material = new THREE.MeshStandardMaterial({
                color: 0xff3b3b, emissive: 0xaa1111, emissiveIntensity: 0.5,
                transparent: true, opacity: 0.45, roughness: 0.15, metalness: 0.0,
                side: THREE.DoubleSide, depthWrite: false,
            });
            return new THREE.Mesh(geometry, material);
        }
        const blockHeight = 8, blockDepth = HAZARD_BLOCK_DEPTH;
        const f = flatFrame(trackCurve, h.trackProgress);
        const box = new THREE.Mesh(
            new THREE.BoxGeometry(h.width, blockHeight, blockDepth),
            new THREE.MeshStandardMaterial({ color: 0x6e4a2c, emissive: 0x1c0f05, emissiveIntensity: 0.3, roughness: 0.95, metalness: 0.0, flatShading: true }),
        );
        box.position.copy(f.position)
            .add(f.binormal.clone().multiplyScalar(h.lateralPosition))
            .add(f.normal.clone().multiplyScalar(blockHeight / 2));
        box.quaternion.setFromRotationMatrix(f.rotationMatrix);
        return box;
    });
}
function flatStartLine(): THREE.Mesh {
    const width = 140, length = 0.006;
    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [], uvs: number[] = [];
    const segments = 10, startT = -length / 2, endT = length / 2;
    const checksAcross = 5, rowsAlong = 2;
    for (let i = 0; i <= segments; i++) {
        let t = startT + (i / segments) * (endT - startT);
        if (t < 0) t += 1; if (t > 1) t -= 1;
        const { position, normal, binormal } = flatFrame(trackCurve, t);
        const lift = normal.clone().multiplyScalar(0.1);
        const left = position.clone().add(binormal.clone().multiplyScalar(-width / 2)).add(lift);
        const right = position.clone().add(binormal.clone().multiplyScalar(width / 2)).add(lift);
        vertices.push(left.x, left.y, left.z, right.x, right.y, right.z);
        const v = (i / segments) * rowsAlong; uvs.push(0, v, checksAcross, v);
    }
    const indices: number[] = [];
    for (let i = 0; i < segments; i++) { const b = i * 2; indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: makeCheckerTexture(), side: THREE.DoubleSide }));
}
flatBoostPads(PADS).forEach((m) => scene.add(m));
flatHazards(HAZARDS).forEach((o) => scene.add(o));
scene.add(flatStartLine());

// --- Decorative rocks nestled against the (variable-width) wall bases -------
function buildRocks(count: number): THREE.InstancedMesh {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const pos = new THREE.Vector3(), scl = new THREE.Vector3(), col = new THREE.Color();
    const shades = [0x6b4a2c, 0x7a5634, 0x5e3c1f, 0x866241, 0x4a2c15];
    const rand = mulberry32((SEED * 2 ** 31) | 0);
    for (let i = 0; i < count; i++) {
        let t = rand();
        for (let g = 0; g < 8 && modeAt(t) === 'viaduct'; g++) t = rand(); // no boulders on the bridge deck
        const f = flatFrame(trackCurve, t);
        const sign = rand() < 0.5 ? -1 : 1;
        const wallOff = wallOffset(t, -sign);
        const off = Math.max(8, wallOff - (1 + rand() * 4));
        pos.copy(f.position).add(f.binormal.clone().multiplyScalar(sign * off));
        pos.y = f.position.y - 1 + rand() * 2; // feet in the gutter, tops above the road edge
        e.set((rand() - 0.5) * 0.5, rand() * Math.PI * 2, (rand() - 0.5) * 0.5);
        q.setFromEuler(e);
        scl.set(1.5 + rand() * 3.5, 1.2 + rand() * 2.8, 1.5 + rand() * 3.5);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(i, m);
        col.setHex(shades[(rand() * shades.length) | 0]);
        mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
}
scene.add(buildRocks(700));

// --- Background buttes + hills ----------------------------------------------
// Flat-topped mesas and low rounded hills scattered in a band beyond the apron
// (2200–4500 from the centreline), kept clear of every track leg so they never
// crowd the road or sit in the canyon. They stand on the true surface; the haze
// fades them in/out at distance. Pure dressing — no collision.
function buildButtes(): void {
    const lineSamples: THREE.Vector3[] = [];
    for (let i = 0; i < 220; i++) lineSamples.push(trackCurve.getPoint(i / 220));
    const shades = [0x6b4a2c, 0x7a5634, 0x5e3c1f, 0x866241];
    const mats = shades.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1.0, metalness: 0.0, flatShading: true }));
    const placed: { x: number; z: number; r: number }[] = [];
    const rand = mulberry32(((SEED * 2 ** 31) | 0) ^ 0x9e3779b9);
    let attempts = 0;
    while (placed.length < 52 && attempts++ < 4000) {
        const t = rand();
        // Sparse around the canyon/tunnel stretch — you can't see out from in
        // there, so spend the silhouettes where they're actually visible.
        if (t > 0.16 && t < 0.46 && rand() < 0.8) continue;
        const f = flatFrame(trackCurve, t);
        const side = rand() < 0.5 ? -1 : 1;
        const dist = 2200 + rand() * 2800;
        const x = f.position.x + f.binormal.x * side * dist;
        const z = f.position.z + f.binormal.z * side * dist;
        const r = 380 + rand() * 520;
        if (lineSamples.some((s) => Math.hypot(s.x - x, s.z - z) < r + 1500)) continue; // clear of ALL legs
        if (placed.some((b) => Math.hypot(b.x - x, b.z - z) < (b.r + r) * 0.65)) continue;
        placed.push({ x, z, r });

        const mat = mats[(rand() * mats.length) | 0];
        const kind = rand(); // <0.2 tall mesa, <0.65 butte, else low hill
        if (kind < 0.2) { // tall mesa — a proper landmark on the skyline
            const h = 380 + rand() * 320;
            const geo = new THREE.CylinderGeometry(r * (0.3 + rand() * 0.15), r * 0.85, h, 8, 1);
            geo.translate(0, h / 2 - 15, 0);
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x, SURFACE_Y, z);
            m.rotation.y = rand() * Math.PI;
            scene.add(m);
            const h2 = h * (0.18 + rand() * 0.15); // crown
            const g2 = new THREE.CylinderGeometry(r * 0.16, r * 0.28, h2, 7, 1);
            g2.translate((rand() - 0.5) * r * 0.15, h - 15 + h2 / 2, (rand() - 0.5) * r * 0.15);
            const m2 = new THREE.Mesh(g2, mat);
            m2.position.copy(m.position);
            m2.rotation.y = rand() * Math.PI;
            scene.add(m2);
        } else if (kind < 0.65) { // classic flat-topped butte
            const h = 140 + rand() * 240;
            const geo = new THREE.CylinderGeometry(r * (0.45 + rand() * 0.2), r, h, 8, 1);
            geo.translate(0, h / 2 - 15, 0); // base sunk into the sand
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x, SURFACE_Y, z);
            m.rotation.y = rand() * Math.PI;
            scene.add(m);
            if (rand() < 0.5) { // stepped cap — classic mesa profile
                const h2 = h * (0.3 + rand() * 0.25);
                const g2 = new THREE.CylinderGeometry(r * 0.3, r * 0.5, h2, 7, 1);
                g2.translate((rand() - 0.5) * r * 0.3, h - 15 + h2 / 2, (rand() - 0.5) * r * 0.3);
                const m2 = new THREE.Mesh(g2, mat);
                m2.position.copy(m.position);
                m2.rotation.y = rand() * Math.PI;
                scene.add(m2);
            }
        } else { // rounded hill — tall enough to clear the horizon from ROAD level
            // (eye height on the road is only ~35 above the plain; at 2-5k away
            // anything under ~200 high vanishes below the horizon + haze)
            const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat);
            m.scale.set(r * 1.2, 220 + rand() * 160, r * 1.2);
            m.position.set(x, SURFACE_Y - 12, z);
            m.rotation.y = rand() * Math.PI;
            scene.add(m);
        }
    }
}
buildButtes();

// --- Player ship -----------------------------------------------------------
const shipConfig = { ...SHIP_STATS.fighter, color: 0xcc0000, type: 'fighter' as const };
let player = new Ship(scene, true, shipConfig);

const keysDown: Record<string, boolean> = {};
addEventListener('keydown', (e) => { keysDown[e.key] = true; });
addEventListener('keyup', (e) => { keysDown[e.key] = false; });
const input = {
    isKeyPressed(k: string): boolean {
        if (keysDown[k]) return true;
        return k.length === 1 ? !!keysDown[k.toLowerCase()] || !!keysDown[k.toUpperCase()] : false;
    },
};
function reset() { player.dispose(scene); player = new Ship(scene, true, shipConfig); }
addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'r') reset(); });

// --- Shared hard-wall lateral clamp (player AND AI) ------------------------
let nearWall = false;
function clampLateral(state: { trackProgress: number; lateralPosition: number; velocity: THREE.Vector2 }): boolean {
    const t = state.trackProgress;
    const leftLimit = -(wallOffset(t, 1) - SHIP_RADIUS);
    const rightLimit = wallOffset(t, -1) - SHIP_RADIUS;
    if (state.lateralPosition < leftLimit) { state.lateralPosition = leftLimit; if (state.velocity.x < 0) state.velocity.x = 0; return true; }
    if (state.lateralPosition > rightLimit) { state.lateralPosition = rightLimit; if (state.velocity.x > 0) state.velocity.x = 0; return true; }
    return false;
}
function placeFlat(ship: Ship): void {
    const f = flatFrame(trackCurve, ship.state.trackProgress);
    ship.mesh.position.copy(f.position)
        .add(f.binormal.clone().multiplyScalar(ship.state.lateralPosition))
        .add(f.normal.clone().multiplyScalar(ship.state.verticalPosition));
    ship.mesh.quaternion.setFromRotationMatrix(f.rotationMatrix);
    ship.mesh.rotateZ(-ship.state.rotation);
    ship.mesh.rotateY(ship.state.yaw);
}

// --- AI opponents (flat frame + shared clamp + gorge-aware target lane) -----
const AI_COLORS = [0x00cc00, 0x0000cc, 0xcccc00, 0xcc00cc, 0x00cccc, 0xff8800];
const AI_TYPES = ['fighter', 'speedster', 'tank', 'interceptor', 'corsair'] as const;
interface AICar { ship: Ship; keys: Record<string, boolean>; controller: { isKeyPressed(k: string): boolean }; baseLane: number; }
const aiCars: AICar[] = [];
for (let i = 0; i < 19; i++) {
    const type = AI_TYPES[i % AI_TYPES.length];
    const ship = new Ship(scene, false, { ...SHIP_STATS[type], color: AI_COLORS[i % AI_COLORS.length], type });
    const row = Math.floor(i / 2) + 1;
    const col = i % 2;
    ship.state.trackProgress = (0.93 + row * 0.002) % 1;
    ship.state.lateralPosition = (col === 0 ? -1 : 1) * 15;
    const keys: Record<string, boolean> = {};
    aiCars.push({ ship, keys, controller: { isKeyPressed: (k) => !!keys[k] }, baseLane: (Math.random() - 0.5) * 60 });
}
function updateAI(dt: number): void {
    for (const car of aiCars) {
        const t = car.ship.state.trackProgress;
        const leftLim = -(wallOffset(t, 1) - SHIP_RADIUS - 4);
        const rightLim = wallOffset(t, -1) - SHIP_RADIUS - 4;
        const target = Math.max(leftLim, Math.min(rightLim, car.baseLane));
        const err = car.ship.state.lateralPosition - target;
        const k = car.keys;
        for (const key of Object.keys(k)) k[key] = false;
        k['w'] = true;
        if (err > 1) k['a'] = true; else if (err < -1) k['d'] = true;
        updatePhysics(car.ship.state, car.controller, trackLength, PADS, dt, undefined, true, HAZARDS);
        clampLateral(car.ship.state);
        placeFlat(car.ship);
    }
}
aiCars.forEach((c) => placeFlat(c.ship));

// --- Minimap (2D top-down overlay) -----------------------------------------
// Projects the track centreline (world x,z) into a fixed top-down canvas, with
// the tunnel stretch highlighted, the start line, AI dots, and the player.
const mm = document.getElementById('minimap') as HTMLCanvasElement;
const mctx = mm.getContext('2d')!;
const MM_W = mm.width, MM_H = mm.height, MM_PAD = 16;
const mmPath: THREE.Vector3[] = [];
for (let i = 0; i <= 400; i++) mmPath.push(trackCurve.getPoint(i / 400));
let mmMinX = Infinity, mmMaxX = -Infinity, mmMinZ = Infinity, mmMaxZ = -Infinity;
for (const p of mmPath) {
    if (p.x < mmMinX) mmMinX = p.x; if (p.x > mmMaxX) mmMaxX = p.x;
    if (p.z < mmMinZ) mmMinZ = p.z; if (p.z > mmMaxZ) mmMaxZ = p.z;
}
const mmSpan = Math.max(mmMaxX - mmMinX, mmMaxZ - mmMinZ) || 1;
const mmScale = (Math.min(MM_W, MM_H) - 2 * MM_PAD) / mmSpan;
const mmCX = (mmMinX + mmMaxX) / 2, mmCZ = (mmMinZ + mmMaxZ) / 2;
const mmXY = (x: number, z: number): [number, number] => [MM_W / 2 + (x - mmCX) * mmScale, MM_H / 2 + (z - mmCZ) * mmScale];
function drawMinimap(): void {
    mctx.clearRect(0, 0, MM_W, MM_H);
    // Track centreline.
    mctx.lineWidth = 3; mctx.lineJoin = 'round'; mctx.strokeStyle = '#8a6a3a';
    mctx.beginPath();
    mmPath.forEach((p, i) => { const [x, y] = mmXY(p.x, p.z); if (i) mctx.lineTo(x, y); else mctx.moveTo(x, y); });
    mctx.stroke();
    // Tunnel stretch (amber).
    mctx.strokeStyle = '#ffd9a0';
    for (const tn of (TRACK.tunnels ?? [])) {
        const i0 = Math.floor(tn.start * 400), i1 = Math.ceil(tn.end * 400);
        mctx.beginPath();
        for (let i = i0; i <= i1; i++) { const p = mmPath[i % mmPath.length]; const [x, y] = mmXY(p.x, p.z); if (i === i0) mctx.moveTo(x, y); else mctx.lineTo(x, y); }
        mctx.stroke();
    }
    // Start line (white).
    const [sx, sy] = mmXY(mmPath[0].x, mmPath[0].z);
    mctx.fillStyle = '#ffffff'; mctx.beginPath(); mctx.arc(sx, sy, 3, 0, Math.PI * 2); mctx.fill();
    // AI dots.
    mctx.fillStyle = '#66ccff';
    for (const c of aiCars) { const [x, y] = mmXY(c.ship.mesh.position.x, c.ship.mesh.position.z); mctx.beginPath(); mctx.arc(x, y, 2, 0, Math.PI * 2); mctx.fill(); }
    // Player (red).
    const [px, py] = mmXY(player.mesh.position.x, player.mesh.position.z);
    mctx.fillStyle = '#ff3b3b'; mctx.beginPath(); mctx.arc(px, py, 4, 0, Math.PI * 2); mctx.fill();
}

// --- Main loop -------------------------------------------------------------
let lastTime = performance.now();
renderer.setAnimationLoop(() => {
    const now = performance.now();
    const deltaMs = now - lastTime;
    lastTime = now;
    const dt = Math.min(deltaMs / 16.67, 1.0);

    const state = player.state;
    updatePhysics(state, input, trackLength, PADS, dt, undefined, true, HAZARDS);
    nearWall = clampLateral(state);
    placeFlat(player);
    updateAI(dt);

    // Chase camera (flat frame → level horizon).
    const { position: trackPos, tangent, normal, binormal: trackBinormal } = flatFrame(trackCurve, state.trackProgress);
    const visualLateralPos = state.cameraLateral;
    const CAMERA_YAW_FOLLOW = 0.5;
    const cameraForward = tangent.clone().applyAxisAngle(normal, state.yaw * CAMERA_YAW_FOLLOW).normalize();
    const targetCameraPos = trackPos.clone()
        .add(trackBinormal.clone().multiplyScalar(visualLateralPos))
        .add(normal.clone().multiplyScalar(5))
        .add(cameraForward.clone().multiplyScalar(-12));
    if (!isNaN(targetCameraPos.x) && !isNaN(targetCameraPos.y) && !isNaN(targetCameraPos.z)) {
        camera.position.copy(targetCameraPos);
        camera.lookAt(player.mesh.position.clone().add(cameraForward.clone().multiplyScalar(20)));
        camera.up.copy(normal);
    }

    envManager.update(dt, player.mesh.position);
    canyon.update(player.mesh.position); // drives the drifting dust

    const p = player.mesh.position;
    const t = state.trackProgress;
    hud.innerHTML =
        `<b>Beggar's Gorge sandbox</b>  (track_7)\n` +
        `speed    ${Math.round(state.velocity.y * 10)} km/h\n` +
        `progress ${(t * 100).toFixed(1)}%\n` +
        `pos      x ${p.x.toFixed(0)}  y ${p.y.toFixed(0)}  z ${p.z.toFixed(0)}\n` +
        `lateral  ${state.lateralPosition.toFixed(1)}\n` +
        `half-w   ${halfWidthAt(t).toFixed(1)}   walls L/R ${(-wallOffset(t, 1)).toFixed(0)}/${wallOffset(t, -1).toFixed(0)}\n` +
        `wall     ${nearWall ? 'CONTACT' : '—'}\n` +
        `ai       ${aiCars.length} opponents\n` +
        `time     ${timeOfDay}\n` +
        `\nW/↑ thrust   B brake   A/D strafe   Q/E steer   Space hop   R reset   1-4 time`;

    drawMinimap();
    renderer.render(scene, camera);
});

addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});
