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
    surface?: { base: number; accent: number };
}

const SCALE = 12.0;

export const TRACK_1: TrackConfig = {
    id: 'track_1',
    name: 'The Awakening',
    description: 'A deformed oval with wide straights and a massive jump. Perfect for beginners.',
    difficulty: 1,
    surface: { base: 0x2a3340, accent: 0x00e5ff }, // dark blue-grey road, cyan rails
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

export const TRACKS = [TRACK_1, TRACK_2, TRACK_3, TRACK_4, TRACK_5];

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
