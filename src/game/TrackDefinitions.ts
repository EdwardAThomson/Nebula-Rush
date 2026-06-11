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
        zones?: { start: number; end: number; mode: 'full' | 'berm' | 'viaduct'; height?: number }[];
    };
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

// Track 7: Beggar's Gorge — second of the Sunscorch (desert) cup, a notch
// harder than Mesa Run. A faster gorge that pinches into a roofed tunnel on a
// short descending dive, opens into a boulder gauntlet, sweeps wide, then climbs
// back out. New canyon features: a narrowing width profile, a tunnel section,
// and modest elevation (the walls follow the road up/down).
//
// NOTE: deliberately NOT in TRACKS yet — prototyped in the gorge sandbox first,
// then wired into TRACKS + the Sunscorch cup once confirmed.
export const TRACK_7: TrackConfig = {
    id: 'track_7',
    name: "Beggar's Gorge",
    description: 'A pinched tunnel, a boulder gauntlet, and a long climbing sweep through the rock.',
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
    // Gorge pinches from ~56 down to ~38 through the tunnel dive, then opens wide
    // (~78) across the climbing sweep before easing back. t wraps on the loop.
    widthProfile: [
        { t: 0.00, half: 58 },
        { t: 0.10, half: 56 }, // bridge
        { t: 0.18, half: 46 }, // pinch begins
        { t: 0.26, half: 38 }, // tightest — mid tunnel
        { t: 0.34, half: 48 }, // tunnel exit
        { t: 0.42, half: 66 },
        { t: 0.50, half: 78 }, // wide apex
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
        // Sand slick in the dark tunnel — slightly offset so there's a sliver to thread.
        { type: 'slick', trackProgress: 0.27, lateralPosition: -8, width: 44, length: 0.025 },
        // Boulder gauntlet just past the tunnel (open lane on the right, then left).
        { type: 'block', trackProgress: 0.41, lateralPosition: -34, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.41, lateralPosition: -10, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.46, lateralPosition: 34, width: 16, length: 0.015 },
        { type: 'block', trackProgress: 0.46, lateralPosition: 10, width: 16, length: 0.015 },
        // Slick on the descending sweep, clear of the t=0.50 boost pad — clear lane left.
        { type: 'slick', trackProgress: 0.60, lateralPosition: 22, width: 56, length: 0.03 },
    ],
};

export const TRACKS = [TRACK_1, TRACK_2, TRACK_3, TRACK_4, TRACK_5, TRACK_6];

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
