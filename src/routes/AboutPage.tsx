import { Link } from "react-router-dom";
import { useManifest } from "../data/manifest";

export function AboutPage() {
  const m = useManifest();
  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 720,
        margin: "40px auto",
        padding: "0 24px",
        lineHeight: 1.55,
        color: "#222",
      }}
    >
      <h1 style={{ marginBottom: 8 }}>EW CDR Checkpoint Explorer</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        <Link to="/">← back to canvas</Link>
      </p>
      <p>
        A read-only view of the enhanced-weathering CDR calculation as published
        by Isometric for Alt Carbon's Darjeeling project. Every named
        intermediate variable in <code>code.py</code> /{" "}
        <code>run_chain.py</code> is a node on the canvas.
      </p>
      <p>
        Reported result: <strong>p16 = 4,704 tonnes CO₂</strong> (registry
        value).
        {m && m.computed_p16 !== null && (
          <>
            {" "}
            This run computed{" "}
            <strong>{m.computed_p16.toFixed(2)} tonnes</strong> (
            {Math.abs(m.computed_p16 - m.registry_p16).toFixed(2)} Δ).
          </>
        )}
      </p>
      <p>
        The chain runs 200,000 paired bootstrap iterations with seed 42. Every
        intermediate is a distribution; the histogram in the sidebar shows its
        shape. Scalars are pinned values such as the median control correction.
        DataFrames are tabular inputs and reports.
      </p>
      <p>
        Calculation methodology: tracer-corrected Total Cation Approach using
        titanium as immobile tracer, with paired baseline → reporting-period
        bootstrap and a p50 control-correction ratio. See <code>code.py</code>{" "}
        for the source of truth and <code>checkpoint_plan.md</code> for the
        annotated DAG.
      </p>
      {m && (
        <p style={{ color: "#888", fontSize: 12 }}>
          Manifest generated {m.generated_at}. Chain wall time:{" "}
          {m.total_duration_s?.toFixed(1)}s.
        </p>
      )}
    </div>
  );
}
