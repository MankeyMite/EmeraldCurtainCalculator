import { useEffect, useRef, type RefObject } from "react";
import { type Observations, type Observation } from "../core/constraints";
import { type Memory } from "../core/memory";
import { type Placement, pixelAddress, nibbleValue } from "../core/tiles";
import { backgroundColor, curtainHit } from "../core/window";

export type Hit = ReturnType<typeof pixelAddress> & {
  displayX: number;
  displayY: number;
  flipped: boolean;
};
type Props = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  placements: Placement[];
  bounds: { x: number; y: number; w: number; h: number };
  zoom: number;
  grid: boolean;
  annotated: boolean;
  gameBackground: boolean;
  mainOnly: boolean;
  solver: boolean;
  memory: Memory;
  observations: Observations;
  tool: Observation;
  contradictions: Set<number>;
  onHover: (hit: Hit | null) => void;
  onStart: () => void;
  onPaint: (indices: number[], value: Observation) => void;
  onEnd: () => void;
};
export function PixelGrid(p: Props) {
  const drawing = useRef(false),
    last = useRef<{ x: number; y: number } | null>(null),
    keyIndex = useRef(p.mainOnly ? 16 : 0),
    pendingErase = useRef<number | null>(null);
  const top = p.annotated ? 24 : 0,
    width = p.bounds.w * p.zoom,
    height = p.bounds.h * p.zoom + top;
  function hitAt(x: number, y: number): Hit | null {
    return curtainHit(p.placements, x, y, p.mainOnly);
  }
  useEffect(() => {
    const ctx = p.canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    if (p.gameBackground)
      for (let y = 0; y < p.bounds.h; y++)
        for (let x = 0; x < p.bounds.w; x++) {
          ctx.fillStyle = backgroundColor(p.bounds.x + x, p.bounds.y + y);
          ctx.fillRect(x * p.zoom, y * p.zoom + top, p.zoom, p.zoom);
        }
    for (const t of p.placements) {
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          const a = pixelAddress(t.tile, x, y, t.hflip, t.vflip),
            n = nibbleValue(p.memory, a.nibble);
          // This is an editing scope, not an assertion of empty neighbors.
          if (p.mainOnly && a.slot !== 5) continue;
          const state = p.solver
            ? p.observations[a.nibble]
            : n === null
              ? -1
              : n === 0
                ? 0
                : 1;
          const px = (t.x + x - p.bounds.x) * p.zoom,
            py = (t.y + y - p.bounds.y) * p.zoom + top;
          ctx.fillStyle =
            state === 1 ? "#000000" : state === 0 ? "#ffffff" : "#a4b6c3";
          // Unpainted solver cells are a see-through editing overlay, not
          // observations of zero. Keep their dots distinct from observed
          // transparent pixels; never fade the canvas or painted black pixels.
          const unpaintedOverlay = p.solver && state === -1 && p.gameBackground;
          // Transparent leak pixels reveal the actual pane / window art.
          if (!unpaintedOverlay && (state !== 0 || !p.gameBackground))
            ctx.fillRect(px, py, p.zoom, p.zoom);
          if (state === -1 && p.zoom >= 7) {
            ctx.fillStyle = unpaintedOverlay
              ? "rgba(74,100,115,.4)"
              : "#7e94a5";
            ctx.fillRect(px + p.zoom / 2 - 1, py + p.zoom / 2 - 1, 2, 2);
          }
          if (p.grid) {
            // Bold borders stay inside each cell; its center remains untouched.
            const border = p.zoom >= 8 ? 2 : 1;
            ctx.strokeStyle = "#000000";
            ctx.lineWidth = border;
            ctx.strokeRect(
              px + border / 2,
              py + border / 2,
              p.zoom - border,
              p.zoom - border,
            );
          }
          if (p.annotated && x % 2 === 0) {
            ctx.lineWidth = 1;
            ctx.strokeStyle = "rgba(0,143,113,.45)";
            ctx.beginPath();
            ctx.moveTo(px + 0.5, py);
            ctx.lineTo(px + 0.5, py + p.zoom);
            ctx.stroke();
          }
          if (p.contradictions.has(a.nibble)) {
            ctx.strokeStyle = "#ef435f";
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 1, py + 1, p.zoom - 2, p.zoom - 2);
            ctx.beginPath();
            ctx.moveTo(px + 2, py + 2);
            ctx.lineTo(px + p.zoom - 2, py + p.zoom - 2);
            ctx.stroke();
          }
        }
      if (p.annotated) {
        const px = (t.x - p.bounds.x) * p.zoom;
        ctx.fillStyle = "#123d39";
        ctx.font = "bold 12px monospace";
        ctx.fillText(String(t.tile) + (t.hflip ? " ↔" : ""), px, 16);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#16856e";
        ctx.strokeRect(
          px + 1,
          (t.y - p.bounds.y) * p.zoom + top + 1,
          8 * p.zoom - 2,
          8 * p.zoom - 2,
        );
      }
    }
  }, [p, width, height, top]);
  function coordinates(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x:
        Math.floor(((e.clientX - r.left) * width) / r.width / p.zoom) +
        p.bounds.x,
      y:
        Math.floor((((e.clientY - r.top) * height) / r.height - top) / p.zoom) +
        p.bounds.y,
    };
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    const current = coordinates(e),
      hit = hitAt(current.x, current.y);
    p.onHover(hit);
    if (!drawing.current) return;
    if (pendingErase.current !== null) {
      // A stationary click erases. Once a drag enters another cell, use the
      // selected brush for the entire stroke, including its starting cell.
      if (current.x === last.current?.x && current.y === last.current?.y)
        return;
      pendingErase.current = null;
    }
    const previous = last.current ?? current,
      dx = current.x - previous.x,
      dy = current.y - previous.y,
      steps = Math.max(Math.abs(dx), Math.abs(dy)),
      indices: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(previous.x + dx * (steps ? i / steps : 0)),
        y = Math.round(previous.y + dy * (steps ? i / steps : 0)),
        h = hitAt(x, y);
      if (h) indices.push(h.nibble);
    }
    p.onPaint([...new Set(indices)], p.tool);
    last.current = current;
  }
  function end(e: React.PointerEvent<HTMLCanvasElement>, commitClick = true) {
    if (drawing.current) {
      if (commitClick && pendingErase.current !== null)
        p.onPaint([pendingErase.current], -1);
      pendingErase.current = null;
      drawing.current = false;
      last.current = null;
      p.onEnd();
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }
  return (
    <canvas
      ref={p.canvasRef}
      width={width}
      height={height}
      tabIndex={0}
      role="img"
      title="Click or drag to draw black pixels. Click a black pixel again to erase it."
      aria-label="Curtain pixel grid. Click or drag to paint in solver mode. Arrow keys select a raw pixel; Space paints."
      style={{
        width,
        height,
        cursor: p.solver ? "crosshair" : "help",
        touchAction: "none",
      }}
      onPointerDown={(e) => {
        if (e.button !== 0 || !p.solver) return;
        e.preventDefault();
        e.currentTarget.focus();
        drawing.current = true;
        last.current = coordinates(e);
        const hit = hitAt(last.current.x, last.current.y);
        pendingErase.current =
          hit && p.tool !== -1 && p.observations[hit.nibble] === p.tool
            ? hit.nibble
            : null;
        p.onStart();
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={(e) => end(e)}
      onPointerCancel={(e) => end(e, false)}
      onLostPointerCapture={() => {
        if (drawing.current) {
          pendingErase.current = null;
          drawing.current = false;
          last.current = null;
          p.onEnd();
        }
      }}
      onPointerLeave={() => {
        if (!drawing.current) p.onHover(null);
      }}
      onKeyDown={(e) => {
        const first = p.mainOnly ? 16 : 0,
          last = p.mainOnly ? 175 : 191;
        keyIndex.current = Math.max(first, Math.min(last, keyIndex.current));
        const changes: Record<string, number> = {
          ArrowLeft: -1,
          ArrowRight: 1,
          ArrowUp: -8,
          ArrowDown: 8,
        };
        if (e.key in changes) {
          e.preventDefault();
          keyIndex.current = Math.max(
            first,
            Math.min(last, keyIndex.current + changes[e.key]),
          );
          const n = keyIndex.current;
          p.onHover({
            ...pixelAddress(
              791 + Math.floor(n / 64),
              n % 8,
              Math.floor((n % 64) / 8),
            ),
            displayX: n % 8,
            displayY: Math.floor((n % 64) / 8),
            flipped: false,
          });
        }
        if (e.key === " " && p.solver) {
          e.preventDefault();
          p.onStart();
          p.onPaint([keyIndex.current], p.tool);
          p.onEnd();
        }
      }}
    />
  );
}
