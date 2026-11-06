interface Loop {
  video: HTMLVideoElement;
  texture: GPUTexture;
  /** Frame stamp of the last `show`. */
  drawn: number;
  /** The clip has a frame the texture does not hold yet. */
  fresh: boolean;
  /** False once released; its pending frame callback then stops. */
  alive: boolean;
}

/**
 * Video that plays on its own, not by scroll: a muted, looping clip copied into the texture
 * its poster was uploaded to, one copy per new video frame. A clip plays only while it is
 * drawn and pauses in the first frame it is not. Each new video frame asks for one more
 * render, so a still page with a clip in view renders at the clip's frame rate, not the display's.
 */
export class Loops {
  private loops = new Map<string, Loop>();
  private frame = 0;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(
    private device: GPUDevice,
    private onFrame: () => void,
  ) {}

  show(key: string, url: string, texture: GPUTexture): void {
    if (this.reduced.matches) return;
    let loop = this.loops.get(key);
    if (!loop) {
      loop = { video: this.createVideo(url), texture, drawn: this.frame, fresh: false, alive: true };
      this.loops.set(key, loop);
      this.watch(loop);
    }
    if (loop.texture !== texture) {
      loop.texture = texture;
      loop.fresh = true;
    }
    loop.drawn = this.frame;
    const { video } = loop;
    if (video.paused) video.play().catch(() => {});
    if (!('requestVideoFrameCallback' in video)) {
      loop.fresh = true;
      this.onFrame();
    }
    if (!loop.fresh || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (video.videoWidth !== texture.width || video.videoHeight !== texture.height) return;
    this.device.queue.copyExternalImageToTexture({ source: video }, { texture }, [texture.width, texture.height]);
    loop.fresh = false;
  }

  /** End of a frame: clips that were not drawn in it pause. */
  settle(): void {
    for (const loop of this.loops.values()) {
      if (loop.drawn !== this.frame && !loop.video.paused) loop.video.pause();
    }
    this.frame++;
  }

  /** Stops a clip and lets its buffers go; call before its texture is destroyed. */
  release(key: string): void {
    const loop = this.loops.get(key);
    if (!loop) return;
    this.loops.delete(key);
    loop.alive = false;
    loop.video.pause();
    loop.video.removeAttribute('src');
    loop.video.load();
  }

  destroy(): void {
    for (const key of [...this.loops.keys()]) this.release(key);
  }

  private createVideo(url: string): HTMLVideoElement {
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    return video;
  }

  private watch(loop: Loop): void {
    const { video } = loop;
    if (!('requestVideoFrameCallback' in video)) return;
    const next = () => {
      if (!loop.alive) return;
      loop.fresh = true;
      this.onFrame();
      video.requestVideoFrameCallback(next);
    };
    video.requestVideoFrameCallback(next);
  }
}
