// Shield-hit FX preview: one ship, a frozen frame of the damage feedback.
// Open sandbox/shield-fx.html?mode=hit|side|low|charge&f=<frames after hit>
// (&cx=&cz= move the camera). Used to tune the Ship shield / spark visuals.
import * as THREE from 'three';
import { Ship } from '../src/game/Ship';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') ?? 'hit';
const frames = Number(params.get('f') ?? 6);

const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true });
renderer.setSize(900, 560);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d18);
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(5, 10, 5);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x333a44 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.5;
scene.add(ground);

const ship = new Ship(scene, false, {
    color: 0xcc2222, type: 'fighter', maxEnergy: 100, energyEnabled: true,
    accelFactor: 0.5, turnSpeed: 0.001, friction: 0.99, strafeSpeed: 0.01, slideFactor: 0.95,
});
const camera = new THREE.PerspectiveCamera(50, 900 / 560, 0.1, 500);
camera.position.set(Number(params.get('cx') ?? 7), 4.5, Number(params.get('cz') ?? 9));
camera.lookAt(0, 0.5, -1);

if (mode === 'charge') {
    ship.state.energy = 50;
    ship.updateVisuals(1);
    for (let i = 0; i < 30; i++) {
        ship.state.energy += 0.6;
        ship.updateVisuals(1);
    }
} else {
    if (mode === 'low') {
        ship.state.energy = 38;
        ship.updateVisuals(1);
    }
    if (mode === 'side') ship.setHitDirection(1, 0, 0);
    else ship.setHitDirection(-0.5, 0, -1);
    ship.state.energy -= 18;
    for (let i = 0; i < frames; i++) ship.updateVisuals(1);
}
renderer.render(scene, camera);
(window as unknown as { done: boolean }).done = true;
