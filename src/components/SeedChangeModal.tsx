/**
 * Confirmation modal: fires whenever the user clicks Run after changing the
 * PRNG seed. Explains exactly what changing the seed does so the user knows
 * a different p16 is expected, not a bug.
 *
 * Predicate (in RunControls): `seed !== (appliedSeed ?? 42)`. There is no
 * "first-run skip" — if the user has changed the seed at all relative to
 * what the chain is about to use, the modal fires.
 */

interface Props {
  open: boolean;
  prevSeed: number | null;
  newSeed: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SeedChangeModal({ open, prevSeed, newSeed, onConfirm, onCancel }: Props) {
  if (!open) return null;
  const fromLabel = prevSeed !== null ? `${prevSeed} → ${newSeed}` : `42 (baseline) → ${newSeed}`;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: '"Cartograph CF", system-ui, sans-serif',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "#fff",
          maxWidth: 520,
          width: "calc(100vw - 32px)",
          borderRadius: 6,
          padding: "20px 22px",
          boxShadow: "0 12px 48px rgba(0,0,0,0.22)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            fontSize: 11,
            color: "#1850c8",
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            marginBottom: 4,
          }}
        >
          Heads up
        </div>
        <h2 style={{ margin: "0 0 12px", fontSize: 17, color: "#222" }}>
          You're about to run with a new PRNG seed
        </h2>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: "#333" }}>
          <p style={{ marginTop: 0 }}>
            <strong>Seed: {fromLabel}</strong>
          </p>
          <p>
            The seed feeds <code>numpy.default_rng(seed)</code>, which drives every
            bootstrap resample in the chain — bulk density, feedstock cations,
            control correction, and the per-plot location resamples. Changing
            it shifts the entire random stream.
          </p>
          <p style={{ marginBottom: 0 }}>
            <strong>What changes:</strong> the specific samples drawn at each
            bootstrap step, and therefore the shape of every <code>[N]</code> distribution
            and the final p16 — usually by &lt; 1% at N=200k, more at smaller N.
          </p>
          <p>
            <strong>What does <em>not</em> change:</strong> the underlying input data, the
            chain math, or the registry methodology. This is a robustness
            check, not a value transform.
          </p>
          <p style={{ color: "#666", fontSize: 12, marginBottom: 0 }}>
            The registry-baseline manifest was generated with seed=42 at
            N=200,000. Different seeds will produce small CURRENT-vs-BASELINE
            deltas you should expect to be statistical noise.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 18,
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              fontSize: 12,
              padding: "6px 14px",
              background: "#fff",
              border: "1px solid #ccc",
              borderRadius: 3,
              cursor: "pointer",
              color: "#222",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              fontSize: 12,
              padding: "6px 14px",
              background: "#1850c8",
              border: "none",
              borderRadius: 3,
              cursor: "pointer",
              color: "#fff",
              fontWeight: 600,
            }}
          >
            Run with seed {newSeed}
          </button>
        </div>
      </div>
    </div>
  );
}
