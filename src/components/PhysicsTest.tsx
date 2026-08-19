import { useState } from 'react';
import Game from './Game';
import { PILOTS, type Pilot } from '../game/PilotDefinitions';
import { SHIP_STATS } from '../game/ShipFactory';
import type { ShipConfig } from '../game/Ship';
import { audioManager } from '../game/AudioManager';

// PHYSICS TEST PAGE (dev tool): drive the same pilot under different
// stat-to-physics mappings and compare by feel. This page pre-computes the
// ship config itself and passes pilot=null so nothing is applied twice.
//
// History: the legacy mapping made the ACCELERATION stat (×1.05/pt on
// accelFactor) raise top speed ~2x more per point than VELOCITY (+0.0002/pt
// on friction) — Darius out-ran the +2-velocity pilots. After playtesting the
// variants here, the DECOUPLED mapping shipped to the real game (Game.tsx,
// Aug 2026). Keep the 'decoupled' branch below in sync with Game.tsx.

interface PhysicsTestProps {
    onBack: () => void;
}

type VariantId = 'current' | 'decoupled' | 'retuned';

const VARIANTS: { id: VariantId; name: string; blurb: string }[] = [
    {
        id: 'current',
        name: 'LEGACY (pre-Aug 2026)',
        blurb: 'The old live mapping. Accel ×1.05/pt on thrust (also raised top speed!), velocity +0.0002/pt friction.',
    },
    {
        id: 'decoupled',
        name: 'DECOUPLED (live game)',
        blurb: 'Velocity +0.0004/pt owns top speed. Accel scales thrust AND drag together (×1.15/pt): reaches the same top speed proportionally faster.',
    },
    {
        id: 'retuned',
        name: 'RETUNED',
        blurb: 'Same shape as current, rebalanced: accel ×1.015/pt, velocity +0.0005/pt so velocity genuinely dominates.',
    },
];

// Apply a pilot's stats to the fighter baseline under the chosen mapping.
function buildConfig(variant: VariantId, pilot: Pilot): ShipConfig {
    const cfg: ShipConfig = {
        color: 0xcc0000,
        accentColor: 0xeeeeee,
        ...SHIP_STATS.fighter,
        type: 'fighter',
        id: pilot.id,
        name: pilot.name,
    };
    const s = pilot.stats;
    if (variant === 'current') {
        cfg.accelFactor *= 1 + s.acceleration * 0.05;
        cfg.friction += s.velocity * 0.0002;
    } else if (variant === 'decoupled') {
        // Velocity owns the ceiling; accel owns how fast you get there.
        // Top speed = accelFactor/(1-friction), so scaling thrust and drag by
        // the SAME factor leaves the ceiling untouched while the ship converges
        // to it proportionally faster. (v1 only sped the ~0.3s throttle spool,
        // which was imperceptible next to the ~5s drag-limited speed build.)
        cfg.friction += s.velocity * 0.0004;
        const k = 1 + s.acceleration * 0.15;
        cfg.accelFactor *= k;
        cfg.friction = 1 - (1 - cfg.friction) * k;
        cfg.throttleRate = 0.05 * (1 + s.acceleration * 0.15); // quicker spool too
    } else {
        // Coefficients chosen so a 1-pt velocity edge beats a 2-pt accel edge
        // (accel ×1.02/pt still let Darius out-run Lyra, defeating the point).
        cfg.accelFactor *= 1 + s.acceleration * 0.015;
        cfg.friction += s.velocity * 0.0005;
    }
    const h = 1 + s.handling * 0.1;
    cfg.turnSpeed *= h;
    cfg.strafeSpeed *= h;
    return cfg;
}

const topSpeedKmh = (cfg: ShipConfig) => Math.round((cfg.accelFactor / (1 - cfg.friction)) * 10);

// Simulated seconds from standstill to 90% of top speed (throttle spool
// included) — the number that makes the acceleration stat visible on the cards.
function timeTo90(cfg: ShipConfig): number {
    const top = cfg.accelFactor / (1 - cfg.friction);
    const ramp = cfg.throttleRate ?? 0.05;
    let v = 0, throttle = 0;
    for (let frame = 0; frame < 1800; frame++) {
        throttle = Math.min(1, throttle + ramp);
        v = (v + cfg.accelFactor * throttle) * cfg.friction;
        if (v >= top * 0.9) return frame / 60;
    }
    return 30;
}

export default function PhysicsTest({ onBack }: PhysicsTestProps) {
    const [variant, setVariant] = useState<VariantId>('current');
    const [pilotId, setPilotId] = useState<string>(PILOTS[0].id);
    const [racing, setRacing] = useState(false);

    const pilot = PILOTS.find(p => p.id === pilotId) ?? PILOTS[0];

    if (racing) {
        return (
            <Game
                key={`${variant}-${pilotId}`}
                shipConfig={buildConfig(variant, pilot)}
                initialTrackIndex={0}
                isCampaign={false}
                pilot={null} // config is pre-computed above; don't re-apply stats
                forcedEnvironment={{ timeOfDay: 'day', weather: 'clear' }} // fixed conditions for fair A/B
                onExit={() => setRacing(false)}
            />
        );
    }

    return (
        <div className="relative z-10 flex flex-col items-center h-full p-8 overflow-y-auto scrollbar-hide">
            <h2 className="text-4xl font-bold text-white mb-2">PHYSICS TEST</h2>
            <p className="text-gray-400 text-sm mb-6 max-w-2xl text-center">
                Dev tool: race Track 1 (Fighter, day/clear, full AI field) with the same pilot under
                different stat mappings. The live game is unaffected by anything here.
            </p>

            {/* Variant picker */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-5xl mb-8">
                {VARIANTS.map(v => (
                    <div
                        key={v.id}
                        onClick={() => { audioManager.playClick(); setVariant(v.id); }}
                        onMouseEnter={() => audioManager.playHover()}
                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${variant === v.id
                            ? 'border-cyan-400 bg-cyan-900 bg-opacity-30'
                            : 'border-gray-700 bg-gray-800 bg-opacity-60 hover:border-gray-500'}`}
                    >
                        <div className={`font-bold mb-1 ${variant === v.id ? 'text-cyan-300' : 'text-gray-300'}`}>{v.name}</div>
                        <div className="text-xs text-gray-400 leading-snug">{v.blurb}</div>
                    </div>
                ))}
            </div>

            {/* Pilot picker with computed numbers under the chosen variant */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-5xl mb-8">
                {PILOTS.map(p => {
                    const cfg = buildConfig(variant, p);
                    return (
                        <div
                            key={p.id}
                            onClick={() => { audioManager.playClick(); setPilotId(p.id); }}
                            onMouseEnter={() => audioManager.playHover()}
                            className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${pilotId === p.id
                                ? 'border-amber-400 bg-amber-900 bg-opacity-20'
                                : 'border-gray-700 bg-gray-800 bg-opacity-60 hover:border-gray-500'}`}
                        >
                            <div className={`text-sm font-bold ${pilotId === p.id ? 'text-amber-300' : 'text-white'}`}>{p.name}</div>
                            <div className="text-[11px] text-gray-400 mt-0.5">
                                V{p.stats.velocity >= 0 ? '+' : ''}{p.stats.velocity}&nbsp;
                                A{p.stats.acceleration >= 0 ? '+' : ''}{p.stats.acceleration}&nbsp;
                                H{p.stats.handling >= 0 ? '+' : ''}{p.stats.handling}
                            </div>
                            <div className="text-xs text-cyan-300 mt-1 font-mono">
                                {topSpeedKmh(cfg)} km/h top
                            </div>
                            <div className="text-xs text-orange-300 font-mono">
                                {Math.round(topSpeedKmh(cfg) * 1.35)} boosted
                            </div>
                            <div className="text-[11px] text-gray-500 font-mono">
                                0→90%: {timeTo90(cfg).toFixed(1)}s
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex space-x-6">
                <button
                    onClick={() => { audioManager.playClick(); setRacing(true); }}
                    onMouseEnter={() => audioManager.playHover()}
                    className="px-10 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded shadow-lg transition-all"
                >
                    RACE ▶
                </button>
                <button
                    onClick={() => { audioManager.playClick(); onBack(); }}
                    onMouseEnter={() => audioManager.playHover()}
                    className="px-8 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded shadow-lg border border-gray-600 transition-all"
                >
                    BACK TO MENU
                </button>
            </div>
        </div>
    );
}
