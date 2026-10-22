import type { DrawnTexture } from '../graphics/scene/types';
import type { Client } from './data/works';

/** 1x height of a client logo texture, px; drawn up to 4x. */
const HEIGHT = 64;
/** Logos are flattened to the ink at this alpha, like About's list. */
const INK = 'rgba(0, 0, 0, 0.55)';

/** A client logo as one flat ink color, rasterized from its SVG at the scale shown. */
export function clientTexture(client: Client): DrawnTexture {
  const aspect = client.width / client.height;
  let image: Promise<HTMLImageElement> | null = null;
  return {
    key: `client:${client.src}`,
    px: [Math.round(HEIGHT * aspect * 2), HEIGHT * 2],
    draw: async (scale) => {
      if (!image) {
        const pending = new Image();
        pending.src = client.src;
        image = pending.decode().then(() => pending);
        image.catch(() => (image = null));
      }
      const img = await image;
      const canvas = document.createElement('canvas');
      canvas.height = Math.round(HEIGHT * scale);
      canvas.width = Math.round(HEIGHT * scale * aspect);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No 2D canvas context');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return canvas;
    },
  };
}
