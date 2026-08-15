import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

/**
 * Compiles the scene's shaders before the player is handed control.
 *
 * Starting a run used to hitch: the first frame with the craft on screen was
 * also the first time its materials, the bloom pipeline and every instanced
 * mesh were compiled, all inside one frame. Compiling up front moves that cost
 * to while the menu is still up.
 */
const Warmup = () => {
    const gl = useThree(state => state.gl);
    const scene = useThree(state => state.scene);
    const camera = useThree(state => state.camera);

    useEffect(() => {
        const renderer = gl as unknown as {
            compileAsync?: (s: unknown, c: unknown) => Promise<unknown>;
        };
        void renderer.compileAsync?.(scene, camera);
    }, [gl, scene, camera]);

    return null;
};

export default Warmup;
