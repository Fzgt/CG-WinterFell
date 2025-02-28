// .github/workflows/collect-renderer-metrics.js
const puppeteer = require('puppeteer');
const fs = require('fs');

async function collectRendererMetrics() {
    console.log('Launching browser to collect 3D renderer metrics...');
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--use-gl=egl', '--no-sandbox', '--disable-setuid-sandbox', '--enable-webgpu']
    });

    try {
        const page = await browser.newPage();

        // 注入通用性能监控脚本 - 支持WebGL和WebGPU
        await page.evaluateOnNewDocument(() => {
            window.performanceMetrics = {
                frames: [],
                drawCalls: 0,
                triangles: 0,
                lastTime: 0,
                memoryInfo: null,
                rendererType: null, // 'webgl', 'webgl2', or 'webgpu'
                rendererInfo: {}
            };

            // 检测渲染器类型的函数
            window.detectRendererType = () => {
                // 检查Three.js渲染器
                if (window.renderer && window.renderer.constructor) {
                    const rendererName = window.renderer.constructor.name;
                    if (rendererName === 'WebGLRenderer') {
                        return window.renderer.capabilities.isWebGL2 ? 'webgl2' : 'webgl';
                    } else if (rendererName === 'WebGPURenderer') {
                        return 'webgpu';
                    }
                }

                // 检查Three.js全局变量
                if (window.THREE) {
                    if (window.THREE.REVISION) {
                        window.performanceMetrics.rendererInfo.threeVersion = window.THREE.REVISION;
                    }

                    // 尝试找到场景中的渲染器实例
                    if (window.scene && window.scene.renderer) {
                        const r = window.scene.renderer;
                        return r.capabilities && r.capabilities.isWebGL2 ? 'webgl2' :
                            (r.type === 'WebGPURenderer' ? 'webgpu' : 'webgl');
                    }
                }

                // 回退检测：检查是否有WebGPU上下文
                if (navigator.gpu) {
                    try {
                        const canvas = document.querySelector('canvas');
                        if (canvas && canvas.getContext('webgpu')) {
                            return 'webgpu';
                        }
                    } catch (e) {
                        console.log('WebGPU detection failed:', e);
                    }
                }

                // 回退检测：检查WebGL上下文
                try {
                    const canvas = document.querySelector('canvas');
                    if (canvas) {
                        if (canvas.getContext('webgl2')) {
                            return 'webgl2';
                        } else if (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) {
                            return 'webgl';
                        }
                    }
                } catch (e) {
                    console.log('WebGL detection failed:', e);
                }

                return 'unknown';
            };

            // 根据渲染器类型设置不同的钩子
            window.setupRendererHooks = () => {
                const rendererType = window.detectRendererType();
                window.performanceMetrics.rendererType = rendererType;
                console.log(`Detected renderer: ${rendererType}`);

                if (rendererType === 'webgl' || rendererType === 'webgl2') {
                    // 为WebGL设置钩子
                    setupWebGLHooks();
                } else if (rendererType === 'webgpu') {
                    // 为WebGPU设置钩子
                    setupWebGPUHooks();
                }
            };

            // WebGL钩子
            function setupWebGLHooks() {
                // 拦截WebGLRenderingContext
                if (typeof WebGLRenderingContext !== 'undefined') {
                    const origDrawArrays = WebGLRenderingContext.prototype.drawArrays;
                    WebGLRenderingContext.prototype.drawArrays = function (mode, first, count) {
                        window.performanceMetrics.drawCalls++;
                        if (mode === this.TRIANGLES) {
                            window.performanceMetrics.triangles += count / 3;
                        }
                        return origDrawArrays.call(this, mode, first, count);
                    };

                    const origDrawElements = WebGLRenderingContext.prototype.drawElements;
                    WebGLRenderingContext.prototype.drawElements = function (mode, count, type, offset) {
                        window.performanceMetrics.drawCalls++;
                        if (mode === this.TRIANGLES) {
                            window.performanceMetrics.triangles += count / 3;
                        }
                        return origDrawElements.call(this, mode, count, type, offset);
                    };
                }

                // 拦截WebGL2RenderingContext
                if (typeof WebGL2RenderingContext !== 'undefined') {
                    const origDrawArrays = WebGL2RenderingContext.prototype.drawArrays;
                    WebGL2RenderingContext.prototype.drawArrays = function (mode, first, count) {
                        window.performanceMetrics.drawCalls++;
                        if (mode === this.TRIANGLES) {
                            window.performanceMetrics.triangles += count / 3;
                        }
                        return origDrawArrays.call(this, mode, first, count);
                    };

                    const origDrawElements = WebGL2RenderingContext.prototype.drawElements;
                    WebGL2RenderingContext.prototype.drawElements = function (mode, count, type, offset) {
                        window.performanceMetrics.drawCalls++;
                        if (mode === this.TRIANGLES) {
                            window.performanceMetrics.triangles += count / 3;
                        }
                        return origDrawElements.call(this, mode, count, type, offset);
                    };
                }

                // 收集WebGL上下文信息
                try {
                    const canvas = document.querySelector('canvas');
                    if (canvas) {
                        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
                        if (gl) {
                            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                            if (debugInfo) {
                                window.performanceMetrics.rendererInfo.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
                                window.performanceMetrics.rendererInfo.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                            }
                            window.performanceMetrics.rendererInfo.version = gl.getParameter(gl.VERSION);
                            window.performanceMetrics.rendererInfo.shadingLanguageVersion = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
                        }
                    }
                } catch (e) {
                    console.error('Error collecting WebGL info:', e);
                }
            }

            // WebGPU钩子
            function setupWebGPUHooks() {
                // 由于WebGPU的API结构不同，我们需要一种不同的方法
                // 尝试钩住Three.js的WebGPURenderer
                if (window.THREE && window.THREE.WebGPURenderer) {
                    const origRender = window.THREE.WebGPURenderer.prototype.render;
                    window.THREE.WebGPURenderer.prototype.render = function (scene, camera) {
                        // 此处可能需要访问内部属性来获取绘制调用数量
                        window.performanceMetrics.drawCalls++;

                        // 获取场景中的三角形数量（近似）
                        if (scene && scene.children) {
                            scene.children.forEach(countTriangles);
                        }

                        return origRender.call(this, scene, camera);
                    };
                }

                // 或者直接从Three.js信息中获取
                if (window.renderer && window.renderer.info) {
                    // 定期从Three.js信息中提取数据
                    setInterval(() => {
                        const info = window.renderer.info;
                        if (info.render) {
                            window.performanceMetrics.drawCalls = info.render.calls || 0;
                            window.performanceMetrics.triangles = info.render.triangles || 0;
                        }
                    }, 1000);
                }

                // 收集WebGPU适配器信息
                if (navigator.gpu) {
                    navigator.gpu.requestAdapter().then(adapter => {
                        if (adapter) {
                            adapter.requestAdapterInfo().then(info => {
                                window.performanceMetrics.rendererInfo.vendor = info.vendor;
                                window.performanceMetrics.rendererInfo.architecture = info.architecture;
                            }).catch(console.error);
                        }
                    }).catch(console.error);
                }
            }

            // 辅助函数：计算模型的三角形数量
            function countTriangles(obj) {
                if (obj.isMesh && obj.geometry) {
                    const geom = obj.geometry;
                    if (geom.index) {
                        window.performanceMetrics.triangles += geom.index.count / 3;
                    } else if (geom.attributes && geom.attributes.position) {
                        window.performanceMetrics.triangles += geom.attributes.position.count / 3;
                    }
                }

                if (obj.children) {
                    obj.children.forEach(countTriangles);
                }
            }

            // 收集帧率数据
            let rafId;
            const collectFrameData = (timestamp) => {
                if (window.performanceMetrics.lastTime > 0) {
                    const frameTime = timestamp - window.performanceMetrics.lastTime;
                    const fps = 1000 / frameTime;
                    window.performanceMetrics.frames.push({
                        time: timestamp,
                        fps: fps,
                        drawCalls: window.performanceMetrics.drawCalls
                    });

                    // 每帧重置绘制调用计数
                    window.performanceMetrics.drawCalls = 0;
                }

                window.performanceMetrics.lastTime = timestamp;

                // 尝试获取内存信息（如果浏览器支持）
                if (performance.memory) {
                    window.performanceMetrics.memoryInfo = {
                        totalJSHeapSize: performance.memory.totalJSHeapSize,
                        usedJSHeapSize: performance.memory.usedJSHeapSize
                    };
                }

                // 检查是否有额外的Three.js性能监视器
                if (window.stats && window.stats.update) {
                    try {
                        const statsPanel = window.stats.domElement.querySelector(".ms");
                        if (statsPanel) {
                            const msText = statsPanel.textContent || "0.0";
                            const ms = parseFloat(msText);
                            if (!isNaN(ms)) {
                                window.performanceMetrics.frames[window.performanceMetrics.frames.length - 1].msPerFrame = ms;
                            }
                        }
                    } catch (e) {
                        console.error('Error reading stats panel:', e);
                    }
                }

                rafId = requestAnimationFrame(collectFrameData);
            };

            // 启动性能监控
            window.startPerformanceMonitoring = () => {
                window.performanceMetrics.frames = [];
                window.performanceMetrics.lastTime = 0;
                window.setupRendererHooks();
                rafId = requestAnimationFrame(collectFrameData);

                // 检测游戏引擎
                if (window.BABYLON) {
                    window.performanceMetrics.engine = 'babylon.js';
                } else if (window.THREE) {
                    window.performanceMetrics.engine = 'three.js';
                } else if (window.PIXI) {
                    window.performanceMetrics.engine = 'pixi.js';
                }
            };

            // 停止性能监控
            window.stopPerformanceMonitoring = () => {
                cancelAnimationFrame(rafId);
                return window.performanceMetrics;
            };
        });

        // 访问您的应用
        await page.goto('http://localhost:3000', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        console.log('Page loaded, waiting for 3D renderer to initialize...');

        // 等待渲染器初始化
        await page.waitForFunction(() => {
            return window.THREE !== undefined ||
                window.BABYLON !== undefined ||
                window.PIXI !== undefined ||
                document.querySelector('canvas') !== null;
        }, { timeout: 30000 });

        // 开始监控
        await page.evaluate(() => {
            console.log('Starting renderer performance monitoring...');
            window.startPerformanceMonitoring();
        });

        // 等待收集一段时间的数据（30秒）
        console.log('Collecting performance data for 30 seconds...');
        await page.waitForTimeout(30000);

        // 停止监控并获取结果
        const metrics = await page.evaluate(() => {
            return window.stopPerformanceMonitoring();
        });

        // 处理结果
        console.log('Processing renderer performance data...');
        const fpsValues = metrics.frames.map(frame => frame.fps).filter(fps => !isNaN(fps) && isFinite(fps));

        // 过滤异常值（比如超过1000 FPS的不合理值）
        const validFpsValues = fpsValues.filter(fps => fps > 0 && fps < 1000);

        const avgFps = validFpsValues.length > 0
            ? validFpsValues.reduce((sum, fps) => sum + fps, 0) / validFpsValues.length
            : 0;

        const minFps = validFpsValues.length > 0
            ? Math.min(...validFpsValues)
            : 0;

        // 获取最后一分钟的平均抽样
        const recentFrames = metrics.frames.slice(-60);
        const recentAvgDrawCalls = recentFrames.length > 0
            ? recentFrames.reduce((sum, frame) => sum + (frame.drawCalls || 0), 0) / recentFrames.length
            : 0;

        // 内存使用（如果有）
        let memoryUsage = null;
        if (metrics.memoryInfo) {
            memoryUsage = Math.round(metrics.memoryInfo.usedJSHeapSize / (1024 * 1024));
        }

        // 准备结果数据
        const results = {
            engine: metrics.engine || 'unknown',
            rendererType: metrics.rendererType || 'unknown',
            rendererInfo: metrics.rendererInfo || {},
            avgFps: avgFps.toFixed(2),
            minFps: minFps.toFixed(2),
            drawCalls: Math.round(recentAvgDrawCalls),
            triangles: Math.round(metrics.triangles || 0),
            memoryUsage: memoryUsage ? `${memoryUsage}` : 'Not available'
        };

        console.log('Renderer Performance Results:', results);

        // 读取现有的Lighthouse结果
        let lightouseResults = {};
        try {
            if (fs.existsSync('./lighthouse-results.json')) {
                lightouseResults = JSON.parse(fs.readFileSync('./lighthouse-results.json', 'utf8'));
            }
        } catch (error) {
            console.error('Error reading existing results:', error);
        }

        // 添加渲染器结果
        lightouseResults.renderer = results;

        // 保存合并后的结果
        fs.writeFileSync('./lighthouse-results.json', JSON.stringify(lightouseResults, null, 2));
        console.log('Renderer metrics saved to lighthouse-results.json');

    } catch (error) {
        console.error('Error collecting renderer metrics:', error);
    } finally {
        await browser.close();
    }
}

// 运行收集脚本
collectRendererMetrics().catch(console.error);