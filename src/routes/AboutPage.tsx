import { Link } from "react-router-dom";
import { useManifest } from "../data/manifest";
import { useStore } from "../store";
import { REMOVAL_BY_ID } from "../data/removals";

export function AboutPage() {
  const removalId = useStore((s) => s.removalId);
  const { manifest: m } = useManifest(removalId);
  const reg = REMOVAL_BY_ID[removalId]?.registryP16 ?? null;
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
        An interactive visualization of the enhanced-weathering CDR calculation
        for <strong>Alt Carbon's Darjeeling project</strong> on the{" "}
        <a
          href="https://registry.isometric.com/supplier/spl_1J6EQFMYF1S00KDE#issuances"
          target="_blank"
          rel="noreferrer"
        >
          Isometric registry
        </a>
        . Specifically, it reproduces the gross CDR figure for removal{" "}
        <a
          href="https://registry.isometric.com/removal/rmv_1KH3W7FMH1S0J5R9?tab=data-points"
          target="_blank"
          rel="noreferrer"
        >
          rmv_1KH3W7FMH1S0J5R9
        </a>
        . Every named intermediate variable in the calculation chain appears
        as a node on the DAG canvas — click any node to inspect its
        distribution, summary statistics, and provenance.
      </p>

      <h2 style={{ fontSize: 16 }}>Scope</h2>
      <p>
        This explorer reproduces only the <strong>CDR from weathering</strong>
        {" "}sub-calculation — the 4,703.709 tCO₂e gross figure derived from
        soil bootstrapping and tracer-corrected mass balance. The final
        issued removal subtracts upstream activity emissions (flights,
        freight, spreading fuel, lab electricity), weathering losses (strong
        acid weathering, plant uptake, counterfactual liming), an attribution
        factor (~36.87%), and downstream retention coefficients (river runoff
        99.30%, ocean re-equilibration 78.80%). Those steps are out of scope
        here.
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
        {reg !== null ? (
          <>
            The registry reports <strong>p16 = {reg.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} tCO₂e</strong>
            {" "}for <code>{removalId}</code>.
          </>
        ) : (
          <>Registry value for <code>{removalId}</code> not configured.</>
        )}
        {m && m.computed_p16 !== null && reg !== null && (
          <>
            {" "}This explorer independently computed{" "}
            <strong>{m.computed_p16.toFixed(3)} tCO₂e</strong>{" "}
            (Δ = {Math.abs(m.computed_p16 - reg).toFixed(3)}),
            verifying the chain end-to-end in the browser.
          </>
        )}
      </p>

      <h2 style={{ fontSize: 16 }}>Interactive editing</h2>
      <p>
        The explorer supports two types of edits:
      </p>
      <ul style={{ paddingLeft: 20 }}>
        <li><strong>Causal edits</strong> — Modify inputs (feedstock columns, bulk density, plot areas, or chain constants) and recompute the full chain.</li>
        <li><strong>Counterfactual overrides</strong> — Pin any intermediate node to a chosen value (point-collapse or mean-shift) and propagate forward. Upstream and sibling branches stay on their original values.</li>
      </ul>
      <p>
        Each <code>[N]</code> node's sidebar shows <strong>CURRENT</strong>
        {" "}(what this browser just computed) above{" "}
        <strong>REGISTRY BASELINE</strong> (the precomputed N=200k reference
        that matches the registry value), with a Δ column for every summary
        statistic.
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
