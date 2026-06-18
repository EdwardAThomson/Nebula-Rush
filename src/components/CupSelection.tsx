import { CUPS, resolveCupTracks, isCupReady, type Cup } from '../game/CupDefinitions';
import { getClearedCups, isCupUnlocked, isCupSelectable } from '../game/cupProgress';
import { audioManager } from '../game/AudioManager';

interface CupSelectionProps {
    onSelect: (cup: Cup) => void;
    onRaceAll: () => void;
    onBack: () => void;
}

const cssHex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export default function CupSelection({ onSelect, onRaceAll, onBack }: CupSelectionProps) {
    // Read once per render — progression only changes between races.
    const cleared = getClearedCups();
    // "Race All" chains every built cup; only worth offering with 2+ ready.
    const readyCupCount = CUPS.filter(isCupReady).length;

    return (
        <div className="relative z-10 flex flex-col items-center h-full p-8">
            <h2 className="text-4xl font-bold text-white mb-2">SELECT CUP</h2>
            <p className="text-gray-400 text-sm mb-6">Win a cup (finish top 3) to unlock the next.</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl overflow-y-auto flex-1 min-h-0 p-4 scrollbar-hide">
                {CUPS.map((cup) => {
                    const ready = isCupReady(cup);
                    const unlocked = isCupUnlocked(cup, cleared);
                    const selectable = isCupSelectable(cup, cleared);
                    const isCleared = cleared.includes(cup.id);
                    const accent = cssHex(cup.accent);
                    const trackNames = ready ? resolveCupTracks(cup).map((t) => t.name) : (cup.plannedTracks ?? []);

                    // Status label for the corner badge.
                    let badge: { text: string; color: string };
                    if (!ready) badge = { text: 'COMING SOON', color: '#6b7280' };
                    else if (!unlocked) badge = { text: '🔒 LOCKED', color: '#6b7280' };
                    else if (isCleared) badge = { text: '✓ CLEARED', color: '#22d3ee' };
                    else badge = { text: '5 RACES', color: accent };

                    return (
                        <div
                            key={cup.id}
                            onClick={selectable ? () => { audioManager.playClick(); onSelect(cup); } : undefined}
                            onMouseEnter={selectable ? () => audioManager.playHover() : undefined}
                            className={`relative p-6 rounded-xl border-2 transition-all bg-gray-800 ${selectable
                                ? 'cursor-pointer hover:bg-gray-700 transform hover:-translate-y-2'
                                : 'opacity-50 cursor-not-allowed'
                                }`}
                            style={{ borderColor: selectable ? accent : '#374151' }}
                        >
                            <div
                                className="absolute top-4 right-4 text-xs font-bold tracking-wider px-2 py-1 rounded"
                                style={{ color: badge.color, backgroundColor: 'rgba(0,0,0,0.4)' }}
                            >
                                {badge.text}
                            </div>

                            <div className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: accent }}>
                                {cup.theme}
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-2">{cup.name}</h3>
                            <p className="text-gray-400 text-sm mb-4 h-10">{cup.description}</p>

                            <ol className="space-y-1">
                                {trackNames.map((name, i) => (
                                    <li key={i} className="text-sm text-gray-300 flex items-center">
                                        <span className="text-gray-600 w-5">{i + 1}.</span>
                                        {name}
                                    </li>
                                ))}
                            </ol>

                            {!unlocked && ready && (
                                <p className="text-xs text-gray-500 mt-3 italic">Clear the previous cup to unlock.</p>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="flex space-x-6 mt-8">
                <button
                    onClick={() => { audioManager.playClick(); onBack(); }}
                    onMouseEnter={() => audioManager.playHover()}
                    className="px-8 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded shadow-lg border border-gray-600 transition-all"
                >
                    BACK TO MENU
                </button>
                {readyCupCount >= 2 && (
                    <button
                        onClick={() => { audioManager.playClick(); onRaceAll(); }}
                        onMouseEnter={() => audioManager.playHover()}
                        className="px-8 py-3 bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-bold rounded shadow-lg transition-all transform hover:scale-105"
                        title="Race every built cup back-to-back"
                    >
                        🏆 RACE ALL
                    </button>
                )}
            </div>
        </div>
    );
}
