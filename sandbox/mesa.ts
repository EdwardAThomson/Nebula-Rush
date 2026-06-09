// Mesa Run sandbox — PHASE 2: hard canyon walls, current feel preserved.
//
// Built on the confirmed Phase-1 baseline (faithful replica of the on-rails
// game). The ONLY change from Phase 1:
//   - physics comes from the sandbox-forked ./physics (identical to the live
//     engine minus the fake ±60 lateral wall), and
//   - each frame the ship's lateral position is corrected by a REAL sphere-vs-
//     BVH collision against the canyon rock — so the cream sandstone walls are
//     genuinely solid (you stop and slide along them; no pass-through).
//
// Forward motion / laps / boost / hazards / banking / camera are unchanged, so
// it should feel identical to before except the walls are now hard. Nothing in
// src/ is touched.
//
// Run: with `npm run dev`, open http://localhost:5173/sandbox/mesa.html
// Controls: W/↑ thrust, A/D strafe, Q/E steer, Space/S hop, R reset.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';

import { TRACK_6, HAZARD_BLOCK_DEPTH } from '../src/game/TrackDefinitions';
import type { BoostPad, Hazard } from '../src/game/TrackDefinitions';
import { createTrackCurve, getTrackFrame } from '../src/game/TrackFactory';
import { Ship } from '../src/game/Ship';
import { CanyonTerrain } from '../src/game/CanyonTerrain';
import { EnvironmentManager, type TimeOfDay } from '../src/game/EnvironmentManager';
import { SHIP_STATS } from '../src/game/ShipFactory';
import { updatePhysics } from './physics';

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

// --- Track + world (real game builders) -----------------------------------
const trackCurve = createTrackCurve(TRACK_6.points);
const trackLength = trackCurve.getLength();

// Sandbox hazard tuning: widen the slicks so a ship on the centre line still
// gets caught (you dodge by steering to the open side), blocks left in place.
const HAZARDS: Hazard[] = (TRACK_6.hazards ?? []).map((h) =>
    h.type === 'slick' ? { ...h, width: 60 } : { ...h });

// Boost pads moved off the centre line — alternating left/right so you steer to
// grab the boost instead of just holding straight.
const PADS: BoostPad[] = TRACK_6.pads.map((p, i) => ({ ...p, lateralPosition: i % 2 === 0 ? -30 : 30 }));

// Tag every not-yet-labelled mesh so the probe/inventory can NAME it. Each
// builder's meshes get labelled right after it runs.
function label(fn: (m: THREE.Mesh) => string) {
    scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && !m.userData.label) m.userData.label = fn(m);
    });
}

// FLAT frame: position + tangent + HORIZONTAL binormal + world-up normal, with
// NO banking. Used for the road, the ship, and the camera so the canyon never
// leans — which makes the ship's strafe truly horizontal and the vertical rock
// reachable / hard. (This is getTrackFrame minus the bank rotation.)
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

// Simple flat road ribbon (no banking) + emissive edge rails, built on the flat
// frame so the road stays level through corners and lines up with the ship.
function roadRibbon(halfFrom: number, halfTo: number, lift: number, color: number, emissive = 0x000000, emissiveIntensity = 0): THREE.Mesh {
    const SEG = 1200;
    const verts: number[] = [], idx: number[] = [], uvs: number[] = [];
    for (let i = 0; i <= SEG; i++) {
        const t = i / SEG;
        const f = flatFrame(trackCurve, t);
        const up = f.normal.clone().multiplyScalar(lift);
        const L = f.position.clone().add(f.binormal.clone().multiplyScalar(halfFrom)).add(up);
        const R = f.position.clone().add(f.binormal.clone().multiplyScalar(halfTo)).add(up);
        verts.push(L.x, L.y, L.z, R.x, R.y, R.z);
        uvs.push(0, t * 40, 1, t * 40);
    }
    for (let i = 0; i < SEG; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }));
}

// Packed-sand road texture: mottled dirt tones + grain + faint longitudinal
// wheel-wear streaks. Tiles along the track (V); spans the width (U 0..1).
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
    // Faint wheel-wear streaks running along the track (canvas Y).
    for (const cx of [0.34, 0.66]) {
        ctx.fillStyle = 'rgba(40,32,18,0.16)';
        ctx.fillRect(cx * S - 9, 0, 18, S);
    }
    // Grain speckle.
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

// Subtle grain normal map for the road: two octaves of smooth value-noise plus
// faint grooves down the wheel lines. Low normalScale so it reads as texture,
// not bumps. Same wrap as the albedo (clamp across width, repeat along track).
function createRoadNormal(): THREE.Texture {
    const S = 256, L = 64;
    const lattice = new Float32Array(L * L);
    for (let i = 0; i < L * L; i++) lattice[i] = Math.random();
    const sample = (fx: number, fy: number) => {
        const gx = fx / S * L, gy = fy / S * L;
        const x0 = ((Math.floor(gx) % L) + L) % L, y0 = ((Math.floor(gy) % L) + L) % L;
        const x1 = (x0 + 1) % L, y1 = (y0 + 1) % L;
        const tx = gx - Math.floor(gx), ty = gy - Math.floor(gy);
        const a = lattice[y0 * L + x0], b = lattice[y0 * L + x1], c = lattice[y1 * L + x0], d = lattice[y1 * L + x1];
        const top = a + (b - a) * tx, bot = c + (d - c) * tx;
        return top + (bot - top) * ty;
    };
    const H = (x: number, y: number) => {
        let h = sample(x, y) * 1.0 + sample(x * 2.3, y * 2.3) * 0.5; // grain octaves
        const u = x / S; // faint wheel grooves at U≈0.34/0.66
        h += -0.4 * Math.exp(-((u - 0.34) ** 2) / 0.0008) - 0.4 * Math.exp(-((u - 0.66) ** 2) / 0.0008);
        return h;
    };
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    const strength = 2.2;
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
    tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.NoColorSpace;
    return tex;
}

const base = TRACK_6.surface!.base, accent = TRACK_6.surface!.accent;
const road = new THREE.Group();
const roadBed = roadRibbon(-60, 60, 0.0, base);           // road bed (full ±60)
roadBed.material = new THREE.MeshStandardMaterial({
    map: createRoadTexture(), normalMap: createRoadNormal(), roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide,
});
(roadBed.material as THREE.MeshStandardMaterial).normalScale.set(0.35, 0.35); // subtle
road.add(roadBed);
road.add(roadRibbon(-60, -56, 0.4, accent, accent, 1.2)); // left edge rail
road.add(roadRibbon(56, 60, 0.4, accent, accent, 1.2));   // right edge rail
scene.add(road);
label(() => 'road');

// Time-of-day is chosen with number keys 1–4 and persisted; switching reloads
// the page for a clean scene (EnvironmentManager.setup isn't built to re-run).
const TIME_KEY = 'mesaSandboxTime';
const TIMES: TimeOfDay[] = ['morning', 'day', 'evening', 'night'];
const stored = localStorage.getItem(TIME_KEY) as TimeOfDay | null;
const timeOfDay: TimeOfDay = stored && TIMES.includes(stored) ? stored : 'day';
addEventListener('keydown', (e) => {
    const i = ['1', '2', '3', '4'].indexOf(e.key);
    if (i >= 0) { localStorage.setItem(TIME_KEY, TIMES[i]); location.reload(); }
});

const envManager = new EnvironmentManager(scene);
envManager.setup({ timeOfDay, weather: 'clear' }, trackCurve, TRACK_6.id);
renderer.toneMappingExposure = envManager.exposure; // 1.0 for desert (space-only otherwise)

// Canyon: drop the glowglobes entirely (orbs + their dynamic lights). At
// night/evening EnvironmentManager spawns 40, each a real PointLight that tanks
// this PBR-heavy scene — and in the gorge they sit out in the rock walls anyway.
// The track reads fine on ambient/moonlight + the emissive rails. For the port
// this becomes "skip glowglobes when terrain === 'canyon'".
const globes = envManager.state?.globes ?? [];
globes.forEach((g) => { scene.remove(g.mesh); scene.remove(g.light); });

// Canyon is open desert — drop EnvironmentManager's time-based distance fog.
// Evening's is dense and dark-purple (denser than night's), which made evening
// murkier/darker than night. The drifting dust already supplies atmosphere.
// For the port: lighten or skip the fog when terrain === 'canyon'.
scene.fog = null;
label(() => 'env');

const canyon = new CanyonTerrain(scene);
canyon.setup(trackCurve, TRACK_6.id);
// CanyonTerrain adds a big PlaneGeometry floor + two ribbon walls.
label((m) => (m.geometry instanceof THREE.PlaneGeometry ? 'canyon-FLOOR' : 'canyon-WALL'));

// ---- Richer sand floor -----------------------------------------------------
// CanyonTerrain's floor is a single flat colour. Replace it with a mottled
// multi-tone albedo + a matching ripple/dune NORMAL MAP, so the sun rakes across
// relief instead of flat colour. Still a player-following, world-locked plane.
scene.traverse((o) => { if (o.userData.label === 'canyon-FLOOR') o.visible = false; });

let _fminY = Infinity;
for (let i = 0; i < 240; i++) { const y = trackCurve.getPoint(i / 240).y; if (y < _fminY) _fminY = y; }
const FLOOR_Y = _fminY - 25;
const FLOOR_SIZE = 16000, FLOOR_REPEAT = 48;

function createRichSandAlbedo(): THREE.Texture {
    const S = 256;
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#c2a878'; ctx.fillRect(0, 0, S, S);
    // Soft mottled tone patches.
    const tones = ['#b89a68', '#cdb487', '#a98e5e', '#d4be90', '#9c8154'];
    for (let i = 0; i < 70; i++) {
        const x = Math.random() * S, y = Math.random() * S, r = 16 + Math.random() * 70;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, tones[(Math.random() * tones.length) | 0]); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.18 + Math.random() * 0.22; ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Wind ripples — faint wavy lines.
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
    // Gravel speckle + darker patches.
    for (let i = 0; i < 6000; i++) {
        const x = Math.random() * S, y = Math.random() * S, v = Math.random();
        ctx.fillStyle = v > 0.7 ? 'rgba(90,68,40,0.5)' : v > 0.4 ? 'rgba(210,190,150,0.4)' : 'rgba(150,120,80,0.3)';
        ctx.fillRect(x, y, v > 0.92 ? 2 : 1, v > 0.92 ? 2 : 1);
    }
    for (let i = 0; i < 14; i++) {
        const x = Math.random() * S, y = Math.random() * S, r = 8 + Math.random() * 22;
        ctx.globalAlpha = 0.10 + Math.random() * 0.12; ctx.fillStyle = '#6e5836';
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
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
    // Height field: low-freq dunes + wavy wind ripples + fine chatter.
    const H = (x: number, y: number) =>
        Math.sin((x * 0.02 + y * 0.015)) * 1.6 +              // rolling dunes
        Math.sin(y * 0.07 + Math.sin(x * 0.05) * 2) * 0.7 +    // wavy ripples
        Math.sin(y * 0.20) * 0.5;                              // tight ripples
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
    tex.colorSpace = THREE.NoColorSpace; // normal data is linear, not sRGB
    return tex;
}

const sandAlbedo = createRichSandAlbedo();
const sandNormal = createSandNormal();
[sandAlbedo, sandNormal].forEach((t) => t.repeat.set(FLOOR_REPEAT, FLOOR_REPEAT));
const richFloorGeo = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE);
richFloorGeo.rotateX(-Math.PI / 2);
const richFloorMat = new THREE.MeshStandardMaterial({
    map: sandAlbedo, normalMap: sandNormal, roughness: 1.0, metalness: 0.0,
});
richFloorMat.normalScale.set(1.3, 1.3);
const richFloor = new THREE.Mesh(richFloorGeo, richFloorMat);
richFloor.position.y = FLOOR_Y;
richFloor.renderOrder = -2;
richFloor.userData.label = 'rich-floor';
scene.add(richFloor);

// --- Flat decals: boost pads / hazards / start line ------------------------
// Geometry mirrors TrackFactory's builders, but on the flat frame so they hug
// the level road instead of the banked one. (TrackFactory's textures aren't
// exported, so the small canvas textures are reproduced here.)
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
            // Brown sandstone boulder — keyed to the canyon-wall palette so it
            // reads as fallen rock, with a faint warm glow so it's still spotted.
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
label(() => 'pad');
flatHazards(HAZARDS).forEach((o) => scene.add(o));
label(() => 'hazard');
scene.add(flatStartLine());
label(() => 'startline');

// =====================================================================
//  WALL COLLIDER (BVH) — built from the SAME wallOffset math CanyonTerrain
//  uses, so the collision surface sits exactly at the rock you can see.
// =====================================================================
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

const WALL_SEED = hashString(TRACK_6.id);
const WALL_LEN = trackCurve.getLength();
const WALL_N = Math.max(240, Math.min(900, Math.floor(WALL_LEN / 70)));
const WALL_BASE_OFF = 66;   // gorge half-width — matches CanyonTerrain
const WALL_OFF_VAR = 3;
const WALL_SEG_LEN = WALL_LEN / WALL_N;

// Inner-face offset for a side at t (capped on the inside of a bend so the
// offset line never folds across the track). Verbatim from CanyonTerrain, so
// the collider tracks the visible rock exactly.
function wallOffset(t: number, side: number): number {
    const tan = getTrackFrame(trackCurve, t).tangent;
    const tn = trackCurve.getTangent((t + 1 / WALL_N) % 1);
    const latX = tan.z, latZ = -tan.x;
    const latLen = Math.hypot(latX, latZ) || 1;
    const lx = latX / latLen, lz = latZ / latLen;
    let off = WALL_BASE_OFF + pnoise(t, WALL_SEED) * WALL_OFF_VAR;
    const ang = Math.atan2(tan.x * tn.z - tan.z * tn.x, tan.x * tn.x + tan.z * tn.z);
    const radius = Math.abs(ang) > 1e-4 ? WALL_SEG_LEN / Math.abs(ang) : 1e9;
    const innerness = (lx * side) * (tn.x - tan.x) + (lz * side) * (tn.z - tan.z);
    if (innerness > 0) off = Math.min(off, radius * 0.9);
    return Math.max(8, off);
}

function buildWallCollider(): { bvh: MeshBVH; geometry: THREE.BufferGeometry } {
    const COLLIDER_LO = -200; // generous vertical span so it always covers the ship
    const COLLIDER_HI = 400;
    const geos: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
        const verts: number[] = [];
        const idx: number[] = [];
        for (let i = 0; i <= WALL_N; i++) {
            const t = i / WALL_N;
            const frame = getTrackFrame(trackCurve, t);
            const tan = frame.tangent;
            const latX = tan.z, latZ = -tan.x;
            const latLen = Math.hypot(latX, latZ) || 1;
            const lx = latX / latLen, lz = latZ / latLen;
            const off = wallOffset(t, side);
            const bx = frame.position.x + lx * side * off;
            const bz = frame.position.z + lz * side * off;
            verts.push(bx, COLLIDER_LO, bz, bx, COLLIDER_HI, bz);
        }
        for (let i = 0; i < WALL_N; i++) {
            const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
            idx.push(a, c, b, b, c, d);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        g.setIndex(idx);
        geos.push(g);
    }
    const merged = mergeGeometries(geos, false)!;
    return { bvh: new MeshBVH(merged), geometry: merged };
}

const { bvh: wallBVH, geometry: wallGeo } = buildWallCollider();
const WALL_TRIS = (wallGeo.index!.count / 3) | 0;

// Decorative rocks (greebles): scree piled along the base of the gorge walls at
// road level, so you see them streaming past as you drive. Each rock is clamped
// to its side's real wall offset (the same math the wall/collision use, so it
// must run AFTER wallOffset's constants exist), so it hugs the rock face and
// never pokes through — even where the wall juts in on a tight bend. Instanced
// low-poly boulders in varied brown shades. No collision.
function buildRocks(count: number): THREE.InstancedMesh {
    const geo = new THREE.IcosahedronGeometry(1, 0); // chunky, flat-shaded → reads as rock
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const pos = new THREE.Vector3(), scl = new THREE.Vector3(), col = new THREE.Color();
    const shades = [0x6b4a2c, 0x7a5634, 0x5e3c1f, 0x866241, 0x4a2c15];
    for (let i = 0; i < count; i++) {
        const t = Math.random();
        const f = flatFrame(trackCurve, t);
        const sign = Math.random() < 0.5 ? -1 : 1;           // which side (along +/- binormal)
        const wallOff = wallOffset(t, -sign);                // the wall on that side
        const off = Math.max(8, wallOff - (1 + Math.random() * 4)); // nestled against the wall base
        pos.copy(f.position).add(f.binormal.clone().multiplyScalar(sign * off));
        pos.y = f.position.y + 0.5 + Math.random() * 1.5;    // sit at road level (visible)
        e.set((Math.random() - 0.5) * 0.5, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.5);
        q.setFromEuler(e);
        scl.set(1.5 + Math.random() * 3.5, 1.2 + Math.random() * 2.8, 1.5 + Math.random() * 3.5);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(i, m);
        col.setHex(shades[(Math.random() * shades.length) | 0]);
        mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
}
const rocks = buildRocks(700);
rocks.userData.label = 'rocks';
scene.add(rocks);

// --- Player ship -----------------------------------------------------------
const shipConfig = { ...SHIP_STATS.fighter, color: 0xcc0000, type: 'fighter' as const };
let player = new Ship(scene, true, shipConfig);

// Case-insensitive input so Caps Lock (or holding Shift) doesn't break movement:
// the physics asks for lower-case letters ('w','a',…) and named keys ('ArrowUp',
// ' '); we match a stored key in either case for single letters, exact otherwise.
const keysDown: Record<string, boolean> = {};
addEventListener('keydown', (e) => { keysDown[e.key] = true; });
addEventListener('keyup', (e) => { keysDown[e.key] = false; });
const input = {
    isKeyPressed(k: string): boolean {
        if (keysDown[k]) return true;
        return k.length === 1 ? !!keysDown[k.toLowerCase()] || !!keysDown[k.toUpperCase()] : false;
    },
};
let gameTime = 0;

function reset() {
    player.dispose(scene);
    player = new Ship(scene, true, shipConfig);
    gameTime = 0;
}
addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'r') reset(); });

// --- AI opponents (DE-RISK): do they thread the flat canyon, or grind walls? --
// Mirrors OpponentManager's AI (throttle + steer to a target lane), but on the
// flat frame, with the shared wall clamp, and with the target lane kept inside
// the LOCAL gorge width — the fix we'd port so opponents don't grind on bends.
const AI_COLORS = [0x00cc00, 0x0000cc, 0xcccc00, 0xcc00cc, 0x00cccc, 0xff8800];
const AI_TYPES = ['fighter', 'speedster', 'tank', 'interceptor', 'corsair'] as const;
interface AICar { ship: Ship; keys: Record<string, boolean>; controller: { isKeyPressed(k: string): boolean }; baseLane: number; }
const aiCars: AICar[] = [];
for (let i = 0; i < 19; i++) { // full real-game field (player + 19)
    const type = AI_TYPES[i % AI_TYPES.length];
    const ship = new Ship(scene, false, { ...SHIP_STATS[type], color: AI_COLORS[i % AI_COLORS.length], type });
    // Real-game grid: 2-wide rows just behind the line.
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
        // Keep the target lane inside the local gorge (the porting fix).
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

// --- Wall collision: exact lateral clamp at the real rock offset -----------
// With a flat (un-banked) frame, lateralPosition maps 1:1 to horizontal cross-
// track distance, and the rock walls sit at horizontal offset wallOffset(t,side)
// from the centre. So the hard wall is simply: clamp lateralPosition so the ship
// (half-width SHIP_RADIUS) can't pass the rock. Exact, cheap, no tunnelling.
const SHIP_RADIUS = 8;   // ship half-width; rests this far short of the rock face
const _center = new THREE.Vector3();
const _binFlat = new THREE.Vector3();
const _probe = { point: new THREE.Vector3(), distance: 0, faceIndex: -1 };
let nearWall = false;
let dbgNearest = -1;   // actual nearest-wall distance from the (flat) ship position
let dbgOffPlus = 0;    // wallOffset(+1): wall on the negative-lateral side, at L = -offPlus
let dbgOffMinus = 0;   // wallOffset(-1): wall on the positive-lateral side, at L = +offMinus

// Shared hard-wall lateral clamp (player AND AI use the same one). Returns true
// on contact. This is what becomes part of the real shared physics in the port.
function clampLateral(state: { trackProgress: number; lateralPosition: number; velocity: THREE.Vector2 }): boolean {
    const t = state.trackProgress;
    const leftLimit = -(wallOffset(t, 1) - SHIP_RADIUS);
    const rightLimit = wallOffset(t, -1) - SHIP_RADIUS;
    if (state.lateralPosition < leftLimit) {
        state.lateralPosition = leftLimit;
        if (state.velocity.x < 0) state.velocity.x = 0; // kill into-wall slide → rest on rock
        return true;
    }
    if (state.lateralPosition > rightLimit) {
        state.lateralPosition = rightLimit;
        if (state.velocity.x > 0) state.velocity.x = 0;
        return true;
    }
    return false;
}

// Player wall resolve = the shared clamp + the debug readouts for the HUD.
function resolveWalls(state: { trackProgress: number; lateralPosition: number; velocity: THREE.Vector2 }): void {
    nearWall = clampLateral(state);
    const t = state.trackProgress;
    dbgOffPlus = wallOffset(t, 1);
    dbgOffMinus = wallOffset(t, -1);
    const f = flatFrame(trackCurve, t);
    _binFlat.copy(f.binormal);
    _center.copy(f.position).addScaledVector(_binFlat, state.lateralPosition);
    _center.y = f.position.y + 2;
    const found = wallBVH.closestPointToPoint(_center, _probe, 0, 1e9);
    dbgNearest = found ? _probe.distance : -1;
}

// Places ANY ship on the FLAT frame (replaces Ship.updateMesh, which banks).
function placeFlat(ship: Ship): void {
    const f = flatFrame(trackCurve, ship.state.trackProgress);
    ship.mesh.position.copy(f.position)
        .add(f.binormal.clone().multiplyScalar(ship.state.lateralPosition))
        .add(f.normal.clone().multiplyScalar(ship.state.verticalPosition));
    ship.mesh.quaternion.setFromRotationMatrix(f.rotationMatrix);
    ship.mesh.rotateZ(-ship.state.rotation);
    ship.mesh.rotateY(ship.state.yaw);
}

// --- Sideways probe: identify whatever is beside the ship (color + distance) -
const raycaster = new THREE.Raycaster();
const _dirR = new THREE.Vector3();
const _dirL = new THREE.Vector3();
let probeL = '—';
let probeR = '—';

function isExcluded(o: THREE.Object3D): boolean {
    if (o.type === 'Points') return true;
    let p: THREE.Object3D | null = o;
    while (p) { if (p === player.mesh) return true; p = p.parent; }
    return false;
}
function matHex(o: THREE.Object3D): string {
    const m = (o as THREE.Mesh).material as any;
    const mat = Array.isArray(m) ? m[0] : m;
    const c = mat && mat.color ? (mat.color as THREE.Color) : null;
    return c ? '#' + c.getHexString() : '?';
}
function probeSide(dir: THREE.Vector3): string {
    raycaster.set(player.mesh.position, dir);
    const hits = raycaster.intersectObjects(scene.children, true);
    for (const h of hits) {
        if (isExcluded(h.object)) continue;
        const lbl = h.object.userData.label ?? '?';
        return `${lbl} @${h.distance.toFixed(0)}`;
    }
    return 'none';
}

// One-time inventory of every mesh in the scene (color + world size + centre),
// logged to the console so we can identify the un-collidered cream mesh.
function logSceneInventory() {
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    const ctr = new THREE.Vector3();
    const rows: any[] = [];
    scene.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh) return;
        if (isExcluded(o)) return;
        box.setFromObject(o);
        box.getSize(size); box.getCenter(ctr);
        rows.push({
            label: o.userData.label ?? '?',
            color: matHex(o),
            w: size.x.toFixed(0), h: size.y.toFixed(0), d: size.z.toFixed(0),
            cx: ctr.x.toFixed(0), cy: ctr.y.toFixed(0), cz: ctr.z.toFixed(0),
            verts: ((o as THREE.Mesh).geometry?.attributes?.position?.count) ?? 0,
        });
    });
    console.table(rows);
}
logSceneInventory();

// --- Main loop (mirrors Game.tsx) -----------------------------------------
let lastTime = performance.now();

renderer.setAnimationLoop(() => {
    const now = performance.now();
    const deltaMs = now - lastTime;
    lastTime = now;
    const dt = Math.min(deltaMs / 16.67, 1.0);
    gameTime += deltaMs;

    const state = player.state;

    // Forked physics (no fake ±60 wall) — race always "started" in the sandbox.
    updatePhysics(state, input, trackLength, PADS, dt, undefined, true, HAZARDS);
    // Hard rock: correct lateral against real wall geometry.
    resolveWalls(state);
    placeFlat(player);

    // AI opponents (flat frame + shared clamp + gorge-aware lanes).
    updateAI(dt);

    // --- Chase camera (flat frame → level horizon, no banked tilt) ---
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
    canyon.update(player.mesh.position); // still drives the drifting dust

    // Rich floor follows the player; texture offset keeps the sand world-locked.
    richFloor.position.x = player.mesh.position.x;
    richFloor.position.z = player.mesh.position.z;
    const fox = (player.mesh.position.x / FLOOR_SIZE) * FLOOR_REPEAT;
    const foz = (-player.mesh.position.z / FLOOR_SIZE) * FLOOR_REPEAT;
    sandAlbedo.offset.set(fox, foz);
    sandNormal.offset.set(fox, foz);

    // Sideways probe (horizontal lateral dirs from the current frame).
    _dirR.set(-tangent.z, 0, tangent.x).normalize();
    _dirL.copy(_dirR).negate();
    probeR = probeSide(_dirR);
    probeL = probeSide(_dirL);

    const p = player.mesh.position;
    hud.innerHTML =
        `<b>Mesa Run sandbox</b>  (Phase 2: HARD walls)\n` +
        `speed    ${Math.round(state.velocity.y * 10)} km/h\n` +
        `progress ${(state.trackProgress * 100).toFixed(1)}%\n` +
        `pos      x ${p.x.toFixed(0)}  y ${p.y.toFixed(0)}  z ${p.z.toFixed(0)}\n` +
        `lateral  ${state.lateralPosition.toFixed(1)}\n` +
        `wall     ${nearWall ? 'CONTACT' : '—'}\n` +
        `ai       ${aiCars.length} opponents (flat + clamp)\n` +
        `time     ${timeOfDay}\n` +
        `probe L  ${probeL}\n` +
        `probe R  ${probeR}\n` +
        `\n<b>collider debug</b>\n` +
        `tris        ${WALL_TRIS}\n` +
        `nearest     ${dbgNearest < 0 ? 'n/a' : dbgNearest.toFixed(1)} (ship radius ${SHIP_RADIUS})\n` +
        `wallOff +/- ${dbgOffPlus.toFixed(1)} / ${dbgOffMinus.toFixed(1)}\n` +
        `→ walls at L = ${(-dbgOffPlus).toFixed(1)} and ${(+dbgOffMinus).toFixed(1)}\n` +
        `\nW/↑ thrust   A/D strafe   Q/E steer   Space hop   R reset   1-4 time`;

    renderer.render(scene, camera);
});

addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});
