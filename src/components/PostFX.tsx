import { useEffect, useMemo, useRef, useState } from 'react';
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
    strength = 0.52,
    radius = 0.55,
    threshold = 0.72,
}: PostFXProps) => {
    const gl = useThree(state => state.gl);
    const scene = useThree(state => state.scene);
    const camera = useThree(state => state.camera);

    // Bumping this rebuilds the pipeline. See the watchdog below.
    const [generation, setGeneration] = useState(0);

    const post = useMemo(() => {
        const scenePass = pass(scene, camera);
        const composed = scenePass.add(
            bloom(scenePass, strength, radius, threshold),
        );

        const postProcessing = new PostProcessing(gl as never);
        postProcessing.outputNode = composed;
        return postProcessing;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gl, scene, camera, strength, radius, threshold, generation]);

    useEffect(
        () => () => {
            post.dispose?.();
        },
        [post],
    );

    /**
     * Rendering happens here, so rendering can also stop here.
     *
     * Taking a priority above zero means react-three-fiber no longer calls
     * gl.render: whatever this composes is the only thing that reaches the
     * screen. If it throws, or quietly stops presenting, every other
     * per-frame callback carries on — the simulation keeps running, input is
     * still read, the craft still hits things — while the picture stays on
     * the last frame that made it out. That is the failure this game was
     * showing, and it is invisible: no error, no context loss, a steady
     * frame rate.
     *
     * So: catch throws and fall back to plain rendering, and if the renderer
     * reports no draw calls for a second while frames are still running,
     * rebuild the pipeline rather than sit on a dead one.
     */
    const blind = useRef(0);
    const failed = useRef(false);

    useFrame(() => {
        try {
            post.render();
            failed.current = false;
        } catch (error) {
            if (!failed.current) {
                failed.current = true;
                console.error('[postfx] render threw; falling back', error);
            }
            gl.render(scene, camera);
            return;
        }

        const info = (gl as unknown as { info?: { render?: { drawCalls?: number } } })
            .info;
        const drawn = info?.render?.drawCalls ?? 1;
        blind.current = drawn > 0 ? 0 : blind.current + 1;
        if (blind.current === 60) {
            console.error(
                '[postfx] 60 frames with nothing drawn — rebuilding the pipeline',
            );
            setGeneration(g => g + 1);
        }
    }, 1);

    return null;
};

export default PostFX;
