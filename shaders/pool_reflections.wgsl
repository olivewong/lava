struct Globals {
  resolution: vec2<f32>,
  time: f32,
  hue: f32,
  speed: f32,
  size: f32,
  sparkliness: f32,
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

// hash, noise, and fbm are in common.wgsl

@fragment
fn fs(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  let res = U.resolution;
  var uv = fragCoord.xy / res;
  uv.y = 1.0 - uv.y;
  
  var uv2 = (fragCoord.xy / res) * 2.0 - 1.0;
  uv2.x *= res.x / res.y;
  
  let t = U.time * U.speed;  // use speed parameter
  
  // create caustic patterns with multiple layers
  var caustic = 0.0;
  
  // layer 1: main caustics
  let uv1 = uv * U.size + vec2<f32>(t * 0.1, t * 0.15);
  let n1 = fbm(uv1);
  let warp1 = uv + vec2<f32>(n1 * 0.2, n1 * 0.15);
  caustic += pow(abs(sin(warp1.x * 15.0 + t) * sin(warp1.y * 15.0 - t * 0.7)), 0.3) * 0.7;
  
  // layer 2: secondary ripples
  let uv2_shifted = uv * (U.size * 0.83) + vec2<f32>(-t * 0.08, t * 0.12);
  let n2 = fbm(uv2_shifted);
  let warp2 = uv + vec2<f32>(n2 * 0.15, n2 * 0.2);
  caustic += pow(abs(sin(warp2.x * 12.0 - t * 0.5) * sin(warp2.y * 12.0 + t * 0.6)), 0.4) * 0.5;
  
  // layer 3: fine details
  let uv3 = uv * (U.size * 1.67) + vec2<f32>(t * 0.05, -t * 0.1);
  let n3 = fbm(uv3);
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
  let shimmer = pow(noise(uv * 30.0 + vec2<f32>(t * 2.0, -t * 1.5)), 2.0) * U.sparkliness;
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
  
  // apply hue shift only if non-zero
  if (abs(U.hue) > 0.001) {
    let rgb = applyHue(waterColor, U.hue);
    return vec4<f32>(rgb, 1.0);
  }
  return vec4<f32>(waterColor, 1.0);
}
