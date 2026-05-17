"""
ERW CDR chain — Pyodide-side calculation.

Wraps the real `isometric_calculation_library` calculation so the browser
result matches the registry value (p16 ≈ 4703.709) bit-for-bit aside from
floating-point determinism.

Bridges to JS via the `bridge.send(json_str)` callable injected from the
worker. Each named intermediate posts a `started` then a typed result
(array | scalar | dataframe) message.

Inputs are expected at /inputs/*.parquet (written by the JS side via
Pyodide's virtual FS).

Globals injected by the worker before exec:
  - N_RUNS, SEED (ints)
  - bridge (JS module with .send(str) and .checkAbort() -> bool)
"""

import json
import time
import traceback

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
from isometric_calculation_library.enhanced_weathering.utils.statistical_checks.application_rate import (
    build_application_rate_check,
)
from isometric_calculation_library.enhanced_weathering.utils.statistical_checks.representativeness import (
    check_representativeness,
)
from isometric_calculation_library.enhanced_weathering.utils.statistical_checks.tracer_resolvability import (
    calculate_tracer_resolvability,
)
from isometric_calculation_library.enhanced_weathering.utils.statistical_checks.weathering_signal import (
    check_weathering_significance_paired,
    infer_post_application_concentrations,
)
from isometric_calculation_library.enhanced_weathering.utils.tracer import (
    compute_application_rate_from_tracer,
    compute_fraction_dissolved,
    compute_mass_ratio_from_immobile_tracer,
    compute_post_application_concentration,
)

import bridge  # type: ignore  # registered from JS via pyodide.registerJsModule

# -- constants ---------------------------------------------------------------

CATIONS = ["Ca", "Mg"]
SAMPLING_DEPTH_CM = 30.0
TRACER = "Ti"
LOCATION_COL = "measurement_location_reference_id"
CLEANING_ELEMENTS = ["Ca", "Mg", "Ti"]
APPLICATION_RATE_T_HA = 14.8
APPLICATION_RATE_KG_HA = APPLICATION_RATE_T_HA * 1000


def col(e):
    return f"mass_fraction_{e.lower()}"


# -- edits + overrides ------------------------------------------------------


def _parse_edits(edits_json):
    """Group a flat list of EditSpec dicts by node id for easy lookup.

    Returns: {
        "scalars":  { constant_id -> value },
        "areas":    { plot_type -> value },
        "columns":  { (node_id, column) -> {op, value} },
    }
    """
    try:
        items = json.loads(edits_json) if edits_json else []
    except Exception:
        items = []
    out = {"scalars": {}, "areas": {}, "columns": {}}
    for e in items:
        k = e.get("kind")
        if k == "scalar" or k == "toggle":
            out["scalars"][e["nodeId"]] = e["value"]
        elif k == "area":
            out["areas"][e["plotType"]] = float(e["value"])
        elif k == "column_transform":
            out["columns"][(e["nodeId"], e["column"])] = {
                "op": e["op"],
                "value": float(e["value"]),
            }
    return out


def _parse_overrides(overrides_json):
    """Returns: { node_id -> {kind, value | target_mean} }."""
    try:
        items = json.loads(overrides_json) if overrides_json else []
    except Exception:
        items = []
    return {e["nodeId"]: e for e in items}


def _apply_column_transform(df, column, op, value):
    """Return a copy of df with `column` transformed by `op`."""
    if column not in df.columns:
        return df
    out = df.copy()
    col_vals = out[column]
    if op == "replace_mean":
        delta = value - float(col_vals.mean(skipna=True))
        out[column] = col_vals + delta
    elif op == "shift_mean":
        out[column] = col_vals + value
    elif op == "scale":
        out[column] = col_vals * value
    return out


def _apply_override(arr, override):
    """Apply a node override in place semantics: returns a new array.

    - collapse: replace every element with override["value"].
    - shift:    recenter array on override["target_mean"] (preserve dispersion).
    """
    k = override.get("kind")
    arr = np.asarray(arr, dtype=np.float64)
    if k == "collapse":
        return np.full(arr.shape, float(override["value"]), dtype=np.float64)
    if k == "shift":
        m = float(np.nanmean(arr))
        return arr - m + float(override["target_mean"])
    return arr


# Populated at the top of run(); track_array reads from this dict.
_OVERRIDES = {}


# Default chunk for the iteration-axis split below. At chunk_size=20_000 and
# n_paired ≈ 894 the peak gather buffer is 20k × 894 × 8 ≈ 140 MB, comfortably
# inside the Pyodide WASM heap (~2 GB usable). At N=200k the chain runs in 10
# sequential chunks per plot.
DEFAULT_CHUNK = 20_000


def chunked_simple_bootstrap(fn, rng, values, n_runs, chunk_size=DEFAULT_CHUNK):
    """Run a library bootstrap function in chunks of n_runs to bound peak
    memory. Works for `resample_mean(rng, values, K)` and the equivalent
    `bootstrap_bulk_density_paired` — both produce length-K mean arrays
    deterministically given the rng stream.
    """
    out = np.empty(n_runs, dtype=np.float64)
    done = 0
    while done < n_runs:
        cs = min(chunk_size, n_runs - done)
        out[done : done + cs] = fn(rng, values, cs)
        done += cs
    return out


def chunked_resample_all(rng, columns_dict, n_runs, chunk_size=DEFAULT_CHUNK):
    """Memory-bounded equivalent of `generate_bootstrap_location_indices` +
    `compute_resampled_means_from_indices` fan-out across multiple columns.

    The library is happy to allocate (n_runs, n_paired) float64 arrays for
    indices and each gather; at N=200_000 and n_paired ≈ 894 that's 1.3 GB
    apiece, which blows Pyodide's WASM heap. We chunk along the iteration
    axis instead.

    RNG state advances identically to one big call: numpy's `Generator.integers`
    produces a deterministic sequential stream regardless of the shape you
    request. The mathematical result is bit-equal to the unchunked path.

    Args:
        rng: numpy Generator (advanced in-place).
        columns_dict: {label: 1-D numpy array}; all arrays must share length.
        n_runs: total bootstrap iterations.
        chunk_size: rows of indices materialised at a time.

    Returns:
        {label: 1-D numpy float64 array of length n_runs}
    """
    items = list(columns_dict.items())
    n_paired = len(items[0][1])
    for k, a in items:
        if len(a) != n_paired:
            raise ValueError(
                f"column {k} has length {len(a)}, expected {n_paired}",
            )
    out = {k: np.empty(n_runs, dtype=np.float64) for k in columns_dict}
    done = 0
    while done < n_runs:
        cs = min(chunk_size, n_runs - done)
        idx = generate_bootstrap_location_indices(rng, n_paired, cs)
        for k, arr in items:
            out[k][done : done + cs] = compute_resampled_means_from_indices(arr, idx)
        done += cs
        del idx
    return out


# -- bridge helpers ---------------------------------------------------------


def post(obj):
    bridge.send(json.dumps(obj))


def _check_abort():
    """Cooperative cancel check. The JS side flips a flag we read here."""
    if bool(bridge.checkAbort()):
        raise RuntimeError("aborted")


def stats(arr):
    """Summary stats + 64-bin histogram for a numeric 1-D array.

    Mirrors src/chain/stats.ts so the wire format stays identical.
    """
    arr = np.asarray(arr).ravel()
    finite = arr[np.isfinite(arr)]
    nan_count = int(np.isnan(arr).sum())
    inf_count = int(np.isposinf(arr).sum() + np.isneginf(arr).sum())
    if finite.size == 0:
        return None
    s = {
        "n": int(arr.size),
        "mean": float(np.nanmean(arr)),
        "std": float(np.nanstd(arr)),
        "p5": float(np.nanpercentile(arr, 5)),
        "p16": float(np.nanpercentile(arr, 16)),
        "p50": float(np.nanmedian(arr)),
        "p84": float(np.nanpercentile(arr, 84)),
        "p95": float(np.nanpercentile(arr, 95)),
        "min": float(np.min(finite)),
        "max": float(np.max(finite)),
        "nan_count": nan_count,
        "inf_count": inf_count,
    }
    if s["min"] == s["max"]:
        bins = [0] * 64
        bins[32] = int(finite.size)
        edges = [s["min"] - 0.5, s["max"] + 0.5]
    else:
        counts, edges = np.histogram(finite, bins=64)
        bins = counts.tolist()
        edges = edges.tolist()
    return s, {"bins": bins, "edges": edges}


def track_array(node_id, fn):
    post({"type": "started", "nodeId": node_id})
    t0 = time.perf_counter()
    arr = fn()
    overridden = False
    if node_id in _OVERRIDES:
        arr = _apply_override(arr, _OVERRIDES[node_id])
        overridden = True
    dt = (time.perf_counter() - t0) * 1000
    s_h = stats(arr)
    if s_h is None:
        s = {"n": int(np.asarray(arr).size), "mean": float("nan"), "std": float("nan"),
             "p5": float("nan"), "p16": float("nan"), "p50": float("nan"),
             "p84": float("nan"), "p95": float("nan"),
             "min": float("nan"), "max": float("nan"),
             "nan_count": int(np.asarray(arr).size), "inf_count": 0}
        h = {"bins": [0] * 64, "edges": [0.0, 1.0]}
    else:
        s, h = s_h
    msg = {"type": "array", "nodeId": node_id, "stats": s, "histogram": h, "durationMs": dt}
    if overridden:
        msg["overridden"] = True
    post(msg)
    _check_abort()
    return arr


def track_scalar(node_id, fn):
    post({"type": "started", "nodeId": node_id})
    t0 = time.perf_counter()
    v = float(fn())
    dt = (time.perf_counter() - t0) * 1000
    post({"type": "scalar", "nodeId": node_id, "value": v, "durationMs": dt})
    _check_abort()
    return v


def track_df(node_id, fn, columns):
    post({"type": "started", "nodeId": node_id})
    t0 = time.perf_counter()
    df = fn()
    dt = (time.perf_counter() - t0) * 1000
    n = int(len(df)) if df is not None else 0
    cols = [str(c) for c in columns]
    post({"type": "dataframe", "nodeId": node_id, "rowCount": n, "columns": cols, "durationMs": dt})
    _check_abort()
    return df


# -- main chain --------------------------------------------------------------


def run(n_runs, seed, edits_json="", overrides_json=""):
    global _OVERRIDES
    edits = _parse_edits(edits_json)
    _OVERRIDES = _parse_overrides(overrides_json)

    # Constants — pick up any scalar/toggle edits.
    application_rate_kg_ha = float(edits["scalars"].get(
        "constants/application_rate_kg_ha", APPLICATION_RATE_KG_HA,
    ))
    sampling_depth_cm = float(edits["scalars"].get(
        "constants/sampling_depth_cm", SAMPLING_DEPTH_CM,
    ))
    winsorise_n_std = float(edits["scalars"].get(
        "constants/winsorise_n_std", 3.0,
    ))
    zero_filter_enabled = bool(edits["scalars"].get(
        "constants/zero_filter_enabled", True,
    ))

    overall_t0 = time.perf_counter()
    rng = np.random.default_rng(seed)

    # ----- inputs ----------------------------------------------------------
    raw_samples = pd.read_parquet("/inputs/raw_samples.parquet")
    feedstock = pd.read_parquet("/inputs/feedstock_samples.parquet")
    bulk_density_samples = pd.read_parquet("/inputs/bulk_density_samples.parquet")
    area_df = pd.read_parquet("/inputs/area_hectares.parquet")

    # Apply per-column edits to feedstock and bulk-density.
    for (node_id, column), spec in edits["columns"].items():
        if node_id == "inputs/feedstock_samples":
            feedstock = _apply_column_transform(feedstock, column, spec["op"], spec["value"])
        elif node_id == "inputs/bulk_density_samples":
            bulk_density_samples = _apply_column_transform(
                bulk_density_samples, column, spec["op"], spec["value"]
            )

    # Apply per-plot area edits.
    if edits["areas"]:
        area_df = area_df.copy()
        for plot, value in edits["areas"].items():
            area_df.loc[area_df["plot_type"] == plot, "area_hectares"] = value
    area = dict(zip(area_df["plot_type"], area_df["area_hectares"]))

    track_df("inputs/raw_samples", lambda: raw_samples, raw_samples.columns)
    track_df("inputs/feedstock_samples", lambda: feedstock, feedstock.columns)
    track_df("inputs/bulk_density_samples", lambda: bulk_density_samples, ["bulk_density"])
    track_df("inputs/area_hectares", lambda: area_df, ["plot_type", "area_hectares"])

    # ----- cleaning --------------------------------------------------------
    cleaning_columns = [col(e) for e in CLEANING_ELEMENTS]

    if zero_filter_enabled:
        zr = zero_filter(raw_samples, cleaning_columns, LOCATION_COL)
        post_zero = zr.samples
        zero_dropped = zr.n_samples_dropped
    else:
        post_zero = raw_samples
        zero_dropped = 0
    wr = winsorise(
        post_zero,
        columns=cleaning_columns,
        group_columns=["sampling_event", "plot_type"],
        n_std=winsorise_n_std,
    )
    cleaned = wr.samples
    cleaning_report_df = pd.DataFrame([
        {"step": "zero_filter", "samples_dropped": zero_dropped, "values_clipped": 0},
        {"step": "winsorisation", "samples_dropped": 0, "values_clipped": wr.n_values_clipped},
    ])
    track_df("cleaning/cleaning_report", lambda: cleaning_report_df,
             ["step", "samples_dropped", "values_clipped"])

    baseline_final = cleaned[cleaned["sampling_event"] == "baseline"]
    rp_final = cleaned[cleaned["sampling_event"] == "reporting_period"]

    def sub(plot, period):
        src = baseline_final if period == "baseline" else rp_final
        return src[src["plot_type"] == plot]

    dep_bl, dep_rp = sub("deployment", "baseline"), sub("deployment", "reporting_period")
    tre_bl, tre_rp = sub("treatment", "baseline"), sub("treatment", "reporting_period")
    ctl_bl, ctl_rp = sub("control", "baseline"), sub("control", "reporting_period")

    track_df("cleaning/deployment_baseline", lambda: dep_bl, dep_bl.columns)
    track_df("cleaning/deployment_reporting_period", lambda: dep_rp, dep_rp.columns)
    track_df("cleaning/treatment_baseline", lambda: tre_bl, tre_bl.columns)
    track_df("cleaning/treatment_reporting_period", lambda: tre_rp, tre_rp.columns)
    track_df("cleaning/control_baseline", lambda: ctl_bl, ctl_bl.columns)
    track_df("cleaning/control_reporting_period", lambda: ctl_rp, ctl_rp.columns)

    # ----- bulk density bootstrap -----------------------------------------
    bd_values = bulk_density_samples["bulk_density"].dropna().to_numpy()
    bd_boot = track_array(
        "bootstrap/bd_boot",
        lambda: chunked_simple_bootstrap(
            bootstrap_bulk_density_paired, rng, bd_values, n_runs,
        ),
    )

    bd_mean = float(np.mean(bd_values))
    track_scalar("bootstrap/bd_mean", lambda: bd_mean)
    soil_mass_kg_ha = bd_mean * sampling_depth_cm * 100
    track_scalar("bootstrap/soil_mass_kg_ha", lambda: soil_mass_kg_ha)

    # ----- tracer resolvability (diagnostic) -------------------------------
    tracer_col = col(TRACER)
    fs_tracer_vals = feedstock[tracer_col].dropna().to_numpy()
    resolvability_rows = []
    for plot_type, plot_baseline in [("deployment", dep_bl), ("treatment", tre_bl)]:
        area_ha = area.get(plot_type, 0.0)
        soil_mass_kg = soil_mass_kg_ha * area_ha
        feedstock_mass_kg = application_rate_kg_ha * area_ha
        bl_tracer = plot_baseline[tracer_col].dropna().to_numpy()
        res = calculate_tracer_resolvability(
            soil_mass_kg=soil_mass_kg,
            feedstock_mass_kg=feedstock_mass_kg,
            feedstock_tracer_mg_kg=fs_tracer_vals,
            baseline_treatment_tracer_mg_kg=bl_tracer,
        )
        resolvability_rows.append({
            "plot_type": plot_type,
            "resolvability_index": float(res),
            "soil_mass_kg": float(soil_mass_kg),
            "feedstock_mass_kg": float(feedstock_mass_kg),
            "n_baseline_samples": int(len(bl_tracer)),
        })
    res_df = pd.DataFrame(resolvability_rows)
    track_df("diagnostics/tracer_resolvability", lambda: res_df, res_df.columns)

    # ----- feedstock bootstraps (three independent calls) ------------------
    ca_col, mg_col = col("Ca"), col("Mg")
    value_columns = [tracer_col, ca_col, mg_col]

    fs_ti = track_array(
        "bootstrap/fs_ti",
        lambda: chunked_simple_bootstrap(
            resample_mean, rng, feedstock[tracer_col].dropna().to_numpy(), n_runs,
        ),
    )
    fs_ca = track_array(
        "bootstrap/fs_ca",
        lambda: chunked_simple_bootstrap(
            resample_mean, rng, feedstock[ca_col].dropna().to_numpy(), n_runs,
        ),
    )
    fs_mg = track_array(
        "bootstrap/fs_mg",
        lambda: chunked_simple_bootstrap(
            resample_mean, rng, feedstock[mg_col].dropna().to_numpy(), n_runs,
        ),
    )
    fs_by_cation = {"Ca": fs_ca, "Mg": fs_mg}

    # ----- control correction ---------------------------------------------
    control_pairing = pair_locations(ctl_bl, ctl_rp, value_columns)
    control_paired = control_pairing.paired
    n_control = len(control_paired)
    track_df("bootstrap/control_paired", lambda: control_paired, control_paired.columns)

    # Chunked control bootstrap (shared indices across Ca + Mg, per library spec).
    ctl_means = chunked_resample_all(
        rng,
        {
            f"bl_{col('Ca')}": control_paired[f"bl_{col('Ca')}"].to_numpy(),
            f"rp_{col('Ca')}": control_paired[f"rp_{col('Ca')}"].to_numpy(),
            f"bl_{col('Mg')}": control_paired[f"bl_{col('Mg')}"].to_numpy(),
            f"rp_{col('Mg')}": control_paired[f"rp_{col('Mg')}"].to_numpy(),
        },
        n_runs,
    )

    control_correction_ratio_p50 = {}
    for cation in CATIONS:
        cc = col(cation)
        bl = track_array(
            f"bootstrap/ctl_bl_{cc}",
            lambda v=ctl_means[f"bl_{cc}"]: v,
        )
        rp = track_array(
            f"bootstrap/ctl_rp_{cc}",
            lambda v=ctl_means[f"rp_{cc}"]: v,
        )
        cc_boot = track_array(
            f"bootstrap/ctl_corr_boot_{cc}",
            lambda bl=bl, rp=rp: compute_control_correction_ratio(
                control_baseline_mg_kg=bl,
                control_end_of_reporting_period_mg_kg=rp,
            ),
        )
        p50 = float(np.percentile(cc_boot, 50))
        track_scalar(f"bootstrap/ctrl_corr_p50_{cc}", lambda v=p50: v)
        control_correction_ratio_p50[cation] = p50
    del ctl_means

    # ----- per-plot chain -------------------------------------------------
    paired_by_plot = {}
    co2_kg_ha_by_plot = {}
    app_rate_check_dfs = []
    pairing_rows = []

    for plot_label, plot_bl, plot_rp in [
        ("deployment", dep_bl, dep_rp),
        ("treatment", tre_bl, tre_rp),
    ]:
        prefix = f"chain_{plot_label}"

        pairing = pair_locations(plot_bl, plot_rp, value_columns)
        paired = pairing.paired
        paired_by_plot[plot_label] = paired
        n_paired = len(paired)
        track_df(f"{prefix}/paired", lambda d=paired: d, paired.columns)
        for cation in CATIONS:
            pairing_rows.append({
                "area_type": plot_label,
                "cation": cation,
                "n_paired": n_paired,
                "n_baseline_only": pairing.n_baseline_only,
                "n_reporting_period_only": pairing.n_reporting_period_only,
            })

        # Chunked per-plot bootstrap (shared indices across Ti+Ca+Mg, per library).
        plot_means = chunked_resample_all(
            rng,
            {
                f"bl_{tracer_col}": paired[f"bl_{tracer_col}"].to_numpy(),
                f"rp_{tracer_col}": paired[f"rp_{tracer_col}"].to_numpy(),
                f"bl_{col('Ca')}": paired[f"bl_{col('Ca')}"].to_numpy(),
                f"rp_{col('Ca')}": paired[f"rp_{col('Ca')}"].to_numpy(),
                f"bl_{col('Mg')}": paired[f"bl_{col('Mg')}"].to_numpy(),
                f"rp_{col('Mg')}": paired[f"rp_{col('Mg')}"].to_numpy(),
            },
            n_runs,
        )

        bl_ti = track_array(
            f"{prefix}/bl_ti", lambda v=plot_means[f"bl_{tracer_col}"]: v,
        )
        rp_ti = track_array(
            f"{prefix}/rp_ti", lambda v=plot_means[f"rp_{tracer_col}"]: v,
        )

        mass_ratio = track_array(
            f"{prefix}/mass_ratio",
            lambda: compute_mass_ratio_from_immobile_tracer(
                feedstock_tracer_mg_kg=fs_ti,
                soil_baseline_tracer_mg_kg=bl_ti,
                soil_end_of_reporting_period_tracer_mg_kg=rp_ti,
            ),
        )

        app_rate_kg_ha = track_array(
            f"{prefix}/app_rate_kg_ha",
            lambda: compute_application_rate_from_tracer(
                feedstock_soil_mass_ratio=mass_ratio,
                soil_bulk_density_kg_m3=bd_boot,
                depth_cm=sampling_depth_cm,
            ),
        )
        app_rate_check_dfs.append(
            build_application_rate_check(
                soil_based_application_rate_bootstrap_replicates_kg_ha=app_rate_kg_ha,
                known_application_rate_kg_ha=application_rate_kg_ha,
                plot_type=plot_label,
            )
        )

        co2_combined_kg_ha = np.zeros(n_runs)
        for cation in CATIONS:
            cc = col(cation)
            fs_cation = fs_by_cation[cation]

            bl_c = track_array(
                f"{prefix}/bl_{cc}", lambda v=plot_means[f"bl_{cc}"]: v,
            )
            rp_c = track_array(
                f"{prefix}/rp_{cc}", lambda v=plot_means[f"rp_{cc}"]: v,
            )
            post_app = track_array(
                f"{prefix}/post_app_{cc}",
                lambda bl=bl_c, fs=fs_cation: compute_post_application_concentration(
                    feedstock_soil_mass_ratio=mass_ratio,
                    soil_baseline_mg_kg=bl,
                    feedstock_mg_kg=fs,
                ),
            )
            frac_diss = track_array(
                f"{prefix}/frac_diss_{cc}",
                lambda post_app=post_app, rp=rp_c, fs=fs_cation, p50=control_correction_ratio_p50[cation]:
                compute_fraction_dissolved(
                    feedstock_soil_mass_ratio=mass_ratio,
                    post_application_concentration_mg_kg=post_app,
                    soil_end_of_reporting_period_mg_kg=rp,
                    feedstock_mg_kg=fs,
                    control_correction_ratio=p50,
                ),
            )
            cdr_cation_kg_ha = track_array(
                f"{prefix}/cdr_{cc}_kg_ha",
                lambda frac_diss=frac_diss, fs=fs_cation, ar=application_rate_kg_ha:
                frac_diss * ar * fs / 1e6,
            )
            co2_cation = track_array(
                f"{prefix}/co2_{cc}_kg_ha",
                lambda cdr=cdr_cation_kg_ha, cation=cation:
                convert_cation_kg_to_co2_kg(cation_kg=cdr, cation=cation),
            )
            co2_combined_kg_ha = co2_combined_kg_ha + co2_cation

        co2_kg_ha_by_plot[plot_label] = co2_combined_kg_ha
        track_array(f"{prefix}/co2_combined_kg_ha", lambda v=co2_combined_kg_ha: v)
        del plot_means  # ~140 MB; release before the next plot resamples

    # control pairing rows (for completeness)
    for cation in CATIONS:
        pairing_rows.append({
            "area_type": "control",
            "cation": cation,
            "n_paired": n_control,
            "n_baseline_only": control_pairing.n_baseline_only,
            "n_reporting_period_only": control_pairing.n_reporting_period_only,
        })

    pairing_df = pd.DataFrame(pairing_rows)
    track_df("diagnostics/pairing_report", lambda: pairing_df, pairing_df.columns)

    app_rate_check_df = pd.concat(app_rate_check_dfs, ignore_index=True)
    track_df(
        "diagnostics/application_rate_check",
        lambda: app_rate_check_df,
        app_rate_check_df.columns,
    )

    # ----- significance test ----------------------------------------------
    sig_rows = []
    for plot_label in ("treatment", "deployment"):
        paired = paired_by_plot[plot_label]
        for cation in CATIONS:
            cc = col(cation)
            fs_cation_mean = float(feedstock[cc].dropna().mean())
            post_app_mg_kg = infer_post_application_concentrations(
                baseline_concentrations_mg_kg=paired[f"bl_{cc}"].to_numpy(),
                feedstock_concentration_mg_kg=fs_cation_mean,
                application_rate_kg_ha=application_rate_kg_ha,
                bulk_density_kg_m3=bd_mean,
                depth_cm=sampling_depth_cm,
            )
            rp_vals = paired[f"rp_{cc}"].to_numpy()
            result = check_weathering_significance_paired(
                post_application_concentrations_mg_kg=post_app_mg_kg,
                end_of_reporting_period_concentrations_mg_kg=rp_vals,
            )
            sig_rows.append({
                "plot_type": plot_label,
                "cation": cation,
                "test_name": result.test_name,
                "statistic": float(result.statistic),
                "p_value": float(result.p_value),
                "significant": bool(result.significant),
                "n_post_application": int(result.n_post_application),
                "n_end_of_reporting_period": int(result.n_end_of_reporting_period),
            })
    sig_df = pd.DataFrame(sig_rows)
    track_df("diagnostics/significance_test", lambda: sig_df, sig_df.columns)

    # ----- representativeness ---------------------------------------------
    rep_rows = []
    dep_paired = paired_by_plot["deployment"]
    tre_paired = paired_by_plot["treatment"]
    for cation in CATIONS:
        cc = col(cation)
        dep_d = (dep_paired[f"rp_{cc}"] - dep_paired[f"bl_{cc}"]).to_numpy()
        tre_d = (tre_paired[f"rp_{cc}"] - tre_paired[f"bl_{cc}"]).to_numpy()
        r = check_representativeness(group_a=dep_d, group_b=tre_d)
        rep_rows.append({
            "cation": cation,
            "comparison": "delta_rp_minus_bl",
            "test_name": r.test_name,
            "statistic": float(r.statistic),
            "p_value": float(r.p_value),
            "representative": bool(not r.significant),
            "n_deployment": int(r.n_group_a),
            "n_treatment": int(r.n_group_b),
        })
    rep_df = pd.DataFrame(rep_rows)
    track_df(
        "diagnostics/representativeness_test", lambda: rep_df, rep_df.columns,
    )

    # ----- aggregation ----------------------------------------------------
    dep_co2 = co2_kg_ha_by_plot["deployment"]
    tre_co2 = co2_kg_ha_by_plot["treatment"]

    dep_tonnes = track_array(
        "aggregation/deployment_co2_tonnes",
        lambda: dep_co2 * area.get("deployment", 0.0) / 1000,
    )
    tre_tonnes = track_array(
        "aggregation/treatment_co2_tonnes",
        lambda: tre_co2 * area.get("treatment", 0.0) / 1000,
    )
    total = track_array(
        "aggregation/total_co2_tonnes",
        lambda: dep_tonnes + tre_tonnes,
    )
    p16 = float(np.nanpercentile(total, 16))
    track_scalar("aggregation/p16", lambda: p16)

    total_ms = (time.perf_counter() - overall_t0) * 1000
    post({"type": "complete", "p16": p16, "totalMs": total_ms})


def main(n_runs, seed, edits_json="", overrides_json=""):
    try:
        run(int(n_runs), int(seed), edits_json or "", overrides_json or "")
    except RuntimeError as e:
        if str(e) == "aborted":
            return
        traceback.print_exc()
        post({"type": "error", "message": str(e)})
    except Exception as e:
        traceback.print_exc()
        post({"type": "error", "message": f"{type(e).__name__}: {e}"})
