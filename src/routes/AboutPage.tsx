import { useManifest } from "../data/manifest";
import { useStore } from "../store";
import { REMOVAL_BY_ID } from "../data/removals";
import { PageLayout } from "../components/PageLayout";

export function AboutPage() {
  const removalId = useStore((s) => s.removalId);
  const { manifest: m } = useManifest(removalId);
  const reg = REMOVAL_BY_ID[removalId]?.registryP16 ?? null;

  return (
    <PageLayout title="EW CDR Checkpoint Explorer">
      <p style={{ marginTop: 0 }}>
        In-browser reproduction + audit tool for{" "}
        <a
          href="https://registry.isometric.com/supplier/spl_1J6EQFMYF1S00KDE#issuances"
          target="_blank"
          rel="noreferrer"
        >
          Alt Carbon's published EW CDR removals
        </a>{" "}
        on the Isometric registry. Currently configured for{" "}
        <code>{removalId}</code>.
      </p>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Methodology</h2>
      <p>
        Enhanced weathering: spread crushed silicate rock on soil. Rain
        weathers it, releasing <strong>Ca²⁺ and Mg²⁺</strong> that bind
        atmospheric CO₂ and drain to the ocean as bicarbonate. Verified
        removal = <em>cations dissolved × stoichiometric CO₂ equivalent</em>.
      </p>
      <p>
        The hard part: you can't measure "weathered fraction" directly —
        feedstock migrates, soil samples are partial. The Isometric protocol
        uses an <strong>immobile tracer (titanium)</strong>: Ti is in the
        feedstock but doesn't dissolve and doesn't move. So:
      </p>
      <ol style={{ paddingLeft: 20 }}>
        <li>
          Pre- and post-application <strong>paired soil samples</strong> at
          hundreds of locations.
        </li>
        <li>
          Change in soil Ti → <code>mass_ratio</code> = (feedstock kg) / (soil
          kg) actually present per sample.
        </li>
        <li>
          <code>mass_ratio</code> × known feedstock Ca/Mg content →{" "}
          <code>post_application_concentration</code>.
        </li>
        <li>
          Compare to actual reporting-period concentration →{" "}
          <code>fraction_dissolved</code>.
        </li>
        <li>
          × cation content × application rate × stoichiometry →{" "}
          <strong>kg CO₂e removed</strong>.
        </li>
        <li>
          A <strong>control plot</strong> (no rock applied) gives a
          multiplicative p50 ratio correction for background drift.
        </li>
        <li>
          Wrap in <strong>N=200,000 bootstrap</strong> with paired-location
          resampling to propagate sampling uncertainty.
        </li>
        <li>
          Report <strong>p16</strong> (16th percentile of total tCO₂e) —
          the conservative claim under the uncertainty distribution.
        </li>
      </ol>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Where bootstrapping enters</h2>
      <p>Four independent bootstrap sites in the chain:</p>
      <ul style={{ paddingLeft: 20 }}>
        <li>
          <strong>Bulk density</strong> — single bootstrap of mean bd (kg/m³).
        </li>
        <li>
          <strong>Feedstock cation means</strong> — three independent
          bootstraps (Ti, Ca, Mg) from the n=25 feedstock table.
        </li>
        <li>
          <strong>Control correction</strong> — paired-location resample on
          the control plot, ratio per cation, p50 of the bootstrap is the
          drift-correction scalar.
        </li>
        <li>
          <strong>Per-plot main chain</strong> — paired-location resample at
          deployment + treatment; cascades through{" "}
          <code>mass_ratio → post_app → frac_diss → cdr → co2</code>.
        </li>
      </ul>
      <p>
        All four share one <code>numpy.default_rng(seed=42)</code> stream.
        Each resamples <em>locations</em>, not rows, so within-location bl/rp
        pairing is preserved. The stream order is the load-bearing
        reproducibility guarantee — re-shuffle the calls and bit-exactness
        breaks.
      </p>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>What this app does</h2>
      <p>
        End-to-end reproduction in the browser via <strong>Pyodide</strong>{" "}
        (Python in WebAssembly) running the real{" "}
        <code>isometric_calculation_library==0.21.4</code>. Bit-exact match
        at <code>seed=42, N=200,000</code> to the registry-published value.
      </p>
      <ul style={{ paddingLeft: 20 }}>
        <li>
          Every named intermediate of the chain (~71 nodes) is a clickable
          DAG node. Each <code>[N]</code> array node shows a 64-bin
          histogram + summary stats — CURRENT (this browser run) overlaid on
          REGISTRY BASELINE (precomputed N=200k) on a shared x-axis.
        </li>
        <li>
          <strong>Causal edits</strong>: tweak feedstock columns, bulk
          density, plot areas, application rate, sampling depth, winsorise
          threshold, zero-filter toggle, or the PRNG seed. Re-run live;
          downstream cascade reflects the change.
        </li>
        <li>
          <strong>Counterfactual overrides</strong>: pin any <code>[N]</code>{" "}
          array to a constant (point-collapse) or recenter its mean
          (mean-shift). Forward-only propagation tests "what if this step
          were perfect / biased by X?".
        </li>
        <li>
          <strong>OAT tornado sensitivity</strong> at ±10% on application
          rate + feedstock Ca/Mg/Ti — precomputed at N=200k, re-runnable
          live. See <a href={`/sensitivity?removal=${removalId}`}>/sensitivity</a>.
        </li>
        <li>
          <strong>CSV export</strong> per node (samples from the parquet
          baseline; stats with current vs baseline; dataframe rows).
        </li>
      </ul>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Reproduced result</h2>
      <p style={{ marginBottom: 0 }}>
        {reg !== null ? (
          <>
            Registry value for <code>{removalId}</code>:{" "}
            <strong>
              p16 ={" "}
              {reg.toLocaleString(undefined, {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              })}{" "}
              tCO₂e
            </strong>
            .
          </>
        ) : (
          <>Registry value for <code>{removalId}</code> not configured.</>
        )}
        {m && m.computed_p16 !== null && reg !== null && (
          <>
            {" "}This explorer independently computes{" "}
            <strong>{m.computed_p16.toFixed(3)} tCO₂e</strong>{" "}
            (Δ = {Math.abs(m.computed_p16 - reg).toFixed(3)}).
          </>
        )}
      </p>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Scope</h2>
      <p>
        This explorer reproduces only the <strong>gross CDR from weathering</strong>{" "}
        sub-calculation. The final issued credit additionally subtracts:
      </p>
      <ul style={{ paddingLeft: 20 }}>
        <li>upstream activity emissions (flights, freight, spreading fuel, lab electricity)</li>
        <li>weathering losses (strong-acid weathering, plant uptake, counterfactual liming)</li>
        <li>attribution factor (~37%)</li>
        <li>retention coefficients (river runoff 99.30%, ocean re-equilibration 78.80%)</li>
      </ul>
      <p>Out of scope here.</p>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Stack</h2>
      <p style={{ marginBottom: 0 }}>
        Pyodide + <code>isometric_calculation_library</code>, React Flow
        (manual columnar layout), uPlot histograms, hyparquet, Zustand.
      </p>

      {m && (
        <p
          style={{
            color: "#888",
            fontSize: 12,
            marginTop: 32,
            paddingTop: 16,
            borderTop: "1px solid #eee",
          }}
        >
          Manifest generated {m.generated_at}. Precomputed chain wall time:{" "}
          {m.total_duration_s?.toFixed(1)}s.
        </p>
      )}
    </PageLayout>
  );
}
