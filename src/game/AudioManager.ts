// AudioManager - Handles music and sound effects for the game
// Usage:
//   import { audioManager } from './game/AudioManager';
//   audioManager.playHover();
//   audioManager.playClick();
//   audioManager.playMusic('menu');

type SoundEffect = 'hover' | 'click' | 'countdown' | 'raceStart' | 'lapComplete' | 'raceFinish' | 'boost' | 'engineRumble';
type MusicTrack = 'neonVelocity' | 'zeroHorizon' | 'orbitalVelocity';

interface AudioConfig {
    sfxVolume: number;      // 0-1
    musicVolume: number;    // 0-1
    sfxEnabled: boolean;
    musicEnabled: boolean;
}

class AudioManager {
    private sfxCache: Map<SoundEffect, HTMLAudioElement[]> = new Map();
    private musicTracks: Map<MusicTrack, HTMLAudioElement> = new Map();
    private currentMusic: HTMLAudioElement | null = null;
    private currentMusicTrack: MusicTrack | null = null;
    private engineRumbleAudio: HTMLAudioElement | null = null;
    private onTrackChange: ((name: string) => void) | null = null;

    // Cooldown tracking for hover sounds
    private lastHoverTime: number = 0;
    private hoverCooldown: number = 500; // ms between hover sounds

    private config: AudioConfig = {
        sfxVolume: 0.5,
        musicVolume: 0.3,
        sfxEnabled: true,
        musicEnabled: true
    };

    // Sound effect definitions - paths relative to public/
    private sfxPaths: Record<SoundEffect, string> = {
        hover: '/assets/audio/sfx/hover.mp3',
        click: '/assets/audio/sfx/click.mp3',
        countdown: '/assets/audio/sfx/countdown.mp3',
        raceStart: '/assets/audio/sfx/race_start.mp3',
        lapComplete: '/assets/audio/sfx/lap_complete.mp3',
        raceFinish: '/assets/audio/sfx/race_finish.mp3',
        boost: '/assets/audio/sfx/boost.mp3',
        engineRumble: '/assets/audio/sfx/engine_rumble.mp3'
    };

    // Music track definitions (jukebox)
    private musicPaths: Record<MusicTrack, string> = {
        neonVelocity: '/assets/audio/music/Neon_Velocity.mp3',
        zeroHorizon: '/assets/audio/music/Zero_Horizon.mp3',
        orbitalVelocity: '/assets/audio/music/Orbital_Velocity.mp3'
    };

    // List of race music tracks for random selection
    private raceTracks: MusicTrack[] = ['neonVelocity', 'zeroHorizon', 'orbitalVelocity'];

    constructor() {
        // Load config from localStorage if available
        this.loadConfig();
    }

    private loadConfig() {
        try {
            const saved = localStorage.getItem('nebula-rush-audio-config');
            if (saved) {
                this.config = { ...this.config, ...JSON.parse(saved) };
            }
        } catch (e) {
            console.warn('Failed to load audio config:', e);
        }
    }

    private saveConfig() {
        try {
            localStorage.setItem('nebula-rush-audio-config', JSON.stringify(this.config));
        } catch (e) {
            console.warn('Failed to save audio config:', e);
        }
    }

    // Preload a sound effect with multiple instances for overlapping playback
    private preloadSfx(effect: SoundEffect, poolSize: number = 3): HTMLAudioElement[] {
        if (this.sfxCache.has(effect)) {
            return this.sfxCache.get(effect)!;
        }

        const pool: HTMLAudioElement[] = [];
        const path = this.sfxPaths[effect];

        for (let i = 0; i < poolSize; i++) {
            const audio = new Audio(path);
            audio.volume = this.config.sfxVolume;
            audio.preload = 'auto';
            pool.push(audio);
        }

        this.sfxCache.set(effect, pool);
        return pool;
    }

    // Play a sound effect
    public playSfx(effect: SoundEffect) {
        if (!this.config.sfxEnabled) return;

        const pool = this.preloadSfx(effect);

        // Find an audio element that's not currently playing
        const available = pool.find(audio => audio.paused || audio.ended);

        if (available) {
            available.currentTime = 0;
            available.volume = this.config.sfxVolume;
            available.play().catch(() => {
                // Ignore autoplay errors - user hasn't interacted yet
            });
        } else {
            // All instances busy, reuse the first one
            pool[0].currentTime = 0;
            pool[0].play().catch(() => { });
        }
    }

    // Convenience methods for common sounds
    public playHover() {
        const now = Date.now();
        if (now - this.lastHoverTime < this.hoverCooldown) return;
        this.lastHoverTime = now;
        this.playSfx('hover');
    }

    public playClick() {
        this.playSfx('click');
    }

    public playCountdown() {
        this.playSfx('countdown');
    }

    public playRaceStart() {
        this.playSfx('raceStart');
    }

    public playLapComplete() {
        this.playSfx('lapComplete');
    }

    public playRaceFinish() {
        this.playSfx('raceFinish');
    }

    public playBoost() {
        this.playSfx('boost');
    }

    public playEngineRumble() {
        if (!this.config.sfxEnabled) return;

        if (!this.engineRumbleAudio) {
            this.engineRumbleAudio = new Audio(this.sfxPaths.engineRumble);
            this.engineRumbleAudio.loop = true;
            this.engineRumbleAudio.volume = this.config.sfxVolume * 0.6; // Slightly quieter base volume
        }

        if (this.engineRumbleAudio.paused) {
            this.engineRumbleAudio.play().catch(() => { });
        }
    }

    public stopEngineRumble() {
        if (this.engineRumbleAudio) {
            this.engineRumbleAudio.pause();
            this.engineRumbleAudio.currentTime = 0;
        }
    }

    // Music controls
    public playMusic(track: MusicTrack, loop: boolean = true) {
        if (!this.config.musicEnabled) return;

        // Don't restart if already playing this track
        if (this.currentMusicTrack === track && this.currentMusic && !this.currentMusic.paused) {
            console.log(`[AudioManager] Already playing ${track}. Updating loop to ${loop}.`);
            this.currentMusic.loop = loop;
            return;
        }

        // Stop current music
        this.stopMusic();

        // Get or create the audio element
        let audio = this.musicTracks.get(track);
        if (!audio) {
            audio = new Audio(this.musicPaths[track]);
            audio.loop = loop;
            audio.preload = 'auto';
            this.musicTracks.set(track, audio);
        }

        audio.volume = this.config.musicVolume;
        audio.loop = loop;
        audio.currentTime = 0;

        this.currentMusic = audio;
        this.currentMusicTrack = track;

        // Notify listener
        if (this.onTrackChange) {
            const name = this.getCurrentTrackName();
            if (name) this.onTrackChange(name);
        }

        audio.play().catch(() => {
            // Ignore autoplay errors
        });
    }

    public stopMusic() {
        if (this.currentMusic) {
            this.currentMusic.onended = null; // Clear auto-next listener
            this.currentMusic.pause();
            this.currentMusic.currentTime = 0;
        }
        this.currentMusic = null;
        this.currentMusicTrack = null;
    }

    public pauseMusic() {
        if (this.currentMusic) {
            this.currentMusic.pause();
        }
    }

    public resumeMusic() {
        if (this.currentMusic && this.config.musicEnabled) {
            this.currentMusic.play().catch(() => { });
        }
    }

    // Volume controls
    public setSfxVolume(volume: number) {
        this.config.sfxVolume = Math.max(0, Math.min(1, volume));
        this.saveConfig();

        // Update all cached sounds
        this.sfxCache.forEach(pool => {
            pool.forEach(audio => {
                audio.volume = this.config.sfxVolume;
            });
        });
    }

    public setMusicVolume(volume: number) {
        this.config.musicVolume = Math.max(0, Math.min(1, volume));
        this.saveConfig();

        if (this.currentMusic) {
            this.currentMusic.volume = this.config.musicVolume;
        }
    }

    public toggleSfx(): boolean {
        this.config.sfxEnabled = !this.config.sfxEnabled;
        this.saveConfig();
        return this.config.sfxEnabled;
    }

    public toggleMusic(): boolean {
        this.config.musicEnabled = !this.config.musicEnabled;
        this.saveConfig();

        if (!this.config.musicEnabled) {
            this.pauseMusic();
        } else if (this.currentMusic) {
            this.resumeMusic();
        }

        return this.config.musicEnabled;
    }

    // Getters
    public getSfxVolume(): number {
        return this.config.sfxVolume;
    }

    public getMusicVolume(): number {
        return this.config.musicVolume;
    }

    public isSfxEnabled(): boolean {
        return this.config.sfxEnabled;
    }

    public isMusicEnabled(): boolean {
        return this.config.musicEnabled;
    }

    // Play a random track from the jukebox (for race start)
    // Play a random track from the jukebox (for race start)
    public playRandomRaceMusic() {
        // Pick a random track that is DIFFERENT from the current one (if possible)
        let availableTracks = this.raceTracks;
        if (this.currentMusicTrack && this.raceTracks.length > 1) {
            availableTracks = this.raceTracks.filter(t => t !== this.currentMusicTrack);
        }

        console.log(`[AudioManager] Random Race Music. Current: ${this.currentMusicTrack}. Available: ${JSON.stringify(availableTracks)}`);

        const randomIndex = Math.floor(Math.random() * availableTracks.length);
        const track = availableTracks[randomIndex];
        console.log(`[AudioManager] Selected track index ${randomIndex}: ${track}`);

        // Play without looping, so we can trigger the next track when done
        this.playMusic(track, false);

        // When this track ends, play another random one
        if (this.currentMusic) {
            this.currentMusic.onended = () => {
                this.playRandomRaceMusic();
            };
        }
    }

    public setTrackChangeListener(callback: (name: string) => void) {
        this.onTrackChange = callback;
    }

    // Get current track name for display
    public getCurrentTrackName(): string | null {
        if (!this.currentMusicTrack) return null;
        const names: Record<MusicTrack, string> = {
            neonVelocity: 'Neon Velocity',
            zeroHorizon: 'Zero Horizon',
            orbitalVelocity: 'Orbital Velocity'
        };
        return names[this.currentMusicTrack];
    }

    public getCurrentTime(): number {
        return this.currentMusic ? this.currentMusic.currentTime : 0;
    }

    public getDuration(): number {
        return this.currentMusic ? this.currentMusic.duration : 0;
    }

    public isPlaying(): boolean {
        return this.currentMusic ? !this.currentMusic.paused : false;
    }

    // Preload all sounds (call on app init)
    public preloadAll() {
        // Preload SFX
        Object.keys(this.sfxPaths).forEach(effect => {
            this.preloadSfx(effect as SoundEffect);
        });
    }

    // Preload music in background (call on app init)
    public preloadMusic() {
        Object.entries(this.musicPaths).forEach(([track, path]) => {
            if (!this.musicTracks.has(track as MusicTrack)) {
                const audio = new Audio(path);
                audio.preload = 'auto';
                audio.volume = this.config.musicVolume;
                this.musicTracks.set(track as MusicTrack, audio);
            }
        });
    }
}

// Singleton instance
export const audioManager = new AudioManager();
export type { SoundEffect, MusicTrack };
