import React, { useState, useEffect } from 'react';

export interface RaceResult {
    id: string;
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
    onNextCup?: () => void;
    onExit?: () => void;
    isCampaign?: boolean;
    photos?: { url: string; time: number }[];
    onDownloadPhoto?: (p: { url: string; time: number }) => void;
    onDownloadAll?: () => void;
    onTutorial?: () => void;
    showTutorialHint?: boolean;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ results, onRestart, onNextRace, onNextCup, onExit, isCampaign = false, photos, onDownloadPhoto, onDownloadAll, onTutorial, showTutorialHint }) => {
    const [viewMode, setViewMode] = useState<'race' | 'campaign'>('race');
    const [preview, setPreview] = useState<number | null>(null); // photo lightbox index

    // Lightbox keyboard controls: Esc closes, arrows step through photos.
    useEffect(() => {
        if (preview === null || !photos) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setPreview(null);
            else if (e.key === 'ArrowRight') setPreview(p => (p === null ? p : (p + 1) % photos.length));
            else if (e.key === 'ArrowLeft') setPreview(p => (p === null ? p : (p - 1 + photos.length) % photos.length));
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [preview, photos]);

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
                                key={result.id}
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

                {photos && photos.length > 0 && (
                    <div className="mb-6 border-t border-gray-700 pt-4">
                        <div className="flex items-center justify-center gap-3 mb-2">
                            <span className="text-cyan-300 text-sm font-bold uppercase tracking-wider">📷 Race Photos ({photos.length})</span>
                            {onDownloadAll && (
                                <button onClick={onDownloadAll} className="px-2 py-0.5 text-xs font-bold rounded border border-cyan-500 text-cyan-200 hover:bg-cyan-500/20 transition-colors">
                                    Download all
                                </button>
                            )}
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                            {photos.map((p, i) => (
                                <button key={i} onClick={() => setPreview(i)} title="View" className="shrink-0 border border-cyan-700 rounded hover:border-cyan-300 transition-colors">
                                    <img src={p.url} alt={`Race photo ${i + 1}`} className="h-16 rounded" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

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
                    ) : onNextCup ? (
                        // "Race All": cup finished, but more cups remain in the gauntlet.
                        <>
                            {onExit && (
                                <button
                                    onClick={onExit}
                                    className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded uppercase tracking-widest transition-all"
                                >
                                    Main Menu
                                </button>
                            )}
                            <button
                                onClick={onNextCup}
                                className="px-8 py-3 bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-bold rounded uppercase tracking-widest transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(250,204,21,0.5)]"
                            >
                                Next Cup →
                            </button>
                        </>
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

                {showTutorialHint && onTutorial && (
                    <div className="text-center mt-4">
                        <button
                            onClick={onTutorial}
                            className="text-sm text-indigo-300 hover:text-indigo-200 underline underline-offset-2"
                        >
                            New to the controls? Try the tutorial →
                        </button>
                    </div>
                )}
            </div>

            {preview !== null && photos && photos[preview] && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-95 p-6"
                    onClick={() => setPreview(null)}
                >
                    <div className="relative flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
                        <img
                            src={photos[preview].url}
                            alt={`Race photo ${preview + 1}`}
                            className="max-w-[90vw] max-h-[78vh] rounded-lg border border-cyan-700 shadow-[0_0_40px_rgba(0,255,255,0.25)]"
                        />
                        <div className="flex items-center gap-4 mt-4">
                            {photos.length > 1 && (
                                <button
                                    onClick={() => setPreview(p => (p === null ? p : (p - 1 + photos.length) % photos.length))}
                                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded transition-colors"
                                >
                                    ‹ Prev
                                </button>
                            )}
                            <span className="text-gray-300 text-sm font-mono">{preview + 1} / {photos.length}</span>
                            {photos.length > 1 && (
                                <button
                                    onClick={() => setPreview(p => (p === null ? p : (p + 1) % photos.length))}
                                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded transition-colors"
                                >
                                    Next ›
                                </button>
                            )}
                            <button
                                onClick={() => onDownloadPhoto?.(photos[preview])}
                                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded uppercase tracking-wider transition-colors"
                            >
                                Download
                            </button>
                            <button
                                onClick={() => setPreview(null)}
                                className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
