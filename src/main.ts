/// <reference types="@webgpu/types" />

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
  const response = await fetch(`shaders/${name}.wgsl`);
  if (!response.ok) throw new Error(`Failed to load shader: ${name}`);
  return response.text();
}

function createUniformBuffer(device: GPUDevice, resolution: [number, number], time: number): GPUBuffer {
  const buffer = device.createBuffer({
    size: 16, // vec2<f32> (8) + f32 (4) + pad (4) = 16 bytes
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const data = new Float32Array([
    resolution[0], resolution[1], // vec2<f32> resolution
    time,                          // f32 time
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
  return ['metaballs', 'pool_reflections'];
}

async function main() {
  const { device, context, format } = await initWebGPU();
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const select = document.getElementById('shader-select') as HTMLSelectElement;

  let currentShader = 'metaballs';
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

  async function loadShaderAndCreatePipeline(shaderName: string) {
    const shaderCode = await loadShader(shaderName);
    pipeline = createRenderPipeline(device, format, shaderCode);
    
    if (uniformBuffer) uniformBuffer.destroy();
    uniformBuffer = createUniformBuffer(device, [canvas.width, canvas.height], 0);
  }

  await loadShaderAndCreatePipeline(currentShader);

  select.addEventListener('change', async (e) => {
    const target = e.target as HTMLSelectElement;
    currentShader = target.value;
    await loadShaderAndCreatePipeline(currentShader);
  });

  let startTime = performance.now();

  function render() {
    if (!pipeline || !uniformBuffer) return;

    const currentTime = (performance.now() - startTime) / 1000;
    const data = new Float32Array([
      canvas.width,
      canvas.height,
      currentTime,
      0.0,
    ]);
    device.queue.writeBuffer(uniformBuffer, 0, data);

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

main().catch(console.error);

