
struct Globals { 
  resolution: vec2<f32>, 
  time: f32, 
  hue: f32,
  speed: f32,
  size: f32,
  param2: f32,
  _pad: f32 
}
@group(0) @binding(0) var<uniform> U : Globals;

const EDGE: f32 = 0.60;   // iso-level; higher = thinner blobs
const BAND: f32 = 0.14;   // rim softness
const NUM_BALLS: u32 = 8;

@vertex
fn vs(@builtin(vertex_index) vid : u32) -> @builtin(position) vec4<f32> {
  var pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -3.0), vec2<f32>(-1.0, 1.0), vec2<f32>(3.0, 1.0)
  );
  return vec4<f32>(pos[vid], 0.0, 1.0);
}

fn getBallPos(index: u32, t: f32) -> vec2<f32> {
  // lissajous curve for animating the balls
  let phase = f32(index) % f32(NUM_BALLS);
  let speedMult = f32(index) * f32(index); // separate balls
  let blobPos: vec2<f32> = vec2<f32>(
    cos(t * U.speed + phase * speedMult),
    sin(t * U.speed * 0.2 - f32(index) / f32(NUM_BALLS) * speedMult)
  );
  return blobPos;
}

// gaussian is in common.wgsl

fn mix3(a:vec4<f32>,b:vec4<f32>,c: vec4<f32>, v: f32) -> vec4<f32> {
  // v should be 0-1
  if v <= 0.5 {
    return mix(a, b, v * 2.0);
  }
  return mix(b, c,(v - 0.5) * 2.0);
}

@fragment
fn fs(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  let res = U.resolution;
  var uv = (fragCoord.xy / res) * 2.0 - 1.0;
  // -1 to 1
  uv.x *= res.x / res.y;

  let white = vec4(1.0, 1.0, 0.9, 1.0);
  let black = vec4(0.0, 0.0, 0.0, 0.0);
  let purple = vec4(0.6, 0.01, 0.45, 1.0);
  let coolPurple = vec4(0.51, 0.00, 0.58, 1.0);
  let hotPink = vec4(1.0, 0.09, 0.6, 1.0);
  let bgDark = vec4(0.46, 0.0, 0.32, 1.0);
  let bgMid = vec4(0.58, 0.0, 0.47, 1.0);
  let bgLight = vec4(1.0, 0.0, 0.46, 1.0);
  let trans = vec4(1.0, 0.1, 0.6, 0.0);
  // light blue ish
  let blobColor0 = vec4(0.9, 0.1, 0.15, 1.0);
  let blobColor1 = vec4(0.9, 1.0, 0.15, 1.0);

  let t = U.time;
  var val = 0.0;
  for (var i: u32 = 0u; i < NUM_BALLS; i++) {
    var ballSize = (0.2 + f32(i % NUM_BALLS) / f32(NUM_BALLS) * 0.15) * U.size;
    var blobPos = getBallPos(i, t);
    let d = distance(blobPos, uv);
    val += gaussian(d, ballSize);
  }

  var cVal = clamp(uv.y, 0.0, 1.0);
  var dark = vec4(0.6, 0.0, 0.5, 0.7);
  var bgColor = mix(dark, bgLight, uv.y / 2.0 + 0.5);

  var color = bgColor;
  color += val * white * 0.5;
  if val < 1.0 {
    // enhanced color variation with more gradient mixing
    var colorMix = uv.y * 0.5 + uv.x * 0.25 * sin(t) * 0.3 + 0.4 * cos(t / 0.3);
    var purpley = mix(coolPurple, purple, colorMix);
    // add more variation with hotPink
    var vibrant = mix(purpley, hotPink, sin(t * 0.5 + uv.x * 2.0) * 0.3 + 0.3);
    color = mix(vibrant, color, val);
  }
  
  // apply hue shift only if non-zero
  if (abs(U.hue) > 0.001) {
    let rgb = applyHue(color.rgb, U.hue);
    return vec4<f32>(rgb, color.a);
  }
  return color;
  }
