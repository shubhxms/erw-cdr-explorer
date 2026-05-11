import { useEffect, useRef } from "react";

interface Props {
  width: number;
  setWidth: (w: number) => void;
  min: number;
  max: number;
}

/**
 * Vertical resize handle pinned to the left edge of the sidebar.
 * Drag to resize; double-click to reset to the default (max/2-ish).
 */
export function ResizeHandle({ width, setWidth, min, max }: Props) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const dx = startX.current - e.clientX; // dragging left grows the sidebar
      const next = Math.min(max, Math.max(min, startW.current + dx));
      setWidth(next);
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [min, max, setWidth]);

  return (
    <div
      onMouseDown={(e) => {
        dragging.current = true;
        startX.current = e.clientX;
        startW.current = width;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      onDoubleClick={() => setWidth(480)}
      title="Drag to resize · double-click to reset"
      style={{
        position: "absolute",
        left: -4,
        top: 0,
        bottom: 0,
        width: 8,
        cursor: "col-resize",
        zIndex: 10,
        // visual: a thin centered line that gets a touch darker on hover
        background: "transparent",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 3,
          top: 0,
          bottom: 0,
          width: 1,
          background: "#ddd",
        }}
      />
    </div>
  );
}
