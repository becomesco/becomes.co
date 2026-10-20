// Glass mark: the rounded mesh in clear, dark plastic. It refracts what sits behind it (the
// Loader's panel, ground and text, rebuilt here from a coverage mask and three colours) and
// reflects a procedural studio: dark ahead, so the crown stays clear, lit around the sides, so
// the rims draw as thin bright lines. Reflections are looked up in world space; a tilt slides them.
// The surface is opaque: it redraws its own backdrop, so the browser layer under it never shows twice.

struct Mark {
  viewProj: mat4x4f,
  model: mat4x4f,
  eye: vec4f,
  half: vec4f,      // mesh half extents, unused
  params: vec4f,    // opacity, glint position, ground light (0 black, 1 warm gray), Wordmark opacity
  backdrop: vec4f,  // canvas px width, height; panel edge (fraction of height, panel above); panel amount
  lens: vec4f,      // canvas uv per world unit at the mark's depth (x, y); light Wordmark amount; unused
  ink: vec4f,
  ground: vec4f,
  lightWord: vec4f,
  fx: vec4f,        // seconds on the inner light's clock; its frame's centre (x, y) and height, canvas px
  glow: vec4f,      // glow texture size in texels (x, y); the frame half-extent it covers (x, y)
};

@group(0) @binding(0) var<uniform> mark: Mark;
@group(0) @binding(1) var wordMask: texture_2d<f32>;
@group(0) @binding(2) var maskSampler: sampler;
@group(0) @binding(3) var glowTexture: texture_2d<f32>;

/** Index of refraction of the plastic. */
const IOR: f32 = 1.5;
/** World units from the surface to the plane it refracts, beyond the far face. */
const DEPTH: f32 = 0.09;
/** Absorption per extra path length through the body; darkens the walls towards the rim. */
const ABSORB: f32 = 0.55;
/** What the body passes face-on: a faint smoke. */
const CLEAR: f32 = 0.8;
/** Scales the studio before the tone curve. */
const EXPOSURE: f32 = 1.6;
/** Device px the Wordmark softens by behind the body. */
const BLUR: f32 = 1.4;

struct VertexOut {
  // The colour pass tests depth for equality against the depth pass.
  @builtin(position) @invariant position: vec4f,
  @location(0) world: vec3f,
  @location(1) normal: vec3f,
};

@vertex
fn vs(@location(0) position: vec4f, @location(1) normal: vec4f) -> VertexOut {
  let world = mark.model * vec4f(position.xyz * mark.half.xyz, 1.0);
  var out: VertexOut;
  out.position = mark.viewProj * world;
  out.world = world.xyz;
  out.normal = (mark.model * vec4f(normal.xyz, 0.0)).xyz;
  return out;
}

fn band(x: f32, center: f32, width: f32) -> f32 {
  let d = (x - center) / width;
  return exp(-d * d);
}

/** HDR radiance along world direction `r` from `p`. The viewer looks down -z; the mark faces +z. */
fn studio(r: vec3f, p: vec3f, glint: f32, ground: f32) -> vec3f {
  // Angle around the view axis: 0 to the right, pi/2 up.
  let around = atan2(r.y, r.x);

  // Ahead of the mark (what the crown sees) the room is black. Around it hang rings of strip
  // light, brighter to the upper left: plastic reflects a few percent of the strong ones, a
  // thin line part way down each slope, and most of the faint one behind, a line on every rim.
  let uneven = 0.45 + 0.55 * band(around, 2.1, 1.0) + 0.45 * band(around, -0.7, 0.7);
  var c = vec3f(5.0) * smoothstep(0.96, 0.35, r.z) * smoothstep(-0.85, -0.35, r.z) * uneven;
  c += vec3f(10.0) * band(r.z, 0.42, 0.13) * uneven;
  c += vec3f(6.0) * band(r.z, -0.2, 0.15) * uneven;
  c += vec3f(0.9) * smoothstep(-0.5, -0.95, r.z) * uneven;
  // Once the panel has gone the room is lit warm gray.
  c += vec3f(0.9, 0.88, 0.84) * ground * smoothstep(0.7, 0.0, r.z);

  // The glint is a strip that travels diagonally across the mark. Keyed partly to the reflected
  // direction, it bends over each tube instead of sliding flat across the face.
  let axis = vec2f(0.8, 0.6);
  let diag = dot(p.xy, axis) * 0.55 + dot(r.xy, axis) * 0.45;
  c += vec3f(6.0) * band(diag, glint, 0.07) * smoothstep(0.95, 0.3, r.z);
  return c;
}

/** The Loader as the browser layer draws it, at canvas uv. */
fn behind(uv: vec2f) -> vec3f {
  let panel = select(0.0, mark.backdrop.w, uv.y < mark.backdrop.z);
  let base = mix(mark.ground.rgb, mark.ink.rgb, panel);
  let ink = mix(mark.ink.rgb, mark.lightWord.rgb, min(panel, mark.lens.z));
  // Seen through the body the text is slightly out of focus.
  let blur = BLUR / mark.backdrop.xy;
  let cover = 0.25 * mark.params.w * (
    textureSampleLevel(wordMask, maskSampler, uv + vec2f(blur.x, blur.y), 0.0).r +
    textureSampleLevel(wordMask, maskSampler, uv + vec2f(-blur.x, blur.y), 0.0).r +
    textureSampleLevel(wordMask, maskSampler, uv + vec2f(blur.x, -blur.y), 0.0).r +
    textureSampleLevel(wordMask, maskSampler, uv - blur, 0.0).r);
  return mix(base, ink, cover);
}

fn floorMod(x: vec4f, y: f32) -> vec4f {
  return x - y * floor(x / y);
}

fn drift(z: f32) -> vec2f {
  return cos(fract(z / 6.0) * 6.28 - vec2f(0.0, 33.0)) / 2.0;
}

/** A folded fractal tunnel, flying forward, at `uv` in its frame: y up, 1 = the frame's height. */
fn tunnel(uv: vec2f, time: f32) -> vec3f {
  let t = time / 2.0;
  let c = cos(t / 2.0 + vec4f(0.0, 11.0, 33.0, 0.0));
  let turn = mat2x2f(c.x, c.y, c.z, c.w);
  let sway = drift(t) - cos(t - vec2f(0.0, 33.0)) * 0.2;
  let back = -t - 6.0 * floor(-t / 6.0);
  var o = vec4f(0.0);
  var p = vec3f(0.0);
  var a = 0.0;
  for (var i = 0; i < 200; i++) {
    let d = abs(length(p.xz) / 400.0 - 0.003) + 8e-5;
    a += d;
    p.z = a - back;
    p = vec3f((uv * a + drift(p.z) - sway) * turn, p.z);
    for (var j = 0; j < 6; j++) {
      p = abs(p + p);
      p = select(p.zyx, p.zxy, p.x < p.y) - vec3f(6.0, 5.0, 7.0);
    }
    let hue = clamp(abs(floorMod(vec4f(6.0, 4.0, 2.0, 0.0) + p.z * 3.0, 6.0) - 3.0) - 1.0, vec4f(0.0), vec4f(1.0));
    o += (hue * 0.002 + 0.005) * exp(-300.0 * d);
  }
  return (o * o).rgb;
}

/** One triangle over the glow texture. */
@vertex
fn vsGlow(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

/** The tunnel across the glow texture, which spans ±`glow.zw` of the frame around its centre. */
@fragment
fn fsGlow(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let st = position.xy / mark.glow.xy;
  let uv = vec2f(st.x * 2.0 - 1.0, 1.0 - st.y * 2.0) * mark.glow.zw;
  return vec4f(tunnel(uv, mark.fx.x), 1.0);
}

/** The tunnel as the glow pass drew it, at canvas px. */
fn glowAt(px: vec2f) -> vec3f {
  let uv = vec2f(px.x - mark.fx.y, mark.fx.z - px.y) / mark.fx.w;
  let st = vec2f(uv.x, -uv.y) / (2.0 * mark.glow.zw) + 0.5;
  return textureSampleLevel(glowTexture, maskSampler, st, 0.0).rgb;
}

@fragment
fn fsDepth() -> @location(0) vec4f {
  return vec4f(0.0);
}

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  let n = normalize(in.normal);
  let v = normalize(mark.eye.xyz - in.world);
  let ndv = clamp(dot(n, v), 0.0, 1.0);
  let uv = in.position.xy / mark.backdrop.xy;

  // Into the body and out of its far face: the plane behind shifts towards each tube's middle,
  // so the Wordmark swells across the crown and smears along the walls.
  let t = refract(-v, n, 1.0 / IOR);
  let shift = t.xy / max(-t.z, 0.3) * DEPTH;
  let path = 1.0 / max(ndv, 0.1);
  let bent = uv + shift * mark.lens.xy;
  let glow = glowAt(bent * mark.backdrop.xy);
  let through = (behind(bent) + glow) * CLEAR * exp(-ABSORB * (path - 1.0));

  // Plastic: about four percent reflectance face-on, most of it at grazing.
  let fresnel = 0.04 + 0.8 * pow(1.0 - ndv, 5.0);
  let reflected = studio(reflect(-v, n), in.world, mark.params.y, mark.params.z) * fresnel * EXPOSURE;

  let color = through * (1.0 - fresnel) + vec3f(1.0) - exp(-reflected);
  return vec4f(color, 1.0) * mark.params.x;
}
