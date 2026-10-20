// Full-screen background: flat studio beige plus up to two soft Work glows.
// A fixed dither keeps the gradients from banding.

struct Background {
  viewport: vec2f,
  dpr: f32,
  glowCount: f32,
  color: vec4f,
  glowA: vec4f,      // x, y, radius, strength
  glowAColor: vec4f,
  glowB: vec4f,
  glowBColor: vec4f,
};

@group(0) @binding(0) var<uniform> bg: Background;

@vertex
fn vs(@builtin(vertex_index) vertex: u32) -> @builtin(position) vec4f {
  let x = f32((vertex << 1u) & 2u);
  let y = f32(vertex & 2u);
  return vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
}

fn glow(p: vec2f, g: vec4f) -> f32 {
  let d = length(p - g.xy) / max(g.z, 1.0);
  return exp(-d * d * 2.2) * g.w;
}

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

@fragment
fn fs(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = position.xy / bg.dpr;
  var color = bg.color.rgb;
  if (bg.glowCount > 0.5) {
    color = mix(color, bg.glowAColor.rgb, clamp(glow(p, bg.glowA), 0.0, 1.0));
  }
  if (bg.glowCount > 1.5) {
    color = mix(color, bg.glowBColor.rgb, clamp(glow(p, bg.glowB), 0.0, 1.0));
  }
  color += (hash(position.xy) - 0.5) / 255.0;
  return vec4f(color, 1.0);
}
