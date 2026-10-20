// Textured Asset Layer. One instance per sprite; geometry is generated from
// vertex_index as a strip of columns so the quad can bend (View morph arc).
// Hover breaks the edges into a print halftone vignette that leans after the cursor.
// Colors are premultiplied and blended in gamma space to match the browser layer.

struct Frame {
  viewport: vec2f,
  dpr: f32,
  time: f32,
};

struct Sprite {
  rect: vec4f,   // outer x, y, w, h (css px)
  inner: vec4f,  // image x, y, w, h (css px)
  shape: vec4f,  // outer radius, inner radius, card amount, opacity
  fade: vec4f,   // edge fade top, right, bottom, left (fraction of image)
  extra: vec4f,  // bend px, has texture, border px, image opacity
  motion: vec4f, // unused, hover 0..1, cursor x, y (-1..1)
  layer: vec4f,  // shadow strength 0..1, shadowed texture (image above, shadow below), unused, unused
};

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<storage, read> sprites: array<Sprite>;
@group(0) @binding(2) var linearSampler: sampler;
@group(1) @binding(0) var image: texture_2d<f32>;

const COLUMNS: u32 = 16u;
const PI: f32 = 3.14159265;
const PAD: f32 = 1.5;

/** Halftone cell pitch, css px. The screen sits at 45 degrees, like a black plate. */
const DOT_PITCH: f32 = 4.5;
/** Dot radius at full tone, in pitches. Clear of 1/sqrt(2) so merged dots leave no lattice. */
const DOT_FULL: f32 = 0.8;
/** Hover vignette depth as a share of the Asset's short side, capped in css px. */
const VIGNETTE_SHARE: f32 = 0.16;
const VIGNETTE_MAX: f32 = 48.0;
/** How far the vignette leans away from the cursor: at an edge, that band is (1 - lean) deep and the opposite (1 + lean). */
const VIGNETTE_LEAN: f32 = 0.55;
/** How far the image pushes in behind its still frame on hover. */
const HOVER_ZOOM: f32 = 0.045;
/** Clear rows between the layers of a shadowed texture; LAYER_GAP in scene/types.ts. */
const LAYER_GAP: f32 = 4.0;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) id: u32,
};

@vertex
fn vs(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> VertexOut {
  let s = sprites[instance];
  let column = vertex / 6u;
  let corner = vertex % 6u;
  var cx = array<f32, 6>(0.0, 1.0, 0.0, 0.0, 1.0, 1.0);
  var cy = array<f32, 6>(0.0, 0.0, 1.0, 1.0, 1.0, 0.0);
  let u = (f32(column) + cx[corner]) / f32(COLUMNS);
  let v = cy[corner];

  let size = s.rect.zw;
  let local = vec2f(u * (size.x + PAD * 2.0) - PAD, v * (size.y + PAD * 2.0) - PAD);
  var p = s.rect.xy + local;
  let across = clamp(local.x / max(size.x, 1.0), 0.0, 1.0);
  p.y += s.extra.x * sin(across * PI);

  var out: VertexOut;
  out.position = vec4f(p.x / frame.viewport.x * 2.0 - 1.0, 1.0 - p.y / frame.viewport.y * 2.0, 0.0, 1.0);
  out.local = local;
  out.id = instance;
  return out;
}

fn roundedBox(p: vec2f, halfSize: vec2f, radius: f32) -> f32 {
  let r = min(radius, min(halfSize.x, halfSize.y));
  let q = abs(p) - halfSize + vec2f(r);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

/**
 * The image texel, with a shadowed texture's shadow composited under it at `lift`.
 * Level 0 explicitly: the branch is per sprite, and textures carry no mips.
 */
fn sampleImage(s: Sprite, uv: vec2f) -> vec4f {
  let st = clamp(uv, vec2f(0.0), vec2f(1.0));
  if (s.layer.y < 0.5) {
    return textureSampleLevel(image, linearSampler, st, 0.0);
  }
  let rows = f32(textureDimensions(image).y);
  let layer = (rows - LAYER_GAP) * 0.5;
  let top = textureSampleLevel(image, linearSampler, vec2f(st.x, st.y * layer / rows), 0.0);
  let shadow = textureSampleLevel(image, linearSampler, vec2f(st.x, (layer + LAYER_GAP + st.y * layer) / rows), 0.0);
  return top + shadow * clamp(s.layer.x, 0.0, 1.0) * (1.0 - top.a);
}

fn edgeFade(uv: vec2f, fade: vec4f) -> f32 {
  var f = 1.0;
  if (fade.x > 0.0) { f *= smoothstep(0.0, fade.x, uv.y); }
  if (fade.y > 0.0) { f *= smoothstep(0.0, fade.y, 1.0 - uv.x); }
  if (fade.z > 0.0) { f *= smoothstep(0.0, fade.z, 1.0 - uv.y); }
  if (fade.w > 0.0) { f *= smoothstep(0.0, fade.w, uv.x); }
  return f;
}

/** Tone across a band: 0 at the edge, 1 past the band. Thin bands ease in instead of popping a row of dots. */
fn bandTone(fromEdge: f32, band: f32) -> f32 {
  return mix(1.0, clamp(fromEdge / max(band, 1e-3), 0.0, 1.0), smoothstep(0.5, 10.0, band));
}

/**
 * Coverage of the hover vignette's halftone. `ip` is in image space, so the dots travel
 * with the Asset instead of crawling through it. Dense ink holds its dots longer than
 * pale tones, as on paper.
 */
fn halftone(s: Sprite, ip: vec2f, texel: vec4f, aa: f32) -> f32 {
  let size = s.inner.zw;
  // One band per edge, multiplied, so the corners dissolve first like a lens vignette.
  // The clear middle leans after the cursor: near edges thin, far edges deepen.
  let vignette = max(s.motion.y, 0.0) * min(VIGNETTE_MAX, min(size.x, size.y) * VIGNETTE_SHARE);
  let lean = s.motion.zw * VIGNETTE_LEAN;
  let start = vignette * (1.0 + lean);
  let end = vignette * (1.0 - lean);
  let tone = bandTone(ip.x, start.x) * bandTone(size.x - ip.x, end.x)
    * bandTone(ip.y, start.y) * bandTone(size.y - ip.y, end.y);
  if (tone >= 1.0) { return 1.0; }

  let ink = 1.0 - dot(texel.rgb / max(texel.a, 1e-3), vec3f(0.2126, 0.7152, 0.0722));
  let r = vec2f(ip.x + ip.y, ip.y - ip.x) * 0.70710678 / DOT_PITCH;
  let d = length(fract(r) - 0.5) * DOT_PITCH;
  let radius = DOT_FULL * DOT_PITCH * sqrt(pow(tone, mix(1.6, 0.7, ink)));
  return clamp((radius - d) / aa + 0.5, 0.0, 1.0);
}

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  let s = sprites[in.id];
  let size = s.rect.zw;
  let aa = 1.0 / frame.dpr;
  let card = s.shape.z;

  let d = roundedBox(in.local - size * 0.5, size * 0.5, s.shape.x);
  let coverage = clamp(0.5 - d / aa, 0.0, 1.0);

  // Image, positioned by the inner rect (object-fit is resolved on the CPU).
  // Hover pushes the image in; the frame, its coverage and the dot grid stay put.
  let ip = in.local + s.rect.xy - s.inner.xy;
  let center = s.inner.zw * 0.5;
  let zoomed = center + (ip - center) / (1.0 + HOVER_ZOOM * max(s.motion.y, 0.0));
  let uv = zoomed / max(s.inner.zw, vec2f(1.0));
  let texel = sampleImage(s, uv);
  let di = roundedBox(ip - center, center, s.shape.y);
  let innerCoverage = clamp(0.5 - di / aa, 0.0, 1.0);
  var img = texel * innerCoverage * edgeFade(uv, s.fade) * s.extra.y * s.extra.w;
  if (s.motion.y > 0.0) {
    img *= halftone(s, ip, texel, aa);
  }

  // Glass card: 30% white fill, 1px white border.
  let fill = vec4f(0.3) * card;
  var color = img + fill * (1.0 - img.a);
  let border = s.extra.z;
  let ring = coverage - clamp(0.5 - (d + border) / aa, 0.0, 1.0);
  let edge = vec4f(1.0) * ring * card;
  color = edge + color * (1.0 - edge.a);

  return color * coverage * s.shape.w;
}
