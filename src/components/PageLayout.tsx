/**
 * Shared chrome for non-canvas routes (AboutPage, SensitivityPage). Keeps
 * container, heading, back-link and typography consistent. `maxWidth` is
 * customisable so the text-heavy About page can stay narrow (680) while
 * the chart-heavy Sensitivity page can run wider (960).
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store";

interface Props {
  title: string;
  /** Optional one-line sub-paragraph rendered under the title. */
  subtitle?: ReactNode;
  maxWidth?: number;
  children: ReactNode;
}

export function PageLayout({ title, subtitle, maxWidth = 720, children }: Props) {
  const removalId = useStore((s) => s.removalId);
  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth,
        margin: "40px auto",
        padding: "0 24px",
        lineHeight: 1.6,
        color: "#222",
      }}
    >
      <p
        style={{
          color: "#666",
          marginTop: 0,
          marginBottom: 16,
          fontSize: 13,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Link to={`/?removal=${removalId}`} style={{ color: "#666" }}>
          ← back to canvas
        </Link>
        <a
          href="https://github.com/shubhxms/erw-cdr-explorer"
          target="_blank"
          rel="noreferrer"
          style={{ color: "#666" }}
        >
          github
        </a>
      </p>
      <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>{title}</h1>
      {subtitle && (
        <p style={{ color: "#666", marginTop: 0, marginBottom: 24, fontSize: 13 }}>
          {subtitle}
        </p>
      )}
      {children}
    </div>
  );
}
