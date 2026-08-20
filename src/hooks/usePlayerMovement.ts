import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import {
    FINISH_Z,
    LATERAL_SPEED,
    leftBound,
    rightBound,
    trackCurve,
    trackCurveSlope,
    trackHeight,
    trackHeightSlope,
} from '../config/constants';
import useKeyboardControls from './useKeyboardControls';
import { useStore } from '../store/store';
import { MotionController } from '../utils/MotionController';
import { craftChoice } from '../utils/bench';
import * as THREE from 'three';

export interface PlayerRefs {
    physicsRef: React.RefObject<THREE.Object3D>;
    playerGroupRef: React.RefObject<THREE.Group>;
    cameraRef: React.RefObject<THREE.PerspectiveCamera>;
}

/**
 * How far the craft rolls into a steering input.
 *
 * An aircraft rolls to turn, so a quarter-turn of bank is the whole gesture.
 * A kart does not: at 26 degrees it reads as two wheels off the ground rather
 * than as a car being thrown into a corner, because the wheels are drawn and
 * the ground is right there. It gets a lean, not a roll.
 */
const STEER_LEAN = craftChoice === 'kart' ? Math.PI / 22 : Math.PI / 7;

export const usePlayerMovement = ({ physicsRef, playerGroupRef, cameraRef }: PlayerRefs) => {
    // The craft is mounted while the menu is still up, parked in the opening
    // pose, so that the shot behind the menu is the shot the run opens on and
    // the craft's shaders are compiled before the player is handed control.
    // Until this flips, the frame below runs but moves nothing.
    const started = useStore(state => state.gameStarted);
    const gameOver = useStore(state => state.gameOver);
    const gamePaused = useStore(state => state.gamePaused);
    const togglePause = useStore(state => state.togglePause);
    const playerSpeed = useStore(state => state.playerSpeed);
    const setPlayerPosition = useStore(state => state.setPlayerPosition);
    const { left, right } = useKeyboardControls();

    /**
     * Sideways travel, in world units per second.
     *
     * Steering used to set the smoothing target to `current - step` and then
     * ease 20% of the way there each frame, so the craft actually moved at a
     * fifth of the configured speed and never quite reached the edge of the
     * track — crossing it took the better part of ten seconds. The target is
     * now a lane position that moves at this speed outright, with the craft
     * easing onto it, so the number means what it says. Tuned down from the
     * first corrected value, which overshot the other way: a brief press threw
     * the craft most of the way across the track.
     */
    /** Longest frame allowed to drive movement, in seconds (~3 frames at 60fps). */
    const MAX_FRAME_DELTA = 1 / 20;

    const xPosition = useRef(new MotionController(0, 0.28));
    /** Where the player is steering to; the craft eases onto it. */
    const laneX = useRef(0);
    // The camera chases the player's lane rather than sitting at a fraction of
    // it. Smoothing here is what gives the turn some weight; a fixed fraction
    // just leaves the player stranded off to one side.
    const cameraX = useRef(new MotionController(0, 0.09));
    // DEV ONLY: ?z=35300 starts the run that far along, for reviewing the
    // late scenes without driving there. Strip with the other dev tools.
    const startZ = -Math.abs(
        Number(new URLSearchParams(location.search).get('z') ?? 0) || 20,
    );
    const zPosition = useRef(new MotionController(startZ, 0.15));
    const rotationZ = useRef(new MotionController(0, 0.2));

    const spacePressed = useRef(false);

    useEffect(() => {
        // Space is pause, and there is nothing to pause on the menu.
        if (!started) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === ' ' && !spacePressed.current) {
                spacePressed.current = true;
                togglePause();
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === ' ') {
                spacePressed.current = false;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [togglePause, started]);

    useFrame((_, rawDelta) => {
        if (gameOver || gamePaused) return;
        if (!physicsRef.current || !playerGroupRef.current) return;

        // A dropped frame must not teleport the player. Movement is
        // delta-scaled, so one long frame — a background tab, a GC pause, a
        // slow first paint — would otherwise advance the run by thousands of
        // units in a single step, straight through whatever was in the way.
        // Cap it at ~3 frames' worth and let the world move slightly slower
        // during a hitch instead.
        const delta = Math.min(rawDelta, MAX_FRAME_DELTA);

        // Parked until the run starts. Zeroing the step rather than returning
        // early is deliberate: everything below still runs, so the craft and
        // the camera are placed in the opening pose on the menu's own frames
        // instead of being placed for the first time on the frame the player
        // is handed control.
        const step = started ? delta : 0;
        const lateralStep = LATERAL_SPEED * step;
        const forwardSpeed = playerSpeed * step * 60;

        // The craft banks into the track's own bends on top of the lean
        // from steering input; positive slope curves the road toward -x,
        // matching the negative (leftward) roll.
        const bendYaw = Math.atan(
            trackCurveSlope(zPosition.current.getValue()),
        );
        const bank = -bendYaw * 0.8;
        if (started && left) {
            rotationZ.current.setTarget(-STEER_LEAN + bank);
            laneX.current = Math.max(laneX.current - lateralStep, leftBound);
        } else if (started && right) {
            rotationZ.current.setTarget(STEER_LEAN + bank);
            laneX.current = Math.min(laneX.current + lateralStep, rightBound);
        } else {
            rotationZ.current.setTarget(bank);
        }
        xPosition.current.setTarget(laneX.current);

        // The run ends on the UTS forecourt: far enough back that the final
        // frame holds the whole building — podium, tower, lit sign — with
        // the craft small on the avenue below. Composed to be screenshotted.
        zPosition.current.setTarget(
            Math.max(zPosition.current.getValue() - forwardSpeed, FINISH_Z),
        );

        const newX = xPosition.current.update();
        const newZ = zPosition.current.update();
        const newRotZ = rotationZ.current.update();

        // Rendered positions ride the winding centreline; the store keeps
        // the straight logical coordinates that collisions and the lane
        // generator reason in.
        const bendX = trackCurve(newZ);
        const bendY = trackHeight(newZ);
        const pitch = -Math.atan(trackHeightSlope(newZ));
        physicsRef.current.position.set(newX + bendX, 2 + bendY, newZ);
        playerGroupRef.current.rotation.z = newRotZ;
        playerGroupRef.current.rotation.y = bendYaw;
        playerGroupRef.current.rotation.x = pitch;
        playerGroupRef.current.position.set(newX + bendX, 1.5 + bendY, newZ);

        // Only once the run is live: the store's default already holds the
        // start position, and writing a fresh array every menu frame would
        // wake every subscriber for a value that has not changed.
        if (started) setPlayerPosition([newX, 2, newZ]);

        if (cameraRef.current) {
            // High and well back, aimed down the trail rather than level with
            // it: at the old eye height of 6 units the grid collapsed into a
            // few horizontal lines and half the frame was empty floor.
            //
            // The camera follows the player's lane, easing into it rather than
            // snapping. It used to sit at a fixed 0.55x of the player's offset
            // — a leftover from when the corridor was ±500 units wide — which
            // after the corridor was narrowed left the player able to steer 25
            // units away from where the camera was pointing, i.e. off to the
            // edge of the screen while the view stayed put.
            cameraX.current.setTarget(newX);
            const camX = cameraX.current.update();
            // Arrival shot: over the last stretch of the forecourt the view
            // tilts up from the road to the building, so the final frame
            // holds the whole complex — podium, tower, lit sign.
            const lift = Math.min(
                1,
                Math.max(0, (newZ + 34960) / (FINISH_Z + 34960)),
            );
            cameraRef.current.position.set(
                camX + trackCurve(newZ + 20),
                11 + lift * 8 + trackHeight(newZ + 20),
                newZ + 20,
            );
            // Aim at the road ahead in full 3D: cresting a hill points the
            // view down into the valley, a dip aims it up at the sky road.
            cameraRef.current.lookAt(
                camX + trackCurve(newZ - 55),
                2 + lift * 30 + trackHeight(newZ - 55),
                newZ - 55,
            );
        }
    });
};
