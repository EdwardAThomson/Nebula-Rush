// Ship viewer sandbox — renders one ship from ShipFactory under the same IBL +
// lights as the in-game ship preview, with the exhaust lit as if cruising, so
// a design can be judged (and screenshotted) from fixed camera angles.
//
// Run: with `npm run dev`, open http://localhost:5173/sandbox/ship.html
// Query params:
//   type=lancer|fighter|...   ship type (default lancer)
//   types=lancer,rapier,...   lineup: several ships side by side (overrides type/view)
//   color=d9531e              primary paint (hex, no #; lineup uses each ship's default)
//   accent=eeeeee             trim paint (hex, no #)
//   view=front3q|rear3q|side|top|front|orbit   camera preset (default orbit)
//   hud=0                     hide the label
// Controls (orbit view): click & drag to spin.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createShip, type ShipType } from '../src/game/ShipFactory';

const DEFAULT_COLORS: Partial<Record<ShipType, number>> = {
    lancer: 0xd9531e, rapier: 0x2e7bd6, sledge: 0xc8a34a, kestrel: 0x9b1b3c,
    fighter: 0xcc0000, speedster: 0x00ccff, tank: 0xcccc00, interceptor: 0x00ff00, corsair: 0x5500aa,
};

const params = new URLSearchParams(location.search);
const lineup = (params.get('types') || '').split(',').filter(Boolean) as ShipType[];
const type = (params.get('type') || 'lancer') as ShipType;
const color = params.get('color') ? parseInt(params.get('color')!, 16) : (DEFAULT_COLORS[type] ?? 0xd9531e);
const accent = parseInt(params.get('accent') || 'eeeeee', 16);
const view = lineup.length ? 'lineup' : (params.get('view') || 'orbit');

const hud = document.getElementById('hud')!;
if (params.get('hud') === '0') hud.style.display = 'none';
hud.innerHTML = lineup.length
    ? `<b>LINEUP</b>  ${lineup.map(t => t.toUpperCase()).join('  ·  ')}`
    : `<b>${type.toUpperCase()}</b>  view=${view}\n#${color.toString(16).padStart(6, '0')} / #${accent.toString(16).padStart(6, '0')}`;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// IBL + lights mirror ShipPreview.tsx so the sandbox judges the same look.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const key = new THREE.DirectionalLight(0xffffff, 1.0);
key.position.set(5, 10, 5);
scene.add(key);

// Faint ground disc for a sense of scale and a shadow-ish anchor.
const ground = new THREE.Mesh(
    new THREE.CircleGeometry(9, 64),
    new THREE.MeshStandardMaterial({ color: 0x151b24, roughness: 1, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.0;
scene.add(ground);

// Light the exhaust as the game does at cruise (Ship.ts drives these per
// frame in-game; the factory leaves the cones short).
const lightExhaust = (glows: THREE.Mesh[]) => glows.forEach(g => {
    const outer = g.children[0] as THREE.Mesh | undefined;
    const core = g.children[1] as THREE.Mesh | undefined;
    if (outer) outer.scale.set(outer.scale.x, 2.0, outer.scale.z);
    if (core) core.scale.set(core.scale.x, 1.8, core.scale.z);
});

// Energy beams flicker here too (a light version of Ship.ts's animation).
const beams: THREE.Mesh[] = [];
const animateBeams = (time: number) => beams.forEach((beam, i) => {
    const t = time * 6 + i * 1.7;
    const mat = beam.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.55 * (0.78 + 0.16 * Math.sin(t * 2.3) + 0.06 * Math.sin(t * 7.1));
    mat.color.set(0x8a5cff).lerp(new THREE.Color(0x4fb8ff), 0.5 + 0.5 * Math.sin(time * 1.3 + i));
    const core = beam.children[0] as THREE.Mesh | undefined;
    if (core) core.scale.set(1 + 0.3 * Math.sin(t * 5.3), 1, 1 + 0.3 * Math.sin(t * 5.3));
});

let mesh: THREE.Group;
if (lineup.length) {
    // Side by side, each turned a little so the three-quarter view reads,
    // spaced wide enough for the widest hull plus its exhaust.
    mesh = new THREE.Group();
    const spacing = 7.5;
    lineup.forEach((t, i) => {
        const ship = createShip(DEFAULT_COLORS[t] ?? 0xd9531e, t, accent);
        // Camera sits at -Z looking aft, so +X is screen-left: negate to keep
        // the listed order reading left to right.
        ship.mesh.position.set(-(i - (lineup.length - 1) / 2) * spacing, -0.5, 0);
        ship.mesh.rotation.y = 0.55;
        lightExhaust(ship.glows);
        beams.push(...ship.beams);
        mesh.add(ship.mesh);
    });
    ground.scale.setScalar(2.2);
} else {
    const ship = createShip(color, type, accent);
    mesh = ship.mesh;
    mesh.position.y = -0.5;
    lightExhaust(ship.glows);
    beams.push(...ship.beams);
}
scene.add(mesh);

// Camera presets: ship forward is -Z, so "front" views sit at negative Z.
const presets: Record<string, [THREE.Vector3, THREE.Vector3]> = {
    front3q: [new THREE.Vector3(-7.5, 4.0, -9.5), new THREE.Vector3(0, 0, 0)],
    rear3q: [new THREE.Vector3(7.5, 4.0, 9.5), new THREE.Vector3(0, 0, 0)],
    side: [new THREE.Vector3(13, 1.5, 0), new THREE.Vector3(0, 0, 0)],
    top: [new THREE.Vector3(0, 14, 0.01), new THREE.Vector3(0, 0, 0)],
    front: [new THREE.Vector3(0, 2.5, -13), new THREE.Vector3(0, 0, 0)],
    orbit: [new THREE.Vector3(-7.5, 4.0, -9.5), new THREE.Vector3(0, 0, 0)],
    lineup: [new THREE.Vector3(-3, 7, -21), new THREE.Vector3(0, -0.5, 0)],
};
const [camPos, camTarget] = presets[view] || presets.orbit;
camera.position.copy(camPos);
camera.lookAt(camTarget);

// Drag to spin (orbit view only).
let dragging = false, lastX = 0, lastY = 0;
if (view === 'orbit') {
    addEventListener('mousedown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
    addEventListener('mouseup', () => { dragging = false; });
    addEventListener('mousemove', e => {
        if (!dragging) return;
        mesh.rotation.y += (e.clientX - lastX) * 0.01;
        mesh.rotation.x += (e.clientY - lastY) * 0.01;
        lastX = e.clientX; lastY = e.clientY;
    });
}

addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

let frames = 0;
const animate = () => {
    animateBeams(performance.now() * 0.001);
    renderer.render(scene, camera);
    frames++;
    if (frames === 3) (window as unknown as { __shipReady: boolean }).__shipReady = true; // screenshot hook
    requestAnimationFrame(animate);
};
animate();
