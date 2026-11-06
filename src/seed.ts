// Deterministic FAKE seed data built from the GraphMap shape.
// Every account, link and source here is invented for the prototype.
// Profile and source URLs point at example.com on purpose, so a fake
// handle can never open a real person's account.

import type { Confidence, Edge, EdgeKind, GraphMap, Node, NodeType, Project, Source, Topic } from "./types";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Ada", "Bram", "Cyra", "Dax", "Elin", "Femi", "Gus", "Hana", "Ivo", "Juno", "Kofi", "Lior", "Mara", "Nils", "Oona", "Pax", "Quin", "Rhea", "Sami", "Tove", "Uma", "Vik", "Wren", "Xan", "Yara", "Zeke", "Ayo", "Bea", "Cato", "Dara", "Eko", "Fen", "Gia", "Hal", "Ines", "Jael", "Kai", "Lumi", "Moe", "Nia", "Odin", "Pia", "Ravi", "Sol", "Tam", "Ula", "Vera", "Wim"];
const LAST = ["Ashby", "Brook", "Calder", "Dune", "Ember", "Fallow", "Glenn", "Harrow", "Inlet", "Juniper", "Kestrel", "Larch", "Moss", "Nettle", "Orrin", "Pike", "Quarry", "Reed", "Sorrel", "Thorne", "Vale", "Wick", "Yarrow", "Zephyr", "Alder", "Birch", "Cove", "Drift"];
const ORGS = ["Tidewater Labs", "Brinefield Systems", "Coralgate", "Deepcurrent", "Kelpworks", "Saltline Compute", "Lanternfish Labs", "Undertow Systems", "Shoal Collective", "Pelagic Labs", "Driftwood Agents", "Benthic Tools", "Gyre Research", "Spindrift AI"];
const AGENT_WORDS = ["Relay", "Scout", "Pilot", "Ferry", "Beacon", "Dredge", "Sonar", "Tender", "Skiff", "Buoy", "Ballast", "Anchor", "Keel", "Rudder", "Sextant", "Bosun", "Gull", "Tern", "Petrel", "Heron", "Wake", "Eddy", "Swell", "Squall"];

const TOPICS: Topic[] = [
  { id: "harnesses", label: "Agent harnesses", description: "Runtimes that drive a model through tools, state and retries." },
  { id: "orchestration", label: "Multi-agent orchestration", description: "Groups of agents coordinating across tools or teams." },
  { id: "tool-protocols", label: "Tool & context protocols", description: "How agents discover and call tools and data." },
  { id: "evals", label: "Agent evals", description: "Measuring multi-step agent behaviour." },
  { id: "sandboxes", label: "Sandboxes & execution", description: "Isolated environments where agents run code." },
  { id: "memory", label: "Memory & retrieval", description: "Long-lived state and retrieval for agents." },
  { id: "inference", label: "Inference infrastructure", description: "Serving, routing and scaling model calls." },
  { id: "observability", label: "Agent observability", description: "Tracing and debugging agent runs." }
];

const BUILDS: Record<string, string[]> = {
  harnesses: ["an open agent harness with pluggable tool loops", "a retry-and-recover layer for long agent runs", "a minimal harness for coding agents"],
  orchestration: ["a planner that splits work across specialist agents", "a message bus for agents working across teams", "a supervisor pattern for agent swarms"],
  "tool-protocols": ["a tool registry agents can query at runtime", "adapters that expose internal APIs as agent tools", "a context protocol server for shared documents"],
  evals: ["a benchmark for multi-step tool-using agents", "regression tests for agent trajectories", "an eval harness that replays real agent sessions"],
  sandboxes: ["ephemeral sandboxes for agent-written code", "a permission layer for agents touching file systems", "microVM isolation for untrusted agent actions"],
  memory: ["a long-term memory store for agents", "retrieval tuned for agent scratchpads", "a shared memory layer for agent teams"],
  inference: ["a router that picks models per agent step", "batching infrastructure for agent workloads", "a cache that cuts repeated agent calls"],
  observability: ["tracing for nested agent calls", "a debugger that replays agent decisions", "cost and latency dashboards for agent runs"]
};

export function buildSeed(seed = 7): GraphMap {
  const rnd = mulberry32(seed);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const chance = (p: number) => rnd() < p;
  const conf = (): Confidence => {
    const r = rnd();
    return r < 0.55 ? "high" : r < 0.85 ? "medium" : "low";
  };

  const sources: Source[] = [];
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const usedHandles = new Set<string>();
  let srcN = 0;
  let edgeN = 0;
  let projN = 0;

  const date = (monthBack: number) => {
    const d = new Date(Date.UTC(2026, 9, 28));
    d.setUTCDate(d.getUTCDate() - Math.floor(monthBack * 30 + rnd() * 25));
    return d.toISOString().slice(0, 10);
  };

  function addSource(kind: "post" | "project" | "paper" | "page", handle: string, title: string): string {
    srcN++;
    const id = `src-${String(srcN).padStart(3, "0")}`;
    const url =
      kind === "post" ? `https://example.com/x/${handle}/status/${100000 + srcN * 37}` :
      kind === "project" ? `https://example.com/projects/${handle}-${srcN}` :
      kind === "paper" ? `https://example.com/papers/${srcN}` :
      `https://example.com/pages/${handle}`;
    sources.push({ id, url, title, publisher: kind === "post" ? "X (sample)" : "example.com", date: date(rnd() * 10), accessed: "2026-11-01" });
    return id;
  }

  function uniqueHandle(base: string) {
    let h = base.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    h = `sample_${h}`.slice(0, 15);
    let out = h;
    let i = 2;
    while (usedHandles.has(out)) out = `${h.slice(0, 13)}${i++}`;
    usedHandles.add(out);
    return out;
  }

  function makeNode(type: NodeType, name: string, topic: string, extraTopics: string[]): Node {
    const handle = uniqueHandle(name);
    const what = pick(BUILDS[topic]);
    const summary =
      type === "person" ? `Builds ${what}.` :
      type === "organization" ? `Team building ${what}.` :
      `Agent that runs on ${what.replace(/^an? /, "")}.`;
    const inclusion = addSource(type === "person" ? "post" : "page", handle, `[Sample] ${name}: ${what}`);
    const projects: Project[] = [];
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
    const c = conf();
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
      topics: Array.from(new Set([topic, ...extraTopics])),
      projects,
      inclusion_source_ids: [inclusion],
      claims: [{ field: "summary", source_ids: [inclusion] }],
      confidence: c,
      confidence_note: c === "low" ? "Only one public source so far." : null,
      added_at: date(rnd() * 4)
    };
  }

  function edge(source: string, target: string, kind: EdgeKind, label: string, extra: Partial<Edge> = {}): Edge {
    edgeN++;
    const srcHandle = source;
    const evidence =
      kind === "shared_topic" ? [] :
      kind === "engagement" ? [addSource("post", srcHandle, `[Sample] @${source} replied to @${target}`)] :
      [addSource(kind === "collaboration" ? "paper" : "page", srcHandle, `[Sample] Evidence: ${source} ${label} ${target}`)];
    const e: Edge = {
      id: `e-${String(edgeN).padStart(3, "0")}`,
      source,
      target,
      kind,
      label,
      detail: null,
      period: null,
      source_ids: evidence,
      confidence: kind === "shared_topic" ? null : conf(),
      note: null,
      ...extra
    };
    edges.push(e);
    return e;
  }

  const personName = () => `${pick(FIRST)} ${pick(LAST)}`;
  const topicIds = TOPICS.map((t) => t.id);

  // Communities: an organization, its people, the agents it runs.
  const orgIds: string[] = [];
  const people: Node[] = [];
  const agents: Node[] = [];
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

  // Independent builders: people with their own small worlds of agents (deep leaves).
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
      // Some agents have their own tiny satellite worlds (sub-agents).
      if (chance(0.35)) {
        const sub = makeNode("agent", `${ag.name} sub-${pick(AGENT_WORDS).toLowerCase()}`, topic, []);
        sub.notes = `Sub-agent spawned by ${ag.name}.`;
        nodes.push(sub);
        agents.push(sub);
        edge(ag.id, sub.id, "built", "spawns");
      }
    }
  }

  // Engagement: X reply / quote discovery paths across the network.
  const engagers = [...people, ...agents];
  for (let i = 0; i < 70; i++) {
    const a = pick(engagers);
    const b = pick(chance(0.8) ? people : engagers);
    if (a.id === b.id) continue;
    const verb = pick(["replied to", "quoted"]);
    edge(a.id, b.id, "engagement", verb, { detail: `Discovered when @${a.handle} ${verb} @${b.handle} about ${pick(TOPICS).label.toLowerCase()}.` });
    if (!a.notes) a.notes = `Found via ${verb === "quoted" ? "a quote" : "a reply"} involving @${b.handle}.`;
  }

  // Sourced collaborations, some between pairs that also engage (separate edge records).
  for (let i = 0; i < 16; i++) {
    const a = pick(people);
    const orgId = pick(orgIds);
    const b = chance(0.3) ? nodes.find((n) => n.id === orgId)! : pick(people);
    if (a.id === b.id) continue;
    edge(a.id, b.id, "collaboration", pick(["co-built", "co-authored", "co-maintains"]), { detail: "[Sample] Joint project or paper." });
    if (chance(0.5)) edge(a.id, b.id, "engagement", "replied to", { detail: `Discovered when @${a.handle} replied to @${b.handle}.` });
  }

  // A few explicit shared-topic links (curated, no direct evidence).
  for (let i = 0; i < 6; i++) {
    const a = pick(people);
    const b = pick(people);
    if (a.id === b.id) continue;
    const shared = a.topics.find((t) => b.topics.includes(t)) ?? a.primary_topic!;
    edge(a.id, b.id, "shared_topic", "both work on", { topic_ids: [shared], note: "[Sample] Topic overlap judged from each account's own sources." });
  }

  // Legacy "cluster" edges retained from older data (meaning not yet defined).
  for (let i = 0; i < 3; i++) {
    const a = pick(agents);
    const b = pick(agents);
    if (a.id !== b.id) edge(a.id, b.id, "cluster", "cluster (legacy)", { note: "Legacy cluster link. Its meaning is not defined yet." });
  }

  // Records that are kept in the JSON but must NOT appear as connected map nodes.
  for (let i = 0; i < 5; i++) {
    const t: NodeType = (["person", "organization", "agent"] as NodeType[])[i % 3];
    const n = makeNode(t, t === "person" ? personName() : t === "organization" ? `${pick(LAST)} Labs` : `Lone ${pick(AGENT_WORDS)}`, pick(topicIds), []);
    n.notes = "Added from the seed list; no connections found yet.";
    nodes.push(n);
  }

  // Deliberate data issues so the data report has something real to show.
  const orphanAgent = makeNode("agent", "Unlisted Skiff", "harnesses", []);
  orphanAgent.profiles.x = null; // agents must have an X profile
  nodes.push(orphanAgent);
  edge(orphanAgent.id, pick(people).id, "engagement", "replied to");
  edge(pick(people).id, "sample_ghost", "engagement", "replied to"); // target missing
  const bad = edge(pick(people).id, pick(orgIds), "affiliation", "works at");
  bad.source_ids.push("src-missing");

  const seeds = orgIds.slice(0, 4);
  return {
    meta: {
      name: "Agent infrastructure map (sample)",
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

/** A small batch of new fake accounts wired to existing ones, to show live re-layout. */
export function buildBatch(existing: GraphMap, batchNo: number): Pick<GraphMap, "nodes" | "edges" | "sources"> {
  const rnd = mulberry32(1000 + batchNo);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const connected = new Set<string>();
  existing.edges.forEach((e) => { connected.add(e.source); connected.add(e.target); });
  const anchors = existing.nodes.filter((n) => connected.has(n.id));
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const sources: Source[] = [];
  const count = 6 + Math.floor(rnd() * 4);
  for (let i = 0; i < count; i++) {
    const type: NodeType = rnd() < 0.5 ? "person" : rnd() < 0.6 ? "agent" : "organization";
    const base = type === "person" ? `${pick(FIRST)} ${pick(LAST)}` : type === "agent" ? `${pick(AGENT_WORDS)}-${Math.floor(rnd() * 900 + 100)}` : `${pick(LAST)} ${pick(["Labs", "Systems", "Works"])}`;
    const id = `sample_b${batchNo}_${i}`;
    const srcId = `src-b${batchNo}-${i}`;
    const anchor = pick(anchors);
    sources.push({ id: srcId, url: `https://example.com/x/${id}/status/${batchNo}${i}`, title: `[Sample] @${id} replied to @${anchor.handle ?? anchor.id}`, publisher: "X (sample)", date: "2026-11-06" });
    const topic = anchor.primary_topic ?? existing.topics[0].id;
    nodes.push({
      id, type, handle: id, name: base,
      profiles: { x: `https://example.com/x/${id}`, linkedin: null },
      summary: `Newly added in research batch ${batchNo}. Builds ${pick(BUILDS[topic] ?? ["agent tooling"])}.`,
      notes: `Batch ${batchNo}: discovered via @${anchor.handle ?? anchor.id}.`,
      primary_topic: topic, topics: [topic], projects: [],
      inclusion_source_ids: [srcId], claims: [{ field: "summary", source_ids: [srcId] }],
      confidence: "medium", confidence_note: null, added_at: "2026-11-06"
    });
    edges.push({ id: `e-b${batchNo}-${i}`, source: id, target: anchor.id, kind: "engagement", label: "replied to", detail: `Discovered when @${id} replied to @${anchor.handle ?? anchor.id}.`, source_ids: [srcId], confidence: "medium", note: null });
    if (i > 0 && rnd() < 0.4) {
      const sid = `src-b${batchNo}-${i}-c`;
      sources.push({ id: sid, url: `https://example.com/projects/b${batchNo}-${i}`, title: "[Sample] Joint project page", publisher: "example.com" });
      edges.push({ id: `e-b${batchNo}-${i}-c`, source: id, target: nodes[i - 1].id, kind: "collaboration", label: "co-built", source_ids: [sid], confidence: "medium", note: null });
    }
  }
  return { nodes, edges, sources };
}
