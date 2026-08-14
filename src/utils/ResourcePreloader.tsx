import { useGLTF } from '@react-three/drei';
import { MODEL_PATHS } from '../config/constants';

// Warm the cache at module load, so the menu's progress bar has something to
// report before the scene mounts.
for (const model of MODEL_PATHS) {
    useGLTF.preload(model);
}

/**
 * Drives drei's loading manager so the menu can show real progress. With the
 * scene now built from generated geometry, the player model is the only thing
 * left to wait for.
 */
export const ResourcePreloader = () => {
    MODEL_PATHS.forEach(path => useGLTF(path));
    return null;
};
