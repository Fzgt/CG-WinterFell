/**
 * Who is still drawing an attribute the renderer has already released?
 *
 * The validation error names a pipeline and a slot, not an object, so it says
 * nothing about *which* mesh is broken. This walks the live scene instead and
 * asks, of every attribute on every drawable, whether the renderer still holds
 * a record and the backend still holds a GPUBuffer. A mesh that is in the
 * scene, is visible, and whose attribute has no buffer is the victim — by
 * construction, not by inference.
 *
 * It also answers the question the victim implies: how did that attribute get
 * released while someone was still using it? Two candidates are checked
 * directly:
 *
 *   - the same BufferAttribute object hangs off more than one geometry, so
 *     disposing one geometry frees a buffer another still draws from;
 *   - the release itself happens while a live mesh references the attribute,
 *     which the delete hook records at the moment it fires.
 *
 *   npm run dev    (or preview)
 *   node bench/attrowner.mjs [--seconds 120] [--url http://localhost:5173]
 */

const args = process.argv.slice(2);
const getArg = (n, d) => {
    const i = args.indexOf(`--${n}`);
    return i === -1 ? d : args[i + 1];
};
const BASE_URL = getArg('url', 'http://localhost:5173');
const SECONDS = Number(getArg('seconds', 120));
const SETTLE_MS = 6000;
const PERF = args.includes('--no-perf') ? '' : '&perf=1';

const { chromium } = await import('playwright');

const INSTRUMENT = () => {
    window.__diag = {
        errors: [],
        deletes: 0,
        deleteTimes: [],
        mismatches: [],
        drawHookError: null,
        deleteWithLiveUser: [],
        installed: false,
        owners: null,
        scans: [],
    };

    const origRequest = GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice = async function (...a) {
        const device = await origRequest.apply(this, a);
        device.addEventListener('uncapturederror', e => {
            window.__diag.errors.push({
                t: performance.now(),
                msg: String(e.error.message).slice(0, 200),
            });
        });
        return device;
    };

    // The renderer and scene are published by PerfProbe under ?perf=1.
    const describe = obj => ({
        type: obj.type,
        mat: obj.material
            ? `${obj.material.type}_${obj.material.id}`
            : null,
        geom: obj.geometry ? obj.geometry.uuid.slice(0, 8) : null,
        parent: obj.parent ? obj.parent.type : null,
    });

    const attrsOf = obj => {
        const g = obj.geometry;
        if (!g) return [];
        const list = Object.entries(g.attributes);
        if (g.index) list.push(['index', g.index]);
        if (obj.instanceMatrix) list.push(['instanceMatrix', obj.instanceMatrix]);
        return list;
    };

    const install = () => {
        const gl = window.__gl;
        const scene = window.__scene;
        if (!gl || !scene || window.__diag.installed) return;
        if (!gl._attributes || !gl.backend) return;
        window.__diag.installed = true;
        window.__diag.owners = new WeakMap();

        // Every mesh in the scene that still points at this exact attribute
        // object at the moment the renderer lets go of it.
        const liveUsers = attribute => {
            const users = [];
            scene.traverse(obj => {
                for (const [name, a] of attrsOf(obj)) {
                    if (a === attribute) users.push({ slot: name, ...describe(obj) });
                }
            });
            return users;
        };

        // `RenderObject.getAttributes` skips any attribute the shader asked
        // for that the geometry does not carry — silently, with a `continue`.
        // The pipeline still declares the slot, so the draw goes out one
        // vertex buffer short and fails validation on every frame that object
        // is visible. Comparing the two counts at draw time names the object
        // the error message refuses to.
        const seen = new Set();
        const origDraw = gl.backend.draw.bind(gl.backend);
        gl.backend.draw = (renderObject, info) => {
            try {
                const state = renderObject.getNodeBuilderState();
                const wants = state.nodeAttributes.map(a => a.name);
                const got = renderObject.getVertexBuffers();
                const unbound = got.filter(b => {
                    const rec = gl.backend.has(b) ? gl.backend.get(b) : null;
                    return !rec || !rec.buffer;
                });
                if (wants.length !== got.length || unbound.length) {
                    const g = renderObject.geometry;
                    const mat = `${renderObject.material.type}_${renderObject.material.id}`;
                    const key = `${mat}|${g.uuid}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        let root = renderObject.object;
                        while (root.parent) root = root.parent;
                        window.__diag.mismatches.push({
                            t: performance.now(),
                            material: mat,
                            wants,
                            has: Object.keys(g.attributes),
                            vertexBuffers: got.length,
                            unboundBuffers: unbound.length,
                            unboundItemSizes: unbound.map(b => b.itemSize),
                            object: renderObject.object.type,
                            instanced: !!renderObject.object.isInstancedMesh,
                            vertices: g.attributes.position
                                ? g.attributes.position.count
                                : null,
                            root: root === scene ? 'main scene' : root.type,
                            // The stale-swap signature: setGeometry() cleared
                            // `attributes` but left `vertexBuffers` pointing at
                            // the geometry that was just released.
                            attributesCleared: renderObject.attributes === null,
                            geometryMatchesObject:
                                renderObject.geometry === renderObject.object.geometry,
                            needsRefresh: gl._nodes.needsRefresh(renderObject),
                        });
                    }
                }
            } catch (error) {
                window.__diag.drawHookError = String(error).slice(0, 200);
            }
            return origDraw(renderObject, info);
        };

        const prev = gl._attributes.delete.bind(gl._attributes);
        gl._attributes.delete = attribute => {
            window.__diag.deletes += 1;
            window.__diag.deleteTimes.push(performance.now());
            const users = liveUsers(attribute);
            if (users.length) {
                window.__diag.deleteWithLiveUser.push({
                    t: performance.now(),
                    itemSize: attribute && attribute.itemSize,
                    count: attribute && attribute.count,
                    users: users.slice(0, 6),
                    userCount: users.length,
                });
            }
            return prev(attribute);
        };
    };

    // An attribute with no buffer is not evidence on its own: the shader may
    // simply never read it (an unused uv is never uploaded), or the mesh may
    // not have been drawn yet. What cannot be innocent is an attribute that
    // *had* a buffer and lost it while its mesh stayed in the scene.
    const everHadBuffer = new WeakSet();
    let pending = new Map();

    const sweep = () => {
        install();
        const gl = window.__gl;
        const scene = window.__scene;
        if (!gl || !scene || !gl._attributes || !gl.backend) return;

        const now = new Map();
        const shared = [];
        scene.traverse(obj => {
            const g = obj.geometry;
            if (!g || !obj.visible) return;
            for (const [name, a] of attrsOf(obj)) {
                let owners = window.__diag.owners.get(a);
                if (!owners) {
                    owners = new Set();
                    window.__diag.owners.set(a, owners);
                }
                owners.add(g.uuid);
                if (owners.size > 1) {
                    shared.push({
                        slot: name,
                        owners: [...owners].map(u => u.slice(0, 8)),
                        ...describe(obj),
                    });
                }
                const inRenderer = gl._attributes.has(a);
                const inBackend = gl.backend.has(a);
                const buffer = inBackend ? gl.backend.get(a).buffer : undefined;
                if (buffer) everHadBuffer.add(a);
                if (everHadBuffer.has(a) && (!inRenderer || !buffer)) {
                    const key = `${g.uuid}|${name}`;
                    now.set(key, {
                        slot: name,
                        inRenderer,
                        inBackend,
                        itemSize: a.itemSize,
                        count: a.count,
                        ...describe(obj),
                    });
                }
            }
        });

        const confirmed = [];
        for (const [key, row] of now) if (pending.has(key)) confirmed.push(row);
        pending = now;

        window.__diag.scans.push({
            t: performance.now(),
            confirmed: confirmed.slice(0, 12),
            confirmedCount: confirmed.length,
            shared: shared.slice(0, 12),
            sharedCount: shared.length,
        });
    };

    setInterval(sweep, 1000);
};

const browser = await chromium.launch({
    args: [
        '--enable-unsafe-webgpu',
        '--enable-features=Vulkan',
        '--use-angle=default',
        '--ignore-gpu-blocklist',
    ],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript(INSTRUMENT);
await page.goto(`${BASE_URL}/?immortal=1${PERF}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.start-button', { timeout: 60000 });
await page.click('.start-button');
await page.waitForTimeout(SETTLE_MS);

const t0 = await page.evaluate(() => performance.now());
await page.waitForTimeout(SECONDS * 1000);

const out = await page.evaluate(start => {
    const d = window.__diag;
    const scans = d.scans.filter(s => s.t >= start);
    const victims = new Map();
    let sharedTotal = 0;
    const sharedRows = new Map();
    for (const s of scans) {
        sharedTotal += s.sharedCount;
        for (const r of s.shared) sharedRows.set(`${r.geom}|${r.slot}`, r);
        for (const r of s.confirmed) victims.set(`${r.geom}|${r.slot}`, r);
    }
    const errs = d.errors.filter(e => e.t >= start);
    const bucket = (times, label) => {
        const h = {};
        for (const t of times) {
            const s = Math.floor((t - start) / 1000);
            if (s < 0) continue;
            h[s] = (h[s] || 0) + 1;
        }
        return h;
    };
    const pipelines = {};
    for (const e of errs) {
        const m = e.msg.match(/\[RenderPipeline '([^']+)'\]/);
        const k = m ? m[1] : e.msg.slice(0, 60);
        pipelines[k] = (pipelines[k] || 0) + 1;
    }
    return {
        mismatches: d.mismatches,
        drawHookError: d.drawHookError,
        installed: d.installed,
        errorsPerSecond: bucket(errs.map(e => e.t)),
        deletesPerSecond: bucket(d.deleteTimes),
        pipelines,
        sampleMsgs: [...new Set(errs.map(e => e.msg.slice(0, 160)))].slice(0, 6),
        errors: errs.length,
        deletes: d.deletes,
        deleteWithLiveUser: d.deleteWithLiveUser
            .filter(x => x.t >= start)
            .slice(0, 10),
        deleteWithLiveUserCount: d.deleteWithLiveUser.filter(x => x.t >= start).length,
        scanCount: scans.length,
        victims: [...victims.values()],
        sharedTotal,
        shared: [...sharedRows.values()],
        bench: window.__bench?.report?.(),
    };
}, t0);

console.log(`url flags: immortal=1${PERF}`);
console.log('render objects drawn with a slot the pipeline needs and the draw does not bind:');
console.dir(out.mismatches, { depth: 6 });
if (out.drawHookError) console.log('draw hook error:', out.drawHookError);
console.log('errors per second:', JSON.stringify(out.errorsPerSecond));
console.log('deletes per second:', JSON.stringify(out.deletesPerSecond));
console.log('failing pipelines:', JSON.stringify(out.pipelines, null, 1));
console.log('distinct messages:'); console.dir(out.sampleMsgs, { depth: 3 });
console.log(
    `installed: ${out.installed}   errors: ${out.errors}   attribute deletes: ${out.deletes}   sweeps: ${out.scanCount}`,
);
console.log(
    `\nreleases that happened while a live mesh still referenced the attribute: ${out.deleteWithLiveUserCount}`,
);
console.dir(out.deleteWithLiveUser, { depth: 6 });
console.log(`\nattribute objects owned by more than one geometry: ${out.sharedTotal}`);
console.dir(out.shared, { depth: 5 });
console.log(`\nin-scene drawables with no GPU buffer (seen twice running): ${out.victims.length}`);
console.dir(out.victims, { depth: 5 });
console.log('\nframeMs:', out.bench?.frameMs, 'stalls:', out.bench?.stalls);
console.log('geometries:', out.bench?.geometries, '\ntextures:', out.bench?.textures, '\ndrawCalls:', out.bench?.drawCalls, '\ndistance:', out.bench?.distanceTravelled);

await browser.close();
