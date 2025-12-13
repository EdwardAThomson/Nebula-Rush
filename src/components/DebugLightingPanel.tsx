import { useState } from 'react';
import * as THREE from 'three';
import { EnvironmentManager } from '../game/EnvironmentManager';

interface DebugLightingPanelProps {
    envManagerRef: React.MutableRefObject<EnvironmentManager | null>;
}

export function DebugLightingPanel({ envManagerRef }: DebugLightingPanelProps) {
    const [open, setOpen] = useState(true);
    const [, setUpdate] = useState(0); // Force re-render

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="absolute top-20 right-4 bg-gray-800 text-white p-2 rounded z-50 text-xs border border-gray-600"
            >
                💡 Debug
            </button>
        );
    }

    const updateLight = (type: 'ambient' | 'hemi' | 'dir', val: number) => {
        if (!envManagerRef.current || !envManagerRef.current.state) return;
        const lights = envManagerRef.current.state.lights;
        if (type === 'ambient') lights.ambient.intensity = val;
        if (type === 'hemi') lights.hemisphere.intensity = val;
        if (type === 'dir') lights.directional.intensity = val;
        setUpdate(n => n + 1);
    };

    const getLight = (type: 'ambient' | 'hemi' | 'dir') => {
        if (!envManagerRef.current || !envManagerRef.current.state) return 0;
        const lights = envManagerRef.current.state.lights;
        if (type === 'ambient') return lights.ambient.intensity;
        if (type === 'hemi') return lights.hemisphere.intensity;
        if (type === 'dir') return lights.directional.intensity;
        return 0;
    };

    const updateFog = (val: number) => {
        if (!envManagerRef.current || !envManagerRef.current.state) return;
        const scene = envManagerRef.current.state.lights.ambient.parent as THREE.Scene;
        if (scene && scene.fog instanceof THREE.FogExp2) {
            scene.fog.density = val;
        }
        setUpdate(n => n + 1);
    }

    const getFog = () => {
        if (!envManagerRef.current || !envManagerRef.current.state) return 0;
        const scene = envManagerRef.current.state.lights.ambient.parent as THREE.Scene;
        if (scene && scene.fog instanceof THREE.FogExp2) {
            return scene.fog.density;
        }
        return 0;
    }

    const updateGlobes = (prop: 'intensity' | 'distance' | 'decay' | 'emissive', val: number) => {
        if (!envManagerRef.current || !envManagerRef.current.state) return;
        const globes = envManagerRef.current.state.globes;
        globes.forEach(g => {
            if (prop === 'intensity') g.light.intensity = val;
            if (prop === 'distance') g.light.distance = val;
            if (prop === 'decay') g.light.decay = val;
            if (prop === 'emissive') {
                if (g.mesh.material instanceof THREE.MeshStandardMaterial) {
                    g.mesh.material.emissiveIntensity = val;
                }
            }
        });
        setUpdate(n => n + 1);
    };

    const getGlobe = (prop: 'intensity' | 'distance' | 'decay' | 'emissive') => {
        if (!envManagerRef.current || !envManagerRef.current.state?.globes[0]) return 0;
        const g = envManagerRef.current.state.globes[0];
        if (prop === 'intensity') return g.light.intensity;
        if (prop === 'distance') return g.light.distance;
        if (prop === 'decay') return g.light.decay;
        if (prop === 'emissive') {
            if (g.mesh.material instanceof THREE.MeshStandardMaterial) {
                return g.mesh.material.emissiveIntensity;
            }
        }
        return 0;
    };

    return (
        <div className="absolute top-20 right-4 bg-gray-900 bg-opacity-90 p-4 rounded border border-gray-600 z-50 w-64 text-white text-xs font-mono max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between mb-2">
                <strong className="text-yellow-400">Lighting Debug</strong>
                <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">x</button>
            </div>

            <div className="space-y-4">
                {/* GLOBAL SECTION */}
                <div className="space-y-2 border-b border-gray-700 pb-2">
                    <h3 className="font-bold text-cyan-400 uppercase">Global</h3>
                    <div>
                        <div className="flex justify-between">
                            <span>Ambient</span>
                            <span>{getLight('ambient').toFixed(2)}</span>
                        </div>
                        <input
                            type="range" min="0" max="2" step="0.05"
                            value={getLight('ambient')}
                            onChange={(e) => updateLight('ambient', parseFloat(e.target.value))}
                            className="w-full"
                        />
                    </div>

                    <div>
                        <div className="flex justify-between">
                            <span>Hemisphere</span>
                            <span>{getLight('hemi').toFixed(2)}</span>
                        </div>
                        <input
                            type="range" min="0" max="2" step="0.05"
                            value={getLight('hemi')}
                            onChange={(e) => updateLight('hemi', parseFloat(e.target.value))}
                            className="w-full"
                        />
                    </div>

                    <div>
                        <div className="flex justify-between">
                            <span>Directional</span>
                            <span>{getLight('dir').toFixed(2)}</span>
                        </div>
                        <input
                            type="range" min="0" max="5" step="0.1"
                            value={getLight('dir')}
                            onChange={(e) => updateLight('dir', parseFloat(e.target.value))}
                            className="w-full"
                        />
                    </div>

                    <div>
                        <div className="flex justify-between">
                            <span>Fog Density</span>
                            <span>{getFog().toFixed(4)}</span>
                        </div>
                        <input
                            type="range" min="0" max="0.01" step="0.0001"
                            value={getFog()}
                            onChange={(e) => updateFog(parseFloat(e.target.value))}
                            className="w-full"
                        />
                    </div>
                </div>

                {/* GLOBES SECTION */}
                <div className="space-y-2">
                    <h3 className="font-bold text-purple-400 uppercase">Glow Globes</h3>

                    <div>
                        <div className="flex justify-between">
                            <span>Intensity</span>
                            <span>{getGlobe('intensity').toFixed(0)}</span>
                        </div>
                        <input
                            type="range" min="0" max="5000" step="100"
                            value={getGlobe('intensity')}
                            onChange={(e) => updateGlobes('intensity', parseFloat(e.target.value))}
                            className="w-full"
                        />
                    </div>

                    <div>
                        <div className="flex justify-between">
                            <span>Range (Dist)</span>
                            <span>{getGlobe('distance').toFixed(0)}</span>
                        </div>
                        <input
                            type="range" min="100" max="50000" step="500"
                            value={getGlobe('distance')}
                            onChange={(e) => updateGlobes('distance', parseFloat(e.target.value))}
                            className="w-full"
                        />
                    </div>

                    <div>
                        <div className="flex justify-between">
                            <span>Decay</span>
                            <span>{getGlobe('decay').toFixed(1)}</span>
                        </div>
                        <input
                            type="range" min="0" max="5" step="0.1"
                            value={getGlobe('decay')}
                            onChange={(e) => updateGlobes('decay', parseFloat(e.target.value))}
                            className="w-full"
                        />
                    </div>

                    <div>
                        <div className="flex justify-between">
                            <span>Emissive Glow</span>
                            <span>{getGlobe('emissive').toFixed(0)}</span>
                        </div>
                        <input
                            type="range" min="0" max="1000" step="10"
                            value={getGlobe('emissive')}
                            onChange={(e) => updateGlobes('emissive', parseFloat(e.target.value))}
                            className="w-full"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
