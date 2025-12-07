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
  
  let t = U.time * U.speed;
  
  // star field
  var stars = 0.0;
  for (var i = 0u; i < 200u; i++) {
    let starId = f32(i);
    let starPos = vec2<f32>(
      fract(sin(starId * 12.9898) * 43758.5453) * 2.0 - 1.0,
      fract(cos(starId * 78.233) * 43758.5453) * 2.0 - 1.0
    );
    starPos.x *= res.x / res.y;
    
    let dist = distance(uv, starPos);
    let brightness = 1.0 / (1.0 + dist * 200.0);
    let twinkle = sin(t * 2.0 + starId) * 0.3 + 0.7;
    stars += brightness * twinkle * 0.5;
  }
  
  // milky way band
  let bandDist = abs(uv.y + sin(uv.x * 0.5 + t * 0.1) * 0.2);
  let milkyWay = exp(-bandDist * 3.0) * 0.3;
  
  // base sky color - dark blue to black
  let skyDark = vec3<f32>(0.02, 0.02, 0.05);
  let skyMid = vec3<f32>(0.05, 0.05, 0.1);
  var skyColor = mix(skyDark, skyMid, (uv.y + 1.0) * 0.5);
  
  // add stars
  skyColor += vec3<f32>(stars);
  
  // add milky way
  skyColor += vec3<f32>(milkyWay * 0.5, milkyWay * 0.6, milkyWay * 0.8);
  
  // apply hue shift if non-zero
  if (abs(U.hue) > 0.001) {
    let rgb = applyHue(skyColor, U.hue);
    return vec4<f32>(rgb, 1.0);
  }
  
  return vec4<f32>(skyColor, 1.0);
}

