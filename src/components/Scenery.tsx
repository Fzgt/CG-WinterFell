import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { planeSize, trackCurve, trackHeight } from '../config/constants';
import { FIELD_WIDTH } from '../config/obstacles';
import { useStore } from '../store/store';
import { sceneAt, type SceneSpec } from '../config/scenes';

/**
 * The world beside the track: twenty scenes, cycling every sector.
 *
 * Tiles are keyed by their world lattice index; when the run crosses a tile
 * boundary React drops the kilometre behind and builds the next one ahead in
 * whatever scene that stretch belongs to. Every piece is baked in world
 * coordinates on the same winding, rolling centreline as the track — scenery
 * never moves, the player moves past it. Static pieces merge into a handful
 * of draw calls; the things that live (fish, turtles, turbine rotors,
 * lighthouse beams) are small instanced meshes animated per frame.
 *
 * The contract with the track: nothing enters |x| < INNER at track height.
 * Overhead structures (tunnel ribs, giant arches) clear the tallest obstacle
 * by a wide margin.
 */

const INNER = FIELD_WIDTH / 2 + 34;

/* --------------------------------------------------------------- helpers -- */

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** Ground level for scenery near world z, just off the track's shoulder. */
const shoulder = (z: number) => trackHeight(z) - 4;

const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => {
    g.translate(x + trackCurve(z), y, z);
    return g;
};

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/* ------------------------------------------------------- window texture -- */

const WINDOW_TILE_U = 48;
const WINDOW_TILE_V = 80;

const buildWindowTexture = () => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#04050c';
    ctx.fillRect(0, 0, size, size);
    const cols = 6;
    const rows = 10;
    for (let row = 0; row < rows; row++) {
        const floorActivity = Math.random() < 0.22 ? 0.55 : 0.06;
        for (let col = 0; col < cols; col++) {
            if (Math.random() > floorActivity) continue;
            const cool = Math.random() > 0.85;
            ctx.fillStyle = cool
                ? `rgba(150, 200, 255, ${0.35 + Math.random() * 0.35})`
                : `rgba(255, 214, 165, ${0.4 + Math.random() * 0.45})`;
            ctx.fillRect(
                (col + 0.24) * (size / cols),
                (row + 0.28) * (size / rows),
                (size / cols) * 0.52,
                (size / rows) * 0.44,
            );
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    return texture;
};

/** Shared textures live for the app; materials are per tile (cheap). */
let windowTexture: THREE.CanvasTexture | null = null;
const getWindowTexture = () =>
    (windowTexture ??= buildWindowTexture());

const scaleBoxUVs = (
    geometry: THREE.BoxGeometry,
    w: number,
    h: number,
    d: number,
) => {
    const uv = geometry.attributes.uv as THREE.BufferAttribute;
    const faceDims: [number, number][] = [
        [d, h], [d, h], [w, d], [w, d], [w, h], [w, h],
    ];
    faceDims.forEach(([du, dv], face) => {
        for (let i = face * 4; i < face * 4 + 4; i++) {
            uv.setXY(
                i,
                uv.getX(i) * (du / WINDOW_TILE_U),
                uv.getY(i) * (dv / WINDOW_TILE_V),
            );
        }
    });
};

/* ------------------------------------------------------- dynamic actors -- */

export interface Swimmer {
    x: number;
    y: number;
    z: number;
    amp: number;
    speed: number;
    phase: number;
    scale: number;
}

interface Rotor {
    x: number;
    y: number;
    z: number;
    speed: number;
    phase: number;
}

interface Beam {
    x: number;
    y: number;
    z: number;
    speed: number;
    phase: number;
}

/* ---------------------------------------------------------- tile output -- */

interface Piece {
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
}

interface TileBuild {
    pieces: Piece[];
    fish: Swimmer[];
    turtles: Swimmer[];
    rotors: Rotor[];
    beams: Beam[];
    beamColor: string;
}

const basic = (color: string, opts: Partial<THREE.MeshBasicMaterialParameters> = {}) =>
    new THREE.MeshBasicMaterial({ color, toneMapped: false, ...opts });

const dark = (color = '#12142a') =>
    new THREE.MeshStandardMaterial({
        color,
        roughness: 0.95,
        metalness: 0.05,
        flatShading: true,
    });

const emptyBuild = (): TileBuild => ({
    pieces: [],
    fish: [],
    turtles: [],
    rotors: [],
    beams: [],
    beamColor: '#ffffff',
});

/** Merge a part list into a piece, skipping empties. */
const emit = (
    build: TileBuild,
    parts: THREE.BufferGeometry[],
    material: THREE.Material,
) => {
    if (parts.length) {
        build.pieces.push({ geometry: mergeGeometries(parts), material });
    }
};

/* ---------------------------------------------------------------- scenes -- */

type Builder = (z0: number, z1: number, spec: SceneSpec) => TileBuild;

const city: Builder = (z0, z1) => {
    const build = emptyBuild();
    const parts: THREE.BufferGeometry[] = [];
    const beaconParts: THREE.BufferGeometry[] = [];
    const span = z0 - z1;

    const tower = (x: number, z: number, w: number, h: number, d: number) => {
        const g = box(w, h, d);
        scaleBoxUVs(g, w, h, d);
        parts.push(at(g, x, h / 2 + shoulder(z), z));
    };
    for (const side of [-1, 1]) {
        for (let i = 0; i < 18; i++) {
            const x = side * (INNER + rand(0, 130));
            const z = z0 - (i / 18) * span - rand(0, 30);
            const w = rand(16, 38);
            const d = rand(16, 38);
            const h = rand(45, 155);
            tower(x, z, w, h, d);
            const roll = Math.random();
            if (roll < 0.4) tower(x, z, w * 0.55, h * 1.22, d * 0.55);
            else if (roll < 0.7) tower(x, z, 1.2, h * 1.4, 1.2);
            if (h > 110) {
                beaconParts.push(
                    at(box(2.4, 2.4, 2.4), x, h * 1.02 + shoulder(z), z),
                );
            }
        }
        for (let i = 0; i < 10; i++) {
            const x = side * (INNER + rand(170, 340));
            const z = z0 - (i / 10) * span - rand(0, 60);
            tower(x, z, rand(30, 70), rand(120, 300), rand(30, 70));
        }
    }
    emit(build, parts, new THREE.MeshBasicMaterial({ map: getWindowTexture() }));
    emit(build, beaconParts, basic('#ff3b4d'));
    return build;
};

const ocean: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const sea: THREE.BufferGeometry[] = [];
    const moon: THREE.BufferGeometry[] = [];
    const white: THREE.BufferGeometry[] = [];
    const stripe: THREE.BufferGeometry[] = [];
    const lamp: THREE.BufferGeometry[] = [];
    const hull: THREE.BufferGeometry[] = [];
    const port: THREE.BufferGeometry[] = [];

    // The sea itself: terraced strips a little below the causeway.
    for (let z = z0; z > z1; z -= 100) {
        const zc = z - 50;
        const level = trackHeight(zc) - 16;
        for (const side of [-1, 1]) {
            sea.push(at(box(560, 1, 102), side * (INNER + 280), level, zc));
        }
        moon.push(
            at(
                box(rand(20, 34), 1.2, rand(60, 95)),
                INNER + rand(170, 230),
                level + 0.4,
                zc,
            ),
        );
    }

    // Lighthouses: striped towers on rock islets, lamp room ablaze, with a
    // rotating beam added as a dynamic actor.
    const houses = spec.variant === 'moon' ? 1 : 3;
    for (let i = 0; i < houses; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const z = z0 - ((i + 0.5) / houses) * (z0 - z1);
        const x = side * (INNER + rand(90, 200));
        const base = trackHeight(z) - 14;
        const h = rand(55, 85);
        white.push(at(new THREE.ConeGeometry(16, 22, 6), x, base + 6, z)); // islet
        for (let seg = 0; seg < 5; seg++) {
            const target = seg % 2 === 0 ? white : stripe;
            target.push(
                at(
                    new THREE.CylinderGeometry(
                        5.4 - seg * 0.55,
                        5.8 - seg * 0.55,
                        h / 5,
                        8,
                    ),
                    x,
                    base + 14 + (seg + 0.5) * (h / 5),
                    z,
                ),
            );
        }
        lamp.push(at(box(6.5, 5, 6.5), x, base + 14 + h + 2.5, z));
        build.beams.push({
            x: x + trackCurve(z),
            y: base + 14 + h + 2.5,
            z,
            speed: 0.9,
            phase: i * 2.1,
        });
    }

    // A giant ship on the horizon side; under the moon variant, a colossus.
    const ships = spec.variant === 'moon' ? 2 : 1;
    for (let i = 0; i < ships; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const z = z0 - rand(200, 800);
        const x = side * (INNER + rand(260, 420));
        const level = trackHeight(z) - 16;
        const L = rand(160, 260);
        const H = rand(18, 26);
        hull.push(at(box(L, H, 34), x, level + H / 2 - 2, z));
        hull.push(at(box(L * 0.16, H * 1.9, 30), x - L * 0.3, level + H * 1.4, z));
        hull.push(at(box(3, H * 3.2, 3), x + L * 0.25, level + H * 2, z));
        for (let pz = -L * 0.45; pz < L * 0.45; pz += 9) {
            port.push(at(box(2.2, 2.2, 2.2), x + pz, level + H * 0.7, z + 18));
        }
    }

    if (spec.variant === 'moon') {
        // A vast low moon over the water.
        const z = z0 - 500;
        moon.push(
            at(
                new THREE.CylinderGeometry(60, 60, 2, 24).rotateX(Math.PI / 2),
                INNER + 480,
                trackHeight(z) + 90,
                z,
            ),
        );
    }

    emit(build, sea, basic('#071d34'));
    emit(build, moon, basic(spec.a, { transparent: true, opacity: 0.4 }));
    emit(build, white, basic('#dfe7ff'));
    emit(build, stripe, basic(spec.b));
    emit(build, lamp, basic('#fff6c9'));
    emit(build, hull, dark('#0d1020'));
    emit(build, port, basic('#ffd9a0'));
    build.beamColor = '#fff6c9';
    return build;
};

const tunnel: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const ribs: THREE.BufferGeometry[] = [];
    const glowRibs: THREE.BufferGeometry[] = [];
    const plankton: THREE.BufferGeometry[] = [];

    // The undersea tube: an arch every 50 units riding the centreline, every
    // third one glowing. Radius clears the track and every obstacle height.
    let n = 0;
    for (let z = z0; z > z1; z -= 50, n++) {
        const arch = new THREE.TorusGeometry(74, 2.4, 6, 28, Math.PI);
        arch.translate(trackCurve(z), trackHeight(z) + 4, z);
        (n % 3 === 0 ? glowRibs : ribs).push(arch);
        // Longitudinal stringers at the arch's feet and crown.
        for (const [dx, dy] of [
            [-74, 4],
            [74, 4],
            [0, 78],
        ] as const) {
            ribs.push(at(box(1.6, 1.6, 50), dx, trackHeight(z - 25) + dy, z - 25));
        }
    }
    // Drifting plankton motes glowing in the dark water.
    for (let i = 0; i < 70; i++) {
        const z = rand(z1, z0);
        plankton.push(
            at(
                box(0.9, 0.9, 0.9),
                rand(-1, 1) * rand(20, 190),
                trackHeight(z) + rand(6, 70),
                z,
            ),
        );
    }
    // The fauna: schools outside the glass, turtles cruising by.
    for (let i = 0; i < 90; i++) {
        const z = rand(z1, z0);
        const side = Math.random() < 0.5 ? -1 : 1;
        build.fish.push({
            x: side * rand(INNER + 55, INNER + 220) + trackCurve(z),
            y: trackHeight(z) + rand(4, 60),
            z,
            amp: rand(6, 16),
            speed: rand(0.6, 1.6),
            phase: rand(0, Math.PI * 2),
            scale: rand(0.7, 1.4),
        });
    }
    for (let i = 0; i < 5; i++) {
        const z = rand(z1, z0);
        const side = Math.random() < 0.5 ? -1 : 1;
        build.turtles.push({
            x: side * rand(INNER + 70, INNER + 200) + trackCurve(z),
            y: trackHeight(z) + rand(12, 45),
            z,
            amp: rand(10, 20),
            speed: rand(0.15, 0.3),
            phase: rand(0, Math.PI * 2),
            scale: rand(2.4, 4),
        });
    }

    emit(build, ribs, dark('#0e1626'));
    emit(build, glowRibs, basic(spec.a, { transparent: true, opacity: 0.85 }));
    emit(build, plankton, basic(spec.b, { transparent: true, opacity: 0.7 }));
    return build;
};

const harbor: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const hull: THREE.BufferGeometry[] = [];
    const port: THREE.BufferGeometry[] = [];
    const crane: THREE.BufferGeometry[] = [];
    const sea: THREE.BufferGeometry[] = [];

    for (let z = z0; z > z1; z -= 100) {
        const zc = z - 50;
        const level = trackHeight(zc) - 16;
        for (const side of [-1, 1]) {
            sea.push(at(box(560, 1, 102), side * (INNER + 280), level, zc));
        }
    }
    // Docked giants, bows toward the track.
    for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
            const z = z0 - (i / 3) * (z0 - z1) - rand(40, 120);
            const x = side * (INNER + rand(120, 320));
            const level = trackHeight(z) - 16;
            const L = rand(180, 300);
            const H = rand(22, 34);
            hull.push(at(box(38, H, L), x, level + H / 2 - 2, z - L / 2));
            hull.push(at(box(34, H * 2.2, L * 0.14), x, level + H * 1.6, z - L * 0.82));
            for (let pz = 0.1; pz < 0.9; pz += 0.07) {
                port.push(at(box(2.4, 2.4, 2.4), x - side * 20, level + H * 0.75, z - L * pz));
            }
            // Gantry cranes leaning over each berth.
            const cx = x - side * 52;
            crane.push(at(box(4, 70, 4), cx, level + 35, z - L * 0.3));
            crane.push(at(box(4, 70, 4), cx, level + 35, z - L * 0.6));
            crane.push(at(box(4, 4, L * 0.5), cx, level + 72, z - L * 0.45));
            crane.push(at(box(side * -46, 3, 3).translate(side * -23, 0, 0), cx, level + 68, z - L * 0.45));
        }
    }
    emit(build, sea, basic('#071d34'));
    emit(build, hull, dark('#101322'));
    emit(build, port, basic(spec.a));
    emit(build, crane, dark('#1a1f38'));
    return build;
};

const mountains: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const rock: THREE.BufferGeometry[] = [];
    const cap: THREE.BufferGeometry[] = [];
    const span = z0 - z1;
    const icy = spec.variant === 'ice';

    for (const side of [-1, 1]) {
        for (const [count, near, far, hLo, hHi] of [
            [9, INNER + 30, INNER + 190, 40, 120],
            [7, INNER + 220, INNER + 430, 150, 320],
        ] as const) {
            for (let i = 0; i < count; i++) {
                const z = z0 - (i / count) * span - rand(0, 80);
                const x = side * rand(near, far);
                const h = rand(hLo, hHi);
                const r = h * rand(0.5, 0.9);
                const base = shoulder(z) - 6;
                const peak = new THREE.ConeGeometry(r, h, 5, 1);
                peak.rotateY(rand(0, Math.PI));
                rock.push(at(peak, x, base + h / 2, z));
                if (h > 120 || icy) {
                    const capH = h * (icy ? 0.5 : 0.22);
                    const c = new THREE.ConeGeometry(r * (icy ? 0.5 : 0.24), capH, 5, 1);
                    c.rotateY(rand(0, Math.PI));
                    cap.push(at(c, x, base + h - capH / 2 + 0.5, z));
                }
            }
        }
    }
    emit(build, rock, dark(icy ? '#1a2a44' : '#171a30'));
    emit(build, cap, basic(spec.b));
    return build;
};

const crystal: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const rock: THREE.BufferGeometry[] = [];
    const glow: THREE.BufferGeometry[] = [];
    const span = z0 - z1;
    for (const side of [-1, 1]) {
        for (let i = 0; i < 26; i++) {
            const z = z0 - Math.random() * span;
            const x = side * (INNER + rand(0, 420));
            const h = rand(2, 8);
            const b = box(rand(3, 12), h, rand(3, 12));
            b.rotateY(rand(0, Math.PI));
            rock.push(at(b, x, shoulder(z) + h / 2 - 2, z));
        }
        for (let i = 0; i < 7; i++) {
            const z = z0 - Math.random() * span;
            const x = side * (INNER + rand(60, 320));
            const h = rand(18, 60);
            const c = box(rand(2, 3.4), h, rand(2, 3.4));
            c.rotateY(rand(0, 0.8));
            glow.push(at(c, x, shoulder(z) + h / 2 - 2, z));
        }
    }
    emit(build, rock, dark());
    emit(build, glow, basic(spec.a));
    return build;
};

const colossi: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const body: THREE.BufferGeometry[] = [];
    const torch: THREE.BufferGeometry[] = [];
    const span = z0 - z1;

    // Two or three vast figures per kilometre, torches raised over the road.
    const count = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < count; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const z = z0 - ((i + 0.5) / count) * span;
        const x = side * (INNER + rand(60, 160));
        const base = shoulder(z) - 6;
        const H = rand(170, 260); // to the shoulders
        const wBody = H * 0.22;
        // Robe, chest, head.
        body.push(at(new THREE.CylinderGeometry(wBody * 0.5, wBody * 0.9, H * 0.62, 7), x, base + H * 0.31, z));
        body.push(at(box(wBody, H * 0.3, wBody * 0.7), x, base + H * 0.77, z));
        body.push(at(box(wBody * 0.42, H * 0.14, wBody * 0.42), x, base + H * 0.99, z));
        // Crown spikes.
        for (let sp = -2; sp <= 2; sp++) {
            body.push(at(box(1.6, H * 0.08, 1.6), x + sp * wBody * 0.1, base + H * 1.09, z));
        }
        // The raised arm, angled toward the track, and the torch it holds.
        const armX = x - side * wBody * 0.9;
        body.push(at(box(wBody * 0.24, H * 0.42, wBody * 0.24), armX, base + H * 0.95, z));
        torch.push(at(box(wBody * 0.3, H * 0.07, wBody * 0.3), armX, base + H * 1.19, z));
    }
    emit(build, body, dark('#141a2c'));
    emit(build, torch, basic(spec.b));
    return build;
};

const lattice: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const steel: THREE.BufferGeometry[] = [];
    const beacon: THREE.BufferGeometry[] = [];
    const span = z0 - z1;

    // Eiffel-like pylons: four splayed legs, tapering stacked stages, a
    // beacon at the tip. Tall enough to own the skyline.
    for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
            const z = z0 - ((i + 0.5) / 3) * span + rand(-60, 60);
            const x = side * (INNER + rand(70, 240));
            const base = shoulder(z) - 4;
            const H = rand(160, 280);
            for (const [lx, lz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
                const leg = box(5, H * 0.5, 5);
                leg.rotateZ(lx * 0.16);
                leg.rotateX(lz * -0.16);
                steel.push(at(leg, x + lx * H * 0.09, base + H * 0.24, z + lz * H * 0.09));
            }
            steel.push(at(box(H * 0.17, 6, H * 0.17), x, base + H * 0.48, z));
            steel.push(at(box(H * 0.1, H * 0.34, H * 0.1), x, base + H * 0.66, z));
            steel.push(at(box(H * 0.045, H * 0.24, H * 0.045), x, base + H * 0.92, z));
            beacon.push(at(box(3, 3, 3), x, base + H * 1.06, z));
        }
    }
    emit(build, steel, dark('#1b1428'));
    emit(build, beacon, basic(spec.b));
    return build;
};

const volcano: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const rock: THREE.BufferGeometry[] = [];
    const lava: THREE.BufferGeometry[] = [];
    const span = z0 - z1;
    for (const side of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
            const z = z0 - (i / 5) * span - rand(0, 90);
            const x = side * (INNER + rand(80, 380));
            const h = rand(90, 230);
            const r = h * rand(0.7, 1.0);
            const base = shoulder(z) - 8;
            const cone = new THREE.ConeGeometry(r, h, 6, 1);
            cone.rotateY(rand(0, Math.PI));
            rock.push(at(cone, x, base + h / 2, z));
            // The caldera glow and a rising ember column.
            lava.push(at(new THREE.CylinderGeometry(r * 0.16, r * 0.22, 4, 6), x, base + h - 1, z));
            lava.push(at(box(2.2, rand(20, 45), 2.2), x + rand(-4, 4), base + h + 14, z));
        }
    }
    emit(build, rock, dark('#190f14'));
    emit(build, lava, basic(spec.a));
    return build;
};

const forest: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const trunk: THREE.BufferGeometry[] = [];
    const canopy: THREE.BufferGeometry[] = [];
    const span = z0 - z1;
    for (const side of [-1, 1]) {
        for (let i = 0; i < 24; i++) {
            const z = z0 - Math.random() * span;
            const x = side * (INNER + rand(10, 330));
            const h = rand(30, 90);
            const base = shoulder(z) - 3;
            trunk.push(at(new THREE.CylinderGeometry(1.6, 2.4, h, 5), x, base + h / 2, z));
            const c = new THREE.ConeGeometry(rand(7, 14), h * 0.5, 6);
            canopy.push(at(c, x, base + h + h * 0.12, z));
        }
    }
    emit(build, trunk, dark('#101425'));
    emit(build, canopy, basic(spec.a, { transparent: true, opacity: 0.8 }));
    return build;
};

const ruins: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const stone: THREE.BufferGeometry[] = [];
    const glow: THREE.BufferGeometry[] = [];
    const span = z0 - z1;
    for (const side of [-1, 1]) {
        // Colonnades, most columns snapped short, a few architraves holding.
        for (let i = 0; i < 12; i++) {
            const z = z0 - (i / 12) * span - rand(0, 30);
            const x = side * (INNER + rand(30, 200));
            const whole = Math.random() < 0.4;
            const h = whole ? rand(45, 65) : rand(8, 30);
            const base = shoulder(z) - 3;
            stone.push(at(new THREE.CylinderGeometry(4, 4.6, h, 7), x, base + h / 2, z));
            if (whole && Math.random() < 0.6) {
                stone.push(at(box(26, 5, 8), x, base + h + 2.5, z));
            }
        }
        // A half-buried colossal head, eyes still lit.
        if (Math.random() < 0.7) {
            const z = z0 - rand(200, 800);
            const x = side * (INNER + rand(120, 300));
            const base = shoulder(z) - 10;
            const head = box(34, 30, 30);
            head.rotateZ(side * rand(0.2, 0.5));
            stone.push(at(head, x, base + 10, z));
            glow.push(at(box(3, 2, 2), x - 7, base + 16, z + 14));
            glow.push(at(box(3, 2, 2), x + 7, base + 16, z + 14));
        }
    }
    emit(build, stone, dark('#232338'));
    emit(build, glow, basic(spec.b));
    return build;
};

const windfarm: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const mast: THREE.BufferGeometry[] = [];
    const span = z0 - z1;
    for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
            const z = z0 - ((i + 0.5) / 4) * span + rand(-40, 40);
            const x = side * (INNER + rand(60, 320));
            const base = shoulder(z) - 4;
            const H = rand(70, 130);
            mast.push(at(new THREE.CylinderGeometry(2, 3.4, H, 6), x, base + H / 2, z));
            build.rotors.push({
                x: x + trackCurve(z),
                y: base + H,
                z,
                speed: rand(0.5, 1.1) * (Math.random() < 0.5 ? -1 : 1),
                phase: rand(0, Math.PI * 2),
            });
        }
    }
    emit(build, mast, dark('#1e2438'));
    build.beamColor = spec.a;
    return build;
};

const pyramids: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const stone: THREE.BufferGeometry[] = [];
    const capstone: THREE.BufferGeometry[] = [];
    const span = z0 - z1;
    for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
            const z = z0 - ((i + 0.5) / 3) * span + rand(-80, 80);
            const x = side * (INNER + rand(100, 380));
            const h = rand(90, 200);
            const base = shoulder(z) - 8;
            const p = new THREE.ConeGeometry(h * 0.9, h, 4, 1);
            p.rotateY(Math.PI / 4);
            stone.push(at(p, x, base + h / 2, z));
            const c = new THREE.ConeGeometry(h * 0.14, h * 0.16, 4, 1);
            c.rotateY(Math.PI / 4);
            capstone.push(at(c, x, base + h - h * 0.08, z));
        }
        for (let i = 0; i < 4; i++) {
            const z = z0 - Math.random() * span;
            const x = side * (INNER + rand(20, 160));
            const h = rand(24, 50);
            stone.push(at(box(4, h, 4), x, shoulder(z) + h / 2 - 3, z));
        }
    }
    emit(build, stone, dark('#241d12'));
    emit(build, capstone, basic(spec.a));
    return build;
};

const arches: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const stone: THREE.BufferGeometry[] = [];
    const glow: THREE.BufferGeometry[] = [];
    const span = z0 - z1;

    // Gates of giants: colossal portals spanning the whole track, crossbars
    // far above the tallest obstacle. The run threads through them.
    for (let i = 0; i < 4; i++) {
        const z = z0 - ((i + 0.5) / 4) * span;
        const base = trackHeight(z);
        const W = rand(150, 210);
        const H = rand(120, 180);
        for (const side of [-1, 1]) {
            stone.push(at(box(18, H, 14), side * W * 0.5, base + H / 2 - 4, z));
        }
        stone.push(at(box(W + 30, 16, 18), 0, base + H + 4, z));
        glow.push(at(box(W + 10, 2.4, 2.4), 0, base + H - 5, z));
    }
    emit(build, stone, dark('#191430'));
    emit(build, glow, basic(spec.a));
    return build;
};

const ribcage: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const bone: THREE.BufferGeometry[] = [];
    const glow: THREE.BufferGeometry[] = [];
    const span = z0 - z1;

    // Leviathan skeletons: rows of vast ribs arcing over each shoulder.
    for (const side of [-1, 1]) {
        for (let i = 0; i < 2; i++) {
            const zc = z0 - ((i + 0.5) / 2) * span + rand(-60, 60);
            const cx = side * (INNER + rand(120, 260));
            const ribs = 7;
            for (let r = 0; r < ribs; r++) {
                const z = zc - (r - ribs / 2) * 26;
                const R = 60 - Math.abs(r - ribs / 2) * 9;
                const arc = new THREE.TorusGeometry(R, 2.6, 5, 18, Math.PI * 0.85);
                arc.rotateZ(side > 0 ? 0.35 : Math.PI - 0.35 - Math.PI * 0.85);
                arc.translate(cx + trackCurve(z), shoulder(z) - 4, z);
                bone.push(arc);
            }
            // The skull, one dim eye still burning.
            const z = zc - ribs * 14 - 20;
            bone.push(at(box(26, 18, 30), cx, shoulder(z) + 6, z));
            glow.push(at(box(2.5, 2.5, 2.5), cx - side * 8, shoulder(z) + 10, z + 16));
        }
    }
    emit(build, bone, dark('#3a3d4d'));
    emit(build, glow, basic(spec.b));
    return build;
};

const floating: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const rock: THREE.BufferGeometry[] = [];
    const under: THREE.BufferGeometry[] = [];
    const span = z0 - z1;
    for (const side of [-1, 1]) {
        for (let i = 0; i < 7; i++) {
            const z = z0 - Math.random() * span;
            const x = side * (INNER + rand(30, 320));
            const y = trackHeight(z) + rand(60, 160);
            const w = rand(18, 55);
            const d = rand(18, 55);
            rock.push(at(box(w, rand(8, 18), d), x, y, z));
            const spike = new THREE.ConeGeometry(w * 0.3, rand(14, 30), 5);
            spike.rotateX(Math.PI);
            rock.push(at(spike, x, y - rand(12, 22), z));
            under.push(at(box(w * 0.8, 1.6, d * 0.8), x, y - 6, z));
        }
    }
    emit(build, rock, dark('#182036'));
    emit(build, under, basic(spec.a, { transparent: true, opacity: 0.75 }));
    return build;
};

const falls: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const cliff: THREE.BufferGeometry[] = [];
    const water: THREE.BufferGeometry[] = [];
    const mist: THREE.BufferGeometry[] = [];
    const span = z0 - z1;
    for (const side of [-1, 1]) {
        for (let i = 0; i < 6; i++) {
            const z = z0 - (i / 6) * span - rand(0, 60);
            const x = side * (INNER + rand(60, 220));
            const H = rand(110, 220);
            const base = shoulder(z) - 6;
            cliff.push(at(box(rand(50, 90), H, rand(40, 70)), x, base + H / 2, z));
            // The falls themselves: bright ribbons down the inner face, and a
            // glow pool where they land.
            const fx = x - side * rand(24, 40);
            for (let f = 0; f < 2; f++) {
                water.push(at(box(rand(4, 8), H * 0.96, 1.6), fx + rand(-14, 14), base + H * 0.49, z + rand(-10, 10)));
            }
            mist.push(at(box(rand(24, 40), 3, rand(14, 22)), fx, base + 1, z));
        }
    }
    emit(build, cliff, dark('#14203a'));
    emit(build, water, basic(spec.a, { transparent: true, opacity: 0.75 }));
    emit(build, mist, basic(spec.b, { transparent: true, opacity: 0.35 }));
    return build;
};

const mushroom: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const stem: THREE.BufferGeometry[] = [];
    const capGlow: THREE.BufferGeometry[] = [];
    const span = z0 - z1;
    for (const side of [-1, 1]) {
        for (let i = 0; i < 10; i++) {
            const z = z0 - Math.random() * span;
            const x = side * (INNER + rand(20, 280));
            const h = rand(25, 85);
            const base = shoulder(z) - 3;
            stem.push(at(new THREE.CylinderGeometry(rand(2.5, 4), rand(4, 6), h, 6), x, base + h / 2, z));
            const capR = h * rand(0.35, 0.55);
            const cap = new THREE.SphereGeometry(capR, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
            cap.scale(1, 0.55, 1);
            capGlow.push(at(cap, x, base + h, z));
        }
    }
    emit(build, stem, dark('#201a2e'));
    emit(build, capGlow, basic(spec.a, { transparent: true, opacity: 0.85 }));
    return build;
};

const BUILDERS: Record<SceneSpec['kind'], Builder> = {
    city,
    ocean,
    tunnel,
    harbor,
    mountains,
    crystal,
    colossi,
    lattice,
    volcano,
    forest,
    ruins,
    windfarm,
    pyramids,
    arches,
    ribcage,
    floating,
    falls,
    mushroom,
};

const buildTile = (index: number): TileBuild => {
    const z0 = -index * planeSize;
    const z1 = -(index + 1) * planeSize;
    const spec = sceneAt((z0 + z1) / 2);
    return BUILDERS[spec.kind](z0, z1, spec);
};

/* -------------------------------------------------------- actor layers -- */

/** Shared actor geometries, built once. */
let fishGeometry: THREE.BufferGeometry | null = null;
const getFishGeometry = () => {
    if (!fishGeometry) {
        const g = new THREE.ConeGeometry(1, 4.2, 4);
        g.rotateX(-Math.PI / 2); // nose forward, along -z
        const tail = new THREE.ConeGeometry(0.8, 1.6, 4);
        tail.rotateX(Math.PI / 2);
        tail.translate(0, 0, 2.6);
        fishGeometry = mergeGeometries([g, tail]);
    }
    return fishGeometry;
};

let turtleGeometry: THREE.BufferGeometry | null = null;
const getTurtleGeometry = () => {
    if (!turtleGeometry) {
        const shell = new THREE.SphereGeometry(2.4, 7, 5);
        shell.scale(1.25, 0.55, 1.5);
        const head = new THREE.SphereGeometry(0.8, 5, 4);
        head.translate(0, 0, -3.4);
        const parts: THREE.BufferGeometry[] = [shell, head];
        for (const [fx, fz] of [[-2.4, -1.6], [2.4, -1.6], [-2, 2], [2, 2]] as const) {
            const flipper = new THREE.BoxGeometry(2.4, 0.4, 1.3);
            flipper.rotateY(fx < 0 ? 0.5 : -0.5);
            flipper.translate(fx, -0.2, fz);
            parts.push(flipper);
        }
        turtleGeometry = mergeGeometries(parts);
    }
    return turtleGeometry;
};

let rotorGeometry: THREE.BufferGeometry | null = null;
const getRotorGeometry = () => {
    if (!rotorGeometry) {
        const hub: THREE.BufferGeometry = new THREE.SphereGeometry(2, 6, 5);
        const blades: THREE.BufferGeometry[] = [hub];
        for (let i = 0; i < 3; i++) {
            const blade: THREE.BufferGeometry = new THREE.BoxGeometry(2.6, 34, 1);
            blade.translate(0, 17, 0);
            blade.rotateZ((i * Math.PI * 2) / 3);
            blades.push(blade);
        }
        rotorGeometry = mergeGeometries(blades);
    }
    return rotorGeometry;
};

const SwimLayer = ({
    specs,
    geometry,
    color,
    weave,
}: {
    specs: Swimmer[];
    geometry: THREE.BufferGeometry;
    color: string;
    /** How much of the motion is sideways weaving vs forward cruising. */
    weave: number;
}) => {
    const ref = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const material = useMemo(() => basic(color, { transparent: true, opacity: 0.9 }), [color]);

    useFrame(({ clock }) => {
        const mesh = ref.current;
        if (!mesh) return;
        const t = clock.elapsedTime;
        specs.forEach((s, i) => {
            const swimPhase = t * s.speed + s.phase;
            // A lazy circuit: drift along z, weave in x and y.
            const dz = Math.cos(swimPhase) * s.amp * 2;
            const dx = Math.sin(swimPhase) * s.amp * weave;
            const dy = Math.sin(swimPhase * 0.6 + s.phase) * s.amp * 0.3;
            dummy.position.set(s.x + dx, s.y + dy, s.z + dz);
            // Face along the direction of travel.
            dummy.rotation.set(0, Math.atan2(
                Math.cos(swimPhase) * weave,
                Math.sin(swimPhase) * 2,
            ), 0);
            dummy.scale.setScalar(s.scale);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh
            ref={ref}
            args={[geometry, material, specs.length]}
            frustumCulled={false}
        />
    );
};

const RotorLayer = ({ specs }: { specs: Rotor[] }) => {
    const ref = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const material = useMemo(() => dark('#2a3350'), []);

    useFrame(({ clock }) => {
        const mesh = ref.current;
        if (!mesh) return;
        const t = clock.elapsedTime;
        specs.forEach((s, i) => {
            dummy.position.set(s.x, s.y, s.z + 2.5);
            dummy.rotation.set(0, 0, t * s.speed + s.phase);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh
            ref={ref}
            args={[getRotorGeometry(), material, specs.length]}
            frustumCulled={false}
        />
    );
};

const BeamLayer = ({ specs, color }: { specs: Beam[]; color: string }) => {
    const ref = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const geometry = useMemo(() => {
        const g = new THREE.BoxGeometry(90, 1.6, 1.6);
        g.translate(45, 0, 0); // pivot at the lamp
        return g;
    }, []);
    const material = useMemo(
        () => basic(color, { transparent: true, opacity: 0.45 }),
        [color],
    );

    useFrame(({ clock }) => {
        const mesh = ref.current;
        if (!mesh) return;
        const t = clock.elapsedTime;
        specs.forEach((s, i) => {
            dummy.position.set(s.x, s.y, s.z);
            dummy.rotation.set(0, t * s.speed + s.phase, 0);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh
            ref={ref}
            args={[geometry, material, specs.length]}
            frustumCulled={false}
        />
    );
};

/* ------------------------------------------------------------ component -- */

const SceneryTile = ({ index }: { index: number }) => {
    const build = useMemo(() => buildTile(index), [index]);

    return (
        <group>
            {build.pieces.map((piece, i) => (
                <mesh key={i} geometry={piece.geometry} material={piece.material} />
            ))}
            {build.fish.length > 0 && (
                <SwimLayer
                    specs={build.fish}
                    geometry={getFishGeometry()}
                    color="#9fd8ff"
                    weave={0.8}
                />
            )}
            {build.turtles.length > 0 && (
                <SwimLayer
                    specs={build.turtles}
                    geometry={getTurtleGeometry()}
                    color="#6fd6a8"
                    weave={0.4}
                />
            )}
            {build.rotors.length > 0 && <RotorLayer specs={build.rotors} />}
            {build.beams.length > 0 && (
                <BeamLayer specs={build.beams} color={build.beamColor} />
            )}
        </group>
    );
};

const Scenery = () => {
    const playerPosition = useStore(state => state.playerPosition);
    const [anchor, setAnchor] = useState(0);

    useFrame(() => {
        const next = Math.max(0, Math.floor(-playerPosition[2] / planeSize));
        if (next !== anchor) setAnchor(next);
    });

    return (
        <>
            <SceneryTile index={anchor} />
            <SceneryTile index={anchor + 1} />
        </>
    );
};

export default Scenery;
