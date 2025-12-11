import * as THREE from 'three';

export interface BoostPad {
    trackProgress: number; // 0.0 to 1.0
    lateralPosition: number; // Center of pad
    width: number;
    length: number; // In track progress units (approx)
}

export interface TrackConfig {
    id: string;
    name: string;
    description: string;
    points: THREE.Vector3[];
    pads: BoostPad[];
    difficulty: number; // 1-5
}

const SCALE = 12.0;

export const TRACK_1: TrackConfig = {
    id: 'track_1',
    name: 'The Awakening',
    description: 'A deformed oval with wide straights and a massive jump. Perfect for beginners.',
    difficulty: 1,
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
    ].map(p => p.multiplyScalar(SCALE)),
    pads: [
        { trackProgress: 0.15, lateralPosition: 0, width: 40, length: 0.02 },
        { trackProgress: 0.35, lateralPosition: -30, width: 40, length: 0.02 },
        { trackProgress: 0.55, lateralPosition: 30, width: 40, length: 0.02 },
        { trackProgress: 0.85, lateralPosition: 0, width: 40, length: 0.02 },
    ]
};

// Placeholder for Track 2 (will be populated later)
export const TRACK_2: TrackConfig = {
    id: 'track_2',
    name: 'Asteroid Slalom',
    description: 'Wide turns replaced by tight rhythmic curves. Precision is key.',
    difficulty: 2,
    points: [
        new THREE.Vector3(0, 0, 0),         // Start
        new THREE.Vector3(0, 0, -400),      // Straight
        new THREE.Vector3(-200, 0, -800),   // Left Turn 1 (Reduced amplitude)
        new THREE.Vector3(0, 0, -1000),     // Center Smoothing
        new THREE.Vector3(200, 0, -1200),   // Right Turn 2
        new THREE.Vector3(0, 0, -1400),     // Center Smoothing
        new THREE.Vector3(-200, 0, -1600),  // Left Turn 3
        new THREE.Vector3(0, 0, -1800),     // Center Smoothing
        new THREE.Vector3(200, 0, -2000),   // Right Turn 4
        new THREE.Vector3(0, 0, -2400),     // Straight Exit
        new THREE.Vector3(800, 0, -2000),   // Wide Loop Back
        new THREE.Vector3(800, 0, -400),    // Long Return Straight
        new THREE.Vector3(400, 0, 200),     // Final Turn entry
    ].map(p => p.multiplyScalar(SCALE)),
    pads: [
        { trackProgress: 0.25, lateralPosition: -20, width: 30, length: 0.02 }, // Slalom Entry
        { trackProgress: 0.45, lateralPosition: 20, width: 30, length: 0.02 },  // Mid Slalom
        { trackProgress: 0.75, lateralPosition: 0, width: 40, length: 0.03 },   // Back Straight Long Boost
    ]
};

// Track 3: The Nebula Complex
export const TRACK_3: TrackConfig = {
    id: 'track_3',
    name: 'Nebula Complex',
    description: 'A technical circuit intertwining with an orbital station. Features a corkscrew dive and high-G turns.',
    difficulty: 3,
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
    ].map(p => p.multiplyScalar(SCALE)),
    pads: [
        { trackProgress: 0.1, lateralPosition: 0, width: 30, length: 0.02 },  // Early boost
        { trackProgress: 0.45, lateralPosition: -20, width: 30, length: 0.02 }, // Post-corkscrew
        { trackProgress: 0.7, lateralPosition: 20, width: 30, length: 0.02 },   // Back straight
        { trackProgress: 0.9, lateralPosition: 0, width: 40, length: 0.02 },    // Final sprint
    ]
};

export const TRACKS = [TRACK_1, TRACK_2, TRACK_3];
