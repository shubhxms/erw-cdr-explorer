import type { Stage } from "../dag/nodes";

export const STAGE_COLOR: Record<Stage, string> = {
  inputs: "#5b8def",
  cleaning: "#8a92a6",
  bootstrap: "#33aa66",
  chain_deployment: "#cc6633",
  chain_treatment: "#996644",
  diagnostics: "#aa88aa",
  aggregation: "#aa9a33",
};
