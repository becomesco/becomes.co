# Stack

Engineering rules for becomes.co. Glossary: `CONTEXT.md`. Decisions: `docs/adr/`. Visual direction: [Becomes.co Figma, Website](https://www.figma.com/design/WhPgDfC69dZQlB8U0uZ4q6/Becomes.co?node-id=64-110). Figma is not the Asset inventory.

## Default stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Graphics | Native WebGPU, WGSL |
| Bundler | Vite |
| DOM / CSS | Native, browser layer |
| Motion | One `requestAnimationFrame` scheduler |
| Scroll | Virtual scroll (ADR 0003) |
| Routing | History API, one live GPU device (ADR 0004) |
| Fallback | HTML/CSS when WebGPU is missing |
| Hosting | Static / CDN, plus `/api/contact` |

Do not add Three.js, React Three Fiber, React, Vue, Astro, or GSAP unless a later ADR says so. Rust and WASM stay optional tooling, not the runtime.

## Who owns what

**WebGPU rendering layer** owns experimental visuals: image and video on the GPU, distortion, particles, procedural backgrounds, Work Asset compositing, View transitions, compute when the workload is large enough to beat CPU plus upload cost.

**Browser layer** owns structure, the canvas element, Chrome, viewport, native forms (Contact), readable About copy, keyboard and screen-reader paths, and fallback UI.

Put a control in the GPU only when HTML/CSS cannot deliver the motion or look. Ordinary labels, the Contact form, and selectable About text stay in the DOM.

SEO does not drive architecture. Views still have real URLs and document titles because History API and sharing need them.

## Views

| View | URL | Notes |
|---|---|---|
| Home | `/` | Loader, landing, virtual scroll through Works. URL unchanged while scrolling. |
| Work | `/:slug` | Opened by clicking an Asset that belongs to that Work. |
| About | `/about` | GPU + HTML copy. |
| Contact | `/contact` | HTML form; GPU background/transition. |

Chrome stays mounted across Views. Loader is an intro into Home, not a route.

A click on a Home Asset runs a GPU transition into that Work. The Asset can be the morph source. There is no per-Asset URL.

## Engine vs site

`src/app` boots the site, owns View state, Chrome, and data. `src/graphics` (the Engine) is reusable in *shape*: no import of app or Vite HTML. Do not publish it until a second consumer exists.

Prefer one canvas and one device. Extra canvases need a measured reason.

## Scheduler

One loop for custom JS motion:

1. Sample input (pointer, virtual scroll, keyboard, viewport).
2. Advance time (elapsed, not assumed 60 Hz).
3. Update motion and Scene transforms.
4. Upload changed GPU data.
5. Encode and submit.
6. Schedule the next frame only if the Scene is not idle.

Event handlers write state. They do not draw. Idle Home/Work with no motion skips continuous redraw.

## GPU engine

Cache pipelines, buffers, textures, samplers, bind groups. Release unused resources. Batch and instance when profiling says draw-call count is the cost; do not fatten shaders just to cut draws. Avoid GPU readbacks in the frame loop.

Shaders live as materials in WGSL. Keep full-screen fragment work cheap.

When a Layer tracks a DOM node: measure, convert to render space, cache, update on layout/viewport change, skip layout reads inside the draw path. Home and Work Scenes that use their own coordinates skip DOM sync.

## Media

Prepare resolutions and compressed delivery at build time. Upload textures on demand. Pause hidden video. Prefer a pre-rendered clip when it is cheaper than a live effect; use live rendering when the interaction needs it.

GPU text (SDF / atlas / instanced glyphs) is for experimental type. Chrome, About body, and Contact copy use native typography.

## Compatibility

Detect WebGPU. Recover from device loss. Honor `prefers-reduced-motion`. Keep Chrome and Contact usable if the GPU path dies.

Modes: WebGPU (primary), WebGL2 (only with a named requirement), HTML/CSS (fallback, not a visual twin).

## Performance contract

- Sustain 60 FPS on WebGPU-capable iOS Safari and Android Chrome from roughly the last two years of flagship/mid devices.
- 120+ FPS on capable desktop displays.
- Frame-time stability over average FPS.
- Adaptive quality (resolution, DPR, texture size, particle count, passes) without breaking layout. No rapid resolution flicker.

Frame intervals: 60 Hz 16.67 ms, 90 Hz 11.11 ms, 120 Hz 8.33 ms, 144 Hz 6.94 ms. The app does not own the whole interval.

## Intended tree

Create paths when code needs them.

```
src/
  app/
    main.ts
    lifecycle.ts
  core/
    scheduler.ts
    clock.ts
    viewport.ts
    input.ts
    pointer.ts
    scroll.ts
    motion.ts
  graphics/
    engine.ts
    renderer.ts
    capabilities.ts
    resources.ts
    pipelines.ts
    scene/
    layers/
    materials/
    shaders/
    geometry/
  media/
  ui/
    overlays/
    controls/
  styles/
    global.css
  utils/
  tests/
```

## Build phases

Each phase is done when its deliverable exists and the previous phase still holds.

1. **Foundation.** Canvas, adapter/device, one pipeline, textured quad, resize, scheduler. Deliverable: a stable WebGPU present loop.
2. **Input and motion.** Pointer, virtual scroll, easing/springs, time-based motion, uniforms from input. Deliverable: interaction reaches the GPU on the same frame loop.
3. **Effects.** Only shaders the Figma motion needs (distortion, displacement, transition, masks). Deliverable: a small production shader set, not a catalog.
4. **Scene.** Layers, order, shared resources, visibility, Home beats and Work layout. Deliverable: composable Scene.
5. **Optimize.** Profile frame times, JS, passes, draws, memory, input latency on the contract devices. Deliverable: the contract in § Performance, measured.
6. **Harden.** Capability detect, HTML/CSS fallback, device-loss, cleanup, adaptive quality, reduced-motion, errors. Deliverable: GPU failure does not kill Chrome or Contact.

## Gates

**Graphics**

- [ ] Custom rendering is WebGPU + WGSL.
- [ ] Pipelines and resources are cached and released.
- [ ] One device for the session; View changes do not re-init GPU.
- [ ] Invisible Layers are not drawn.
- [ ] Canvas resolution is managed; quality can drop without layout break.
- [ ] Init failure and device-loss are handled.

**Motion**

- [ ] One scheduler.
- [ ] Virtual scroll on Home, Work, About.
- [ ] Motion is time-based.
- [ ] Clicked Asset can morph into the Work View.
- [ ] Idle Scenes do not free-run.
- [ ] Reduced-motion is implemented.

**Performance**

- [ ] Contract devices and frame rates are tested, not assumed.
- [ ] Long frames are investigated.
- [ ] Memory is stable across extended Home scrolling and Work Views.

**Reliability**

- [ ] No-WebGPU gets a usable HTML/CSS path.
- [ ] `/about` and `/contact` remain reachable.
- [ ] `about` and `contact` cannot be Work slugs.
- [ ] Resize and orientation are handled.
- [ ] Pointer and touch remain predictable.

## Dependencies

Add a library only after: runtime cost, frame-loop interference, WebGPU compatibility, and whether a native API already does it. A general-purpose 3D engine for a handful of effects is the wrong trade.
