import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

interface Props {
  bins: number[];
  edges: number[];
  width?: number;
  height?: number;
}

export function Histogram({ bins, edges, width = 320, height = 180 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const centers = bins.map((_, i) => (edges[i] + edges[i + 1]) / 2);
    const opts: uPlot.Options = {
      width,
      height,
      cursor: { show: true, drag: { setScale: false } },
      legend: { show: false },
      axes: [
        { stroke: "#666", ticks: { stroke: "#ccc" }, grid: { stroke: "#eee" } },
        { stroke: "#666", ticks: { stroke: "#ccc" }, grid: { stroke: "#eee" } },
      ],
      scales: { x: { time: false } },
      series: [
        {},
        {
          stroke: "#333",
          fill: "rgba(80,80,80,0.6)",
          paths: uPlot.paths!.bars!({ size: [0.95, Infinity] }),
          points: { show: false },
        },
      ],
    };
    plotRef.current?.destroy();
    plotRef.current = new uPlot(opts, [centers, bins], ref.current);
    return () => {
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [bins, edges, width, height]);

  return <div ref={ref} />;
}
