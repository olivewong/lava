struct Globals {
  resolution: vec2<f32>,
  time: f32,
  _pad: f32
}

@group(0) @binding(0) var<uniform> U: Globals;

@vertex
fn vs(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4<f32> {
  var pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -3.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(3.0, 1.0)
  );
  return vec4<f32>(pos[vid], 0.0, 1.0);
}

// simple hash function for noise generation
// uses large primes and irrational numbers to create pseudo-random distribution
fn hash(p: vec2<f32>) -> f32 {
  // 0.13 is arbitrary small prime-like multiplier for initial scrambling
  var p3 = fract(vec3<f32>(p.xyx) * 0.13);
  // 3.333 (10/3) adds offset to spread values, chosen empirically for good distribution
  p3 += dot(p3, p3.yzx + 3.333);
  // final multiply and fract creates chaotic mixing for hash-like behavior
  return fract((p3.x + p3.y) * p3.z);
}

// value noise interpolation
fn noise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  // smoothstep hermite curve: 3t² - 2t³, gives smooth interpolation (c1 continuous)
  let u = f * f * (3.0 - 2.0 * f);
  
  return mix(
    mix(hash(i + vec2<f32>(0.0, 0.0)), hash(i + vec2<f32>(1.0, 0.0)), u.x),
    mix(hash(i + vec2<f32>(0.0, 1.0)), hash(i + vec2<f32>(1.0, 1.0)), u.x),
    u.y
  );
}

// fractional brownian motion for complex patterns
// combines multiple octaves of noise at different frequencies
fn fbm(p: vec2<f32>) -> f32 {
  var value = 0.0;
  var amplitude = 0.5;  // starting strength, halves each octave (1/2^n persistence)
  var frequency = 1.0;  // doubles each octave for finer detail
  var p_var = p;
  
  // 6 octaves chosen for detail vs performance balance
  for (var i = 0; i < 6; i++) {
    value += amplitude * noise(p_var * frequency);
    frequency *= 2.0;  // lacunarity: how much detail increases per octave
    amplitude *= 0.5;  // persistence: how much each octave contributes
  }
  
  return value;
}

@fragment
fn fs(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  let res = U.resolution;
  var uv = fragCoord.xy / res;
  uv.y = 1.0 - uv.y;
  
  var uv2 = (fragCoord.xy / res) * 2.0 - 1.0;
  uv2.x *= res.x / res.y;
  
  let t = U.time * 0.3;  // slow down animation for natural water movement
  
  // create caustic patterns with multiple layers
  var caustic = 0.0;
  
  // layer 1: main caustics
  let uv1 = uv * 3.0 + vec2<f32>(t * 0.1, t * 0.15);  // scale 3x, drift slowly
  let n1 = fbm(uv1);
  let warp1 = uv + vec2<f32>(n1 * 0.2, n1 * 0.15);  // warp by 20% for distortion
  // 15.0 = caustic frequency, 0.3 power creates sharp bright lines, 0.7 = intensity
  caustic += pow(abs(sin(warp1.x * 15.0 + t) * sin(warp1.y * 15.0 - t * 0.7)), 0.3) * 0.7;
  
  // layer 2: secondary ripples
  let uv2_shifted = uv * 2.5 + vec2<f32>(-t * 0.08, t * 0.12);  // 2.5x scale, opposite drift
  let n2 = fbm(uv2_shifted);
  let warp2 = uv + vec2<f32>(n2 * 0.15, n2 * 0.2);
  // 12.0 = medium frequency, 0.4 power softer than layer 1, 0.5 = half intensity
  caustic += pow(abs(sin(warp2.x * 12.0 - t * 0.5) * sin(warp2.y * 12.0 + t * 0.6)), 0.4) * 0.5;
  
  // layer 3: fine details
  let uv3 = uv * 5.0 + vec2<f32>(t * 0.05, -t * 0.1);  // 5x scale for small ripples
  let n3 = fbm(uv3);
  // 20.0 = high frequency, 0.2 power very soft, 0.3 = subtle contribution
  caustic += pow(abs(sin(uv3.x * 20.0 + n3 * 3.0) * sin(uv3.y * 20.0 - n3 * 2.0)), 0.2) * 0.3;
  
  // create depth gradient
  let depth = 1.0 - uv.y * 0.6;  // 0.6 = gradient steepness, lighter at top (shallow)
  
  // pool water colors
  let deepWater = vec3<f32>(0.0, 0.15, 0.35);
  let shallowWater = vec3<f32>(0.1, 0.45, 0.65);
  let highlight = vec3<f32>(0.6, 0.85, 1.0);
  
  // mix colors based on depth
  var waterColor = mix(deepWater, shallowWater, depth);
  
  // add caustic lighting
  waterColor += highlight * caustic * 0.8;
  
  // add some shimmer
  // 30.0 = high frequency sparkle, pow 2.0 = sharp highlights, 0.2 = subtle intensity
  let shimmer = pow(noise(uv * 30.0 + vec2<f32>(t * 2.0, -t * 1.5)), 2.0) * 0.2;
  waterColor += shimmer * highlight;
  
  // add subtle vignette
  let dist = length(uv2);
  // smoothstep(1.5, 0.5) creates soft falloff from center
  let vignette = smoothstep(1.5, 0.5, dist);
  waterColor *= 0.4 + 0.6 * vignette;  // darken edges, keep 40% base brightness
  
  // add some blue glow at the edges
  // smoothstep(0.2, 0.8) creates glow in center, fades at edges
  let edgeGlow = smoothstep(0.2, 0.8, 1.0 - abs(uv.x - 0.5) * 2.0) * 
                 smoothstep(0.2, 0.8, 1.0 - abs(uv.y - 0.5) * 2.0);
  waterColor += vec3<f32>(0.0, 0.2, 0.4) * (1.0 - edgeGlow) * 0.3;  // 0.3 = glow intensity
  
  return vec4<f32>(waterColor, 1.0);
}
