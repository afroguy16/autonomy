// Normalizes incoming JSON (unified shape or older CPM shape) and works out
// what can honestly be drawn: only eligible accounts with at least one valid edge.

import { EDGE_KINDS, type Edge, type EdgeKind, type GraphMap, type Node, type NodeType, type Source } from "./types";

type Raw = Record<string, any>;

const TYPE_ALIASES: Record<string, NodeType> = {
  person: "person", human: "person", people: "person",
  organization: "organization", org: "organization", organisation: "organization", company: "organization",
  agent: "agent", bot: "agent"
};

export function normalizeGraph(raw: Raw): GraphMap {
  const sources: Source[] = Array.isArray(raw.sources) ? raw.sources.filter((s: Raw) => s && s.id && s.url) : [];
  const byUrl = new Map(sources.map((s) => [s.url, s.id]));
  let urlN = 0;
  const sourceIdForUrl = (url: string) => {
    let id = byUrl.get(url);
    if (!id) {
      id = `src-url-${++urlN}`;
      while (sources.some((s) => s.id === id)) id = `src-url-${++urlN}`;
      sources.push({ id, url });
      byUrl.set(url, id);
    }
    return id;
  };

  const nodes: Node[] = (Array.isArray(raw.nodes) ? raw.nodes : []).filter(Boolean).map((n: Raw): Node => {
    const handle = n.handle ? String(n.handle).replace(/^@/, "") : undefined;
    const id = String(n.id ?? handle ?? "").replace(/^@/, "");
    const type = TYPE_ALIASES[String(n.type ?? "").toLowerCase()] ?? ("person" as NodeType);
    const profiles = { x: n.profiles?.x ?? n.x ?? null, linkedin: n.profiles?.linkedin ?? n.linkedin ?? null };
    const evidence: string[] = Array.isArray(n.evidence) ? n.evidence.map((u: string) => sourceIdForUrl(u)) : [];
    return {
      id,
      type,
      handle,
      name: n.name ?? n.label ?? undefined,
      profiles,
      avatarUrl: n.avatarUrl,
      summary: n.summary,
      notes: n.notes ?? n.note,
      primary_topic: n.primary_topic,
      topics: Array.isArray(n.topics) ? n.topics : [],
      projects: Array.isArray(n.projects) ? n.projects.map((p: Raw, i: number) => ({ id: String(p.id ?? `${id}-project-${i}`), name: String(p.name ?? "Untitled project"), description: p.description, url: p.url, source_ids: p.source_ids ?? [] })) : [],
      inclusion_source_ids: [...(n.inclusion_source_ids ?? []), ...evidence],
      claims: Array.isArray(n.claims) ? n.claims : [],
      confidence: n.confidence ?? null,
      confidence_note: n.confidence_note ?? null,
      added_at: n.added_at
    };
  }).filter((n: Node) => n.id);

  let edgeN = 0;
  const edges: Edge[] = (Array.isArray(raw.edges) ? raw.edges : []).filter(Boolean).map((e: Raw): Edge => {
    const evidenceUrls: string[] = Array.isArray(e.evidence) ? e.evidence : typeof e.evidence === "string" ? [e.evidence] : [];
    const source = String(e.source ?? e.from ?? "").replace(/^@/, "");
    const target = String(e.target ?? e.to ?? "").replace(/^@/, "");
    return {
      id: String(e.id ?? `edge-${++edgeN}-${source}-${target}`),
      source,
      target,
      kind: (String(e.kind ?? e.type ?? "engagement") as EdgeKind),
      label: e.label,
      detail: e.detail ?? null,
      period: e.period ?? null,
      project_id: e.project_id,
      topic_ids: e.topic_ids,
      source_ids: [...(e.source_ids ?? []), ...evidenceUrls.map(sourceIdForUrl)],
      confidence: e.confidence ?? null,
      note: e.note ?? null
    };
  });

  return {
    meta: {
      name: raw.meta?.name ?? "Untitled map",
      version: raw.meta?.version ?? 1,
      updated: raw.meta?.updated ?? new Date().toISOString().slice(0, 10),
      ...raw.meta
    },
    topics: Array.isArray(raw.topics) ? raw.topics : [],
    sources,
    nodes,
    edges
  };
}

/** Merge additional records into a map. Records with an existing id are replaced. */
export function mergeGraph(base: GraphMap, add: Partial<GraphMap>): GraphMap {
  const byId = <T extends { id: string }>(a: T[], b: T[] = []) => {
    const m = new Map(a.map((x) => [x.id, x]));
    b.forEach((x) => m.set(x.id, x));
    return Array.from(m.values());
  };
  return {
    meta: { ...base.meta, ...(add.meta ?? {}), updated: new Date().toISOString().slice(0, 10) },
    topics: byId(base.topics, add.topics),
    sources: byId(base.sources, add.sources),
    nodes: byId(base.nodes, add.nodes),
    edges: byId(base.edges, add.edges)
  };
}

export type IssueLevel = "error" | "warning" | "info";
export type Issue = { level: IssueLevel; code: string; message: string; ids: string[] };

export type Analysis = {
  nodeById: Map<string, Node>;
  sourceById: Map<string, Source>;
  topicLabel: Map<string, string>;
  /** Edges that can be drawn: both ends exist, are eligible, valid kind. */
  drawnEdges: Edge[];
  /** Nodes drawn on the map (eligible, with at least one drawn edge). */
  mapNodeIds: string[];
  /** Records kept in the JSON but not drawn, with the reason. */
  offMap: { id: string; reason: string }[];
  degree: Map<string, number>;
  edgesByNode: Map<string, Edge[]>;
  issues: Issue[];
};

export function profileProblem(n: Node): string | null {
  if (n.type === "agent" || n.type === "organization") {
    return n.profiles?.x ? null : `${n.type === "agent" ? "Agents" : "Organizations"} need a public X profile`;
  }
  return n.profiles?.x || n.profiles?.linkedin ? null : "People need a public X or LinkedIn profile";
}

export function analyze(g: GraphMap): Analysis {
  const issues: Issue[] = [];
  const nodeById = new Map<string, Node>();
  for (const n of g.nodes) {
    if (nodeById.has(n.id)) issues.push({ level: "warning", code: "dup-node", message: `Duplicate node id "${n.id}"; the later record wins.`, ids: [n.id] });
    nodeById.set(n.id, n);
  }
  const sourceById = new Map(g.sources.map((s) => [s.id, s]));
  const topicLabel = new Map(g.topics.map((t) => [t.id, t.label]));

  const ineligible = new Map<string, string>();
  for (const n of nodeById.values()) {
    const p = profileProblem(n);
    if (p) {
      ineligible.set(n.id, p);
      issues.push({ level: "error", code: "profile", message: `${n.name ?? n.id}: ${p}. Not drawn.`, ids: [n.id] });
    }
    const missing = [...n.inclusion_source_ids, ...n.claims.flatMap((c) => c.source_ids), ...n.projects.flatMap((p) => p.source_ids)].filter((s) => !sourceById.has(s));
    if (missing.length) issues.push({ level: "warning", code: "missing-source", message: `${n.name ?? n.id} cites unknown source ${missing.join(", ")}.`, ids: [n.id] });
    if (!n.inclusion_source_ids.length) issues.push({ level: "warning", code: "no-inclusion", message: `${n.name ?? n.id} has no inclusion evidence.`, ids: [n.id] });
    n.topics.filter((t) => !topicLabel.has(t)).forEach((t) => issues.push({ level: "info", code: "unknown-topic", message: `${n.name ?? n.id} uses topic "${t}", which is not in the topic list.`, ids: [n.id] }));
  }

  const drawnEdges: Edge[] = [];
  const seenEdgeIds = new Set<string>();
  for (const e of g.edges) {
    if (seenEdgeIds.has(e.id)) issues.push({ level: "warning", code: "dup-edge", message: `Duplicate edge id "${e.id}".`, ids: [e.id] });
    seenEdgeIds.add(e.id);
    if (!EDGE_KINDS.includes(e.kind)) { issues.push({ level: "error", code: "kind", message: `Edge ${e.id} has unknown kind "${e.kind}". Not drawn.`, ids: [e.id] }); continue; }
    if (e.source === e.target) { issues.push({ level: "warning", code: "self", message: `Edge ${e.id} links ${e.source} to itself. Not drawn.`, ids: [e.id] }); continue; }
    const missingEnd = [e.source, e.target].filter((id) => !nodeById.has(id));
    if (missingEnd.length) { issues.push({ level: "error", code: "dangling", message: `Edge ${e.id} points to missing account ${missingEnd.map((m) => `"${m}"`).join(" and ")}. Not drawn.`, ids: [e.id] }); continue; }
    if (ineligible.has(e.source) || ineligible.has(e.target)) continue;
    const badSrc = e.source_ids.filter((s) => !sourceById.has(s));
    if (badSrc.length) issues.push({ level: "warning", code: "missing-source", message: `Edge ${e.id} cites unknown source ${badSrc.join(", ")}.`, ids: [e.id] });
    if (e.kind !== "shared_topic" && e.kind !== "cluster" && e.source_ids.length === 0) issues.push({ level: "warning", code: "no-evidence", message: `Edge ${e.id} (${e.kind}) has no evidence.`, ids: [e.id] });
    drawnEdges.push(e);
  }
  const clusterCount = drawnEdges.filter((e) => e.kind === "cluster").length;
  if (clusterCount) issues.push({ level: "info", code: "cluster", message: `${clusterCount} legacy "cluster" edge${clusterCount > 1 ? "s are" : " is"} drawn as-is; their meaning is not defined yet.`, ids: [] });

  const degree = new Map<string, number>();
  const edgesByNode = new Map<string, Edge[]>();
  for (const e of drawnEdges) {
    for (const id of [e.source, e.target]) {
      degree.set(id, (degree.get(id) ?? 0) + 1);
      if (!edgesByNode.has(id)) edgesByNode.set(id, []);
      edgesByNode.get(id)!.push(e);
    }
  }
  const mapNodeIds = Array.from(nodeById.keys()).filter((id) => (degree.get(id) ?? 0) > 0);
  const offMap: { id: string; reason: string }[] = [];
  for (const n of nodeById.values()) {
    if (degree.get(n.id)) continue;
    offMap.push({ id: n.id, reason: ineligible.get(n.id) ?? "No connections to other accounts on the map" });
  }
  const isolatedOnly = offMap.filter((o) => !ineligible.has(o.id));
  if (isolatedOnly.length) issues.push({ level: "info", code: "isolated", message: `${isolatedOnly.length} account${isolatedOnly.length > 1 ? "s have" : " has"} no connections. Kept in the data, not drawn on the map.`, ids: isolatedOnly.map((o) => o.id) });

  return { nodeById, sourceById, topicLabel, drawnEdges, mapNodeIds, offMap, degree, edgesByNode, issues };
}
