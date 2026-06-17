import { TRACKS, type TrackConfig } from './TrackDefinitions';
import type { EnvironmentConfig } from './EnvironmentManager';

// A Cup is a themed, ordered set of tracks raced as one championship. Cups
// compose from the master TRACKS pool by id, so a cup can be reordered or a
// track reused without touching track data. See docs/cups.md for the full arc.
export interface Cup {
    id: string;
    name: string;
    theme: string;          // short biome label (drives palette / env bias)
    description: string;
    accent: number;         // UI tint (hex)
    // Ordered track ids. Ids not yet present in TRACKS are simply unbuilt; a cup
    // is only playable once all of them resolve (see isCupReady).
    trackIds: string[];
    // Sketched track names for cups that aren't authored yet — shown on the
    // "Coming soon" card so the full arc is visible in the menu.
    plannedTracks?: string[];
    // Force the cup to stay locked ("COMING SOON" / unselectable) in the New Game
    // cup screen even if some of its tracks are built. Lets a built track be
    // grouped under its cup on the Track Select screen (via resolveCupTracks)
    // without making the half-finished cup playable as a campaign.
    comingSoon?: boolean;
    // Theme overlay on each race's randomized environment (e.g. deep-space
    // dressing). Partial — only the fields a cup wants to pin.
    envBias?: Partial<EnvironmentConfig>;
}

export const CUPS: Cup[] = [
    {
        id: 'nebula',
        name: 'Nebula Cup',
        theme: 'Deep Space',
        description: 'Flowing tracks through open space. Where every pilot earns their wings.',
        accent: 0x00e5ff,
        trackIds: ['track_1', 'track_2', 'track_3', 'track_4', 'track_5'],
        // Deep-space dressing on every race; clear skies so the nebula reads.
        envBias: { weather: 'clear', space: true },
    },
    {
        id: 'sunscorch',
        name: 'Sunscorch Cup',
        theme: 'Desert Canyons',
        description: 'Threading rock spires and gorges through blinding dust storms.',
        accent: 0xff8c1a,
        // All five built — race order = difficulty ramp: Dune Sprint opener → Mesa
        // → Sand Hollow → Sandstorm Pass → Solstice Classic finale. Playable as a
        // full campaign in New Game.
        trackIds: ['track_9', 'track_6', 'track_7', 'track_8', 'track_10'],
        plannedTracks: ['Dune Sprint', 'Mesa Run', "Sand Hollow", 'Sandstorm Pass', 'Solstice Classic'],
    },
    {
        id: 'skyline',
        name: 'Skyline Cup',
        theme: 'Megalopolis',
        description: 'Rain-slicked streets and towering skylines under perpetual night.',
        accent: 0xff3df0,
        trackIds: [],
        plannedTracks: ['Downtown Dash', 'Tower Spiral', 'Rainfront', 'Maglev Crossover', 'Grid Central'],
    },
    {
        id: 'cryo',
        name: 'Cryo Cup',
        theme: 'Glacier',
        description: 'Black ice and frozen caverns beneath a shimmering aurora.',
        accent: 0x9fe8ff,
        trackIds: [],
        plannedTracks: ['Frostbite Flats', 'Glacier Caverns', 'Aurora Ridge', 'Black Ice', 'Subzero Spiral'],
    },
    {
        id: 'inferno',
        name: 'Inferno Cup',
        theme: 'Volcanic',
        description: 'Lava channels and ash storms. Only champions survive the firestorm.',
        accent: 0xff2a4d,
        trackIds: [],
        plannedTracks: ['Ashfall', 'Magma Veins', 'Caldera Rim', 'Pyroclasm', 'Firestorm Finale'],
    },
];

// Resolve a cup's track ids to TrackConfig objects, in order (skips unbuilt ids).
export function resolveCupTracks(cup: Cup): TrackConfig[] {
    return cup.trackIds
        .map((id) => TRACKS.find((t) => t.id === id))
        .filter((t): t is TrackConfig => !!t);
}

// A cup is playable once every declared track exists in the pool — and it isn't
// explicitly held back as `comingSoon` (a partially-built cup like Sunscorch).
export function isCupReady(cup: Cup): boolean {
    return !cup.comingSoon && cup.trackIds.length > 0 && resolveCupTracks(cup).length === cup.trackIds.length;
}

// Which cup a track belongs to (first match). Lets single-race apply the same
// theme/env a track gets in its campaign cup.
export function getCupForTrack(trackId: string): Cup | undefined {
    return CUPS.find((c) => c.trackIds.includes(trackId));
}
