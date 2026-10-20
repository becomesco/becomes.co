# becomes.co

The public studio site for Becomes. An internal WebGPU engine renders the experience. This repo is not a published graphics library.

## Language

**Work**:
A shipped piece on the site. It appears on Home and has a View at `/:slug`.
_Avoid_: project, product, case study, portfolio piece

**Asset**:
Media that belongs to a Work. Clicking an Asset on Home opens that Work. Figma is not the Asset inventory.
_Avoid_: image, texture, attachment

**View**:
A routed state of the site: Home, a Work, About, or Contact.
_Avoid_: page (use View for scene state; URL for the path)

**Home**:
The `/` View: loader, landing manifesto, then virtual scroll through Works. Scrolling Home does not change the URL.

**About**:
The `/about` View. GPU for the transition and experimental visuals; readable copy in the browser layer.

**Contact**:
The `/contact` View. Native HTML form; GPU for background and transition only.

**Loader**:
The intro into Home: the Glass mark and Wordmark on black, ending in the landing manifesto. Plays in full once per browser session; later loads get a short version. Not a View and not a URL.

**Glass mark**:
The 3D glass "b" brand mark. Shown in the Loader and on About.
_Avoid_: logomark, glass logo, logo

**Wordmark**:
The "becomes" letters, in the Loader and in Chrome.
_Avoid_: logo, logotype, becomes text

**Chrome**:
The persistent Wordmark and About/Contact controls. Lives in the browser layer, above the canvas.

**Browser layer**:
HTML, CSS, canvas host, input capture, Chrome, native controls, the Contact form, and About copy.

**WebGPU rendering layer**:
GPU device, pipelines, resources, scene composition, and shaders.

**Layer**:
A composable visual object in a Scene (quad, particles, text, distortion, an Asset on the canvas).
_Avoid_: using Layer alone for the browser layer or the WebGPU rendering layer

**Scene**:
The composed visuals for the current View.

**Renderer**:
Owns the GPU lifecycle: device, context, pipelines, command submission, device-loss recovery.

**Engine**:
The internal graphics, motion, and scroll package the site uses. Not a separate product.

**Virtual scroll**:
The site's scroll mechanism. Wheel and touch update a virtual position; the scheduler lerps; the GPU follows. Native document scroll is not the default.
