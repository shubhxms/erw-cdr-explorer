import { PageLayout } from "../components/PageLayout";

export function AboutPage() {
  return (
    <PageLayout title="ERW CDR Checkpoint Explorer">
      <p style={{ marginTop: 0, fontStyle: "italic", color: "#444" }}>
        A browser viewer for{" "}
        <a
          href="https://registry.isometric.com/supplier/spl_1J6EQFMYF1S00KDE#issuances"
          target="_blank"
          rel="noreferrer"
        >
          Alt Carbon's ERW CDR removals
        </a>{" "}
        on the Isometric registry. Every named intermediate of the
        tracer-corrected mass-balance chain (~71 nodes) is a clickable DAG
        node with histogram + summary stats.
      </p>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>What you can do here</h2>
      <ul style={{ paddingLeft: 20 }}>
        <li>
          Inspect any <code>[N]</code> array node — 64-bin histogram, current
          run overlaid on the precomputed N=200k baseline, summary stats with
          a Δ column.
        </li>
        <li>
          <strong>Edit inputs and re-run live.</strong> Feedstock columns,
          bulk density, plot areas, application rate, sampling depth,
          winsorise threshold, zero-filter, PRNG seed. The whole chain
          recomputes in-browser via Pyodide running the real{" "}
          <code>isometric_calculation_library</code>.
        </li>
        <li>
          <strong>Pin or shift</strong> any array node — point-collapse to a
          constant or mean-shift — to play with forward-only counterfactuals
          ("what if this step were noise-free / biased by X?").
        </li>
        <li>
          <strong>Tornado sensitivity</strong> at ±10% on application rate +
          feedstock Ca/Mg/Ti. See <a href="/sensitivity">/sensitivity</a>.
        </li>
        <li>
          <strong>CSV export</strong> per node (samples, stats, dataframes).
        </li>
      </ul>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Scope</h2>
      <p>
        Only the gross CDR from weathering sub-calculation. Upstream
        activity emissions, weathering losses, the attribution factor, and
        retention coefficients are not modelled here.
      </p>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Stack</h2>
      <p style={{ marginBottom: 0 }}>
        Pyodide + <code>isometric_calculation_library</code>, React Flow,
        uPlot, hyparquet, Zustand.
      </p>
    </PageLayout>
  );
}
