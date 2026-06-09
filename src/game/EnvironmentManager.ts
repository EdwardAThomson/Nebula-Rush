import * as THREE from 'three';
import { getTrackFrame } from './TrackFactory';

export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night';
export type Weather = 'clear' | 'fog' | 'rain';

export interface EnvironmentConfig {
    timeOfDay: TimeOfDay;
    weather: Weather;
    // Deep-space dressing: nebula skybox, always-on starfield, distant planets.
    // Overlays the chosen timeOfDay (which still drives the star/sun lighting),
    // so a cup can read as "in space" while keeping per-track lighting variety.
    space?: boolean;
    // Open desert canyon: skip the distance fog and the glowglobes (which sit out
    // in the rock walls and tank perf at night). Set from TrackConfig.terrain.
    terrain?: 'canyon';
}

export interface EnvironmentState {
    config: EnvironmentConfig;
    sun: THREE.Mesh | null;
    stars: THREE.Object3D | null;
    rainSystem: THREE.Points | null;
    lights: {
        ambient: THREE.AmbientLight;
        hemisphere: THREE.HemisphereLight;
        directional: THREE.DirectionalLight;
    };
    globes: { mesh: THREE.Mesh, light: THREE.PointLight }[];
    planets: THREE.Object3D[]; // distant deep-space bodies (follow the player)
}

// Painted equirectangular nebula for the deep-space skybox: a dark base with a
// few soft coloured cloud blobs and scattered stars. Cheap (one canvas), and
// avoids a heavy procedural shader. Seeded so each track gets a stable but
// distinct sky.

// FNV-1a string hash → 32-bit seed.
const hashString = (s: string): number => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
};

// mulberry32 PRNG: deterministic stream of [0,1) from a seed.
const mulberry32 = (seed: number) => {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

// Palette of distant-body looks. `glow` marks self-lit bodies (lava/ember).
const PLANET_PALETTES = [
    { color: 0x4a6fa5, emissive: 0x10203a },              // azure gas giant
    { color: 0xc8884a, emissive: 0x2a1604 },              // amber
    { color: 0x3f8f7a, emissive: 0x05231c },              // jade
    { color: 0x7a5fb0, emissive: 0x1a1030 },              // violet
    { color: 0xb05a3a, emissive: 0x2a0e06 },              // rust
    { color: 0xbfe0ef, emissive: 0x18303a },              // ice
    { color: 0xbfc4cc, emissive: 0x1a1d22 },              // pale moon
    { color: 0x802a1a, emissive: 0xaa2200, glow: true },  // ember/lava
];

// Build one distant body (optionally ringed) and place it around the player.
const createPlanet = (rng: () => number, index: number, count: number): THREE.Object3D => {
    const pal = PLANET_PALETTES[Math.floor(rng() * PLANET_PALETTES.length)];
    const radius = 120 + rng() * 200; // capped so a body never looms like a wall
    const group = new THREE.Group();

    const body = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 32, 32),
        new THREE.MeshStandardMaterial({
            color: pal.color,
            emissive: pal.emissive,
            emissiveIntensity: pal.glow ? 1.3 : 0.5,
            roughness: 1.0,
            metalness: 0.0,
        })
    );
    group.add(body);

    // ~40% of bodies (more often the big ones) get a ring.
    if (rng() < 0.3 + radius / 1400) {
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(radius * 1.4, radius * 2.1, 64),
            new THREE.MeshBasicMaterial({ color: pal.color, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
        );
        ring.rotation.set(Math.PI / 2.4 + (rng() - 0.5) * 0.8, rng() * 0.6, 0);
        group.add(ring);
    }

    // Spread bodies around the player: split the circle into slots + jitter, so
    // they don't clump. Distance keeps them in front of the star shell (~4600).
    const az = ((index + rng() * 0.6) / count) * Math.PI * 2;
    const dist = 2200 + rng() * 900; // far enough to read as a distant body
    const y = 450 + rng() * 750;
    group.position.set(Math.cos(az) * dist, y, Math.sin(az) * dist);
    return group;
};

type NebulaCloud = { x: number; y: number; r: number; c: string };

// The original hand-tuned nebula for Track 1 (kept by request).
const TRACK1_CLOUDS: NebulaCloud[] = [
    { x: 0.25, y: 0.45, r: 0.45, c: '64,0,128' },   // purple
    { x: 0.65, y: 0.35, r: 0.55, c: '0,90,140' },   // teal
    { x: 0.80, y: 0.70, r: 0.40, c: '150,20,90' },  // magenta
    { x: 0.10, y: 0.75, r: 0.35, c: '20,40,120' },  // blue
];

const NEBULA_CLOUD_COLORS = ['64,0,128', '0,90,140', '150,20,90', '20,40,120', '120,40,140', '0,120,110', '150,60,30'];

// A crisp screen-space-sized starfield layer. `gen` supplies each star's
// position. Kept as real points (not baked into the sky texture) so they stay
// sharp at any distance.
const makeStarLayer = (count: number, size: number, opacity: number, gen: () => [number, number, number], color: number = 0xffffff): THREE.Points => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const [x, y, z] = gen();
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size, sizeAttenuation: false, transparent: true, opacity });
    return new THREE.Points(geo, mat);
};

// The original hand-placed deep-space pair (kept for Track 1): a ringed blue-grey
// gas giant and a pale moon.
const createClassicPlanets = (): THREE.Object3D[] => {
    const giant = new THREE.Group();
    giant.add(new THREE.Mesh(
        new THREE.SphereGeometry(360, 32, 32),
        new THREE.MeshStandardMaterial({ color: 0x4a6fa5, emissive: 0x10203a, emissiveIntensity: 0.5, roughness: 1.0, metalness: 0.0 })
    ));
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(480, 700, 64),
        new THREE.MeshBasicMaterial({ color: 0x7fa8d0, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    ring.rotation.set(Math.PI / 2.4, 0.3, 0);
    giant.add(ring);
    giant.position.set(-1800, 700, -2000);

    const moon = new THREE.Mesh(
        new THREE.SphereGeometry(150, 24, 24),
        new THREE.MeshStandardMaterial({ color: 0xbfc4cc, emissive: 0x1a1d22, emissiveIntensity: 0.4, roughness: 1.0, metalness: 0.0 })
    );
    moon.position.set(1700, 450, -1700);

    return [giant, moon];
};

const createNebulaTexture = (rng: () => number, fixedClouds?: NebulaCloud[], tint?: { base: string; screen?: string }): THREE.Texture => {
    const W = 2048, H = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // Deep space base (time-of-day shifts the backdrop colour/brightness in space)
    ctx.fillStyle = tint?.base ?? '#05060f';
    ctx.fillRect(0, 0, W, H);

    // Clouds: either the fixed Track 1 set, or a seeded set kept in a mid band so
    // the equirect poles don't smear them.
    let clouds: NebulaCloud[];
    if (fixedClouds) {
        clouds = fixedClouds;
    } else {
        const cloudCount = 3 + Math.floor(rng() * 3); // 3–5
        clouds = [];
        for (let i = 0; i < cloudCount; i++) {
            clouds.push({
                x: rng(),
                y: 0.28 + rng() * 0.44,   // keep away from the poles
                r: 0.3 + rng() * 0.35,
                c: NEBULA_CLOUD_COLORS[Math.floor(rng() * NEBULA_CLOUD_COLORS.length)],
            });
        }
    }

    // Draw each cloud, plus wrapped copies one canvas-width to each side, so a
    // cloud straddling the left/right edge blends across the equirect seam
    // instead of being hard-clipped (which showed up as a vertical "wall").
    for (const cl of clouds) {
        const cy = cl.y * H, rad = cl.r * H;
        for (const cx of [cl.x * W - W, cl.x * W, cl.x * W + W]) {
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
            g.addColorStop(0, `rgba(${cl.c},0.5)`);
            g.addColorStop(0.5, `rgba(${cl.c},0.18)`);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
        }
    }

    // Faint small background dust only — the bright/large stars come from the 3D
    // starfield (crisp), not this low-res texture (which magnified to a blur).
    for (let i = 0; i < 1200; i++) {
        const x = rng() * W, y = rng() * H;
        const s = rng();
        ctx.fillStyle = `rgba(255,255,255,${0.25 + s * 0.35})`;
        ctx.fillRect(x, y, 1, 1);
    }

    // Time-of-day wash: a screen-blended tint lifts the whole sky toward the
    // time's hue/brightness (bright cool day, warm dawn, magenta dusk, faint night).
    if (tint?.screen) {
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = tint.screen;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
};

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
        ambientColor: 0x0a0a18, // Very dark blue-grey
        sunPosition: new THREE.Vector3(50, 100, 50), // Moon
        sunColor: 0xddddff,
        // Fog is a brighter blue-grey than the sky so it's actually visible against the dark backdrop.
        fogColor: 0x1a223a,
        fogDensity: 0.0006,
        // Soft moonlight baseline so long stretches between globes aren't pitch black.
        lightIntensity: 0.55,
        ambientIntensity: 0.28
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

// Deep-space time-of-day looks. In space there's no atmosphere to colour, so
// each time gets a distinct backdrop tint, render exposure, and starfield
// brightness/colour. `base` is the nebula's deep-space fill; `screen` is a
// screen-blended wash that lifts the sky toward that time's hue/brightness;
// `exposure` drives the renderer tone-mapping; `starOpacityMul`/`starColor`
// make stars blaze at night and wash out by day.
const SPACE_TIME: Record<TimeOfDay, { base: string; screen?: string; exposure: number; starOpacityMul: number; starColor: number }> = {
    morning: { base: '#0a0710', screen: 'rgba(72,36,46,0.18)', exposure: 1.0, starOpacityMul: 0.7, starColor: 0xfff0e6 },
    day:     { base: '#0b1322', screen: 'rgba(46,78,122,0.26)', exposure: 1.15, starOpacityMul: 0.45, starColor: 0xffffff },
    evening: { base: '#090610', screen: 'rgba(86,30,66,0.13)', exposure: 0.72, starOpacityMul: 0.85, starColor: 0xffe2d2 },
    night:   { base: '#010205', screen: 'rgba(16,20,42,0.05)', exposure: 0.55, starOpacityMul: 1.0, starColor: 0xcdd6ff },
};

export class EnvironmentManager {
    private scene: THREE.Scene;
    public state: EnvironmentState | null = null;
    // Suggested renderer tone-mapping exposure for the current setup (space only;
    // 1.0 otherwise). Game.tsx reads this after setup() to dim night / brighten day.
    public exposure = 1.0;
    private rainValues: { positions: Float32Array; velocities: Float32Array } | null = null;
    private planetOffsets = new Map<THREE.Object3D, THREE.Vector3>();

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
        // Deep-space time-of-day look (null on planet-side tracks).
        const spaceTime = config.space ? SPACE_TIME[config.timeOfDay] : null;
        this.exposure = spaceTime ? spaceTime.exposure : 1.0;

        // Per-track sky RNG: same track id → same nebula, stars and planets every
        // time, but each track gets its own distinct sky.
        const skyRng = mulberry32(hashString(trackId ?? 'space'));

        // 1. SKY & FOG
        // Adjust density by weather
        const fogDensity = timeSettings.fogDensity * weatherSettings.fogMultiplier;

        if (config.space) {
            // Deep-space: nebula skybox + very thin dark fog so the distant
            // planets and nebula stay visible (FogExp2 erases far objects fast).
            // Track 1 keeps its original hand-tuned nebula; others vary per seed.
            this.scene.background = createNebulaTexture(
                skyRng,
                trackId === 'track_1' ? TRACK1_CLOUDS : undefined,
                spaceTime ? { base: spaceTime.base, screen: spaceTime.screen } : undefined,
            );
            this.scene.fog = new THREE.FogExp2(0x070912, 0.00012);
        } else if (config.terrain === 'canyon') {
            // Open desert: keep the time's sky colour, but no distance fog — the
            // time fog (evening especially) murks the gorge out. Dust supplies haze.
            this.scene.background = new THREE.Color(timeSettings.skyColor);
            this.scene.fog = null;
        } else {
            this.scene.background = new THREE.Color(timeSettings.skyColor);
            // Use exponential fog for distance fading. Some times of day (night) override the fog
            // colour so the fog reads against the sky instead of disappearing into it.
            const fogColor = ('fogColor' in timeSettings ? timeSettings.fogColor : timeSettings.skyColor) as number;
            this.scene.fog = new THREE.FogExp2(fogColor, fogDensity);
        }

        // 2. LIGHTING
        // Use configured ambient intensity. In space, damp the ambient on bright
        // times of day so the dark nebula backdrop still reads.
        const ambientIntensity = config.space
            ? Math.min(timeSettings.ambientIntensity, 0.32)
            : timeSettings.ambientIntensity;
        const ambientLight = new THREE.AmbientLight(timeSettings.lightColor, ambientIntensity);
        this.scene.add(ambientLight);

        const hemisphereLight = new THREE.HemisphereLight(
            timeSettings.skyColor,
            timeSettings.ambientColor,
            config.timeOfDay === 'night' ? 0.4 : 0.6 // Mild sky/ground bounce at night so terrain reads
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
        // Hidden in heavy weather, and in space (the nebula/planets/stars carry the
        // sky there; a flat sun disc just reads as another planet). Lighting is
        // unaffected — the directional light below is separate from this disc.
        if (config.weather !== 'rain' && config.weather !== 'fog' && !config.space) {
            const sunGeo = new THREE.SphereGeometry(config.timeOfDay === 'night' ? 20 : 50, 32, 32);
            const sunMat = new THREE.MeshBasicMaterial({ color: timeSettings.sunColor });
            sunMesh = new THREE.Mesh(sunGeo, sunMat);

            // Position far away in direction of light
            const lightDir = timeSettings.sunPosition.clone().normalize();
            sunMesh.position.copy(lightDir.multiplyScalar(4000));
            this.scene.add(sunMesh);
        }

        // 4. STARS (night, or always in space)
        let stars: THREE.Object3D | null = null;
        if (config.space && config.weather === 'clear') {
            // Far spherical shell (seeded per track), beyond the planets so they
            // occlude it. Two crisp layers: a dense faint field plus fewer bright,
            // bigger stars — both sharp points (not baked into the sky texture).
            const shell = (): [number, number, number] => {
                const u = skyRng() * 2 - 1;
                const theta = skyRng() * Math.PI * 2;
                const s = Math.sqrt(1 - u * u);
                const r = 4600 + skyRng() * 400;
                return [r * s * Math.cos(theta), r * u, r * s * Math.sin(theta)];
            };
            // Stars blaze at night, wash out by day (opacity scaled by time), and
            // pick up the time's tint; the bright layer also grows a touch at night.
            const starMul = spaceTime ? spaceTime.starOpacityMul : 1.0;
            const starCol = spaceTime ? spaceTime.starColor : 0xffffff;
            const brightSize = 3.4 * (config.timeOfDay === 'night' ? 1.25 : 1.0);
            const group = new THREE.Group();
            group.add(makeStarLayer(1700, 1.6, 0.85 * starMul, shell, starCol)); // faint field
            group.add(makeStarLayer(260, brightSize, 1.0 * starMul, shell, starCol)); // bright, bigger
            stars = group;
            this.scene.add(stars);
        } else if (config.timeOfDay === 'night' && config.weather === 'clear') {
            // Night: original near cube (a far shell would be fogged out by the
            // denser night fog).
            const cube = (): [number, number, number] => [
                (Math.random() - 0.5) * 4000,
                (Math.random() - 0.5) * 4000,
                (Math.random() - 0.5) * 4000,
            ];
            stars = makeStarLayer(2000, 2, 1.0, cube);
            this.scene.add(stars);
        }

        // 4a. PLANETS (space only) — a seeded set of distant lit bodies that
        // follow the player so they read as infinitely far. Count, colours,
        // types, sizes and arrangement vary per track.
        const planets: THREE.Object3D[] = [];
        if (config.space) {
            if (trackId === 'track_1') {
                // Track 1 keeps the original hand-placed pair.
                planets.push(...createClassicPlanets());
            } else {
                const planetCount = 2 + Math.floor(skyRng() * 3); // 2–4
                for (let i = 0; i < planetCount; i++) {
                    planets.push(createPlanet(skyRng, i, planetCount));
                }
            }
            planets.forEach((p) => this.scene.add(p));
        }

        // 4b. GLOWGLOBES (Night, Evening, or Fog)
        // Enable lights if it's dark OR visibility is low
        // Canyon skips glowglobes entirely (they sit in the rock walls and 40 real
        // point-lights tank the PBR-heavy desert scene at night/evening).
        const useLights = (config.timeOfDay === 'night' || config.timeOfDay === 'evening' || config.weather === 'fog')
            && config.terrain !== 'canyon';

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

            // In deep space we want a darker, moodier night — halve the glowglobes
            // so they don't wash out the track (planet-side tracks keep full density).
            if (config.space) {
                numGlobes = Math.ceil(numGlobes / 2);
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
            globes: globes,
            planets: planets
        };
        // Remember each planet's offset so it can trail the player (feels infinite).
        planets.forEach((p) => { this.planetOffsets.set(p, p.position.clone()); });
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

        // Distant planets trail the player at their fixed offset (feel infinite).
        for (const planet of this.state.planets) {
            const offset = this.planetOffsets.get(planet);
            if (offset) planet.position.copy(playerPos).add(offset);
        }
    }
}
