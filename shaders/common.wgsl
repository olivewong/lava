// common shader helpers

// hash function for noise generation
fn hash(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.13);
  p3 += dot(p3, p3.yzx + 3.333);
  return fract((p3.x + p3.y) * p3.z);
}

// value noise interpolation
fn noise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  
  return mix(
    mix(hash(i + vec2<f32>(0.0, 0.0)), hash(i + vec2<f32>(1.0, 0.0)), u.x),
    mix(hash(i + vec2<f32>(0.0, 1.0)), hash(i + vec2<f32>(1.0, 1.0)), u.x),
    u.y
  );
}

// fractional brownian motion
fn fbm(p: vec2<f32>) -> f32 {
  var value = 0.0;
  var amplitude = 0.5;
  var frequency = 1.0;
  var p_var = p;
  
  for (var i = 0u; i < 6u; i++) {
    value += amplitude * noise(p_var * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  
  return value;
}

// gaussian function
fn gaussian(d: f32, r: f32) -> f32 {
  return exp(-(d*d)/(r*r));
}

// convert hue (0-1) to rgb
fn hueToRgb(hue: f32) -> vec3<f32> {
  let h = hue * 6.0;
  let i = floor(h);
  let f = h - i;
  let p = 0.0;
  let q = 1.0 - f;
  let t = f;
  
  if (i == 0.0) { return vec3<f32>(1.0, t, p); }
  if (i == 1.0) { return vec3<f32>(q, 1.0, p); }
  if (i == 2.0) { return vec3<f32>(p, 1.0, t); }
  if (i == 3.0) { return vec3<f32>(p, q, 1.0); }
  if (i == 4.0) { return vec3<f32>(t, p, 1.0); }
  return vec3<f32>(1.0, p, q);
}

// apply hue shift to a color
fn applyHue(color: vec3<f32>, hue: f32) -> vec3<f32> {
  let maxVal = max(max(color.r, color.g), color.b);
  let minVal = min(min(color.r, color.g), color.b);
  let delta = maxVal - minVal;
  
  if (delta < 0.001) {
    return color;
  }
  
  var h: f32;
  if (maxVal == color.r) {
    var offset: f32 = 0.0;
    if (color.g < color.b) {
      offset = 6.0;
    }
    var hRaw = ((color.g - color.b) / delta) + offset + hue;
    h = fract(hRaw / 6.0);
  } else if (maxVal == color.g) {
    var hRaw = ((color.b - color.r) / delta) + 2.0 + hue;
    h = fract(hRaw / 6.0);
  } else {
    var hRaw = ((color.r - color.g) / delta) + 4.0 + hue;
    h = fract(hRaw / 6.0);
  }
  
  let s = delta / maxVal;
  let v = maxVal;
  
  let rgb = hueToRgb(h);
  return rgb * v * (1.0 - s) + rgb * v * s;
}

