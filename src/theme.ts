import type { EdgeKind, NodeType } from "./types";

// Light, legible map: off-white water, saturated nodes, dark text.
export const BG = 0xfbfbf9;
export const BG_CSS = "#FBFBF9";

export const NODE_STYLE: Record<NodeType, { color: number; css: string; label: string; shape: string }> = {
  person: { color: 0x3b82f6, css: "#3B82F6", label: "Person", shape: "Circle" },
  organization: { color: 0x8b5cf6, css: "#8B5CF6", label: "Organization", shape: "Rounded square" },
  agent: { color: 0xf97316, css: "#F97316", label: "Agent", shape: "Diamond" }
};

export type EdgeStyle = { color: number; css: string; width: number; dashed: boolean; dash: number; gap: number; label: string; means: string };

export const EDGE_STYLE: Record<EdgeKind, EdgeStyle> = {
  affiliation: { color: 0x4b5563, css: "#4B5563", width: 1, dashed: false, dash: 0, gap: 0, label: "Affiliation", means: "A sourced relationship such as working at the same company or on the same project." },
  built: { color: 0xb45309, css: "#B45309", width: 1, dashed: false, dash: 0, gap: 0, label: "Built / operates", means: "Made or runs this agent or project — sourced." },
  collaboration: { color: 0x15803d, css: "#15803D", width: 1, dashed: false, dash: 0, gap: 0, label: "Collaboration", means: "Sourced joint work, such as a co-built project or paper." },
  interaction: { color: 0x0e7490, css: "#0E7490", width: 1, dashed: true, dash: 1.2, gap: 0.8, label: "Interaction", means: "A reply or quote on X that led the research to this account. It records a discovery path, not collaboration." },
  shared_topic: { color: 0xbe185d, css: "#BE185D", width: 1, dashed: true, dash: 0.35, gap: 0.8, label: "Shared topic", means: "Both work in the same area. No direct relationship is claimed." },
  cluster: { color: 0x9ca3af, css: "#9CA3AF", width: 1, dashed: false, dash: 0, gap: 0, label: "Cluster (undefined)", means: "Kept in the data. Its meaning has not been defined, so it is not drawn." },
  bridge: { color: 0x9ca3af, css: "#9CA3AF", width: 1, dashed: true, dash: 1, gap: 1, label: "Bridge (undefined)", means: "Kept in the research data. Its meaning for this map has not been defined, so it is not drawn." }
};

// Linear-style restraint: lines are neutral hairlines; indigo is the one accent (selection).
export const SELECT_COLOR = 0x5e6ad2;
export const SELECT_CSS = "#5E6AD2";
export const NEUTRAL_EDGE = 0xa3a8b0;
export const INK = 0x16181d;
