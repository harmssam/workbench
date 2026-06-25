import { useCallback, useEffect, useRef, useState } from "react";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readStoredWidth(
  storageKey: string,
  defaultWidth: number,
  minWidth: number,
  maxWidth: number,
): number {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = Number(stored);
      if (!Number.isNaN(parsed)) {
        return clamp(parsed, minWidth, maxWidth);
      }
    }
  } catch {
    // ignore
  }
  return defaultWidth;
}

export function useResizableWidth({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
}: {
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}) {
  const [width, setWidth] = useState(() =>
    readStoredWidth(storageKey, defaultWidth, minWidth, maxWidth),
  );
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  const onResizeStart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      setDragging(true);

      const startX = event.clientX;
      const startWidth = widthRef.current;

      function onMouseMove(moveEvent: MouseEvent) {
        const next = clamp(
          startWidth + (moveEvent.clientX - startX),
          minWidth,
          maxWidth,
        );
        setWidth(next);
      }

      function onMouseUp() {
        setDragging(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        try {
          localStorage.setItem(storageKey, String(widthRef.current));
        } catch {
          // ignore
        }
      }

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [maxWidth, minWidth, storageKey],
  );

  useEffect(() => {
    if (!dragging) return;
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging]);

  return { width, dragging, onResizeStart };
}