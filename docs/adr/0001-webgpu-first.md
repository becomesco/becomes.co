# Native WebGPU is the primary renderer

Custom visuals, distortion, particles, transitions, and GPU simulation are native WebGPU with WGSL. Three.js, React Three Fiber, and a WebGL-first engine were rejected so the pipeline, resources, and frame loop stay under direct control.

WebGL2 is a documented secondary mode only if a named product requirement justifies maintaining two GPU paths. Until then, unsupported devices get HTML/CSS, not a second shader stack.
