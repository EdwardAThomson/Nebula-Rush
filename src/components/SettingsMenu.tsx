import { useState, useEffect } from 'react';
import { audioManager } from '../game/AudioManager';

interface SettingsMenuProps {
    onClose: () => void;
}

export default function SettingsMenu({ onClose }: SettingsMenuProps) {
    const [sfxVolume, setSfxVolume] = useState(audioManager.getSfxVolume() * 100);
    const [musicVolume, setMusicVolume] = useState(audioManager.getMusicVolume() * 100);
    const [sfxEnabled, setSfxEnabled] = useState(audioManager.isSfxEnabled());
    const [musicEnabled, setMusicEnabled] = useState(audioManager.isMusicEnabled());

    // Jukebox State
    const [currentTrack, setCurrentTrack] = useState<string | null>(audioManager.getCurrentTrackName());
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTrack(audioManager.getCurrentTrackName());
            const curr = audioManager.getCurrentTime();
            const dur = audioManager.getDuration();
            setProgress(curr);
            setDuration(dur || 1); // Avoid div by zero
        }, 100); // 10Hz update

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        audioManager.setSfxVolume(sfxVolume / 100);
    }, [sfxVolume]);

    useEffect(() => {
        audioManager.setMusicVolume(musicVolume / 100);
    }, [musicVolume]);

    const handleSfxToggle = () => {
        const newState = audioManager.toggleSfx();
        setSfxEnabled(newState);
    };

    const handleMusicToggle = () => {
        const newState = audioManager.toggleMusic();
        setMusicEnabled(newState);
    };

    const handleTestSfx = () => {
        audioManager.playClick();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80">
            <div className="bg-gray-900 border-2 border-cyan-500 rounded-xl p-8 w-full max-w-md shadow-[0_0_30px_rgba(34,211,238,0.3)]">
                <h2 className="text-3xl font-bold text-cyan-400 mb-8 text-center">SETTINGS</h2>

                {/* SFX Section */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-white font-bold">Sound Effects</label>
                        <button
                            onClick={handleSfxToggle}
                            onMouseEnter={() => audioManager.playHover()}
                            className={`px-4 py-1 rounded font-bold text-sm transition-all ${sfxEnabled
                                ? 'bg-cyan-600 text-white'
                                : 'bg-gray-700 text-gray-400'
                                }`}
                        >
                            {sfxEnabled ? 'ON' : 'OFF'}
                        </button>
                    </div>
                    <div className="flex items-center space-x-4">
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={sfxVolume}
                            onChange={(e) => setSfxVolume(Number(e.target.value))}
                            disabled={!sfxEnabled}
                            className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-50"
                        />
                        <span className="text-gray-400 w-12 text-right">{Math.round(sfxVolume)}%</span>
                    </div>
                    <button
                        onClick={handleTestSfx}
                        onMouseEnter={() => audioManager.playHover()}
                        disabled={!sfxEnabled}
                        className="mt-2 text-sm text-cyan-400 hover:text-cyan-300 disabled:text-gray-600 disabled:cursor-not-allowed"
                    >
                        ▶ Test Sound
                    </button>
                </div>

                {/* Music Section */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-white font-bold">Music</label>
                        <button
                            onClick={handleMusicToggle}
                            onMouseEnter={() => audioManager.playHover()}
                            className={`px-4 py-1 rounded font-bold text-sm transition-all ${musicEnabled
                                ? 'bg-purple-600 text-white'
                                : 'bg-gray-700 text-gray-400'
                                }`}
                        >
                            {musicEnabled ? 'ON' : 'OFF'}
                        </button>
                    </div>
                    <div className="flex items-center space-x-4">
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={musicVolume}
                            onChange={(e) => setMusicVolume(Number(e.target.value))}
                            disabled={!musicEnabled}
                            className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500 disabled:opacity-50"
                        />
                        <span className="text-gray-400 w-12 text-right">{Math.round(musicVolume)}%</span>
                    </div>
                </div>

                {/* Jukebox Section */}
                <div className="mb-8">
                    <label className="text-white font-bold block mb-4">Music Preview 🎵</label>

                    {/* Now Playing Info */}
                    <div className="bg-gray-800 p-3 rounded mb-3 border border-gray-700">
                        <div className="text-cyan-400 text-sm font-bold mb-1">
                            {currentTrack ? `NOW PLAYING: ${currentTrack}` : 'SELECT A TRACK'}
                        </div>
                        {/* Progress Bar */}
                        <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-cyan-500 transition-all duration-100 ease-linear"
                                style={{ width: `${(progress / duration) * 100}%` }}
                            ></div>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>{formatTimeUI(progress)}</span>
                            <span>{formatTimeUI(duration)}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                        <AudioTrackButton name="Neon Velocity" track="neonVelocity" active={currentTrack === 'Neon Velocity'} />
                        <AudioTrackButton name="Zero Horizon" track="zeroHorizon" active={currentTrack === 'Zero Horizon'} />
                        <AudioTrackButton name="Orbital Velocity" track="orbitalVelocity" active={currentTrack === 'Orbital Velocity'} />
                    </div>
                    <div className="flex space-x-2 mt-4 pt-4 border-t border-gray-700">
                        {/* PLAY / RESUME */}
                        <button
                            onClick={() => audioManager.resumeMusic()}
                            onMouseEnter={() => audioManager.playHover()}
                            className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded shadow transition-all flex items-center justify-center"
                        >
                            <span className="mr-2">▶</span> RESUME
                        </button>

                        {/* PAUSE */}
                        <button
                            onClick={() => audioManager.pauseMusic()}
                            onMouseEnter={() => audioManager.playHover()}
                            className="flex-1 py-2 bg-yellow-400 hover:bg-yellow-300 text-black font-bold rounded shadow transition-all flex items-center justify-center"
                        >
                            {/* Custom Wide Pause Icon */}
                            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="5" y="4" width="5" height="16" rx="1" />
                                <rect x="14" y="4" width="5" height="16" rx="1" />
                            </svg>
                            PAUSE
                        </button>

                        {/* STOP */}
                        <button
                            onClick={() => audioManager.stopMusic()}
                            onMouseEnter={() => audioManager.playHover()}
                            className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow transition-all flex items-center justify-center"
                        >
                            <span className="mr-2">⏹</span> STOP
                        </button>
                    </div>
                </div>

                {/* Close Button */}
                <button
                    onClick={() => { audioManager.playClick(); onClose(); }}
                    onMouseEnter={() => audioManager.playHover()}
                    className="w-full px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded shadow-lg transition-all"
                >
                    CLOSE
                </button>
            </div>
        </div>
    );
}

function AudioTrackButton({ name, track, active }: { name: string, track: any, active?: boolean }) {
    return (
        <button
            onClick={() => audioManager.playMusic(track, true)}
            onMouseEnter={() => audioManager.playHover()}
            className={`flex items-center justify-between px-4 py-2 rounded border transition-all group ${active
                ? 'bg-cyan-900 border-cyan-500 bg-opacity-40'
                : 'bg-gray-800 border-gray-600 hover:bg-gray-700'
                }`}
        >
            <span className={`group-hover:text-cyan-400 ${active ? 'text-cyan-400 font-bold' : 'text-gray-300'}`}>{name}</span>
            {active && <span className="text-xs text-cyan-400 animate-pulse">PLAYING...</span>}
            {!active && <span className="text-xs bg-gray-900 px-2 py-1 rounded text-gray-500">▶ PLAY</span>}
        </button>
    );
}

// Helper for MM:SS
const formatTimeUI = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};
