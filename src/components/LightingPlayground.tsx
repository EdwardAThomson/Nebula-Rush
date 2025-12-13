import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Ship } from '../game/Ship';
import { SHIP_STATS } from '../game/ShipFactory';


interface LightingPlaygroundProps {
    onBack: () => void;
}

interface LightingState {
    // Global
    ambientIntensity: number;
    hemisphereIntensity: number;
    directionalIntensity: number;

    // Globals
    pointIntensity: number;
    pointDistance: number;
    pointDecay: number;
    emissiveIntensity: number;
}

export default function LightingPlayground({ onBack }: LightingPlaygroundProps) {
    const mountRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const meshesRef = useRef<{ globes: THREE.Mesh[], lights: THREE.PointLight[] }>({ globes: [], lights: [] });
    const lightingRef = useRef<{ ambient: THREE.AmbientLight, hemi: THREE.HemisphereLight, dir: THREE.DirectionalLight } | null>(null);

    const [settings, setSettings] = useState<LightingState>({
        ambientIntensity: 0.1,
        hemisphereIntensity: 0.2,
        directionalIntensity: 0.1,
        pointIntensity: 500,
        pointDistance: 5500,
        pointDecay: 2.0,
        emissiveIntensity: 200
    });

    // Update Three.js objects when settings change
    useEffect(() => {
        if (!sceneRef.current || !lightingRef.current) return;

        // Global Lights
        lightingRef.current.ambient.intensity = settings.ambientIntensity;
        lightingRef.current.hemi.intensity = settings.hemisphereIntensity;
        lightingRef.current.dir.intensity = settings.directionalIntensity;

        // Point Lights & Globes
        meshesRef.current.lights.forEach(light => {
            light.intensity = settings.pointIntensity;
            light.distance = settings.pointDistance;
            light.decay = settings.pointDecay;
        });

        meshesRef.current.globes.forEach(globe => {
            if (globe.material instanceof THREE.MeshStandardMaterial) {
                globe.material.emissiveIntensity = settings.emissiveIntensity;
                globe.material.needsUpdate = true;
            }
        });

    }, [settings]);

    useEffect(() => {
        if (!mountRef.current) return;

        // Cleanup
        while (mountRef.current.firstChild) {
            mountRef.current.removeChild(mountRef.current.firstChild);
        }

        const scene = new THREE.Scene();
        sceneRef.current = scene;
        scene.background = new THREE.Color(0x000011); // Night Sky
        scene.fog = new THREE.FogExp2(0x000011, 0.002);

        const camera = new THREE.PerspectiveCamera(75, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 6000);
        camera.position.set(0, 30, 80);
        camera.lookAt(0, 5, 0);

        const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
        renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
        renderer.shadowMap.enabled = true;
        mountRef.current.appendChild(renderer.domElement);

        // --- GLOBAL LIGHTS ---
        const ambientLight = new THREE.AmbientLight(0xaaaaff, settings.ambientIntensity);
        scene.add(ambientLight);

        const hemisphereLight = new THREE.HemisphereLight(0x000011, 0x111122, settings.hemisphereIntensity);
        scene.add(hemisphereLight);

        const dirLight = new THREE.DirectionalLight(0xddddff, settings.directionalIntensity);
        dirLight.position.set(50, 100, 50);
        dirLight.castShadow = true;
        scene.add(dirLight);

        lightingRef.current = { ambient: ambientLight, hemi: hemisphereLight, dir: dirLight };

        // --- SCENE OBJECTS ---
        // Floor
        const planeGeo = new THREE.PlaneGeometry(2000, 2000);
        const planeMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
        const plane = new THREE.Mesh(planeGeo, planeMat);
        plane.rotation.x = -Math.PI / 2;
        plane.receiveShadow = true;
        scene.add(plane);

        // Ship
        const ship = new Ship(scene, true, { ...SHIP_STATS.fighter, color: 0xcc0000, type: 'fighter' });
        ship.mesh.position.y = 5;

        // --- POINT LIGHTS TEST ---
        // Add a row of globes
        const globeGeo = new THREE.SphereGeometry(4, 16, 16);
        const numGlobes = 6;
        const spacing = 40;

        for (let i = -numGlobes / 2; i < numGlobes / 2; i++) {
            const x = i * spacing;
            const z = -50; // Behind ship
            const pos = new THREE.Vector3(x, 20, z);

            const color = i % 2 === 0 ? 0x00ffff : 0xff00ff;
            const globeMat = new THREE.MeshStandardMaterial({
                color: 0x111111,
                emissive: color,
                emissiveIntensity: settings.emissiveIntensity,
                roughness: 0.1,
                metalness: 0.8
            });

            const globe = new THREE.Mesh(globeGeo, globeMat);
            globe.position.copy(pos);
            scene.add(globe);
            meshesRef.current.globes.push(globe);

            const pointLight = new THREE.PointLight(color, settings.pointIntensity, settings.pointDistance, settings.pointDecay);
            pointLight.position.copy(pos);
            scene.add(pointLight);
            meshesRef.current.lights.push(pointLight);
        }

        // Add one very close to ship to test impact
        const testPos = new THREE.Vector3(20, 10, 20);
        const testGlobe = new THREE.Mesh(globeGeo, new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffff00, emissiveIntensity: settings.emissiveIntensity }));
        testGlobe.position.copy(testPos);
        scene.add(testGlobe);
        meshesRef.current.globes.push(testGlobe);

        const testLight = new THREE.PointLight(0xffff00, settings.pointIntensity, settings.pointDistance, settings.pointDecay);
        testLight.position.copy(testPos);
        scene.add(testLight);
        meshesRef.current.lights.push(testLight);


        // Animation Loop
        let animationId: number;
        const animate = () => {
            animationId = requestAnimationFrame(animate);
            ship.mesh.rotation.y += 0.005;
            renderer.render(scene, camera);
        };
        animate();

        const handleResize = () => {
            if (mountRef.current) {
                camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            cancelAnimationFrame(animationId);
            window.removeEventListener('resize', handleResize);
            renderer.dispose();
            scene.clear();
        };

    }, []); // Only run once on mount

    const handleChange = (key: keyof LightingState, value: number) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    return (
        <div className="relative w-full h-full bg-black">
            <div ref={mountRef} className="w-full h-full" />

            {/* SLIDERS UI */}
            <div className="absolute top-4 right-4 bg-gray-900 bg-opacity-90 p-6 rounded-xl border border-gray-700 text-white w-96 max-h-[90vh] overflow-y-auto">
                <h2 className="text-2xl font-bold mb-6 text-yellow-400">Lighting Debug</h2>

                <div className="space-y-6">
                    {/* GLOBAL */}
                    <div className="border-b border-gray-700 pb-4">
                        <h3 className="text-sm font-bold text-cyan-400 mb-2 uppercase">Global</h3>

                        <Control label="Ambient Intensity" value={settings.ambientIntensity} min={0} max={2} step={0.05} onChange={v => handleChange('ambientIntensity', v)} />
                        <Control label="Hemisphere Int." value={settings.hemisphereIntensity} min={0} max={2} step={0.05} onChange={v => handleChange('hemisphereIntensity', v)} />
                        <Control label="Moon Intensity" value={settings.directionalIntensity} min={0} max={5} step={0.1} onChange={v => handleChange('directionalIntensity', v)} />
                    </div>

                    {/* POINTS */}
                    <div>
                        <h3 className="text-sm font-bold text-purple-400 mb-2 uppercase">Point Lights</h3>

                        <Control label="Intensity" value={settings.pointIntensity} min={0} max={2000} step={10} onChange={v => handleChange('pointIntensity', v)} />
                        <Control label="Distance" value={settings.pointDistance} min={10} max={10000} step={50} onChange={v => handleChange('pointDistance', v)} />
                        <Control label="Decay" value={settings.pointDecay} min={0} max={5} step={0.1} onChange={v => handleChange('pointDecay', v)} />
                        <Control label="Emissive Glow" value={settings.emissiveIntensity} min={0} max={500} step={10} onChange={v => handleChange('emissiveIntensity', v)} />
                    </div>
                </div>

                <div className="mt-8 pt-4 border-t border-gray-600">
                    <button
                        onClick={onBack}
                        className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded shadow-lg"
                    >
                        BACK TO MENU
                    </button>
                </div>
            </div>
        </div>
    );
}

function Control({ label, value, min, max, step, onChange }: { label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void }) {
    return (
        <div className="mb-3">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>{label}</span>
                <span>{value.toFixed(2)}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
        </div>
    );
}
