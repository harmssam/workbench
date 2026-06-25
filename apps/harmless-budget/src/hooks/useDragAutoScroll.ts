import { useEffect, type RefObject } from "react";

const EDGE_PX = 100;
const MAX_SPEED = 22;

/** Auto-scroll a container while dragging near top/bottom edges (pointer-based). */
export function useDragAutoScroll(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  getClientY: () => number,
) {
  useEffect(() => {
    if (!active) return;

    let frame = 0;

    function tick() {
      const container = containerRef.current;
      if (!container) {
        frame = requestAnimationFrame(tick);
        return;
      }

      const clientY = getClientY();
      const rect = container.getBoundingClientRect();
      const maxScroll = container.scrollHeight - container.clientHeight;
      const canScrollUp = container.scrollTop > 0;
      const canScrollDown = container.scrollTop < maxScroll - 1;

      const nearTop =
        clientY <= rect.top + EDGE_PX || clientY <= EDGE_PX;
      const nearBottom =
        clientY >= rect.bottom - EDGE_PX ||
        clientY >= window.innerHeight - EDGE_PX;

      if (nearTop && canScrollUp) {
        const dist = Math.min(clientY - rect.top, clientY, EDGE_PX);
        const intensity = 1 - Math.max(0, dist) / EDGE_PX;
        container.scrollTop -= Math.ceil(MAX_SPEED * Math.max(0.35, intensity));
      } else if (nearBottom && canScrollDown) {
        const fromContainerBottom = rect.bottom - clientY;
        const fromViewportBottom = window.innerHeight - clientY;
        const dist = Math.min(fromContainerBottom, fromViewportBottom, EDGE_PX);
        const intensity = 1 - Math.max(0, dist) / EDGE_PX;
        container.scrollTop += Math.ceil(MAX_SPEED * Math.max(0.35, intensity));
      }

      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, containerRef, getClientY]);
}