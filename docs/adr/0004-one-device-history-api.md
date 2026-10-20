# One GPU device, History API for Views

The WebGPU device and canvas live for the session. Changing View updates scene state and runs a GPU transition; it does not recreate the device.

URLs are real. Clicks that leave Home are intercepted; `history.pushState` / `popstate` keep the path in sync. The clicked Asset may drive the transition; it does not get its own URL.

Aristide's XHR-and-new-canvas swap is intentionally not copied. Re-init of WebGPU on each navigation is the cost we are avoiding.
