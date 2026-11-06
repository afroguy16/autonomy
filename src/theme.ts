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

// ---------- dark mode ----------
// The map keeps the same structure in both themes; only these colours change.
export type MapPalette = { bg: number; neutral: number; select: number; snow: [number, number, number]; edge: Partial<Record<EdgeKind, number>>; edgeCss: Partial<Record<EdgeKind, string>> };
export const PALETTES: Record<"light" | "dark", MapPalette> = {
  light: { bg: BG, neutral: NEUTRAL_EDGE, select: SELECT_COLOR, snow: [0.45, 0.52, 0.62], edge: {}, edgeCss: {} },
  dark: {
    bg: 0x0d0e11,
    neutral: 0x464a53,
    select: 0x7c86ea,
    snow: [0.62, 0.67, 0.78],
    // Brighter variants of each kind so lines read on the dark ground.
    edge: { affiliation: 0xa1a8b3, built: 0xf2a65e, collaboration: 0x4ade80, interaction: 0x38bdf8, shared_topic: 0xf472b6, cluster: 0x6b7280, bridge: 0x6b7280 },
    edgeCss: { affiliation: "#A1A8B3", built: "#F2A65E", collaboration: "#4ADE80", interaction: "#38BDF8", shared_topic: "#F472B6", cluster: "#6B7280", bridge: "#6B7280" }
  }
};
export const isDarkTheme = () => document.documentElement.dataset.theme === "dark";
export const edgeCss = (k: EdgeKind) => (isDarkTheme() ? PALETTES.dark.edgeCss[k] : undefined) ?? EDGE_STYLE[k].css;
