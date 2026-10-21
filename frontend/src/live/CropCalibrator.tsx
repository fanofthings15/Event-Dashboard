import { useRef, useState } from "react";
import type { CropRect } from "../settingsTypes";

type Drag = { mode: "move" | "resize"; startX: number; startY: number; start: CropRect } | null;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Full-screen stream with a box to drag over the minimap. Saved per league
// (each league's broadcast layout differs) or for the whole title.
export default function CropCalibrator({
  embed,
  initial,
  leagueLabel,
  sportLabel,
  onSave,
  onReset,
  onClose,
}: {
  embed: string;
  initial: CropRect;
  leagueLabel: string;
  sportLabel: string;
  onSave: (rect: CropRect, scope: "league" | "sport") => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [rect, setRect] = useState<CropRect>(initial);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag>(null);

  const onPointerDown = (mode: "move" | "resize") => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { mode, startX: e.clientX, startY: e.clientY, start: rect };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const frame = frameRef.current?.getBoundingClientRect();
    if (!d || !frame) return;
    const dx = (e.clientX - d.startX) / frame.width;
    const dy = (e.clientY - d.startY) / frame.height;
    if (d.mode === "move") {
      setRect({ ...d.start, x: clamp(d.start.x + dx, 0, 1 - d.start.w), y: clamp(d.start.y + dy, 0, 1 - d.start.h) });
    } else {
      setRect({ ...d.start, w: clamp(d.start.w + dx, 0.03, 1 - d.start.x), h: clamp(d.start.h + dy, 0.03, 1 - d.start.y) });
    }
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div className="live-calibrate" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <div ref={frameRef} className="live-calibrate-frame">
        <iframe src={embed} title="Stream to calibrate" allow="autoplay; encrypted-media" />
        <div
          className="live-calibrate-box"
          style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
          onPointerDown={onPointerDown("move")}
        >
          <span>Minimap</span>
          <div className="live-calibrate-handle" onPointerDown={onPointerDown("resize")} />
        </div>
      </div>
      <div className="live-calibrate-actions">
        <button className="primary" onClick={() => onSave(rect, "league")}>
          Save for {leagueLabel}
        </button>
        <button onClick={() => onSave(rect, "sport")}>Save for all {sportLabel}</button>
        <button onClick={onReset}>Reset to default</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
