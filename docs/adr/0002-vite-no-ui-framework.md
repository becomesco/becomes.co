# Vite bundler, no UI framework

The runtime is TypeScript, native HTML/CSS, and the Engine. Vite is the bundler (modules, WGSL, assets). React, Vue, and Astro stay out: they add reconciliation and scheduling the frame loop cannot share.

GSAP is out by default for the same reason: motion goes through one scheduler.
