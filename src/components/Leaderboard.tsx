import React, { useState } from 'react';

export interface RaceResult {
    rank: number;
    name: string;
    isPlayer: boolean;
    timeStr: string;
    points: number;
    totalPoints?: number;
}

interface LeaderboardProps {
    results: RaceResult[];
    onRestart: () => void;
    onNextRace?: () => void;
    onExit?: () => void;
    isCampaign?: boolean;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ results, onRestart, onNextRace, onExit, isCampaign = false }) => {
    const [viewMode, setViewMode] = useState<'race' | 'campaign'>('race');

    // Sort results based on view mode
    const displayedResults = [...results].sort((a, b) => {
        if (viewMode === 'race') {
            return a.rank - b.rank;
        } else {
            return (b.totalPoints || 0) - (a.totalPoints || 0);
        }
    });

    return (
        <div className="absolute inset-0 flex items-center justify-center z-50 bg-black bg-opacity-90">
            <div className="w-full max-w-2xl bg-gray-900 border-2 border-cyan-500 rounded-lg p-8 shadow-[0_0_50px_rgba(0,255,255,0.3)]">
                {/* Tabs - Only show if Campaign Mode */}
                {isCampaign && (
                    <div className="flex justify-center mb-6 space-x-4">
                        <button
                            onClick={() => setViewMode('race')}
                            className={`text-2xl font-bold uppercase tracking-widest px-4 py-2 border-b-4 transition-colors ${viewMode === 'race' ? 'text-cyan-400 border-cyan-400' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                        >
                            Race Results
                        </button>
                        <button
                            onClick={() => setViewMode('campaign')}
                            className={`text-2xl font-bold uppercase tracking-widest px-4 py-2 border-b-4 transition-colors ${viewMode === 'campaign' ? 'text-yellow-400 border-yellow-400' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                        >
                            Campaign
                        </button>
                    </div>
                )}

                {/* Single Race Header if valid */}
                {!isCampaign && (
                    <h1 className="text-4xl font-bold text-center text-cyan-400 mb-8 tracking-widest uppercase">Race Results</h1>
                )}

                <div className="space-y-2 mb-8 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-4 text-gray-400 text-sm uppercase tracking-wider border-b border-gray-700 pb-2">
                        <div className="col-span-2 text-center">Rank</div>
                        <div className="col-span-4">Pilot</div>
                        {viewMode === 'race' && <div className="col-span-2 text-right">Time</div>}
                        {isCampaign && <div className="col-span-2 text-right">{viewMode === 'race' ? '+ Points' : 'Last Pts'}</div>}
                        {!isCampaign && <div className="col-span-2 text-right">Points</div>}
                        {isCampaign && <div className="col-span-2 text-right">Total</div>}
                    </div>

                    {/* Rows */}
                    {displayedResults.map((result, index) => {
                        const displayRank = viewMode === 'campaign' ? index + 1 : result.rank;
                        return (
                            <div
                                key={result.name}
                                className={`grid grid-cols-12 gap-4 items-center p-3 rounded ${result.isPlayer
                                    ? 'bg-cyan-900 bg-opacity-40 border border-cyan-500/50'
                                    : 'bg-gray-800 bg-opacity-40 hover:bg-gray-700'
                                    }`}
                            >
                                <div className="col-span-2 text-center text-xl font-bold text-white">
                                    {displayRank}
                                    <span className="text-xs ml-1 align-top text-gray-400">
                                        {displayRank === 1 ? 'st' : displayRank === 2 ? 'nd' : displayRank === 3 ? 'rd' : 'th'}
                                    </span>
                                </div>
                                <div className="col-span-4 flex items-center">
                                    <div className={`w-3 h-3 rounded-full mr-3 ${result.isPlayer ? 'bg-cyan-400 shadow-[0_0_10px_cyan]' : 'bg-red-500'}`} />
                                    <span className={`font-mono text-lg ${result.isPlayer ? 'text-cyan-300 font-bold' : 'text-gray-300'}`}>
                                        {result.name}
                                    </span>
                                </div>
                                {viewMode === 'race' && (
                                    <div className="col-span-2 text-right font-mono text-yellow-300">
                                        {result.timeStr}
                                    </div>
                                )}
                                <div className="col-span-2 text-right font-bold text-white text-lg opacity-70">
                                    {result.points}
                                </div>
                                {isCampaign && (
                                    <div className={`col-span-2 text-right font-bold text-xl ${viewMode === 'campaign' ? 'text-yellow-400 scale-110' : 'text-cyan-400'}`}>
                                        {result.totalPoints ?? result.points}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="flex justify-center space-x-4">
                    <button
                        onClick={onRestart}
                        className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded uppercase tracking-widest transition-all"
                    >
                        Restart
                    </button>
                    {onNextRace ? (
                        <button
                            onClick={onNextRace}
                            className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded uppercase tracking-widest transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(0,255,255,0.4)]"
                        >
                            Next Race
                        </button>
                    ) : (
                        onExit && (
                            <button
                                onClick={onExit}
                                className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded uppercase tracking-widest transition-all"
                            >
                                Main Menu
                            </button>
                        )
                    )}
                </div>
            </div>
        </div>
    );
};
