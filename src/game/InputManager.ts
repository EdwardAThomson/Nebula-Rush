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
        return !!this.keys[key];
    }

    public cleanup() {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
    }
}
