// Textured Asset Layer. One instance per sprite; geometry is generated from
// vertex_index as a strip of columns so the quad can bend with scroll velocity.
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
};

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<storage, read> sprites: array<Sprite>;
@group(0) @binding(2) var linearSampler: sampler;
@group(1) @binding(0) var image: texture_2d<f32>;

const COLUMNS: u32 = 16u;
const PI: f32 = 3.14159265;
const PAD: f32 = 1.5;

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

fn edgeFade(uv: vec2f, fade: vec4f) -> f32 {
  var f = 1.0;
  if (fade.x > 0.0) { f *= smoothstep(0.0, fade.x, uv.y); }
  if (fade.y > 0.0) { f *= smoothstep(0.0, fade.y, 1.0 - uv.x); }
  if (fade.z > 0.0) { f *= smoothstep(0.0, fade.z, 1.0 - uv.y); }
  if (fade.w > 0.0) { f *= smoothstep(0.0, fade.w, uv.x); }
  return f;
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
  let ip = in.local + s.rect.xy - s.inner.xy;
  let uv = ip / max(s.inner.zw, vec2f(1.0));
  let texel = textureSample(image, linearSampler, clamp(uv, vec2f(0.0), vec2f(1.0)));
  let di = roundedBox(ip - s.inner.zw * 0.5, s.inner.zw * 0.5, s.shape.y);
  let innerCoverage = clamp(0.5 - di / aa, 0.0, 1.0);
  let img = texel * innerCoverage * edgeFade(uv, s.fade) * s.extra.y * s.extra.w;

  // Glass card: 30% white fill, 1px white border.
  let fill = vec4f(0.3) * card;
  var color = img + fill * (1.0 - img.a);
  let border = s.extra.z;
  let ring = coverage - clamp(0.5 - (d + border) / aa, 0.0, 1.0);
  let edge = vec4f(1.0) * ring * card;
  color = edge + color * (1.0 - edge.a);

  return color * coverage * s.shape.w;
}
