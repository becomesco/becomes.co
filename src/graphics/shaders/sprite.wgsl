// Textured Asset Layer. One instance per sprite; geometry is generated from
// vertex_index as a strip of columns so the quad can bend (View morph arc).
// Behind browser-layer text the sprite is seen through glass: bent towards the text, swirled,
// blurred and washed towards the paper, easing back to normal a feather outside the text.
// Colors are premultiplied and blended in gamma space to match the browser layer.

/** Glass boxes in the frame uniform; MAX_GLASS in pipelines.ts. */
const MAX_GLASS: u32 = 12u;

struct Frame {
  viewport: vec2f,
  dpr: f32,
  time: f32,
  glass: vec4f,                          // box count, unused x3
  paper: vec4f,                          // background sRGB, 1
  boxes: array<vec4f, MAX_GLASS>,        // center x, y, half w, h (css px)
  shapes: array<vec4f, MAX_GLASS>,       // corner radius, weight 0..1, feather, inset (css px)
};

struct Sprite {
  rect: vec4f,   // outer x, y, w, h (css px)
  inner: vec4f,  // image x, y, w, h (css px)
  shape: vec4f,  // outer radius, inner radius, card amount, opacity
  fade: vec4f,   // edge fade top, right, bottom, left (fraction of image)
  extra: vec4f,  // bend px, has texture, border px, image opacity
  motion: vec4f, // image zoom, hover (unused; its scale is applied on the CPU), zoom focus x, y (-1..1 across the image)
  layer: vec4f,  // shadow strength 0..1, shadowed texture (image above, shadow below), under glass, quad reach px
};

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<storage, read> sprites: array<Sprite>;
@group(0) @binding(2) var linearSampler: sampler;
@group(1) @binding(0) var image: texture_2d<f32>;

const COLUMNS: u32 = 16u;
const PI: f32 = 3.14159265;
const PAD: f32 = 1.5;

/** Clear rows between the layers of a shadowed texture; LAYER_GAP in scene/types.ts. */
const LAYER_GAP: f32 = 4.0;

// Glass. The reach of the bend, swirl and blur together stays under GLASS_REACH in pipelines.ts.
/** Lens strength, css px²: how far the slope of the glass bends what is behind it towards the text. */
const GLASS_BEND: f32 = 1500.0;
/** Swirl amplitude behind the text, css px, and the size of its cells. */
const GLASS_SWIRL: f32 = 11.0;
const GLASS_SWIRL_SCALE: f32 = 34.0;
/** Blur radius behind the text, css px. */
const GLASS_BLUR: f32 = 9.0;
/** Spread of the bend across the spectrum: red bends least, blue most. */
const GLASS_DISPERSION: f32 = 0.35;
/** How far content behind the text is washed towards the paper; dark content is washed further. */
const GLASS_WASH: f32 = 0.34;
const GLASS_WASH_DARK: f32 = 0.3;
/** Light caught where the glass is steepest, and the bend in css px at which it peaks. */
const GLASS_RIM: f32 = 0.1;
const GLASS_RIM_AT: f32 = 16.0;
const GLASS_TAPS: u32 = 8u;
const GOLDEN_ANGLE: f32 = 2.39996323;
const LUMA: vec3f = vec3f(0.2126, 0.7152, 0.0722);

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
  let pad = PAD + s.layer.w;
  let local = vec2f(u * (size.x + pad * 2.0) - pad, v * (size.y + pad * 2.0) - pad);
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

/** Share of full glass at screen point `p`: 1 behind the text, easing to 0 a feather outside it. Boxes combine like overlapping tints. */
fn glassAt(p: vec2f) -> f32 {
  var clear = 1.0;
  let count = min(u32(frame.glass.x), MAX_GLASS);
  for (var k = 0u; k < count; k++) {
    let b = frame.boxes[k];
    let m = frame.shapes[k];
    let d = roundedBox(p - b.xy, b.zw, m.x);
    clear *= 1.0 - m.y * (1.0 - smoothstep(-m.w, m.z, d));
  }
  return 1.0 - clear;
}

/**
 * The glass's own texture, -1 to 1 per axis: a domain-warped swirl whose cells read like a
 * reaction-diffusion pattern. Fixed to the screen, so Assets slide through it as they scroll.
 */
fn swirl(p: vec2f) -> vec2f {
  let q = p / GLASS_SWIRL_SCALE;
  let a = vec2f(sin(q.y * 1.7 + sin(q.x * 0.9)), cos(q.x * 1.3 + sin(q.y * 1.1)));
  let b = vec2f(sin((q.x + a.y * 1.5) * 2.3), cos((q.y + a.x * 1.5) * 2.1));
  return a * 0.55 + b * 0.45;
}

/** Per-pixel rotation for the blur taps, 0..1, so too few taps read as frost rather than rings. */
fn interleavedNoise(p: vec2f) -> f32 {
  return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715))));
}

/** Weight of one blur tap per channel, across the spectrum from red (0) to blue (1). */
fn spectrum(u: f32) -> vec3f {
  return vec3f(1.0 - u, 1.0 - abs(2.0 * u - 1.0), u) + 0.25;
}

/** The sprite at `local` (css px from its outer rect's corner), premultiplied. */
fn shade(s: Sprite, local: vec2f, aa: f32) -> vec4f {
  let size = s.rect.zw;
  let card = s.shape.z;

  let d = roundedBox(local - size * 0.5, size * 0.5, s.shape.x);
  let coverage = clamp(0.5 - d / aa, 0.0, 1.0);

  // Image, positioned by the inner rect (object-fit is resolved on the CPU).
  let ip = local + s.rect.xy - s.inner.xy;
  let center = s.inner.zw * 0.5;
  let uv = ip / max(s.inner.zw, vec2f(1.0));
  // Magnified about the focus, which stays under the cursor; with the focus inside the image
  // the zoomed view never reaches past its edges.
  let focus = s.motion.zw * 0.5 + 0.5;
  let texel = sampleImage(s, focus + (uv - focus) / max(s.motion.x, 1.0));
  let di = roundedBox(ip - center, center, s.shape.y);
  let innerCoverage = clamp(0.5 - di / aa, 0.0, 1.0);
  var img = texel * innerCoverage * edgeFade(uv, s.fade) * s.extra.y * s.extra.w;

  // Glass card: 30% white fill, 1px white border.
  let fill = vec4f(0.3) * card;
  var color = img + fill * (1.0 - img.a);
  let border = s.extra.z;
  let ring = coverage - clamp(0.5 - (d + border) / aa, 0.0, 1.0);
  let edge = vec4f(1.0) * ring * card;
  color = edge + color * (1.0 - edge.a);

  return color * coverage * s.shape.w;
}

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  let s = sprites[in.id];
  let aa = 1.0 / frame.dpr;
  if (s.layer.z < 0.5) {
    return shade(s, in.local, aa);
  }
  let screen = in.position.xy / frame.dpr;
  let glass = glassAt(screen);
  if (glass <= 0.001) {
    return shade(s, in.local, aa);
  }

  // The glass is a lens: its slope bends what is behind it towards the text, so the Asset
  // swells into the text's edge; behind the text it swirls and blurs.
  let e = 1.5;
  let slope = vec2f(
    glassAt(screen + vec2f(e, 0.0)) - glassAt(screen - vec2f(e, 0.0)),
    glassAt(screen + vec2f(0.0, e)) - glassAt(screen - vec2f(0.0, e)),
  ) / (2.0 * e);
  let bend = slope * GLASS_BEND;
  let swirled = swirl(screen) * GLASS_SWIRL * glass;
  let radius = GLASS_BLUR * glass;
  let spin = interleavedNoise(in.position.xy) * 6.2831853;

  var rgb = vec3f(0.0);
  var alpha = 0.0;
  var weights = vec3f(0.0);
  for (var i = 0u; i < GLASS_TAPS; i++) {
    let t = (f32(i) + 0.5) / f32(GLASS_TAPS);
    let a = f32(i) * GOLDEN_ANGLE + spin;
    let disk = vec2f(cos(a), sin(a)) * sqrt(t) * radius;
    // Spectral order is shuffled against the disk so hue doesn't ring with blur radius.
    let u = f32((i * 3u) % GLASS_TAPS) / f32(GLASS_TAPS - 1u);
    let c = shade(s, in.local + bend * (1.0 + GLASS_DISPERSION * (u - 0.5)) + swirled + disk, aa);
    let w = spectrum(u);
    rgb += c.rgb * w;
    weights += w;
    alpha += c.a;
  }
  alpha /= f32(GLASS_TAPS);
  rgb = min(rgb / weights, vec3f(alpha));

  // Washed towards the paper so the text over it keeps its contrast; dark content more so.
  let lum = dot(rgb, LUMA) / max(alpha, 1e-3);
  let wash = glass * (GLASS_WASH + GLASS_WASH_DARK * (1.0 - lum));
  rgb = mix(rgb, frame.paper.rgb * alpha, wash);
  let rim = smoothstep(0.35, 1.0, length(bend) / GLASS_RIM_AT) * GLASS_RIM;
  rgb = min(rgb + vec3f(rim * alpha), vec3f(alpha));
  return vec4f(rgb, alpha);
}
