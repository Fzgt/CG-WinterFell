import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PostProcessing } from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

/**
 * Bloom, which is what makes a neon world read as neon: emissive materials
 * alone look flat, the glow around them is the effect.
 *
 * This runs through three's node pipeline rather than the usual
 * `postprocessing` package, because that one is WebGL-only and this game
 * renders through WebGPURenderer. The node version runs on the WebGPU backend
 * and on WebGPURenderer's WebGL2 fallback alike, so both paths get the same
 * image instead of the fallback quietly losing the effect.
 *
 * Taking a render priority above zero hands rendering to this component:
 * react-three-fiber stops calling gl.render itself, and the composed pass is
 * what reaches the screen.
 */
interface PostFXProps {
    /** Higher pushes more of the mid-tones into the glow. */
    strength?: number;
    radius?: number;
    /** Only pixels brighter than this bloom, keeping the darks clean. */
    threshold?: number;
}

const PostFX = ({
    strength = 0.6,
    radius = 0.55,
    threshold = 0.55,
}: PostFXProps) => {
    const gl = useThree(state => state.gl);
    const scene = useThree(state => state.scene);
    const camera = useThree(state => state.camera);

    const post = useMemo(() => {
        const scenePass = pass(scene, camera);
        const composed = scenePass.add(
            bloom(scenePass, strength, radius, threshold),
        );

        const postProcessing = new PostProcessing(gl as never);
        postProcessing.outputNode = composed;
        return postProcessing;
    }, [gl, scene, camera, strength, radius, threshold]);

    useEffect(
        () => () => {
            post.dispose?.();
        },
        [post],
    );

    useFrame(() => {
        post.render();
    }, 1);

    return null;
};

export default PostFX;
