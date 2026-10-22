import { useEffect, useRef } from "react";
import { renderSpinda, SPINDA_ASSETS, spindaPattern } from "../core/spinda";

export function SpindaSprite({
  pid,
  shiny = false,
  overlayPid,
  label,
}: {
  pid: number;
  shiny?: boolean;
  overlayPid?: number;
  label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const pixels = renderSpinda(pid),
      palette = shiny ? SPINDA_ASSETS.shinyPalette : SPINDA_ASSETS.palette;
    const image = ctx.createImageData(64, 64),
      overlay = overlayPid === undefined ? null : spindaPattern(overlayPid),
      target = spindaPattern(pid);
    pixels.forEach((color, n) => {
      if (!color) return;
      let rgb = palette[color];
      if (overlay && overlay[n] !== target[n])
        rgb = overlay[n] ? [67, 212, 236] : [235, 80, 155];
      image.data.set([...rgb, 255], n * 4);
    });
    ctx.putImageData(image, 0, 0);
  }, [pid, shiny, overlayPid]);
  return (
    <canvas
      ref={ref}
      width={64}
      height={64}
      role="img"
      aria-label={
        label ??
        `Emerald Spinda pattern ${pid.toString(16).toUpperCase().padStart(8, "0")}`
      }
      className="spinda-sprite"
    />
  );
}
