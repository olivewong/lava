struct Globals { 
  resolution: vec2<f32>, 
  time: f32, 
  hue: f32,
  speed: f32,
  size: f32,
  sparkliness: f32,
  _pad: f32 
}
// note: hue is unused but kept for uniform buffer compatibility
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
    var starPos = vec2<f32>(
      fract(sin(starId * 12.9898) * 43758.5453) * 2.0 - 1.0,
      fract(cos(starId * 78.233) * 43758.5453) * 2.0 - 1.0
    );
    starPos.x *= res.x / res.y;
    
    let dist = distance(uv, starPos);
    let brightness = 1.0 / (1.0 + dist * 200.0);
    let twinkle = sin(t * 2.0 + starId) * 0.3 + 0.7;
    stars += brightness * twinkle * 0.5;
  }
  
  // northern lights - flowing waves
  let auroraY = uv.y * 0.5 + 0.3; // position in upper sky
  let auroraBase = fbm(vec2<f32>(uv.x * U.size + t * 0.2, auroraY * 3.0 + t * 0.15));
  
  // create flowing curtain effect
  let curtain = sin(uv.x * 2.0 + t * 0.3) * 0.5 + 0.5;
  let auroraHeight = smoothstep(0.4, 0.8, auroraY) * smoothstep(1.2, 0.8, auroraY);
  let aurora = auroraBase * curtain * auroraHeight;
  
  // northern lights colors - green to cyan to purple
  let green = vec3<f32>(0.2, 0.8, 0.4);
  let cyan = vec3<f32>(0.1, 0.7, 0.8);
  let purple = vec3<f32>(0.4, 0.2, 0.6);
  
  // mix colors based on position and time
  let colorMix = (sin(uv.x * 1.5 + t * 0.2) * 0.5 + 0.5) * 0.5 + aurora * 0.1;
  var auroraColor = mix(green, cyan, colorMix);
  auroraColor = mix(auroraColor, purple, (sin(t * 0.5 + uv.x) * 0.5 + 0.5) * 0.03);
  
  // add sparkle
  let sparkle = pow(noise(uv * 30.0 + vec2<f32>(t * 2.0, -t * 1.5)), 2.0) * U.sparkliness;
  auroraColor += vec3<f32>(sparkle * 0.3, sparkle * 0.3, sparkle);
  
  // base sky color
  let skyDark = vec3<f32>(0.0, 0.0, 0.0);
let skyMid  = vec3<f32>(0.002, 0.002, 0.003);
// TODO: fix
//var skyColor = mix(skyDark, skyMid, clamp((uv.y + 1.0), 0.0, 1.0));

var skyColor = skyDark;
  
  // add stars
  skyColor += vec3<f32>(stars);
  
  // add northern lights
  skyColor += auroraColor * aurora * 1.0;
  
  // apply hue shift if non-zero
  // TODO: just make that the light
  // this broke thee aurora and made them too blobby todo add glow back
  // and the twinkliness 
  if skyColor.r < 0.8 {
  skyColor *= ( skyColor.r);
  skyColor.b *= 1.1;
  }
  if skyColor.r < 0.45 {
  //if skyColor.r < 0.2 { if u do this it does a cool eeffect see dec 7 screenshot but not right
  skyColor *= ( skyColor.r);
  skyColor.b *= 1.1;
  }
  
  return vec4<f32>(skyColor, 1.0);
}

