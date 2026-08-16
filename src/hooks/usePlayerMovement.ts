import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import {
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
import * as THREE from 'three';

export interface PlayerRefs {
    physicsRef: React.RefObject<THREE.Object3D>;
    playerGroupRef: React.RefObject<THREE.Group>;
    cameraRef: React.RefObject<THREE.PerspectiveCamera>;
}

export const usePlayerMovement = ({ physicsRef, playerGroupRef, cameraRef }: PlayerRefs) => {
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
    const LATERAL_SPEED = 44;
    /** Longest frame allowed to drive movement, in seconds (~3 frames at 60fps). */
    const MAX_FRAME_DELTA = 1 / 20;

    const xPosition = useRef(new MotionController(0, 0.28));
    /** Where the player is steering to; the craft eases onto it. */
    const laneX = useRef(0);
    // The camera chases the player's lane rather than sitting at a fraction of
    // it. Smoothing here is what gives the turn some weight; a fixed fraction
    // just leaves the player stranded off to one side.
    const cameraX = useRef(new MotionController(0, 0.09));
    const zPosition = useRef(new MotionController(-20, 0.15));
    const rotationZ = useRef(new MotionController(0, 0.2));

    const spacePressed = useRef(false);

    useEffect(() => {
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
    }, [togglePause]);

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

        const lateralStep = LATERAL_SPEED * delta;
        const forwardSpeed = playerSpeed * delta * 60;

        // The craft banks into the track's own bends on top of the lean
        // from steering input; positive slope curves the road toward -x,
        // matching the negative (leftward) roll.
        const bendYaw = Math.atan(
            trackCurveSlope(zPosition.current.getValue()),
        );
        const bank = -bendYaw * 0.8;
        if (left) {
            rotationZ.current.setTarget(-Math.PI / 7 + bank);
            laneX.current = Math.max(laneX.current - lateralStep, leftBound);
        } else if (right) {
            rotationZ.current.setTarget(Math.PI / 7 + bank);
            laneX.current = Math.min(laneX.current + lateralStep, rightBound);
        } else {
            rotationZ.current.setTarget(bank);
        }
        xPosition.current.setTarget(laneX.current);

        // The run ends on the UTS forecourt: far enough back that the final
        // frame holds the whole building — podium, tower, lit sign — with
        // the craft small on the avenue below. Composed to be screenshotted.
        const FINAL_Z = -35360;
        zPosition.current.setTarget(
            Math.max(zPosition.current.getValue() - forwardSpeed, FINAL_Z),
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

        setPlayerPosition([newX, 2, newZ]);
        // console.log('Player Position:', Math.abs(Math.round(newZ)));

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
                Math.max(0, (newZ + 34960) / (FINAL_Z + 34960)),
            );
            cameraRef.current.position.set(
                camX + trackCurve(newZ + 20),
                11 + lift * 20 + trackHeight(newZ + 20),
                newZ + 20,
            );
            // Aim at the road ahead in full 3D: cresting a hill points the
            // view down into the valley, a dip aims it up at the sky road.
            cameraRef.current.lookAt(
                camX + trackCurve(newZ - 55),
                2 + lift * 150 + trackHeight(newZ - 55),
                newZ - 55,
            );
        }
    });
};
