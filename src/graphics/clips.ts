interface Clip {
  el: HTMLVideoElement;
  texture: GPUTexture;
  /** Frame stamp of the last `show`; a clip not shown by `settle` pauses. */
  shown: number;
  /** Autoplay was refused (Low Power Mode, data saver); the poster stays. */
  refused: boolean;
  callback: number;
  time: number;
}

const frameCallbacks = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

/**
 * Looping video Assets. Each plays muted while its Asset is drawn and pauses the frame it is
 * not; every decoded frame is copied into the texture its poster was uploaded to, and wakes
 * the scheduler, so a visible clip redraws the Scene at the clip's own frame rate, not the display's.
 */
export class Clips {
  private clips = new Map<string, Clip>();
  private frame = 0;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(
    private device: GPUDevice,
    private onFrame: () => void,
  ) {
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Plays `url` into `texture` this frame. `texture` is the poster's, sized like the video. */
  show(key: string, url: string, texture: GPUTexture): void {
    if (this.reduced.matches || document.hidden) return;
    let clip = this.clips.get(key);
    if (!clip || clip.texture !== texture) {
      if (clip) this.release(key);
      clip = this.create(url, texture);
      this.clips.set(key, clip);
    }
    clip.shown = this.frame;
    if (clip.refused) return;
    if (clip.el.paused) {
      clip.el.play().catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'NotAllowedError') clip.refused = true;
      });
    }
    if (!frameCallbacks) {
      if (clip.el.currentTime !== clip.time) {
        clip.time = clip.el.currentTime;
        this.upload(clip);
      }
      this.onFrame();
    }
  }

  /** End of a frame: pauses every clip that was not drawn in it. */
  settle(): void {
    for (const clip of this.clips.values()) {
      if (clip.shown !== this.frame && !clip.el.paused) clip.el.pause();
    }
    this.frame++;
  }

  /** Stops a clip and frees its decoder; call before its texture is destroyed. */
  release(key: string): void {
    const clip = this.clips.get(key);
    if (!clip) return;
    this.clips.delete(key);
    if (frameCallbacks) clip.el.cancelVideoFrameCallback(clip.callback);
    clip.el.pause();
    clip.el.removeAttribute('src');
    clip.el.load();
  }

  destroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const key of [...this.clips.keys()]) this.release(key);
  }

  private create(url: string, texture: GPUTexture): Clip {
    const el = document.createElement('video');
    el.muted = true;
    el.defaultMuted = true;
    el.loop = true;
    el.playsInline = true;
    el.disablePictureInPicture = true;
    el.preload = 'auto';
    el.setAttribute('muted', '');
    el.setAttribute('playsinline', '');
    el.src = url;
    const clip: Clip = { el, texture, shown: this.frame, refused: false, callback: 0, time: -1 };
    if (frameCallbacks) {
      const next = () => {
        clip.callback = el.requestVideoFrameCallback(() => {
          this.upload(clip);
          next();
        });
      };
      next();
    }
    return clip;
  }

  private upload({ el, texture }: Clip): void {
    if (el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (el.videoWidth !== texture.width || el.videoHeight !== texture.height) return;
    this.device.queue.copyExternalImageToTexture(
      { source: el },
      { texture, premultipliedAlpha: true },
      [texture.width, texture.height],
    );
    this.onFrame();
  }

  private onVisibility = (): void => {
    if (document.hidden) {
      for (const clip of this.clips.values()) clip.el.pause();
    } else {
      this.onFrame();
    }
  };
}
