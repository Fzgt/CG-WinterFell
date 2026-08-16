import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { planeSize, trackCurve, trackHeight } from '../config/constants';
import { FIELD_WIDTH } from '../config/obstacles';
import { useStore } from '../store/store';
import { sceneAt, type SceneSpec } from '../config/scenes';

/**
 * The world beside the track: twenty scenes, each rebuilt per world tile.
 *
 * Tiles are keyed by lattice index; crossing a boundary drops the kilometre
 * behind and builds the next ahead in whatever scene owns that stretch.
 * Everything is baked in world coordinates on the same winding, rolling
 * centreline as the track. Static pieces merge to a handful of draw calls;
 * whatever lives — fish, whales, jellyfish, airships, pacing war machines,
 * turbine rotors, lighthouse beams, spinning monoliths — is a small
 * instanced mesh animated per frame.
 *
 * Contract with the track: nothing enters |x| < INNER at track height, and
 * overhead structures clear the tallest obstacle by a wide margin.
 */

const INNER = FIELD_WIDTH / 2 + 34;

/* --------------------------------------------------------------- helpers -- */

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const pick = <T,>(xs: readonly T[]): T =>
    xs[Math.floor(Math.random() * xs.length)];

/** Ground level for scenery near world z, just off the track's shoulder. */
const shoulder = (z: number) => trackHeight(z) - 4;

const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => {
    g.translate(x + trackCurve(z), y, z);
    return g;
};

const box = (w: number, h: number, d: number): THREE.BufferGeometry =>
    new THREE.BoxGeometry(w, h, d);

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

let windowTexture: THREE.CanvasTexture | null = null;
const getWindowTexture = () => (windowTexture ??= buildWindowTexture());

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

/* ------------------------------------------------------------ materials -- */

const basic = (
    color: string,
    opts: Partial<THREE.MeshBasicMaterialParameters> = {},
) => new THREE.MeshBasicMaterial({ color, toneMapped: false, ...opts });

const dark = (color = '#12142a') =>
    new THREE.MeshStandardMaterial({
        color,
        roughness: 0.95,
        metalness: 0.05,
        flatShading: true,
    });

/* -------------------------------------------------------------- actors -- */

export interface ActorSpec {
    x: number;
    y: number;
    z: number;
    amp: number;
    speed: number;
    phase: number;
    scale: number;
}

type ActorKind =
    | 'fish'
    | 'turtle'
    | 'jelly'
    | 'whale'
    | 'airship'
    | 'walker'
    | 'spinner';

interface ActorGroup {
    kind: ActorKind;
    specs: ActorSpec[];
    /** Each part shares the group's motion; body + glow, typically. */
    parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
}

interface Rotor {
    x: number;
    y: number;
    z: number;
    speed: number;
    phase: number;
    scale: number;
}

interface Beam {
    x: number;
    y: number;
    z: number;
    speed: number;
    phase: number;
}

const applyMotion = (
    kind: ActorKind,
    s: ActorSpec,
    t: number,
    dummy: THREE.Object3D,
) => {
    const w = t * s.speed + s.phase;
    let dx = 0;
    let dy = 0;
    let dz = 0;
    let yaw = 0;
    let scale = s.scale;
    switch (kind) {
        case 'fish':
        case 'turtle':
        case 'whale': {
            const weave = kind === 'fish' ? 0.8 : kind === 'turtle' ? 0.4 : 0.15;
            dx = Math.sin(w) * s.amp * weave;
            dy = Math.sin(w * 0.6 + s.phase) * s.amp * 0.3;
            dz = Math.cos(w) * s.amp * 2;
            yaw = Math.atan2(Math.cos(w) * weave, Math.sin(w) * 2);
            break;
        }
        case 'jelly':
            dy = Math.sin(w) * s.amp;
            scale = s.scale * (1 + 0.12 * Math.sin(t * 2.2 + s.phase));
            break;
        case 'airship':
            dx = Math.sin(w * 0.3) * s.amp;
            dz = Math.cos(w * 0.22) * s.amp * 3;
            dy = Math.sin(w * 0.5) * 3;
            yaw = Math.sin(w * 0.3) * 0.3;
            break;
        case 'walker':
            // Pacing sentries: stride along z, stomping bob, about-face at
            // each end of the patrol.
            dz = Math.sin(w * 0.35) * s.amp * 4;
            dy = Math.abs(Math.sin(w * 3.2)) * 2.2;
            yaw = Math.cos(w * 0.35) > 0 ? 0 : Math.PI;
            break;
        case 'spinner':
            yaw = w * 0.5;
            dy = Math.sin(t * 0.7 + s.phase) * 5;
            break;
    }
    dummy.position.set(s.x + dx, s.y + dy, s.z + dz);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
};

const ActorLayer = ({ group }: { group: ActorGroup }) => {
    const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
    const dummy = useMemo(() => new THREE.Object3D(), []);

    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        group.specs.forEach((s, i) => {
            applyMotion(group.kind, s, t, dummy);
            for (const mesh of refs.current) {
                mesh?.setMatrixAt(i, dummy.matrix);
            }
        });
        for (const mesh of refs.current) {
            if (mesh) mesh.instanceMatrix.needsUpdate = true;
        }
    });

    return (
        <>
            {group.parts.map((part, i) => (
                <instancedMesh
                    key={i}
                    ref={mesh => {
                        refs.current[i] = mesh;
                    }}
                    args={[part.geometry, part.material, group.specs.length]}
                    frustumCulled={false}
                />
            ))}
        </>
    );
};

const RotorLayer = ({ specs }: { specs: Rotor[] }) => {
    const ref = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const geometry = useMemo(() => {
        const hub: THREE.BufferGeometry = new THREE.SphereGeometry(2.4, 6, 5);
        const parts: THREE.BufferGeometry[] = [hub];
        for (let i = 0; i < 3; i++) {
            const blade = box(3, 34, 1.2);
            blade.translate(0, 17, 0);
            blade.rotateZ((i * Math.PI * 2) / 3);
            parts.push(blade);
        }
        return mergeGeometries(parts);
    }, []);
    const material = useMemo(() => dark('#2a3350'), []);

    useFrame(({ clock }) => {
        const mesh = ref.current;
        if (!mesh) return;
        const t = clock.elapsedTime;
        specs.forEach((s, i) => {
            dummy.position.set(s.x, s.y, s.z + 3);
            dummy.rotation.set(0, 0, t * s.speed + s.phase);
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

const BeamLayer = ({ specs, color }: { specs: Beam[]; color: string }) => {
    const ref = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const geometry = useMemo(() => {
        const g = box(130, 2, 2);
        g.translate(65, 0, 0); // pivot at the lamp
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

/* ---------------------------------------------------------- tile output -- */

interface Piece {
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
}

interface TileBuild {
    pieces: Piece[];
    actors: ActorGroup[];
    rotors: Rotor[];
    beams: Beam[];
    beamColor: string;
}

const emptyBuild = (): TileBuild => ({
    pieces: [],
    actors: [],
    rotors: [],
    beams: [],
    beamColor: '#ffffff',
});

const emit = (
    build: TileBuild,
    parts: THREE.BufferGeometry[],
    material: THREE.Material,
) => {
    if (parts.length) {
        build.pieces.push({ geometry: mergeGeometries(parts), material });
    }
};

/** Terraced sea strips flanking the causeway. */
const sea = (build: TileBuild, z0: number, z1: number, color = '#071d34') => {
    const strips: THREE.BufferGeometry[] = [];
    for (let z = z0; z > z1; z -= 100) {
        const zc = z - 50;
        const level = trackHeight(zc) - 16;
        for (const side of [-1, 1]) {
            strips.push(at(box(620, 1, 102), side * (INNER + 310), level, zc));
        }
    }
    emit(build, strips, basic(color));
};

/* ------------------------------------------------------ actor factories -- */

const fishGeometry = () => {
    const body = new THREE.ConeGeometry(1, 4.2, 4);
    body.rotateX(-Math.PI / 2);
    const tail = new THREE.ConeGeometry(0.8, 1.6, 4);
    tail.rotateX(Math.PI / 2);
    tail.translate(0, 0, 2.6);
    return mergeGeometries([body, tail]);
};

const turtleGeometry = () => {
    const shell = new THREE.SphereGeometry(2.4, 7, 5);
    shell.scale(1.25, 0.55, 1.5);
    const head: THREE.BufferGeometry = new THREE.SphereGeometry(0.8, 5, 4);
    head.translate(0, 0, -3.4);
    const parts: THREE.BufferGeometry[] = [shell, head];
    for (const [fx, fz] of [[-2.4, -1.6], [2.4, -1.6], [-2, 2], [2, 2]] as const) {
        const flipper = box(2.4, 0.4, 1.3);
        flipper.rotateY(fx < 0 ? 0.5 : -0.5);
        flipper.translate(fx, -0.2, fz);
        parts.push(flipper);
    }
    return mergeGeometries(parts);
};

const jellyGeometry = () => {
    const dome = new THREE.SphereGeometry(
        3, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2,
    );
    const parts: THREE.BufferGeometry[] = [dome];
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const tentacle = box(0.35, 6, 0.35);
        tentacle.translate(Math.cos(a) * 1.6, -3.2, Math.sin(a) * 1.6);
        parts.push(tentacle);
    }
    return mergeGeometries(parts);
};

const whaleGeometry = () => {
    const body = new THREE.SphereGeometry(3, 9, 7);
    body.scale(1.1, 1, 3.2);
    const fluke = box(6, 0.6, 2.4);
    fluke.translate(0, 0.8, 10);
    const finL = box(3.4, 0.5, 1.6);
    finL.rotateZ(0.5);
    finL.translate(-3, -1, -2);
    const finR = box(3.4, 0.5, 1.6);
    finR.rotateZ(-0.5);
    finR.translate(3, -1, -2);
    return mergeGeometries([body, fluke, finL, finR]);
};

const airshipGeometry = () => {
    const hull = new THREE.SphereGeometry(4, 9, 7);
    hull.scale(1, 1, 3);
    const gondola = box(2.2, 1.6, 6);
    gondola.translate(0, -4.4, 0);
    const fin = box(0.5, 4, 3);
    fin.translate(0, 1.5, 10.5);
    return mergeGeometries([hull, gondola, fin]);
};

const airshipGlowGeometry = () => {
    const strip = box(0.4, 0.5, 5);
    strip.translate(-1.2, -4.4, 0);
    const strip2 = box(0.4, 0.5, 5);
    strip2.translate(1.2, -4.4, 0);
    return mergeGeometries([strip, strip2]);
};

const walkerGeometry = () => {
    const torso = box(7, 6, 5);
    torso.translate(0, 12, 0);
    const head = box(3.4, 2.6, 3.4);
    head.translate(0, 16.5, 0);
    const legL = box(2, 9, 2.6);
    legL.translate(-2.2, 4.5, 0);
    const legR = box(2, 9, 2.6);
    legR.translate(2.2, 4.5, 0);
    const armL = box(1.8, 7, 2);
    armL.translate(-4.8, 11, 0);
    const armR = box(1.8, 7, 2);
    armR.translate(4.8, 11, 0);
    const cannon = box(1.4, 1.4, 6);
    cannon.translate(4.8, 14, -2);
    return mergeGeometries([torso, head, legL, legR, armL, armR, cannon]);
};

const walkerEyeGeometry = () => {
    const eye = box(2.6, 0.7, 0.4);
    eye.translate(0, 16.7, -1.8);
    return eye;
};

const spinnerGeometry = () => {
    const pyramid = new THREE.ConeGeometry(1, 1.6, 4, 1);
    pyramid.rotateX(Math.PI); // point down
    pyramid.rotateY(Math.PI / 4);
    return pyramid;
};

const spinnerRingGeometry = () => {
    const ring = new THREE.TorusGeometry(1.02, 0.05, 5, 20);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, 0.78, 0);
    return ring;
};

/** A sentinel-class war machine: legs, torso, shoulders, head, visor. */
const warMachine = (
    steel: THREE.BufferGeometry[],
    glow: THREE.BufferGeometry[],
    x: number,
    z: number,
    H: number,
    lean = 0,
    core = true,
) => {
    const part = (g: THREE.BufferGeometry, px: number, py: number) => {
        if (lean) g.rotateZ(lean);
        // Lean rotates around the feet, so shift accordingly.
        const dx = lean ? py * Math.sin(lean) : 0;
        g.translate(0, 0, 0);
        at(g, x + px + dx, py * Math.cos(lean || 0) + shoulder(z) - 6, z);
    };
    for (const lx of [-0.11, 0.11]) {
        const leg = box(H * 0.09, H * 0.42, H * 0.11);
        part(leg, lx * H, H * 0.21);
        steel.push(leg);
    }
    const hip = box(H * 0.3, H * 0.1, H * 0.14);
    part(hip, 0, H * 0.45);
    steel.push(hip);
    const chest = box(H * 0.26, H * 0.3, H * 0.16);
    part(chest, 0, H * 0.63);
    steel.push(chest);
    for (const sx of [-0.2, 0.2]) {
        const pauldron = box(H * 0.12, H * 0.1, H * 0.14);
        part(pauldron, sx * H, H * 0.75);
        steel.push(pauldron);
        const arm = box(H * 0.06, H * 0.26, H * 0.08);
        part(arm, sx * H * 1.15, H * 0.58);
        steel.push(arm);
    }
    const head = box(H * 0.1, H * 0.08, H * 0.09);
    part(head, 0, H * 0.83);
    steel.push(head);
    if (core) {
        const coreBox = box(H * 0.06, H * 0.06, 4);
        part(coreBox, -H * 0.02, H * 0.66);
        glow.push(coreBox);
        const visor = box(H * 0.07, H * 0.016, 3);
        part(visor, 0, H * 0.845);
        glow.push(visor);
    }
};

/** Glowing letterform boxes for a sign; supports U, T, S. */
const glyph = (
    out: THREE.BufferGeometry[],
    letter: 'U' | 'T' | 'S',
    x: number,
    y: number,
    z: number,
    u: number,
) => {
    const bar = (bx: number, by: number, w: number, h: number) => {
        const g = box(w * u, h * u, 2);
        g.translate(x + bx * u, y + by * u, z);
        out.push(g);
    };
    if (letter === 'U') {
        bar(-1, 0.5, 1, 4); // left
        bar(1, 0.5, 1, 4); // right
        bar(0, -1.5, 3, 1); // bottom
    } else if (letter === 'T') {
        bar(0, 2, 3, 1); // top
        bar(0, -0.5, 1, 4); // stem
    } else {
        bar(0, 2, 3, 1); // top
        bar(-1, 1, 1, 1); // upper left
        bar(0, 0, 3, 1); // middle
        bar(1, -1, 1, 1); // lower right
        bar(0, -2, 3, 1); // bottom
    }
};

/* ---------------------------------------------------------------- scenes -- */

type Builder = (z0: number, z1: number, spec: SceneSpec) => TileBuild;

/* 1 ─ Neon City ----------------------------------------------------------- */
const city: Builder = (z0, z1) => {
    const build = emptyBuild();
    const parts: THREE.BufferGeometry[] = [];
    const beacons: THREE.BufferGeometry[] = [];
    const span = z0 - z1;
    const tower = (x: number, z: number, w: number, h: number, d: number) => {
        const g = new THREE.BoxGeometry(w, h, d);
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
                beacons.push(at(box(2.4, 2.4, 2.4), x, h * 1.02 + shoulder(z), z));
            }
        }
        for (let i = 0; i < 10; i++) {
            const x = side * (INNER + rand(170, 340));
            const z = z0 - (i / 10) * span - rand(0, 60);
            tower(x, z, rand(30, 70), rand(120, 300), rand(30, 70));
        }
    }
    emit(build, parts, new THREE.MeshBasicMaterial({ map: getWindowTexture() }));
    emit(build, beacons, basic('#ff3b4d'));
    return build;
};

/* 2 ─ Beacon Coast: sky-piercing lighthouses, giant ships ----------------- */
const ocean: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    sea(build, z0, z1);
    const moon: THREE.BufferGeometry[] = [];
    const white: THREE.BufferGeometry[] = [];
    const stripe: THREE.BufferGeometry[] = [];
    const lamp: THREE.BufferGeometry[] = [];
    const pillar: THREE.BufferGeometry[] = [];
    const hull: THREE.BufferGeometry[] = [];
    const port: THREE.BufferGeometry[] = [];
    const span = z0 - z1;

    for (let z = z0; z > z1; z -= 100) {
        const zc = z - 50;
        const level = trackHeight(zc) - 16;
        moon.push(
            at(box(rand(20, 34), 1.2, rand(60, 95)), INNER + rand(170, 230), level + 0.4, zc),
        );
    }

    // Beacon spires: striped towers stacked into the clouds, 200-360 tall,
    // each firing a rotating beam and a vertical light column. Not one bit
    // reasonable, exactly as ordered.
    for (let i = 0; i < 5; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const z = z0 - ((i + 0.5) / 5) * span;
        const x = side * (INNER + rand(80, 240));
        const base = trackHeight(z) - 14;
        const h = rand(120, 200);
        const segs = 9;
        white.push(at(new THREE.ConeGeometry(24, 26, 6), x, base + 8, z));
        for (let seg = 0; seg < segs; seg++) {
            const target = seg % 2 === 0 ? white : stripe;
            const r0 = 9 - seg * 0.7;
            target.push(
                at(
                    new THREE.CylinderGeometry(Math.max(2.4, r0 - 0.7), Math.max(2.6, r0), h / segs, 8),
                    x,
                    base + 18 + (seg + 0.5) * (h / segs),
                    z,
                ),
            );
        }
        lamp.push(at(box(9, 7, 9), x, base + 18 + h + 3.5, z));
        // The light column: a beam driven straight up into the sky.
        pillar.push(at(box(3.2, 170, 3.2), x, base + h + 100, z));
        build.beams.push({
            x: x + trackCurve(z), y: base + 18 + h + 3.5, z,
            speed: rand(0.7, 1.1), phase: i * 2.1,
        });
    }

    // Giant ships: a supertanker and a container leviathan per kilometre.
    for (const side of [-1, 1]) {
        const z = z0 - rand(200, 900);
        const x = side * (INNER + rand(280, 460));
        const level = trackHeight(z) - 16;
        const L = rand(300, 460);
        const H = rand(26, 40);
        hull.push(at(box(L, H, 52), x, level + H / 2 - 2, z));
        hull.push(at(box(L * 0.14, H * 2.4, 44), x - L * 0.33, level + H * 1.7, z));
        hull.push(at(box(4, H * 4, 4), x + L * 0.28, level + H * 2.6, z));
        for (let p = -L * 0.45; p < L * 0.45; p += 11) {
            port.push(at(box(2.6, 2.6, 2.6), x + p, level + H * 0.72, z + 27));
        }
        // Container stacks glowing at the seams.
        for (let c = 0; c < 6; c++) {
            hull.push(at(box(24, rand(10, 26), 40), x - L * 0.2 + c * 26, level + H + 8, z));
        }
    }

    emit(build, moon, basic(spec.a, { transparent: true, opacity: 0.4 }));
    emit(build, white, basic('#dfe7ff'));
    emit(build, stripe, basic(spec.b));
    emit(build, lamp, basic('#fff6c9'));
    emit(build, pillar, basic(spec.a, { transparent: true, opacity: 0.16 }));
    emit(build, hull, dark('#0d1020'));
    emit(build, port, basic('#ffd9a0'));
    build.beamColor = '#fff6c9';
    return build;
};

/* 3 ─ Violet Range: layered ridges, lit crests, floating shards ----------- */
const mountains: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const rock: THREE.BufferGeometry[] = [];
    const mid: THREE.BufferGeometry[] = [];
    const crest: THREE.BufferGeometry[] = [];
    const shards: THREE.BufferGeometry[] = [];
    const span = z0 - z1;

    for (const side of [-1, 1]) {
        // Three depth layers: foothills, ridge, far megaridge.
        for (const [count, near, far, hLo, hHi] of [
            [8, INNER + 30, INNER + 170, 40, 110],
            [6, INNER + 190, INNER + 360, 140, 260],
            [4, INNER + 380, INNER + 560, 260, 420],
        ] as const) {
            for (let i = 0; i < count; i++) {
                const z = z0 - (i / count) * span - rand(0, 80);
                const x = side * rand(near, far);
                const h = rand(hLo, hHi);
                const r = h * rand(0.5, 0.85);
                const base = shoulder(z) - 8;
                const peak = new THREE.ConeGeometry(r, h, 5, 1);
                peak.rotateY(rand(0, Math.PI));
                rock.push(at(peak, x, base + h / 2, z));
                // Upper band in a lighter violet, like altitude catching light.
                const upper = new THREE.ConeGeometry(r * 0.55, h * 0.45, 5, 1);
                upper.rotateY(rand(0, Math.PI));
                mid.push(at(upper, x, base + h * 0.72, z));
                // A lit crest star on the tall ones.
                if (h > 130) crest.push(at(box(3, 3, 3), x, base + h + 2, z));
            }
        }
        // Weightless splinters drifting above the ridgeline.
        for (let i = 0; i < 6; i++) {
            const z = z0 - Math.random() * span;
            const x = side * (INNER + rand(120, 420));
            const s = new THREE.ConeGeometry(rand(3, 6), rand(10, 22), 4);
            s.rotateZ(rand(-0.4, 0.4));
            shards.push(at(s, x, shoulder(z) + rand(180, 320), z));
        }
    }
    emit(build, rock, dark('#171a30'));
    emit(build, mid, dark('#2a2450'));
    emit(build, crest, basic(spec.b));
    emit(build, shards, basic(spec.a, { transparent: true, opacity: 0.6 }));
    return build;
};

/* 4 ─ Abyss Tunnel: ribs, fish, turtles, jellyfish, a whale, an octopus --- */
const tunnel: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const ribs: THREE.BufferGeometry[] = [];
    const glowRibs: THREE.BufferGeometry[] = [];
    const plankton: THREE.BufferGeometry[] = [];

    let n = 0;
    for (let z = z0; z > z1; z -= 50, n++) {
        const arch = new THREE.TorusGeometry(74, 2.4, 6, 28, Math.PI);
        arch.translate(trackCurve(z), trackHeight(z) + 4, z);
        (n % 3 === 0 ? glowRibs : ribs).push(arch);
        for (const [dx, dy] of [[-74, 4], [74, 4], [0, 78]] as const) {
            ribs.push(at(box(1.6, 1.6, 50), dx, trackHeight(z - 25) + dy, z - 25));
        }
    }
    for (let i = 0; i < 70; i++) {
        const z = rand(z1, z0);
        plankton.push(
            at(box(0.9, 0.9, 0.9), rand(-1, 1) * rand(20, 190), trackHeight(z) + rand(6, 70), z),
        );
    }

    // The octopus: a dome on the seafloor, arms curling out of the dark.
    const octo: THREE.BufferGeometry[] = [];
    const octoGlow: THREE.BufferGeometry[] = [];
    {
        const side = Math.random() < 0.5 ? -1 : 1;
        const z = z0 - rand(300, 700);
        const x = side * (INNER + rand(90, 160));
        const base = trackHeight(z) - 10;
        const head = new THREE.SphereGeometry(26, 9, 7);
        head.scale(1, 0.8, 1);
        octo.push(at(head, x, base + 16, z));
        for (let a = 0; a < 8; a++) {
            const arm = new THREE.TorusGeometry(rand(20, 34), 4, 5, 12, Math.PI * rand(0.5, 0.8));
            arm.rotateZ(rand(0, Math.PI * 2));
            arm.rotateY((a / 8) * Math.PI * 2);
            octo.push(at(arm, x, base + 6, z));
        }
        octoGlow.push(at(box(4, 4, 2), x - 9, base + 22, z + 22));
        octoGlow.push(at(box(4, 4, 2), x + 9, base + 22, z + 22));
    }

    // Fauna.
    const fish: ActorSpec[] = [];
    for (let i = 0; i < 90; i++) {
        const z = rand(z1, z0);
        const side = Math.random() < 0.5 ? -1 : 1;
        fish.push({
            x: side * rand(INNER + 55, INNER + 220) + trackCurve(z),
            y: trackHeight(z) + rand(4, 60), z,
            amp: rand(6, 16), speed: rand(0.6, 1.6),
            phase: rand(0, Math.PI * 2), scale: rand(0.7, 1.4),
        });
    }
    const turtles: ActorSpec[] = [];
    for (let i = 0; i < 5; i++) {
        const z = rand(z1, z0);
        const side = Math.random() < 0.5 ? -1 : 1;
        turtles.push({
            x: side * rand(INNER + 70, INNER + 200) + trackCurve(z),
            y: trackHeight(z) + rand(12, 45), z,
            amp: rand(10, 20), speed: rand(0.15, 0.3),
            phase: rand(0, Math.PI * 2), scale: rand(2.4, 4),
        });
    }
    const jellies: ActorSpec[] = [];
    for (let i = 0; i < 14; i++) {
        const z = rand(z1, z0);
        const side = Math.random() < 0.5 ? -1 : 1;
        jellies.push({
            x: side * rand(INNER + 40, INNER + 260) + trackCurve(z),
            y: trackHeight(z) + rand(20, 80), z,
            amp: rand(6, 14), speed: rand(0.3, 0.6),
            phase: rand(0, Math.PI * 2), scale: rand(1.2, 3),
        });
    }
    const whales: ActorSpec[] = [];
    for (let i = 0; i < 2; i++) {
        const z = z0 - rand(200, 1400);
        const side = i === 0 ? -1 : 1;
        whales.push({
            x: side * rand(INNER + 160, INNER + 320) + trackCurve(z),
            y: trackHeight(z) + rand(40, 90), z,
            amp: rand(30, 50), speed: rand(0.06, 0.12),
            phase: rand(0, Math.PI * 2), scale: rand(7, 11),
        });
    }

    emit(build, ribs, dark('#0e1626'));
    emit(build, glowRibs, basic(spec.a, { transparent: true, opacity: 0.85 }));
    emit(build, plankton, basic(spec.b, { transparent: true, opacity: 0.7 }));
    emit(build, octo, dark('#251b3a'));
    emit(build, octoGlow, basic(spec.b));
    build.actors.push(
        { kind: 'fish', specs: fish, parts: [{ geometry: fishGeometry(), material: basic('#9fd8ff', { transparent: true, opacity: 0.9 }) }] },
        { kind: 'turtle', specs: turtles, parts: [{ geometry: turtleGeometry(), material: basic('#6fd6a8', { transparent: true, opacity: 0.9 }) }] },
        { kind: 'jelly', specs: jellies, parts: [{ geometry: jellyGeometry(), material: basic(spec.a, { transparent: true, opacity: 0.5 }) }] },
        { kind: 'whale', specs: whales, parts: [{ geometry: whaleGeometry(), material: dark('#1d2a4a') }] },
    );
    return build;
};

/* 5 ─ Iron Harbor: warships and a liner, not the coast's freighters ------- */
const harbor: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    sea(build, z0, z1);
    const grey: THREE.BufferGeometry[] = [];
    const deck: THREE.BufferGeometry[] = [];
    const glow: THREE.BufferGeometry[] = [];
    const liner: THREE.BufferGeometry[] = [];
    const linerGlow: THREE.BufferGeometry[] = [];
    const span = z0 - z1;

    // Warships at anchor: turrets, bridge castles, radar masts, nav lights.
    for (const side of [-1, 1]) {
        for (let i = 0; i < 2; i++) {
            const z = z0 - ((i + 0.5) / 2) * span + rand(-100, 100);
            const x = side * (INNER + rand(140, 320));
            const level = trackHeight(z) - 16;
            const L = rand(220, 320);
            grey.push(at(box(34, 20, L), x, level + 8, z - L / 2));
            const bow = new THREE.ConeGeometry(17, 50, 4);
            bow.rotateX(-Math.PI / 2);
            bow.rotateY(Math.PI / 4);
            grey.push(at(bow, x, level + 8, z + 25));
            // Bridge castle and radar mast.
            grey.push(at(box(26, 26, L * 0.16), x, level + 30, z - L * 0.55));
            grey.push(at(box(3, 34, 3), x, level + 58, z - L * 0.55));
            deck.push(at(box(8, 1.5, 1.5), x, level + 76, z - L * 0.55));
            // Turrets fore and aft, barrels toward the bow.
            for (const tz of [0.22, 0.34, 0.78]) {
                const ty = level + 20;
                grey.push(at(new THREE.CylinderGeometry(8, 9, 6, 7), x, ty, z - L * tz));
                for (const bx of [-2.5, 2.5]) {
                    deck.push(at(box(1.4, 1.4, 22), x + bx, ty + 2, z - L * tz + 14));
                }
            }
            glow.push(at(box(2, 2, 2), x - 17, level + 14, z - 10));
            glow.push(at(box(2, 2, 2), x + 17, level + 14, z - 10));
        }
    }
    // One vast cruise liner, decks ablaze.
    {
        const side = Math.random() < 0.5 ? -1 : 1;
        const z = z0 - rand(500, 1100);
        const x = side * (INNER + rand(320, 480));
        const level = trackHeight(z) - 16;
        const L = 420;
        liner.push(at(box(52, 30, L), x, level + 13, z - L / 2));
        for (let d = 0; d < 4; d++) {
            liner.push(at(box(44 - d * 6, 12, L * (0.85 - d * 0.12)), x, level + 34 + d * 12, z - L / 2));
            linerGlow.push(at(box(45 - d * 6, 2, L * (0.82 - d * 0.12)), x, level + 36 + d * 12, z - L / 2));
        }
        for (const f of [0.35, 0.55]) {
            liner.push(at(new THREE.CylinderGeometry(6, 7, 18, 7), x, level + 88, z - L * f));
        }
    }
    emit(build, grey, dark('#242a36'));
    emit(build, deck, dark('#3a4152'));
    emit(build, glow, basic(spec.b));
    emit(build, liner, dark('#e8e4da'));
    emit(build, linerGlow, basic(spec.a));
    return build;
};

/* 6 ─ Halo Fields: colossal standing rings -------------------------------- */
const rings: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const glowRings: THREE.BufferGeometry[] = [];
    const darkRings: THREE.BufferGeometry[] = [];
    const pylons: THREE.BufferGeometry[] = [];
    const span = z0 - z1;

    for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
            const z = z0 - ((i + 0.5) / 3) * span + rand(-80, 80);
            const x = side * (INNER + rand(100, 340));
            const R = rand(60, 150);
            const base = shoulder(z);
            const tilt = rand(-0.15, 0.15);
            // The ring stands facing the oncoming run, glowing rim inside a
            // dark structural rim, feet buried in the ground.
            const outer = new THREE.TorusGeometry(R, 6, 6, 40);
            outer.rotateY(tilt);
            darkRings.push(at(outer, x, base + R * 0.72, z));
            const inner = new THREE.TorusGeometry(R * 0.92, 2.2, 5, 40);
            inner.rotateY(tilt);
            glowRings.push(at(inner, x, base + R * 0.72, z));
            pylons.push(at(box(10, R * 0.5, 10), x - R * 0.6, base + R * 0.2, z));
            pylons.push(at(box(10, R * 0.5, 10), x + R * 0.6, base + R * 0.2, z));
        }
    }
    // One mega-halo on the horizon side.
    {
        const side = Math.random() < 0.5 ? -1 : 1;
        const z = z0 - rand(500, 1300);
        const x = side * (INNER + 420);
        const R = 260;
        const mega = new THREE.TorusGeometry(R, 9, 6, 48);
        darkRings.push(at(mega, x, shoulder(z) + R * 0.7, z));
        const megaGlow = new THREE.TorusGeometry(R * 0.94, 3, 5, 48);
        glowRings.push(at(megaGlow, x, shoulder(z) + R * 0.7, z));
    }
    emit(build, darkRings, dark('#181f38'));
    emit(build, glowRings, basic(spec.a, { transparent: true, opacity: 0.85 }));
    emit(build, pylons, dark('#10152a'));
    return build;
};

/* 7 ─ The Watchers: paired colossi, torch pillars, burning eyes ----------- */
const colossi: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const body: THREE.BufferGeometry[] = [];
    const torch: THREE.BufferGeometry[] = [];
    const pillarGlow: THREE.BufferGeometry[] = [];
    const eyes: THREE.BufferGeometry[] = [];
    const span = z0 - z1;

    // Three gates of paired figures, both sides at the same z — an avenue
    // of giants the run passes down the middle of.
    for (let i = 0; i < 3; i++) {
        const z = z0 - ((i + 0.5) / 3) * span;
        const H = rand(200, 260);
        for (const side of [-1, 1]) {
            const x = side * (INNER + 90);
            const base = shoulder(z) - 8;
            const wBody = H * 0.2;
            body.push(at(new THREE.CylinderGeometry(wBody * 0.5, wBody * 0.95, H * 0.62, 7), x, base + H * 0.31, z));
            body.push(at(box(wBody, H * 0.3, wBody * 0.7), x, base + H * 0.77, z));
            body.push(at(box(wBody * 0.42, H * 0.14, wBody * 0.42), x, base + H * 0.99, z));
            for (let sp = -2; sp <= 2; sp++) {
                body.push(at(box(2, H * 0.09, 2), x + sp * wBody * 0.1, base + H * 1.1, z));
            }
            // Burning eyes, facing the track.
            eyes.push(at(box(3.4, 1.6, 1), x - side * wBody * 0.1, base + H * 1.0, z + wBody * 0.22));
            // The raised inner arm and its torch...
            const armX = x - side * wBody * 0.95;
            body.push(at(box(wBody * 0.22, H * 0.45, wBody * 0.22), armX, base + H * 0.98, z));
            torch.push(at(box(wBody * 0.32, H * 0.06, wBody * 0.32), armX, base + H * 1.22, z));
            // ...and its light: a column driven into the sky.
            pillarGlow.push(at(box(wBody * 0.2, 150, wBody * 0.2), armX, base + H * 1.25 + 75, z));
        }
    }
    emit(build, body, dark('#141a2c'));
    emit(build, torch, basic(spec.b));
    emit(build, eyes, basic(spec.b));
    emit(build, pillarGlow, basic(spec.a, { transparent: true, opacity: 0.2 }));
    return build;
};

/* 8 ─ Aurora Canyon: ice shard walls under ribbons of sky-light ----------- */
const glacier: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const ice: THREE.BufferGeometry[] = [];
    const iceGlow: THREE.BufferGeometry[] = [];
    const aurora: THREE.BufferGeometry[] = [];

    // A canyon of tilted shards hugging both shoulders, near-continuous.
    for (const side of [-1, 1]) {
        for (let z = z0; z > z1; z -= 60) {
            const zc = z - rand(0, 30);
            const x = side * (INNER + rand(20, 90));
            const h = rand(90, 240);
            const base = shoulder(zc) - 6;
            const shard = new THREE.ConeGeometry(rand(14, 26), h, 4, 1);
            shard.rotateY(rand(0, Math.PI));
            shard.rotateZ(side * rand(-0.16, 0.02));
            ice.push(at(shard, x, base + h / 2, zc));
            if (Math.random() < 0.45) {
                const vein = box(2, h * 0.7, 2);
                vein.rotateZ(side * rand(-0.14, 0.02));
                iceGlow.push(at(vein, x - side * 4, base + h * 0.4, zc));
            }
        }
        // Far bergs.
        for (let i = 0; i < 5; i++) {
            const z = z0 - Math.random() * (z0 - z1);
            const x = side * (INNER + rand(180, 420));
            const h = rand(160, 320);
            const berg = new THREE.ConeGeometry(h * 0.6, h, 5, 1);
            berg.rotateY(rand(0, Math.PI));
            ice.push(at(berg, x, shoulder(z) - 8 + h / 2, z));
        }
    }
    // Aurora: long luminous ribbons hung across the sky.
    for (let i = 0; i < 4; i++) {
        const z = z0 - rand(100, 1700);
        const ribbon = box(rand(500, 900), rand(10, 22), 3);
        ribbon.rotateZ(rand(-0.12, 0.12));
        ribbon.rotateY(rand(-0.3, 0.3));
        aurora.push(at(ribbon, rand(-200, 200), trackHeight(z) + rand(260, 380), z));
    }
    emit(build, ice, dark('#1c3050'));
    emit(build, iceGlow, basic(spec.b, { transparent: true, opacity: 0.8 }));
    emit(build, aurora, basic(spec.a, { transparent: true, opacity: 0.28 }));
    return build;
};

/* 9 ─ Pylon Fields: four silhouettes of tower ----------------------------- */
const lattice: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const steel: THREE.BufferGeometry[] = [];
    const beacon: THREE.BufferGeometry[] = [];
    const glow: THREE.BufferGeometry[] = [];
    const span = z0 - z1;

    for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
            const z = z0 - ((i + 0.5) / 3) * span + rand(-60, 60);
            const x = side * (INNER + rand(70, 260));
            const base = shoulder(z) - 4;
            const H = rand(180, 300);
            const kind = pick(['eiffel', 'ringtop', 'twin', 'coil'] as const);
            if (kind === 'eiffel') {
                for (const [lx, lz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
                    const leg = box(5, H * 0.5, 5);
                    leg.rotateZ(lx * 0.16);
                    leg.rotateX(lz * -0.16);
                    steel.push(at(leg, x + lx * H * 0.09, base + H * 0.24, z + lz * H * 0.09));
                }
                steel.push(at(box(H * 0.17, 6, H * 0.17), x, base + H * 0.48, z));
                steel.push(at(box(H * 0.1, H * 0.34, H * 0.1), x, base + H * 0.66, z));
                steel.push(at(box(H * 0.045, H * 0.24, H * 0.045), x, base + H * 0.92, z));
            } else if (kind === 'ringtop') {
                steel.push(at(new THREE.CylinderGeometry(4, 9, H, 6), x, base + H / 2, z));
                const halo = new THREE.TorusGeometry(H * 0.14, 3, 5, 24);
                steel.push(at(halo, x, base + H * 0.9, z));
                const haloGlow = new THREE.TorusGeometry(H * 0.14, 1, 4, 24);
                glow.push(at(haloGlow, x, base + H * 0.9, z));
            } else if (kind === 'twin') {
                for (const dx of [-H * 0.09, H * 0.09]) {
                    steel.push(at(box(7, H, 7), x + dx, base + H / 2, z));
                }
                steel.push(at(box(H * 0.26, 5, 8), x, base + H * 0.82, z));
                glow.push(at(box(H * 0.24, 1.6, 1.6), x, base + H * 0.84, z));
            } else {
                for (let d = 0; d < 5; d++) {
                    steel.push(at(box(H * (0.16 - d * 0.024), H * 0.16, H * (0.16 - d * 0.024)), x, base + H * (0.1 + d * 0.18), z));
                }
                const orb = new THREE.SphereGeometry(H * 0.07, 8, 6);
                glow.push(at(orb, x, base + H * 1.02, z));
            }
            beacon.push(at(box(3, 3, 3), x, base + H * 1.08, z));
        }
    }
    emit(build, steel, dark('#1b1428'));
    emit(build, beacon, basic(spec.b));
    emit(build, glow, basic(spec.a, { transparent: true, opacity: 0.8 }));
    return build;
};

/* 10 ─ Titan Grove: a phalanx of colossal trees --------------------------- */
const titangrove: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const trunk: THREE.BufferGeometry[] = [];
    const canopy: THREE.BufferGeometry[] = [];
    const emberRing: THREE.BufferGeometry[] = [];
    const motes: THREE.BufferGeometry[] = [];

    // Ranks of titans in a deliberate grid — a planted army, not a forest.
    for (const side of [-1, 1]) {
        for (const lane of [60, 190, 320]) {
            for (let z = z0 - 110; z > z1; z -= 220) {
                const x = side * (INNER + lane) + rand(-12, 12);
                const H = rand(220, 320) * (1 - lane / 900);
                const base = shoulder(z) - 6;
                trunk.push(at(new THREE.CylinderGeometry(H * 0.03, H * 0.05, H, 7), x, base + H / 2, z));
                for (let c = 0; c < 3; c++) {
                    const r = H * (0.22 - c * 0.05);
                    canopy.push(at(new THREE.ConeGeometry(r, H * 0.22, 7), x, base + H * (0.72 + c * 0.14), z));
                }
                const ring = new THREE.TorusGeometry(H * 0.1, 2, 5, 18);
                ring.rotateX(Math.PI / 2);
                emberRing.push(at(ring, x, base + H * 0.7, z));
            }
        }
        for (let i = 0; i < 14; i++) {
            const z = rand(z1, z0);
            motes.push(at(box(1.2, 1.2, 1.2), side * (INNER + rand(30, 330)), shoulder(z) + rand(20, 200), z));
        }
    }
    emit(build, trunk, dark('#241812'));
    emit(build, canopy, dark('#301a10'));
    emit(build, emberRing, basic(spec.a, { transparent: true, opacity: 0.85 }));
    emit(build, motes, basic(spec.b, { transparent: true, opacity: 0.7 }));
    return build;
};

/* 11 ─ Neon Grove: several silhouettes of tree ---------------------------- */
const forest: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const trunk: THREE.BufferGeometry[] = [];
    const canopyA: THREE.BufferGeometry[] = [];
    const canopyB: THREE.BufferGeometry[] = [];
    const span = z0 - z1;
    for (const side of [-1, 1]) {
        for (let i = 0; i < 26; i++) {
            const z = z0 - Math.random() * span;
            const x = side * (INNER + rand(10, 330));
            const h = rand(30, 120);
            const base = shoulder(z) - 3;
            const target = Math.random() < 0.5 ? canopyA : canopyB;
            const kind = pick(['cone', 'orb', 'spire', 'palm'] as const);
            trunk.push(at(new THREE.CylinderGeometry(h * 0.02, h * 0.035, h, 5), x, base + h / 2, z));
            if (kind === 'cone') {
                target.push(at(new THREE.ConeGeometry(rand(8, 16), h * 0.5, 6), x, base + h + h * 0.12, z));
            } else if (kind === 'orb') {
                target.push(at(new THREE.SphereGeometry(rand(7, 13), 7, 5), x, base + h + 4, z));
            } else if (kind === 'spire') {
                target.push(at(new THREE.ConeGeometry(rand(4, 7), h * 0.9, 5), x, base + h * 1.1, z));
            } else {
                for (let f = 0; f < 5; f++) {
                    const frond = box(2.2, 0.8, rand(10, 16));
                    frond.rotateY((f / 5) * Math.PI * 2);
                    frond.rotateX(-0.35);
                    target.push(at(frond, x, base + h, z));
                }
            }
        }
    }
    emit(build, trunk, dark('#101425'));
    emit(build, canopyA, basic(spec.a, { transparent: true, opacity: 0.8 }));
    emit(build, canopyB, basic(spec.b, { transparent: true, opacity: 0.7 }));
    return build;
};

/* 12 ─ Machine Graveyard: pacing war machines among the wrecks ------------ */
const ruins: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const wreck: THREE.BufferGeometry[] = [];
    const glow: THREE.BufferGeometry[] = [];
    const span = z0 - z1;

    for (const side of [-1, 1]) {
        // Downed aircraft: a snapped wing, an engine nacelle, a tail fin
        // sticking out of the ground at wrong angles.
        for (let i = 0; i < 4; i++) {
            const z = z0 - Math.random() * span;
            const x = side * (INNER + rand(40, 300));
            const base = shoulder(z) - 6;
            const wing = box(rand(40, 80), 3, rand(14, 22));
            wing.rotateZ(rand(0.2, 0.7) * (Math.random() < 0.5 ? 1 : -1));
            wing.rotateY(rand(0, Math.PI));
            wreck.push(at(wing, x, base + rand(6, 16), z));
            const nacelle = new THREE.CylinderGeometry(6, 7, 22, 7);
            nacelle.rotateZ(Math.PI / 2);
            wreck.push(at(nacelle, x + rand(-30, 30), base + 5, z + rand(-30, 30)));
        }
        // Dead colossus torsos, half sunk.
        for (let i = 0; i < 2; i++) {
            const z = z0 - Math.random() * span;
            const x = side * (INNER + rand(120, 360));
            const base = shoulder(z) - 10;
            const torso = box(46, 40, 30);
            torso.rotateZ(side * rand(0.15, 0.45));
            wreck.push(at(torso, x, base + 14, z));
            const headBox = box(18, 14, 16);
            headBox.rotateZ(side * rand(0.2, 0.6));
            wreck.push(at(headBox, x + rand(-40, 40), base + 6, z + rand(20, 60)));
            glow.push(at(box(6, 2, 2), x + rand(-40, 40), base + 8, z + rand(20, 60)));
        }
    }

    // The dead gods of this place: sentinel-class machines, one still on
    // its feet with its core faintly burning, one caught mid-fall against
    // the sky — the pacing sentries below read as their surviving children.
    {
        const z = z0 - rand(300, 700);
        const side = Math.random() < 0.5 ? -1 : 1;
        warMachine(wreck, glow, side * (INNER + rand(180, 300)), z, rand(320, 400));
        const z2 = z0 - rand(900, 1500);
        warMachine(wreck, glow, -side * (INNER + rand(160, 280)), z2, rand(260, 340), -side * 0.28, false);
    }

    // And the ones still walking: sentries pacing their patrol lines.
    const walkers: ActorSpec[] = [];
    for (const side of [-1, 1]) {
        for (let i = 0; i < 2; i++) {
            const z = z0 - ((i + 0.5) / 2) * span + rand(-100, 100);
            walkers.push({
                x: side * (INNER + rand(60, 200)) + trackCurve(z),
                y: shoulder(z) - 2, z,
                amp: rand(14, 26), speed: rand(0.5, 0.9),
                phase: rand(0, Math.PI * 2), scale: rand(2.2, 3.6),
            });
        }
    }
    emit(build, wreck, dark('#20222f'));
    emit(build, glow, basic(spec.b));
    build.actors.push({
        kind: 'walker',
        specs: walkers,
        parts: [
            { geometry: walkerGeometry(), material: dark('#2a2f42') },
            { geometry: walkerEyeGeometry(), material: basic(spec.a) },
        ],
    });
    return build;
};

/* 13 ─ Turbine Titans: wind turbines the size of towers ------------------- */
const windfarm: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const mast: THREE.BufferGeometry[] = [];
    const beacon: THREE.BufferGeometry[] = [];
    const span = z0 - z1;
    for (const side of [-1, 1]) {
        for (let i = 0; i < 2; i++) {
            const z = z0 - ((i + 0.5) / 2) * span + rand(-60, 60);
            const x = side * (INNER + rand(80, 300));
            const base = shoulder(z) - 4;
            const H = rand(240, 340);
            mast.push(at(new THREE.CylinderGeometry(5, 11, H, 7), x, base + H / 2, z));
            mast.push(at(box(16, 12, 30), x, base + H + 4, z));
            beacon.push(at(box(3, 3, 3), x, base + H + 12, z));
            build.rotors.push({
                x: x + trackCurve(z), y: base + H + 4, z,
                speed: rand(0.25, 0.5) * (Math.random() < 0.5 ? -1 : 1),
                phase: rand(0, Math.PI * 2),
                scale: rand(2.6, 3.4), // blades ~90-115 units
            });
        }
    }
    emit(build, mast, dark('#1e2438'));
    emit(build, beacon, basic(spec.b));
    build.beamColor = spec.a;
    return build;
};

/* 14 ─ Gravity Monoliths: inverted pyramids, hovering and turning --------- */
const monoliths: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const pads: THREE.BufferGeometry[] = [];
    const padGlow: THREE.BufferGeometry[] = [];
    const dust: THREE.BufferGeometry[] = [];
    const span = z0 - z1;

    const spinners: ActorSpec[] = [];
    for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
            const z = z0 - ((i + 0.5) / 3) * span + rand(-70, 70);
            const x = side * (INNER + rand(70, 300));
            const base = shoulder(z) - 6;
            const size = rand(40, 80);
            spinners.push({
                x: x + trackCurve(z), y: base + size + rand(50, 90), z,
                amp: 0, speed: rand(0.2, 0.5),
                phase: rand(0, Math.PI * 2), scale: size,
            });
            // The anti-grav pad beneath, and rising dust.
            pads.push(at(new THREE.CylinderGeometry(size * 0.8, size * 0.9, 5, 8), x, base + 2, z));
            padGlow.push(at(new THREE.CylinderGeometry(size * 0.65, size * 0.65, 1.6, 8), x, base + 6, z));
            for (let d = 0; d < 6; d++) {
                dust.push(at(box(1.4, 1.4, 1.4), x + rand(-size, size) * 0.6, base + rand(10, 70), z + rand(-20, 20)));
            }
        }
    }
    emit(build, pads, dark('#1c1a2e'));
    emit(build, padGlow, basic(spec.a, { transparent: true, opacity: 0.5 }));
    emit(build, dust, basic(spec.b, { transparent: true, opacity: 0.6 }));
    build.actors.push({
        kind: 'spinner',
        specs: spinners,
        parts: [
            { geometry: spinnerGeometry(), material: dark('#241d3a') },
            { geometry: spinnerRingGeometry(), material: basic(spec.a) },
        ],
    });
    return build;
};

/* 15 ─ Hellgate: the court of the underworld ------------------------------ */
const arches: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const stone: THREE.BufferGeometry[] = [];
    const glow: THREE.BufferGeometry[] = [];
    const fire: THREE.BufferGeometry[] = [];
    const span = z0 - z1;

    for (let i = 0; i < 4; i++) {
        const z = z0 - ((i + 0.5) / 4) * span;
        const base = trackHeight(z);
        const W = rand(170, 230);
        const H = rand(170, 240);
        for (const side of [-1, 1]) {
            const x = side * W * 0.5;
            // A flared judgement column: base plinth, shaft, capital.
            stone.push(at(box(30, 20, 26), x, base + 6, z));
            stone.push(at(box(20, H, 16), x, base + H / 2 - 4, z));
            stone.push(at(box(34, 14, 28), x, base + H + 3, z));
            // Braziers burning on the capitals.
            fire.push(at(new THREE.SphereGeometry(7, 7, 5), x, base + H + 15, z));
            // Runes crawling up the inner faces.
            for (let r = 0; r < 6; r++) {
                glow.push(at(box(3, 5, 1.4), x - side * 11, base + 24 + r * (H / 7), z));
            }
        }
        // Double lintel, and the horned crest between them.
        stone.push(at(box(W + 44, 16, 20), 0, base + H + 12, z));
        stone.push(at(box(W * 0.7, 12, 16), 0, base + H + 30, z));
        for (const hx of [-W * 0.18, W * 0.18]) {
            const horn = new THREE.ConeGeometry(7, 34, 5);
            horn.rotateZ(hx > 0 ? -0.35 : 0.35);
            stone.push(at(horn, hx, base + H + 48, z));
        }
        // The keeper's face on the lintel: two burning eyes over the lane.
        glow.push(at(box(6, 3, 2), -12, base + H + 5, z));
        glow.push(at(box(6, 3, 2), 12, base + H + 5, z));
        // A hanging judgement lamp under the arch, high above the craft.
        fire.push(at(box(4, 10, 4), 0, base + H - 12, z));
    }
    emit(build, stone, dark('#1c0f16'));
    emit(build, glow, basic(spec.a, { transparent: true, opacity: 0.9 }));
    emit(build, fire, basic(spec.b));
    return build;
};

/* 16 ─ Leviathan Graveyard: drive through the skeleton -------------------- */
const ribcage: Builder = (z0, _z1) => {
    const build = emptyBuild();
    const bone: THREE.BufferGeometry[] = [];
    const glow: THREE.BufferGeometry[] = [];
    const dark0: THREE.BufferGeometry[] = [];
    const mist: THREE.BufferGeometry[] = [];

    // The centrepiece: a whole leviathan skeleton lying along the track —
    // ribs arch OVER the run, vertebrae ride the crown, and the run exits
    // through the skull's jaw. Once per kilometre, plus a flank skeleton.
    const spineStart = z0 - 120;
    const ribCount = 12;
    for (let r = 0; r < ribCount; r++) {
        const z = spineStart - r * 55;
        const R = 118 - Math.abs(r - ribCount / 2) * 5;
        const arch = new THREE.TorusGeometry(R, 7.5, 6, 34, Math.PI);
        arch.translate(trackCurve(z), trackHeight(z) + 2, z);
        bone.push(arch);
        // Vertebra riding the crown.
        bone.push(at(box(22, 16, 30), 0, trackHeight(z) + R + 10, z));
    }
    // The skull. Not a lantern — a face. A vast cranium looming over the
    // track's exit, deep black sockets with green fire burning inside,
    // fangs hanging over the lane, sick green light pooling underneath:
    // the dead cousin of the whale that glides past the abyss tunnel.
    {
        const z = spineStart - ribCount * 55 - 80;
        const y = trackHeight(z);
        // Cranium, brow, cheeks.
        bone.push(at(box(190, 100, 130), 0, y + 165, z));
        bone.push(at(box(200, 22, 40), 0, y + 208, z + 52));
        for (const side of [-1, 1]) {
            bone.push(at(box(34, 60, 50), side * 96, y + 130, z + 20));
            // Jawbones down to the ground, gate-like.
            const jaw = box(24, 130, 26);
            jaw.rotateZ(side * 0.1);
            bone.push(at(jaw, side * 86, y + 60, z + 30));
        }
        // Fangs over the lane — a few, spaced, readable.
        for (let f = -2; f <= 2; f++) {
            const fang = new THREE.ConeGeometry(8, 36, 5);
            fang.rotateX(Math.PI);
            bone.push(at(fang, f * 34, y + 112, z + 58));
        }
        // The sockets: recessed voids, then the green fire inside them —
        // kept at clearly separated depths so nothing z-fights.
        for (const side of [-1, 1]) {
            dark0.push(at(box(46, 34, 8), side * 48, y + 178, z + 58));
            glow.push(at(box(28, 16, 4), side * 48, y + 178, z + 67));
        }
        // Nasal void.
        dark0.push(at(box(16, 26, 6), 0, y + 150, z + 60));
        // A few drifting grave-lights; the face carries the scene alone.
        for (let w = 0; w < 5; w++) {
            mist.push(at(box(1.8, 1.8, 1.8), rand(-120, 120), y + rand(30, 130), z + rand(-40, 70)));
        }
    }
    // A flank skeleton collapsed on one side, half sunk.
    {
        const side = Math.random() < 0.5 ? -1 : 1;
        const cx = side * (INNER + rand(160, 300));
        const zc = z0 - rand(900, 1500);
        for (let r = 0; r < 8; r++) {
            const z = zc - r * 30;
            const R = 70 - Math.abs(r - 4) * 8;
            const arc = new THREE.TorusGeometry(R, 4, 5, 20, Math.PI * 0.7);
            arc.rotateZ(side > 0 ? 0.5 : Math.PI - 0.5 - Math.PI * 0.7);
            arc.translate(cx + trackCurve(z), shoulder(z) - 6, z);
            bone.push(arc);
        }
    }
    emit(build, bone, dark('#5a5f78'));
    emit(build, dark0, basic('#020403'));
    emit(build, glow, basic('#4dff88'));
    emit(build, mist, basic('#39ff77', { transparent: true, opacity: 0.3 }));
    return build;
};

/* 17 ─ Sky Isles: high islands, falling water, airships ------------------- */
const floating: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const rock: THREE.BufferGeometry[] = [];
    const under: THREE.BufferGeometry[] = [];
    const falls: THREE.BufferGeometry[] = [];
    const span = z0 - z1;

    for (const side of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
            const z = z0 - Math.random() * span;
            const x = side * (INNER + rand(40, 340));
            const y = trackHeight(z) + rand(160, 300);
            const w = rand(60, 150);
            const d = rand(60, 150);
            rock.push(at(box(w, rand(16, 30), d), x, y, z));
            const keel = new THREE.ConeGeometry(w * 0.32, rand(40, 90), 5);
            keel.rotateX(Math.PI);
            rock.push(at(keel, x, y - rand(35, 60), z));
            under.push(at(box(w * 0.85, 2.2, d * 0.85), x, y - 11, z));
            // Water pouring off the rim, glowing on the way down.
            for (let f = 0; f < 2; f++) {
                falls.push(at(box(rand(4, 7), rand(70, 130), 2), x + rand(-w, w) * 0.4, y - rand(50, 90), z + d * 0.4));
            }
            // A crown of small spires on top.
            for (let tpee = 0; tpee < 3; tpee++) {
                rock.push(at(new THREE.ConeGeometry(rand(4, 8), rand(14, 30), 5), x + rand(-w, w) * 0.3, y + rand(18, 30), z + rand(-d, d) * 0.3));
            }
        }
    }
    // Airships cruising between the isles.
    const ships: ActorSpec[] = [];
    for (let i = 0; i < 4; i++) {
        const z = z0 - rand(100, 1700);
        const side = Math.random() < 0.5 ? -1 : 1;
        ships.push({
            x: side * (INNER + rand(60, 300)) + trackCurve(z),
            y: trackHeight(z) + rand(200, 340), z,
            amp: rand(20, 40), speed: rand(0.3, 0.6),
            phase: rand(0, Math.PI * 2), scale: rand(2.5, 4),
        });
    }
    emit(build, rock, dark('#182036'));
    emit(build, under, basic(spec.a, { transparent: true, opacity: 0.75 }));
    emit(build, falls, basic(spec.b, { transparent: true, opacity: 0.6 }));
    build.actors.push({
        kind: 'airship',
        specs: ships,
        parts: [
            { geometry: airshipGeometry(), material: dark('#2a2438') },
            { geometry: airshipGlowGeometry(), material: basic(spec.b) },
        ],
    });
    return build;
};

/* 18 ─ Cascade Walls: a canyon of falling light --------------------------- */
const falls: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const cliff: THREE.BufferGeometry[] = [];
    const water: THREE.BufferGeometry[] = [];
    const mist: THREE.BufferGeometry[] = [];
    const rim: THREE.BufferGeometry[] = [];

    // Near-continuous cliff faces on both shoulders, 250-420 tall, every
    // face streaming with ribbons of glowing water into misted pools.
    for (const side of [-1, 1]) {
        for (let z = z0; z > z1; z -= 130) {
            const zc = z - rand(0, 40);
            const x = side * (INNER + rand(50, 130));
            const H = rand(250, 420);
            const W = rand(80, 130);
            const base = shoulder(zc) - 6;
            cliff.push(at(box(rand(50, 80), H, W), x, base + H / 2, zc));
            rim.push(at(box(rand(40, 64), 2.4, W * 0.8), x - side * 12, base + H + 1, zc));
            const fx = x - side * rand(28, 40);
            const ribbons = 3 + Math.floor(Math.random() * 3);
            for (let f = 0; f < ribbons; f++) {
                water.push(at(box(rand(5, 11), H * rand(0.85, 0.98), 2), fx + rand(-W, W) * 0.35, base + H * 0.48, zc + rand(-W, W) * 0.3));
            }
            mist.push(at(box(rand(40, 70), 5, rand(30, 50)), fx, base + 2, zc));
            // A second, upper tier on some cliffs.
            if (Math.random() < 0.5) {
                cliff.push(at(box(40, H * 0.4, W * 0.6), x + side * 20, base + H * 1.18, zc));
                water.push(at(box(7, H * 0.36, 2), fx, base + H * 1.15, zc));
            }
        }
    }
    emit(build, cliff, dark('#14203a'));
    emit(build, water, basic(spec.a, { transparent: true, opacity: 0.75 }));
    emit(build, mist, basic(spec.b, { transparent: true, opacity: 0.35 }));
    emit(build, rim, basic(spec.b, { transparent: true, opacity: 0.5 }));
    return build;
};

/* 19 ─ Spore Hollow: mushrooms the size of towers ------------------------- */
const mushroom: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const stem: THREE.BufferGeometry[] = [];
    const capGlow: THREE.BufferGeometry[] = [];
    const gills: THREE.BufferGeometry[] = [];
    const spores: THREE.BufferGeometry[] = [];
    const span = z0 - z1;

    for (const side of [-1, 1]) {
        // The titans: 150-260 tall, caps like landing pads.
        for (let i = 0; i < 3; i++) {
            const z = z0 - ((i + 0.5) / 3) * span + rand(-80, 80);
            const x = side * (INNER + rand(60, 260));
            const h = rand(150, 260);
            const base = shoulder(z) - 4;
            stem.push(at(new THREE.CylinderGeometry(h * 0.06, h * 0.1, h, 7), x, base + h / 2, z));
            const capR = h * rand(0.32, 0.42);
            const cap = new THREE.SphereGeometry(capR, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2);
            cap.scale(1, 0.5, 1);
            capGlow.push(at(cap, x, base + h, z));
            const gill = new THREE.TorusGeometry(capR * 0.72, 2.6, 5, 22);
            gill.rotateX(Math.PI / 2);
            gills.push(at(gill, x, base + h - 4, z));
        }
        // Undergrowth clusters.
        for (let i = 0; i < 8; i++) {
            const z = z0 - Math.random() * span;
            const x = side * (INNER + rand(10, 320));
            const h = rand(18, 50);
            const base = shoulder(z) - 3;
            stem.push(at(new THREE.CylinderGeometry(2, 3.4, h, 5), x, base + h / 2, z));
            const cap = new THREE.SphereGeometry(h * 0.5, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2);
            cap.scale(1, 0.55, 1);
            capGlow.push(at(cap, x, base + h, z));
        }
        for (let i = 0; i < 20; i++) {
            const z = rand(z1, z0);
            spores.push(at(box(1.3, 1.3, 1.3), side * (INNER + rand(20, 300)), shoulder(z) + rand(15, 220), z));
        }
    }
    emit(build, stem, dark('#201a2e'));
    emit(build, capGlow, basic(spec.a, { transparent: true, opacity: 0.8 }));
    emit(build, gills, basic(spec.b, { transparent: true, opacity: 0.85 }));
    emit(build, spores, basic(spec.b, { transparent: true, opacity: 0.6 }));
    return build;
};

/* 20 ─ The Terminus: the run ends at UTS ---------------------------------- */
const finale: Builder = (z0, z1, spec) => {
    const build = emptyBuild();
    const lawn: THREE.BufferGeometry[] = [];
    const glass: THREE.BufferGeometry[] = [];
    const bands: THREE.BufferGeometry[] = [];
    const signs: THREE.BufferGeometry[] = [];
    const trunks: THREE.BufferGeometry[] = [];
    const canopies: THREE.BufferGeometry[] = [];
    const seams: THREE.BufferGeometry[] = [];
    const lanterns: THREE.BufferGeometry[] = [];
    const portal: THREE.BufferGeometry[] = [];

    // Lawns flanking the final approach, the campus green at night.
    for (let z = z0; z > z1 && z > -37800; z -= 250) {
        const zc = z - 125;
        for (const side of [-1, 1]) {
            lawn.push(at(box(420, 1.2, 252), side * (INNER + 190), trackHeight(zc) - 6, zc));
        }
    }

    // The approach is an avenue, not runway lights: a thin light seam
    // along each edge of the road, ranks of slender pale trees on the
    // lawns, and soft lantern orbs floating between them. Deliberately
    // quieter and warmer than every sector before it.
    for (let z = z0 - 25; z > z1; z -= 50) {
        if (z > -34350 || z < -35690) continue;
        for (const side of [-1, 1]) {
            seams.push(at(box(1.1, 0.6, 52), side * 68, trackHeight(z) + 0.4, z));
        }
    }
    for (let z = z0 - 60; z > z1; z -= 120) {
        if (z > -34400 || z < -35650) continue;
        for (const side of [-1, 1]) {
            const x = side * rand(95, 130);
            const h = rand(26, 38);
            const base = trackHeight(z) - 4;
            trunks.push(at(new THREE.CylinderGeometry(1, 1.6, h, 5), x, base + h / 2, z));
            canopies.push(at(new THREE.SphereGeometry(h * 0.38, 8, 6), x, base + h + 3, z));
            lanterns.push(at(new THREE.SphereGeometry(1.6, 6, 5), side * 78, base + 12, z - 60));
        }
    }
    // A single slim arc marks the campus threshold.
    {
        const zArc = -34420;
        if (z0 >= zArc && z1 <= zArc) {
            const arc = new THREE.TorusGeometry(96, 1.8, 5, 40, Math.PI);
            arc.translate(trackCurve(zArc), trackHeight(zArc) + 2, zArc);
            seams.push(arc);
        }
    }

    // The complex itself, straddling the end of the road.
    const zB = -35800;
    if (z0 >= zB && z1 <= zB) {
        const y = trackHeight(zB);
        const green: THREE.BufferGeometry[] = [];
        const pixelsA: THREE.BufferGeometry[] = [];
        const pixelsB: THREE.BufferGeometry[] = [];

        // ── Podium: a low glass hall with wavy luminous floor plates, the
        // photo's white ribbon floors. Kept low so the tower owns the frame.
        glass.push(at(box(170, 72, 110), -160, y + 36, zB));
        glass.push(at(box(170, 72, 110), 160, y + 36, zB));
        glass.push(at(box(490, 22, 110), 0, y + 83, zB));
        for (const by of [26, 48, 68]) {
            // Wave: each band is segments riding a gentle sine.
            for (let seg = 0; seg < 14; seg++) {
                const sx = -238 + seg * 35;
                if (Math.abs(sx) < 90 && by < 60) continue; // door zone
                pixelsB.push(
                    at(box(33, 2.2, 114), sx, y + by + Math.sin(seg * 1.1 + by) * 2.4, zB),
                );
            }
        }
        // Roof garden: a line of small dark trees along the podium edge.
        for (let tx = -220; tx <= 220; tx += 44) {
            trunks.push(at(new THREE.CylinderGeometry(0.8, 1.2, 8, 5), tx, y + 98, zB + 48));
            canopies.push(at(new THREE.SphereGeometry(5, 7, 5), tx, y + 106, zB + 48));
        }

        // ── The door: a calm portal at the podium's centre...
        for (const side of [-1, 1]) {
            glass.push(at(box(24, 60, 40), side * 82, y + 30, zB + 38));
        }
        glass.push(at(box(188, 14, 40), 0, y + 67, zB + 38));
        portal.push(at(box(132, 52, 4), 0, y + 30, zB + 8));
        bands.push(at(box(136, 2.6, 40), 0, y + 60, zB + 38));
        // ...with shallow steps spilling onto the plaza.
        for (let st = 0; st < 3; st++) {
            glass.push(at(box(150 + st * 26, 2.2, 10), 0, y + 4 - st * 2.2, zB + 44 + st * 10));
        }

        // ── The LED matrix wall over the door: the green pixel sign, with
        // the shield and white-hot UTS letters.
        {
            const wy = y + 130;
            glass.push(at(box(230, 62, 8), 0, wy, zB + 30));
            // The shield, left of the letters: the crest proper — a dark
            // pointed shield carrying white marks: diamond, tee, the
            // interlocking weave, chevrons below.
            // The crest, done as the real one reads: a solid glowing
            // shield with the marks as dark negative space cut into it —
            // white light, matching the letters beside it.
            const sx0 = -42;
            const crestGlow: THREE.BufferGeometry[] = [];
            const crestCut: THREE.BufferGeometry[] = [];
            crestGlow.push(at(box(42, 52, 2), sx0, wy + 2, zB + 34));
            const tip = new THREE.ConeGeometry(21.5, 15, 4);
            tip.rotateX(Math.PI);
            tip.rotateY(Math.PI / 4);
            crestGlow.push(at(tip, sx0, wy - 27, zB + 34));
            const mark = (
                mx: number,
                my: number,
                w: number,
                h: number,
                rot = 0,
            ) => {
                const m = box(w, h, 1.4);
                if (rot) m.rotateZ(rot);
                crestCut.push(at(m, sx0 + mx, wy + 2 + my, zB + 35.6));
            };
            mark(0, 17, 7, 7, Math.PI / 4); // diamond
            mark(0, 8.5, 25, 4.8); // tee bar
            mark(0, 3.2, 4.8, 6.5); // tee stem
            mark(-4.3, -5.5, 21, 4.8, Math.PI / 4); // weave /
            mark(4.3, -5.5, 21, 4.8, -Math.PI / 4); // weave \
            mark(-7.5, -16.5, 11, 3.8, Math.PI / 4); // chevrons
            mark(0, -16.5, 11, 3.8, -Math.PI / 4);
            mark(7.5, -16.5, 11, 3.8, Math.PI / 4);
            emit(build, crestGlow, basic('#e8f4ff'));
            emit(build, crestCut, basic('#0a1420'));
            const u = 4.2;
            glyph(signs, 'U', 6 + trackCurve(zB), wy, zB + 35, u);
            glyph(signs, 'T', 26 + trackCurve(zB), wy, zB + 35, u);
            glyph(signs, 'S', 46 + trackCurve(zB), wy, zB + 35, u);
        }

        // ── The tower: wandering glass storeys with hairline light plates
        // and the warm atrium notch bitten out of the face.
        // An aligned taper — storeys narrow as they rise, faces flush, so
        // the silhouette reads deliberate instead of jumbled.
        let ty = y + 96;
        for (let f = 0; f < 8; f++) {
            const w = 190 - f * 12;
            glass.push(at(box(w, 30, 88), 0, ty + 15, zB - 30));
            bands.push(at(box(w * 0.97, 1.6, 89), 0, ty + 29, zB - 30));
            ty += 30;
        }


        // ── The brutalist tower to the left, banded, its own sign lit.
        glass.push(at(box(92, 250, 82), -295, y + 125, zB - 70));
        for (let f = 0; f < 7; f++) {
            // Stops short of the crown, so no band crosses the carved sign.
            bands.push(at(box(78, 1.4, 84), -295, y + 34 + f * 28, zB - 70));
        }
        {
            const u = 4.4;
            glyph(signs, 'U', -313 + trackCurve(zB), y + 230, zB - 26, u);
            glyph(signs, 'T', -295 + trackCurve(zB), y + 230, zB - 26, u);
            glyph(signs, 'S', -277 + trackCurve(zB), y + 230, zB - 26, u);
        }

        // ── Building 11's ghost on the right: the angular block with
        // three green light scars cut across its face and its own lit sign.
        glass.push(at(box(105, 170, 88), 405, y + 85, zB - 85));
        for (const [sx, tilt] of [[-26, -0.34], [2, -0.3], [30, -0.26]] as const) {
            const slash = box(4.5, 132, 2.4);
            slash.rotateZ(tilt);
            green.push(at(slash, 405 + sx, y + 88, zB - 40));
        }
        for (let f = 0; f < 5; f++) {
            bands.push(at(box(92, 1.2, 90), 405, y + 26 + f * 32, zB - 85));
        }
        // The sign lives on the left wall, lit, reading down the length of
        // the building toward the run — not a placard on the roof.
        {
            const u = 3.8;
            const wallX = 405 - 53.5 + trackCurve(zB);
            // Rotated -90deg so the letter faces face the track; reading
            // direction runs far-to-near, which is left-to-right on screen.
            const letter = (l: 'U' | 'T' | 'S', lz: number) => {
                const parts: THREE.BufferGeometry[] = [];
                glyph(parts, l, 0, 0, 0, u);
                for (const g of parts) {
                    g.rotateY(-Math.PI / 2);
                    // Centred on the wall's own midpoint — anchored off the
                    // door position it slid past the corner.
                    g.translate(wallX, y + 148, zB - 85 + lz);
                    signs.push(g);
                }
            };
            letter('U', -16);
            letter('T', 0);
            letter('S', 16);
        }

        // Over-unit green so the scars cross the bloom threshold and burn.
        emit(
            build,
            green,
            new THREE.MeshBasicMaterial({
                color: new THREE.Color('#4dff88').multiplyScalar(1.25),
                toneMapped: false,
            }),
        );
        emit(build, pixelsA, basic('#39e673', { transparent: true, opacity: 0.85 }));
        emit(build, pixelsB, basic('#d5ffe6', { transparent: true, opacity: 0.7 }));

    }

    emit(build, lawn, dark('#0b2018'));
    emit(build, glass, dark('#141a2c'));
    emit(build, bands, basic('#e8f4ff', { transparent: true, opacity: 0.8 }));
    emit(build, signs, basic(spec.a));
    emit(build, trunks, dark('#232a3c'));
    emit(build, canopies, dark('#16301f'));
    emit(build, seams, basic('#ffe9c4', { transparent: true, opacity: 0.8 }));
    emit(build, lanterns, basic('#ffe9c4'));
    emit(build, portal, basic('#ffe9c4'));
    return build;
};

const BUILDERS: Record<SceneSpec['kind'], Builder> = {
    city,
    ocean,
    tunnel,
    harbor,
    mountains,
    rings,
    colossi,
    glacier,
    lattice,
    titangrove,
    forest,
    ruins,
    windfarm,
    monoliths,
    arches,
    ribcage,
    floating,
    falls,
    mushroom,
    finale,
};

const buildTile = (index: number): TileBuild => {
    const z0 = -index * planeSize;
    const z1 = -(index + 1) * planeSize;
    const spec = sceneAt((z0 + z1) / 2);
    return BUILDERS[spec.kind](z0, z1, spec);
};

/* ------------------------------------------------------------ component -- */

const SceneryTile = ({ index }: { index: number }) => {
    const build = useMemo(() => buildTile(index), [index]);

    return (
        <group>
            {build.pieces.map((piece, i) => (
                <mesh key={i} geometry={piece.geometry} material={piece.material} />
            ))}
            {build.actors.map((group, i) => (
                <ActorLayer key={`actor-${i}`} group={group} />
            ))}
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
