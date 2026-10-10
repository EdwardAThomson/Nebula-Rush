import * as THREE from 'three';
import { Ship, type ShipConfig } from './Ship';
import { type ShipType, SHIP_STATS } from './ShipFactory';
import { PILOTS } from './PilotDefinitions';

import type { InputSource } from './InputManager';
import type { GameState } from './PhysicsEngine';
import type { BoostPad, Hazard, RechargeZone } from './TrackDefinitions';
import { HAZARD_BLOCK_DEPTH, RECHARGE_ZONE } from './TrackDefinitions';
import { drawRivalNames } from './rivalNames';

// AI hazard + energy awareness. Opponents take the same energy damage as the
// player (blocks, wall scraping, contact), so they look ahead and steer round
// blocks, and divert over the recharge pad when running low. Neither is
// perfect on purpose: each rival rolls per block whether it spots it in time,
// so the field still takes hits and the odd one runs dry.
//
// Racecraft: rivals also line up for boost pads and steer round slick patches,
// the two lateral choices that actually change pace (corners are on rails, so
// there's no racing line to take). Each rival has a 0..1 skill that sets how
// often it gets these right, so the field has aces and back-markers.
const AI_LOOKAHEAD_S = 4.0;   // seconds of track scanned ahead for blocks / pads / the recharge strip
const AI_DODGE_MARGIN = 5;    // lateral clearance kept beyond a block's half-width
const AI_LANE_LIMIT = 50;     // default tracks: stay clear of the ±60 box wall
const AI_PAD_INSET = 4;       // aim this far inside the recharge pad's edge
const AI_SLICK_MARGIN = 3;    // lateral clearance kept beyond a slick patch's half-width

const IDLE_INPUT: InputSource = { isKeyPressed: () => false };

// Rival strength per cup tier (CupDefinitions.rivalTier): each rival's own
// 0..1 skill is mapped into [skillLo, skillHi], and its pilot's stat points
// are scaled by `pilot`. A rival keeps its rank in the field from cup to cup
// (aces stay aces); the whole field sharpens as the cups go on. Tiers past
// the end of the table use the last row.
const RIVAL_TIERS = [
    { pilot: 0.25, skillLo: 0.0, skillHi: 0.5 },  // Nebula Cup: small pilot edge, under half the pads read
    { pilot: 0.5, skillLo: 0.15, skillHi: 0.7 },  // Sunscorch Cup
    { pilot: 1.0, skillLo: 0.4, skillHi: 1.0 },   // Skyline Cup onward
];

// The lane nearest `want` that sits outside every [lo, hi] interval and
// inside the walls, or null if there's no gap. Candidates are the interval
// edges; ties go to the one nearer where the ship is now.
function nearestFreeLane(want: number, current: number, intervals: [number, number][], minL: number, maxL: number): number | null {
    const free = (x: number) => x >= minL && x <= maxL && intervals.every(([lo, hi]) => x <= lo || x >= hi);
    if (free(want)) return want;
    let best: number | null = null;
    let bestCost = Infinity;
    for (const [lo, hi] of intervals) {
        for (const c of [lo, hi]) {
            if (!free(c)) continue;
            const cost = Math.abs(c - want) + 0.1 * Math.abs(c - current);
            if (cost < bestCost) {
                best = c;
                bestCost = cost;
            }
        }
    }
    return best;
}

// Rivals race with pilots too: a random pilot's stat line (velocity /
// acceleration / handling points), mapped onto the physics knobs exactly as
// the player's pilot is in Game.tsx.
function applyPilotStats(config: ShipConfig, stats: PilotStats) {
    if (stats.velocity !== 0) config.friction += stats.velocity * 0.0004;
    if (stats.acceleration !== 0) {
        const k = 1 + stats.acceleration * 0.15;
        config.accelFactor *= k;
        config.friction = 1 - (1 - config.friction) * k;
        config.throttleRate = 0.05 * k;
    }
    if (stats.handling !== 0) {
        const m = 1 + stats.handling * 0.1;
        config.turnSpeed *= m;
        config.strafeSpeed *= m;
    }
}

class AIInputController implements InputSource {
    private keys: { [key: string]: boolean } = {};
    public targetLateral: number = 0;
    public baseLane: number = 0; // preferred lane before hazards / pad / walls
    // 0..1 racecraft: scales the two chances below.
    public skill: number;
    // 0..1 chance of spotting each block in time to dodge it (energy safety).
    public alertness: number;
    // 0..1 chance of reading each boost pad / slick patch ahead (pace).
    public racecraft: number;
    // Energy fraction under which this rival heads for the recharge pad.
    public rechargeBelow: number;
    private seekingCharge = false;
    // Per-block dodge decision for the current approach (index → spotted?),
    // rolled once as the block enters the lookahead window and cleared once
    // it's behind, so each lap is a fresh roll.
    private blockCalls = new Map<number, boolean>();
    // Same per-approach rolls for slick patches and boost pads.
    private slickCalls = new Map<number, boolean>();
    private padCalls = new Map<number, boolean>();
    private slideFactor: number;

    constructor(target: number, slideFactor: number, skill: number = Math.random()) {
        this.targetLateral = target;
        this.baseLane = target;
        this.slideFactor = slideFactor;
        this.skill = skill;
        this.alertness = 0.86 + skill * 0.12; // 86–98%
        this.racecraft = skill * 0.9;         // 0–90%
        this.rechargeBelow = 0.45 + Math.random() * 0.2; // 45–65%
    }

    // Roll once per approach whether this rival gets a given pad / hazard right;
    // forget the roll once it's out of range so the next lap re-rolls.
    private call(calls: Map<number, boolean>, i: number, chance: number): boolean {
        let c = calls.get(i);
        if (c === undefined) {
            c = Math.random() < chance;
            calls.set(i, c);
        }
        return c;
    }

    // Pick this frame's target lane: preferred lane → boost pad ahead, or the
    // recharge pad if low → wall clamp → round any spotted block or slick ahead.
    plan(state: GameState, trackLength: number, hazards: Hazard[], pads: BoostPad[], wallLimit?: (t: number) => [number, number]) {
        const t = state.trackProgress;
        const lookahead = Math.max(state.velocity.y, 20) * 60 * AI_LOOKAHEAD_S; // world units
        const distAhead = (p: number) => (((p - t) % 1 + 1) % 1) * trackLength;
        let lane = this.baseLane;
        let charging = false;

        // Recharge: commit when low, hold until topped up or past the pad.
        if (state.energyEnabled) {
            const frac = state.energy / (state.maxEnergy || 100);
            const rz = state.rechargeZone ?? RECHARGE_ZONE;
            if (frac < this.rechargeBelow) this.seekingCharge = true;
            if (frac >= 0.98) this.seekingCharge = false;
            const onPad = t >= rz.start && t <= rz.end;
            if (this.seekingCharge && (onPad || distAhead(rz.start) < lookahead)) {
                const half = rz.width / 2 - AI_PAD_INSET;
                lane = Math.max(rz.lateralPosition - half, Math.min(rz.lateralPosition + half, lane));
                charging = true;
            }
        }

        // Boost pads: line up for the nearest pad ahead (if this rival reads
        // it), holding the line until past it. Energy comes first.
        let nextPad: { d: number; pad: BoostPad } | null = null;
        pads.forEach((pad, i) => {
            const halfLen = (pad.length / 2) * trackLength;
            const d = distAhead(pad.trackProgress);
            const over = d > trackLength - halfLen; // on the pad (its centre just behind)
            if (d > lookahead && !over) {
                this.padCalls.delete(i);
                return;
            }
            if (!this.call(this.padCalls, i, this.racecraft)) return;
            const dd = over ? 0 : d;
            if (!nextPad || dd < nextPad.d) nextPad = { d: dd, pad };
        });
        if (nextPad && !charging) {
            const { pad } = nextPad as { d: number; pad: BoostPad };
            const half = Math.max(1, pad.width / 2 - Math.min(AI_PAD_INSET, pad.width / 4));
            lane = Math.max(pad.lateralPosition - half, Math.min(pad.lateralPosition + half, lane));
        }

        // Walls: canyon gorge width per-t, else the fixed box.
        let minL = -AI_LANE_LIMIT, maxL = AI_LANE_LIMIT;
        if (wallLimit) {
            const [lo, hi] = wallLimit(t);
            minL = lo + 4;
            maxL = hi - 4;
        }
        lane = Math.max(minL, Math.min(maxL, lane));

        // Blocks: the NEAREST spotted row of blocks (boxes side by side at the
        // same spot) blocks lateral intervals (width plus clearance). Take the
        // free lane nearest the one we want; side-by-side blocks merge into one
        // wall this way, so the AI finds the real gap. Only the nearest row
        // counts: slalom rows a short way apart (Sand Hollow) would otherwise
        // union into a full-width wall with no gap at all.
        const spottedAhead: { d: number; lo: number; hi: number }[] = [];
        hazards.forEach((h, i) => {
            if (h.type !== 'block') return;
            const d = distAhead(h.trackProgress);
            const behind = d > trackLength - HAZARD_BLOCK_DEPTH; // just passed (wrapped)
            if (d > lookahead && !behind) {
                this.blockCalls.delete(i);
                return;
            }
            if (behind) return;
            const half = h.width / 2 + AI_DODGE_MARGIN;
            if (this.call(this.blockCalls, i, this.alertness)) spottedAhead.push({ d, lo: h.lateralPosition - half, hi: h.lateralPosition + half });
        });
        const nearest = Math.min(...spottedAhead.map(b => b.d));
        const blocked = spottedAhead
            .filter(b => b.d <= nearest + 2 * HAZARD_BLOCK_DEPTH)
            .map(b => [b.lo, b.hi] as [number, number]);

        // Slick patches: long strips that cap speed, so keep off any spotted
        // one we're on or about to reach. They only cost pace, so if dodging
        // a slick too leaves no gap, the blocks win.
        const slicks: [number, number][] = [];
        hazards.forEach((h, i) => {
            if (h.type !== 'slick') return;
            const halfLen = (h.length / 2) * trackLength;
            const dStart = distAhead(h.trackProgress) - halfLen;
            const on = distAhead(h.trackProgress) > trackLength - halfLen || dStart < 0;
            if (dStart > lookahead && !on) {
                this.slickCalls.delete(i);
                return;
            }
            const half = h.width / 2 + AI_SLICK_MARGIN;
            if (this.call(this.slickCalls, i, this.racecraft)) slicks.push([h.lateralPosition - half, h.lateralPosition + half]);
        });

        lane = nearestFreeLane(lane, state.lateralPosition, [...blocked, ...slicks], minL, maxL)
            ?? nearestFreeLane(lane, state.lateralPosition, blocked, minL, maxL)
            ?? lane;

        this.targetLateral = lane;
    }

    update(state: GameState) {
        // Reset keys
        this.keys = {};

        // Always gas (Throttle)
        this.keys['w'] = true;
        this.keys['ArrowUp'] = true;

        // Steering Logic
        // Coordinate System: Left is Negative, Right is Positive.
        // Steer on where we'd coast to if we let go now (lateral speed decays
        // by slideFactor a frame), so slippery hulls ease off early and settle
        // on the target lane instead of sliding past it.
        const coast = state.velocity.x * this.slideFactor / (1 - this.slideFactor);
        const error = state.lateralPosition + coast - this.targetLateral;
        const deadzone = 1.0;

        // If error > 0, current > target. We are to the RIGHT of the target.
        // We need to steer LEFT ('a').
        if (error > deadzone) {
            // We are too far Right
            // Steer Left
            this.keys['a'] = true;
            this.keys['ArrowLeft'] = true;
        } else if (error < -deadzone) {
            // We are too far Left
            // Steer Right
            this.keys['d'] = true;
            this.keys['ArrowRight'] = true;
        }
    }

    isKeyPressed(key: string): boolean {
        return !!this.keys[key];
    }
}

type PilotStats = { velocity: number; acceleration: number; handling: number };

export interface OpponentConfig extends ShipConfig {
    id: string;
    name: string;
    // Applied per race, scaled by the cup tier (see RIVAL_TIERS).
    pilotStats?: PilotStats;
    skill?: number; // 0..1 rank within the field
}

export class OpponentManager {
    public opponents: Ship[] = [];
    private controllers: AIInputController[] = [];

    private scene: THREE.Scene;
    private trackCurve: THREE.Curve<THREE.Vector3>;
    private bank: boolean;
    private wallLimit?: (t: number) => [number, number];
    private windForce?: (t: number, ms: number) => number;
    private rechargeZone?: RechargeZone;

    constructor(
        scene: THREE.Scene,
        trackCurve: THREE.Curve<THREE.Vector3>,
        roster: OpponentConfig[],
        bank: boolean = true,
        wallLimit?: (t: number) => [number, number],
        windForce?: (t: number, ms: number) => number,
        rechargeZone?: RechargeZone,
        tier: number = 0
    ) {
        this.scene = scene;
        this.trackCurve = trackCurve;
        this.bank = bank;
        this.wallLimit = wallLimit;
        this.windForce = windForce;
        this.rechargeZone = rechargeZone;
        this.spawnOpponents(roster, RIVAL_TIERS[Math.min(Math.max(0, tier), RIVAL_TIERS.length - 1)]);
    }

    private spawnOpponents(roster: OpponentConfig[], tier: typeof RIVAL_TIERS[number]) {
        roster.forEach((rosterConfig, i) => {
            // Energy parity with the player: same damage sources, same DNF.
            const config = { ...rosterConfig, energyEnabled: true };
            if (config.pilotStats) {
                const s = config.pilotStats;
                applyPilotStats(config, { velocity: s.velocity * tier.pilot, acceleration: s.acceleration * tier.pilot, handling: s.handling * tier.pilot });
            }
            const opponent = new Ship(this.scene, false, config);
            opponent.state.rechargeZone = this.rechargeZone;

            // Grid Positioning
            const row = Math.floor(i / 2) + 1;
            const col = i % 2; // 0 = Left, 1 = Right

            const rowDepth = 0.002;
            const startOffset = 0.93;

            // Move forwards: offset + (row * depth)
            const t = (startOffset + (row * rowDepth)) % 1;
            const lateral = (col === 0 ? -1 : 1) * 15;

            // Set Initial State
            opponent.state.trackProgress = t;
            opponent.state.lateralPosition = lateral;

            // Create Controller
            // Assign a random preferred lane relative to their start side
            const randomLane = (Math.random() - 0.5) * 60;
            const skill = tier.skillLo + (tier.skillHi - tier.skillLo) * (config.skill ?? Math.random());
            const controller = new AIInputController(randomLane, opponent.state.slideFactor, skill);
            this.controllers.push(controller);

            this.opponents.push(opponent);

            // Initial Mesh Update
            opponent.updateMesh(this.trackCurve, this.bank);
        });
    }

    public static generateRoster(count: number): OpponentConfig[] {
        const colors = [0x00cc00, 0x0000cc, 0xcccc00, 0xcc00cc, 0x00cccc, 0xff8800];
        const roster: OpponentConfig[] = [];

        // Curated rival names, sampled without replacement (see rivalNames.ts)
        const names = drawRivalNames(count);

        for (let i = 0; i < count; i++) {
            // Any of the four hulls
            const shipTypes: ShipType[] = ['lancer', 'rapier', 'sledge', 'kestrel'];
            const type = shipTypes[Math.floor(Math.random() * shipTypes.length)];

            // Create Ship with Config
            // We'll calculate base stats for the type, then apply some variance
            const basetoConfig = {
                ...SHIP_STATS[type],
                color: colors[i % colors.length],
                type: type
            };

            // Apply Random Variance (reduced to keep ships clustered)
            basetoConfig.accelFactor *= 1.0 + (Math.random() * 0.1 - 0.05);  // ±5%
            basetoConfig.friction += (Math.random() * 0.0006 - 0.0003);       // ±0.0003 (was ±0.001)
            basetoConfig.turnSpeed *= 1.0 + (Math.random() * 0.2 - 0.1);     // ±10%
            basetoConfig.color = colors[i % colors.length];

            const pilot = PILOTS[Math.floor(Math.random() * PILOTS.length)];

            roster.push({
                ...basetoConfig,
                id: `ai_${i}`,
                name: names[i],
                pilotStats: { ...pilot.stats },
                skill: Math.random()
            });
        }
        return roster;
    }

    public update(dt: number, trackLength: number, pads: BoostPad[], raceStarted: boolean, gameTime: number = 0, hazards: Hazard[] = []) {
        for (let i = 0; i < this.opponents.length; i++) {
            const opponent = this.opponents[i];
            const controller = this.controllers[i];

            // 1. Update AI Decision: preferred lane, bent toward the recharge
            // pad when low and around spotted blocks, kept inside the walls
            // (on canyon tracks, the local gorge width). A retired (out of
            // energy) rival gets no input and coasts to a stop.
            if (!opponent.retired) {
                controller.plan(opponent.state, trackLength, hazards, pads, this.wallLimit);
                controller.update(opponent.state);
            }
            const input = opponent.retired ? IDLE_INPUT : controller;

            // 1b. The storm shoves the AI too (same wind as the player). Below
            // the weakest strafe, so a wall-blown AI can always steer back off.
            if (this.windForce && raceStarted) {
                opponent.state.velocity.x += this.windForce(opponent.state.trackProgress, gameTime) * dt;
            }

            // 2. Update Physics (same wall clamp as the player → solid walls for AI)
            opponent.update(dt, input, trackLength, pads, (_msg) => {
                // Handle lap complete if needed (e.g. AI lap counter)
                // For now, ignore
            }, raceStarted && !opponent.retired, gameTime, hazards, this.wallLimit);

            // 3. Update Mesh (+ visual wind lean: roll against the local shove)
            opponent.updateMesh(this.trackCurve, this.bank);
            if (this.windForce) {
                opponent.mesh.rotateZ(this.windForce(opponent.state.trackProgress, gameTime) * 26);
            }
        }

        // 4. Soft separation between overlapping rivals: a gentle mutual lateral
        // steer-apart so ships hold racing room instead of clipping through each
        // other on screen. Deliberately NO speed or energy effects (and never
        // view-dependent) — race outcomes must not change based on who overlaps
        // whom. Real contact consequences are player-only, handled in Game.tsx.
        if (raceStarted) {
            const SEP_ALONG = 8 / trackLength; // world units → track-progress band
            for (let a = 0; a < this.opponents.length; a++) {
                for (let b = a + 1; b < this.opponents.length; b++) {
                    const A = this.opponents[a].state;
                    const B = this.opponents[b].state;
                    let dp = Math.abs(A.trackProgress - B.trackProgress);
                    dp = Math.min(dp, 1 - dp);
                    if (dp < SEP_ALONG) {
                        const dl = A.lateralPosition - B.lateralPosition;
                        if (Math.abs(dl) < 6) {
                            const push = (dl >= 0 ? 1 : -1) * 0.08 * dt;
                            A.velocity.x += push;
                            B.velocity.x -= push;
                        }
                    }
                }
            }
        }
    }
}
