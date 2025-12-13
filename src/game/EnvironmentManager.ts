import * as THREE from 'three';
import { getTrackFrame } from './TrackFactory';

export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night';
export type Weather = 'clear' | 'fog' | 'rain';

export interface EnvironmentConfig {
    timeOfDay: TimeOfDay;
    weather: Weather;
}

export interface EnvironmentState {
    config: EnvironmentConfig;
    sun: THREE.Mesh | null;
    stars: THREE.Points | null;
    rainSystem: THREE.Points | null;
    lights: {
        ambient: THREE.AmbientLight;
        hemisphere: THREE.HemisphereLight;
        directional: THREE.DirectionalLight;
    };
    globes: { mesh: THREE.Mesh, light: THREE.PointLight }[];
}

// Visual Configurations
const TIME_SETTINGS = {
    morning: {
        skyColor: 0xffd1b3, // Pastel Orange/Pink
        lightColor: 0xfff0dd, // Warm White
        ambientColor: 0x403040,
        sunPosition: new THREE.Vector3(100, 30, 100), // Low East
        sunColor: 0xffaa00,
        fogDensity: 0.0005,
        lightIntensity: 2.0,
        ambientIntensity: 0.5
    },
    day: {
        skyColor: 0x87CEEB, // Sky Blue
        lightColor: 0xffffff, // White
        ambientColor: 0x444444,
        sunPosition: new THREE.Vector3(50, 200, 50), // High Noon
        sunColor: 0xffffcc,
        fogDensity: 0.0005,
        lightIntensity: 4.0,
        ambientIntensity: 0.6
    },
    evening: {
        skyColor: 0x2c1b4e, // Deep Purple/Orange gradient approximation
        lightColor: 0xffccaa, // Reddish
        ambientColor: 0x221133,
        sunPosition: new THREE.Vector3(-100, 20, 50), // Low West
        sunColor: 0xff4422,
        fogDensity: 0.0015, // Reduced from 0.003
        lightIntensity: 2.5,
        ambientIntensity: 0.4
    },
    night: {
        skyColor: 0x000011, // Dark Blue/Black
        lightColor: 0xaaaaff, // Cool Blue
        ambientColor: 0x010105, // Almost black
        sunPosition: new THREE.Vector3(50, 100, 50), // Moon
        sunColor: 0xddddff,
        fogDensity: 0.0004,
        lightIntensity: 0.0, // Very dark moon logic (was 0.8)
        ambientIntensity: 0.0 // Very low ambient (was 0.4 global)
    }
};

const WEATHER_SETTINGS = {
    clear: {
        fogMultiplier: 1.0,
        rain: false
    },
    fog: {
        fogMultiplier: 2.0, // Reduced from 3.0 (was too dense)
        rain: false
    },
    rain: {
        fogMultiplier: 2.0, // Medium fog
        rain: true
    }
};

export class EnvironmentManager {
    private scene: THREE.Scene;
    public state: EnvironmentState | null = null;
    private rainValues: { positions: Float32Array; velocities: Float32Array } | null = null;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    public static generateRandomConfig(): EnvironmentConfig {
        const times: TimeOfDay[] = ['morning', 'day', 'evening', 'night'];
        const weathers: Weather[] = ['clear', 'fog', 'rain', 'clear', 'clear']; // Weighted clear

        // Restrict weird combos
        let time = times[Math.floor(Math.random() * times.length)];
        let weather = weathers[Math.floor(Math.random() * weathers.length)];

        return { timeOfDay: time, weather: weather };
    }

    public setup(config: EnvironmentConfig, trackCurve?: THREE.Curve<THREE.Vector3>, trackId?: string) {
        // Clean up old if needed (though we usually make a new manager/scene)

        const timeSettings = TIME_SETTINGS[config.timeOfDay];
        const weatherSettings = WEATHER_SETTINGS[config.weather];

        // 1. SKY & FOG
        // Adjust density by weather
        const fogDensity = timeSettings.fogDensity * weatherSettings.fogMultiplier;

        this.scene.background = new THREE.Color(timeSettings.skyColor);
        // Use exponential fog for distance fading
        this.scene.fog = new THREE.FogExp2(timeSettings.skyColor, fogDensity);

        // 2. LIGHTING
        // Use configured ambient intensity
        const ambientLight = new THREE.AmbientLight(timeSettings.lightColor, timeSettings.ambientIntensity);
        this.scene.add(ambientLight);

        const hemisphereLight = new THREE.HemisphereLight(
            timeSettings.skyColor,
            timeSettings.ambientColor,
            config.timeOfDay === 'night' ? 0.0 : 0.6 // Reduced from 0.5/1.0
        );
        this.scene.add(hemisphereLight);

        const directionalLight = new THREE.DirectionalLight(timeSettings.lightColor, timeSettings.lightIntensity);
        directionalLight.position.copy(timeSettings.sunPosition);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);

        // 3. SUN / MOON VISUAL
        let sunMesh = null;
        if (config.weather !== 'rain' && config.weather !== 'fog') { // Hide sun in heavy weather
            const sunGeo = new THREE.SphereGeometry(config.timeOfDay === 'night' ? 20 : 50, 32, 32);
            const sunMat = new THREE.MeshBasicMaterial({ color: timeSettings.sunColor });
            sunMesh = new THREE.Mesh(sunGeo, sunMat);

            // Position far away in direction of light
            const lightDir = timeSettings.sunPosition.clone().normalize();
            sunMesh.position.copy(lightDir.multiplyScalar(4000));
            this.scene.add(sunMesh);
        }

        // 4. STARS (Night only)
        let stars = null;
        if (config.timeOfDay === 'night' && config.weather === 'clear') {
            const starGeo = new THREE.BufferGeometry();
            const starCount = 2000;
            const positions = new Float32Array(starCount * 3);

            for (let i = 0; i < starCount * 3; i++) {
                positions[i] = (Math.random() - 0.5) * 4000; // Spread wide
            }

            starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false });
            stars = new THREE.Points(starGeo, starMat);
            // Ensure stars don't block the track (render order or massive scale)
            // Or just move them high up
            this.scene.add(stars);
        }

        // 4b. GLOWGLOBES (Night, Evening, or Fog)
        // Enable lights if it's dark OR visibility is low
        const useLights = config.timeOfDay === 'night' || config.timeOfDay === 'evening' || config.weather === 'fog';

        const globes: { mesh: THREE.Mesh, light: THREE.PointLight }[] = [];
        if (useLights && trackCurve) {
            const globeGeo = new THREE.SphereGeometry(4, 16, 16);

            // Custom Globe Count for specific tracks
            let numGlobes = 40;
            let lightBoost = 1.0; // Default brightness

            if (trackId === 'track_4') {
                numGlobes = 50; // High count for visual density
                lightBoost = 10.0; // DOUBLE brightness because we have fewer real lights per meter
            }

            // SAFETY LIMIT: WebGL typically crashes with > 50-100 forward lights depending on driver.
            // We set a hard safe limit for REAL lights.
            // const MAX_REAL_LIGHTS = 40;   /// nut sure.
            // const lightInterval = Math.ceil(numGlobes / MAX_REAL_LIGHTS);

            const globeMat = new THREE.MeshStandardMaterial({
                color: 0x111111, // Dark base
                roughness: 0.1,
                metalness: 0.8
            });

            // Reduced intensity for evening/fog compared to pitch black night
            // Night = 1.0 multiplier
            // Evening/Fog = 0.5 multiplier
            const intensityMult = config.timeOfDay === 'night' ? 1.0 : 0.5;

            for (let i = 0; i < numGlobes; i++) {
                const progress = i / numGlobes;
                // Offset progress to not be exactly at start/end if unwanted
                const { position, normal, binormal } = getTrackFrame(trackCurve, progress);

                // Alternate Left/Right
                const side = i % 2 === 0 ? 1 : -1;
                const offsetSide = 100 * side; // Further out (was 50)
                const offsetUp = 30; // 30 units up

                const globePos = position.clone()
                    .add(binormal.multiplyScalar(offsetSide))
                    .add(normal.multiplyScalar(offsetUp));

                // Determine Color (Cyan or Purple)
                const color = i % 2 === 0 ? 0x00ffff : 0xff00ff;

                // Clone material to allow individual emissive color without sharing
                const mat = globeMat.clone();
                mat.emissive.setHex(color);
                mat.emissiveIntensity = 30.0 * intensityMult; // Scale glow

                const globe = new THREE.Mesh(globeGeo, mat);
                globe.position.copy(globePos);
                this.scene.add(globe);

                // Add Point Light
                const pointLight = new THREE.PointLight(color, 1500 * intensityMult * lightBoost, 4800, 1.3);
                pointLight.position.copy(globePos);
                this.scene.add(pointLight);

                globes.push({ mesh: globe, light: pointLight });
            }
        }

        // 5. RAIN
        let rainSystem = null;
        if (weatherSettings.rain) {
            const rainCount = 30000; // Increased density
            const rainGeo = new THREE.BufferGeometry();
            const positions = new Float32Array(rainCount * 3);
            this.rainValues = {
                positions: positions,
                velocities: new Float32Array(rainCount)
            };

            for (let i = 0; i < rainCount; i++) {
                positions[i * 3] = (Math.random() - 0.5) * 400; // x
                positions[i * 3 + 1] = Math.random() * 200; // y
                positions[i * 3 + 2] = (Math.random() - 0.5) * 400; // z
                this.rainValues.velocities[i] = -(Math.random() * 2 + 3); // Fall speed
            }

            rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            const rainMat = new THREE.PointsMaterial({
                color: 0x666666,
                size: 0.2,
                transparent: true,
                opacity: 0.4
            });

            rainSystem = new THREE.Points(rainGeo, rainMat);
            this.scene.add(rainSystem);
        }

        this.state = {
            config,
            sun: sunMesh,
            stars,
            rainSystem,
            lights: { ambient: ambientLight, hemisphere: hemisphereLight, directional: directionalLight },
            globes: globes
        };
    }

    public update(dt: number, playerPos: THREE.Vector3) {
        if (!this.state) return;

        // Follow player with rain
        if (this.state.rainSystem && this.rainValues) {
            const positions = this.state.rainSystem.geometry.attributes.position.array as Float32Array;
            const count = positions.length / 3;

            for (let i = 0; i < count; i++) {
                // Drop down
                positions[i * 3 + 1] += this.rainValues.velocities[i] * dt * 20;

                // Check floor/reset
                // We want rain to be around the player.
                // If rain is too far below player, reset to above
                if (positions[i * 3 + 1] < playerPos.y - 20) {
                    positions[i * 3 + 1] = playerPos.y + 100 + Math.random() * 50;
                    positions[i * 3] = playerPos.x + (Math.random() - 0.5) * 400;
                    positions[i * 3 + 2] = playerPos.z + (Math.random() - 0.5) * 400;
                }
            }
            this.state.rainSystem.geometry.attributes.position.needsUpdate = true;
        }

        // Follow player with directional light target (for shadows)
        if (this.state.lights.directional) {
            // Keep light offset relative to player
            const offset = TIME_SETTINGS[this.state.config.timeOfDay].sunPosition.clone().normalize().multiplyScalar(100);
            this.state.lights.directional.position.copy(playerPos).add(offset);
            this.state.lights.directional.target.position.copy(playerPos);
            this.state.lights.directional.target.updateMatrixWorld();
        }

        // Move Sun mesh to stay far away but relative to camera? No, sun is infinite.
        // Just keep it at a fixed distance from player so it doesn't get clipped or look weirdly parallaxed?
        if (this.state.sun) {
            const sunDir = TIME_SETTINGS[this.state.config.timeOfDay].sunPosition.clone().normalize();
            this.state.sun.position.copy(playerPos).add(sunDir.multiplyScalar(4000));
        }

        if (this.state.stars) {
            this.state.stars.position.copy(playerPos); // Stars feel infinite, move with us
        }
    }
}
