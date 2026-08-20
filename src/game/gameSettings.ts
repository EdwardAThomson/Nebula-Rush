// Non-audio gameplay preferences, persisted in localStorage.

const ENV_PICKER_KEY = 'nebula-rush-env-picker';

// When enabled, single races show the full environment (time/weather) screen
// after track select. Off by default: the race rolls a random environment, and
// tracks with a pinned theme (space cups, storms) aren't asked about at all.
export function isEnvPickerEnabled(): boolean {
    try { return localStorage.getItem(ENV_PICKER_KEY) === '1'; } catch { return false; }
}

export function setEnvPickerEnabled(on: boolean): void {
    try { localStorage.setItem(ENV_PICKER_KEY, on ? '1' : '0'); } catch { /* preference just won't persist */ }
}
