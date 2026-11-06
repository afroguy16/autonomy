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
  const sources: Source[] = Array.isArray(raw.sources) ? raw.sources.filter((s: Raw) => s && s.id && s.url).map((s: Raw) => ({
    id: String(s.id), url: String(s.url), title: s.title, publisher: s.publisher,
    date: s.date, accessed: s.accessed ?? s.retrievedAt
  })) : [];
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
    const profileUrl = typeof n.url === "string" ? n.url : null;
    const profiles = {
      x: n.profiles?.x ?? n.x ?? (profileUrl && /(?:^|\/\/)(?:www\.)?(?:x\.com|twitter\.com)\//i.test(profileUrl) ? profileUrl : null),
      linkedin: n.profiles?.linkedin ?? n.linkedin ?? (profileUrl && /(?:^|\/\/)(?:www\.)?linkedin\.com\//i.test(profileUrl) ? profileUrl : null)
    };
    const rawNote = n.note && typeof n.note === "object" ? n.note.text : typeof n.note === "string" ? n.note : undefined;
    const noteSourceIds: string[] = Array.isArray(n.note?.sourceIds) ? n.note.sourceIds : Array.isArray(n.note_source_ids) ? n.note_source_ids : [];
    return {
      id,
      type,
      handle,
      name: n.name ?? n.label ?? undefined,
      profiles,
      avatarUrl: n.avatarUrl,
      summary: n.summary,
      notes: n.notes ?? rawNote ?? "",
      note_source_ids: [...new Set(noteSourceIds)],
      primary_topic: n.primary_topic,
      topics: Array.isArray(n.topics) ? n.topics : [],
      projects: Array.isArray(n.projects) ? n.projects.map((p: Raw, i: number) => ({ id: String(p.id ?? `${id}-project-${i}`), name: String(p.name ?? "Untitled project"), description: p.description, url: p.url, source_ids: p.source_ids ?? [] })) : [],
      claims: Array.isArray(n.claims) ? n.claims : [],
      incomplete: n.incomplete ? true : undefined,
      missing: Array.isArray(n.missing) ? n.missing : undefined
    };
  }).filter((n: Node) => n.id);

  let edgeN = 0;
  const edges: Edge[] = (Array.isArray(raw.edges) ? raw.edges : []).filter(Boolean).map((e: Raw): Edge => {
    const evidenceUrls: string[] = Array.isArray(e.evidence) ? e.evidence : typeof e.evidence === "string" ? [e.evidence] : [];
    const source = String(e.source ?? e.from ?? "").replace(/^@/, "");
    const target = String(e.target ?? e.to ?? "").replace(/^@/, "");
    const sourceIds = e.source_ids ?? e.sourceIds ?? [];
    const rawKind = String(e.kind ?? e.type ?? "interaction");
    return {
      id: String(e.id ?? `edge-${++edgeN}-${source}-${target}`),
      source,
      target,
      kind: (rawKind === "engagement" ? "interaction" : rawKind) as EdgeKind,
      label: e.label,
      detail: e.detail ?? null,
      period: e.period ?? null,
      project_id: e.project_id,
      topic_ids: e.topic_ids,
      source_ids: [...new Set([...sourceIds, ...evidenceUrls.map(sourceIdForUrl)])],
      incomplete: e.incomplete ? true : undefined,
      missing: Array.isArray(e.missing) ? e.missing : undefined,
      pendingDefinition: e.pendingDefinition ? true : undefined
    };
  });

  return {
    meta: {
      name: raw.meta?.name ?? "Untitled map",
      version: raw.meta?.version ?? 1,
      updated: raw.meta?.updated ?? new Date().toISOString().slice(0, 10),
      is_sample: raw.meta?.is_sample ?? false,
      legend: raw.meta?.legend
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
    if (n.incomplete) {
      const missingFields = n.missing?.length ? n.missing.join(", ") : "required research fields";
      ineligible.set(n.id, `Research record is incomplete: ${missingFields}`);
      issues.push({ level: "warning", code: "incomplete-node", message: `${n.name ?? n.id} is incomplete (${missingFields}); not drawn.`, ids: [n.id] });
    }
    const p = profileProblem(n);
    if (p) {
      ineligible.set(n.id, p);
      issues.push({ level: "error", code: "profile", message: `${n.name ?? n.id}: ${p}. Not drawn.`, ids: [n.id] });
    }
    const missing = [...n.note_source_ids, ...n.claims.flatMap((c) => c.source_ids), ...n.projects.flatMap((p) => p.source_ids)].filter((s) => !sourceById.has(s));
    if (missing.length) {
      issues.push({ level: "warning", code: "missing-source", message: `${n.name ?? n.id} cites unknown source ${missing.join(", ")}.`, ids: [n.id] });
      if (n.note_source_ids.some((id) => missing.includes(id))) ineligible.set(n.id, "Its researcher note cites a source that is missing from the source catalog");
    }
    if (!n.notes.trim()) {
      issues.push({ level: "warning", code: "no-note", message: `${n.name ?? n.id} has no researcher note.`, ids: [n.id] });
      ineligible.set(n.id, "No researcher note is recorded");
    }
    if (!n.note_source_ids.length) {
      issues.push({ level: "warning", code: "no-note-source", message: `${n.name ?? n.id} has no source attached to its researcher note.`, ids: [n.id] });
      ineligible.set(n.id, "No source is attached to its researcher note");
    }
    n.topics.filter((t) => !topicLabel.has(t)).forEach((t) => issues.push({ level: "info", code: "unknown-topic", message: `${n.name ?? n.id} uses topic "${t}", which is not in the topic list.`, ids: [n.id] }));
  }

  const drawnEdges: Edge[] = [];
  const incompleteEdges: Edge[] = [];
  const undefinedEdges: Edge[] = [];
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
    if (e.pendingDefinition || e.kind === "cluster" || e.kind === "bridge") { undefinedEdges.push(e); continue; }
    if (e.incomplete || ((e.kind === "interaction" || e.kind === "affiliation") && (!e.source_ids.length || (e.kind === "affiliation" && !e.detail?.trim())))) {
      incompleteEdges.push(e);
      continue;
    }
    if (e.kind !== "shared_topic" && e.source_ids.length === 0) {
      issues.push({ level: "warning", code: "no-source", message: `Edge ${e.id} (${e.kind}) has no source and is not drawn.`, ids: [e.id] });
      continue;
    }
    drawnEdges.push(e);
  }
  const byKindAndMissing = new Map<string, Edge[]>();
  for (const e of incompleteEdges) {
    const key = `${e.kind}:${(e.missing ?? []).join(",") || "incomplete"}`;
    if (!byKindAndMissing.has(key)) byKindAndMissing.set(key, []);
    byKindAndMissing.get(key)!.push(e);
  }
  for (const [key, records] of byKindAndMissing) {
    const [kind, missing] = key.split(":");
    issues.push({ level: "warning", code: "incomplete-edge", message: `${records.length} ${kind} record${records.length === 1 ? " is" : "s are"} incomplete (${missing}); kept in data, not drawn.`, ids: records.map((e) => e.id) });
  }
  if (undefinedEdges.length) {
    const byKind = new Map<string, Edge[]>();
    for (const e of undefinedEdges) { if (!byKind.has(e.kind)) byKind.set(e.kind, []); byKind.get(e.kind)!.push(e); }
    for (const [kind, records] of byKind) issues.push({ level: "info", code: `undefined-${kind}`, message: `${records.length} ${kind} record${records.length === 1 ? " is" : "s are"} preserved but not drawn until its meaning is defined.`, ids: records.map((e) => e.id) });
  }

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
  const drawnIds = new Set(drawnEdges.map((e) => e.id));
  for (const n of nodeById.values()) {
    if (degree.get(n.id)) continue;
    const held = g.edges.filter((e) => (e.source === n.id || e.target === n.id) && !drawnIds.has(e.id));
    const heldKinds = [...new Set(held.map((e) => e.incomplete ? "incomplete connection" : "undefined connection"))];
    const heldReason = held.length ? `${held.length} ${heldKinds.join(" / ")} record${held.length === 1 ? " is" : "s are"} kept in the data but not drawn` : "No connections to other accounts on the map";
    offMap.push({ id: n.id, reason: ineligible.get(n.id) ?? heldReason });
  }
  const isolatedOnly = offMap.filter((o) => !ineligible.has(o.id));
  if (isolatedOnly.length) issues.push({ level: "info", code: "isolated", message: `${isolatedOnly.length} account${isolatedOnly.length > 1 ? "s have" : " has"} no connections. Kept in the data, not drawn on the map.`, ids: isolatedOnly.map((o) => o.id) });

  return { nodeById, sourceById, topicLabel, drawnEdges, mapNodeIds, offMap, degree, edgesByNode, issues };
}
