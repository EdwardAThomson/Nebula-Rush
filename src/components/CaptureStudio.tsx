import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createShip, type ShipType } from '../game/ShipFactory';
import { createTrackCurve, createTrackMesh, createStartLineMesh, createBoostPadMeshes, getTrackFrame } from '../game/TrackFactory';
import { TRACKS } from '../game/TrackDefinitions';

// Dev-only studio that renders real Three.js exhibits and downloads each as a
// PNG (transparent or dark) for blog/vlog visuals.
//   - Ships: the current smooth ship models.
//   - Wing bug: the real fighter with its left wing built the buggy way
//     (180° rotation flips the chord -> curve at the back) vs the fix.
//   - Track surface: a real track's road with the neon markings + checkered start.

interface CaptureStudioProps { onBack: () => void; }

const SHIP_TYPES: ShipType[] = ['fighter', 'speedster', 'tank', 'interceptor', 'corsair'];
const SHIP_COLORS: Record<ShipType, number> = {
    fighter: 0xcc0000, speedster: 0x00ccff, tank: 0xcccc00, interceptor: 0x00ff00, corsair: 0x5500aa,
};

// A naive "fine detail" road texture used to *demonstrate* the stretching
// problem: crisp small chevrons drawn here turn into long smeared streaks once
// the texture is tiled only ~10× along a very long lap (the V axis ends up
// stretched ~10× relative to U across the road).
const naiveStretchTexture = (accent: number) => {
    const W = 256, H = 128;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0e141f'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#' + accent.toString(16).padStart(6, '0');
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const roadL = Math.round(0.379 * W), roadR = Math.round(0.586 * W);
    const cx = (roadL + roadR) / 2, arm = (roadR - roadL) * 0.4;
    for (let y = 8; y < H; y += 16) {
        ctx.beginPath();
        ctx.moveTo(cx - arm, y + 6); ctx.lineTo(cx, y - 6); ctx.lineTo(cx + arm, y + 6);
        ctx.stroke();
    }
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
};

type Kind = 'ship' | 'wing' | 'track';

export default function CaptureStudio({ onBack }: CaptureStudioProps) {
    const mountRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const orbitRef = useRef({ target: new THREE.Vector3(), radius: 11, theta: 0.7, phi: 1.1, up: new THREE.Vector3(0, 1, 0) });
    const frameRef = useRef(0);

    const [kind, setKind] = useState<Kind>('ship');
    const [shipIndex, setShipIndex] = useState(0);
    const [buggy, setBuggy] = useState(true);
    const [trackIndex, setTrackIndex] = useState(0);
    const [trackBefore, setTrackBefore] = useState(true);
    const [transparent, setTransparent] = useState(true);

    const shipType = SHIP_TYPES[shipIndex];
    const captureName =
        kind === 'ship' ? `nebula_rush_${shipType}`
            : kind === 'wing' ? (buggy ? 'wing_bug_before' : 'wing_bug_after')
                : `track_surface_${TRACKS[trackIndex].id}_${trackBefore ? 'stretched' : 'clean'}`;

    useEffect(() => {
        const container = mountRef.current;
        if (!container) return;

        const scene = new THREE.Scene();
        sceneRef.current = scene;
        const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 200000);
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.setClearColor(0x0b0f1a, transparent ? 0 : 1);
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dir = new THREE.DirectionalLight(0xffffff, 1.6);
        dir.position.set(5, 10, 5);
        scene.add(dir);

        const o = orbitRef.current;
        if (kind === 'ship') {
            scene.add(createShip(SHIP_COLORS[shipType], shipType).mesh);
            o.target.set(0, 0.4, 0.5); o.radius = 11; o.theta = 0.7; o.phi = 1.1; o.up.set(0, 1, 0);
        } else if (kind === 'wing') {
            scene.add(createShip(SHIP_COLORS.fighter, 'fighter', 0xeeeeee, buggy).mesh);
            o.target.set(0, 0.4, 0.5); o.radius = 9; o.theta = 0.0001; o.phi = 0.2; o.up.set(0, 0, -1); // top-down, forward up
        } else {
            const track = TRACKS[trackIndex];
            const curve = createTrackCurve(track.points);
            const road = createTrackMesh(curve, track.surface);
            if (trackBefore) {
                // Swap the bold markings for naive fine detail to show it smear.
                const tex = naiveStretchTexture(track.surface?.accent ?? 0x00e5ff);
                const m = road.material as THREE.MeshStandardMaterial;
                m.map = tex; m.emissiveMap = tex; m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = 1.2; m.needsUpdate = true;
            }
            scene.add(road);
            scene.add(createStartLineMesh(curve));
            createBoostPadMeshes(curve, track.pads).forEach(m => scene.add(m));
            const f = getTrackFrame(curve, 0.95);
            o.target.copy(f.position); o.radius = 190; o.theta = 0.7; o.phi = 0.62; o.up.set(0, 1, 0);
        }

        const place = () => {
            const { target, radius, theta, phi, up } = o;
            camera.position.set(
                target.x + radius * Math.sin(phi) * Math.cos(theta),
                target.y + radius * Math.cos(phi),
                target.z + radius * Math.sin(phi) * Math.sin(theta),
            );
            camera.up.copy(up);
            camera.lookAt(target);
        };

        let dragging = false; let last = { x: 0, y: 0 };
        const down = (e: MouseEvent) => { dragging = true; last = { x: e.clientX, y: e.clientY }; container.style.cursor = 'grabbing'; };
        const move = (e: MouseEvent) => {
            if (!dragging) return;
            o.theta -= (e.clientX - last.x) * 0.006;
            o.phi = Math.min(Math.PI - 0.05, Math.max(0.05, o.phi - (e.clientY - last.y) * 0.006));
            last = { x: e.clientX, y: e.clientY };
        };
        const upH = () => { dragging = false; container.style.cursor = 'grab'; };
        const wheel = (e: WheelEvent) => { e.preventDefault(); o.radius = Math.max(2, o.radius * (1 + Math.sign(e.deltaY) * 0.1)); };
        container.style.cursor = 'grab';
        container.addEventListener('mousedown', down);
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', upH);
        container.addEventListener('wheel', wheel, { passive: false });

        const animate = () => { place(); renderer.render(scene, camera); frameRef.current = requestAnimationFrame(animate); };
        animate();

        const onResize = () => {
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
        };
        window.addEventListener('resize', onResize);

        return () => {
            cancelAnimationFrame(frameRef.current);
            window.removeEventListener('resize', onResize);
            container.removeEventListener('mousedown', down);
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', upH);
            container.removeEventListener('wheel', wheel);
            if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
            scene.environment?.dispose();
            renderer.dispose();
        };
    }, [kind, shipType, buggy, trackIndex, trackBefore, transparent]);

    const download = () => {
        const r = rendererRef.current, s = sceneRef.current, c = cameraRef.current;
        if (!r || !s || !c) return;
        r.render(s, c);
        r.domElement.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `${captureName}.png`; a.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }, 'image/png');
    };

    const btn = (active: boolean) =>
        `px-4 py-2 rounded font-bold transition-colors ${active ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`;

    return (
        <div className="relative w-full h-full bg-gray-900 flex flex-col items-center p-6">
            <h2 className="text-3xl font-bold text-white mb-1">CAPTURE STUDIO</h2>
            <p className="text-gray-400 text-sm mb-4">Drag to orbit · scroll to zoom · Download PNG (transparent = clean slide cut-outs)</p>

            <div
                className="w-full max-w-5xl flex-1 min-h-0 rounded-xl overflow-hidden border border-gray-700 shadow-2xl"
                style={{
                    backgroundColor: '#1b2230',
                    backgroundImage:
                        'linear-gradient(45deg,#222b3b 25%,transparent 25%),linear-gradient(-45deg,#222b3b 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#222b3b 75%),linear-gradient(-45deg,transparent 75%,#222b3b 75%)',
                    backgroundSize: '24px 24px', backgroundPosition: '0 0,0 12px,12px -12px,-12px 0',
                }}
            >
                <div ref={mountRef} className="w-full h-full" />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <div className="flex gap-2">
                    <button className={btn(kind === 'ship')} onClick={() => setKind('ship')}>Ships</button>
                    <button className={btn(kind === 'wing')} onClick={() => setKind('wing')}>Wing bug</button>
                    <button className={btn(kind === 'track')} onClick={() => setKind('track')}>Track surface</button>
                </div>

                {kind === 'ship' && (
                    <div className="flex items-center gap-2">
                        <button className={btn(false)} onClick={() => setShipIndex(i => (i - 1 + SHIP_TYPES.length) % SHIP_TYPES.length)}>‹</button>
                        <span className="w-28 text-center text-white font-bold uppercase">{shipType}</span>
                        <button className={btn(false)} onClick={() => setShipIndex(i => (i + 1) % SHIP_TYPES.length)}>›</button>
                    </div>
                )}
                {kind === 'wing' && (
                    <div className="flex gap-2">
                        <button className={btn(buggy)} onClick={() => setBuggy(true)}>Before (buggy)</button>
                        <button className={btn(!buggy)} onClick={() => setBuggy(false)}>After (fixed)</button>
                    </div>
                )}
                {kind === 'track' && (
                    <>
                        <div className="flex items-center gap-2">
                            <button className={btn(false)} onClick={() => setTrackIndex(i => (i - 1 + TRACKS.length) % TRACKS.length)}>‹</button>
                            <span className="w-40 text-center text-white font-bold">{TRACKS[trackIndex].name}</span>
                            <button className={btn(false)} onClick={() => setTrackIndex(i => (i + 1) % TRACKS.length)}>›</button>
                        </div>
                        <div className="flex gap-2">
                            <button className={btn(trackBefore)} onClick={() => setTrackBefore(true)}>Before (stretched)</button>
                            <button className={btn(!trackBefore)} onClick={() => setTrackBefore(false)}>After (clean)</button>
                        </div>
                    </>
                )}

                <button className={btn(transparent)} onClick={() => setTransparent(t => !t)}>{transparent ? 'Transparent BG' : 'Dark BG'}</button>
                <button onClick={download} className="px-5 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded transition-colors">⬇ Download PNG</button>
                <button onClick={onBack} className="px-5 py-2 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded transition-colors">Back</button>
            </div>
        </div>
    );
}
