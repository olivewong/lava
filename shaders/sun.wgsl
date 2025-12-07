struct Globals { resolution: vec2<f32>, time: f32, _pad: f32 }
@group(0) @binding(0) var<uniform> U : Globals;

@vertex
fn vs(@builtin(vertex_index) vid : u32) -> @builtin(position) vec4<f32> {
  var pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -3.0), vec2<f32>(-1.0, 1.0), vec2<f32>(3.0, 1.0)
  );
  return vec4<f32>(pos[vid], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  let res = U.resolution;
  var uv = (fragCoord.xy / res) * 2.0 - 1.0;
  uv.x *= res.x / res.y;
  
  let center = vec2<f32>(0.0, 0.0);
  let dist = length(uv - center);
  
  // sun colors - bright yellow/orange at center, fading to darker orange/red
  let sunCore = vec4<f32>(1.0, 0.95, 0.7, 1.0);
  let sunMid = vec4<f32>(1.0, 0.7, 0.3, 1.0);
  let sunEdge = vec4<f32>(1.0, 0.4, 0.1, 1.0);
  let skyDark = vec4<f32>(0.1, 0.1, 0.2, 1.0);
  
  // smooth circular gradient
  let radius = 0.6;
  let fade = 0.3;
  let t = smoothstep(radius, radius + fade, dist);
  
  var color: vec4<f32>;
  if (dist < radius) {
    // inside sun - gradient from core to edge
    let innerT = dist / radius;
    color = mix(sunCore, sunMid, innerT * 0.6);
    color = mix(color, sunEdge, max(0.0, (innerT - 0.6) / 0.4));
  } else {
    // outside sun - fade to sky
    color = mix(sunEdge, skyDark, t);
  }
  
  return color;
}

