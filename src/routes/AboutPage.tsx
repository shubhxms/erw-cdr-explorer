import { Link } from "react-router-dom";
import { useManifest } from "../data/manifest";

export function AboutPage() {
  const m = useManifest();
  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 680,
        margin: "40px auto",
        padding: "0 24px",
        lineHeight: 1.6,
        color: "#222",
      }}
    >
      <h1 style={{ marginBottom: 4, fontSize: 22 }}>EW CDR Checkpoint Explorer</h1>
      <p style={{ color: "#666", marginTop: 0, marginBottom: 24 }}>
        <Link to="/">back to canvas</Link>
      </p>

      <h2 style={{ fontSize: 16, marginTop: 0 }}>What is this?</h2>
      <p>
        An interactive visualization of the enhanced-weathering carbon dioxide
        removal (CDR) calculation for <strong>Alt Carbon's Darjeeling project</strong>,
        published on the <a href="https://isometric.com" target="_blank" rel="noreferrer">Isometric</a> registry.
        Every named intermediate variable in the calculation chain appears as a
        node on the DAG canvas — click any node to inspect its distribution,
        summary statistics, and provenance.
      </p>

      <h2 style={{ fontSize: 16 }}>How does the chain work?</h2>
      <p>
        The calculation follows the <strong>tracer-corrected Total Cation Approach</strong>:
      </p>
      <ol style={{ paddingLeft: 20 }}>
        <li><strong>Inputs</strong> — Raw soil samples, feedstock composition (Ca, Mg, Ti), bulk density, and plot areas are loaded.</li>
        <li><strong>Cleaning</strong> — Zero-filtering and winsorisation remove outliers per sampling event and plot type.</li>
        <li><strong>Bootstrap</strong> — Bulk density, feedstock cation means, and control-correction ratios are bootstrapped (default N=10,000 iterations, seed 42).</li>
        <li><strong>Per-plot chain</strong> — For each plot (deployment, treatment): pairing, mass ratio via immobile Ti tracer, post-application concentration, fraction dissolved, CDR per cation, and CO₂ conversion.</li>
        <li><strong>Diagnostics</strong> — Tracer resolvability, application rate check, weathering significance, and representativeness tests.</li>
        <li><strong>Aggregation</strong> — Deployment and treatment CO₂ are scaled by area and summed. The 16th percentile of the total gives the conservative CDR estimate (p16).</li>
      </ol>

      <h2 style={{ fontSize: 16 }}>Reported result</h2>
      <p>
        The registry reports <strong>p16 = 4,704 tonnes CO₂</strong>.
        {m && m.computed_p16 !== null && (
          <>
            {" "}This explorer independently computed{" "}
            <strong>{m.computed_p16.toFixed(2)} tonnes</strong>{" "}
            (Δ = {Math.abs(m.computed_p16 - m.registry_p16).toFixed(2)}),
            verifying the chain end-to-end in the browser.
          </>
        )}
      </p>

      <h2 style={{ fontSize: 16 }}>Interactive editing</h2>
      <p>
        The explorer supports two types of edits:
      </p>
      <ul style={{ paddingLeft: 20 }}>
        <li><strong>Causal edits</strong> — Modify inputs (feedstock columns, bulk density, plot areas, or chain constants) and recompute the full chain. Only nodes downstream of your change are recalculated; unaffected nodes reuse cached values.</li>
        <li><strong>Counterfactual overrides</strong> — Pin any intermediate node to a chosen value (point-collapse or mean-shift) and propagate forward. Upstream and sibling branches stay on their original values.</li>
      </ul>
      <p>
        When changes are made, the previous run's distribution is shown as a
        translucent red overlay on affected nodes, so you can compare before and
        after at a glance.
      </p>

      <h2 style={{ fontSize: 16 }}>Technology</h2>
      <p>
        The chain runs in-browser using <strong>Pyodide</strong> (Python in
        WebAssembly) with the real <code>isometric_calculation_library</code>.
        No server-side computation is required. The DAG is rendered with
        React Flow + dagre, histograms with uPlot, and state management via
        Zustand.
      </p>

      {m && (
        <p style={{ color: "#888", fontSize: 12, marginTop: 32, paddingTop: 16, borderTop: "1px solid #eee" }}>
          Manifest generated {m.generated_at}. Precomputed chain wall time:{" "}
          {m.total_duration_s?.toFixed(1)}s.
        </p>
      )}
    </div>
  );
}
