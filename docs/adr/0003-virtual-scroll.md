# Virtual scroll on every View

Home is a sequence of full-viewport beats (loader, landing, Works). Work Views are long media documents. Both, plus About, use virtual scroll: non-native position, lerp on the shared scheduler, GPU as the visual output. This matches the Aristide Benoist interaction model we are copying, not native `scrollTop`.

Native document scroll remains an Engine capability, not the site default. `prefers-reduced-motion` still has to be respected (cut lerp travel, shorten transitions, keep Views reachable).
