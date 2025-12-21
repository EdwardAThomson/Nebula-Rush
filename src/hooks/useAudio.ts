// useAudio - React hook for audio interactions
// Provides event handlers for hover/click sounds on UI elements

import { useCallback } from 'react';
import { audioManager } from '../game/AudioManager';

export const useAudio = () => {
    const onHover = useCallback(() => {
        audioManager.playHover();
    }, []);

    const onClick = useCallback(() => {
        audioManager.playClick();
    }, []);

    // Combined props to spread onto interactive elements
    const interactiveProps = {
        onMouseEnter: onHover,
        onClick: onClick
    };

    return {
        onHover,
        onClick,
        interactiveProps,
        audioManager
    };
};

// Higher-order component style props generator
export const getInteractiveAudioProps = () => ({
    onMouseEnter: () => audioManager.playHover(),
    onClick: () => audioManager.playClick()
});
