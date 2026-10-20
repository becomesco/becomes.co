# becomes.co

WebGPU studio site. Read `CONTEXT.md` before using Work, Asset, View, Layer, browser layer, WebGPU rendering layer, Chrome, or virtual scroll.

## Stack

Vite + TypeScript + native HTML/CSS + native WebGPU/WGSL. No UI framework. Engine stays in-repo.

- Changing renderer, shaders, fallbacks, or GPU resources: `docs/stack.md` and `docs/adr/0001-webgpu-first.md`.
- Changing bundler, React/Astro/GSAP, or app framework: `docs/adr/0002-vite-no-ui-framework.md`.
- Changing scroll or the animation loop: `docs/stack.md` and `docs/adr/0003-virtual-scroll.md`.
- Changing routing, canvas lifetime, or View transitions: `docs/adr/0004-one-device-history-api.md` and `docs/adr/0005-work-urls-at-root.md`.
- Implementing a screen or motion from design: [Becomes.co Figma, Website](https://www.figma.com/design/WhPgDfC69dZQlB8U0uZ4q6/Becomes.co?node-id=64-110). Figma is visual direction; Asset counts come from data, not the file.

Quality gates and the intended `src/` tree: `docs/stack.md`.
