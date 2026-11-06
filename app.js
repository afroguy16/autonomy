// src/seed.ts
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var FIRST = ["Ada", "Bram", "Cyra", "Dax", "Elin", "Femi", "Gus", "Hana", "Ivo", "Juno", "Kofi", "Lior", "Mara", "Nils", "Oona", "Pax", "Quin", "Rhea", "Sami", "Tove", "Uma", "Vik", "Wren", "Xan", "Yara", "Zeke", "Ayo", "Bea", "Cato", "Dara", "Eko", "Fen", "Gia", "Hal", "Ines", "Jael", "Kai", "Lumi", "Moe", "Nia", "Odin", "Pia", "Ravi", "Sol", "Tam", "Ula", "Vera", "Wim"];
var LAST = ["Ashby", "Brook", "Calder", "Dune", "Ember", "Fallow", "Glenn", "Harrow", "Inlet", "Juniper", "Kestrel", "Larch", "Moss", "Nettle", "Orrin", "Pike", "Quarry", "Reed", "Sorrel", "Thorne", "Vale", "Wick", "Yarrow", "Zephyr", "Alder", "Birch", "Cove", "Drift"];
var ORGS = ["Tidewater Labs", "Brinefield Systems", "Coralgate", "Deepcurrent", "Kelpworks", "Saltline Compute", "Lanternfish Labs", "Undertow Systems", "Shoal Collective", "Pelagic Labs", "Driftwood Agents", "Benthic Tools", "Gyre Research", "Spindrift AI"];
var AGENT_WORDS = ["Relay", "Scout", "Pilot", "Ferry", "Beacon", "Dredge", "Sonar", "Tender", "Skiff", "Buoy", "Ballast", "Anchor", "Keel", "Rudder", "Sextant", "Bosun", "Gull", "Tern", "Petrel", "Heron", "Wake", "Eddy", "Swell", "Squall"];
var TOPICS = [
  { id: "harnesses", label: "Agent harnesses", description: "Runtimes that drive a model through tools, state and retries." },
  { id: "orchestration", label: "Multi-agent orchestration", description: "Groups of agents coordinating across tools or teams." },
  { id: "tool-protocols", label: "Tool & context protocols", description: "How agents discover and call tools and data." },
  { id: "evals", label: "Agent evals", description: "Measuring multi-step agent behaviour." },
  { id: "sandboxes", label: "Sandboxes & execution", description: "Isolated environments where agents run code." },
  { id: "memory", label: "Memory & retrieval", description: "Long-lived state and retrieval for agents." },
  { id: "inference", label: "Inference infrastructure", description: "Serving, routing and scaling model calls." },
  { id: "observability", label: "Agent observability", description: "Tracing and debugging agent runs." }
];
var BUILDS = {
  harnesses: ["an open agent harness with pluggable tool loops", "a retry-and-recover layer for long agent runs", "a minimal harness for coding agents"],
  orchestration: ["a planner that splits work across specialist agents", "a message bus for agents working across teams", "a supervisor pattern for agent swarms"],
  "tool-protocols": ["a tool registry agents can query at runtime", "adapters that expose internal APIs as agent tools", "a context protocol server for shared documents"],
  evals: ["a benchmark for multi-step tool-using agents", "regression tests for agent trajectories", "an eval harness that replays real agent sessions"],
  sandboxes: ["ephemeral sandboxes for agent-written code", "a permission layer for agents touching file systems", "microVM isolation for untrusted agent actions"],
  memory: ["a long-term memory store for agents", "retrieval tuned for agent scratchpads", "a shared memory layer for agent teams"],
  inference: ["a router that picks models per agent step", "batching infrastructure for agent workloads", "a cache that cuts repeated agent calls"],
  observability: ["tracing for nested agent calls", "a debugger that replays agent decisions", "cost and latency dashboards for agent runs"]
};
function buildSeed(seed = 7) {
  const rnd = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const chance = (p) => rnd() < p;
  const conf2 = () => {
    const r = rnd();
    return r < 0.55 ? "high" : r < 0.85 ? "medium" : "low";
  };
  const sources = [];
  const nodes = [];
  const edges = [];
  const usedHandles = /* @__PURE__ */ new Set();
  let srcN = 0;
  let edgeN = 0;
  let projN = 0;
  const date = (monthBack) => {
    const d = new Date(Date.UTC(2026, 9, 28));
    d.setUTCDate(d.getUTCDate() - Math.floor(monthBack * 30 + rnd() * 25));
    return d.toISOString().slice(0, 10);
  };
  function addSource(kind, handle, title) {
    srcN++;
    const id = `src-${String(srcN).padStart(3, "0")}`;
    const url = kind === "post" ? `https://example.com/x/${handle}/status/${1e5 + srcN * 37}` : kind === "project" ? `https://example.com/projects/${handle}-${srcN}` : kind === "paper" ? `https://example.com/papers/${srcN}` : `https://example.com/pages/${handle}`;
    sources.push({ id, url, title, publisher: kind === "post" ? "X (sample)" : "example.com", date: date(rnd() * 10), accessed: "2026-11-01" });
    return id;
  }
  function uniqueHandle(base) {
    let h = base.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    h = `sample_${h}`.slice(0, 15);
    let out = h;
    let i = 2;
    while (usedHandles.has(out)) out = `${h.slice(0, 13)}${i++}`;
    usedHandles.add(out);
    return out;
  }
  function makeNode(type, name, topic, extraTopics) {
    const handle = uniqueHandle(name);
    const what = pick(BUILDS[topic]);
    const summary = type === "person" ? `Builds ${what}.` : type === "organization" ? `Team building ${what}.` : `Agent that runs on ${what.replace(/^an? /, "")}.`;
    const inclusion = addSource(type === "person" ? "post" : "page", handle, `[Sample] ${name}: ${what}`);
    const projects = [];
    if (type !== "agent" && chance(0.7)) {
      projN++;
      const pName = `${pick(AGENT_WORDS)}${pick(["kit", "bench", "flow", "line", "base"])}`;
      projects.push({
        id: `proj-${projN}`,
        name: pName,
        description: `Open project for ${what.replace(/^an? /, "")}.`,
        url: `https://example.com/projects/${pName.toLowerCase()}`,
        source_ids: [addSource("project", handle, `[Sample] ${pName} repository`)]
      });
    }
    const c = conf2();
    return {
      id: handle,
      type,
      handle,
      name,
      profiles: {
        x: `https://example.com/x/${handle}`,
        linkedin: type === "person" && chance(0.4) ? `https://example.com/linkedin/${handle}` : null
      },
      summary,
      notes: "",
      primary_topic: topic,
      topics: Array.from(/* @__PURE__ */ new Set([topic, ...extraTopics])),
      projects,
      inclusion_source_ids: [inclusion],
      claims: [{ field: "summary", source_ids: [inclusion] }],
      confidence: c,
      confidence_note: c === "low" ? "Only one public source so far." : null,
      added_at: date(rnd() * 4)
    };
  }
  function edge(source, target, kind, label, extra = {}) {
    edgeN++;
    const srcHandle = source;
    const evidence = kind === "shared_topic" ? [] : kind === "engagement" ? [addSource("post", srcHandle, `[Sample] @${source} replied to @${target}`)] : [addSource(kind === "collaboration" ? "paper" : "page", srcHandle, `[Sample] Evidence: ${source} ${label} ${target}`)];
    const e = {
      id: `e-${String(edgeN).padStart(3, "0")}`,
      source,
      target,
      kind,
      label,
      detail: null,
      period: null,
      source_ids: evidence,
      confidence: kind === "shared_topic" ? null : conf2(),
      note: null,
      ...extra
    };
    edges.push(e);
    return e;
  }
  const personName = () => `${pick(FIRST)} ${pick(LAST)}`;
  const topicIds = TOPICS.map((t) => t.id);
  const orgIds = [];
  const people = [];
  const agents = [];
  ORGS.forEach((orgName, i) => {
    const topic = topicIds[i % topicIds.length];
    const org = makeNode("organization", orgName, topic, chance(0.5) ? [pick(topicIds)] : []);
    nodes.push(org);
    orgIds.push(org.id);
    const staff = 2 + Math.floor(rnd() * 4);
    for (let s = 0; s < staff; s++) {
      const p = makeNode("person", personName(), chance(0.7) ? topic : pick(topicIds), chance(0.4) ? [pick(topicIds)] : []);
      nodes.push(p);
      people.push(p);
      const role = pick(["engineer", "researcher", "founder", "maintainer"]);
      edge(p.id, org.id, "affiliation", role === "founder" ? "co-founded" : "works at", { detail: `Role: ${role}`, period: { start: String(2021 + Math.floor(rnd() * 5)), end: null } });
    }
    const runs = 1 + Math.floor(rnd() * 3);
    for (let a = 0; a < runs; a++) {
      const ag = makeNode("agent", `${orgName.split(" ")[0]} ${pick(AGENT_WORDS)}`, topic, []);
      nodes.push(ag);
      agents.push(ag);
      edge(org.id, ag.id, "built", pick(["operates", "built"]));
    }
  });
  for (let i = 0; i < 9; i++) {
    const topic = pick(topicIds);
    const p = makeNode("person", personName(), topic, []);
    p.notes = "Independent builder; reached through the discovery crawl.";
    nodes.push(p);
    people.push(p);
    const own = 1 + Math.floor(rnd() * 3);
    for (let a = 0; a < own; a++) {
      const ag = makeNode("agent", `${pick(AGENT_WORDS)}-${10 + Math.floor(rnd() * 89)}`, topic, []);
      nodes.push(ag);
      agents.push(ag);
      edge(p.id, ag.id, "built", "built");
      if (chance(0.35)) {
        const sub = makeNode("agent", `${ag.name} sub-${pick(AGENT_WORDS).toLowerCase()}`, topic, []);
        sub.notes = `Sub-agent spawned by ${ag.name}.`;
        nodes.push(sub);
        agents.push(sub);
        edge(ag.id, sub.id, "built", "spawns");
      }
    }
  }
  const engagers = [...people, ...agents];
  for (let i = 0; i < 70; i++) {
    const a = pick(engagers);
    const b = pick(chance(0.8) ? people : engagers);
    if (a.id === b.id) continue;
    const verb = pick(["replied to", "quoted"]);
    edge(a.id, b.id, "engagement", verb, { detail: `Discovered when @${a.handle} ${verb} @${b.handle} about ${pick(TOPICS).label.toLowerCase()}.` });
    if (!a.notes) a.notes = `Found via ${verb === "quoted" ? "a quote" : "a reply"} involving @${b.handle}.`;
  }
  for (let i = 0; i < 16; i++) {
    const a = pick(people);
    const orgId = pick(orgIds);
    const b = chance(0.3) ? nodes.find((n) => n.id === orgId) : pick(people);
    if (a.id === b.id) continue;
    edge(a.id, b.id, "collaboration", pick(["co-built", "co-authored", "co-maintains"]), { detail: "[Sample] Joint project or paper." });
    if (chance(0.5)) edge(a.id, b.id, "engagement", "replied to", { detail: `Discovered when @${a.handle} replied to @${b.handle}.` });
  }
  for (let i = 0; i < 6; i++) {
    const a = pick(people);
    const b = pick(people);
    if (a.id === b.id) continue;
    const shared = a.topics.find((t) => b.topics.includes(t)) ?? a.primary_topic;
    edge(a.id, b.id, "shared_topic", "both work on", { topic_ids: [shared], note: "[Sample] Topic overlap judged from each account's own sources." });
  }
  for (let i = 0; i < 3; i++) {
    const a = pick(agents);
    const b = pick(agents);
    if (a.id !== b.id) edge(a.id, b.id, "cluster", "cluster (legacy)", { note: "Legacy cluster link. Its meaning is not defined yet." });
  }
  for (let i = 0; i < 5; i++) {
    const t = ["person", "organization", "agent"][i % 3];
    const n = makeNode(t, t === "person" ? personName() : t === "organization" ? `${pick(LAST)} Labs` : `Lone ${pick(AGENT_WORDS)}`, pick(topicIds), []);
    n.notes = "Added from the seed list; no connections found yet.";
    nodes.push(n);
  }
  const orphanAgent = makeNode("agent", "Unlisted Skiff", "harnesses", []);
  orphanAgent.profiles.x = null;
  nodes.push(orphanAgent);
  edge(orphanAgent.id, pick(people).id, "engagement", "replied to");
  edge(pick(people).id, "sample_ghost", "engagement", "replied to");
  const bad = edge(pick(people).id, pick(orgIds), "affiliation", "works at");
  bad.source_ids.push("src-missing");
  const seeds = orgIds.slice(0, 4);
  return {
    meta: {
      name: "Autonomy (sample data)",
      version: 1,
      updated: "2026-11-06",
      is_sample: true,
      confidence_levels: {
        high: "Two or more independent public sources agree.",
        medium: "One strong primary source.",
        low: "A single indirect source; treat with care."
      },
      legend: { person: "Person", organization: "Organization", agent: "Agent" },
      seeds,
      expanded: orgIds.slice(0, 8),
      frozen: []
    },
    topics: TOPICS,
    sources,
    nodes,
    edges
  };
}
function buildBatch(existing, batchNo2) {
  const rnd = mulberry32(1e3 + batchNo2);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const connected = /* @__PURE__ */ new Set();
  existing.edges.forEach((e) => {
    connected.add(e.source);
    connected.add(e.target);
  });
  const anchors = existing.nodes.filter((n) => connected.has(n.id));
  const nodes = [];
  const edges = [];
  const sources = [];
  const count = 6 + Math.floor(rnd() * 4);
  for (let i = 0; i < count; i++) {
    const type = rnd() < 0.5 ? "person" : rnd() < 0.6 ? "agent" : "organization";
    const base = type === "person" ? `${pick(FIRST)} ${pick(LAST)}` : type === "agent" ? `${pick(AGENT_WORDS)}-${Math.floor(rnd() * 900 + 100)}` : `${pick(LAST)} ${pick(["Labs", "Systems", "Works"])}`;
    const id = `sample_b${batchNo2}_${i}`;
    const srcId = `src-b${batchNo2}-${i}`;
    const anchor = pick(anchors);
    sources.push({ id: srcId, url: `https://example.com/x/${id}/status/${batchNo2}${i}`, title: `[Sample] @${id} replied to @${anchor.handle ?? anchor.id}`, publisher: "X (sample)", date: "2026-11-06" });
    const topic = anchor.primary_topic ?? existing.topics[0].id;
    nodes.push({
      id,
      type,
      handle: id,
      name: base,
      profiles: { x: `https://example.com/x/${id}`, linkedin: null },
      summary: `Newly added in research batch ${batchNo2}. Builds ${pick(BUILDS[topic] ?? ["agent tooling"])}.`,
      notes: `Batch ${batchNo2}: discovered via @${anchor.handle ?? anchor.id}.`,
      primary_topic: topic,
      topics: [topic],
      projects: [],
      inclusion_source_ids: [srcId],
      claims: [{ field: "summary", source_ids: [srcId] }],
      confidence: "medium",
      confidence_note: null,
      added_at: "2026-11-06"
    });
    edges.push({ id: `e-b${batchNo2}-${i}`, source: id, target: anchor.id, kind: "engagement", label: "replied to", detail: `Discovered when @${id} replied to @${anchor.handle ?? anchor.id}.`, source_ids: [srcId], confidence: "medium", note: null });
    if (i > 0 && rnd() < 0.4) {
      const sid = `src-b${batchNo2}-${i}-c`;
      sources.push({ id: sid, url: `https://example.com/projects/b${batchNo2}-${i}`, title: "[Sample] Joint project page", publisher: "example.com" });
      edges.push({ id: `e-b${batchNo2}-${i}-c`, source: id, target: nodes[i - 1].id, kind: "collaboration", label: "co-built", source_ids: [sid], confidence: "medium", note: null });
    }
  }
  return { nodes, edges, sources };
}

// src/types.ts
var NODE_TYPES = ["person", "organization", "agent"];
var EDGE_KINDS = ["engagement", "affiliation", "built", "collaboration", "shared_topic", "cluster"];

// src/normalize.ts
var TYPE_ALIASES = {
  person: "person",
  human: "person",
  people: "person",
  organization: "organization",
  org: "organization",
  organisation: "organization",
  company: "organization",
  agent: "agent",
  bot: "agent"
};
function normalizeGraph(raw) {
  const sources = Array.isArray(raw.sources) ? raw.sources.filter((s) => s && s.id && s.url) : [];
  const byUrl = new Map(sources.map((s) => [s.url, s.id]));
  let urlN = 0;
  const sourceIdForUrl = (url) => {
    let id = byUrl.get(url);
    if (!id) {
      id = `src-url-${++urlN}`;
      while (sources.some((s) => s.id === id)) id = `src-url-${++urlN}`;
      sources.push({ id, url });
      byUrl.set(url, id);
    }
    return id;
  };
  const nodes = (Array.isArray(raw.nodes) ? raw.nodes : []).filter(Boolean).map((n) => {
    const handle = n.handle ? String(n.handle).replace(/^@/, "") : void 0;
    const id = String(n.id ?? handle ?? "").replace(/^@/, "");
    const type = TYPE_ALIASES[String(n.type ?? "").toLowerCase()] ?? "person";
    const profiles = { x: n.profiles?.x ?? n.x ?? null, linkedin: n.profiles?.linkedin ?? n.linkedin ?? null };
    const evidence = Array.isArray(n.evidence) ? n.evidence.map((u) => sourceIdForUrl(u)) : [];
    return {
      id,
      type,
      handle,
      name: n.name ?? n.label ?? void 0,
      profiles,
      avatarUrl: n.avatarUrl,
      summary: n.summary,
      notes: n.notes ?? n.note,
      primary_topic: n.primary_topic,
      topics: Array.isArray(n.topics) ? n.topics : [],
      projects: Array.isArray(n.projects) ? n.projects.map((p, i) => ({ id: String(p.id ?? `${id}-project-${i}`), name: String(p.name ?? "Untitled project"), description: p.description, url: p.url, source_ids: p.source_ids ?? [] })) : [],
      inclusion_source_ids: [...n.inclusion_source_ids ?? [], ...evidence],
      claims: Array.isArray(n.claims) ? n.claims : [],
      confidence: n.confidence ?? null,
      confidence_note: n.confidence_note ?? null,
      added_at: n.added_at
    };
  }).filter((n) => n.id);
  let edgeN = 0;
  const edges = (Array.isArray(raw.edges) ? raw.edges : []).filter(Boolean).map((e) => {
    const evidenceUrls = Array.isArray(e.evidence) ? e.evidence : typeof e.evidence === "string" ? [e.evidence] : [];
    const source = String(e.source ?? e.from ?? "").replace(/^@/, "");
    const target = String(e.target ?? e.to ?? "").replace(/^@/, "");
    return {
      id: String(e.id ?? `edge-${++edgeN}-${source}-${target}`),
      source,
      target,
      kind: String(e.kind ?? e.type ?? "engagement"),
      label: e.label,
      detail: e.detail ?? null,
      period: e.period ?? null,
      project_id: e.project_id,
      topic_ids: e.topic_ids,
      source_ids: [...e.source_ids ?? [], ...evidenceUrls.map(sourceIdForUrl)],
      confidence: e.confidence ?? null,
      note: e.note ?? null
    };
  });
  return {
    meta: {
      name: raw.meta?.name ?? "Untitled map",
      version: raw.meta?.version ?? 1,
      updated: raw.meta?.updated ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
      ...raw.meta
    },
    topics: Array.isArray(raw.topics) ? raw.topics : [],
    sources,
    nodes,
    edges
  };
}
function mergeGraph(base, add) {
  const byId = (a, b = []) => {
    const m = new Map(a.map((x) => [x.id, x]));
    b.forEach((x) => m.set(x.id, x));
    return Array.from(m.values());
  };
  return {
    meta: { ...base.meta, ...add.meta ?? {}, updated: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) },
    topics: byId(base.topics, add.topics),
    sources: byId(base.sources, add.sources),
    nodes: byId(base.nodes, add.nodes),
    edges: byId(base.edges, add.edges)
  };
}
function profileProblem(n) {
  if (n.type === "agent" || n.type === "organization") {
    return n.profiles?.x ? null : `${n.type === "agent" ? "Agents" : "Organizations"} need a public X profile`;
  }
  return n.profiles?.x || n.profiles?.linkedin ? null : "People need a public X or LinkedIn profile";
}
function analyze(g) {
  const issues = [];
  const nodeById = /* @__PURE__ */ new Map();
  for (const n of g.nodes) {
    if (nodeById.has(n.id)) issues.push({ level: "warning", code: "dup-node", message: `Duplicate node id "${n.id}"; the later record wins.`, ids: [n.id] });
    nodeById.set(n.id, n);
  }
  const sourceById = new Map(g.sources.map((s) => [s.id, s]));
  const topicLabel = new Map(g.topics.map((t) => [t.id, t.label]));
  const ineligible = /* @__PURE__ */ new Map();
  for (const n of nodeById.values()) {
    const p = profileProblem(n);
    if (p) {
      ineligible.set(n.id, p);
      issues.push({ level: "error", code: "profile", message: `${n.name ?? n.id}: ${p}. Not drawn.`, ids: [n.id] });
    }
    const missing = [...n.inclusion_source_ids, ...n.claims.flatMap((c) => c.source_ids), ...n.projects.flatMap((p2) => p2.source_ids)].filter((s) => !sourceById.has(s));
    if (missing.length) issues.push({ level: "warning", code: "missing-source", message: `${n.name ?? n.id} cites unknown source ${missing.join(", ")}.`, ids: [n.id] });
    if (!n.inclusion_source_ids.length) issues.push({ level: "warning", code: "no-inclusion", message: `${n.name ?? n.id} has no inclusion evidence.`, ids: [n.id] });
    n.topics.filter((t) => !topicLabel.has(t)).forEach((t) => issues.push({ level: "info", code: "unknown-topic", message: `${n.name ?? n.id} uses topic "${t}", which is not in the topic list.`, ids: [n.id] }));
  }
  const drawnEdges = [];
  const seenEdgeIds = /* @__PURE__ */ new Set();
  for (const e of g.edges) {
    if (seenEdgeIds.has(e.id)) issues.push({ level: "warning", code: "dup-edge", message: `Duplicate edge id "${e.id}".`, ids: [e.id] });
    seenEdgeIds.add(e.id);
    if (!EDGE_KINDS.includes(e.kind)) {
      issues.push({ level: "error", code: "kind", message: `Edge ${e.id} has unknown kind "${e.kind}". Not drawn.`, ids: [e.id] });
      continue;
    }
    if (e.source === e.target) {
      issues.push({ level: "warning", code: "self", message: `Edge ${e.id} links ${e.source} to itself. Not drawn.`, ids: [e.id] });
      continue;
    }
    const missingEnd = [e.source, e.target].filter((id) => !nodeById.has(id));
    if (missingEnd.length) {
      issues.push({ level: "error", code: "dangling", message: `Edge ${e.id} points to missing account ${missingEnd.map((m) => `"${m}"`).join(" and ")}. Not drawn.`, ids: [e.id] });
      continue;
    }
    if (ineligible.has(e.source) || ineligible.has(e.target)) continue;
    const badSrc = e.source_ids.filter((s) => !sourceById.has(s));
    if (badSrc.length) issues.push({ level: "warning", code: "missing-source", message: `Edge ${e.id} cites unknown source ${badSrc.join(", ")}.`, ids: [e.id] });
    if (e.kind !== "shared_topic" && e.kind !== "cluster" && e.source_ids.length === 0) issues.push({ level: "warning", code: "no-evidence", message: `Edge ${e.id} (${e.kind}) has no evidence.`, ids: [e.id] });
    drawnEdges.push(e);
  }
  const clusterCount = drawnEdges.filter((e) => e.kind === "cluster").length;
  if (clusterCount) issues.push({ level: "info", code: "cluster", message: `${clusterCount} legacy "cluster" edge${clusterCount > 1 ? "s are" : " is"} drawn as-is; their meaning is not defined yet.`, ids: [] });
  const degree = /* @__PURE__ */ new Map();
  const edgesByNode = /* @__PURE__ */ new Map();
  for (const e of drawnEdges) {
    for (const id of [e.source, e.target]) {
      degree.set(id, (degree.get(id) ?? 0) + 1);
      if (!edgesByNode.has(id)) edgesByNode.set(id, []);
      edgesByNode.get(id).push(e);
    }
  }
  const mapNodeIds = Array.from(nodeById.keys()).filter((id) => (degree.get(id) ?? 0) > 0);
  const offMap = [];
  for (const n of nodeById.values()) {
    if (degree.get(n.id)) continue;
    offMap.push({ id: n.id, reason: ineligible.get(n.id) ?? "No connections to other accounts on the map" });
  }
  const isolatedOnly = offMap.filter((o) => !ineligible.has(o.id));
  if (isolatedOnly.length) issues.push({ level: "info", code: "isolated", message: `${isolatedOnly.length} account${isolatedOnly.length > 1 ? "s have" : " has"} no connections. Kept in the data, not drawn on the map.`, ids: isolatedOnly.map((o) => o.id) });
  return { nodeById, sourceById, topicLabel, drawnEdges, mapNodeIds, offMap, degree, edgesByNode, issues };
}

// src/scene.ts
import * as THREE3 from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

// src/badges.ts
import * as THREE from "three";

// src/theme.ts
var BG = 16514041;
var NODE_STYLE = {
  person: { color: 2450411, css: "#2563EB", label: "Person", shape: "Circle" },
  organization: { color: 5972406, css: "#5B21B6", label: "Organization", shape: "Rounded square" },
  agent: { color: 14243853, css: "#D9580D", label: "Agent", shape: "Diamond" }
};
var EDGE_STYLE = {
  affiliation: { color: 4937059, css: "#4B5563", width: 1.3, dashed: false, dash: 0, gap: 0, label: "Affiliation", means: "Works at, founded or advises \u2014 sourced." },
  built: { color: 11817737, css: "#B45309", width: 1.6, dashed: false, dash: 0, gap: 0, label: "Built / operates", means: "Made or runs this agent or project \u2014 sourced." },
  collaboration: { color: 1409085, css: "#15803D", width: 2, dashed: false, dash: 0, gap: 0, label: "Collaboration", means: "Sourced joint work, such as a co-built project or paper." },
  engagement: { color: 947344, css: "#0E7490", width: 1.1, dashed: true, dash: 1.2, gap: 0.8, label: "Engagement", means: "A reply or quote on X that led the research to this account. It records a discovery path, not collaboration." },
  shared_topic: { color: 12458077, css: "#BE185D", width: 1.2, dashed: true, dash: 0.35, gap: 0.8, label: "Shared topic", means: "Both work in the same area. No direct relationship is claimed." },
  cluster: { color: 10265519, css: "#9CA3AF", width: 1, dashed: false, dash: 0, gap: 0, label: "Cluster (legacy)", means: "Kept from older data. What it means is not defined yet." }
};
var SELECT_COLOR = 16436245;
var INK = 1447965;

// src/badges.ts
var S = 128;
function initials(n) {
  const name = (n.name ?? n.handle ?? n.id).replace(/^@/, "");
  const parts = name.split(/[\s\-_.]+/).filter(Boolean);
  const chars = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return chars.toUpperCase();
}
function shapePath(ctx, type, inset) {
  ctx.beginPath();
  if (type === "person") {
    ctx.arc(S / 2, S / 2, S / 2 - inset, 0, Math.PI * 2);
  } else if (type === "organization") {
    const r = 22 - inset / 2, x = inset + 6, w = S - 2 * (inset + 6);
    ctx.moveTo(x + r, x);
    ctx.arcTo(x + w, x, x + w, x + w, r);
    ctx.arcTo(x + w, x + w, x, x + w, r);
    ctx.arcTo(x, x + w, x, x, r);
    ctx.arcTo(x, x, x + w, x, r);
  } else {
    ctx.moveTo(S / 2, inset);
    ctx.lineTo(S - inset, S / 2);
    ctx.lineTo(S / 2, S - inset);
    ctx.lineTo(inset, S / 2);
  }
  ctx.closePath();
}
function draw(ctx, n, img) {
  const style = NODE_STYLE[n.type];
  ctx.clearRect(0, 0, S, S);
  shapePath(ctx, n.type, 1);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  shapePath(ctx, n.type, 8);
  ctx.fillStyle = style.css;
  ctx.fill();
  if (img) {
    ctx.save();
    shapePath(ctx, n.type, 14);
    ctx.clip();
    const scale = Math.max(S / img.width, S / img.height);
    ctx.drawImage(img, (S - img.width * scale) / 2, (S - img.height * scale) / 2, img.width * scale, img.height * scale);
    ctx.restore();
    return;
  }
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${n.type === "agent" ? 36 : 46}px "IBM Plex Sans", system-ui, sans-serif`;
  ctx.fillText(initials(n), S / 2, S / 2 + 2);
}
function makeBadge(n) {
  const canvas = document.createElement("canvas");
  canvas.width = S * 2;
  canvas.height = S * 2;
  const ctx = canvas.getContext("2d");
  ctx.scale(2, 2);
  draw(ctx, n, null);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (n.avatarUrl) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      draw(ctx, n, img);
      tex.needsUpdate = true;
    };
    img.src = n.avatarUrl;
  }
  document.fonts?.ready?.then(() => {
    if (!n.avatarUrl) {
      draw(ctx, n, null);
      tex.needsUpdate = true;
    }
  });
  return tex;
}
var badgeKey = (n) => `${n.type}|${n.name ?? ""}|${n.handle ?? ""}|${n.avatarUrl ?? ""}`;

// src/camera.ts
import * as THREE2 from "three";
var CameraRig = class {
  constructor(camera) {
    this.target = new THREE2.Vector3();
    /** Centre of the whole map; zooming out drifts back toward it. */
    this.home = new THREE2.Vector3();
    this.dist = 120;
    this.yaw = 0.7;
    this.pitch = 0.32;
    this.cTarget = new THREE2.Vector3();
    this.cDist = 120;
    this.cYaw = 0.7;
    this.cPitch = 0.32;
    this.minDist = 0.35;
    this.maxDist = 600;
    this.reducedMotion = false;
    /** Set when the user has moved the camera themselves. */
    this.userMoved = false;
    this.camera = camera;
  }
  offset(dist, yaw, pitch) {
    return new THREE2.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)).multiplyScalar(dist);
  }
  /** Position the desired state would put the camera at. */
  desiredPosition() {
    return this.target.clone().add(this.offset(this.dist, this.yaw, this.pitch));
  }
  forward() {
    return this.offset(1, this.cYaw, this.cPitch).negate();
  }
  update(dt) {
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
    this.cTarget.lerp(this.target, k);
    this.cDist = Math.exp(Math.log(this.cDist) + (Math.log(this.dist) - Math.log(this.cDist)) * k);
    let dy = this.yaw - this.cYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.cYaw += dy * k;
    this.cPitch += (this.pitch - this.cPitch) * k;
    this.camera.position.copy(this.cTarget).add(this.offset(this.cDist, this.cYaw, this.cPitch));
    this.camera.lookAt(this.cTarget);
    const moving = this.cTarget.distanceToSquared(this.target) > 1e-6 || Math.abs(this.cDist - this.dist) > 1e-4 * this.dist || Math.abs(dy) > 1e-5 || Math.abs(this.pitch - this.cPitch) > 1e-5;
    return moving;
  }
  get currentDist() {
    return this.cDist;
  }
  get currentTarget() {
    return this.cTarget;
  }
  get currentYaw() {
    return this.cYaw;
  }
  clampDist(d) {
    return Math.min(this.maxDist, Math.max(this.minDist, d));
  }
  orbit(dx, dy) {
    this.yaw -= dx * 5e-3;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + dy * 5e-3));
    this.userMoved = true;
  }
  pan(dx, dy, viewportH) {
    const scale = this.dist * 2 * Math.tan(this.camera.fov * Math.PI / 360) / viewportH;
    const fwd = this.offset(1, this.yaw, this.pitch).negate();
    const right = new THREE2.Vector3().crossVectors(fwd, new THREE2.Vector3(0, 1, 0)).normalize();
    const up = new THREE2.Vector3().crossVectors(right, fwd).normalize();
    this.target.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
    this.userMoved = true;
  }
  /** factor < 1 zooms in. ndc is the cursor position in normalized device coords. */
  zoomAt(factor, ndcX = 0, ndcY = 0) {
    if (factor < 1 && this.dist * factor < this.minDist) {
      const cam2 = this.camera.clone();
      cam2.position.copy(this.desiredPosition());
      cam2.lookAt(this.target);
      cam2.updateMatrixWorld();
      const dir2 = new THREE2.Vector3(ndcX, ndcY, 0.5).unproject(cam2).sub(cam2.position).normalize();
      this.target.addScaledVector(dir2, Math.max(0.6, this.minDist * 6) * (1 - factor) * 4);
      this.dist = this.minDist;
      this.userMoved = true;
      return;
    }
    const newDist = this.clampDist(this.dist * factor);
    const f = newDist / this.dist;
    if (Math.abs(1 - f) < 1e-6) return;
    const cam = this.camera.clone();
    cam.position.copy(this.desiredPosition());
    cam.lookAt(this.target);
    cam.updateMatrixWorld();
    const dir = new THREE2.Vector3(ndcX, ndcY, 0.5).unproject(cam).sub(cam.position).normalize();
    if (f < 1) {
      const p = cam.position.clone().addScaledVector(dir, this.dist);
      this.target.add(p.sub(this.target).multiplyScalar(1 - f));
    } else {
      const span = this.maxDist - this.dist;
      const k = span > 1e-6 ? Math.min(1, (newDist - this.dist) / span) : 1;
      this.target.lerp(this.home, k);
    }
    this.dist = newDist;
    this.userMoved = true;
  }
  setDist(d) {
    this.dist = this.clampDist(d);
    this.userMoved = true;
  }
  /** Driving: forward/back along the view, turn left/right, rise/sink. Units per second. */
  drive(forward, turn, rise, dt) {
    if (!forward && !turn && !rise) return;
    const speed = Math.max(this.dist, 3) * 0.9 * dt;
    const fwd = this.offset(1, this.yaw, this.pitch).negate();
    this.target.addScaledVector(fwd, forward * speed);
    this.target.y += rise * speed;
    this.yaw -= turn * 1.4 * dt;
    this.userMoved = true;
  }
  flyTo(point, dist) {
    this.target.set(point.x, point.y, point.z);
    if (dist !== void 0) this.dist = this.clampDist(dist);
  }
  overview(center, radius, instant = false) {
    this.home.set(center.x, center.y, center.z);
    this.target.set(center.x, center.y, center.z);
    this.dist = this.clampDist(radius * 2.2);
    this.pitch = 0.32;
    if (instant) this.snap();
  }
  snap() {
    this.cTarget.copy(this.target);
    this.cDist = this.dist;
    this.cYaw = this.yaw;
    this.cPitch = this.pitch;
  }
};

// src/layout.ts
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function hashPoint(id, r) {
  const h1 = hash(id), h2 = hash(id + "#"), h3 = hash(id + "*");
  const u = h1 / 4294967296 * 2 - 1;
  const t = h2 / 4294967296 * Math.PI * 2;
  const rr = r * Math.cbrt(h3 / 4294967296);
  const s = Math.sqrt(1 - u * u);
  return { x: rr * s * Math.cos(t), y: rr * u, z: rr * s * Math.sin(t) };
}
var ForceLayout = class {
  constructor() {
    this.bodies = /* @__PURE__ */ new Map();
    this.ids = [];
    this.pairs = [];
    // a, b, rest length
    this.alpha = 1;
    this.baseLength = 7;
  }
  setGraph(nodeIds, pairList) {
    const degree = /* @__PURE__ */ new Map();
    const neighbors = /* @__PURE__ */ new Map();
    for (const [a, b] of pairList) {
      degree.set(a, (degree.get(a) ?? 0) + 1);
      degree.set(b, (degree.get(b) ?? 0) + 1);
      (neighbors.get(a) ?? neighbors.set(a, []).get(a)).push(b);
      (neighbors.get(b) ?? neighbors.set(b, []).get(b)).push(a);
    }
    const hadBodies = this.bodies.size > 0;
    const keep = new Set(nodeIds);
    for (const id of Array.from(this.bodies.keys())) if (!keep.has(id)) this.bodies.delete(id);
    const pending = nodeIds.filter((id) => !this.bodies.has(id));
    const spread = Math.max(20, Math.cbrt(nodeIds.length) * 9);
    for (let pass = 0; pass < 4 && pending.length; pass++) {
      for (let i = pending.length - 1; i >= 0; i--) {
        const id = pending[i];
        const placed = (neighbors.get(id) ?? []).map((n) => this.bodies.get(n)).filter(Boolean);
        if (!placed.length && hadBodies && pass < 3) continue;
        let p;
        if (placed.length) {
          const c = placed.reduce((acc, b) => ({ x: acc.x + b.x / placed.length, y: acc.y + b.y / placed.length, z: acc.z + b.z / placed.length }), { x: 0, y: 0, z: 0 });
          const j = hashPoint(id, 3);
          p = { x: c.x + j.x, y: c.y + j.y, z: c.z + j.z };
        } else {
          p = hashPoint(id, spread);
        }
        this.bodies.set(id, { ...p, vx: 0, vy: 0, vz: 0, deg: 0 });
        pending.splice(i, 1);
      }
    }
    this.ids = nodeIds.slice();
    const index = new Map(this.ids.map((id, i) => [id, i]));
    this.ids.forEach((id) => {
      this.bodies.get(id).deg = degree.get(id) ?? 0;
    });
    this.pairs = pairList.filter(([a, b]) => index.has(a) && index.has(b)).map(([a, b]) => {
      const da = degree.get(a) ?? 1, db = degree.get(b) ?? 1;
      const leaf = Math.min(da, db) === 1;
      const len = leaf ? this.baseLength * 0.32 : this.baseLength * (0.8 + 0.12 * Math.log2(da + db));
      return [index.get(a), index.get(b), len];
    });
    this.alpha = hadBodies ? Math.max(this.alpha, 0.25) : 1;
  }
  get settled() {
    return this.alpha < 4e-3;
  }
  tick(steps = 1) {
    const list = this.ids.map((id) => this.bodies.get(id));
    const n = list.length;
    for (let s = 0; s < steps && !this.settled; s++) {
      const a = this.alpha;
      for (let i = 0; i < n; i++) {
        const bi = list[i];
        const qi = bi.deg <= 1 ? 0.18 : 1 + Math.log2(bi.deg) * 0.35;
        for (let j = i + 1; j < n; j++) {
          const bj = list[j];
          const qj = bj.deg <= 1 ? 0.18 : 1 + Math.log2(bj.deg) * 0.35;
          let dx = bi.x - bj.x, dy = bi.y - bj.y, dz = bi.z - bj.z;
          let d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < 0.01) {
            dx = (Math.random() - 0.5) * 0.1;
            dy = 0.05;
            dz = 0;
            d2 = 0.01;
          }
          if (d2 > 6400) continue;
          const f = 14 * qi * qj * a / d2;
          const d = Math.sqrt(d2);
          const fx = dx / d * f, fy = dy / d * f, fz = dz / d * f;
          bi.vx += fx;
          bi.vy += fy;
          bi.vz += fz;
          bj.vx -= fx;
          bj.vy -= fy;
          bj.vz -= fz;
        }
      }
      for (const [ia, ib, len] of this.pairs) {
        const A2 = list[ia], B = list[ib];
        const dx = B.x - A2.x, dy = B.y - A2.y, dz = B.z - A2.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-3;
        const k = 0.2 * a * (d - len) / d;
        const wa = B.deg / (A2.deg + B.deg), wb = A2.deg / (A2.deg + B.deg);
        A2.vx += dx * k * wa;
        A2.vy += dy * k * wa;
        A2.vz += dz * k * wa;
        B.vx -= dx * k * wb;
        B.vy -= dy * k * wb;
        B.vz -= dz * k * wb;
      }
      for (const b of list) {
        b.vx -= b.x * 4e-3 * a;
        b.vy -= b.y * 4e-3 * a;
        b.vz -= b.z * 4e-3 * a;
        b.vx *= 0.55;
        b.vy *= 0.55;
        b.vz *= 0.55;
        const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
        if (sp > 3) {
          b.vx *= 3 / sp;
          b.vy *= 3 / sp;
          b.vz *= 3 / sp;
        }
        b.x += b.vx;
        b.y += b.vy;
        b.z += b.vz;
      }
      this.alpha *= 0.985;
    }
  }
  /** Radius containing ~95% of nodes, measured from the centroid. */
  extent() {
    const list = this.ids.map((id) => this.bodies.get(id));
    if (!list.length) return { center: { x: 0, y: 0, z: 0 }, radius: 10 };
    const c = { x: 0, y: 0, z: 0 };
    list.forEach((b) => {
      c.x += b.x / list.length;
      c.y += b.y / list.length;
      c.z += b.z / list.length;
    });
    const ds = list.map((b) => Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z)).sort((p, q2) => p - q2);
    return { center: c, radius: Math.max(8, ds[Math.floor(ds.length * 0.95)] ?? 10) };
  }
  get(id) {
    return this.bodies.get(id);
  }
};

// src/scene.ts
var SEGS_CURVED = 8;
var tmpColor = new THREE3.Color();
var bgColor = new THREE3.Color(BG);
var vertGlow = `
attribute float size; attribute vec3 color; attribute float alpha;
uniform float uScale; uniform float uDensity;
varying vec3 vColor; varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(-mv.z, 0.1);
  gl_PointSize = min(size * uScale / d, 420.0);
  float f = exp(-pow(uDensity * d, 2.0));
  vColor = color; vAlpha = alpha * f;
  gl_Position = projectionMatrix * mv;
}`;
var fragGlow = `
varying vec3 vColor; varying float vAlpha;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, r); a = a * a;
  gl_FragColor = vec4(vColor, a * vAlpha);
}`;
var vertSnow = `
uniform vec3 uCam; uniform float uBox; uniform float uScale; uniform float uAlpha;
varying float vA;
void main() {
  vec3 p = uCam + (mod(position - uCam, uBox) - 0.5 * uBox);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = max(-mv.z, 0.1);
  gl_PointSize = max(1.0, 0.09 * uScale / d);
  vA = uAlpha * smoothstep(0.5 * uBox, 0.12 * uBox, d) * smoothstep(0.4, 2.0, d);
  gl_Position = projectionMatrix * mv;
}`;
var fragSnow = `
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.2, r) * vA * 0.45;
  gl_FragColor = vec4(vec3(0.45, 0.52, 0.62), a);
}`;
var MapScene = class {
  constructor(_container, canvas, labelLayer, tooltip, cb) {
    this.canvas = canvas;
    this.labelLayer = labelLayer;
    this.tooltip = tooltip;
    this.cb = cb;
    this.layout = new ForceLayout();
    this.raycaster = new THREE3.Raycaster();
    this.sprites = /* @__PURE__ */ new Map();
    this.nodeGroup = new THREE3.Group();
    this.glowAttr = null;
    this.edgeGroups = /* @__PURE__ */ new Map();
    this.highlight = null;
    this.rings = [];
    this.labelPool = [];
    this.analysis = null;
    this.ids = [];
    this.index = /* @__PURE__ */ new Map();
    this.nodeType = [];
    this.deg = [];
    this.visCur = new Float32Array(0);
    /** Drawn badge radius per account, so lines can stop at the badge edge. */
    this.dispR = new Float32Array(0);
    this.hubRank = /* @__PURE__ */ new Map();
    this.maxDeg = 1;
    this.pairInfo = /* @__PURE__ */ new Map();
    this.edgeStrength = /* @__PURE__ */ new Map();
    this.extentR = 40;
    this.extentC = { x: 0, y: 0, z: 0 };
    this.view = { selectedNode: null, selectedEdge: null, focus: /* @__PURE__ */ new Set(), matches: /* @__PURE__ */ new Set(), nodeMatch: () => true, edgeMatch: () => true, filtersActive: false, hideFiltered: false };
    /** Names on the map: off by default; selection, neighbours, hover and search matches are always named. */
    this.showNames = false;
    this.hoverNode = null;
    this.hoverEdge = null;
    this.dirty = true;
    this.pickAt = null;
    this.keys = /* @__PURE__ */ new Set();
    this.lastT = performance.now();
    this.frameN = 0;
    this.width = 1;
    this.height = 1;
    this.renderer = new THREE3.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(BG, 1);
    this.scene = new THREE3.Scene();
    this.scene.fog = new THREE3.FogExp2(BG, 0.01);
    this.camera = new THREE3.PerspectiveCamera(55, 1, 0.05, 5e3);
    this.rig = new CameraRig(this.camera);
    this.rig.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.raycaster.params.Line2 = { threshold: 7 };
    this.raycaster.camera = this.camera;
    this.scene.add(new THREE3.AmbientLight(16777215, 1.15));
    const key = new THREE3.DirectionalLight(16777215, 0.9);
    key.position.set(0.4, 0.8, 1);
    this.camera.add(key);
    this.scene.add(this.camera);
    this.scene.add(this.nodeGroup);
    const gm = new THREE3.ShaderMaterial({ vertexShader: vertGlow, fragmentShader: fragGlow, uniforms: { uScale: { value: 1 }, uDensity: { value: 0.01 } }, transparent: true, depthWrite: false });
    this.glow = new THREE3.Points(new THREE3.BufferGeometry(), gm);
    this.glow.frustumCulled = false;
    this.scene.add(this.glow);
    const sn = 1400;
    const sp = new Float32Array(sn * 3);
    let s = 12345;
    const r = () => (s = s * 16807 % 2147483647) / 2147483647;
    for (let i = 0; i < sp.length; i++) sp[i] = r() * 40;
    const sg = new THREE3.BufferGeometry();
    sg.setAttribute("position", new THREE3.BufferAttribute(sp, 3));
    this.snow = new THREE3.Points(sg, new THREE3.ShaderMaterial({ vertexShader: vertSnow, fragmentShader: fragSnow, uniforms: { uCam: { value: new THREE3.Vector3() }, uBox: { value: 40 }, uScale: { value: 1 }, uAlpha: { value: 0 } }, transparent: true, depthWrite: false }));
    this.snow.frustumCulled = false;
    this.scene.add(this.snow);
    for (let i = 0; i < 2; i++) {
      const ring = new THREE3.Mesh(new THREE3.RingGeometry(1, 1.09, 64), new THREE3.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.95, depthTest: false, side: THREE3.DoubleSide }));
      ring.renderOrder = 10;
      ring.visible = false;
      this.rings.push(ring);
      this.scene.add(ring);
    }
    this.bindInput();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    requestAnimationFrame((t) => this.loop(t));
  }
  // ---------- data ----------
  setData(analysis) {
    this.analysis = analysis;
    const ids = analysis.mapNodeIds;
    this.ids = ids;
    this.index = new Map(ids.map((id, i) => [id, i]));
    this.nodeType = ids.map((id) => analysis.nodeById.get(id).type);
    this.deg = ids.map((id) => analysis.degree.get(id) ?? 0);
    this.maxDeg = Math.max(2, ...this.deg);
    const ranked = ids.slice().sort((a, b) => (analysis.degree.get(b) ?? 0) - (analysis.degree.get(a) ?? 0));
    this.hubRank = new Map(ranked.map((id, i) => [id, i]));
    const oldVis = /* @__PURE__ */ new Map();
    this.index.forEach((i, id) => oldVis.set(id, 0));
    const prev = this.visCur;
    const prevIds = this._prevIds;
    prevIds?.forEach((id, i) => oldVis.set(id, prev[i] ?? 0));
    this.visCur = new Float32Array(ids.map((id) => oldVis.get(id) ?? 0));
    this.dispR = new Float32Array(ids.length);
    this._prevIds = ids;
    const pairs = /* @__PURE__ */ new Map();
    const groups = /* @__PURE__ */ new Map();
    for (const e of analysis.drawnEdges) {
      const key = e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`;
      pairs.set(key, [e.source, e.target]);
      (groups.get(key) ?? groups.set(key, []).get(key)).push(e);
    }
    this.pairInfo.clear();
    groups.forEach((list) => list.forEach((e, k) => this.pairInfo.set(e.id, { k, n: list.length })));
    const firstLoad = this.layout.bodies.size === 0;
    this.layout.setGraph(ids, Array.from(pairs.values()));
    if (firstLoad) {
      for (let i = 0; i < 1500 && !this.layout.settled; i++) this.layout.tick(1);
      this.updateExtent();
      this.rig.overview(this.extentC, this.extentR, true);
    }
    const keep = new Set(ids);
    this.sprites.forEach((sp, id) => {
      const n2 = analysis.nodeById.get(id);
      if (!keep.has(id) || !n2 || sp.userData.key !== badgeKey(n2)) {
        this.nodeGroup.remove(sp);
        sp.material.map?.dispose();
        sp.material.dispose();
        this.sprites.delete(id);
      }
    });
    for (const id of ids) {
      if (this.sprites.has(id)) continue;
      const n2 = analysis.nodeById.get(id);
      const sp = new THREE3.Sprite(new THREE3.SpriteMaterial({ map: makeBadge(n2), transparent: true, alphaTest: 0.02, depthTest: false, depthWrite: false }));
      sp.userData = { id, key: badgeKey(n2) };
      this.sprites.set(id, sp);
      this.nodeGroup.add(sp);
    }
    const n = ids.length;
    this.glowAttr = { pos: new Float32Array(n * 3), col: new Float32Array(n * 3), size: new Float32Array(n), alpha: new Float32Array(n) };
    const g = new THREE3.BufferGeometry();
    g.setAttribute("position", new THREE3.BufferAttribute(this.glowAttr.pos, 3));
    g.setAttribute("color", new THREE3.BufferAttribute(this.glowAttr.col, 3));
    g.setAttribute("size", new THREE3.BufferAttribute(this.glowAttr.size, 1));
    g.setAttribute("alpha", new THREE3.BufferAttribute(this.glowAttr.alpha, 1));
    this.glow.geometry.dispose();
    this.glow.geometry = g;
    this.edgeGroups.forEach((grp) => {
      this.scene.remove(grp.line);
      grp.line.geometry.dispose();
      grp.line.material.dispose();
    });
    this.edgeGroups.clear();
    for (const kind of EDGE_KINDS) {
      const edges = analysis.drawnEdges.filter((e) => e.kind === kind);
      if (!edges.length) continue;
      const segs = edges.map((e) => (this.pairInfo.get(e.id)?.n ?? 1) > 1 ? SEGS_CURVED : 1);
      const total = segs.reduce((a, b) => a + b, 0);
      const geom = new LineSegmentsGeometry();
      geom.setPositions(new Float32Array(total * 6));
      geom.setColors(new Float32Array(total * 6));
      const st2 = EDGE_STYLE[kind];
      const mat = new LineMaterial({ color: 16777215, linewidth: st2.width, vertexColors: true, dashed: st2.dashed, dashSize: st2.dash, gapSize: st2.gap, dashScale: 1, worldUnits: false });
      mat.resolution.set(this.width, this.height);
      const line = new LineSegments2(geom, mat);
      line.frustumCulled = false;
      line.renderOrder = 1;
      this.scene.add(line);
      const segToEdge = new Int32Array(total);
      let o = 0;
      segs.forEach((c, i) => {
        for (let j = 0; j < c; j++) segToEdge[o++] = i;
      });
      this.edgeGroups.set(kind, { line, edges, segs, total, pos: geom.attributes.instanceStart.data.array, col: geom.attributes.instanceColorStart.data.array, segToEdge });
    }
    this.dirty = true;
  }
  setView(v) {
    this.view = v;
    this.dirty = true;
  }
  // ---------- camera helpers ----------
  extent() {
    return { center: this.extentC, radius: this.extentR };
  }
  overview(instant = false) {
    this.rig.overview(this.extentC, this.extentR, instant || this.rig.reducedMotion);
    this.rig.userMoved = false;
    this.dirty = true;
  }
  focusNode(id) {
    const p = this.layout.get(id);
    if (!p || !this.analysis) return;
    let far = 4;
    for (const e of this.analysis.edgesByNode.get(id) ?? []) {
      const o = this.layout.get(e.source === id ? e.target : e.source);
      if (o) far = Math.max(far, Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z));
    }
    this.rig.flyTo(p, Math.min(Math.max(far * 2.4, 14), this.extentR * 1.6));
    this.rig.userMoved = true;
    this.dirty = true;
  }
  focusEdge(e) {
    const a = this.layout.get(e.source), b = this.layout.get(e.target);
    if (!a || !b) return;
    const len = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    this.rig.flyTo({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }, Math.max(len * 2.3, 18));
    this.rig.userMoved = true;
    this.dirty = true;
  }
  setShowNames(on) {
    this.showNames = on;
    this.dirty = true;
  }
  zoomBy(f) {
    this.rig.zoomAt(f);
    this.dirty = true;
  }
  /** 0 = wide view, 1 = deepest. */
  get depth() {
    const lo = Math.log(this.rig.minDist), hi = Math.log(this.rig.maxDist);
    return 1 - (Math.log(this.rig.currentDist) - lo) / (hi - lo);
  }
  /** Depth value of the default wide view, used to name depth levels. */
  get overviewDepth() {
    const lo = Math.log(this.rig.minDist), hi = Math.log(this.rig.maxDist);
    return 1 - (Math.log(this.extentR * 2.2) - lo) / (hi - lo);
  }
  setDepth(t) {
    const lo = Math.log(this.rig.minDist), hi = Math.log(this.rig.maxDist);
    this.rig.setDist(Math.exp(hi - t * (hi - lo)));
    this.dirty = true;
  }
  position(id) {
    return this.layout.get(id);
  }
  get cameraInfo() {
    return { pos: this.camera.position, target: this.rig.currentTarget, yaw: this.rig.currentYaw };
  }
  nodeIds() {
    return this.ids;
  }
  typeOf(id) {
    const i = this.index.get(id);
    return i === void 0 ? void 0 : this.nodeType[i];
  }
  visibility(id) {
    const i = this.index.get(id);
    return i === void 0 ? 0 : this.visCur[i];
  }
  // ---------- frame ----------
  nodeSize(i) {
    return 0.45 + 0.27 * Math.sqrt(this.deg[i]);
  }
  reveal(i) {
    const t = Math.log(1 + this.deg[i]) / Math.log(1 + this.maxDeg);
    return this.extentR * (0.9 + 2.6 * Math.pow(t, 1.5));
  }
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    try {
      this.frame(now);
    } catch (err) {
      console.error("[map] frame failed", err);
      const el = document.getElementById("toast");
      if (el) {
        el.hidden = false;
        el.textContent = `Map error: ${err?.message ?? err}`;
      }
    }
  }
  frame(now) {
    const dt = Math.min(0.05, (now - this.lastT) / 1e3);
    this.lastT = now;
    this.frameN++;
    const fwd = (this.keys.has("w") || this.keys.has("arrowup") ? 1 : 0) - (this.keys.has("s") || this.keys.has("arrowdown") ? 1 : 0);
    const turn = (this.keys.has("d") || this.keys.has("arrowright") ? 1 : 0) - (this.keys.has("a") || this.keys.has("arrowleft") ? 1 : 0);
    const rise = (this.keys.has("e") || this.keys.has("pageup") ? 1 : 0) - (this.keys.has("q") || this.keys.has("pagedown") ? 1 : 0);
    if (fwd || turn || rise) this.rig.drive(fwd, turn, rise, dt);
    if (this.keys.has("=") || this.keys.has("+")) this.rig.zoomAt(Math.exp(-dt * 1.6));
    if (this.keys.has("-") || this.keys.has("_")) this.rig.zoomAt(Math.exp(dt * 1.6));
    let layoutMoving = false;
    if (!this.layout.settled && this.ids.length) {
      this.layout.tick(2);
      layoutMoving = true;
      if (this.frameN % 10 === 0 || this.layout.settled) this.updateExtent();
      if (!this.rig.userMoved) this.rig.overview(this.extentC, this.extentR);
    }
    const camMoving = this.rig.update(dt);
    if (camMoving || layoutMoving || this.dirty || this.pickAt) {
      this.dirty = false;
      const fading = this.updateNodes(dt);
      this.updateEdges();
      this.updateLabels();
      if (fading) this.dirty = true;
      if (this.pickAt) {
        this.hoverPick(this.pickAt.x, this.pickAt.y);
        this.pickAt = null;
      }
      const fogD = 0.3 / Math.max(this.rig.currentDist + this.extentR, this.extentR * 2.4);
      this.scene.fog.density = fogD;
      this.glow.material.uniforms.uDensity.value = fogD;
      this.snow.material.uniforms.uCam.value.copy(this.camera.position);
      this.snow.material.uniforms.uAlpha.value = Math.min(1, Math.max(0, (this.extentR * 0.9 - this.rig.currentDist) / (this.extentR * 0.5)));
      this.renderer.render(this.scene, this.camera);
      if (this.frameN % 4 === 0 || !camMoving) this.cb.onFrame({ depth: this.depth, moving: camMoving });
    }
  }
  updateExtent() {
    const ex = this.layout.extent();
    this.extentC = ex.center;
    this.extentR = ex.radius;
    this.rig.maxDist = ex.radius * 12;
    this.rig.home.set(ex.center.x, ex.center.y, ex.center.z);
  }
  updateNodes(dt) {
    const v = this.view;
    const cam = this.camera.position;
    const selActive = !!(v.selectedNode || v.selectedEdge);
    const k = this.rig.reducedMotion ? 1 : 1 - Math.exp(-dt * 6);
    const ga = this.glowAttr;
    let fading = false;
    const pxToWorld = 2 * Math.tan(this.camera.fov * Math.PI / 360) / this.height;
    for (let i = 0; i < this.ids.length; i++) {
      const id = this.ids[i];
      const p = this.layout.get(id);
      const t = this.nodeType[i];
      const d = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
      const forced = v.focus.has(id) || v.matches.has(id) || id === this.hoverNode;
      const match = v.nodeMatch(id);
      let target = 1;
      if (v.filtersActive && !match && !forced && v.hideFiltered) target = 0;
      const cur = this.visCur[i] + (target - this.visCur[i]) * k;
      if (Math.abs(target - cur) > 3e-3) fading = true;
      this.visCur[i] = cur;
      const dimSel = selActive && !v.focus.has(id);
      const dimFilter = v.filtersActive && !match;
      const minWorld = d * pxToWorld * (dimFilter ? 2.6 : 3.6);
      const size = Math.max(this.nodeSize(i) * (dimFilter ? 0.6 : 1), minWorld) * cur * (id === v.selectedNode ? 1.3 : 1);
      const sp = this.sprites.get(id);
      sp.position.set(p.x, p.y, p.z);
      sp.scale.setScalar(Math.max(size, 1e-4) * 2.3);
      this.dispR[i] = size * (t === "agent" ? 1.05 : 1.12);
      sp.visible = size > 1e-3;
      const op = dimFilter ? 0.25 : dimSel ? 0.3 : 1;
      sp.material.opacity = op;
      sp.renderOrder = op > 0.9 ? 3 : 2;
      ga.pos[i * 3] = p.x;
      ga.pos[i * 3 + 1] = p.y;
      ga.pos[i * 3 + 2] = p.z;
      const isMatch = v.matches.has(id);
      const isSel = id === v.selectedNode;
      const gc = isMatch || isSel ? tmpColor.set(SELECT_COLOR) : tmpColor.set(NODE_STYLE[t].color);
      ga.col[i * 3] = gc.r;
      ga.col[i * 3 + 1] = gc.g;
      ga.col[i * 3 + 2] = gc.b;
      const glowSize = Math.max(this.nodeSize(i), d * pxToWorld * 3.2);
      ga.size[i] = glowSize * (isSel ? 7 : 6.5);
      let alpha = 0;
      if (dimSel) alpha *= 0.3;
      if (dimFilter) alpha *= v.hideFiltered ? 0 : 0.3;
      if (isMatch) alpha = 0.75;
      if (isSel) alpha = 0.8;
      ga.alpha[i] = alpha;
    }
    const geo = this.glow.geometry;
    ["position", "color", "size", "alpha"].forEach((a) => geo.attributes[a] && (geo.attributes[a].needsUpdate = true));
    const ringIds = v.selectedEdge ? (() => {
      const e = this.findEdge(v.selectedEdge);
      return e ? [e.source, e.target] : [];
    })() : v.selectedNode ? [v.selectedNode] : [];
    this.rings.forEach((ring, j) => {
      const id = ringIds[j];
      const i = id !== void 0 ? this.index.get(id) : void 0;
      if (i === void 0) {
        ring.visible = false;
        return;
      }
      const p = this.layout.get(id);
      ring.visible = true;
      ring.position.set(p.x, p.y, p.z);
      ring.quaternion.copy(this.camera.quaternion);
      ring.scale.setScalar(this.nodeSize(i) * 1.75);
    });
    return fading;
  }
  findEdge(id) {
    return this.analysis?.drawnEdges.find((e) => e.id === id);
  }
  edgeEnds(e, out, kSeg, segs, perp) {
    const a = this.layout.get(e.source), b = this.layout.get(e.target);
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1e-6;
    const ra = this.dispR[this.index.get(e.source)] ?? 0, rb = this.dispR[this.index.get(e.target)] ?? 0;
    let ta = ra / len, tb = 1 - rb / len;
    if (ta >= tb) {
      ta = tb = 0.5;
    }
    if (segs === 1) {
      out[0] = a.x + (b.x - a.x) * ta;
      out[1] = a.y + (b.y - a.y) * ta;
      out[2] = a.z + (b.z - a.z) * ta;
      out[3] = a.x + (b.x - a.x) * tb;
      out[4] = a.y + (b.y - a.y) * tb;
      out[5] = a.z + (b.z - a.z) * tb;
      return;
    }
    const info = this.pairInfo.get(e.id);
    const off = (info.k - (info.n - 1) / 2) * Math.min(len * 0.28, 3.2);
    const sign = e.source < e.target ? 1 : -1;
    const cx = (a.x + b.x) / 2 + perp.x * off * sign, cy = (a.y + b.y) / 2 + perp.y * off * sign, cz = (a.z + b.z) / 2 + perp.z * off * sign;
    const q2 = (t, p0, p1, p2) => (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
    const t0 = ta + (tb - ta) * kSeg / segs, t1 = ta + (tb - ta) * (kSeg + 1) / segs;
    out[0] = q2(t0, a.x, cx, b.x);
    out[1] = q2(t0, a.y, cy, b.y);
    out[2] = q2(t0, a.z, cz, b.z);
    out[3] = q2(t1, a.x, cx, b.x);
    out[4] = q2(t1, a.y, cy, b.y);
    out[5] = q2(t1, a.z, cz, b.z);
  }
  updateEdges() {
    const v = this.view;
    const cam = this.camera.position;
    const fwd = this.rig.forward();
    const density = this.scene.fog.density;
    const selActive = !!(v.selectedNode || v.selectedEdge);
    const ends = [0, 0, 0, 0, 0, 0];
    const perp = new THREE3.Vector3();
    const dir = new THREE3.Vector3();
    this.edgeStrength.clear();
    const dashScale = 160 / Math.max(this.rig.currentDist, 1);
    this.edgeGroups.forEach((grp, kind) => {
      const st2 = EDGE_STYLE[kind];
      tmpColor.set(st2.color);
      const cr = tmpColor.r, cg = tmpColor.g, cb = tmpColor.b;
      let o = 0;
      grp.edges.forEach((e, ei) => {
        const ia = this.index.get(e.source), ib = this.index.get(e.target);
        const base = kind === "engagement" ? 0.42 : kind === "cluster" ? 0.35 : 0.8;
        let s = Math.min(this.visCur[ia], this.visCur[ib]) * base;
        if (v.filtersActive && !v.edgeMatch(e)) s *= v.hideFiltered ? 0 : 0.06;
        if (selActive) {
          const incident = e.id === v.selectedEdge || v.selectedNode && (e.source === v.selectedNode || e.target === v.selectedNode) && !v.selectedEdge;
          s = incident ? 1 : s * 0.12;
        }
        if (e.id === this.hoverEdge) s = Math.max(s, 1);
        this.edgeStrength.set(e.id, s);
        const a = this.layout.get(e.source), b = this.layout.get(e.target);
        dir.set(b.x - a.x, b.y - a.y, b.z - a.z);
        perp.crossVectors(dir, fwd);
        if (perp.lengthSq() < 1e-6) perp.set(0, 1, 0);
        else perp.normalize();
        const n = grp.segs[ei];
        for (let j = 0; j < n; j++, o++) {
          this.edgeEnds(e, ends, j, n, perp);
          let maxF = 0;
          for (let end = 0; end < 2; end++) {
            const px = ends[end * 3] - cam.x, py = ends[end * 3 + 1] - cam.y, pz = ends[end * 3 + 2] - cam.z;
            const dd = Math.sqrt(px * px + py * py + pz * pz);
            const f = s * Math.exp(-Math.pow(density * dd, 2));
            maxF = Math.max(maxF, f);
            grp.col[o * 6 + end * 3] = bgColor.r + (cr - bgColor.r) * f;
            grp.col[o * 6 + end * 3 + 1] = bgColor.g + (cg - bgColor.g) * f;
            grp.col[o * 6 + end * 3 + 2] = bgColor.b + (cb - bgColor.b) * f;
          }
          if (maxF < 0.03) for (let c = 3; c < 6; c++) ends[c] = ends[c - 3];
          for (let c = 0; c < 6; c++) grp.pos[o * 6 + c] = ends[c];
        }
      });
      const geom = grp.line.geometry;
      geom.attributes.instanceStart.data.needsUpdate = true;
      geom.attributes.instanceColorStart.data.needsUpdate = true;
      geom.computeBoundingSphere();
      if (st2.dashed) {
        grp.line.computeLineDistances();
        grp.line.material.dashScale = dashScale;
      }
    });
    if (this.highlight) {
      this.scene.remove(this.highlight);
      this.highlight.geometry.dispose();
      this.highlight = null;
    }
    const sel = v.selectedEdge ? this.findEdge(v.selectedEdge) : null;
    if (sel && this.index.has(sel.source) && this.index.has(sel.target)) {
      const n = (this.pairInfo.get(sel.id)?.n ?? 1) > 1 ? SEGS_CURVED : 1;
      const a = this.layout.get(sel.source), b = this.layout.get(sel.target);
      dir.set(b.x - a.x, b.y - a.y, b.z - a.z);
      perp.crossVectors(dir, fwd);
      if (perp.lengthSq() < 1e-6) perp.set(0, 1, 0);
      else perp.normalize();
      const arr = new Float32Array(n * 6);
      for (let j = 0; j < n; j++) {
        this.edgeEnds(sel, ends, j, n, perp);
        arr.set(ends, j * 6);
      }
      const g = new LineSegmentsGeometry();
      g.setPositions(arr);
      const m = new LineMaterial({ color: SELECT_COLOR, linewidth: 6, transparent: true, opacity: 0.7, depthWrite: false, worldUnits: false });
      m.resolution.set(this.width, this.height);
      this.highlight = new LineSegments2(g, m);
      this.highlight.renderOrder = 0;
      this.scene.add(this.highlight);
    }
  }
  updateLabels() {
    const v = this.view;
    const cam = this.camera.position;
    const W = this.width, H = this.height;
    const proj = new THREE3.Vector3();
    const cands = [];
    for (let i = 0; i < this.ids.length; i++) {
      const id = this.ids[i];
      const vis = this.visCur[i];
      const forced = v.focus.has(id) || v.matches.has(id) || id === this.hoverNode;
      if (!forced && vis < 0.55) continue;
      if (v.filtersActive && !forced && !v.nodeMatch(id)) continue;
      const p = this.layout.get(id);
      const d = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
      const rv = this.reveal(i);
      const hub = (this.hubRank.get(id) ?? 99) < 8;
      if (!forced && !this.showNames) continue;
      if (!forced && !hub && d > rv * 0.75) continue;
      proj.set(p.x, p.y, p.z).project(this.camera);
      if (proj.z > 1 || proj.x < -1.1 || proj.x > 1.1 || proj.y < -1.1 || proj.y > 1.1) continue;
      const x = (proj.x * 0.5 + 0.5) * W, y = (-proj.y * 0.5 + 0.5) * H;
      const rpx = this.nodeSize(i) * H / (2 * Math.tan(this.camera.fov * Math.PI / 360) * Math.max(d, 0.1));
      let pri = this.deg[i] * 40 - d * 3;
      if (id === v.selectedNode || id === this.hoverNode) pri = 1e9;
      else if (v.focus.has(id)) pri = 1e8 - d;
      else if (v.matches.has(id)) pri = 1e7 - d;
      cands.push({ i, x: x + Math.max(rpx * 1.15, 4) + 7, y, pri, close: id === v.selectedNode || id === this.hoverNode });
    }
    cands.sort((a, b) => b.pri - a.pri);
    const placed = [];
    let used = 0;
    for (const c of cands) {
      if (used >= 60) break;
      const node = this.analysis.nodeById.get(this.ids[c.i]);
      const name = node.name ?? node.handle ?? node.id;
      const w = Math.min(230, name.length * 7.8 + 22), h = c.close && node.handle ? 38 : 25;
      const box = { x0: c.x, y0: c.y - h / 2, x1: c.x + w, y1: c.y + h / 2 };
      const hit = placed.some((b) => !(box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1));
      if (hit && c.pri < 1e7) continue;
      placed.push(box);
      const el = this.labelEl(used++);
      const id = this.ids[c.i];
      el.dataset.id = id;
      el.className = `lbl t-${this.nodeType[c.i]}${id === v.selectedNode ? " sel" : v.focus.has(id) ? " focus" : v.matches.has(id) ? " match" : ""}`;
      const handle = c.close && node.handle ? `<span class="h">@${escapeHtml(node.handle)}</span>` : "";
      const html = `<span class="n">${escapeHtml(name)}</span>${handle}`;
      if (el.innerHTML !== html) el.innerHTML = html;
      el.style.transform = `translate(${Math.round(box.x0)}px, ${Math.round(box.y0)}px)`;
      el.style.display = "";
    }
    for (let j = used; j < this.labelPool.length; j++) this.labelPool[j].style.display = "none";
  }
  labelEl(i) {
    while (this.labelPool.length <= i) {
      const b = document.createElement("button");
      b.type = "button";
      b.tabIndex = -1;
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const id = b.dataset.id;
        if (id) this.cb.onPickNode(id);
      });
      this.labelLayer.appendChild(b);
      this.labelPool.push(b);
    }
    return this.labelPool[i];
  }
  // ---------- input ----------
  ndc(x, y) {
    return { x: x / this.width * 2 - 1, y: -(y / this.height) * 2 + 1 };
  }
  pick(x, y) {
    const n = this.ndc(x, y);
    this.raycaster.setFromCamera(n, this.camera);
    const hits = this.raycaster.intersectObjects(Array.from(this.sprites.values()), false);
    for (const h of hits) {
      const id = h.object.userData.id;
      if (id && this.visibility(id) > 0.2) return { node: id };
    }
    let best = null;
    this.edgeGroups.forEach((grp) => {
      const eh = this.raycaster.intersectObject(grp.line, false);
      for (const h of eh) {
        const e = grp.edges[grp.segToEdge[h.faceIndex]];
        if (!e || (this.edgeStrength.get(e.id) ?? 0) < 0.2) continue;
        if (!best || h.distance < best.dist) best = { edge: e.id, dist: h.distance };
      }
    });
    return best ? { edge: best.edge } : {};
  }
  hoverPick(x, y) {
    const r = this.pick(x, y);
    const node = r.node ?? null, edge = node ? null : r.edge ?? null;
    if (node !== this.hoverNode || edge !== this.hoverEdge) {
      this.hoverNode = node;
      this.hoverEdge = edge;
      this.dirty = true;
    }
    this.canvas.style.cursor = node || edge ? "pointer" : "grab";
    if (node && this.analysis) {
      const nd = this.analysis.nodeById.get(node);
      this.showTip(x, y, `<b>${escapeHtml(nd.name ?? nd.id)}</b><span>${NODE_STYLE[nd.type].label}${nd.handle ? ` \xB7 @${escapeHtml(nd.handle)}` : ""} \xB7 ${this.analysis.degree.get(node) ?? 0} links</span>`);
    } else if (edge && this.analysis) {
      const e = this.findEdge(edge);
      const a = this.analysis.nodeById.get(e.source), b = this.analysis.nodeById.get(e.target);
      this.showTip(x, y, `<b>${EDGE_STYLE[e.kind].label}</b><span>${escapeHtml(a.name ?? a.id)} ${escapeHtml(e.label ?? "")} ${escapeHtml(b.name ?? b.id)}</span>`);
    } else this.tooltip.hidden = true;
  }
  showTip(x, y, html) {
    this.tooltip.innerHTML = html;
    this.tooltip.hidden = false;
    const tx = Math.min(x + 14, this.width - 260);
    this.tooltip.style.transform = `translate(${tx}px, ${y + 16}px)`;
  }
  bindInput() {
    const c = this.canvas;
    const pointers = /* @__PURE__ */ new Map();
    let downAt = null;
    let moved = 0;
    let pinch = null;
    const local = (e) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("pointerdown", (e) => {
      c.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, { ...p, button: e.button });
      downAt = p;
      moved = 0;
      if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      }
      c.style.cursor = "grabbing";
      this.tooltip.hidden = true;
    });
    c.addEventListener("pointermove", (e) => {
      const p = local(e);
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        this.pickAt = p;
        this.dirty = true;
        return;
      }
      const dx = p.x - prev.x, dy = p.y - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      pointers.set(e.pointerId, { ...p, button: prev.button });
      if (pointers.size === 2 && pinch) {
        const [a, b] = Array.from(pointers.values());
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        const n = this.ndc(cx, cy);
        if (d > 0 && pinch.d > 0) this.rig.zoomAt(pinch.d / d, n.x, n.y);
        this.rig.pan(cx - pinch.cx, cy - pinch.cy, this.height);
        pinch = { d, cx, cy };
      } else if (prev.button === 2 || e.shiftKey || prev.button === 1) {
        this.rig.pan(dx, dy, this.height);
      } else {
        this.rig.orbit(dx, dy);
      }
      this.dirty = true;
    });
    const end = (e) => {
      const p = local(e);
      const wasSingle = pointers.size === 1;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      c.style.cursor = "grab";
      if (wasSingle && downAt && moved < 6 && e.type === "pointerup") {
        const r = this.pick(p.x, p.y);
        if (r.node) this.cb.onPickNode(r.node);
        else if (r.edge) this.cb.onPickEdge(r.edge);
        else this.cb.onPickNothing();
      }
      downAt = null;
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener("pointerleave", () => {
      if (!pointers.size) {
        this.tooltip.hidden = true;
        this.hoverNode = null;
        this.hoverEdge = null;
        this.dirty = true;
      }
    });
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const delta = Math.max(-300, Math.min(300, e.deltaY * unit));
      const p = local(e);
      const n = this.ndc(p.x, p.y);
      this.rig.zoomAt(Math.exp(delta * (e.ctrlKey ? 6e-3 : 14e-4)), n.x, n.y);
      this.dirty = true;
    }, { passive: false });
    const drivingKeys = /* @__PURE__ */ new Set(["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright", "pageup", "pagedown", "=", "+", "-", "_"]);
    c.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (drivingKeys.has(k)) {
        this.keys.add(k);
        e.preventDefault();
        this.dirty = true;
      } else if (k === "home" || k === "0") {
        this.overview();
        e.preventDefault();
      } else if (k === "escape") this.cb.onEscape();
    });
    c.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    c.addEventListener("blur", () => this.keys.clear());
    c.addEventListener("focus", () => this.cb.onHint("Keyboard: W/S or \u2191/\u2193 drive \xB7 A/D or \u2190/\u2192 turn \xB7 Q/E sink/rise \xB7 +/\u2212 zoom \xB7 0 overview \xB7 Esc clear"));
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, r.width);
    this.height = Math.max(1, r.height);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    const scale = this.height * this.renderer.getPixelRatio() / (2 * Math.tan(this.camera.fov * Math.PI / 360));
    this.glow.material.uniforms.uScale.value = scale;
    this.snow.material.uniforms.uScale.value = scale;
    this.edgeGroups.forEach((g) => g.line.material.resolution.set(this.width, this.height));
    this.dirty = true;
  }
};
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// src/main.ts
var $ = (id) => document.getElementById(id);
var graph = buildSeed();
var A = analyze(graph);
var batchNo = 0;
var onMap = new Set(A.mapNodeIds);
var st = {
  selectedNode: null,
  selectedEdge: null,
  edgeFromNode: null,
  query: "",
  types: /* @__PURE__ */ new Set(),
  kinds: new Set(EDGE_KINDS),
  topics: /* @__PURE__ */ new Set(),
  hideLow: false,
  hideFiltered: false,
  sort: "links",
  resultIdx: 0
};
var scene = new MapScene($("stage"), $("map"), $("labels"), $("tooltip"), {
  onPickNode: (id) => selectNode(id, { fly: true }),
  onPickEdge: (id) => selectEdge(id, { fly: false }),
  onPickNothing: () => clearSelection(),
  onEscape: () => clearSelection(),
  onFrame: (info) => frameUi(info.depth),
  onHint: (t) => {
    $("hint").textContent = t;
  }
});
var nodeName = (id) => {
  const n = A.nodeById.get(id);
  return n?.name ?? n?.handle ?? id;
};
var filtersActive = () => st.types.size > 0 || st.topics.size > 0 || st.kinds.size < EDGE_KINDS.length || st.hideLow;
function nodeMatch(id) {
  const n = A.nodeById.get(id);
  if (!n) return false;
  if (st.types.size && !st.types.has(n.type)) return false;
  if (st.topics.size && !n.topics.some((t) => st.topics.has(t))) return false;
  return true;
}
function edgeMatch(e) {
  if (!st.kinds.has(e.kind)) return false;
  if (st.hideLow && e.confidence === "low") return false;
  return nodeMatch(e.source) && nodeMatch(e.target);
}
function focusSet() {
  const s = /* @__PURE__ */ new Set();
  if (st.selectedEdge) {
    const e = A.drawnEdges.find((x) => x.id === st.selectedEdge);
    if (e) {
      s.add(e.source);
      s.add(e.target);
    }
  } else if (st.selectedNode && onMap.has(st.selectedNode)) {
    s.add(st.selectedNode);
    for (const e of A.edgesByNode.get(st.selectedNode) ?? []) {
      s.add(e.source);
      s.add(e.target);
    }
  }
  return s;
}
function search(qRaw) {
  const q2 = qRaw.trim().toLowerCase().replace(/^@/, "");
  if (q2.length < 2) return [];
  const hits = [];
  for (const n of A.nodeById.values()) {
    const fields = [
      ["name", n.name ?? "", 100],
      ["handle", n.handle ?? n.id, 100],
      ["notes", n.notes ?? "", 45],
      ["summary", n.summary ?? "", 35],
      ["project", n.projects.map((p) => p.name).join(" \xB7 "), 40],
      ["topic", n.topics.map((t) => A.topicLabel.get(t) ?? t).join(" \xB7 "), 20]
    ];
    let best = null;
    for (const [field, text, w] of fields) {
      const i = text.toLowerCase().indexOf(q2);
      if (i < 0) continue;
      const wordStart = i === 0 || /[\s@_\-·]/.test(text[i - 1]);
      const score = w * (i === 0 ? 1.6 : wordStart ? 1.25 : 1);
      if (!best || score > best.score) best = { id: n.id, score, field, snippet: highlight(text, i, q2.length) };
    }
    if (best) {
      best.score += Math.min(10, A.degree.get(n.id) ?? 0) * 0.5 - (onMap.has(n.id) ? 0 : 5);
      hits.push(best);
    }
  }
  return hits.sort((a, b) => b.score - a.score);
}
function highlight(text, i, len) {
  const s = Math.max(0, i - 28), e = Math.min(text.length, i + len + 40);
  return `${s > 0 ? "\u2026" : ""}${escapeHtml(text.slice(s, i))}<mark>${escapeHtml(text.slice(i, i + len))}</mark>${escapeHtml(text.slice(i + len, e))}${e < text.length ? "\u2026" : ""}`;
}
var lastHits = [];
function pushView() {
  const view = {
    selectedNode: st.selectedNode && onMap.has(st.selectedNode) ? st.selectedNode : null,
    selectedEdge: st.selectedEdge,
    focus: focusSet(),
    matches: new Set(lastHits.filter((h) => onMap.has(h.id)).slice(0, 40).map((h) => h.id)),
    nodeMatch,
    edgeMatch,
    filtersActive: filtersActive(),
    hideFiltered: st.hideFiltered
  };
  scene.setView(view);
}
function announce(t) {
  $("live").textContent = t;
}
function selectNode(id, opts) {
  if (!A.nodeById.has(id)) return;
  st.selectedNode = id;
  st.selectedEdge = null;
  st.edgeFromNode = null;
  if (opts.fly && onMap.has(id)) scene.focusNode(id);
  renderDetails();
  renderList();
  pushView();
  const links = A.degree.get(id) ?? 0;
  announce(onMap.has(id) ? `${nodeName(id)} selected, ${links} connection${links === 1 ? "" : "s"}.` : `${nodeName(id)} is not on the map: it has no connections.`);
}
function selectEdge(id, opts) {
  const e = A.drawnEdges.find((x) => x.id === id);
  if (!e) return;
  st.edgeFromNode = st.selectedNode && (e.source === st.selectedNode || e.target === st.selectedNode) ? st.selectedNode : st.edgeFromNode;
  st.selectedEdge = id;
  if (opts.fly) scene.focusEdge(e);
  renderDetails();
  pushView();
  announce(`${EDGE_STYLE[e.kind].label}: ${nodeName(e.source)} ${e.label ?? ""} ${nodeName(e.target)}.`);
}
function clearSelection() {
  if (!st.selectedNode && !st.selectedEdge) return;
  st.selectedNode = null;
  st.selectedEdge = null;
  st.edgeFromNode = null;
  renderDetails();
  renderList();
  pushView();
  announce("Selection cleared.");
}
var shape = (t) => `<span class="shape ${t}" aria-hidden="true"></span>`;
function edgeSwatch(kind, w = 30) {
  const s = EDGE_STYLE[kind];
  const dash = kind === "engagement" ? 'stroke-dasharray="5 3"' : kind === "shared_topic" ? 'stroke-dasharray="1.5 3.5" stroke-linecap="round"' : "";
  return `<svg class="edge-swatch" width="${w}" height="8" viewBox="0 0 ${w} 8" aria-hidden="true"><line x1="1" y1="4" x2="${w - 1}" y2="4" stroke="${s.css}" stroke-width="${Math.max(1.2, s.width)}" ${dash}/></svg>`;
}
function conf(c) {
  const lvl = c === "high" ? 3 : c === "medium" ? 2 : c === "low" ? 1 : 0;
  const bars = [6, 9, 12].map((h, i) => `<i style="height:${h}px" class="${i < lvl ? "on" : ""}"></i>`).join("");
  return `<span class="conf"><span class="bars" aria-hidden="true">${bars}</span>${c ? c[0].toUpperCase() + c.slice(1) : "Not assessed"}</span>`;
}
function sourceItem(id) {
  const s = A.sourceById.get(id);
  if (!s) return `<li class="missing">Missing source record \u201C${escapeHtml(id)}\u201D</li>`;
  const meta = [s.publisher, s.date].filter(Boolean).join(" \xB7 ");
  return `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title ?? s.url)} \u2197</a>${meta ? `<span class="m">${escapeHtml(meta)}</span>` : ""}</li>`;
}
function renderDetails() {
  const panel = $("details");
  if (st.selectedEdge) {
    const e = A.drawnEdges.find((x) => x.id === st.selectedEdge);
    if (e) {
      panel.hidden = false;
      $("detailsBody").innerHTML = edgeHtml(e);
      return;
    }
  }
  const n = st.selectedNode ? A.nodeById.get(st.selectedNode) : null;
  if (!n) {
    panel.hidden = true;
    $("detailsBody").innerHTML = "";
    return;
  }
  panel.hidden = false;
  $("detailsBody").innerHTML = nodeHtml(n);
}
function nodeHtml(n) {
  const style = NODE_STYLE[n.type];
  const off = A.offMap.find((o) => o.id === n.id);
  const x = n.profiles.x, li = n.profiles.linkedin;
  const handle = n.handle ?? n.id;
  const edges = A.edgesByNode.get(n.id) ?? [];
  const groups = EDGE_KINDS.map((k) => ({ k, list: edges.filter((e) => e.kind === k) })).filter((g) => g.list.length);
  const conns = groups.map((g) => `
    <div class="conn-group">
      <div class="gh">${edgeSwatch(g.k, 22)}${EDGE_STYLE[g.k].label} \xB7 ${g.list.length}</div>
      ${g.list.map((e) => {
    const other = e.source === n.id ? e.target : e.source;
    const o = A.nodeById.get(other);
    const phrase = e.source === n.id ? `${escapeHtml(e.label ?? g.k)} ${escapeHtml(nodeName(other))}` : `${escapeHtml(nodeName(other))} ${escapeHtml(e.label ?? g.k)} this account`;
    const dim = filtersActive() && !edgeMatch(e) ? ' style="opacity:.55"' : "";
    return `<div class="conn"${dim}>
          <button type="button" class="main" data-act="edge" data-id="${escapeHtml(e.id)}" aria-label="Inspect relationship: ${phrase}">${shape(o.type)}<span class="t"><b>${escapeHtml(nodeName(other))}</b><span class="s">${phrase}</span></span>${conf(e.confidence)}</button>
          <button type="button" class="icon-btn" data-act="go" data-id="${escapeHtml(other)}" aria-label="Go to ${escapeHtml(nodeName(other))}" title="Go to ${escapeHtml(nodeName(other))}">\u2192</button>
        </div>`;
  }).join("")}
    </div>`).join("");
  const claims = n.claims.filter((c) => c.source_ids.length);
  return `
  <div class="d-head">
    <div class="d-top"><span class="chip">${shape(n.type)}${style.label}</span>
      <span>${st.selectedNode && onMap.has(n.id) ? `<button type="button" class="icon-btn" data-act="locate" aria-label="Center on map" title="Center on map">\u25CE</button> ` : ""}<button type="button" class="icon-btn" data-act="close" aria-label="Close details">\u2715</button></span></div>
    <h2 class="d-name">${escapeHtml(n.name ?? handle)}</h2>
    <div class="handle-row">
      <span class="handle">@${escapeHtml(handle)}</span>
      <button type="button" class="btn sm" data-act="copy" data-id="@${escapeHtml(handle)}">Copy handle</button>
    </div>
    <div class="handle-row">
      ${x ? `<a class="btn primary" href="${escapeHtml(x)}" target="_blank" rel="noopener noreferrer">Open X profile \u2197</a>` : ""}
      ${li ? `<a class="btn sm" href="${escapeHtml(li)}" target="_blank" rel="noopener noreferrer">LinkedIn \u2197</a>` : ""}
      ${!x && !li ? `<span class="small" style="color:var(--warn)">No public profile on record</span>` : ""}
      ${graph.meta.is_sample ? `<span class="sample">Sample data</span>` : ""}
    </div>
  </div>
  <div class="d-body">
    ${off ? `<div class="offmap"><b>Not on the map.</b> ${escapeHtml(off.reason)}. The record is kept in the data; no connection has been invented for it.</div>` : ""}
    ${n.summary ? `<section class="d-sec"><h3>What they build</h3><p>${escapeHtml(n.summary)}</p></section>` : ""}
    ${n.notes ? `<section class="d-sec"><h3>Research notes</h3><div class="notes">${escapeHtml(n.notes)}</div></section>` : ""}
    ${n.topics.length ? `<section class="d-sec"><h3>Topics</h3><div class="chips">${n.topics.map((t) => `<button type="button" data-act="topic" data-id="${escapeHtml(t)}" aria-pressed="${st.topics.has(t)}">${escapeHtml(A.topicLabel.get(t) ?? t)}${st.topics.has(t) ? " \u2713" : ""}</button>`).join("")}</div></section>` : ""}
    ${n.projects.length ? `<section class="d-sec"><h3>Projects</h3><ul class="src-list">${n.projects.map((p) => `<li><b>${p.url ? `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.name)} \u2197</a>` : escapeHtml(p.name)}</b><span class="m">${escapeHtml(p.description ?? "")}</span></li>`).join("")}</ul></section>` : ""}
    <section class="d-sec"><h3>Connections \xB7 ${edges.length}</h3>${conns || `<p class="muted">No connections on record.</p>`}</section>
    <section class="d-sec"><h3>Why this account is included</h3><ul class="src-list">${n.inclusion_source_ids.map(sourceItem).join("") || `<li class="missing">No inclusion evidence on record.</li>`}</ul></section>
    ${claims.length ? `<section class="d-sec"><h3>Sources for statements</h3><ul class="src-list">${claims.map((c) => `<li><span class="m">${escapeHtml(c.field)}</span><ul class="src-list">${c.source_ids.map(sourceItem).join("")}</ul></li>`).join("")}</ul></section>` : ""}
    <section class="d-sec"><h3>Confidence</h3><p>${conf(n.confidence)} ${n.confidence_note ? `<span class="small muted">\u2014 ${escapeHtml(n.confidence_note)}</span>` : ""}</p>${n.confidence && graph.meta.confidence_levels?.[n.confidence] ? `<p class="small muted">${escapeHtml(graph.meta.confidence_levels[n.confidence])}</p>` : ""}</section>
    ${n.added_at ? `<p class="small muted">Added ${escapeHtml(n.added_at)}</p>` : ""}
  </div>`;
}
function edgeHtml(e) {
  const s = EDGE_STYLE[e.kind];
  const a = A.nodeById.get(e.source), b = A.nodeById.get(e.target);
  const pairOthers = A.drawnEdges.filter((x) => x.id !== e.id && (x.source === e.source && x.target === e.target || x.source === e.target && x.target === e.source));
  const project = e.project_id ? [a, b].flatMap((n) => n.projects).find((p) => p.id === e.project_id) : void 0;
  const explain = e.kind === "engagement" ? `<div class="callout engage"><b>Discovery path, not collaboration.</b> This records a reply or quote on X that led the research from one account to the other. On its own it does not mean they work together.</div>` : e.kind === "shared_topic" ? `<div class="callout"><b>Same area of work.</b> Both are linked to the same topic. No direct relationship between them is claimed.</div>` : e.kind === "cluster" ? `<div class="callout"><b>Legacy link.</b> Kept from older data. What a cluster link means has not been defined, so read nothing into it yet.</div>` : `<div class="callout"><b>${s.label}.</b> ${escapeHtml(s.means)}</div>`;
  const period = e.period && (e.period.start || e.period.end) ? `${e.period.start ?? "?"} \u2013 ${e.period.end ?? "present"}` : "";
  return `
  <div class="d-head">
    <div class="d-top"><span class="chip">${edgeSwatch(e.kind, 22)}Connection \xB7 ${s.label}</span>
      <span>${st.edgeFromNode ? `<button type="button" class="btn sm" data-act="back">\u2190 ${escapeHtml(nodeName(st.edgeFromNode))}</button> ` : ""}<button type="button" class="icon-btn" data-act="close" aria-label="Close details">\u2715</button></span></div>
    <h2 class="d-name" style="font-size:21px">${escapeHtml(nodeName(a.id))} <span class="muted" style="font-weight:500">${escapeHtml(e.label ?? e.kind)}</span> ${escapeHtml(nodeName(b.id))}</h2>
    ${graph.meta.is_sample ? `<div><span class="sample">Sample data</span></div>` : ""}
  </div>
  <div class="d-body">
    ${explain}
    ${e.detail ? `<section class="d-sec"><h3>Detail</h3><p>${escapeHtml(e.detail)}</p></section>` : ""}
    ${period ? `<section class="d-sec"><h3>Period</h3><p>${escapeHtml(period)}</p></section>` : ""}
    ${project ? `<section class="d-sec"><h3>Project</h3><p>${escapeHtml(project.name)}</p></section>` : ""}
    ${e.topic_ids?.length ? `<section class="d-sec"><h3>Shared topic</h3><div class="chips">${e.topic_ids.map((t) => `<button type="button" data-act="topic" data-id="${escapeHtml(t)}">${escapeHtml(A.topicLabel.get(t) ?? t)}</button>`).join("")}</div></section>` : ""}
    <section class="d-sec"><h3>Evidence</h3>${e.source_ids.length ? `<ul class="src-list">${e.source_ids.map(sourceItem).join("")}</ul>` : `<p class="muted">No direct evidence links these two${e.kind === "shared_topic" ? "; the topic comes from each account\u2019s own sources" : ""}.</p>`}</section>
    <section class="d-sec"><h3>Confidence</h3><p>${conf(e.confidence)}</p>${e.note ? `<p class="small muted" style="margin-top:6px">${escapeHtml(e.note)}</p>` : ""}</section>
    ${pairOthers.length ? `<section class="d-sec"><h3>Other relationships between these two</h3><p class="small muted" style="margin-bottom:6px">Each is a separate record with its own evidence and its own line on the map.</p>${pairOthers.map((x) => `<div class="conn"><button type="button" class="main" data-act="edge" data-id="${escapeHtml(x.id)}">${edgeSwatch(x.kind, 22)}<span class="t"><b>${EDGE_STYLE[x.kind].label}</b><span class="s">${escapeHtml(nodeName(x.source))} ${escapeHtml(x.label ?? x.kind)} ${escapeHtml(nodeName(x.target))}</span></span>${conf(x.confidence)}</button></div>`).join("")}</section>` : ""}
    <section class="d-sec"><h3>Go to</h3><div class="pair-ends">${[a, b].map((n) => `<div class="conn"><button type="button" class="main" data-act="select" data-id="${escapeHtml(n.id)}">${shape(n.type)}<span class="t"><b>${escapeHtml(nodeName(n.id))}</b><span class="s">${NODE_STYLE[n.type].label} \xB7 @${escapeHtml(n.handle ?? n.id)}</span></span></button></div>`).join("")}</div></section>
  </div>`;
}
$("details").addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-act]");
  if (!btn) return;
  const id = btn.dataset.id ?? "";
  switch (btn.dataset.act) {
    case "close":
      clearSelection();
      break;
    case "go":
      selectNode(id, { fly: true });
      break;
    case "select":
      selectNode(id, { fly: true });
      break;
    case "edge":
      selectEdge(id, { fly: true });
      break;
    case "back":
      if (st.edgeFromNode) selectNode(st.edgeFromNode, { fly: true });
      break;
    case "locate":
      if (st.selectedNode) scene.focusNode(st.selectedNode);
      break;
    case "topic":
      toggleSet(st.topics, id);
      syncFilterInputs();
      onFiltersChanged();
      renderDetails();
      break;
    case "copy":
      navigator.clipboard?.writeText(id).then(() => toast(`Copied ${id}`), () => toast("Copy failed"));
      break;
  }
});
var q = $("q");
var results = $("results");
function renderResults() {
  lastHits = search(st.query);
  const shown = lastHits.slice(0, 10);
  st.resultIdx = Math.min(st.resultIdx, Math.max(0, shown.length - 1));
  if (!st.query.trim() || st.query.trim().length < 2) {
    results.hidden = true;
    q.setAttribute("aria-expanded", "false");
    pushView();
    renderList();
    return;
  }
  const fieldLabel = { name: "name", handle: "handle", notes: "research notes", summary: "summary", project: "project", topic: "topic" };
  const mapHits = shown.filter((h) => onMap.has(h.id)), offHits = shown.filter((h) => !onMap.has(h.id));
  const item = (h, i2) => {
    const n = A.nodeById.get(h.id);
    return `<button type="button" class="result" role="option" id="res-${i2}" aria-selected="${i2 === st.resultIdx}" data-id="${escapeHtml(h.id)}">${shape(n.type)}<span><span>${escapeHtml(n.name ?? n.id)}</span><span class="meta">@${escapeHtml(n.handle ?? n.id)} \xB7 ${NODE_STYLE[n.type].label}${h.field !== "name" && h.field !== "handle" ? ` \xB7 in ${fieldLabel[h.field]}: ${h.snippet}` : ""}</span></span></button>`;
  };
  let i = 0;
  results.innerHTML = shown.length ? `${mapHits.length ? `<div class="group">On the map \xB7 ${lastHits.filter((h) => onMap.has(h.id)).length}</div>${mapHits.map((h) => item(h, i++)).join("")}` : ""}${offHits.length ? `<div class="group">Not on the map (no connections)</div>${offHits.map((h) => item(h, i++)).join("")}` : ""}<div class="group" style="text-transform:none;letter-spacing:0">\u2191 \u2193 move \xB7 Enter go \xB7 Esc close \xB7 matches glow on the map</div>` : `<div class="group" style="text-transform:none;letter-spacing:0">No accounts match \u201C${escapeHtml(st.query)}\u201D.</div>`;
  results.hidden = false;
  q.setAttribute("aria-expanded", "true");
  q.setAttribute("aria-activedescendant", shown.length ? `res-${st.resultIdx}` : "");
  pushView();
  renderList();
}
function orderedHits() {
  const s = lastHits.slice(0, 10);
  return [...s.filter((h) => onMap.has(h.id)), ...s.filter((h) => !onMap.has(h.id))];
}
q.addEventListener("input", () => {
  st.query = q.value;
  st.resultIdx = 0;
  renderResults();
});
q.addEventListener("focus", () => {
  if (st.query.trim().length >= 2) renderResults();
});
q.addEventListener("keydown", (e) => {
  const hits = orderedHits();
  if (e.key === "ArrowDown") {
    st.resultIdx = Math.min(hits.length - 1, st.resultIdx + 1);
    renderResults();
    e.preventDefault();
  } else if (e.key === "ArrowUp") {
    st.resultIdx = Math.max(0, st.resultIdx - 1);
    renderResults();
    e.preventDefault();
  } else if (e.key === "Enter") {
    const h = hits[st.resultIdx];
    if (h) pickResult(h.id);
    e.preventDefault();
  } else if (e.key === "Escape") {
    if (!results.hidden) {
      results.hidden = true;
      q.setAttribute("aria-expanded", "false");
    } else {
      q.value = "";
      st.query = "";
      renderResults();
    }
  }
});
results.addEventListener("click", (e) => {
  const b = e.target.closest(".result");
  if (b?.dataset.id) pickResult(b.dataset.id);
});
function pickResult(id) {
  results.hidden = true;
  q.setAttribute("aria-expanded", "false");
  selectNode(id, { fly: true });
}
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search")) {
    results.hidden = true;
    q.setAttribute("aria-expanded", "false");
  }
});
document.addEventListener("keydown", (e) => {
  const tag = (document.activeElement?.tagName ?? "").toLowerCase();
  if (e.key === "/" && tag !== "input" && tag !== "select" && tag !== "textarea") {
    e.preventDefault();
    q.focus();
    q.select();
  }
});
function toggleSet(s, v) {
  if (s.has(v)) s.delete(v);
  else s.add(v);
}
function buildFilters() {
  const typeCount = (t) => A.mapNodeIds.filter((id) => A.nodeById.get(id).type === t).length;
  $("fTypes").innerHTML = NODE_TYPES.map((t) => `<label class="row"><input type="checkbox" data-f="type" value="${t}">${shape(t)}${NODE_STYLE[t].label}<span class="count">${typeCount(t)}</span></label>`).join("");
  $("fKinds").innerHTML = EDGE_KINDS.map((k) => `<label class="row"><input type="checkbox" data-f="kind" value="${k}">${edgeSwatch(k, 26)}${EDGE_STYLE[k].label}<span class="count">${A.drawnEdges.filter((e) => e.kind === k).length}</span></label>`).join("");
  const topicCount = (t) => A.mapNodeIds.filter((id) => A.nodeById.get(id).topics.includes(t)).length;
  $("fTopics").innerHTML = graph.topics.map((t) => `<label class="row" title="${escapeHtml(t.description ?? "")}"><input type="checkbox" data-f="topic" value="${escapeHtml(t.id)}">${escapeHtml(t.label)}<span class="count">${topicCount(t.id)}</span></label>`).join("");
  syncFilterInputs();
}
function syncFilterInputs() {
  document.querySelectorAll("#filters input[data-f]").forEach((i) => {
    const v = i.value;
    i.checked = i.dataset.f === "type" ? st.types.has(v) : i.dataset.f === "kind" ? st.kinds.has(v) : st.topics.has(v);
  });
  $("fLow").checked = st.hideLow;
  $("fHide").checked = st.hideFiltered;
}
$("filters").addEventListener("change", (e) => {
  const i = e.target;
  if (i.dataset.f === "type") toggleSet(st.types, i.value);
  else if (i.dataset.f === "kind") toggleSet(st.kinds, i.value);
  else if (i.dataset.f === "topic") toggleSet(st.topics, i.value);
  else if (i.id === "fLow") st.hideLow = i.checked;
  else if (i.id === "fHide") st.hideFiltered = i.checked;
  onFiltersChanged();
});
function clearFilters() {
  st.types.clear();
  st.topics.clear();
  st.kinds = new Set(EDGE_KINDS);
  st.hideLow = false;
  st.hideFiltered = false;
  syncFilterInputs();
  onFiltersChanged();
}
$("clearFilters").addEventListener("click", clearFilters);
function onFiltersChanged() {
  const active = filtersActive();
  const n = st.types.size + st.topics.size + (EDGE_KINDS.length - st.kinds.size) + (st.hideLow ? 1 : 0);
  $("filterBadge").hidden = !active;
  $("filterBadge").textContent = String(n);
  const bar = $("filterBar");
  const matching = A.mapNodeIds.filter(nodeMatch).length;
  bar.hidden = !active;
  bar.innerHTML = active ? `<span><b>${matching}</b> of ${A.mapNodeIds.length} accounts match</span><button type="button" class="link" id="barClear">Clear filters</button>` : "";
  if (active) $("barClear").addEventListener("click", clearFilters);
  pushView();
  renderList();
  if (st.selectedNode) renderDetails();
  announce(active ? `${matching} accounts match the filters.` : "Filters cleared.");
}
function renderList() {
  if ($("list").hidden) return;
  const query = st.query.trim().length >= 2 ? new Set(lastHits.map((h) => h.id)) : null;
  let ids = A.mapNodeIds.filter((id) => (!query || query.has(id)) && (!filtersActive() || nodeMatch(id)));
  const nm = (id) => nodeName(id).toLowerCase();
  ids.sort(st.sort === "name" ? (a, b) => nm(a).localeCompare(nm(b)) : st.sort === "type" ? (a, b) => A.nodeById.get(a).type.localeCompare(A.nodeById.get(b).type) || nm(a).localeCompare(nm(b)) : (a, b) => (A.degree.get(b) ?? 0) - (A.degree.get(a) ?? 0));
  const off = A.offMap.filter((o) => (!query || query.has(o.id)) && (!filtersActive() || nodeMatch(o.id)));
  const row = (id, offMap = false) => {
    const n = A.nodeById.get(id);
    const d = A.degree.get(id) ?? 0;
    const sub = offMap ? `${NODE_STYLE[n.type].label} \xB7 not on the map` : `${NODE_STYLE[n.type].label} \xB7 @${escapeHtml(n.handle ?? n.id)} \xB7 ${d} connection${d === 1 ? "" : "s"}`;
    return `<li><button type="button" data-id="${escapeHtml(id)}" aria-current="${st.selectedNode === id}"${offMap ? ' class="dim"' : ""}>${shape(n.type)}<span><span>${escapeHtml(nodeName(id))}</span><span class="sub">${sub}</span></span></button></li>`;
  };
  $("listItems").innerHTML = ids.map((id) => row(id)).join("") + (off.length ? `<li class="sec">Not on the map \xB7 ${off.length}</li>${off.map((o) => row(o.id, true)).join("")}` : "");
  $("listCount").textContent = `${ids.length} on the map${query ? " match the search" : ""}`;
}
$("listItems").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id]");
  if (b) selectNode(b.dataset.id, { fly: true });
});
$("sort").addEventListener("change", (e) => {
  st.sort = e.target.value;
  renderList();
});
function toggleDrawer(which) {
  const el = $(which), other = $(which === "filters" ? "list" : "filters");
  const open = el.hidden;
  el.hidden = !open;
  if (open) other.hidden = true;
  $("btnFilters").setAttribute("aria-expanded", String(!$("filters").hidden));
  $("btnList").setAttribute("aria-expanded", String(!$("list").hidden));
  if (which === "list" && open) renderList();
  if (open) el.querySelector("input,select,button")?.focus();
}
$("btnFilters").addEventListener("click", () => toggleDrawer("filters"));
$("btnList").addEventListener("click", () => toggleDrawer("list"));
$("closeList").addEventListener("click", () => toggleDrawer("list"));
function renderLegend() {
  $("legendNodes").innerHTML = NODE_TYPES.map((t) => `<li>${shape(t)}${NODE_STYLE[t].label} <span class="small muted">(${NODE_STYLE[t].shape.toLowerCase()})</span></li>`).join("");
  const present = new Set(A.drawnEdges.map((e) => e.kind));
  $("legendEdges").innerHTML = EDGE_KINDS.filter((k) => present.has(k)).map((k) => `<li title="${escapeHtml(EDGE_STYLE[k].means)}">${edgeSwatch(k)}<span>${EDGE_STYLE[k].label}${k === "engagement" ? ' <span class="muted">\u2014 reply/quote path, not collaboration</span>' : k === "shared_topic" ? ' <span class="muted">\u2014 no direct link</span>' : ""}</span></li>`).join("");
}
function setPower(on) {
  document.body.classList.toggle("power", on);
  $("exitPower").hidden = !on;
  $("btnPower").setAttribute("aria-pressed", String(on));
  if (on) {
    results.hidden = true;
    $("filters").hidden = true;
    $("list").hidden = true;
  }
  try {
    localStorage.setItem("agentMap.power", on ? "1" : "0");
  } catch {
  }
  announce(on ? "Power view: only the map is shown. Press P to show the controls." : "Controls shown.");
  $(on ? "map" : "btnPower").focus();
}
$("btnPower").addEventListener("click", () => setPower(true));
$("exitPower").addEventListener("click", () => setPower(false));
document.addEventListener("keydown", (e) => {
  const tag = (document.activeElement?.tagName ?? "").toLowerCase();
  if ((e.key === "p" || e.key === "P") && !e.metaKey && !e.ctrlKey && !e.altKey && tag !== "input" && tag !== "select" && tag !== "textarea") {
    setPower(!document.body.classList.contains("power"));
  }
});
try {
  if (localStorage.getItem("agentMap.power") === "1") setPower(true);
} catch {
}
$("namesToggle").addEventListener("click", () => {
  const on = !scene.showNames;
  scene.setShowNames(on);
  $("namesToggle").textContent = on ? "Hide names" : "Show names";
  $("namesToggle").setAttribute("aria-pressed", String(on));
});
$("legendToggle").addEventListener("click", () => {
  const c = $("legend").classList.toggle("collapsed");
  $("legendToggle").textContent = c ? "Show lines" : "Hide lines";
  $("legendToggle").setAttribute("aria-expanded", String(!c));
});
function renderCounts() {
  $("counts").textContent = `${A.mapNodeIds.length} accounts \xB7 ${A.drawnEdges.length} connections`;
  $("sampleFlag").hidden = !graph.meta.is_sample;
  const errs = A.issues.filter((i) => i.level !== "info").length;
  $("issueBadge").hidden = errs === 0;
  $("issueBadge").textContent = String(errs);
}
function renderReport() {
  const lvls = [["error", "Errors"], ["warning", "Warnings"], ["info", "Notes"]];
  const m = graph.meta;
  $("reportBody").innerHTML = `
    <div class="stats">
      <div><b>${graph.nodes.length}</b><span class="small muted">records in the data</span></div>
      <div><b>${A.mapNodeIds.length}</b><span class="small muted">accounts on the map</span></div>
      <div><b>${A.offMap.length}</b><span class="small muted">kept, not drawn</span></div>
      <div><b>${A.drawnEdges.length}</b><span class="small muted">connections drawn</span></div>
    </div>
    <h3>Not drawn on the map</h3>
    <p class="small muted">Every account on the map links to at least one other. These records stay in the data; no edges were invented for them.</p>
    <ul>${A.offMap.map((o) => `<li><button type="button" class="link" data-open="${escapeHtml(o.id)}">${escapeHtml(nodeName(o.id))}</button> \u2014 ${escapeHtml(o.reason)}</li>`).join("") || "<li>None</li>"}</ul>
    ${lvls.map(([l, label]) => {
    const list = A.issues.filter((i) => i.level === l);
    return list.length ? `<h3>${label}</h3><ul>${list.map((i) => `<li><span class="lvl-${l}">${l}</span> ${escapeHtml(i.message)}</li>`).join("")}</ul>` : "";
  }).join("")}
    <h3>Research process</h3>
    <p class="small">Seeds: ${m.seeds?.length ?? 0} \xB7 Expanded: ${m.expanded?.length ?? 0} \xB7 Frozen: ${m.frozen?.length ?? 0} \xB7 Data version ${escapeHtml(String(m.version))}, updated ${escapeHtml(m.updated)}</p>
    <h3>Data shape</h3>
    <p class="small">Uses the merged GraphMap shape unchanged. Positions are not stored: they are worked out from the edges each time, so adding records re-settles the map instead of needing hand placement.</p>`;
}
$("btnReport").addEventListener("click", () => {
  renderReport();
  $("report").showModal();
});
$("closeReport").addEventListener("click", () => $("report").close());
$("reportBody").addEventListener("click", (e) => {
  const b = e.target.closest("[data-open]");
  if (b) {
    $("report").close();
    selectNode(b.dataset.open, { fly: false });
  }
});
var depth = $("depth");
var depthDragging = false;
depth.addEventListener("pointerdown", () => {
  depthDragging = true;
});
window.addEventListener("pointerup", () => {
  depthDragging = false;
});
depth.addEventListener("input", () => scene.setDepth(Number(depth.value) / 1e3));
$("zoomIn").addEventListener("click", () => scene.zoomBy(0.6));
$("zoomOut").addEventListener("click", () => scene.zoomBy(1 / 0.6));
$("home").addEventListener("click", () => scene.overview());
var depthName = (t) => {
  const ov = scene.overviewDepth;
  return t < ov - 0.04 ? "Far out" : t < ov + 0.12 ? "Surface" : t < ov + 0.35 ? "Shallow" : t < ov + 0.55 ? "Deep" : "Deepest";
};
var mini = $("minimap");
var mctx = mini.getContext("2d");
var lastMini = 0;
function frameUi(d) {
  if (!depthDragging && document.activeElement !== depth) depth.value = String(Math.round(d * 1e3));
  depth.setAttribute("aria-valuetext", `${depthName(d)}, ${Math.round(d * 100)}% zoomed in`);
  $("depthRead").textContent = depthName(d);
  const now = performance.now();
  if (now - lastMini > 120) {
    lastMini = now;
    drawMinimap();
  }
}
function miniTransform() {
  const ex = scene.extent();
  const s = (mini.width / 2 - 10) / (ex.radius * 1.35);
  return { ex, s, cx: mini.width / 2, cy: mini.height / 2 };
}
function drawMinimap() {
  const { ex, s, cx, cy } = miniTransform();
  mctx.clearRect(0, 0, mini.width, mini.height);
  const sel = st.selectedNode;
  for (const id of scene.nodeIds()) {
    const p = scene.position(id);
    const t = scene.typeOf(id);
    const x = cx + (p.x - ex.center.x) * s, y = cy + (p.z - ex.center.z) * s;
    mctx.globalAlpha = filtersActive() && !nodeMatch(id) ? 0.15 : 0.35 + 0.65 * scene.visibility(id);
    mctx.fillStyle = NODE_STYLE[t].css;
    mctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
    if (id === sel) {
      mctx.globalAlpha = 1;
      mctx.strokeStyle = "#16181D";
      mctx.lineWidth = 2;
      mctx.beginPath();
      mctx.arc(x, y, 5, 0, Math.PI * 2);
      mctx.stroke();
    }
  }
  mctx.globalAlpha = 1;
  const c = scene.cameraInfo;
  const px = cx + (c.pos.x - ex.center.x) * s, py = cy + (c.pos.z - ex.center.z) * s;
  const tx = cx + (c.target.x - ex.center.x) * s, ty = cy + (c.target.z - ex.center.z) * s;
  mctx.strokeStyle = "rgba(22,24,29,.7)";
  mctx.lineWidth = 1.2;
  mctx.setLineDash([3, 3]);
  mctx.beginPath();
  mctx.moveTo(px, py);
  mctx.lineTo(tx, ty);
  mctx.stroke();
  mctx.setLineDash([]);
  mctx.fillStyle = "#16181D";
  mctx.beginPath();
  mctx.arc(Math.max(4, Math.min(mini.width - 4, px)), Math.max(4, Math.min(mini.height - 4, py)), 4, 0, Math.PI * 2);
  mctx.fill();
  mctx.strokeStyle = "#16181D";
  mctx.beginPath();
  mctx.arc(tx, ty, 6, 0, Math.PI * 2);
  mctx.stroke();
}
mini.addEventListener("click", (e) => {
  const r = mini.getBoundingClientRect();
  const { ex, s, cx, cy } = miniTransform();
  const x = (e.clientX - r.left - cx) / s + ex.center.x, z = (e.clientY - r.top - cy) / s + ex.center.z;
  scene.rig.flyTo({ x, y: scene.rig.target.y, z });
  scene.rig.userMoved = true;
  scene.zoomBy(1);
});
var toastTimer = 0;
function toast(t) {
  const el = $("toast");
  el.textContent = t;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.hidden = true, 3200);
}
function refresh(msg) {
  A = analyze(graph);
  onMap = new Set(A.mapNodeIds);
  if (st.selectedNode && !A.nodeById.has(st.selectedNode)) st.selectedNode = null;
  if (st.selectedEdge && !A.drawnEdges.some((e) => e.id === st.selectedEdge)) st.selectedEdge = null;
  scene.setData(A);
  buildFilters();
  renderLegend();
  renderCounts();
  renderDetails();
  if (st.query) renderResults();
  else renderList();
  onFiltersChanged();
  if (msg) toast(msg);
}
function addData(input, mode = "merge") {
  const incoming = normalizeGraph(input);
  const before = new Set(A.mapNodeIds);
  const rawMeta = input?.meta;
  graph = mode === "replace" ? incoming : mergeGraph(graph, { ...incoming, meta: rawMeta ?? {} });
  refresh();
  const added = A.mapNodeIds.filter((id) => !before.has(id)).length;
  toast(mode === "replace" ? `Loaded ${A.mapNodeIds.length} accounts; the map is settling.` : `${added} new account${added === 1 ? "" : "s"} placed; the map is settling.`);
  if (mode === "replace") scene.overview();
}
$("btnBatch").addEventListener("click", () => {
  batchNo++;
  const batch = buildBatch(graph, batchNo);
  addData({ ...batch, topics: [], meta: {} }, "merge");
  const first = batch.nodes[0]?.id;
  if (first) {
    lastHits = [];
    setTimeout(() => selectNode(first, { fly: true }), 600);
  }
});
var pendingJson = null;
async function loadFile(f) {
  try {
    pendingJson = JSON.parse(await f.text());
    const n = Array.isArray(pendingJson.nodes) ? pendingJson.nodes.length : 0;
    const e = Array.isArray(pendingJson.edges) ? pendingJson.edges.length : 0;
    $("loadBody").textContent = `${f.name}: ${n} accounts and ${e} connections. Merging keeps the current map and places new accounts next to the ones they link to. Records with an existing id are updated.`;
    $("loadDlg").showModal();
  } catch (err) {
    toast(`Could not read ${f.name}: ${err.message}`);
  }
}
$("loadMerge").addEventListener("click", () => {
  $("loadDlg").close();
  if (pendingJson) addData(pendingJson, "merge");
  pendingJson = null;
});
$("loadReplace").addEventListener("click", () => {
  $("loadDlg").close();
  if (pendingJson) addData(pendingJson, "replace");
  pendingJson = null;
});
$("loadCancel").addEventListener("click", () => {
  $("loadDlg").close();
  pendingJson = null;
});
$("fileIn").addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (f) loadFile(f);
  e.target.value = "";
});
$("stage").addEventListener("dragover", (e) => e.preventDefault());
$("stage").addEventListener("drop", (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFile(f);
});
window.agentMap = {
  addData: (json) => addData(json, "merge"),
  replaceData: (json) => addData(json, "replace"),
  getData: () => graph,
  report: () => ({ offMap: A.offMap, issues: A.issues }),
  camera: () => ({ dist: scene.rig.dist, current: scene.rig.currentDist, min: scene.rig.minDist, max: scene.rig.maxDist, depth: scene.depth })
};
refresh();
scene.overview(true);
