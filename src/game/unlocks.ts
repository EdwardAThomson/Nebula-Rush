import { CUPS } from './CupDefinitions';
import { getClearedCups } from './cupProgress';
import type { ShipType } from './ShipFactory';

// Player-facing roster gating: a small starting selection (fast first race),
// with the rest earned by clearing campaign cups (top 3 in the standings).
// Unlocks are DERIVED from the cleared-cups list (cupProgress), so there is no
// separate save state and campaign is the only path to new pilots/ships.

// Starting roster: echo_7 = balanced, orion_reinhardt = precision,
// nova = acceleration, dennis = "old thunder" (ace-tier top speed but accel -2,
// the hard-to-drive speed option). The FORGIVING speed pilots (Jax, Lyra:
// +2 velocity with decent launch) stay campaign rewards.
const BASE_PILOTS = ['echo_7', 'orion_reinhardt', 'dennis_grimshaw', 'nova_starling'];
const BASE_SHIPS: ShipType[] = ['fighter', 'interceptor'];

// Rewards granted when a cup is cleared. Later cups aren't authored yet, so a
// full pass of today's campaign intentionally does NOT unlock everything —
// the tail arrives with future cups.
const CUP_REWARDS: Record<string, { pilots?: string[]; ships?: ShipType[] }> = {
    // Escalating desirability (65 → 68 → 72 → 72-but-hard top speed), and each
    // pilot fits their cup: outer-rim Darius in the desert, city hotshot Jax
    // under the Skyline neon, icy Lyra in Cryo.
    nebula: { pilots: ['zara_qel'], ships: ['tank'] },
    sunscorch: { pilots: ['darius_wraith'], ships: ['corsair'] },
    skyline: { pilots: ['jax_ace_strider'], ships: ['speedster'] },
    cryo: { pilots: ['lyra_vane'] },
};

// Each pilot's signature ship — preselected/recommended on the ship screen so
// the default path is one click. Falls back to the fighter while locked.
const PILOT_SIGNATURE_SHIP: Record<string, ShipType> = {
    echo_7: 'fighter',
    orion_reinhardt: 'interceptor',
    jax_ace_strider: 'speedster',
    nova_starling: 'tank',
    zara_qel: 'interceptor',
    lyra_vane: 'speedster',
    darius_wraith: 'corsair',
    dennis_grimshaw: 'fighter',
};

export function getUnlockedPilotIds(cleared: string[] = getClearedCups()): string[] {
    const ids = [...BASE_PILOTS];
    cleared.forEach((cupId) => CUP_REWARDS[cupId]?.pilots?.forEach((p) => ids.push(p)));
    return ids;
}

export function getUnlockedShipTypes(cleared: string[] = getClearedCups()): ShipType[] {
    const ships = [...BASE_SHIPS];
    cleared.forEach((cupId) => CUP_REWARDS[cupId]?.ships?.forEach((s) => ships.push(s)));
    return ships;
}

export function getSignatureShip(pilotId: string, unlockedShips: ShipType[] = getUnlockedShipTypes()): ShipType {
    const sig = PILOT_SIGNATURE_SHIP[pilotId] ?? 'fighter';
    return unlockedShips.includes(sig) ? sig : 'fighter';
}

// "Clear the Nebula Cup" — shown on locked pilot/ship cards.
export function getUnlockHint(kind: 'pilot' | 'ship', id: string): string {
    const cupId = Object.keys(CUP_REWARDS).find((c) => {
        const r = CUP_REWARDS[c];
        return kind === 'pilot' ? r.pilots?.includes(id) : r.ships?.includes(id as ShipType);
    });
    const cup = CUPS.find((c) => c.id === cupId);
    return cup ? `Clear the ${cup.name}` : 'Locked';
}
