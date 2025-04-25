import { useState, useEffect } from 'react';

interface KeyboardControlsState {
    left: boolean;
    right: boolean;
}

const useKeyboardControls = (): KeyboardControlsState => {
    const [left, setLeft] = useState(false);
    const [right, setRight] = useState(false);

    useEffect(() => {
        const eventHandler = ({ key }: KeyboardEvent, isDown: boolean) => {
            (key === 'a' || key === 'ArrowLeft') && setLeft(isDown);
            (key === 'd' || key === 'ArrowRight') && setRight(isDown);
        };

        const upEvent = (e: KeyboardEvent) => eventHandler(e, false);
        const downEvent = (e: KeyboardEvent) => eventHandler(e, true);

        window.addEventListener('keydown', downEvent);
        window.addEventListener('keyup', upEvent);

        return () => {
            window.removeEventListener('keyup', upEvent);
            window.removeEventListener('keydown', downEvent);
        };
    }, []);

    return { left, right };
};

export default useKeyboardControls;
