/**
 * Registry of Alt Carbon's published ERW CDR removals on the Isometric registry.
 * Each removal is reproduced by this explorer as a separate manifest +
 * checkpoint directory under /public/checkpoints/<removalId>/.
 *
 * Groupings mirror the Isometric "issuance" concept — one issuance can bundle
 * multiple tranches (removal IDs). The dropdown in the topbar shows them
 * grouped by issuance for clarity.
 */

export interface Removal {
  id: string;
  /** Allocated tCO₂e (supplier allocation, post-buffer). */
  credits: number;
  /** Set to false while we haven't sourced the checkpoint data yet. */
  available: boolean;
  /**
   * Registry-published gross "CDR from weathering" p16 in tCO₂e — the value
   * our chain should reproduce when we run with the corresponding inputs.
   * This is the same number that appears in the registry data-points table
   * as "CDR from weathering". Null = not yet known / data not staged.
   */
  registryP16: number | null;
}

export interface Issuance {
  title: string;
  /** ISO date string (YYYY-MM-DD). */
  issueDate: string;
  /** Total tCO₂e issued (before supplier-allocation split). */
  issued: number;
  /** Tonnes routed to the buffer pool. */
  bufferPool: number;
  /** Tonnes allocated to the supplier (sum of tranche credits). */
  supplierAllocation: number;
  removals: Removal[];
}

export const ISSUANCES: Issuance[] = [
  {
    title: "Darjeeling Revival: Monsoon Harvest",
    issueDate: "2026-04-30",
    issued: 6579.94,
    bufferPool: 131.6,
    supplierAllocation: 6448.34,
    removals: [
      {
        id: "rmv_1KH3W7FMH1S0J5R9",
        credits: 2777.986,
        available: true,
        registryP16: 4703.709,
      },
      {
        id: "rmv_1KP3N5DC81S0TCV7",
        credits: 3670.354,
        available: true,
        registryP16: 5568.389,
      },
    ],
  },
  {
    title: "Darjeeling Revival: Alt x MOL",
    issueDate: "2026-04-14",
    issued: 2765.37,
    bufferPool: 55.308,
    supplierAllocation: 2710.062,
    removals: [
      // Data uses library v0.17.1 (older schema: soil_samples.csv, no separate
      // feedstock/bulk_density files). Not currently runnable through the
      // v0.21.4 chain in this app — flagged as unavailable.
      {
        id: "rmv_1KJY9XXRH1S0WQWQ",
        credits: 2765.37,
        available: false,
        registryP16: null,
      },
    ],
  },
  {
    title: "Darjeeling Revival: Alt x MOL",
    issueDate: "2025-11-14",
    issued: 221.35,
    bufferPool: 4.427,
    supplierAllocation: 216.923,
    removals: [
      // Source data not yet sourced — only the registry page text is on disk.
      {
        id: "rmv_1K88TT4NG1S0ZE4S",
        credits: 221.35,
        available: false,
        registryP16: null,
      },
    ],
  },
];

export const ALL_REMOVALS: Removal[] = ISSUANCES.flatMap((i) => i.removals);
export const REMOVAL_BY_ID: Record<string, Removal> = Object.fromEntries(
  ALL_REMOVALS.map((r) => [r.id, r]),
);

/** Find the parent issuance for a given removal id (linear scan, list is tiny). */
export function issuanceForRemoval(id: string): Issuance | undefined {
  return ISSUANCES.find((i) => i.removals.some((r) => r.id === id));
}

/** The removal selected by default (first available). */
export const DEFAULT_REMOVAL_ID: string =
  ALL_REMOVALS.find((r) => r.available)?.id ?? ALL_REMOVALS[0].id;

/** Public URL prefix for a removal's checkpoint data. */
export function checkpointBase(removalId: string): string {
  return `/checkpoints/${removalId}`;
}
