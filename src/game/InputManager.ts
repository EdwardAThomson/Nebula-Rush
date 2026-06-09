export interface InputSource {
    isKeyPressed(key: string): boolean;
}

export class InputManager implements InputSource {
    private keys: { [key: string]: boolean } = {};

    constructor() {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        this.keys[e.key] = true;
    };

    private handleKeyUp = (e: KeyboardEvent) => {
        this.keys[e.key] = false;
    };

    public isKeyPressed(key: string): boolean {
        // Case-insensitive for single-letter keys so Caps Lock (or a held Shift)
        // doesn't break movement: callers ask for lower-case letters ('w','a',…)
        // and exact named keys ('ArrowUp', ' '). Letters match either stored case.
        if (this.keys[key]) return true;
        return key.length === 1
            ? !!this.keys[key.toLowerCase()] || !!this.keys[key.toUpperCase()]
            : false;
    }

    public cleanup() {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
    }
}
