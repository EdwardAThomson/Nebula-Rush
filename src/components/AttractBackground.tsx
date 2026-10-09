import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { type ShipType } from '../game/ShipFactory';
import { Ship } from '../game/Ship';
import { createTrackCurve, createTrackMesh, createBoostPadMeshes, createStartLineMesh, getTrackFrame } from '../game/TrackFactory';
import { TRACKS } from '../game/TrackDefinitions';
import { EnvironmentManager, type TimeOfDay } from '../game/EnvironmentManager';
import { WorldReference } from '../game/WorldReference';

// Attract mode for the start screen: a pack of AI ships lapping a real Nebula
// Cup track, filmed by a cycling set of TV-style camera shots. The ships are
// moved kinematically (no physics) — each rides the track at a speed that
// oscillates around a shared base, so the pack shuffles places but stays
// together. Ships that cross a boost pad surge ahead with the in-game boost
// effects, then drift back to the pack. The opening shot always follows the
// red ship onto the track's first boost pad. Rendered behind the menu, which
// dims it with an overlay.

const TRACK_POOL = ['track_1', 'track_2', 'track_3', 'track_4', 'track_5'];
const TIMES: TimeOfDay[] = ['evening', 'night', 'night', 'morning'];
const SHIP_TYPES: ShipType[] = ['fighter', 'speedster', 'tank', 'interceptor', 'corsair'];
const COLORS = [0xcc0000, 0x00ccff, 0xcccc00, 0x00ff00, 0x5500aa, 0xff6600, 0xff00aa, 0xffffff];
const RACERS = 8;
const LAP_SECONDS = 38; // average lap time of the pack
const SHOT_SECONDS = 7;
const OPENING_SECONDS = 9;  // first shot: long enough to see the boost land
const OPENING_LEAD = 2.5;   // seconds from start until the red ship hits the pad
const BOOST_SECONDS = 3;
const BOOST_GAIN = 0.55;    // extra speed at full boost
// Grid slots in world units along the track (+ = ahead of the red ship), so the
// opening chase shot has rivals ahead and alongside it; the ones behind start
// back past the chase camera so none of them fills the lens.
const SLOTS = [0, 34, 18, 52, -45, 8, -60, 70];
const FADE_SECONDS = 0.6;

interface Racer {
    ship: Ship;
    mesh: THREE.Group;
    boost: number;       // eased 0..1 speed surge
    padIndex: number;    // pad currently under the ship (-1 = none), so each pad fires once
    t: number;
    speedPhase: number;
    lane: number;
    laneAmp: number;
    laneFreq: number;
    lanePhase: number;
    lateral: number; // current offset from the centre line (set by placeRacer)
}

type Shot = 'chase' | 'side' | 'flyover' | 'trackside';
const SHOTS: Shot[] = ['chase', 'side', 'trackside', 'flyover'];

interface AttractBackgroundProps { className?: string; }

export default function AttractBackground({ className = '' }: AttractBackgroundProps) {
    const mountRef = useRef<HTMLDivElement>(null);
    const fadeRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = mountRef.current;
        if (!container) return;

        const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 6000);
        const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'low-power' });
        // It sits behind a dimming overlay, so full retina resolution is wasted GPU.
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        container.appendChild(renderer.domElement);

        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();

        // Dev overrides for screenshots: ?attractTrack=track_3&attractShot=side
        // pins the track and holds a single camera shot.
        const params = new URLSearchParams(window.location.search);
        const pinnedShot = SHOTS.indexOf(params.get('attractShot') as Shot);
        const pool = TRACKS.filter(t => TRACK_POOL.includes(t.id));
        const track = pool.find(t => t.id === params.get('attractTrack')) ?? pool[Math.floor(Math.random() * pool.length)];
        const curve = createTrackCurve(track.points);
        const trackLength = curve.getLength();

        scene.add(createTrackMesh(curve, track.surface));
        scene.add(createStartLineMesh(curve));
        createBoostPadMeshes(curve, track.pads).forEach(m => scene.add(m));

        const env = new EnvironmentManager(scene);
        env.setup({ timeOfDay: TIMES[Math.floor(Math.random() * TIMES.length)], weather: 'clear', space: true }, curve, track.id);
        renderer.toneMappingExposure = env.exposure;

        let worldRef: WorldReference | null = null;
        if (track.depthCues) {
            worldRef = new WorldReference(scene);
            worldRef.setup(curve, track.surface?.accent ?? 0x3388ff);
        }

        const baseSpeed = 1 / LAP_SECONDS; // track-t per second

        // Grid the pack so the red ship (racer 0) reaches the first boost pad
        // OPENING_LEAD seconds in, lined up on the pad's lane.
        const firstPad = track.pads[0];
        const startT = firstPad
            ? (firstPad.trackProgress - OPENING_LEAD * baseSpeed + 1) % 1
            : Math.random();
        const racers: Racer[] = [];
        for (let i = 0; i < RACERS; i++) {
            const ship = new Ship(scene, false, { color: COLORS[i % COLORS.length], type: SHIP_TYPES[i % SHIP_TYPES.length] });
            ship.state.throttle = 1; // full-length engine flames
            const isRed = i === 0;
            racers.push({
                ship,
                mesh: ship.mesh,
                boost: 0,
                padIndex: -1,
                t: (startT + SLOTS[i] / trackLength + 1) % 1,
                speedPhase: Math.random() * Math.PI * 2,
                lane: isRed && firstPad ? firstPad.lateralPosition : (i % 2 === 0 ? -1 : 1) * (8 + (i % 3) * 10),
                laneAmp: isRed ? 3 : 6 + Math.random() * 10,
                laneFreq: 0.25 + Math.random() * 0.3,
                lanePhase: Math.random() * Math.PI * 2,
                lateral: 0,
            });
        }

        // Fire a pad's boost once when a ship first rolls onto it.
        const checkPads = (r: Racer) => {
            let hit = -1;
            track.pads.forEach((pad, i) => {
                const along = (r.t - pad.trackProgress + 1) % 1;
                if (along < pad.length && Math.abs(r.lateral - pad.lateralPosition) < pad.width / 2) hit = i;
            });
            if (hit >= 0 && hit !== r.padIndex) {
                r.ship.state.boostTimer = BOOST_SECONDS;
                r.ship.triggerBoostFlash();
            }
            r.padIndex = hit;
        };
        const up = new THREE.Vector3(0, 1, 0);
        const tmp = new THREE.Vector3();
        const lookAt = new THREE.Vector3();
        const camPos = new THREE.Vector3();
        const camUp = new THREE.Vector3(0, 1, 0);
        const fixedCam = new THREE.Vector3(); // trackside camera anchor, chosen per shot

        let shotIndex = pinnedShot >= 0 ? pinnedShot : SHOTS.indexOf('chase');
        let shotStart = 0;
        let shotLength = OPENING_SECONDS;
        let subject = 0;
        let side = 1; // which side of the menu the subject is framed on
        let elapsed = 0;
        let last = performance.now();
        let frameId = 0;

        const placeRacer = (r: Racer, time: number) => {
            const f = getTrackFrame(curve, r.t);
            const lateral = r.lane + Math.sin(time * r.laneFreq + r.lanePhase) * r.laneAmp;
            r.lateral = lateral;
            const bob = 2 + Math.sin(time * 2.1 + r.lanePhase) * 0.25;
            r.mesh.position.copy(f.position)
                .addScaledVector(f.binormal, lateral)
                .addScaledVector(f.normal, bob);
            r.mesh.quaternion.setFromRotationMatrix(f.rotationMatrix);
            // Lean into the weave (derivative of the lateral sine).
            const laneVel = Math.cos(time * r.laneFreq + r.lanePhase) * r.laneAmp * r.laneFreq;
            r.mesh.rotateZ(-laneVel * 0.06);
            r.mesh.rotateY(-laneVel * 0.012);
        };

        // Pick a trackside camera spot a little ahead of the subject so the pack
        // sweeps past it during the shot.
        const pickTrackside = () => {
            const t = (racers[subject].t + 160 / trackLength) % 1;
            const f = getTrackFrame(curve, t);
            const side = Math.random() < 0.5 ? -1 : 1;
            fixedCam.copy(f.position).addScaledVector(f.binormal, side * 75).addScaledVector(f.normal, 12);
        };

        // The menu covers the middle of the screen, so shift the projection to
        // frame the subject in the left or right third instead of dead centre.
        const frameOffset = () => {
            const w = container.clientWidth, h = container.clientHeight;
            camera.setViewOffset(w, h, side * w * 0.24, 0, w, h);
        };

        const startShot = (index: number, opening = false) => {
            shotIndex = index % SHOTS.length;
            shotStart = elapsed;
            shotLength = opening ? OPENING_SECONDS : SHOT_SECONDS;
            subject = opening ? 0 : Math.floor(Math.random() * RACERS);
            side = -side;
            frameOffset();
            if (SHOTS[shotIndex] === 'trackside') pickTrackside();
        };
        startShot(shotIndex, true);

        const frameCamera = () => {
            const shot = SHOTS[shotIndex];
            const s = racers[subject];
            const f = getTrackFrame(curve, s.t);
            const p = s.mesh.position;
            const k = (elapsed - shotStart) / shotLength; // 0..1 through the shot

            // Boost camera, as in-game: widen the FOV and pull back on a surge.
            const fov = 60 + (shot === 'chase' ? 12 * s.boost : 0);
            if (Math.abs(camera.fov - fov) > 0.01) {
                camera.fov = fov;
                camera.updateProjectionMatrix();
            }

            if (shot === 'chase') {
                camPos.copy(p).addScaledVector(f.tangent, -22 - 6 * s.boost).addScaledVector(f.normal, 7);
                lookAt.copy(p).addScaledVector(f.tangent, 30);
                camUp.copy(f.normal);
            } else if (shot === 'side') {
                // Low tracking shot alongside, slowly drifting from behind to
                // ahead. Always on the centre-line side so the wall never blocks it.
                camPos.copy(p)
                    .addScaledVector(f.binormal, s.lateral > 0 ? -24 : 24)
                    .addScaledVector(f.normal, 4)
                    .addScaledVector(f.tangent, THREE.MathUtils.lerp(-14, 10, k));
                lookAt.copy(p);
                camUp.copy(f.normal);
            } else if (shot === 'flyover') {
                // High crane shot over the pack, looking down the track.
                camPos.copy(p)
                    .addScaledVector(f.tangent, THREE.MathUtils.lerp(-70, -40, k))
                    .addScaledVector(f.normal, THREE.MathUtils.lerp(55, 35, k))
                    .addScaledVector(f.binormal, side * -30);
                lookAt.copy(p).addScaledVector(f.tangent, 60);
                camUp.copy(up);
            } else {
                camPos.copy(fixedCam);
                lookAt.copy(p);
                camUp.copy(up);
            }
            camera.position.copy(camPos);
            camera.up.copy(camUp);
            camera.lookAt(lookAt);
        };

        const animate = () => {
            frameId = requestAnimationFrame(animate);
            const now = performance.now();
            const dt = Math.min((now - last) / 1000, 0.1);
            last = now;
            elapsed += dt;

            // Pack centre (circular mean around the red ship) for rubber-banding.
            let spread = 0;
            for (const r of racers) spread += ((r.t - racers[0].t + 1.5) % 1) - 0.5;
            const centreT = racers[0].t + spread / RACERS;

            for (const r of racers) {
                const s = r.ship.state;
                s.boostTimer = Math.max(0, s.boostTimer - dt);
                r.boost += ((s.boostTimer > 0 ? 1 : 0) - r.boost) * Math.min(1, dt * (s.boostTimer > 0 ? 4 : 1));
                // Drift back toward the pack once more than ~8 ship-lengths out.
                const gap = (((r.t - centreT + 1.5) % 1) - 0.5) * trackLength;
                const pull = Math.max(-0.12, Math.min(0.12, -Math.sign(gap) * Math.max(0, Math.abs(gap) - 90) / 600));
                const speed = baseSpeed * (1 + 0.035 * Math.sin(elapsed * 0.37 + r.speedPhase) + BOOST_GAIN * r.boost + pull);
                r.t = (r.t + speed * dt) % 1;
                placeRacer(r, elapsed);
                checkPads(r);
                r.ship.updateVisuals(dt * 60);
            }

            const shotAge = elapsed - shotStart;
            if (shotAge > shotLength) startShot(pinnedShot >= 0 ? pinnedShot : shotIndex + 1);
            frameCamera();

            // Dip to black around each cut.
            if (fadeRef.current) {
                const age = elapsed - shotStart;
                const edge = Math.min(age, shotLength - age);
                fadeRef.current.style.opacity = String(Math.max(0, 1 - edge / FADE_SECONDS));
            }

            env.update(dt * 60, camera.position);
            worldRef?.update(tmp.copy(racers[subject].mesh.position));
            renderer.render(scene, camera);
        };

        if (reducedMotion) {
            // One still frame of the pack instead of a moving camera.
            racers.forEach(r => placeRacer(r, 0));
            shotIndex = SHOTS.indexOf('flyover');
            frameCamera();
            if (fadeRef.current) fadeRef.current.style.opacity = '0';
            renderer.render(scene, camera);
        } else {
            animate();
        }

        const onResize = () => {
            camera.aspect = container.clientWidth / container.clientHeight;
            frameOffset();
            renderer.setSize(container.clientWidth, container.clientHeight);
            if (reducedMotion) renderer.render(scene, camera);
        };
        window.addEventListener('resize', onResize);

        return () => {
            cancelAnimationFrame(frameId);
            window.removeEventListener('resize', onResize);
            scene.traverse(obj => {
                const mesh = obj as THREE.Mesh;
                mesh.geometry?.dispose();
            });
            scene.environment?.dispose();
            renderer.dispose();
            renderer.forceContextLoss();
            renderer.domElement.remove();
        };
    }, []);

    return (
        <div className={`absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
            <div ref={mountRef} className="absolute inset-0" />
            <div ref={fadeRef} className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: 1 }} />
        </div>
    );
}
