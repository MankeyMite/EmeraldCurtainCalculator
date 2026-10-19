type Rectangle = { left: number; top: number; width: number; height: number };

// CSS object-fit can center a smaller image inside the canvas element. Pointer
// coordinates must use that image's bounds, just like the displayed pixels.
export function bitmapCoordinates(
  clientX: number,
  clientY: number,
  rectangle: Rectangle,
  bitmapWidth: number,
  bitmapHeight: number,
  contain = false,
) {
  const scale = Math.min(
    rectangle.width / bitmapWidth,
    rectangle.height / bitmapHeight,
  );
  const width = contain ? bitmapWidth * scale : rectangle.width;
  const height = contain ? bitmapHeight * scale : rectangle.height;
  const left = rectangle.left + (rectangle.width - width) / 2;
  const top = rectangle.top + (rectangle.height - height) / 2;
  return {
    x: ((clientX - left) * bitmapWidth) / width,
    y: ((clientY - top) * bitmapHeight) / height,
  };
}
