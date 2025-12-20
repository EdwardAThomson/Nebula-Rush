export interface Pilot {
    id: string;
    name: string;
    bio: string;
    imagePath: string;
    gender: 'male' | 'female';
    stats: {
        velocity: number;      // -2 to +2
        acceleration: number;  // -2 to +2
        handling: number;      // -2 to +2
    };
}

export const PILOTS: Pilot[] = [
    // MALE PILOTS
    {
        id: 'jax_ace_strider',
        name: 'Jax "Ace" Strider',
        bio: 'A hotshot rookie with a need for speed. Known for his reckless maneuvers and winning smile.',
        imagePath: '/assets/pilots/pilot_jax_ace_strider_1765624249876.png',
        gender: 'male',
        stats: { velocity: 2, acceleration: 1, handling: -1 }
    },
    {
        id: 'kaelen_vance',
        name: 'Kaelen Vance',
        bio: 'A stoic veteran with a scarred past. He races not for glory, but for survival.',
        imagePath: '/assets/pilots/pilot_kaelen_vance_1765624265117.png',
        gender: 'male',
        stats: { velocity: 1, acceleration: -1, handling: 2 }
    },
    {
        id: 'orion_pax',
        name: 'Orion Pax',
        bio: 'A cybernetically enhanced racer. More machine than man, he calculates the perfect racing line every time.',
        imagePath: '/assets/pilots/pilot_orion_pax_1765624283559.png',
        gender: 'male',
        stats: { velocity: 1, acceleration: 0, handling: 2 }
    },
    {
        id: 'darius_wraith',
        name: 'Darius Wraith',
        bio: 'A shadowy figure from the outer rim. His aggressive driving style strikes fear into his opponents.',
        imagePath: '/assets/pilots/pilot_darius_wraith_1765624298325.png',
        gender: 'male',
        stats: { velocity: 1, acceleration: 2, handling: -1 }
    },

    // FEMALE PILOTS
    {
        id: 'nova_starling',
        name: 'Nova Starling',
        bio: 'High-tech prodigy and engineer. She built her own ship and knows every bolt and circuit.',
        imagePath: '/assets/pilots/pilot_nova_starling_1765624324792.png',
        gender: 'female',
        stats: { velocity: -1, acceleration: 2, handling: 1 }
    },
    {
        id: 'lyra_vane',
        name: 'Lyra Vane',
        bio: 'Elegant, precise, and deadly. She races with the grace of a dancer and the ferocity of a tiger.',
        imagePath: '/assets/pilots/pilot_lyra_vane_1765624342128.png',
        gender: 'female',
        stats: { velocity: 2, acceleration: -1, handling: 1 }
    },
    {
        id: 'zara_qel',
        name: 'Zara Qel',
        bio: 'Ex-military tactician. She treats every race like a battlefield and plans her moves three laps ahead.',
        imagePath: '/assets/pilots/pilot_zara_qel_1765624359604.png',
        gender: 'female',
        stats: { velocity: -1, acceleration: 1, handling: 2 }
    },
    {
        id: 'echo_7',
        name: 'Echo-7',
        bio: 'An experimental android racer. She feels no fear, no fatigue, and no mercy.',
        imagePath: '/assets/pilots/pilot_echo_7_1765624373159.png',
        gender: 'female',
        stats: { velocity: 1, acceleration: 1, handling: 1 }
    }
];
