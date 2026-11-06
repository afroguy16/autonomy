import type { EdgeKind, NodeType } from "./types";

// Light, legible map: off-white water, saturated nodes, dark text.
export const BG = 0xfbfbf9;
export const BG_CSS = "#FBFBF9";

export const NODE_STYLE: Record<NodeType, { color: number; css: string; label: string; shape: string }> = {
  person: { color: 0x2563eb, css: "#2563EB", label: "Person", shape: "Circle" },
  organization: { color: 0x5b21b6, css: "#5B21B6", label: "Organization", shape: "Rounded square" },
  agent: { color: 0xd9580d, css: "#D9580D", label: "Agent", shape: "Diamond" }
};

export type EdgeStyle = { color: number; css: string; width: number; dashed: boolean; dash: number; gap: number; label: string; means: string };

export const EDGE_STYLE: Record<EdgeKind, EdgeStyle> = {
  affiliation: { color: 0x4b5563, css: "#4B5563", width: 1.8, dashed: false, dash: 0, gap: 0, label: "Affiliation", means: "Works at, founded or advises — sourced." },
  built: { color: 0xb45309, css: "#B45309", width: 2.4, dashed: false, dash: 0, gap: 0, label: "Built / operates", means: "Made or runs this agent or project — sourced." },
  collaboration: { color: 0x15803d, css: "#15803D", width: 3.2, dashed: false, dash: 0, gap: 0, label: "Collaboration", means: "Sourced joint work, such as a co-built project or paper." },
  engagement: { color: 0x0e7490, css: "#0E7490", width: 1.7, dashed: true, dash: 1.2, gap: 0.8, label: "Engagement", means: "A reply or quote on X that led the research to this account. It records a discovery path, not collaboration." },
  shared_topic: { color: 0xbe185d, css: "#BE185D", width: 1.7, dashed: true, dash: 0.35, gap: 0.8, label: "Shared topic", means: "Both work in the same area. No direct relationship is claimed." },
  cluster: { color: 0x9ca3af, css: "#9CA3AF", width: 1.2, dashed: false, dash: 0, gap: 0, label: "Cluster (legacy)", means: "Kept from older data. What it means is not defined yet." }
};

export const SELECT_COLOR = 0xfacc15;
export const INK = 0x16181d;
