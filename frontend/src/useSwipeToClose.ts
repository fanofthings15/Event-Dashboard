import { useRef, useState, type CSSProperties, type TouchEvent } from "react";

// Drag a bottom sheet down to close it (phones). Only starts when the sheet
// is scrolled to the top, so swiping through long content still scrolls;
// let go past CLOSE_PX and it closes, otherwise it springs back.
const CLOSE_PX = 90;

export function useSwipeToClose(onClose: () => void) {
  const startY = useRef<number | null>(null);
  const [dy, setDy] = useState(0);

  const handlers = {
    onTouchStart(e: TouchEvent<HTMLElement>) {
      startY.current = e.currentTarget.scrollTop <= 0 ? e.touches[0].clientY : null;
    },
    onTouchMove(e: TouchEvent<HTMLElement>) {
      if (startY.current === null) return;
      setDy(Math.max(0, e.touches[0].clientY - startY.current));
    },
    onTouchEnd() {
      if (dy > CLOSE_PX) onClose();
      startY.current = null;
      setDy(0);
    },
  };
  const style: CSSProperties = dy ? { transform: `translateY(${dy}px)`, transition: "none" } : { transition: "transform 0.2s ease" };
  return { handlers, style };
}
