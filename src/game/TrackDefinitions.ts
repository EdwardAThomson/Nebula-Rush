import * as THREE from 'three';

export interface BoostPad {
    trackProgress: number; // 0.0 to 1.0
    lateralPosition: number; // Center of pad
    width: number;
    length: number; // In track progress units (approx)
}

// Track hazards. Detected with the same AABB test as boost pads, but they
// penalise instead of boost:
//  - 'block' : a raised obstacle — first contact bleeds speed + knocks you sideways.
//  - 'slick' : an oil/ice patch — caps your top speed while you're on it.
export type HazardType = 'block' | 'slick';

export interface Hazard {
    type: HazardType;
    trackProgress: number;   // 0.0 to 1.0 along the lap
    lateralPosition: number; // centre offset across the track (0 = centre)
    width: number;           // lateral span
    length: number;          // span in track-progress units (slick patches)
}

// Along-track depth (world units) of a 'block' hazard box. Shared so the
// collision in PhysicsEngine lines up with the visible mesh in TrackFactory.
export const HAZARD_BLOCK_DEPTH = 14;

export interface TrackConfig {
    id: string;
    name: string;
    description: string;
    points: THREE.Vector3[];
    pads: BoostPad[];
    hazards?: Hazard[]; // optional obstacles / slip patches
    difficulty: number; // 1-5
    // Per-track surface palette (F-Zero-style): road base tint + emissive
    // edge-rail / center-line accent. Optional; tracks without it fall back to
    // the plain grey surface.
    surface?: { base: number; accent: number; centerLine?: boolean };
    // Opt-in background depth cues (grid floor + support pillars + ship blob
    // shadow) so the track's rises and dips read against a fixed-altitude floor.
    // See WorldReference. Only enable on tracks without track-over-track
    // crossovers, or pillars will poke through a lower section.
    depthCues?: boolean;
    // Opt-in terrain style for the track's surroundings. 'canyon' lines the track
    // with procedural rock walls over a sandy floor (desert/Sunscorch cup). See
    // CanyonTerrain. Mutually exclusive with depthCues (which is the space grid).
    terrain?: 'canyon';
    // Per-t half-width control points (canyon tracks only). When present, the road
    // bed, the rock walls, and the collision clamp all narrow/widen together via a
    // periodic linear interpolation of these points (see widthAt). Absent → the
    // constant default half-width (60). t wraps on the closed loop.
    widthProfile?: { t: number; half: number }[];
    // Roofed sections (canyon tracks only): t-ranges that get a rock ceiling +
    // glowing strip lights, so you race through a tunnel. Cosmetic — the lateral
    // wall clamp already contains you. Ranges must not wrap past 1.0.
    tunnels?: { start: number; end: number }[];
    // Canyon wall styling (canyon tracks only). Default mode is 'full' (the tall
    // gorge — what tracks with no `canyon` field get). Use 'berm' for low rocky
    // banks (open desert), and per-t `zones` to override stretches: 'full' canyon
    // rock (zone `height` = rim height ABOVE THE DESERT SURFACE — the road should
    // run at/below grade there so the canyon reads as cut into the plain), or a
    // 'viaduct' (parapet + deck + pillars) where the loop crosses over itself.
    // Collision is unaffected — the lateral clamp is independent of wall
    // height/style. Zone edges are blended over a short margin.
    canyon?: {
        wall?: { mode: 'full' | 'berm'; height?: number };
        // Zone modes: 'full' sunken-canyon rock, 'berm' low lips, 'viaduct'
        // (deck + pillars at a crossover), 'ridge' (road on an exposed crest —
        // terrain falls away on BOTH sides; the inverse of 'full'), 'crag'
        // (short road-relative rock towers, e.g. a summit notch).
        zones?: { start: number; end: number; mode: 'full' | 'berm' | 'viaduct' | 'ridge' | 'crag'; height?: number }[];
    };
    // Steady lateral WIND (canyon/storm tracks): dir is a world-XZ direction the
    // wind blows TOWARD; strength is lateral velocity injected per frame at full
    // exposure and full gust. The per-t exposure profile (interpolated like
    // widthProfile) maps shelter: 0 = becalmed lee, 1 = fully exposed crest.
    // Gusting over time is applied by the engine on top.
    wind?: { dir: [number, number]; strength: number; exposure: { t: number; e: number }[] };
    // Directional SUN GLARE (canyon tracks): a low, world-fixed golden sun. `dir`
    // is the world-XZ direction TOWARD the sun (sets the golden-sunset lighting).
    // `glareZone` keys the white-out to ONE spot — a crest you climb into the sun:
    // glare builds from `start`, peaks at `peak` (the crest), clears by `end`.
    // Visibility only, never control.
    sun?: { dir: [number, number]; strength?: number; glareZone?: { start: number; peak: number; end: number } };
}

// Default canyon road half-width (world units) when a track has no widthProfile.
// Matches the legacy flatBottomWidth/2 so existing canyon tracks are unchanged.
export const CANYON_DEFAULT_HALF = 60;

// Periodic linear interpolation of a track's half-width profile at t∈[0,1).
// Control points are sorted by t and wrap around the closed loop, so the gorge
// width is continuous across the start/finish seam. Single source of truth for
// the road mesh, the canyon walls, and the collision clamp.
export const widthAt = (profile: { t: number; half: number }[] | undefined, t: number): number => {
    if (!profile || profile.length === 0) return CANYON_DEFAULT_HALF;
    if (profile.length === 1) return profile[0].half;
    const pts = [...profile].sort((a, b) => a.t - b.t);
    const tt = ((t % 1) + 1) % 1;
    // Find the bracketing pair, wrapping the last→first across the seam.
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const aT = a.t;
        const bT = i + 1 < pts.length ? b.t : b.t + 1; // wrap span crosses 1.0
        if (tt >= aT && tt <= bT) {
            const f = bT === aT ? 0 : (tt - aT) / (bT - aT);
            return a.half + (b.half - a.half) * f;
        }
        // Also test the wrapped region before the first point (tt < pts[0].t).
        if (i === pts.length - 1) {
            const f = (tt + 1 - aT) / (bT - aT);
            return a.half + (b.half - a.half) * f;
        }
    }
    return pts[0].half;
};

const SCALE = 12.0;

export const TRACK_1: TrackConfig = {
    id: 'track_1',
    name: 'The Awakening',
    description: 'A deformed oval with wide straights and a massive jump. Perfect for beginners.',
    difficulty: 1,
    surface: { base: 0x2a3340, accent: 0x00e5ff }, // dark blue-grey road, cyan rails
    depthCues: true, // first pass: grid floor + pillars + blob shadow (no crossovers here)
    points: [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -400),
        new THREE.Vector3(100, 20, -600), // Slight elevation
        new THREE.Vector3(300, 40, -800),
        new THREE.Vector3(500, 20, -600), // Curve right
        new THREE.Vector3(600, 0, -300),
        new THREE.Vector3(500, -20, 0),   // Dip down
        new THREE.Vector3(300, 0, 200),
        new THREE.Vector3(0, 50, 400),    // Big jump/hill
        new THREE.Vector3(-300, 30, 600),
        new THREE.Vector3(-600, 0, 400),  // Wide left turn
        new THREE.Vector3(-400, 0, 200),  // Smoother transition
        new THREE.Vector3(0, 0, 200)      // Straight approach to start line (0,0,0) -> (0,0,-400)
    ].map(p => p.multiplyScalar(SCALE * 2)),
    pads: [
        { trackProgress: 0.15, lateralPosition: 0, width: 40, length: 0.02 },
        { trackProgress: 0.35, lateralPosition: -30, width: 40, length: 0.02 },
        { trackProgress: 0.55, lateralPosition: 30, width: 40, length: 0.02 },
        { trackProgress: 0.85, lateralPosition: 0, width: 40, length: 0.02 },
    ],
    hazards: [
        { type: 'slick', trackProgress: 0.25, lateralPosition: -22, width: 32, length: 0.03 }, // offset left → clear lane to the right
        { type: 'slick', trackProgress: 0.62, lateralPosition: 22, width: 32, length: 0.03 },  // offset right → clear lane to the left
    ]
};

// Placeholder for Track 2 (will be populated later)
export const TRACK_2: TrackConfig = {
    id: 'track_2',
    name: 'Asteroid Slalom',
    description: 'Wide turns replaced by tight rhythmic curves. Precision is key.',
    difficulty: 2,
    surface: { base: 0x3a3026, accent: 0xff8c1a }, // warm dark road, amber rails
    depthCues: true, // flat slalom, no crossovers
    points: [
        new THREE.Vector3(0, 0, 0),         // Start
        new THREE.Vector3(0, 0, -500),      // Straight (Extended)

        // Smoother Slalom (Less Amplitude, More Spacing)
        new THREE.Vector3(-150, 0, -1000),  // Left Turn 1 (Smoother)
        new THREE.Vector3(0, 0, -1400),     // Center Smoothing
        new THREE.Vector3(150, 0, -1800),   // Right Turn 2
        new THREE.Vector3(0, 0, -2200),     // Center Smoothing
        new THREE.Vector3(-150, 0, -2600),  // Left Turn 3
        new THREE.Vector3(0, 0, -3000),     // Center Smoothing
        new THREE.Vector3(150, 0, -3400),   // Right Turn 4

        new THREE.Vector3(0, 0, -3800),     // Straight Exit

        // Rounded Return Loop
        new THREE.Vector3(0, 0, -4200),     // Push deeper
        new THREE.Vector3(300, 0, -4400),   // Start Turn
        new THREE.Vector3(700, 0, -4200),   // Apex
        new THREE.Vector3(900, 0, -3600),   // Exit Turn

        new THREE.Vector3(900, 0, -3000),   // Wide Loop Back (Merged)
        new THREE.Vector3(900, 0, -500),    // Long Return Straight
        new THREE.Vector3(500, 0, 300),     // Final Turn entry (Wider) (Wider)
    ].map(p => p.multiplyScalar(SCALE * 1.5)),
    pads: [
        { trackProgress: 0.25, lateralPosition: -20, width: 30, length: 0.02 }, // Slalom Entry
        { trackProgress: 0.45, lateralPosition: 20, width: 30, length: 0.02 },  // Mid Slalom
        { trackProgress: 0.75, lateralPosition: 0, width: 40, length: 0.03 },   // Back Straight Long Boost
    ],
    hazards: [
        // Cluster of 3 blocks — thread the open lane on the right.
        { type: 'block', trackProgress: 0.30, lateralPosition: -36, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.30, lateralPosition: -18, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.30, lateralPosition: 0, width: 16, length: 0.015 },
        // Cluster of 3 blocks — thread the open lane on the left.
        { type: 'block', trackProgress: 0.55, lateralPosition: 0, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.55, lateralPosition: 18, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.55, lateralPosition: 36, width: 16, length: 0.015 },
        // Offset slick → clear lane on the left.
        { type: 'slick', trackProgress: 0.85, lateralPosition: 22, width: 32, length: 0.035 },
    ]
};

// Track 3: The Nebula Complex
export const TRACK_3: TrackConfig = {
    id: 'track_3',
    name: 'Nebula Complex',
    description: 'A technical circuit intertwining with an orbital station. Features a corkscrew dive and high-G turns.',
    difficulty: 3,
    surface: { base: 0x2e2640, accent: 0xff3df0 }, // dark purple road, magenta rails
    depthCues: true, // has a cross-over; pillars auto-skip lower decks
    points: [
        new THREE.Vector3(0, 0, 0),          // Start
        new THREE.Vector3(0, 0, -500),       // Extended Straight (was -300)
        new THREE.Vector3(100, 10, -600),    // Gentle Entry (Slower X change)
        new THREE.Vector3(250, 40, -500),    // Climbing Right Turn
        new THREE.Vector3(350, 60, -400),    // Smoothing
        new THREE.Vector3(400, 80, -300),    // High Apex
        new THREE.Vector3(350, 60, -200),    // Smoothing
        new THREE.Vector3(250, 40, -100),    // Descending Right Loop
        new THREE.Vector3(100, 80, -200),    // Smoothing into cross-over
        new THREE.Vector3(0, 120, -300),     // Cross-over (Flying over straight)
        new THREE.Vector3(-100, 80, -400),   // Entry to Corkscrew
        new THREE.Vector3(-200, -40, -500),  // Diving Left ("The Corkscrew")
        new THREE.Vector3(-300, -60, -650),  // Mid-Dive Smoothing
        new THREE.Vector3(-400, -80, -800),  // Deep Low Point
        new THREE.Vector3(-300, -40, -950),  // Climbing out smoothing
        new THREE.Vector3(-200, 0, -1100),   // Climbing out
        new THREE.Vector3(0, 0, -1300),      // Back Straight
        new THREE.Vector3(300, 0, -1100),    // Final complex entry
        new THREE.Vector3(200, 0, -500),     // Long return sweep
        new THREE.Vector3(250, 0, -200),     // Stay Wide
        new THREE.Vector3(300, 0, 100),      // Very Wide Entry
        new THREE.Vector3(250, 0, 300),      // Big Spoon Curve 1
        new THREE.Vector3(100, 0, 400),      // Big Spoon Curve 2 (Deepest point)
        new THREE.Vector3(0, 0, 300),        // Aligned straight (further back)
    ].map(p => p.multiplyScalar(SCALE * 2.5)),
    pads: [
        { trackProgress: 0.1, lateralPosition: 0, width: 30, length: 0.02 },  // Early boost
        { trackProgress: 0.45, lateralPosition: -20, width: 30, length: 0.02 }, // Post-corkscrew
        { trackProgress: 0.7, lateralPosition: 20, width: 30, length: 0.02 },   // Back straight
        { trackProgress: 0.9, lateralPosition: 0, width: 40, length: 0.02 },    // Final sprint
    ],
    hazards: [
        // Offset slick → clear lane on the left.
        { type: 'slick', trackProgress: 0.30, lateralPosition: 22, width: 32, length: 0.03 },
        // Cluster of 3 blocks — thread the open lane on the left.
        { type: 'block', trackProgress: 0.60, lateralPosition: 0, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.60, lateralPosition: 18, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.60, lateralPosition: 36, width: 16, length: 0.015 },
        // Cluster of 3 blocks — thread the open lane on the right.
        { type: 'block', trackProgress: 0.82, lateralPosition: -36, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.82, lateralPosition: -18, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.82, lateralPosition: 0, width: 16, length: 0.015 },
    ]
};

// Track 4: Hyperion Raceway
export const TRACK_4: TrackConfig = {
    id: 'track_4',
    name: 'Hyperion Raceway',
    description: 'Features a massive vertical loop, a figure-8 crossover, and a death-defying final jump.',
    difficulty: 4,
    surface: { base: 0x2c3a2c, accent: 0x39ff7a }, // dark slate-green road, green rails
    depthCues: true, // flyover crossover; pillars auto-skip lower decks
    points: [
        new THREE.Vector3(0, 0, 0),          // Start
        new THREE.Vector3(0, 0, -600),       // Long High Speed Straight
        new THREE.Vector3(100, 0, -900),     // Gentle Drift Right
        new THREE.Vector3(300, 20, -1100),   // Climbing Right
        // Smoothed Hook Turn
        new THREE.Vector3(500, 50, -1000),   // Hook Turn Entry
        new THREE.Vector3(650, 70, -900),    // Mid-turn 1
        new THREE.Vector3(700, 80, -800),    // Apex (Wider)
        new THREE.Vector3(650, 70, -700),    // Mid-turn 2
        new THREE.Vector3(500, 60, -600),    // Dive Back

        // Fixed Intersection (Flyover)
        new THREE.Vector3(200, 80, -500),    // Climbing to Flyover (was 20, -500)
        new THREE.Vector3(0, 150, -400),     // Flyover Apex (Clear of the straight below, was 0, -400)
        new THREE.Vector3(-200, 80, -350),   // Descent
        new THREE.Vector3(-300, 0, -300),    // Touchdown/Bank

        new THREE.Vector3(-500, 20, -500),   // Climbing Left
        new THREE.Vector3(-600, 80, -800),   // High Ridge
        new THREE.Vector3(-500, 100, -1100), // Peak
        new THREE.Vector3(-200, 50, -1400),  // Diving Straight
        new THREE.Vector3(0, 20, -1600),     // Compression
        new THREE.Vector3(200, 50, -1800),   // Launch Ramp Entry
        new THREE.Vector3(0, 80, -2100),     // The Jump Apex
        new THREE.Vector3(-200, 40, -2300),  // Landing Zone
        new THREE.Vector3(-400, 20, -2500),  // Run out

        // Smoothed Final Hairpin
        new THREE.Vector3(-600, 0, -2400),   // Final Hairpin Entry (Extended)
        new THREE.Vector3(-800, 0, -2300),   // Turn In
        new THREE.Vector3(-950, 0, -2100),   // Wide Apex 1
        new THREE.Vector3(-950, 0, -1900),   // Wide Apex 2
        new THREE.Vector3(-800, 0, -1700),   // Turn Out
        new THREE.Vector3(-600, 0, -1500),   // Return Straight

        // Final Approach (Looping around to align with start)
        new THREE.Vector3(-550, 0, -1200),   // Long Return (shifted left)
        new THREE.Vector3(-600, 0, -600),    // Wide Left Approach
        new THREE.Vector3(-500, 0, 0),       // Abeam Start (Wide)
        new THREE.Vector3(-300, 0, 500),     // Turn In Base
        new THREE.Vector3(0, 0, 600),        // Final Alignment (Back of grid)
        // Next point is Start (0,0,0) -> (0,0,-600), creating a perfect straight line through the finish.
    ].map(p => p.multiplyScalar(SCALE * 2)),
    pads: [
        { trackProgress: 0.1, lateralPosition: 0, width: 40, length: 0.03 },    // Start Boost
        { trackProgress: 0.35, lateralPosition: 30, width: 30, length: 0.02 },  // Hook Exit
        { trackProgress: 0.6, lateralPosition: -20, width: 30, length: 0.02 },  // Pre-Jump
        { trackProgress: 0.9, lateralPosition: 0, width: 50, length: 0.04 },    // Final Straight
    ],
    hazards: [
        // Slick on the opening section — clear lane on the right.
        { type: 'slick', trackProgress: 0.20, lateralPosition: -22, width: 32, length: 0.03 },
        // Block cluster — thread the gap on the right.
        { type: 'block', trackProgress: 0.45, lateralPosition: -36, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.45, lateralPosition: -18, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.45, lateralPosition: 0, width: 16, length: 0.015 },
        // Block cluster — thread the gap on the left.
        { type: 'block', trackProgress: 0.72, lateralPosition: 0, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.72, lateralPosition: 18, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.72, lateralPosition: 36, width: 16, length: 0.015 },
        // Slick on the return — clear lane on the left.
        { type: 'slick', trackProgress: 0.82, lateralPosition: 22, width: 32, length: 0.03 },
    ]
};



// Track 5: Stellar Vortex
export const TRACK_5: TrackConfig = {
    id: 'track_5',
    name: 'Stellar Vortex',
    description: 'A chaotic storm of high-speed turns and disorienting loops. Only the best can navigate the vortex.',
    difficulty: 5,
    surface: { base: 0x3a2630, accent: 0xff2a4d }, // dark wine road, crimson rails
    depthCues: true, // overpass + underpass; pillars auto-skip lower decks
    points: [
        new THREE.Vector3(0, 0, 0),         // Start
        new THREE.Vector3(0, 0, -600),      // Initial Straight dive

        // Key Segment 1: The Wide Entry Spiral
        new THREE.Vector3(-400, -50, -1000), // Wide Left & Down
        new THREE.Vector3(-800, 0, -1400),   // Deep Left
        new THREE.Vector3(-600, 100, -1800), // Climbing Loop
        new THREE.Vector3(0, 150, -1600),    // Peak Overpass
        new THREE.Vector3(400, 50, -1400),   // Descending Right

        // Key Segment 2: The Core Cylinder
        new THREE.Vector3(600, 0, -1000),    // Wide Right
        new THREE.Vector3(400, -100, -600),  // Low Right
        new THREE.Vector3(0, -50, -400),     // Center Underpass (Below Start)
        new THREE.Vector3(-400, 50, -600),   // Climbing Left again

        // Key Segment 3: The Final Twist
        new THREE.Vector3(-600, 100, -1000), // High Left
        new THREE.Vector3(-400, 50, -1200),  // Dip

        // New Wide Approach (The "Spoon" Entry)
        new THREE.Vector3(-200, 20, -1000),   // Smoothing exit
        new THREE.Vector3(-400, 0, -500),     // Start going wide earlier
        new THREE.Vector3(-600, 0, 200),      // Very Wide Left (Was -350, 0, 0)
        new THREE.Vector3(-400, 0, 700),      // Wide Left Behind (Was -250, 0, 400)
        new THREE.Vector3(0, 0, 800),         // Directly Behind (Straight entry from further back)
        // Next point is Start (0,0,0) with tangent towards -600 (Perfect Straight alignment)
    ].map(p => p.multiplyScalar(SCALE * 2)),
    pads: [
        { trackProgress: 0.05, lateralPosition: 0, width: 40, length: 0.03 },
        { trackProgress: 0.25, lateralPosition: -20, width: 30, length: 0.02 },
        { trackProgress: 0.45, lateralPosition: 20, width: 30, length: 0.02 },
        { trackProgress: 0.65, lateralPosition: -20, width: 30, length: 0.02 },
        { trackProgress: 0.85, lateralPosition: 0, width: 40, length: 0.04 },
    ],
    hazards: [
        // Slick early — clear lane on the right.
        { type: 'slick', trackProgress: 0.15, lateralPosition: -22, width: 32, length: 0.03 },
        // Block cluster — thread the gap on the left.
        { type: 'block', trackProgress: 0.35, lateralPosition: 0, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.35, lateralPosition: 18, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.35, lateralPosition: 36, width: 16, length: 0.015 },
        // Slick mid-lap — clear lane on the left.
        { type: 'slick', trackProgress: 0.55, lateralPosition: 22, width: 32, length: 0.03 },
        // Block cluster — thread the gap on the right.
        { type: 'block', trackProgress: 0.75, lateralPosition: -36, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.75, lateralPosition: -18, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.75, lateralPosition: 0, width: 16, length: 0.015 },
    ]
};

// Track 6: Mesa Run — first of the Sunscorch (desert) cup. Flat canyon floor
// that snakes through procedural rock walls (see CanyonTerrain). A winding
// run, NOT an oval: entry straight, a chicane, a tight switchback, a long
// right sweep, then a return weave. Rockfall hazards hint the gorge-threading.
export const TRACK_6: TrackConfig = {
    id: 'track_6',
    name: 'Mesa Run',
    description: 'A snaking gorge between towering rock walls. Thread the canyon.',
    difficulty: 2,
    surface: { base: 0x5a4a2e, accent: 0xffb347, centerLine: false }, // dark sand road, warm amber rails, no centre stripe
    terrain: 'canyon',
    points: [
        new THREE.Vector3(0, 0, 0),        // start / finish
        new THREE.Vector3(0, 0, -460),     // entry straight into the gorge
        new THREE.Vector3(220, 0, -780),   // bend right
        new THREE.Vector3(180, 0, -1180),  // chicane back
        new THREE.Vector3(-80, 0, -1460),  // left
        new THREE.Vector3(-180, 0, -1880), // narrow run
        new THREE.Vector3(60, 0, -2240),   // kink right
        new THREE.Vector3(460, 0, -2380),  // open out, deeper
        new THREE.Vector3(820, 0, -2260),  // sweep out wide
        new THREE.Vector3(980, 0, -1900),  // wide apex — the extended hairpin
        new THREE.Vector3(900, 0, -1520),  // long sweep back
        new THREE.Vector3(560, 0, -1260),  // back inward
        new THREE.Vector3(560, 0, -820),   // right
        new THREE.Vector3(420, 0, -360),
        new THREE.Vector3(160, 0, 140),    // return weave
        new THREE.Vector3(-220, 0, 260),
        new THREE.Vector3(-360, 0, 40),
        new THREE.Vector3(-120, 0, 120),   // arc back to the line
    ].map(p => p.multiplyScalar(SCALE * 2)),
    pads: [
        // Off-centre, alternating sides — steer to grab the boost.
        { trackProgress: 0.10, lateralPosition: -30, width: 40, length: 0.02 },
        { trackProgress: 0.42, lateralPosition: 30, width: 36, length: 0.02 },
        { trackProgress: 0.70, lateralPosition: -30, width: 40, length: 0.03 },
    ],
    hazards: [
        // Rockfall along the gorge. Slicks are wide enough to catch the centre
        // line (steer to the open side to dodge); blocks stay tight.
        { type: 'slick', trackProgress: 0.20, lateralPosition: -22, width: 60, length: 0.03 },
        { type: 'block', trackProgress: 0.50, lateralPosition: 18, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.50, lateralPosition: 36, width: 16, length: 0.015 },
        { type: 'slick', trackProgress: 0.78, lateralPosition: 22, width: 60, length: 0.03 },
    ],
};

// Track 7: Sand Hollow — second of the Sunscorch (desert) cup, a notch
// harder than Mesa Run. New canyon features (all driven by the optional
// TrackConfig fields below): a narrowing width profile, a self-crossing with a
// viaduct bridge, real elevation over a static desert, a sunken slot canyon,
// and an underground tunnel. Prototyped in sandbox/gorge.html, then ported to
// CanyonTerrain's zoned build.
export const TRACK_7: TrackConfig = {
    id: 'track_7',
    name: "Sand Hollow",
    description: 'Drop below the desert: a sunken canyon, an underground tunnel, and a boulder gauntlet.',
    difficulty: 3,
    surface: { base: 0x5a4a2e, accent: 0xff9a3c, centerLine: false }, // dark sand road, hot-amber rails
    terrain: 'canyon',
    // An alpha-loop SUNK INTO the desert. The flat plain is the one honest
    // height reference, so the road lives relative to IT: at grade on open
    // desert, modestly raised only on the entry bridge over the crossing, and
    // BELOW grade through the gorge — a slot canyon cut down into the plain,
    // with the tunnel bored underground. (Single clean self-crossing at
    // t≈0.07/0.79 — see analyze-tracks.) Bridge → back to grade → sink into
    // the canyon → underground tunnel → climb out through the boulder
    // gauntlet → wide sweep at grade → under the bridge → behind the grid.
    points: [
        new THREE.Vector3(0, 0, 0),          // 0 start line (grade)
        new THREE.Vector3(0, 9, -300),       // 1 climbing onto the bridge
        new THREE.Vector3(0, 10, -620),      // 2 bridge apex (deck over the crossing)
        new THREE.Vector3(-80, 4, -940),     // 3 descending back toward grade
        new THREE.Vector3(-260, -8, -1300),  // 4 sinking below the plain — gorge begins
        new THREE.Vector3(-300, -24, -1680), // 5 tunnel dive
        new THREE.Vector3(-160, -30, -2020), // 6 lowest point (underground)
        new THREE.Vector3(140, -18, -2200),  // 7 climbing out, swinging right
        new THREE.Vector3(520, -8, -2180),   // 8 boulder gauntlet, still in the canyon
        new THREE.Vector3(800, -2, -1900),   // 9 emerging to grade
        new THREE.Vector3(860, 1, -1520),    // 10 crest
        new THREE.Vector3(740, 0, -1160),    // 11 sweep back, at grade
        new THREE.Vector3(520, 0, -900),     // 12
        new THREE.Vector3(360, 0, -680),     // 13 return leg, +x side, low
        new THREE.Vector3(180, 0, -540),     // 14 approaching the crossing from +x
        new THREE.Vector3(0, 0, -420),       // 15 UNDER the bridge (crossing point)
        new THREE.Vector3(-220, 0, -260),    // 16 exit to -x
        new THREE.Vector3(-260, 0, 100),     // 17 swing behind the line (+z)
        new THREE.Vector3(-60, 0, 220),      // 18 behind the grid → clean run to the line
    ].map(p => p.multiplyScalar(SCALE * 2)),
    // Gorge holds its width to the tunnel portal, then SNAPS to a genuinely narrow
    // slot (half 22, ~9 ships) through the dive so it reads as a real squeeze at
    // road level — collision walls track this, so it confines you and the AI. Snaps
    // back open past the exit portal, then out to the wide (~78) apex. (Gradual
    // pinches don't register: even "narrow" 38 was ~15 ships across.) t wraps.
    widthProfile: [
        { t: 0.00, half: 58 },
        { t: 0.10, half: 56 },  // bridge
        { t: 0.175, half: 50 }, // gorge mouth — width held to the portal lip
        { t: 0.200, half: 22 }, // SNAP to a narrow slot AT the entry portal (~9 ships)
        { t: 0.340, half: 22 }, // hold the slot through the tunnel to the exit portal
        { t: 0.365, half: 50 }, // SNAP back to the open gorge past the exit portal
        { t: 0.42, half: 66 },
        { t: 0.50, half: 78 },  // wide apex
        { t: 0.58, half: 72 },
        { t: 0.68, half: 60 },
    ],
    // Roofed tunnel over the pinched dive.
    tunnels: [{ start: 0.20, end: 0.34 }],
    // Mostly low berms (open desert); the gorge walls are the sides of a canyon
    // sunk below the plain (full-zone `height` = rim height ABOVE THE DESERT
    // SURFACE — the rim stays put while the road dives), and a viaduct (deck +
    // pillars) where the entry bridge spans the crossing.
    canyon: {
        wall: { mode: 'berm', height: 14 }, // low, broken rock lip — open desert, not walled-in
        zones: [
            { start: 0.02, end: 0.15, mode: 'viaduct' },          // entry bridge over the crossing
            { start: 0.16, end: 0.46, mode: 'full', height: 80 }, // sunken canyon; rim ~80 above the surface
        ],
    },
    pads: [
        { trackProgress: 0.12, lateralPosition: 30, width: 36, length: 0.02 },  // off the bridge
        { trackProgress: 0.37, lateralPosition: 30, width: 36, length: 0.02 },  // tunnel-exit reward
        { trackProgress: 0.50, lateralPosition: 0, width: 44, length: 0.03 },   // wide apex sprint
        { trackProgress: 0.86, lateralPosition: -20, width: 40, length: 0.02 }, // run to the line
    ],
    hazards: [
        // Sand slick in the dark tunnel — sized for the narrow slot, offset left so there's a clear right lane to thread.
        { type: 'slick', trackProgress: 0.27, lateralPosition: -7, width: 16, length: 0.025 },
        // Boulder gauntlet just past the tunnel (open lane on the right, then left).
        { type: 'block', trackProgress: 0.41, lateralPosition: -34, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.41, lateralPosition: -10, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.46, lateralPosition: 34, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.46, lateralPosition: 10, width: 16, length: 0.015 },
        // Slick on the descending sweep, clear of the t=0.50 boost pad — clear lane left.
        { type: 'slick', trackProgress: 0.60, lateralPosition: 22, width: 56, length: 0.03 },
    ],
};

// Track 8: Sandstorm Pass — third of the Sunscorch cup, the storm track. Where
// Sand Hollow goes UNDER the desert, the Pass goes OVER it: a figure-8 draped
// across a ridge. Plain dogleg under your own bridge → switchback ladder up the
// west face → exposed spine → the Notch (summit pinch between crags) → storm
// descent crossing OVER the approach on a high viaduct → rockslide gauntlet →
// the sheltered lee home. A permanent sandstorm + per-t lateral wind (see
// `wind`) are the antagonists; shelter is read from the terrain.
// With 25 control points each sits at exactly i/25 = i*0.04 in t.
export const TRACK_8: TrackConfig = {
    id: 'track_8',
    name: 'Sandstorm Pass',
    description: 'Climb the switchbacks into a howling sandstorm, thread the Notch, and dive for shelter.',
    difficulty: 4,
    surface: { base: 0x6a5538, accent: 0xffb347, centerLine: false }, // wind-scoured sand, storm-lantern amber rails
    terrain: 'canyon',
    points: [
        new THREE.Vector3(0, 0, 0),        // 0  t=0.00 start line (plain, grade)
        new THREE.Vector3(60, 0, -300),    // 1  t=0.04 plain straight
        new THREE.Vector3(180, 1, -560),   // 2  t=0.08 dogleg right
        new THREE.Vector3(80, 1, -850),    // 3  t=0.12 UNDER the descent bridge
        new THREE.Vector3(-140, 4, -1000), // 4  t=0.16 foothills, climb begins
        new THREE.Vector3(-380, 7, -1080), // 5  t=0.20 rung 1, heading W
        new THREE.Vector3(-620, 9, -1110), // 6  t=0.24 hairpin A entry
        new THREE.Vector3(-700, 11, -1190),// 7  t=0.28 hairpin A apex (west end)
        new THREE.Vector3(-620, 13, -1270),// 8  t=0.32 hairpin A exit
        new THREE.Vector3(-260, 15, -1310),// 9  t=0.36 rung 2, heading E (long)
        new THREE.Vector3(-150, 17, -1360),// 10 t=0.40 hairpin B entry
        new THREE.Vector3(-70, 19, -1450), // 11 t=0.44 hairpin B apex (east end)
        new THREE.Vector3(-150, 21, -1540),// 12 t=0.48 hairpin B exit
        new THREE.Vector3(-480, 22, -1590),// 13 t=0.52 rung 3, heading W (long)
        new THREE.Vector3(-620, 24, -1740),// 14 t=0.56 turning N up the spine
        new THREE.Vector3(-520, 25, -1950),// 15 t=0.60 the Notch (summit pinch)
        new THREE.Vector3(-260, 23, -2090),// 16 t=0.64 crest, turning E
        new THREE.Vector3(40, 18, -2010),  // 17 t=0.68 saddle, descent begins SE
        new THREE.Vector3(230, 13, -1760), // 18 t=0.72 descending sweep S
        new THREE.Vector3(260, 10, -1430), // 19 t=0.76 east face, S
        new THREE.Vector3(90, 9, -870),    // 20 t=0.80 BRIDGE over the approach (pt 3)
        new THREE.Vector3(30, 4, -560),    // 21 t=0.84 down to the flat — gauntlet
        new THREE.Vector3(-180, 1, -280),  // 22 t=0.88 lee curve W
        new THREE.Vector3(-220, 0, 40),    // 23 t=0.92 behind the grid
        new THREE.Vector3(-70, 0, 200),    // 24 t=0.96 final approach → line
    ].map(p => p.multiplyScalar(SCALE * 2)),
    // Wide on the plain, narrowing up the ladder, pinched hard at the Notch,
    // narrow again on the bridge deck, wide open through the gauntlet.
    widthProfile: [
        { t: 0.00, half: 60 },
        { t: 0.12, half: 56 }, // underpass
        { t: 0.20, half: 50 }, // ladder
        { t: 0.44, half: 48 },
        { t: 0.56, half: 44 }, // spine
        { t: 0.60, half: 36 }, // the Notch — tightest
        { t: 0.64, half: 46 },
        { t: 0.70, half: 56 }, // descent
        { t: 0.80, half: 46 }, // bridge deck
        { t: 0.84, half: 70 }, // gauntlet, wide open
        { t: 0.92, half: 62 },
    ],
    canyon: {
        wall: { mode: 'berm', height: 14 }, // open desert: low broken lips
        zones: [
            { start: 0.16, end: 0.575, mode: 'ridge', height: 10 },  // ladder + spine: exposed crest
            { start: 0.575, end: 0.625, mode: 'crag', height: 90 },  // the Notch: rock towers flanking the pinch
            { start: 0.625, end: 0.78, mode: 'ridge', height: 10 },  // crest + storm descent
            { start: 0.785, end: 0.815, mode: 'viaduct' },           // the bridge over the approach
        ],
    },
    // Wind blows W→E (+x with a touch of +z). Exposure: building up the ladder,
    // full on the spine/Notch/bridge, fading on the descent, becalmed in the lee.
    // FORCE BUDGET: strength x max exposure (1.1) must stay BELOW the weakest
    // ship's strafeSpeed (0.009), or the downwind wall becomes a trap that
    // strafing (the AI's only steering) can never escape. Wind bends your line
    // over seconds; it must never out-muscle the controls per frame.
    wind: {
        dir: [1, 0.15],
        strength: 0.0055, // transient gust peaks may graze the budget — events are short, so nothing stays pinned

        exposure: [
            { t: 0.00, e: 0.45 }, { t: 0.12, e: 0.35 }, // plain; bridge overhead gives partial cover
            { t: 0.16, e: 0.55 }, { t: 0.28, e: 0.75 }, // climbing the ladder
            { t: 0.44, e: 0.85 }, { t: 0.56, e: 1.0 },  // upper rungs → spine
            { t: 0.60, e: 1.1 },                        // the Notch: venturi squeeze
            { t: 0.68, e: 0.95 }, { t: 0.76, e: 0.7 },  // saddle + descent
            { t: 0.80, e: 1.05 },                       // the exposed bridge deck
            { t: 0.84, e: 0.35 },                       // dropping into the gauntlet
            { t: 0.88, e: 0.05 }, { t: 0.92, e: 0.1 },  // the lee — becalmed
            { t: 0.96, e: 0.3 },
        ],
    },
    pads: [
        { trackProgress: 0.14, lateralPosition: -20, width: 36, length: 0.02 }, // out of the underpass
        { trackProgress: 0.365, lateralPosition: -18, width: 36, length: 0.02 },// rung 2 reward — past the slick (0.34, ends 0.35), opposite side
        { trackProgress: 0.66, lateralPosition: 0, width: 40, length: 0.025 },  // crest exit sprint
        { trackProgress: 0.90, lateralPosition: 10, width: 40, length: 0.02 },  // lee run home
    ],
    hazards: [
        { type: 'slick', trackProgress: 0.34, lateralPosition: 14, width: 40, length: 0.02 },   // wet rung 2
        { type: 'slick', trackProgress: 0.73, lateralPosition: 20, width: 56, length: 0.025 },  // storm descent
        { type: 'block', trackProgress: 0.83, lateralPosition: -30, width: 16, length: 0.015 }, // rockslide, first wave
        { type: 'block', trackProgress: 0.83, lateralPosition: -6, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.865, lateralPosition: 28, width: 16, length: 0.015 }, // second wave, opposite side
        { type: 'block', trackProgress: 0.865, lateralPosition: 6, width: 16, length: 0.015 },
    ],
};

// Track 9: Dune Sprint — the Sunscorch OPENER. Where Mesa Run feels tight and
// the later desert tracks pile on hazards/weather, this one sells SPEED and
// openness: a big rounded triangle (three long straights joined by sweeping
// vertices) over gently rolling dunes, wide road, low broken berm lips, boost
// chains, and only a pair of forgiving sand slicks. No tunnel, crossover, or
// hairpins — pure flow. Uses only existing zoned-canyon features (data only).
// 16 control points → point i sits at t = i/16 = i*0.0625.
export const TRACK_9: TrackConfig = {
    id: 'track_9',
    name: 'Dune Sprint',
    description: 'Wide-open rolling dunes and long sweeps — the desert flat-out. A gentle warm-up.',
    difficulty: 1,
    surface: { base: 0x6e5a38, accent: 0xffcf6b, centerLine: false }, // pale sand road, warm-gold rails
    terrain: 'canyon',
    // Footprint scaled 1.5× vs the first draft (longer lap); elevation kept, so
    // the dunes stretch into longer, gentler rolls. t-based pads/widths unchanged.
    points: [
        new THREE.Vector3(0, 0, 0),         // 0 start, bottom edge heading +x
        new THREE.Vector3(600, 2, 60),      // 1 bottom straight
        new THREE.Vector3(1200, 5, 120),    // 2
        new THREE.Vector3(1620, 7, 0),      // 3 bottom-right sweeper in
        new THREE.Vector3(1770, 9, -390),   // 4 vertex apex
        new THREE.Vector3(1620, 7, -840),   // 5 onto the right edge (up -z)
        new THREE.Vector3(1230, 5, -1380),  // 6 right edge, dune crest
        new THREE.Vector3(840, 8, -1860),   // 7
        new THREE.Vector3(540, 10, -2250),  // 8 top sweeper in
        new THREE.Vector3(180, 11, -2490),  // 9 top vertex apex
        new THREE.Vector3(-270, 9, -2340),  // 10 onto the left edge (down +z)
        new THREE.Vector3(-540, 6, -1920),  // 11 left edge
        new THREE.Vector3(-570, 4, -1380),  // 12 dune crest
        new THREE.Vector3(-450, 3, -840),   // 13
        new THREE.Vector3(-270, 1, -360),   // 14 bottom-left sweeper
        new THREE.Vector3(-150, 0, -60),    // 15 back onto the bottom edge → line
    ].map(p => p.multiplyScalar(SCALE * 2)),
    // Generously wide throughout (a forgiving opener), easing only slightly
    // through the vertex sweepers for a touch of shape.
    widthProfile: [
        { t: 0.00, half: 82 },
        { t: 0.25, half: 74 }, // bottom-right vertex
        { t: 0.40, half: 84 },
        { t: 0.56, half: 72 }, // top vertex
        { t: 0.72, half: 84 },
        { t: 0.90, half: 78 },
    ],
    // Open desert: low broken berm lips, no zones (no canyon/ridge/tunnel).
    canyon: { wall: { mode: 'berm', height: 12 } },
    // Boost chains down the three long straights.
    pads: [
        { trackProgress: 0.02, lateralPosition: 18, width: 40, length: 0.02 }, // bottom straight (clear of the slick)
        { trackProgress: 0.10, lateralPosition: 0, width: 44, length: 0.025 },
        { trackProgress: 0.36, lateralPosition: 0, width: 44, length: 0.025 }, // right edge
        { trackProgress: 0.42, lateralPosition: 0, width: 44, length: 0.025 },
        { trackProgress: 0.74, lateralPosition: 0, width: 44, length: 0.025 }, // left edge
        { trackProgress: 0.80, lateralPosition: 0, width: 44, length: 0.025 },
    ],
    hazards: [
        // Two wide sand slicks, each well off-centre so there's an easy clear
        // lane — speed bumps to read, not gates to thread.
        { type: 'slick', trackProgress: 0.06, lateralPosition: -30, width: 44, length: 0.025 },
        { type: 'slick', trackProgress: 0.55, lateralPosition: 28, width: 44, length: 0.03 },
    ],
};

// Track 10: Solstice Classic — the Sunscorch FINALE. A long twisting circuit
// through the deep desert: a crossover bridge, an eastern hairpin, a climb to a
// sun-blazed crest (glare white-out), a spiralling carousel, and a dive into a
// sunken canyon + narrow tunnel before the run home. Elevation, canyon/tunnel
// zones, sun glare, and open-desert wind all live. 34 control points.
export const TRACK_10: TrackConfig = {
    id: 'track_10',
    name: 'Solstice Classic',
    description: 'The championship finale — a long twisting circuit through the deep desert.',
    difficulty: 5,
    surface: { base: 0x6a5236, accent: 0xffb24a, centerLine: false }, // sunset sand, low-sun amber rails
    terrain: 'canyon',
    // ONE carousel + ONE hairpin + ONE crossover. The entry climbs a BRIDGE that
    // the return passes UNDER (alpha-loop crossover); a hairpin out east; a
    // through-loop carousel (loop west) that SPIRALS UP to bridge over its own
    // entry; an extended return tail that swings out past the line. Rolling hills.
    points: [
        new THREE.Vector3(0, 0, 0),         // 0 start, heading north (-z)
        new THREE.Vector3(20, 9, -350),     // 1 climb onto the BRIDGE (crossover deck)
        new THREE.Vector3(20, 11, -720),    // 2 bridge apex
        new THREE.Vector3(150, 6, -1080),   // 3 descend off the bridge, bank east
        new THREE.Vector3(500, 3, -1350),   // 4 out east
        new THREE.Vector3(950, 3, -1500),   // 5 sweep
        new THREE.Vector3(1350, 5, -1500),  // 6 HAIRPIN (east) entry
        new THREE.Vector3(1650, 6, -1400),  // 7
        new THREE.Vector3(1850, 7, -1600),  // 8 tip
        new THREE.Vector3(1750, 7, -1900),  // 9
        new THREE.Vector3(1450, 6, -1950),  // 10
        new THREE.Vector3(1150, 6, -1850),  // 11 exit (west) — begin the climb
        new THREE.Vector3(750, 11, -2000),  // 12 climbing the top straight
        new THREE.Vector3(300, 15, -2150),  // 13 nearing the crest
        new THREE.Vector3(-200, 16, -2200), // 14 CREST — sun blazes in (glare peak)
        new THREE.Vector3(-650, 11, -2150), // 15 descending, turning south
        new THREE.Vector3(-950, 7, -1900),  // 16 heading south into the carousel
        new THREE.Vector3(-1000, 7, -1500), // 17 CAROUSEL — spiral up, loop west
        new THREE.Vector3(-1300, 9, -1250), // 18
        new THREE.Vector3(-1700, 11, -1350),// 19
        new THREE.Vector3(-1800, 13, -1750),// 20
        new THREE.Vector3(-1500, 15, -2000),// 21
        new THREE.Vector3(-1100, 16, -1900),// 22 exit BRIDGES over the entry
        new THREE.Vector3(-950, 12, -1500), // 23 exit south, diving for the canyon
        new THREE.Vector3(-700, -6, -1100), // 24 sinking below grade
        new THREE.Vector3(-400, -18, -750), // 25 TUNNEL dive (lowest, underground)
        new THREE.Vector3(-150, -14, -500), // 26 still deep in the canyon
        new THREE.Vector3(20, -9, -450),    // 27 UNDER the entry bridge — still below grade
        new THREE.Vector3(200, -3, -50),    // 28 climbing out, return tail
        new THREE.Vector3(320, 0, 450),     // 29 reaches grade, swings out past the line
        new THREE.Vector3(80, 0, 800),      // 30
        new THREE.Vector3(-350, 0, 720),    // 31
        new THREE.Vector3(-560, 0, 320),    // 32
        new THREE.Vector3(-320, 0, -40),    // 33 curve back to the start line
    ].map(p => p.multiplyScalar(SCALE * 2)),
    // The solstice sun sits low to the WEST, where the top straight points. You
    // climb that straight and crest straight into it — one blinding white-out per
    // lap (glareZone), then it clears as you drop toward the carousel.
    sun: { dir: [-1, -0.15], strength: 1.0, glareZone: { start: 0.30, peak: 0.41, end: 0.50 } },
    // A low, open desert wind that bites on the exposed legs (the eastern sweeps
    // and the crest top-straight) and dies away in the gorge/tunnel lee. Gentler
    // than Sandstorm Pass — the white-out crest is this track's headline; wind is
    // the spice. Budget: strength × maxExposure (1.05) × peak gust (~1.7) ≈
    // 0.0089, just under the weakest ship's 0.009 strafe, so it never pins.
    wind: {
        dir: [0.6, 0.8],
        strength: 0.005,
        exposure: [
            { t: 0.00, e: 0.40 }, { t: 0.05, e: 0.35 }, // start onto the crossover bridge
            { t: 0.10, e: 0.65 }, { t: 0.22, e: 0.85 }, // off the bridge, long eastern sweep — open
            { t: 0.30, e: 0.55 },                        // hairpin — berms give partial cover
            { t: 0.40, e: 1.05 },                        // the CREST top-straight — highest, into the sun
            { t: 0.50, e: 0.85 }, { t: 0.58, e: 0.45 },  // descending toward the carousel
            { t: 0.66, e: 0.30 },                        // banked carousel — partial shelter
            { t: 0.70, e: 0.08 }, { t: 0.75, e: 0.00 },  // canyon mouth → TUNNEL: dead calm
            { t: 0.82, e: 0.10 },                        // still deep in the gorge lee
            { t: 0.88, e: 0.55 }, { t: 0.94, e: 0.70 },  // climbing out — wind returns on the open tail
        ],
    },
    // Tunnel mouth = "small hole in a big cliff." The gorge floor stays WIDE (78)
    // right up to the portal lip, then SNAPS to a genuinely narrow slot (half 20,
    // ~8 ship-widths vs the gorge's ~30) exactly at the entry portal (0.71). The
    // collision walls track this profile, so it's a real squeeze at road level,
    // not just a cosmetic cliff up high. Held through the tunnel, then snaps back
    // wide past the exit portal (0.78). (NB: gentle narrowing never registers —
    // road + walls + arch all scale together, and even "narrow" values like 44
    // are still ~19 ships across. It has to be small in absolute ship-widths AND
    // snap against the wide-gorge reference to read.)
    widthProfile: [
        { t: 0.00, half: 74 }, { t: 0.22, half: 64 }, { t: 0.60, half: 78 },
        { t: 0.704, half: 78 },  // wide gorge floor, held right up to the portal lip
        { t: 0.710, half: 20 },  // SNAP to a narrow slot AT the entry portal (~8 ships)
        { t: 0.780, half: 20 },  // hold the slot through the tunnel to the exit portal
        { t: 0.786, half: 78 },  // SNAP back to the wide gorge past the exit portal
        { t: 0.815, half: 74 },  // settle back to normal width
    ],
    // Low open berms (see over from the chase camera), with low-parapet viaduct
    // decks at the two bridges: the entry/crossover bridge and the carousel
    // over-bridge.
    canyon: {
        wall: { mode: 'berm', height: 8 },
        zones: [
            { start: 0.01, end: 0.075, mode: 'viaduct', height: 2 }, // entry bridge (crossover)
            { start: 0.60, end: 0.675, mode: 'viaduct', height: 2 }, // carousel over-bridge
            { start: 0.685, end: 0.845, mode: 'full', height: 90 },  // sunken canyon — stays a slot through the crossover
        ],
    },
    // Roofed tunnel through the deepest part of the canyon dive (à la Sand Hollow).
    tunnels: [{ start: 0.71, end: 0.78 }],
    pads: [
        { trackProgress: 0.04, lateralPosition: 0, width: 44, length: 0.02 },  // off the bridge
        { trackProgress: 0.34, lateralPosition: 0, width: 44, length: 0.025 }, // hairpin exit / top
        { trackProgress: 0.55, lateralPosition: 0, width: 44, length: 0.025 }, // ON the carousel
        { trackProgress: 0.88, lateralPosition: 0, width: 44, length: 0.02 },  // return tail
    ],
    hazards: [
        // A finale: two slicks on the fast descents and two block gates — one on
        // the east leg, one on the run home — each leaving a clear lane.
        { type: 'slick', trackProgress: 0.52, lateralPosition: -20, width: 48, length: 0.025 }, // descent off the crest, as the glare clears
        { type: 'slick', trackProgress: 0.71, lateralPosition: 7, width: 16, length: 0.025 },   // tunnel-mouth dive (sized for the narrow slot — clear left lane)
        { type: 'block', trackProgress: 0.16, lateralPosition: -22, width: 16, length: 0.015 }, // east-leg gate
        { type: 'block', trackProgress: 0.16, lateralPosition: 2, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.92, lateralPosition: -22, width: 16, length: 0.015 }, // run-home gate, just past the boost pad
        { type: 'block', trackProgress: 0.92, lateralPosition: 20, width: 16, length: 0.015 },
    ],
};

export const TRACKS = [TRACK_1, TRACK_2, TRACK_3, TRACK_4, TRACK_5, TRACK_6, TRACK_7, TRACK_8, TRACK_9, TRACK_10];

// Minimal, gentle loop used by the interactive tutorial. Flat, wide, sweeping
// bends, one laterally-offset boost pad. NOT part of TRACKS (not selectable).
export const TUTORIAL_TRACK: TrackConfig = {
    id: 'tutorial',
    name: 'Training Loop',
    description: 'A gentle loop for learning the controls.',
    difficulty: 1,
    surface: { base: 0x2a3340, accent: 0x00e5ff },
    points: [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -260),     // opening straight (accelerate)
        new THREE.Vector3(120, 0, -380),   // sweeping bend
        new THREE.Vector3(300, 0, -380),
        new THREE.Vector3(420, 0, -260),
        new THREE.Vector3(420, 0, 0),      // back straight (boost pad ~mid-loop)
        new THREE.Vector3(300, 0, 120),
        new THREE.Vector3(120, 0, 120),
    ].map(p => p.multiplyScalar(SCALE * 5.0)),
    pads: [
        // Late in the lap (0.7) and on the racing line, so the boost prompt has
        // time to appear before the player reaches it.
        { trackProgress: 0.7, lateralPosition: 0, width: 40, length: 0.02 },
    ],
    hazards: [
        // A dodgeable slick before the boost — offset right with a clear lane on
        // the left, so the strafe lesson has something to practise on. Kept well
        // ahead of the boost pad (0.7) so they don't arrive back-to-back.
        { type: 'slick', trackProgress: 0.45, lateralPosition: 22, width: 36, length: 0.03 },
    ],
};
