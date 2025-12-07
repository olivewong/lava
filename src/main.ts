/// <reference types="@webgpu/types" />

import { shaderParamDefs, getDefaultParams, type ShaderParams, type ParamDef } from './params.js';

async function initWebGPU(): Promise<{ device: GPUDevice; context: GPUCanvasContext; format: GPUTextureFormat }> {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas not found');

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('WebGPU not supported');

  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('WebGPU context not available');

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format });

  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });

  return { device, context, format };
}

async function loadShader(name: string): Promise<string> {
  const [commonResponse, shaderResponse] = await Promise.all([
    fetch('shaders/common.wgsl'),
    fetch(`shaders/${name}.wgsl`),
  ]);
  
  if (!shaderResponse.ok) throw new Error(`Failed to load shader: ${name}`);
  
  const commonCode = commonResponse.ok ? await commonResponse.text() : '';
  const shaderCode = await shaderResponse.text();
  
  return commonCode + '\n' + shaderCode;
}

function createUniformBuffer(
  device: GPUDevice,
  resolution: [number, number],
  time: number,
  params: ShaderParams
): GPUBuffer {
  const buffer = device.createBuffer({
    size: 32, // vec2<f32> (8) + f32 time (4) + f32 hue (4) + f32 speed (4) + f32 param1 (4) + f32 param2 (4) + f32 pad (4) = 32 bytes
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const data = new Float32Array([
    resolution[0], resolution[1], // vec2<f32> resolution
    time,                          // f32 time
    params.hue ?? 0,               // f32 hue
    params.speed ?? 1,             // f32 speed
    params.size ?? 0.5,            // f32 param1 (size)
    params.sparkliness ?? 0,       // f32 param2 (sparkliness or unused)
    0.0,                           // f32 pad
  ]);

  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

function createRenderPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  shaderCode: string
): GPURenderPipeline {
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

async function getAvailableShaders(): Promise<string[]> {
  // for now, hardcode. could fetch a manifest or scan directory in the future
  return ['metaballs', 'pool_reflections', 'sun'];
}

function showError() {
  const errorMsg = document.getElementById('error-message');
  if (errorMsg) errorMsg.style.display = 'block';
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  if (canvas) canvas.style.display = 'none';
  const select = document.getElementById('shader-select') as HTMLSelectElement;
  if (select) select.style.display = 'none';
}

async function main() {
  if (!navigator.gpu) {
    showError();
    return;
  }

  let device: GPUDevice;
  let context: GPUCanvasContext;
  let format: GPUTextureFormat;

  try {
    const result = await initWebGPU();
    device = result.device;
    context = result.context;
    format = result.format;
  } catch (error) {
    showError();
    return;
  }

  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const select = document.getElementById('shader-select') as HTMLSelectElement;
  const paramsPanel = document.getElementById('params-panel') as HTMLDivElement;
  const paramsToggle = document.getElementById('params-toggle') as HTMLButtonElement;

  let currentShader = 'metaballs';
  let currentParams: ShaderParams = getDefaultParams(currentShader);
  let pipeline: GPURenderPipeline | null = null;
  let uniformBuffer: GPUBuffer | null = null;

  const shaders = await getAvailableShaders();
  shaders.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    if (name === currentShader) option.selected = true;
    select.appendChild(option);
  });

  function updateParamsPanel() {
    if (!paramsPanel) return;
    paramsPanel.innerHTML = '';
    
    const defs = shaderParamDefs[currentShader] || [];
    if (defs.length === 0) {
      paramsPanel.innerHTML = '<div style="color: rgba(255,255,255,0.5);">no parameters</div>';
      return;
    }

    defs.forEach(def => {
      const group = document.createElement('div');
      group.className = 'param-group';
      
      const label = document.createElement('div');
      label.className = 'param-label';
      label.innerHTML = `<span>${def.name}</span><span>${currentParams[def.name]?.toFixed(2) ?? def.default.toFixed(2)}</span>`;
      
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'param-slider';
      slider.min = def.min.toString();
      slider.max = def.max.toString();
      slider.step = (def.step ?? 0.01).toString();
      slider.value = (currentParams[def.name] ?? def.default).toString();
      
      slider.addEventListener('input', () => {
        const value = parseFloat(slider.value);
        currentParams[def.name] = value;
        label.innerHTML = `<span>${def.name}</span><span>${value.toFixed(2)}</span>`;
      });
      
      group.appendChild(label);
      group.appendChild(slider);
      paramsPanel.appendChild(group);
    });
  }

  paramsToggle.addEventListener('click', () => {
    if (paramsPanel) {
      paramsPanel.style.display = paramsPanel.style.display === 'none' ? 'block' : 'none';
    }
  });

  async function loadShaderAndCreatePipeline(shaderName: string) {
    const shaderCode = await loadShader(shaderName);
    pipeline = createRenderPipeline(device, format, shaderCode);
    
    if (uniformBuffer) uniformBuffer.destroy();
    uniformBuffer = createUniformBuffer(device, [canvas.width, canvas.height], 0, currentParams);
  }

  function updateUniformBuffer() {
    if (!uniformBuffer) return;
    const currentTime = (performance.now() - startTime) / 1000;
    const data = new Float32Array([
      canvas.width,
      canvas.height,
      currentTime,
      currentParams.hue ?? 0,
      currentParams.speed ?? 1,
      currentParams.size ?? 0.5,
      currentParams.sparkliness ?? 0,
      0.0,
    ]);
    device.queue.writeBuffer(uniformBuffer, 0, data);
  }

  await loadShaderAndCreatePipeline(currentShader);
  updateParamsPanel();

  select.addEventListener('change', async (e) => {
    const target = e.target as HTMLSelectElement;
    currentShader = target.value;
    currentParams = getDefaultParams(currentShader);
    await loadShaderAndCreatePipeline(currentShader);
    updateParamsPanel();
  });

  let startTime = performance.now();

  function render() {
    if (!pipeline || !uniformBuffer) return;

    updateUniformBuffer();

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        clearValue: [0, 0, 0, 1],
        storeOp: 'store',
      }],
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    }));
    pass.draw(3);
    pass.end();

    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(render);
  }

  render();
}

main().catch(() => {
  showError();
});

