import { useEffect, useRef, type RefObject } from "react";
import { type Observations, type Observation } from "../core/constraints";
import { type Memory } from "../core/memory";
import { type Placement, pixelAddress, nibbleValue } from "../core/tiles";
import { backgroundColor, curtainHit } from "../core/window";
import { bitmapCoordinates } from "../core/canvasCoordinates";
import { drawingPixelState, toggleDrawingPixel } from "../core/drawing";

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
  editable?: boolean;
  memory: Memory;
  observations: Observations;
  referenceObservations?: Observations;
  contradictions: Set<number>;
  predictions?: Observations;
  targets?: number[];
  highlightedNibble?: number | null;
  onSelect?: (hit: Hit) => void;
  onHover: (hit: Hit | null) => void;
  onStart: () => void;
  onPaint: (indices: number[], value: Observation) => void;
  onEnd: () => void;
};
export function PixelGrid(p: Props) {
  const drawing = useRef(false),
    last = useRef<{ x: number; y: number } | null>(null),
    keyIndex = useRef(p.mainOnly ? 16 : 0),
    strokeValue = useRef<0 | 1>(1);
  const top = p.annotated ? 24 : 0,
    width = p.bounds.w * p.zoom,
    height = p.bounds.h * p.zoom + top;
  function hitAt(x: number, y: number): Hit | null {
    if (
      x < p.bounds.x ||
      x >= p.bounds.x + p.bounds.w ||
      y < p.bounds.y ||
      y >= p.bounds.y + p.bounds.h
    )
      return null;
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
          const observed = p.observations[a.nibble];
          const predicted = p.predictions?.[a.nibble] ?? -1;
          const automatic = p.solver && observed === -1 && predicted !== -1;
          const reference =
            p.solver &&
            !automatic &&
            observed === -1 &&
            p.referenceObservations?.[a.nibble] !== undefined &&
            p.referenceObservations[a.nibble] !== -1;
          const state = p.solver
            ? drawingPixelState(
                observed,
                predicted,
                p.referenceObservations?.[a.nibble],
              )
            : n === null
              ? -1
              : n === 0
                ? 0
                : 1;
          const px = (t.x + x - p.bounds.x) * p.zoom,
            py = (t.y + y - p.bounds.y) * p.zoom + top;
          ctx.fillStyle =
            state === 1 ? "#000000" : state === 0 ? "#ffffff" : "#a4b6c3";
          // Blank drawing cells look transparent without becoming observations.
          // Transparent pixels reveal the actual pane / window art.
          if (state !== 0 || !p.gameBackground)
            ctx.fillRect(px, py, p.zoom, p.zoom);
          if (state === -1 && p.zoom >= 7) {
            ctx.fillStyle = "#7e94a5";
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
          if (
            p.solver &&
            automatic &&
            p.predictions &&
            p.predictions[a.nibble] !== -1
          ) {
            ctx.strokeStyle =
              p.predictions[a.nibble] === 1 ? "#176db0" : "#00a595";
            ctx.lineWidth = Math.max(1, p.zoom / 8);
            ctx.setLineDash([Math.max(1, p.zoom / 5), Math.max(1, p.zoom / 7)]);
            ctx.strokeRect(
              px + 3,
              py + 3,
              Math.max(1, p.zoom - 6),
              Math.max(1, p.zoom - 6),
            );
            ctx.setLineDash([]);
          }
          if (reference) {
            ctx.strokeStyle = "#8a98a4";
            ctx.lineWidth = Math.max(1, p.zoom / 12);
            ctx.setLineDash([2, 3]);
            ctx.strokeRect(
              px + 3,
              py + 3,
              Math.max(1, p.zoom - 6),
              Math.max(1, p.zoom - 6),
            );
            ctx.setLineDash([]);
          }
          if (p.solver && p.targets?.includes(a.nibble)) {
            ctx.strokeStyle = "#e78510";
            ctx.lineWidth = Math.max(2, p.zoom / 6);
            ctx.strokeRect(
              px + 2,
              py + 2,
              Math.max(1, p.zoom - 4),
              Math.max(1, p.zoom - 4),
            );
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
          if (p.highlightedNibble === a.nibble) {
            ctx.strokeStyle = "#db7b12";
            ctx.lineWidth = Math.max(2, p.zoom / 5);
            ctx.strokeRect(
              px + 2,
              py + 2,
              Math.max(1, p.zoom - 4),
              Math.max(1, p.zoom - 4),
            );
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
    const bitmap = bitmapCoordinates(
      e.clientX,
      e.clientY,
      e.currentTarget.getBoundingClientRect(),
      width,
      height,
      getComputedStyle(e.currentTarget).objectFit === "contain",
    );
    return {
      x: Math.floor(bitmap.x / p.zoom) + p.bounds.x,
      y: Math.floor((bitmap.y - top) / p.zoom) + p.bounds.y,
    };
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    const current = coordinates(e),
      hit = hitAt(current.x, current.y);
    p.onHover(hit);
    if (!drawing.current) return;
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
    p.onPaint([...new Set(indices)], strokeValue.current);
    last.current = current;
  }
  function end(e: React.PointerEvent<HTMLCanvasElement>) {
    if (drawing.current) {
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
      title="Click or drag to draw black pixels. Click a black pixel again to erase it to transparent."
      aria-label="Curtain pixel grid. Click toggles black and transparent; drag continues that color. Arrow keys select a raw pixel; Space toggles it."
      style={{
        width,
        height,
        // Use the arrow's tip as the target, rather than a crosshair/help glyph
        // whose center or question-mark can look like a half-cell offset.
        cursor: "default",
        touchAction:
          p.solver && p.editable !== false ? "none" : "pan-y pinch-zoom",
      }}
      onPointerDown={(e) => {
        const point = coordinates(e),
          selected = hitAt(point.x, point.y);
        if (selected) {
          keyIndex.current = selected.nibble;
          p.onSelect?.(selected);
          p.onHover(selected);
        }
        if (!selected || e.button !== 0 || !p.solver || p.editable === false)
          return;
        e.preventDefault();
        e.currentTarget.focus();
        drawing.current = true;
        last.current = coordinates(e);
        strokeValue.current = toggleDrawingPixel(
          p.observations[selected.nibble],
          p.predictions?.[selected.nibble],
          p.referenceObservations?.[selected.nibble],
        );
        p.onStart();
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={(e) => end(e)}
      onPointerCancel={(e) => {
        end(e);
        p.onHover(null);
      }}
      onLostPointerCapture={() => {
        if (drawing.current) {
          drawing.current = false;
          last.current = null;
          p.onEnd();
        }
      }}
      onPointerLeave={() => p.onHover(null)}
      onBlur={() => p.onHover(null)}
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
          const selected = {
            ...pixelAddress(
              791 + Math.floor(n / 64),
              n % 8,
              Math.floor((n % 64) / 8),
            ),
            displayX: n % 8,
            displayY: Math.floor((n % 64) / 8),
            flipped: false,
          };
          p.onSelect?.(selected);
          p.onHover(selected);
        }
        if (e.key === " " && p.solver && p.editable !== false) {
          e.preventDefault();
          p.onStart();
          const index = keyIndex.current;
          p.onPaint(
            [index],
            toggleDrawingPixel(
              p.observations[index],
              p.predictions?.[index],
              p.referenceObservations?.[index],
            ),
          );
          p.onEnd();
        }
      }}
    />
  );
}
