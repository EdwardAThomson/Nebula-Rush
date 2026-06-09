// Collision sandbox — standalone, NOT part of the game. Proves the Option 2
// approach: a kinematic "ship" (sphere) driven freely with the keyboard, and
// arbitrary collider geometry (a continuous gorge + a free-standing pillar + a
// fork divider) that the ship sweeps against and slides along — never passing
// through.
//
// Run: with `npm run dev`, open http://localhost:5173/sandbox/collision.html
// Movement: Arrow keys / WASD = thrust (world axes). R = reset.
//
// Collision: all collider geometry is merged into one world-space mesh; a
// three-mesh-bvh `shapecast` finds every triangle the ship sphere overlaps and
// pushes the sphere out of all of them in one pass (stable at corners). A small
// skin gap keeps it resting just off the wall (no jitter). Substepping prevents
// tunnelling. Walls are CONTINUOUS (no seams) so the ship can't slip outside.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';

const hud = document.getElementById('hud')!;

// --- Renderer / scene / camera ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd2e8);
scene.fog = new THREE.Fog(0x9fd2e8, 700, 1800);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 5000);

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(120, 220, 80);
scene.add(sun);

const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshStandardMaterial({ color: 0xc2a878, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// --- Build collider geometry (world space) -------------------------------
const WALL_H = 80;
const HALF = 55; // gorge half-width
const colliderGeos: THREE.BufferGeometry[] = [];

// A solid box collider (closed volume — can't be escaped through).
function box(w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z));
    colliderGeos.push(g);
}

// A continuous vertical wall ribbon following a base line (no seams).
function ribbon(line: THREE.Vector3[]) {
    const verts: number[] = [], uvs: number[] = [], idx: number[] = [];
    for (let i = 0; i < line.length; i++) {
        verts.push(line[i].x, 0, line[i].z, line[i].x, WALL_H, line[i].z);
        uvs.push(0, 0, 0, 1);
    }
    for (let i = 0; i < line.length - 1; i++) {
        const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
        idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    colliderGeos.push(g);
}

// Centre path: a gentle S-curve down -Z.
const path: THREE.Vector3[] = [];
for (let i = 0; i <= 48; i++) {
    path.push(new THREE.Vector3(Math.sin(i * 0.11) * 45, 0, 90 - i * 15));
}
// Offset the path to each side by the perpendicular to make the two walls.
function sideLine(sign: number) {
    return path.map((p, i) => {
        const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
        const tx = b.x - a.x, tz = b.z - a.z;
        const len = Math.hypot(tx, tz) || 1;
        const px = tz / len, pz = -tx / len; // horizontal perpendicular
        return new THREE.Vector3(p.x + px * sign * HALF, 0, p.z + pz * sign * HALF);
    });
}
ribbon(sideLine(1));
ribbon(sideLine(-1));
// Free-standing pillar to dodge/slide around.
box(20, WALL_H, 20, path[16].x + 16, WALL_H / 2, path[16].z);
// Fork: a central divider splitting the far stretch into two lanes.
box(14, WALL_H, 170, path[40].x, WALL_H / 2, path[40].z);

const merged = mergeGeometries(colliderGeos, false)!;
const bvh = new MeshBVH(merged);
scene.add(new THREE.Mesh(
    merged,
    new THREE.MeshStandardMaterial({ color: 0x9c6b3e, roughness: 1, flatShading: true, side: THREE.DoubleSide })
));

// --- Player (kinematic sphere) -------------------------------------------
const RADIUS = 5;
const SKIN = 0.4; // rest this far off the wall (stops in-out jitter)
const player = new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xff3344, roughness: 0.4 })
);
scene.add(player);

const START = new THREE.Vector3(0, RADIUS + 1, 70);
const velocity = new THREE.Vector3();
function reset() { player.position.copy(START); velocity.set(0, 0, 0); }
reset();

// --- Input ---------------------------------------------------------------
const keys: Record<string, boolean> = {};
addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; if (e.key.toLowerCase() === 'r') reset(); });
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
const down = (...k: string[]) => k.some((x) => keys[x]);

// --- Collision (sphere vs BVH, all contacts resolved in one shapecast) ----
const _sphere = new THREE.Sphere(new THREE.Vector3(), RADIUS + SKIN);
const _cp = new THREE.Vector3();
const _n = new THREE.Vector3();
const _before = new THREE.Vector3();
const _probe = { point: new THREE.Vector3(), distance: 0, faceIndex: -1 };

function resolveCollision(): void {
    _before.copy(player.position);
    _sphere.center.copy(player.position);
    _sphere.radius = RADIUS + SKIN;
    let hit = false;
    bvh.shapecast({
        intersectsBounds: (b) => b.intersectsSphere(_sphere),
        intersectsTriangle: (tri) => {
            tri.closestPointToPoint(_sphere.center, _cp);
            const d = _cp.distanceTo(_sphere.center);
            if (d < _sphere.radius && d > 1e-6) {
                _n.copy(_sphere.center).sub(_cp).multiplyScalar(1 / d);
                _sphere.center.addScaledVector(_n, _sphere.radius - d); // push out
                hit = true;
            }
            return false;
        },
    });
    if (hit) {
        player.position.copy(_sphere.center);
        _n.copy(player.position).sub(_before);
        if (_n.lengthSq() > 1e-10) {
            _n.normalize();
            const into = velocity.dot(_n);
            if (into < 0) velocity.addScaledVector(_n, -into); // slide
        }
    }
    player.position.y = RADIUS + 1; // hover
}

// --- Main loop -----------------------------------------------------------
const ACCEL = 300, FRICTION = 2.2, MAX_SPEED = 240;
let last = 0, touching = false;

renderer.setAnimationLoop((tMs) => {
    const t = tMs / 1000;
    let dt = last ? t - last : 0.016;
    last = t;
    dt = Math.min(dt, 0.05);

    const ax = (down('arrowright', 'd') ? 1 : 0) - (down('arrowleft', 'a') ? 1 : 0);
    const az = (down('arrowdown', 's') ? 1 : 0) - (down('arrowup', 'w') ? 1 : 0);
    velocity.x += ax * ACCEL * dt;
    velocity.z += az * ACCEL * dt;
    velocity.x -= velocity.x * FRICTION * dt;
    velocity.z -= velocity.z * FRICTION * dt;
    const sp = Math.hypot(velocity.x, velocity.z);
    if (sp > MAX_SPEED) { velocity.x *= MAX_SPEED / sp; velocity.z *= MAX_SPEED / sp; }

    // Integrate in substeps (no tunnelling), resolving collision after each.
    const steps = Math.max(1, Math.ceil((sp * dt) / (RADIUS * 0.5)));
    for (let s = 0; s < steps; s++) {
        player.position.x += (velocity.x * dt) / steps;
        player.position.z += (velocity.z * dt) / steps;
        resolveCollision();
    }

    // Proximity readout: are we near a wall right now (even if resting)?
    touching = !!bvh.closestPointToPoint(player.position, _probe, 0, RADIUS + 1.5);

    // Smooth chase camera.
    const camTarget = new THREE.Vector3(player.position.x, player.position.y + 70, player.position.z + 95);
    camera.position.lerp(camTarget, 1 - Math.pow(0.0015, dt));
    camera.lookAt(player.position.x, player.position.y, player.position.z - 20);

    hud.innerHTML =
        `<b>Collision sandbox</b>  (three-mesh-bvh sweep + slide)\n` +
        `pos   x ${player.position.x.toFixed(1)}  z ${player.position.z.toFixed(1)}\n` +
        `speed ${sp.toFixed(0)}\n` +
        `near wall: ${touching ? 'YES' : 'no'}\n` +
        `\nArrows / WASD = move    R = reset`;

    renderer.render(scene, camera);
});

addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
