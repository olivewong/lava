
struct Globals { 
  resolution: vec2<f32>, 
  time: f32, 
  hue: f32,
  speed: f32,
  size: f32,
  fuzziness: f32,
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

  // lava lamp color palette - gradient from light blue (center) to pink (edges)
  let lightBlue = vec4(0.6, 0.9, 1.0, 1.0);      // brightest center
  let cyan = vec4(0.4, 0.8, 1.0, 1.0);           // bright center
  let lightPink = vec4(1.0, 0.7, 0.9, 1.0);      // middle transition
  let pink = vec4(1.0, 0.5, 0.8, 1.0);           // mid-pink
  let darkPink = vec4(0.8, 0.3, 0.6, 1.0);       // darker edges
  let deepPink = vec4(0.6, 0.2, 0.5, 1.0);       // darkest
  
  let white = vec4(1.0, 1.0, 0.95, 1.0);
  let bgDark = vec4(0.1, 0.0, 0.15, 1.0);
  let bgLight = vec4(0.3, 0.0, 0.25, 1.0);

  let t = U.time;
  var val = 0.0;
  for (var i: u32 = 0u; i < NUM_BALLS; i++) {
    var ballSize = (0.2 + f32(i % NUM_BALLS) / f32(NUM_BALLS) * 0.15) * U.size * U.fuzziness;
    var blobPos = getBallPos(i, t);
    let d = distance(blobPos, uv);
    val += gaussian(d, ballSize);
  }

  var cVal = clamp(uv.y, 0.0, 1.0);
  var dark = vec4(0.6, 0.0, 0.5, 0.7);
  var bgColor = mix(dark, bgLight, uv.y / 2.0 + 0.5);

  // lava lamp effect with gradient colors
  var color = bgColor;
  
  // calculate distance from center for gradient
  let centerDist = length(uv);
  let centerT = clamp(centerDist * 0.8, 0.0, 1.0);
  
  // base gradient: light blue (center) -> light pink -> dark pink (edges)
  var baseGradient: vec4<f32>;
  if (centerT < 0.3) {
    // center: light blue to cyan
    baseGradient = mix(lightBlue, cyan, centerT / 0.3);
  } else if (centerT < 0.6) {
    // middle: cyan to light pink
    baseGradient = mix(cyan, lightPink, (centerT - 0.3) / 0.3);
  } else if (centerT < 0.85) {
    // outer: light pink to pink
    baseGradient = mix(lightPink, pink, (centerT - 0.6) / 0.25);
  } else {
    // edge: pink to dark pink
    baseGradient = mix(pink, darkPink, (centerT - 0.85) / 0.15);
  }
  
  // add white highlights in brightest areas
  color += val * white * 0.5;
  
  // add colorful blob colors - each ball gets different colors from gradient
  for (var i: u32 = 0u; i < NUM_BALLS; i++) {
    var ballSize = (0.2 + f32(i % NUM_BALLS) / f32(NUM_BALLS) * 0.15) * U.size * U.fuzziness;
    var blobPos = getBallPos(i, t);
    let d = distance(blobPos, uv);
    let ballVal = gaussian(d, ballSize);
    
    // distance from blob center determines color in gradient
    let blobDist = d / (ballSize * 2.0);
    let blobDistClamped = clamp(blobDist, 0.0, 1.0);
    
    // assign colors from gradient based on blob distance and index
    var ballColor: vec4<f32>;
    let colorIndex = f32(i % 8u) / 8.0;
    
    if (blobDistClamped < 0.2) {
      // center of blob: light blue
      ballColor = mix(lightBlue, cyan, blobDistClamped * 5.0);
    } else if (blobDistClamped < 0.5) {
      // middle: cyan to light pink
      ballColor = mix(cyan, lightPink, (blobDistClamped - 0.2) / 0.3);
    } else if (blobDistClamped < 0.75) {
      // outer: light pink to pink
      ballColor = mix(lightPink, pink, (blobDistClamped - 0.5) / 0.25);
    } else {
      // edge: pink to dark pink
      ballColor = mix(pink, darkPink, (blobDistClamped - 0.75) / 0.25);
    }
    
    // add variation based on ball index for more diversity
    let variation = sin(t * 0.2 + f32(i) * 0.8) * 0.15;
    if (variation > 0.0) {
      ballColor = mix(ballColor, lightPink, variation);
    } else {
      ballColor = mix(ballColor, cyan, -variation);
    }
    
    color += ballColor * ballVal * 0.6;
  }
  
  // blend with base gradient in areas between blobs
  if val < 1.0 {
    color = mix(baseGradient, color, clamp(val * 1.3, 0.0, 1.0));
  }
  
  // apply subtle hue shift (reduced intensity)
  let hueShifted = applyHue(color.rgb, U.hue * 0.4);
  let rgb = mix(color.rgb, hueShifted, 0.3);
  return vec4<f32>(rgb, color.a);
  }
