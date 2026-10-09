import { useState } from 'react';
import { audioManager } from '../game/AudioManager';
import { formatCredits } from '../game/economy';
import { PARTS, buyPart, getPartLevels, nextPrice, ENERGY_PER_LEVEL, POINTS_PER_LEVEL, MAX_PART_LEVEL, type PartDef } from '../game/garage';
import { getProfile } from '../game/profile';

interface GarageProps {
    onBack: () => void;
}

// Effect of a part level, in the player's terms. Pilot stat points convert at
// ~5% top speed, 15% acceleration and 10% handling per point (tuning.ts).
function effectText(part: PartDef, level: number): string {
    if (level === 0) return 'Stock';
    const pct = part.slot === 'engine' ? level * POINTS_PER_LEVEL * 5
        : part.slot === 'thrusters' ? level * POINTS_PER_LEVEL * 15
        : part.slot === 'fins' ? level * POINTS_PER_LEVEL * 10
        : level * ENERGY_PER_LEVEL * 100;
    return `+${Math.round(pct * 10) / 10}% ${part.statLabel}`;
}

export default function Garage({ onBack }: GarageProps) {
    // Re-read the profile after each purchase (it's a cached object, so bump a
    // counter to re-render rather than copying it into state).
    const [, setRevision] = useState(0);
    const [flash, setFlash] = useState<string | null>(null);
    const credits = getProfile().credits;
    const levels = getPartLevels();

    const handleBuy = (part: PartDef) => {
        const result = buyPart(part.slot);
        if (result === 'ok') {
            audioManager.playClick();
            setFlash(part.slot);
            setTimeout(() => setFlash((f) => (f === part.slot ? null : f)), 600);
        }
        setRevision((r) => r + 1);
    };

    return (
        <div className="relative z-10 flex flex-col items-center h-full p-8">
            <div className="mb-4"><h2 className="screen-title">GARAGE</h2><div className="screen-rule" /></div>
            <div className="screen-subtitle mb-6">Parts fit every ship you fly</div>

            <div className="credit-chip mb-8" title="Earned from race placement">{formatCredits(credits)}</div>

            <div className="flex flex-wrap justify-center content-start gap-6 w-full max-w-6xl overflow-y-auto flex-1 min-h-0 p-4 scrollbar-hide">
                {PARTS.map((part) => {
                    const level = levels[part.slot];
                    const price = nextPrice(part.slot, level);
                    const maxed = price === null;
                    const affordable = !maxed && credits >= price;
                    return (
                        <div
                            key={part.slot}
                            className={`neon-card garage-card w-60 flex flex-col p-5 ${flash === part.slot ? 'garage-card-flash' : ''}`}
                            style={{ ['--card-accent' as string]: part.accent }}
                        >
                            <div className="neon-label" style={{ color: part.accent }}>{part.name}</div>
                            <div className="stat-label mt-1">{part.stat}</div>

                            <div className="neon-card-title text-white text-base mt-4 min-h-[3rem]">
                                {level > 0 ? part.levelNames[level - 1] : 'Stock'}
                            </div>

                            <div className="seg-bar mt-2">
                                {[...Array(MAX_PART_LEVEL)].map((_, i) => (
                                    <span key={i} className={i < level ? 'on' : ''} style={i < level ? { backgroundColor: part.accent } : undefined} />
                                ))}
                            </div>
                            <div className="text-xs text-gray-300 mt-2">{effectText(part, level)}</div>

                            <div className="mt-auto pt-6">
                                {maxed ? (
                                    <div className="neon-label text-center text-amber-300 py-2">Maxed out</div>
                                ) : (
                                    <>
                                        <div className="text-xs text-gray-400 mb-2">
                                            Next: <span className="text-gray-200">{part.levelNames[level]}</span>
                                            <div>{effectText(part, level + 1)}</div>
                                        </div>
                                        <button
                                            onClick={() => handleBuy(part)}
                                            onMouseEnter={() => { if (affordable) audioManager.playHover(); }}
                                            disabled={!affordable}
                                            className="menu-btn menu-btn-sm menu-btn-gold w-full"
                                        >
                                            BUY · {formatCredits(price)}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex space-x-6 mt-8">
                <button
                    onClick={() => { audioManager.playClick(); onBack(); }}
                    onMouseEnter={() => audioManager.playHover()}
                    className="menu-btn menu-btn-back"
                >
                    MAIN MENU
                </button>
            </div>
        </div>
    );
}
