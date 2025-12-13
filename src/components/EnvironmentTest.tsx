import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EnvironmentManager, type EnvironmentConfig, type TimeOfDay, type Weather } from '../game/EnvironmentManager';
import { Ship } from '../game/Ship'; // Just to show a ship in the scene
import { SHIP_STATS } from '../game/ShipFactory'; // Default ship stats

interface EnvironmentTestProps {
    onBack: () => void;
}

export default function EnvironmentTest({ onBack }: EnvironmentTestProps) {
    const mountRef = useRef<HTMLDivElement>(null);
    const [config, setConfig] = useState<EnvironmentConfig>({
        timeOfDay: 'day',
        weather: 'clear'
    });

    useEffect(() => {
        if (!mountRef.current) return;

        // Clean up
        while (mountRef.current.firstChild) {
            mountRef.current.removeChild(mountRef.current.firstChild);
        }

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 6000);

        const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
        renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
        renderer.shadowMap.enabled = true;
        mountRef.current.appendChild(renderer.domElement);

        // Env Manager
        const envManager = new EnvironmentManager(scene);
        envManager.setup(config);

        // Ground Plane (to see shadows/lighting)
        const planeGeo = new THREE.PlaneGeometry(2000, 2000);
        const planeMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
        const plane = new THREE.Mesh(planeGeo, planeMat);
        plane.rotation.x = -Math.PI / 2;
        plane.receiveShadow = true;
        scene.add(plane);

        // Simple Box to represent a building/obstacle
        const boxGeo = new THREE.BoxGeometry(20, 50, 20);
        const boxMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.position.set(-50, 25, -50);
        box.castShadow = true;
        box.receiveShadow = true;
        scene.add(box);

        // Ship Model for scale/reflection check
        // We'll just instantiate a ship but not update its physics, just render it.
        const ship = new Ship(scene, true, { ...SHIP_STATS.fighter, color: 0xcc0000, type: 'fighter' });
        // Raise it slightly
        ship.mesh.position.y = 5;

        // Camera Positioning
        camera.position.set(0, 30, 80);
        camera.lookAt(0, 10, 0);

        // Animation Loop
        let animationId: number;
        let lastTime = performance.now();

        const animate = () => {
            animationId = requestAnimationFrame(animate);
            const now = performance.now();
            const dt = (now - lastTime) / 1000 * 60; // relative to 60fps
            lastTime = now;

            // Rotate ship slightly
            ship.mesh.rotation.y += 0.01;

            // Update Environment (rain, lights)
            envManager.update(dt, ship.mesh.position);

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
            // Basic cleanup
            scene.traverse((o) => {
                if (o instanceof THREE.Mesh) {
                    o.geometry.dispose();
                    if (Array.isArray(o.material)) o.material.forEach((m: any) => m.dispose());
                    else o.material.dispose();
                }
            });
        };
    }, [config]); // Re-run effect when config changes

    return (
        <div className="relative w-full h-full bg-black">
            <div ref={mountRef} className="w-full h-full" />

            {/* Controls Overlay */}
            <div className="absolute top-4 left-4 bg-gray-900 bg-opacity-90 p-6 rounded-xl border border-gray-700 text-white w-80">
                <h2 className="text-2xl font-bold mb-6 text-cyan-400">Environment Test</h2>

                <div className="mb-6">
                    <label className="block text-sm font-bold text-gray-500 mb-2 uppercase">Time of Day</label>
                    <div className="grid grid-cols-2 gap-2">
                        {(['morning', 'day', 'evening', 'night'] as TimeOfDay[]).map(t => (
                            <button
                                key={t}
                                onClick={() => setConfig(prev => ({ ...prev, timeOfDay: t }))}
                                className={`px-3 py-2 rounded text-sm font-bold capitalize transition-all ${config.timeOfDay === t ? 'bg-cyan-600 text-white shadow-lg scale-105' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mb-8">
                    <label className="block text-sm font-bold text-gray-500 mb-2 uppercase">Weather</label>
                    <div className="grid grid-cols-2 gap-2">
                        {(['clear', 'fog', 'rain'] as Weather[]).map(w => (
                            <button
                                key={w}
                                onClick={() => setConfig(prev => ({ ...prev, weather: w }))}
                                className={`px-3 py-2 rounded text-sm font-bold capitalize transition-all ${config.weather === w ? 'bg-purple-600 text-white shadow-lg scale-105' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                            >
                                {w}
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    onClick={onBack}
                    className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded shadow-lg border-t border-gray-600"
                >
                    BACK TO MENU
                </button>
            </div>

            <div className="absolute bottom-4 right-4 text-gray-500 text-xs font-mono bg-black bg-opacity-50 p-2 rounded">
                Current: {config.timeOfDay.toUpperCase()} / {config.weather.toUpperCase()}
            </div>
        </div>
    );
}
