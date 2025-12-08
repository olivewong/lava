/// <reference types="@webgpu/types" />
import { shaderParamDefs, getDefaultParams } from './params.js';
import { initAudio } from './audio.js';
import { createShape, drawShapeOnCanvas } from './projection.js';
async function initWebGPU() {
    const canvas = document.getElementById('canvas');
    if (!canvas)
        throw new Error('Canvas not found');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter)
        throw new Error('WebGPU not supported');
    const device = await adapter.requestDevice();
    const context = canvas.getContext('webgpu');
    if (!context)
        throw new Error('WebGPU context not available');
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format });
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
    return { device, context, format };
}
async function loadShader(name) {
    const [commonResponse, shaderResponse] = await Promise.all([
        fetch('shaders/common.wgsl'),
        fetch(`shaders/${name}.wgsl`),
    ]);
    if (!shaderResponse.ok)
        throw new Error(`Failed to load shader: ${name}`);
    const commonCode = commonResponse.ok ? await commonResponse.text() : '';
    const shaderCode = await shaderResponse.text();
    return commonCode + '\n' + shaderCode;
}
function createUniformBuffer(device, resolution, time, params) {
    const buffer = device.createBuffer({
        size: 32, // vec2<f32> (8) + f32 time (4) + f32 hue (4) + f32 speed (4) + f32 param1 (4) + f32 param2 (4) + f32 pad (4) = 32 bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const data = new Float32Array([
        resolution[0], resolution[1], // vec2<f32> resolution
        time, // f32 time
        params.hue, // f32 hue
        params.speed, // f32 speed
        params.size, // f32 param1 (size)
        params.sparkliness, // f32 param2 (sparkliness or unused)
        0.0, // f32 pad
    ]);
    device.queue.writeBuffer(buffer, 0, data);
    return buffer;
}
function createRenderPipeline(device, format, shaderCode) {
    const module = device.createShaderModule({ code: shaderCode });
    return device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module,
            entryPoint: 'vs',
        },
        fragment: {
            module,
            entryPoint: 'fs',
            targets: [{ format }],
        },
    });
}
function getShaderDisplayName(filename) {
    return filename.replace(/_/g, ' ');
}
async function getAvailableShaders() {
    // for now, hardcode. could fetch a manifest or scan directory in the future
    return ['metaballs', 'pool_reflections', 'sun', 'night_sky'];
}
function showError() {
    const errorMsg = document.getElementById('error-message');
    if (errorMsg)
        errorMsg.style.display = 'block';
    const canvas = document.getElementById('canvas');
    if (canvas)
        canvas.style.display = 'none';
    const select = document.getElementById('shader-select');
    if (select)
        select.style.display = 'none';
}
async function main() {
    if (!navigator.gpu) {
        showError();
        return;
    }
    let device;
    let context;
    let format;
    try {
        const result = await initWebGPU();
        device = result.device;
        context = result.context;
        format = result.format;
    }
    catch (error) {
        showError();
        return;
    }
    const canvas = document.getElementById('canvas');
    const drawCanvas = document.getElementById('draw-canvas');
    const select = document.getElementById('shader-select');
    const paramsPanel = document.getElementById('params-panel');
    const paramsToggle = document.getElementById('params-toggle');
    const musicToggle = document.getElementById('music-toggle');
    const projectionToggle = document.getElementById('projection-toggle');
    const projectionToolbar = document.getElementById('projection-toolbar');
    const shapePanel = document.getElementById('shape-panel');
    const toolRectangle = document.getElementById('tool-rectangle');
    let currentShader = 'metaballs';
    let currentParams = getDefaultParams(currentShader);
    let paramMusicConfig = {};
    let pipeline = null;
    let uniformBuffer = null;
    let isMusicMode = false;
    let audioAnalysis = { loudness: 0 };
    let stopAudio = null;
    // projection mapping state
    let isProjectionMode = false;
    let currentTool = 'rectangle';
    let shapes = [];
    let selectedShapeId = null;
    let drawingState = {
        isDrawing: false,
        currentPoints: [],
        currentShape: null,
    };
    // cache pipelines and buffers for shapes
    const shapePipelines = new Map();
    const shapeBuffers = new Map();
    // setup drawing canvas
    if (drawCanvas) {
        drawCanvas.width = window.innerWidth;
        drawCanvas.height = window.innerHeight;
        window.addEventListener('resize', () => {
            drawCanvas.width = window.innerWidth;
            drawCanvas.height = window.innerHeight;
        });
    }
    const shaders = await getAvailableShaders();
    shaders.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = getShaderDisplayName(name);
        if (name === currentShader)
            option.selected = true;
        select.appendChild(option);
    });
    function getParamValue(paramName, def) {
        if (!isMusicMode) {
            return currentParams[paramName] ?? def.default;
        }
        const musicMode = paramMusicConfig[paramName] ?? 'none';
        if (musicMode === 'none') {
            return currentParams[paramName] ?? def.default;
        }
        let audioValue = 0;
        if (musicMode === 'loudness') {
            audioValue = audioAnalysis.loudness;
        }
        // map audio value (0-1) to param range
        return def.min + audioValue * (def.max - def.min);
    }
    function updateParamsPanel() {
        if (!paramsPanel)
            return;
        paramsPanel.innerHTML = '';
        const defs = shaderParamDefs[currentShader] || [];
        if (defs.length === 0) {
            paramsPanel.innerHTML = '<div style="color: rgba(255,255,255,0.5);">no parameters</div>';
            return;
        }
        defs.forEach(def => {
            const group = document.createElement('div');
            group.className = 'param-group';
            group.dataset.paramName = def.name;
            const label = document.createElement('div');
            label.className = 'param-label';
            label.dataset.paramName = def.name;
            const currentValue = getParamValue(def.name, def);
            label.innerHTML = `<span>${def.name}</span><span>${currentValue.toFixed(2)}</span>`;
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.className = 'param-slider';
            slider.min = def.min.toString();
            slider.max = def.max.toString();
            slider.step = (def.step ?? 0.01).toString();
            slider.value = (currentParams[def.name] ?? def.default).toString();
            slider.disabled = isMusicMode && paramMusicConfig[def.name] !== 'none' && paramMusicConfig[def.name] !== undefined;
            slider.addEventListener('input', () => {
                const value = parseFloat(slider.value);
                currentParams[def.name] = value;
                const displayValue = getParamValue(def.name, def);
                label.innerHTML = `<span>${def.name}</span><span>${displayValue.toFixed(2)}</span>`;
            });
            const musicSelect = document.createElement('select');
            musicSelect.className = 'param-music-select';
            const modes = [
                { value: 'none', label: 'manual' },
                { value: 'loudness', label: 'loudness' },
            ];
            modes.forEach(mode => {
                const option = document.createElement('option');
                option.value = mode.value;
                option.textContent = mode.label;
                if ((paramMusicConfig[def.name] ?? 'none') === mode.value) {
                    option.selected = true;
                }
                musicSelect.appendChild(option);
            });
            musicSelect.addEventListener('change', () => {
                const mode = musicSelect.value;
                paramMusicConfig[def.name] = mode;
                if (mode === 'none') {
                    slider.disabled = false;
                }
                else {
                    slider.disabled = isMusicMode;
                }
            });
            group.appendChild(label);
            group.appendChild(slider);
            if (isMusicMode) {
                group.appendChild(musicSelect);
            }
            paramsPanel.appendChild(group);
        });
    }
    paramsToggle.addEventListener('click', () => {
        if (paramsPanel) {
            paramsPanel.style.display = paramsPanel.style.display === 'none' ? 'block' : 'none';
        }
    });
    musicToggle.addEventListener('click', async () => {
        if (isMusicMode) {
            // disable music mode
            if (stopAudio) {
                stopAudio();
                stopAudio = null;
            }
            isMusicMode = false;
            musicToggle.classList.remove('active');
            updateParamsPanel();
        }
        else {
            // enable music mode
            try {
                stopAudio = await initAudio((analysis) => {
                    audioAnalysis = analysis;
                });
                isMusicMode = true;
                musicToggle.classList.add('active');
                updateParamsPanel();
            }
            catch (error) {
                console.error('failed to init audio:', error);
                alert('could not access microphone. check permissions.');
            }
        }
    });
    function redrawShapes() {
        if (!drawCanvas)
            return;
        const ctx = drawCanvas.getContext('2d');
        if (!ctx)
            return;
        ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        shapes.forEach(shape => {
            drawShapeOnCanvas(ctx, shape, shape.id === selectedShapeId);
        });
        if (drawingState.isDrawing && drawingState.currentPoints.length > 0) {
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            if (currentTool === 'rectangle' && drawingState.currentPoints.length >= 2) {
                const [p1, p2] = drawingState.currentPoints;
                const x = Math.min(p1.x, p2.x);
                const y = Math.min(p1.y, p2.y);
                const w = Math.abs(p2.x - p1.x);
                const h = Math.abs(p2.y - p1.y);
                ctx.strokeRect(x, y, w, h);
            }
        }
    }
    function updateShapePanel() {
        if (!shapePanel)
            return;
        shapePanel.innerHTML = '';
        if (shapes.length === 0) {
            shapePanel.innerHTML = '<div style="color: rgba(255,255,255,0.5);">no shapes</div>';
            return;
        }
        shapes.forEach(shape => {
            const item = document.createElement('div');
            item.className = 'shape-item';
            if (shape.id === selectedShapeId) {
                item.classList.add('selected');
            }
            const label = document.createElement('div');
            label.style.marginBottom = '4px';
            label.textContent = `${shape.type} - ${getShaderDisplayName(shape.shader)}`;
            const shaderSelect = document.createElement('select');
            shaderSelect.className = 'shape-shader-select';
            shaderSelect.style.cssText = 'width: 100%; padding: 4px; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 2px; font-family: monospace; font-size: 10px;';
            shaders.forEach(s => {
                const option = document.createElement('option');
                option.value = s;
                option.textContent = getShaderDisplayName(s);
                if (s === shape.shader) {
                    option.selected = true;
                }
                shaderSelect.appendChild(option);
            });
            shaderSelect.addEventListener('change', async () => {
                shape.shader = shaderSelect.value;
                shape.params = getDefaultParams(shape.shader);
                label.textContent = `${shape.type} - ${getShaderDisplayName(shape.shader)}`;
                // clear cached pipeline/buffer for this shape
                const oldPipeline = shapePipelines.get(shape.id);
                const oldBuffer = shapeBuffers.get(shape.id);
                if (oldPipeline)
                    shapePipelines.delete(shape.id);
                if (oldBuffer) {
                    oldBuffer.destroy();
                    shapeBuffers.delete(shape.id);
                }
            });
            item.addEventListener('click', (e) => {
                if (e.target.tagName !== 'SELECT') {
                    selectedShapeId = shape.id;
                    updateShapePanel();
                    redrawShapes();
                }
            });
            item.appendChild(label);
            item.appendChild(shaderSelect);
            shapePanel.appendChild(item);
        });
    }
    projectionToggle.addEventListener('click', () => {
        isProjectionMode = !isProjectionMode;
        projectionToggle.classList.toggle('active', isProjectionMode);
        if (projectionToolbar) {
            projectionToolbar.style.display = isProjectionMode ? 'flex' : 'none';
        }
        if (drawCanvas) {
            drawCanvas.style.display = isProjectionMode ? 'block' : 'none';
        }
        if (shapePanel) {
            shapePanel.style.display = isProjectionMode ? 'block' : 'none';
        }
        if (isProjectionMode) {
            redrawShapes();
            updateShapePanel();
        }
    });
    if (drawCanvas) {
        drawCanvas.addEventListener('mousedown', (e) => {
            if (!isProjectionMode)
                return;
            const rect = drawCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            if (currentTool === 'rectangle') {
                drawingState.isDrawing = true;
                drawingState.currentPoints = [{ x, y }];
            }
            redrawShapes();
        });
        drawCanvas.addEventListener('mousemove', (e) => {
            if (!isProjectionMode || !drawingState.isDrawing)
                return;
            const rect = drawCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            if (currentTool === 'rectangle' && drawingState.currentPoints.length >= 1) {
                drawingState.currentPoints = [drawingState.currentPoints[0], { x, y }];
                redrawShapes();
            }
        });
        drawCanvas.addEventListener('mouseup', (e) => {
            if (!isProjectionMode || !drawingState.isDrawing)
                return;
            if (currentTool === 'rectangle' && drawingState.currentPoints.length >= 2) {
                const shape = createShape('rectangle', [...drawingState.currentPoints], currentShader, { ...currentParams });
                shapes.push(shape);
                selectedShapeId = shape.id;
                drawingState.isDrawing = false;
                drawingState.currentPoints = [];
                redrawShapes();
                updateShapePanel();
            }
        });
        // escape key to cancel drawing
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isProjectionMode && drawingState.isDrawing) {
                drawingState.isDrawing = false;
                drawingState.currentPoints = [];
                redrawShapes();
            }
        });
    }
    async function loadShaderAndCreatePipeline(shaderName) {
        const shaderCode = await loadShader(shaderName);
        pipeline = createRenderPipeline(device, format, shaderCode);
        if (uniformBuffer)
            uniformBuffer.destroy();
        uniformBuffer = createUniformBuffer(device, [canvas.width, canvas.height], 0, currentParams);
    }
    function updateUniformBuffer() {
        if (!uniformBuffer)
            return;
        const currentTime = (performance.now() - startTime) / 1000;
        const defs = shaderParamDefs[currentShader] || [];
        const hue = defs.find(d => d.name === 'hue')
            ? getParamValue('hue', defs.find(d => d.name === 'hue'))
            : 0;
        const speed = defs.find(d => d.name === 'speed')
            ? getParamValue('speed', defs.find(d => d.name === 'speed'))
            : 1;
        const size = defs.find(d => d.name === 'size')
            ? getParamValue('size', defs.find(d => d.name === 'size'))
            : 0.5;
        const sparkliness = defs.find(d => d.name === 'sparkliness')
            ? getParamValue('sparkliness', defs.find(d => d.name === 'sparkliness'))
            : 0;
        const data = new Float32Array([
            canvas.width,
            canvas.height,
            currentTime,
            hue,
            speed,
            size,
            sparkliness,
            0.0,
        ]);
        device.queue.writeBuffer(uniformBuffer, 0, data);
    }
    await loadShaderAndCreatePipeline(currentShader);
    updateParamsPanel();
    select.addEventListener('change', async (e) => {
        const target = e.target;
        currentShader = target.value;
        currentParams = getDefaultParams(currentShader);
        paramMusicConfig = {}; // reset music config when switching shaders
        await loadShaderAndCreatePipeline(currentShader);
        updateParamsPanel();
    });
    let startTime = performance.now();
    function updateParamLabels() {
        if (!paramsPanel || !isMusicMode)
            return;
        const defs = shaderParamDefs[currentShader] || [];
        defs.forEach(def => {
            const label = paramsPanel.querySelector(`[data-param-name="${def.name}"].param-label`);
            if (label && paramMusicConfig[def.name] !== 'none' && paramMusicConfig[def.name] !== undefined) {
                const displayValue = getParamValue(def.name, def);
                label.innerHTML = `<span>${def.name}</span><span>${displayValue.toFixed(2)}</span>`;
            }
        });
    }
    async function getOrCreateShapePipeline(shape) {
        let shapePipeline = shapePipelines.get(shape.id);
        if (!shapePipeline) {
            const shaderCode = await loadShader(shape.shader);
            shapePipeline = createRenderPipeline(device, format, shaderCode);
            shapePipelines.set(shape.id, shapePipeline);
        }
        return shapePipeline;
    }
    function getOrCreateShapeBuffer(shape) {
        let shapeBuffer = shapeBuffers.get(shape.id);
        if (!shapeBuffer) {
            shapeBuffer = createUniformBuffer(device, [canvas.width, canvas.height], 0, shape.params);
            shapeBuffers.set(shape.id, shapeBuffer);
        }
        return shapeBuffer;
    }
    function updateShapeBuffer(shape) {
        const shapeBuffer = getOrCreateShapeBuffer(shape);
        const currentTime = (performance.now() - startTime) / 1000;
        const defs = shaderParamDefs[shape.shader] || [];
        const hue = defs.find(d => d.name === 'hue')
            ? (shape.params.hue ?? defs.find(d => d.name === 'hue').default)
            : 0;
        const speed = defs.find(d => d.name === 'speed')
            ? (shape.params.speed ?? defs.find(d => d.name === 'speed').default)
            : 1;
        const size = defs.find(d => d.name === 'size')
            ? (shape.params.size ?? defs.find(d => d.name === 'size').default)
            : 0.5;
        const sparkliness = defs.find(d => d.name === 'sparkliness')
            ? (shape.params.sparkliness ?? defs.find(d => d.name === 'sparkliness').default)
            : 0;
        const data = new Float32Array([
            canvas.width,
            canvas.height,
            currentTime,
            hue,
            speed,
            size,
            sparkliness,
            0.0,
        ]);
        device.queue.writeBuffer(shapeBuffer, 0, data);
    }
    async function render() {
        if (!pipeline || !uniformBuffer)
            return;
        updateUniformBuffer();
        updateParamLabels();
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                    view: context.getCurrentTexture().createView(),
                    loadOp: 'clear',
                    clearValue: [0, 0, 0, 1],
                    storeOp: 'store',
                }],
        });
        if (isProjectionMode && shapes.length > 0) {
            // render each shape with its assigned shader
            for (const shape of shapes) {
                if (shape.type === 'rectangle' && shape.points.length >= 2) {
                    const [p1, p2] = shape.points;
                    const x = Math.max(0, Math.min(p1.x, p2.x));
                    const y = Math.max(0, Math.min(p1.y, p2.y));
                    const w = Math.min(canvas.width - x, Math.abs(p2.x - p1.x));
                    const h = Math.min(canvas.height - y, Math.abs(p2.y - p1.y));
                    if (w > 0 && h > 0) {
                        // ensure pipeline and buffer exist
                        const shapePipeline = await getOrCreateShapePipeline(shape);
                        updateShapeBuffer(shape);
                        const shapeBuffer = getOrCreateShapeBuffer(shape);
                        // set scissor rect to clip to shape bounds (x, y, width, height)
                        pass.setScissorRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));
                        pass.setPipeline(shapePipeline);
                        pass.setBindGroup(0, device.createBindGroup({
                            layout: shapePipeline.getBindGroupLayout(0),
                            entries: [{ binding: 0, resource: { buffer: shapeBuffer } }],
                        }));
                        pass.draw(3);
                    }
                }
            }
            // reset scissor rect to full canvas
            pass.setScissorRect(0, 0, canvas.width, canvas.height);
        }
        else {
            // normal fullscreen rendering
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
            }));
            pass.draw(3);
        }
        pass.end();
        device.queue.submit([encoder.finish()]);
        requestAnimationFrame(() => render());
    }
    render();
}
main().catch(() => {
    showError();
});
