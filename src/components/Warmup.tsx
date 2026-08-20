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
        // Wait two frames before compiling. This effect runs inside the same
        // commit that mounts the rest of the scene, and a child added later in
        // that commit is not in the graph yet — compiling here would walk a
        // half-built scene and miss exactly the materials that cost the most
        // to compile on the first frame that draws them.
        let frame = requestAnimationFrame(() => {
            frame = requestAnimationFrame(() => {
                void renderer.compileAsync?.(scene, camera);
            });
        });
        return () => cancelAnimationFrame(frame);
    }, [gl, scene, camera]);

    return null;
};

export default Warmup;
