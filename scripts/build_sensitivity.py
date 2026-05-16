#!/usr/bin/env python3
"""
Precompute the tornado sensitivity sweep for a removal and ship the result
as public/checkpoints/<removalId>/sensitivity.json.

Runs the same isometric_calculation_library calls as src/worker/chain.py
(end-to-end p16 only — no per-node checkpoints or diagnostics) for 9
configurations: baseline + 4 inputs × ±10%. Outputs JSON consumed by the
in-browser SensitivityPage.

Usage:
    uv run python scripts/build_sensitivity.py <removalId> [--n-runs N] [--scale S]

Defaults: --n-runs 200000, --scale 0.1.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from isometric_calculation_library.enhanced_weathering.utils.control_correction import (
    compute_control_correction_ratio,
)
from isometric_calculation_library.enhanced_weathering.utils.conversions import (
    convert_cation_kg_to_co2_kg,
)
from isometric_calculation_library.enhanced_weathering.utils.data_cleaning import (
    winsorise,
    zero_filter,
)
from isometric_calculation_library.enhanced_weathering.utils.pairing import pair_locations
from isometric_calculation_library.enhanced_weathering.utils.resampling import (
    bootstrap_bulk_density_paired,
    compute_resampled_means_from_indices,
    generate_bootstrap_location_indices,
    resample_mean,
)
from isometric_calculation_library.enhanced_weathering.utils.tracer import (
    compute_fraction_dissolved,
    compute_mass_ratio_from_immobile_tracer,
    compute_post_application_concentration,
)

CATIONS = ["Ca", "Mg"]
SAMPLING_DEPTH_CM = 30.0
TRACER = "Ti"
LOCATION_COL = "measurement_location_reference_id"
CLEANING_ELEMENTS = ["Ca", "Mg", "Ti"]
APPLICATION_RATE_KG_HA = 14.8 * 1000


def col(e: str) -> str:
    return f"mass_fraction_{e.lower()}"


def run_chain(
    raw_samples: pd.DataFrame,
    feedstock: pd.DataFrame,
    bulk_density_samples: pd.DataFrame,
    area: dict,
    n_runs: int,
    seed: int,
    application_rate_kg_ha: float = APPLICATION_RATE_KG_HA,
) -> float:
    """Mirrors src/worker/chain.py end-to-end and returns the final p16
    in tCO₂e. No per-node tracking, no diagnostics."""
    rng = np.random.default_rng(seed)

    # Cleaning
    cleaning_cols = [col(e) for e in CLEANING_ELEMENTS]
    zr = zero_filter(raw_samples, cleaning_cols, LOCATION_COL)
    wr = winsorise(
        zr.samples,
        columns=cleaning_cols,
        group_columns=["sampling_event", "plot_type"],
        n_std=3.0,
    )
    cleaned = wr.samples
    bl = cleaned[cleaned["sampling_event"] == "baseline"]
    rp = cleaned[cleaned["sampling_event"] == "reporting_period"]

    def sub(plot, period_df):
        return period_df[period_df["plot_type"] == plot]

    dep_bl, dep_rp = sub("deployment", bl), sub("deployment", rp)
    tre_bl, tre_rp = sub("treatment", bl), sub("treatment", rp)
    ctl_bl, ctl_rp = sub("control", bl), sub("control", rp)

    # Bulk density bootstrap (chunked is unnecessary outside Pyodide's heap).
    bd_values = bulk_density_samples["bulk_density"].dropna().to_numpy()
    bd_boot = bootstrap_bulk_density_paired(rng, bd_values, n_runs)

    tracer_col = col(TRACER)
    ca_col, mg_col = col("Ca"), col("Mg")
    value_columns = [tracer_col, ca_col, mg_col]

    # Feedstock bootstraps — three independent calls, matters for RNG stream.
    fs_ti = resample_mean(rng, feedstock[tracer_col].dropna().to_numpy(), n_runs)
    fs_ca = resample_mean(rng, feedstock[ca_col].dropna().to_numpy(), n_runs)
    fs_mg = resample_mean(rng, feedstock[mg_col].dropna().to_numpy(), n_runs)
    fs_by_cation = {"Ca": fs_ca, "Mg": fs_mg}

    # Control correction
    control_pairing = pair_locations(ctl_bl, ctl_rp, value_columns)
    control_paired = control_pairing.paired
    n_control = len(control_paired)
    ctl_idx = generate_bootstrap_location_indices(rng, n_control, n_runs)
    ctl_means = {
        k: compute_resampled_means_from_indices(control_paired[k].to_numpy(), ctl_idx)
        for k in [
            f"bl_{ca_col}",
            f"rp_{ca_col}",
            f"bl_{mg_col}",
            f"rp_{mg_col}",
        ]
    }
    ctrl_p50 = {}
    for cation in CATIONS:
        cc = col(cation)
        ratio = compute_control_correction_ratio(
            control_baseline_mg_kg=ctl_means[f"bl_{cc}"],
            control_end_of_reporting_period_mg_kg=ctl_means[f"rp_{cc}"],
        )
        ctrl_p50[cation] = float(np.percentile(ratio, 50))

    # Per-plot
    co2_by_plot = {}
    for plot_label, plot_bl, plot_rp in [
        ("deployment", dep_bl, dep_rp),
        ("treatment", tre_bl, tre_rp),
    ]:
        pairing = pair_locations(plot_bl, plot_rp, value_columns)
        paired = pairing.paired
        n_paired = len(paired)
        plot_idx = generate_bootstrap_location_indices(rng, n_paired, n_runs)
        plot_means = {
            k: compute_resampled_means_from_indices(paired[k].to_numpy(), plot_idx)
            for k in [
                f"bl_{tracer_col}",
                f"rp_{tracer_col}",
                f"bl_{ca_col}",
                f"rp_{ca_col}",
                f"bl_{mg_col}",
                f"rp_{mg_col}",
            ]
        }

        mass_ratio = compute_mass_ratio_from_immobile_tracer(
            feedstock_tracer_mg_kg=fs_ti,
            soil_baseline_tracer_mg_kg=plot_means[f"bl_{tracer_col}"],
            soil_end_of_reporting_period_tracer_mg_kg=plot_means[f"rp_{tracer_col}"],
        )

        co2_combined = np.zeros(n_runs)
        for cation in CATIONS:
            cc = col(cation)
            fs_cation = fs_by_cation[cation]
            bl_c = plot_means[f"bl_{cc}"]
            rp_c = plot_means[f"rp_{cc}"]
            post_app = compute_post_application_concentration(
                feedstock_soil_mass_ratio=mass_ratio,
                soil_baseline_mg_kg=bl_c,
                feedstock_mg_kg=fs_cation,
            )
            frac_diss = compute_fraction_dissolved(
                feedstock_soil_mass_ratio=mass_ratio,
                post_application_concentration_mg_kg=post_app,
                soil_end_of_reporting_period_mg_kg=rp_c,
                feedstock_mg_kg=fs_cation,
                control_correction_ratio=ctrl_p50[cation],
            )
            cdr = frac_diss * application_rate_kg_ha * fs_cation / 1e6
            co2 = convert_cation_kg_to_co2_kg(cation_kg=cdr, cation=cation)
            co2_combined = co2_combined + co2
        co2_by_plot[plot_label] = co2_combined

    dep_t = co2_by_plot["deployment"] * area.get("deployment", 0.0) / 1000
    tre_t = co2_by_plot["treatment"] * area.get("treatment", 0.0) / 1000
    total = dep_t + tre_t
    return float(np.nanpercentile(total, 16))


def apply_column_scale(df: pd.DataFrame, column: str, factor: float) -> pd.DataFrame:
    out = df.copy()
    out[column] = out[column] * factor
    return out


SWEEP_INPUTS = [
    {"id": "application_rate_kg_ha", "kind": "scalar"},
    {"id": "feedstock_ca", "kind": "column", "column": "mass_fraction_ca"},
    {"id": "feedstock_mg", "kind": "column", "column": "mass_fraction_mg"},
    {"id": "feedstock_ti", "kind": "column", "column": "mass_fraction_ti"},
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("removal_id")
    ap.add_argument("--n-runs", type=int, default=200_000)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--scale", type=float, default=0.1)
    args = ap.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    inputs_dir = repo_root / "public" / "checkpoints" / args.removal_id / "inputs"
    if not inputs_dir.exists():
        print(f"error: {inputs_dir} not found", file=sys.stderr)
        return 2

    raw_samples = pd.read_parquet(inputs_dir / "raw_samples.parquet")
    feedstock = pd.read_parquet(inputs_dir / "feedstock_samples.parquet")
    bulk_density_samples = pd.read_parquet(inputs_dir / "bulk_density_samples.parquet")
    area_df = pd.read_parquet(inputs_dir / "area_hectares.parquet")
    area = dict(zip(area_df["plot_type"], area_df["area_hectares"]))

    def p16_for(sign: int, spec=None) -> float:
        """sign = 0 baseline, +1 plus-scale, -1 minus-scale. spec is one of
        SWEEP_INPUTS when sign != 0."""
        app_rate = APPLICATION_RATE_KG_HA
        fs = feedstock
        if sign != 0:
            factor = 1 + sign * args.scale
            if spec["kind"] == "scalar":  # application_rate_kg_ha
                app_rate = APPLICATION_RATE_KG_HA * factor
            elif spec["kind"] == "column":
                fs = apply_column_scale(feedstock, spec["column"], factor)
        return run_chain(
            raw_samples=raw_samples,
            feedstock=fs,
            bulk_density_samples=bulk_density_samples,
            area=area,
            n_runs=args.n_runs,
            seed=args.seed,
            application_rate_kg_ha=app_rate,
        )

    print(f"computing baseline at N={args.n_runs}, seed={args.seed}…")
    t0 = time.perf_counter()
    baseline = p16_for(0)
    print(f"  p16 = {baseline:.6f} ({time.perf_counter() - t0:.1f}s)")

    results = []
    for spec in SWEEP_INPUTS:
        print(f"computing {spec['id']} ±{args.scale * 100:.0f}%…")
        t0 = time.perf_counter()
        plus = p16_for(+1, spec)
        minus = p16_for(-1, spec)
        dt = time.perf_counter() - t0
        print(f"  +: {plus:.4f}  −: {minus:.4f}  ({dt:.1f}s)")
        results.append({"id": spec["id"], "plus_p16": plus, "minus_p16": minus})

    out = {
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "removal_id": args.removal_id,
        "n_runs": args.n_runs,
        "seed": args.seed,
        "scale": args.scale,
        "baseline_p16": baseline,
        "results": results,
    }
    out_path = (
        repo_root / "public" / "checkpoints" / args.removal_id / "sensitivity.json"
    )
    out_path.write_text(json.dumps(out, indent=2))
    print(f"\nwrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
