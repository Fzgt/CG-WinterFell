import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { leftBound, rightBound } from '../config/constants';
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

        if (left) {
            rotationZ.current.setTarget(-Math.PI / 7);
            laneX.current = Math.max(laneX.current - lateralStep, leftBound);
        } else if (right) {
            rotationZ.current.setTarget(Math.PI / 7);
            laneX.current = Math.min(laneX.current + lateralStep, rightBound);
        } else {
            rotationZ.current.setTarget(0);
        }
        xPosition.current.setTarget(laneX.current);

        zPosition.current.setTarget(zPosition.current.getValue() - forwardSpeed);

        const newX = xPosition.current.update();
        const newZ = zPosition.current.update();
        const newRotZ = rotationZ.current.update();

        physicsRef.current.position.set(newX, 2, newZ);
        playerGroupRef.current.rotation.z = newRotZ;
        playerGroupRef.current.position.set(newX, 1.5, newZ);

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
            cameraRef.current.position.set(camX, 11, newZ + 20);
            cameraRef.current.lookAt(camX, 2, newZ - 55);
        }
    });
};
