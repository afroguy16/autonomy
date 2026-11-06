import { analyze, mergeGraph, normalizeGraph, type Analysis } from "./normalize";
import { MapScene, escapeHtml as esc, type ViewState } from "./scene";
import { EDGE_STYLE, NODE_STYLE } from "./theme";
import { EDGE_KINDS, NODE_TYPES, type Edge, type EdgeKind, type GraphMap, type Node, type NodeType, } from "./types";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const initialGraph = await (window as any).__AUTONOMY_GRAPH_LOAD__;
let graph: GraphMap = normalizeGraph(initialGraph as Record<string, any>);
let A: Analysis = analyze(graph);
let onMap = new Set(A.mapNodeIds);

const st = {
  selectedNode: null as string | null,
  selectedEdge: null as string | null,
  edgeFromNode: null as string | null,
  query: "",
  types: new Set<NodeType>(),
  kinds: new Set<EdgeKind>(EDGE_KINDS),
  topics: new Set<string>(),
  hideFiltered: false,
  sort: "links",
  resultIdx: 0
};

const scene = new MapScene($("stage"), $<HTMLCanvasElement>("map"), $("labels"), $("tooltip"), {
  onPickNode: (id) => selectNode(id, { fly: true }),
  onPickEdge: (id) => selectEdge(id, { fly: false }),
  onPickNothing: () => clearSelection(),
  onEscape: () => clearSelection(),
  onFrame: (info) => {
    frameUi(info.depth, info.moving);
    // Reveal the app only after the scene has rendered its first real frame.
    if (info.ready) (window as any).finishMapBoot?.();
  },
  onHint: (t) => { $("hint").textContent = t; }
});

// ---------------- derived view ----------------

const nodeName = (id: string) => { const n = A.nodeById.get(id); return n?.name ?? n?.handle ?? id; };
const filtersActive = () => st.types.size > 0 || st.topics.size > 0 || st.kinds.size < EDGE_KINDS.length;
function nodeMatch(id: string) {
  const n = A.nodeById.get(id);
  if (!n) return false;
  if (st.types.size && !st.types.has(n.type)) return false;
  if (st.topics.size && !n.topics.some((t) => st.topics.has(t))) return false;
  return true;
}
function edgeMatch(e: Edge) {
  if (!st.kinds.has(e.kind)) return false;
  return nodeMatch(e.source) && nodeMatch(e.target);
}
function focusSet() {
  const s = new Set<string>();
  if (st.selectedEdge) {
    const e = A.drawnEdges.find((x) => x.id === st.selectedEdge);
    if (e) { s.add(e.source); s.add(e.target); }
  } else if (st.selectedNode && onMap.has(st.selectedNode)) {
    s.add(st.selectedNode);
    for (const e of A.edgesByNode.get(st.selectedNode) ?? []) { s.add(e.source); s.add(e.target); }
  }
  return s;
}

type Hit = { id: string; score: number; field: string; snippet: string };
function search(qRaw: string): Hit[] {
  const q = qRaw.trim().toLowerCase().replace(/^@/, "");
  if (q.length < 2) return [];
  const hits: Hit[] = [];
  for (const n of A.nodeById.values()) {
    const fields: [string, string, number][] = [
      ["name", n.name ?? "", 100], ["handle", n.handle ?? n.id, 100], ["notes", n.notes ?? "", 45],
      ["summary", n.summary ?? "", 35], ["project", n.projects.map((p) => p.name).join(" · "), 40],
      ["topic", n.topics.map((t) => A.topicLabel.get(t) ?? t).join(" · "), 20]
    ];
    let best: Hit | null = null;
    for (const [field, text, w] of fields) {
      const i = text.toLowerCase().indexOf(q);
      if (i < 0) continue;
      const wordStart = i === 0 || /[\s@_\-·]/.test(text[i - 1]);
      const score = w * (i === 0 ? 1.6 : wordStart ? 1.25 : 1);
      if (!best || score > best.score) best = { id: n.id, score, field, snippet: highlight(text, i, q.length) };
    }
    if (best) { best.score += Math.min(10, A.degree.get(n.id) ?? 0) * 0.5 - (onMap.has(n.id) ? 0 : 5); hits.push(best); }
  }
  return hits.sort((a, b) => b.score - a.score);
}
function highlight(text: string, i: number, len: number) {
  const s = Math.max(0, i - 28), e = Math.min(text.length, i + len + 40);
  return `${s > 0 ? "…" : ""}${esc(text.slice(s, i))}<mark>${esc(text.slice(i, i + len))}</mark>${esc(text.slice(i + len, e))}${e < text.length ? "…" : ""}`;
}
let lastHits: Hit[] = [];

function pushView() {
  const view: ViewState = {
    selectedNode: st.selectedNode && onMap.has(st.selectedNode) ? st.selectedNode : null,
    selectedEdge: st.selectedEdge,
    focus: focusSet(),
    matches: new Set(lastHits.filter((h) => onMap.has(h.id)).slice(0, 40).map((h) => h.id)),
    nodeMatch, edgeMatch,
    filtersActive: filtersActive(),
    hideFiltered: st.hideFiltered,
    colorKinds: st.kinds.size < EDGE_KINDS.length
  };
  scene.setView(view);
  saveView();
}

// ---------------- selection ----------------

function announce(t: string) { $("live").textContent = t; }

function selectNode(id: string, opts: { fly: boolean }) {
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

function selectEdge(id: string, opts: { fly: boolean }) {
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

// ---------------- rendering helpers ----------------

const shape = (t: NodeType) => `<span class="shape ${t}" aria-hidden="true"></span>`;
function edgeSwatch(kind: EdgeKind, w = 30) {
  const s = EDGE_STYLE[kind];
  const dash = kind === "interaction" ? 'stroke-dasharray="5 3"' : kind === "shared_topic" || kind === "bridge" ? 'stroke-dasharray="1.5 3.5" stroke-linecap="round"' : "";
  return `<svg class="edge-swatch" width="${w}" height="8" viewBox="0 0 ${w} 8" aria-hidden="true"><line x1="1" y1="4" x2="${w - 1}" y2="4" stroke="${s.css}" stroke-width="${Math.max(1.2, s.width)}" ${dash}/></svg>`;
}

function renderDetails() {
  const panel = $("details");
  if (st.selectedEdge) {
    const e = A.drawnEdges.find((x) => x.id === st.selectedEdge);
    if (e) { panel.hidden = false; $("detailsBody").innerHTML = edgeHtml(e); return; }
  }
  const n = st.selectedNode ? A.nodeById.get(st.selectedNode) : null;
  if (!n) { panel.hidden = true; $("detailsBody").innerHTML = ""; return; }
  panel.hidden = false;
  $("detailsBody").innerHTML = nodeHtml(n);
}

const ICON = {
  close: `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  locate: `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>`,
  copy: `<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
  ext: `<svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  back: `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};
const prop = (label: string, value: string) => value ? `<dt>${label}</dt><dd>${value}</dd>` : "";

/** Linked sources behind notes or connections, newest first. */
function timeline(ids: { id: string; why: string }[]) {
  const seen = new Map<string, string[]>();
  ids.forEach(({ id, why }) => { if (!seen.has(id)) seen.set(id, []); if (!seen.get(id)!.includes(why)) seen.get(id)!.push(why); });
  const rows = Array.from(seen.entries()).map(([id, why]) => ({ id, why, src: A.sourceById.get(id) }));
  rows.sort((a, b) => (b.src?.date ?? "").localeCompare(a.src?.date ?? ""));
  if (!rows.length) return `<p class="muted small">No sources on record.</p>`;
  return `<ol class="timeline">${rows.map((r) => r.src
    ? `<li>${r.src.date ? `<span class="t-date">${esc(r.src.date)}</span>` : ""}<a href="${esc(r.src.url)}" target="_blank" rel="noopener noreferrer">${esc(r.src.title ?? r.src.url)}</a><span class="t-meta">${esc([r.src.publisher, `supports ${r.why.join(", ")}`].filter(Boolean).join(" · "))}</span></li>`
    : `<li class="missing"><span class="t-date">—</span>Missing source record “${esc(r.id)}”<span class="t-meta">supports ${esc(r.why.join(", "))}</span></li>`).join("")}</ol>`;
}

function nodeHtml(n: Node) {
  const style = NODE_STYLE[n.type];
  const off = A.offMap.find((o) => o.id === n.id);
  const x = n.profiles.x, li = n.profiles.linkedin;
  const handle = n.handle ?? n.id;
  const edges = A.edgesByNode.get(n.id) ?? [];
  const heldEdges = graph.edges.filter((e) => (e.source === n.id || e.target === n.id) && !A.drawnEdges.some((drawn) => drawn.id === e.id));
  const groups = EDGE_KINDS.map((k) => ({ k, list: edges.filter((e) => e.kind === k) })).filter((g) => g.list.length);
  const conns = groups.map((g) => `
    <div class="conn-group">
      <div class="gh">${edgeSwatch(g.k, 18)}${EDGE_STYLE[g.k].label}<span class="count">${g.list.length}</span></div>
      ${g.list.map((e) => {
        const other = e.source === n.id ? e.target : e.source;
        const o = A.nodeById.get(other)!;
        const phrase = e.source === n.id ? `${esc(e.label ?? g.k)} ${esc(nodeName(other))}` : `${esc(nodeName(other))} ${esc(e.label ?? g.k)} this account`;
        const dim = filtersActive() && !edgeMatch(e) ? " dim" : "";
        return `<div class="conn${dim}">
          <button type="button" class="main" data-act="edge" data-id="${esc(e.id)}" aria-label="Inspect relationship: ${phrase}">${shape(o.type)}<span class="t"><b>${esc(nodeName(other))}</b><span class="s">${phrase}</span></span></button>
          <button type="button" class="icon-btn sm" data-act="go" data-id="${esc(other)}" aria-label="Go to ${esc(nodeName(other))}" title="Go to ${esc(nodeName(other))}">→</button>
        </div>`;
      }).join("")}
    </div>`).join("");
  const noteSources = n.note_source_ids.map((id) => ({ id, why: "research note" }));
  const profiles = [
    x ? `<a href="${esc(x)}" target="_blank" rel="noopener noreferrer">X ${ICON.ext}</a>` : "",
    li ? `<a href="${esc(li)}" target="_blank" rel="noopener noreferrer">LinkedIn ${ICON.ext}</a>` : ""
  ].filter(Boolean).join('<span class="sep">·</span>');
  const topics = n.topics.length ? `<span class="chips">${n.topics.map((t) => `<button type="button" data-act="topic" data-id="${esc(t)}" aria-pressed="${st.topics.has(t)}">${esc(A.topicLabel.get(t) ?? t)}</button>`).join("")}</span>` : "";
  return `
  <div class="d-head">
    <div class="d-top">
      <span class="crumb">${shape(n.type)}${style.label}${graph.meta.is_sample ? ` <span class="sample">Sample</span>` : ""}</span>
      <span class="d-actions">${st.selectedNode && onMap.has(n.id) ? `<button type="button" class="icon-btn sm" data-act="locate" aria-label="Center on map" title="Center on map">${ICON.locate}</button>` : ""}<button type="button" class="icon-btn sm" data-act="close" aria-label="Close details" title="Close (Esc)">${ICON.close}</button></span>
    </div>
    <h2 class="d-name">${esc(n.name ?? handle)}</h2>
    ${n.summary ? `<p class="d-summary">${esc(n.summary)}</p>` : ""}
  </div>
  <div class="d-body">
    ${off ? `<div class="offmap"><b>Not on the map.</b> ${esc(off.reason)}. The record is kept in the data; no connection has been invented for it.</div>` : ""}
    <dl class="props">
      ${prop("Handle", `<span class="handle">@${esc(handle)}</span><button type="button" class="icon-btn xs" data-act="copy" data-id="@${esc(handle)}" aria-label="Copy handle" title="Copy handle">${ICON.copy}</button>`)}
      ${prop("Profile", profiles || `<span class="warn-text">No public profile on record</span>`)}
      ${prop("Type", `${shape(n.type)}${style.label}`)}
      ${prop("Topics", topics)}
      ${prop("Connections on map", String(edges.length))}
      ${heldEdges.length ? prop("Connections held back", String(heldEdges.length)) : ""}
    </dl>
    ${n.notes ? `<section class="d-sec"><h3>Research note</h3><div class="notes">${esc(n.notes)}${noteSources.length ? `<div class="note-citations">${noteSources.map(({ id }) => { const src = A.sourceById.get(id); return src ? `<div class="note-citation"><span class="small muted">Supporting source</span><a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.title ?? src.url)} ${ICON.ext}</a></div>` : `<div class="note-citation missing">Missing source record “${esc(id)}”</div>`; }).join("")}</div>` : `<div class="note-citations muted small">No source is attached to this note.</div>`}</div></section>` : ""}
    ${n.projects.length ? `<section class="d-sec"><h3>Projects</h3><ul class="plain">${n.projects.map((p) => `<li>${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.name)} ${ICON.ext}</a>` : `<b>${esc(p.name)}</b>`}<span class="m">${esc(p.description ?? "")}</span></li>`).join("")}</ul></section>` : ""}
    <section class="d-sec"><h3>Connections</h3>${conns || `<p class="muted small">No complete, defined connections to show.</p>`}${heldEdges.length ? `<p class="muted small">${heldEdges.length} other connection record${heldEdges.length === 1 ? " is" : "s are"} kept in the data but not drawn because a source, relationship detail, or definition is missing.</p>` : ""}</section>
  </div>`;
}

function edgeHtml(e: Edge) {
  const s = EDGE_STYLE[e.kind];
  const a = A.nodeById.get(e.source)!, b = A.nodeById.get(e.target)!;
  const pairOthers = A.drawnEdges.filter((x) => x.id !== e.id && ((x.source === e.source && x.target === e.target) || (x.source === e.target && x.target === e.source)));
  const project = e.project_id ? [a, b].flatMap((n) => n.projects).find((p) => p.id === e.project_id) : undefined;
  const explain = e.kind === "interaction"
    ? `<div class="callout interaction"><b>Discovery path, not collaboration.</b> A reply or quote on X led the research from one account to the other. On its own it does not mean they work together.</div>`
    : e.kind === "shared_topic"
      ? `<div class="callout"><b>Same area of work.</b> Both are linked to the same topic. No direct relationship between them is claimed.</div>`
      : e.kind === "cluster"
        ? `<div class="callout"><b>Legacy link.</b> Kept from older data. What a cluster link means has not been defined, so read nothing into it yet.</div>`
        : "";
  const period = e.period && (e.period.start || e.period.end) ? `${e.period.start ?? "?"} – ${e.period.end ?? "present"}` : "";
  const who = (n: Node) => `<button type="button" class="link-btn" data-act="select" data-id="${esc(n.id)}">${shape(n.type)}${esc(nodeName(n.id))}</button>`;
  return `
  <div class="d-head">
    <div class="d-top">
      <span class="crumb">${st.edgeFromNode ? `<button type="button" class="link-btn" data-act="back">${ICON.back}${esc(nodeName(st.edgeFromNode))}</button><span class="sep">/</span>` : ""}Connection${graph.meta.is_sample ? ` <span class="sample">Sample</span>` : ""}</span>
      <span class="d-actions"><button type="button" class="icon-btn sm" data-act="close" aria-label="Close details" title="Close (Esc)">${ICON.close}</button></span>
    </div>
    <h2 class="d-name sm">${esc(nodeName(a.id))} <span class="verb">${esc(e.label ?? e.kind)}</span> ${esc(nodeName(b.id))}</h2>
  </div>
  <div class="d-body">
    ${explain}
    <dl class="props">
      ${prop("Kind", `${edgeSwatch(e.kind, 18)}${s.label}`)}
      ${prop("From", who(a))}
      ${prop("To", who(b))}
      ${prop("Detail", e.detail ? esc(e.detail) : "")}
      ${prop("Period", esc(period))}
      ${prop("Project", project ? esc(project.name) : "")}
      ${prop("Topic", e.topic_ids?.length ? `<span class="chips">${e.topic_ids.map((t) => `<button type="button" data-act="topic" data-id="${esc(t)}">${esc(A.topicLabel.get(t) ?? t)}</button>`).join("")}</span>` : "")}
    </dl>
    <section class="d-sec"><h3>${e.kind === "interaction" ? "Source post" : e.kind === "affiliation" ? "Affiliation source" : "Source"}</h3>${e.source_ids.length ? timeline(e.source_ids.map((id) => ({ id, why: e.kind === "interaction" ? "reply or quote discovery path" : e.kind === "affiliation" ? `affiliation: ${e.detail ?? ""}` : "this connection" }))) : `<p class="muted small">No source link is recorded for this connection.</p>`}</section>
    ${pairOthers.length ? `<section class="d-sec"><h3>Also between these two</h3>${pairOthers.map((x) => `<div class="conn"><button type="button" class="main" data-act="edge" data-id="${esc(x.id)}">${edgeSwatch(x.kind, 18)}<span class="t"><b>${EDGE_STYLE[x.kind].label}</b><span class="s">${esc(nodeName(x.source))} ${esc(x.label ?? x.kind)} ${esc(nodeName(x.target))}</span></span></button></div>`).join("")}<p class="small muted">Each is a separate record with its own source and its own line on the map.</p></section>` : ""}
  </div>`;
}

$("details").addEventListener("click", (ev) => {
  const btn = (ev.target as HTMLElement).closest("[data-act]") as HTMLElement | null;
  if (!btn) return;
  const id = btn.dataset.id ?? "";
  switch (btn.dataset.act) {
    case "close": clearSelection(); break;
    case "go": selectNode(id, { fly: true }); break;
    case "select": selectNode(id, { fly: true }); break;
    case "edge": selectEdge(id, { fly: true }); break;
    case "back": if (st.edgeFromNode) selectNode(st.edgeFromNode, { fly: true }); break;
    case "locate": if (st.selectedNode) scene.focusNode(st.selectedNode); break;
    case "topic": toggleSet(st.topics, id); syncFilterInputs(); onFiltersChanged(); renderDetails(); break;
    case "copy": navigator.clipboard?.writeText(id).then(() => toast(`Copied ${id}`), () => toast("Copy failed")); break;
  }
});

// ---------------- command menu (⌘K) ----------------

type Cmd = { label: string; group: string; keys?: string; run: () => void };
type PItem = { kind: "account"; hit: Hit } | { kind: "cmd"; cmd: Cmd };
const palette = $("palette");
const pq = $<HTMLInputElement>("pq");
const plist = $("plist");
let pItems: PItem[] = [];
let pIdx = 0;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
$("kbdHint").textContent = isMac ? "⌘K" : "Ctrl K";

function commands(): Cmd[] {
  const power = document.body.classList.contains("power");
  const setTypes = (t: NodeType) => () => { st.types = new Set([t]); syncFilterInputs(); onFiltersChanged(); };
  return [
    { group: "View", label: "Go to wide view", keys: "0", run: () => scene.overview() },
    { group: "View", label: "Reset view (wide view, clear selection and filters)", run: () => resetView() },
    { group: "View", label: power ? "Exit power view" : "Power view: just the map", keys: "P", run: () => setPower(!power) },
    { group: "View", label: scene.showNames ? "Hide names on the map" : "Show names on the map", run: () => toggleNames() },
    { group: "View", label: $("minimapWrap").hidden ? "Show minimap" : "Hide minimap", run: () => toggleMinimap() },
    { group: "View", label: "Show legend", keys: "?", run: () => toggleLegend(true) },
    { group: "Filter", label: "Show only people", run: setTypes("person") },
    { group: "Filter", label: "Show only organizations", run: setTypes("organization") },
    { group: "Filter", label: "Show only agents", run: setTypes("agent") },
    { group: "Filter", label: "Hide interaction lines (discovery paths)", run: () => { st.kinds.delete("interaction"); syncFilterInputs(); onFiltersChanged(); } },
    { group: "Filter", label: "Clear filters", run: clearFilters },
    { group: "Open", label: "Open filters", run: () => openDrawer("filters") },
    { group: "Open", label: "Open account list", run: () => openDrawer("list") },
    { group: "Open", label: "Open data report", run: () => { renderReport(); $<HTMLDialogElement>("report").showModal(); } },
    { group: "Data", label: "Load a JSON file…", run: () => $("fileIn").click() }
  ];
}

function renderPalette() {
  const query = pq.value.trim();
  st.query = query;
  lastHits = search(query);
  const accounts = query.length >= 2 ? [...lastHits.filter((h) => onMap.has(h.id)), ...lastHits.filter((h) => !onMap.has(h.id))].slice(0, 8) : [];
  const ql = query.toLowerCase();
  const cmds = commands().filter((c) => !ql || c.label.toLowerCase().includes(ql) || c.group.toLowerCase().includes(ql));
  pItems = [...accounts.map((hit) => ({ kind: "account" as const, hit })), ...cmds.map((cmd) => ({ kind: "cmd" as const, cmd }))];
  pIdx = Math.min(pIdx, Math.max(0, pItems.length - 1));
  const fieldLabel: Record<string, string> = { notes: "notes", summary: "summary", project: "project", topic: "topic" };
  let html = "";
  let lastGroup = "";
  pItems.forEach((it, i) => {
    const group = it.kind === "account" ? (onMap.has(it.hit.id) ? "Accounts" : "Not on the map") : it.cmd.group;
    if (group !== lastGroup) { html += `<div class="p-group">${esc(group)}</div>`; lastGroup = group; }
    if (it.kind === "account") {
      const n = A.nodeById.get(it.hit.id)!;
      const extra = fieldLabel[it.hit.field] ? `<span class="p-meta">in ${fieldLabel[it.hit.field]}: ${it.hit.snippet}</span>` : `<span class="p-meta">@${esc(n.handle ?? n.id)}</span>`;
      html += `<div class="p-item" role="option" id="p-${i}" data-i="${i}" aria-selected="${i === pIdx}">${shape(n.type)}<span class="p-label">${esc(n.name ?? n.id)}</span>${extra}<span class="p-type">${NODE_STYLE[n.type].label}</span></div>`;
    } else {
      html += `<div class="p-item" role="option" id="p-${i}" data-i="${i}" aria-selected="${i === pIdx}"><span class="p-cmd-icon" aria-hidden="true">›</span><span class="p-label">${esc(it.cmd.label)}</span>${it.cmd.keys ? `<kbd>${esc(it.cmd.keys)}</kbd>` : ""}</div>`;
    }
  });
  plist.innerHTML = html || `<div class="p-empty">Nothing matches “${esc(query)}”.</div>`;
  pq.setAttribute("aria-activedescendant", pItems.length ? `p-${pIdx}` : "");
  plist.querySelector(`#p-${pIdx}`)?.scrollIntoView({ block: "nearest" });
  pushView();
  renderList();
}
function openPalette(prefill = "") {
  palette.hidden = false;
  pq.value = prefill;
  pIdx = 0;
  renderPalette();
  pq.focus();
}
function closePalette() {
  if (palette.hidden) return;
  palette.hidden = true;
  st.query = "";
  lastHits = [];
  pushView();
  renderList();
  $("map").focus();
}
function runItem(i: number) {
  const it = pItems[i];
  if (!it) return;
  closePalette();
  if (it.kind === "account") selectNode(it.hit.id, { fly: true });
  else it.cmd.run();
}
pq.addEventListener("input", () => { pIdx = 0; renderPalette(); });
pq.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { pIdx = Math.min(pItems.length - 1, pIdx + 1); renderPalette(); e.preventDefault(); }
  else if (e.key === "ArrowUp") { pIdx = Math.max(0, pIdx - 1); renderPalette(); e.preventDefault(); }
  else if (e.key === "Enter") { runItem(pIdx); e.preventDefault(); }
  else if (e.key === "Escape") { closePalette(); e.preventDefault(); }
});
plist.addEventListener("mousemove", (e) => {
  const el = (e.target as HTMLElement).closest(".p-item") as HTMLElement | null;
  if (el && Number(el.dataset.i) !== pIdx) { pIdx = Number(el.dataset.i); plist.querySelectorAll(".p-item").forEach((x) => x.setAttribute("aria-selected", String(x === el))); }
});
plist.addEventListener("click", (e) => { const el = (e.target as HTMLElement).closest(".p-item") as HTMLElement | null; if (el) runItem(Number(el.dataset.i)); });
palette.addEventListener("mousedown", (e) => { if (e.target === palette) closePalette(); });
$("openPalette").addEventListener("click", () => openPalette());
document.addEventListener("keydown", (e) => {
  const tag = (document.activeElement?.tagName ?? "").toLowerCase();
  const typing = tag === "input" || tag === "select" || tag === "textarea";
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (palette.hidden) openPalette(); else closePalette(); return; }
  if (typing) return;
  if (e.key === "/") { e.preventDefault(); openPalette(); }
  else if (e.key === "?") { e.preventDefault(); toggleLegend(); }
});

// ---------------- filters ----------------

function toggleSet<T>(s: Set<T>, v: T) { if (s.has(v)) s.delete(v); else s.add(v); }
function buildFilters() {
  const typeCount = (t: NodeType) => A.mapNodeIds.filter((id) => A.nodeById.get(id)!.type === t).length;
  $("fTypes").innerHTML = NODE_TYPES.map((t) => `<label class="row"><input type="checkbox" data-f="type" value="${t}">${shape(t)}${NODE_STYLE[t].label}<span class="count">${typeCount(t)}</span></label>`).join("");
  $("fKinds").innerHTML = EDGE_KINDS.map((k) => `<label class="row"><input type="checkbox" data-f="kind" value="${k}">${edgeSwatch(k, 26)}${EDGE_STYLE[k].label}<span class="count">${A.drawnEdges.filter((e) => e.kind === k).length}</span></label>`).join("");
  const topicCount = (t: string) => A.mapNodeIds.filter((id) => A.nodeById.get(id)!.topics.includes(t)).length;
  $("fTopics").innerHTML = graph.topics.map((t) => `<label class="row" title="${esc(t.description ?? "")}"><input type="checkbox" data-f="topic" value="${esc(t.id)}">${esc(t.label)}<span class="count">${topicCount(t.id)}</span></label>`).join("");
  syncFilterInputs();
}
function syncFilterInputs() {
  document.querySelectorAll<HTMLInputElement>("#filters input[data-f]").forEach((i) => {
    const v = i.value;
    i.checked = i.dataset.f === "type" ? st.types.has(v as NodeType) : i.dataset.f === "kind" ? st.kinds.has(v as EdgeKind) : st.topics.has(v);
  });
  $<HTMLInputElement>("fHide").checked = st.hideFiltered;
}
$("filters").addEventListener("change", (e) => {
  const i = e.target as HTMLInputElement;
  if (i.dataset.f === "type") toggleSet(st.types, i.value as NodeType);
  else if (i.dataset.f === "kind") toggleSet(st.kinds, i.value as EdgeKind);
  else if (i.dataset.f === "topic") toggleSet(st.topics, i.value);
  else if (i.id === "fHide") st.hideFiltered = i.checked;
  onFiltersChanged();
});
function clearFilters() {
  st.types.clear(); st.topics.clear(); st.kinds = new Set(EDGE_KINDS); st.hideFiltered = false;
  syncFilterInputs(); onFiltersChanged();
}
$("clearFilters").addEventListener("click", clearFilters);
function onFiltersChanged() {
  const active = filtersActive();
  const n = st.types.size + st.topics.size + (EDGE_KINDS.length - st.kinds.size);
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

// ---------------- list (accessible alternative) ----------------

function renderList() {
  if ($("list").hidden) return;
  const query = st.query.trim().length >= 2 ? new Set(lastHits.map((h) => h.id)) : null;
  let ids = A.mapNodeIds.filter((id) => (!query || query.has(id)) && (!filtersActive() || nodeMatch(id)));
  const nm = (id: string) => nodeName(id).toLowerCase();
  ids.sort(st.sort === "name" ? (a, b) => nm(a).localeCompare(nm(b)) : st.sort === "type" ? (a, b) => A.nodeById.get(a)!.type.localeCompare(A.nodeById.get(b)!.type) || nm(a).localeCompare(nm(b)) : (a, b) => (A.degree.get(b) ?? 0) - (A.degree.get(a) ?? 0));
  const off = A.offMap.filter((o) => (!query || query.has(o.id)) && (!filtersActive() || nodeMatch(o.id)));
  const row = (id: string, offMap = false) => {
    const n = A.nodeById.get(id)!;
    const d = A.degree.get(id) ?? 0;
    const sub = offMap ? `${NODE_STYLE[n.type].label} · not on the map` : `${NODE_STYLE[n.type].label} · @${esc(n.handle ?? n.id)} · ${d} connection${d === 1 ? "" : "s"}`;
    return `<li><button type="button" data-id="${esc(id)}" aria-current="${st.selectedNode === id}"${offMap ? ' class="dim"' : ""}>${shape(n.type)}<span><span>${esc(nodeName(id))}</span><span class="sub">${sub}</span></span></button></li>`;
  };
  $("listItems").innerHTML = ids.map((id) => row(id)).join("") + (off.length ? `<li class="sec">Not on the map · ${off.length}</li>${off.map((o) => row(o.id, true)).join("")}` : "");
  $("listCount").textContent = `${ids.length} on the map${query ? " match the search" : ""}`;
}
$("listItems").addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest("button[data-id]") as HTMLElement | null; if (b) selectNode(b.dataset.id!, { fly: true }); });
$<HTMLSelectElement>("sort").addEventListener("change", (e) => { st.sort = (e.target as HTMLSelectElement).value; renderList(); });

function openDrawer(which: "filters" | "list") { if ($(which).hidden) toggleDrawer(which); }
function toggleDrawer(which: "filters" | "list") {
  const el = $(which), other = $(which === "filters" ? "list" : "filters");
  const open = el.hidden;
  el.hidden = !open;
  if (open) other.hidden = true;
  $("btnFilters").setAttribute("aria-expanded", String(!$("filters").hidden));
  $("btnList").setAttribute("aria-expanded", String(!$("list").hidden));
  if (which === "list" && open) renderList();
  if (open) (el.querySelector("input,select,button") as HTMLElement | null)?.focus();
}
$("btnFilters").addEventListener("click", () => toggleDrawer("filters"));
$("btnList").addEventListener("click", () => toggleDrawer("list"));
$("closeList").addEventListener("click", () => toggleDrawer("list"));

// ---------------- legend, counts, report ----------------

function renderLegend() {
  $("legendNodes").innerHTML = NODE_TYPES.map((t) => `<li>${shape(t)}${NODE_STYLE[t].label} <span class="small muted">(${NODE_STYLE[t].shape.toLowerCase()})</span></li>`).join("");
  const present = new Set(A.drawnEdges.map((e) => e.kind));
  $("legendEdges").innerHTML = EDGE_KINDS.filter((k) => present.has(k)).map((k) => `<li title="${esc(EDGE_STYLE[k].means)}">${edgeSwatch(k)}<span>${EDGE_STYLE[k].label}${k === "interaction" ? ' <span class="muted">— reply/quote path, not collaboration</span>' : k === "shared_topic" ? ' <span class="muted">— no direct link</span>' : ""}</span></li>`).join("");
}
function setPower(on: boolean) {
  document.body.classList.toggle("power", on);
  $("exitPower").hidden = !on;
  $("resetPower").hidden = !on;
  $("btnPower").setAttribute("aria-pressed", String(on));
  if (on) { closePalette(); $("filters").hidden = true; $("list").hidden = true; }
  saveView();
  announce(on ? "Power view: only the map is shown. Press P to show the controls." : "Controls shown.");
  ($(on ? "map" : "btnPower") as HTMLElement).focus();
}
/** Start fresh: wide view, nothing selected, no filters, names and minimap off.
 *  Keeps whether the controls are shown, and forgets the remembered view. */
function resetView() {
  closePalette();
  clearSelection();
  clearFilters();
  toggleNames(false);
  toggleMinimap(false);
  toggleLegend(false);
  $("filters").hidden = true; $("list").hidden = true;
  $("btnFilters").setAttribute("aria-expanded", "false");
  $("btnList").setAttribute("aria-expanded", "false");
  scene.overview();
  scene.playIntro();
  try { localStorage.removeItem(VIEW_KEY); } catch { /* storage unavailable */ }
  saveView();
  toast("View reset");
  announce("View reset: wide view, nothing selected, no filters.");
}
$("btnReset").addEventListener("click", resetView);
$("resetPower").addEventListener("click", resetView);
$("btnPower").addEventListener("click", () => setPower(true));
$("exitPower").addEventListener("click", () => setPower(false));
document.addEventListener("keydown", (e) => {
  const tag = (document.activeElement?.tagName ?? "").toLowerCase();
  if ((e.key === "p" || e.key === "P") && !e.metaKey && !e.ctrlKey && !e.altKey && tag !== "input" && tag !== "select" && tag !== "textarea") {
    setPower(!document.body.classList.contains("power"));
  }
});

function toggleNames(force?: boolean) {
  const on = force ?? !scene.showNames;
  scene.setShowNames(on);
  $("namesBtn").setAttribute("aria-pressed", String(on));
  $("namesBtn").setAttribute("aria-label", on ? "Hide names on the map" : "Show names on the map");
  announce(on ? "Names shown on the map." : "Names hidden; hover or select an account to see its name.");
  saveView();
}
function toggleLegend(force?: boolean) {
  const open = force ?? $("legend").hidden;
  $("legend").hidden = !open;
  $("legendBtn").setAttribute("aria-expanded", String(open));
}
function toggleMinimap(force?: boolean) {
  const show = force ?? $("minimapWrap").hidden;
  $("minimapWrap").hidden = !show;
  $("miniBtn").setAttribute("aria-pressed", String(show));
  $("miniBtn").setAttribute("aria-label", show ? "Hide minimap" : "Show minimap");
  if (show) drawMinimap();
  saveView();
}
$("namesBtn").addEventListener("click", () => toggleNames());
$("miniBtn").addEventListener("click", () => toggleMinimap());
$("legendBtn").addEventListener("click", () => toggleLegend());
$("legendClose").addEventListener("click", () => toggleLegend(false));

function renderCounts() {
  $("counts").textContent = `${A.mapNodeIds.length} accounts · ${A.drawnEdges.length} connections`;
  $("sampleFlag").hidden = !graph.meta.is_sample;
  const errs = A.issues.filter((i) => i.level !== "info").length;
  $("issueBadge").hidden = errs === 0;
  $("issueBadge").textContent = String(errs);
}

function renderReport() {
  const lvls: ["error" | "warning" | "info", string][] = [["error", "Errors"], ["warning", "Warnings"], ["info", "Notes"]];
  const interactionsNeedingSources = graph.edges.filter((e) => e.kind === "interaction" && e.incomplete).length;
  const affiliationsNeedingDetails = graph.edges.filter((e) => e.kind === "affiliation" && e.incomplete && e.missing?.includes("detail")).length;
  const affiliationsNeedingSources = graph.edges.filter((e) => e.kind === "affiliation" && e.incomplete && e.missing?.includes("source")).length;
  const clusters = graph.edges.filter((e) => e.kind === "cluster").length;
  const bridges = graph.edges.filter((e) => e.kind === "bridge").length;
  const rationaleNotes = graph.nodes.filter((n) => n.notes.includes("[selection rationale needed]")).length;
  $("reportBody").innerHTML = `
    <div class="stats">
      <div><b>${graph.nodes.length}</b><span class="small muted">records in the data</span></div>
      <div><b>${A.mapNodeIds.length}</b><span class="small muted">accounts on the map</span></div>
      <div><b>${A.offMap.length}</b><span class="small muted">kept, not drawn</span></div>
      <div><b>${A.drawnEdges.length}</b><span class="small muted">connections drawn</span></div>
    </div>
    <h3>Not drawn on the map</h3>
    <p class="small muted">Every account on the map links to at least one other. These records stay in the data; no edges were invented for them.</p>
    <ul>${A.offMap.map((o) => `<li><button type="button" class="link" data-open="${esc(o.id)}">${esc(nodeName(o.id))}</button> — ${esc(o.reason)}</li>`).join("") || "<li>None</li>"}</ul>
    <h3>Research gaps and retained links</h3>
    <ul>
      <li>${rationaleNotes} researcher notes are tagged <code>[selection rationale needed]</code>.</li>
      <li>${interactionsNeedingSources} interactions need a reply or quote source.</li>
      <li>${affiliationsNeedingDetails} affiliations need a specific relationship detail; ${affiliationsNeedingSources} need a source.</li>
      <li>${clusters} cluster and ${bridges} bridge records are preserved in the data and not drawn until their meaning is defined.</li>
    </ul>
    ${lvls.map(([l, label]) => { const list = A.issues.filter((i) => i.level === l); return list.length ? `<h3>${label}</h3><ul>${list.map((i) => `<li><span class="lvl-${l}">${l}</span> ${esc(i.message)}</li>`).join("")}</ul>` : ""; }).join("")}
    <h3>Data shape</h3>
    <p class="small">Data version ${esc(String(graph.meta.version))}, updated ${esc(graph.meta.updated)}. Positions are worked out from the connections each time, so adding records re-settles the map instead of needing hand placement.</p>`;
}
$("btnReport").addEventListener("click", () => { renderReport(); $<HTMLDialogElement>("report").showModal(); });
$("closeReport").addEventListener("click", () => $<HTMLDialogElement>("report").close());
$("reportBody").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("[data-open]") as HTMLElement | null;
  if (b) { $<HTMLDialogElement>("report").close(); selectNode(b.dataset.open!, { fly: false }); }
});

// ---------------- camera UI ----------------

$("zoomIn").addEventListener("click", () => scene.zoomBy(0.6));
$("zoomOut").addEventListener("click", () => scene.zoomBy(1 / 0.6));
$("home").addEventListener("click", () => scene.overview());

const mini = $<HTMLCanvasElement>("minimap");
const mctx = mini.getContext("2d")!;
let lastMini = 0;
let lastCamSave = 0;
function frameUi(_d: number, moving = false) {
  const t = performance.now();
  if (!moving && t - lastCamSave > 400) { lastCamSave = t; saveView(); }
  if ($("minimapWrap").hidden) return;
  const now = performance.now();
  if (now - lastMini > 120) { lastMini = now; drawMinimap(); }
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
    const p = scene.position(id)!;
    const t = scene.typeOf(id)!;
    const x = cx + (p.x - ex.center.x) * s, y = cy + (p.z - ex.center.z) * s;
    mctx.globalAlpha = filtersActive() && !nodeMatch(id) ? 0.15 : 0.35 + 0.65 * scene.visibility(id);
    mctx.fillStyle = NODE_STYLE[t].css;
    mctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
    if (id === sel) { mctx.globalAlpha = 1; mctx.strokeStyle = "#5E6AD2"; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(x, y, 5, 0, Math.PI * 2); mctx.stroke(); }
  }
  mctx.globalAlpha = 1;
  const c = scene.cameraInfo;
  const px = cx + (c.pos.x - ex.center.x) * s, py = cy + (c.pos.z - ex.center.z) * s;
  const tx = cx + (c.target.x - ex.center.x) * s, ty = cy + (c.target.z - ex.center.z) * s;
  mctx.strokeStyle = "rgba(22,24,29,.7)"; mctx.lineWidth = 1.2; mctx.setLineDash([3, 3]);
  mctx.beginPath(); mctx.moveTo(px, py); mctx.lineTo(tx, ty); mctx.stroke(); mctx.setLineDash([]);
  mctx.fillStyle = "#5E6AD2"; mctx.beginPath(); mctx.arc(Math.max(4, Math.min(mini.width - 4, px)), Math.max(4, Math.min(mini.height - 4, py)), 4, 0, Math.PI * 2); mctx.fill();
  mctx.strokeStyle = "#5E6AD2"; mctx.beginPath(); mctx.arc(tx, ty, 6, 0, Math.PI * 2); mctx.stroke();
}
mini.addEventListener("click", (e) => {
  const r = mini.getBoundingClientRect();
  const { ex, s, cx, cy } = miniTransform();
  const x = (e.clientX - r.left - cx) / s + ex.center.x, z = (e.clientY - r.top - cy) / s + ex.center.z;
  scene.rig.flyTo({ x, y: scene.rig.target.y, z });
  scene.rig.userMoved = true;
  scene.zoomBy(1);
});

// ---------------- data loading ----------------

let toastTimer = 0;
function toast(t: string) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = window.setTimeout(() => (el.hidden = true), 3200); }

function refresh(msg?: string) {
  A = analyze(graph);
  onMap = new Set(A.mapNodeIds);
  if (st.selectedNode && !A.nodeById.has(st.selectedNode)) st.selectedNode = null;
  if (st.selectedEdge && !A.drawnEdges.some((e) => e.id === st.selectedEdge)) st.selectedEdge = null;
  scene.setData(A);
  buildFilters();
  renderLegend();
  renderCounts();
  renderDetails();
  if (!palette.hidden) renderPalette(); else renderList();
  onFiltersChanged();
  if (msg) toast(msg);
}

function addData(input: unknown, mode: "merge" | "replace" = "merge") {
  const incoming = normalizeGraph(input as Record<string, unknown>);
  const before = new Set(A.mapNodeIds);
  const rawMeta = (input as { meta?: GraphMap["meta"] } | null)?.meta;
  graph = mode === "replace" ? incoming : mergeGraph(graph, { ...incoming, meta: (rawMeta ?? {}) as GraphMap["meta"] });
  refresh();
  const added = A.mapNodeIds.filter((id) => !before.has(id)).length;
  toast(mode === "replace" ? `Loaded ${A.mapNodeIds.length} accounts; the map is settling.` : `${added} new account${added === 1 ? "" : "s"} placed; the map is settling.`);
  if (mode === "replace") scene.overview();
}

let pendingJson: unknown = null;
async function loadFile(f: File) {
  try {
    pendingJson = JSON.parse(await f.text());
    const n = Array.isArray((pendingJson as { nodes?: unknown[] }).nodes) ? (pendingJson as { nodes: unknown[] }).nodes.length : 0;
    const e = Array.isArray((pendingJson as { edges?: unknown[] }).edges) ? (pendingJson as { edges: unknown[] }).edges.length : 0;
    $("loadBody").textContent = `${f.name}: ${n} accounts and ${e} connections. Merging keeps the current map and places new accounts next to the ones they link to. Records with an existing id are updated.`;
    $<HTMLDialogElement>("loadDlg").showModal();
  } catch (err) { toast(`Could not read ${f.name}: ${(err as Error).message}`); }
}
$("loadMerge").addEventListener("click", () => { $<HTMLDialogElement>("loadDlg").close(); if (pendingJson) addData(pendingJson, "merge"); pendingJson = null; });
$("loadReplace").addEventListener("click", () => { $<HTMLDialogElement>("loadDlg").close(); if (pendingJson) addData(pendingJson, "replace"); pendingJson = null; });
$("loadCancel").addEventListener("click", () => { $<HTMLDialogElement>("loadDlg").close(); pendingJson = null; });
$<HTMLInputElement>("fileIn").addEventListener("change", (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) loadFile(f); (e.target as HTMLInputElement).value = ""; });
$("stage").addEventListener("dragover", (e) => e.preventDefault());
$("stage").addEventListener("drop", (e) => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) loadFile(f); });

// Console API for feeding research output straight in.
(window as any).agentMap = {
  addData: (json: unknown) => addData(json, "merge"),
  replaceData: (json: unknown) => addData(json, "replace"),
  getData: () => graph,
  report: () => ({ offMap: A.offMap, issues: A.issues }),
  camera: () => ({ dist: scene.rig.dist, current: scene.rig.currentDist, min: scene.rig.minDist, max: scene.rig.maxDist, depth: scene.depth })
};

// ---------------- start ----------------

// ---------------- remembered view ----------------

const VIEW_KEY = "autonomy.view.v1";
let restoring = true; // don't overwrite the saved view while it is being restored
type SavedView = {
  power: boolean; names: boolean; minimap: boolean;
  camera?: ReturnType<typeof scene.rig.getState>;
  selectedNode: string | null; selectedEdge: string | null; edgeFromNode: string | null;
  types: string[]; kinds: string[]; topics: string[]; hideFiltered: boolean;
};
let saveTimer = 0;
function saveView() {
  if (restoring) return;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const v: SavedView = {
      power: document.body.classList.contains("power"),
      names: scene.showNames,
      minimap: !$("minimapWrap").hidden,
      camera: scene.rig.getState(),
      selectedNode: st.selectedNode, selectedEdge: st.selectedEdge, edgeFromNode: st.edgeFromNode,
      types: [...st.types], kinds: [...st.kinds], topics: [...st.topics], hideFiltered: st.hideFiltered
    };
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(v)); } catch { /* storage unavailable: nothing to remember */ }
  }, 150);
}
function readView(): Partial<SavedView> | null {
  try { const raw = localStorage.getItem(VIEW_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function restoreView() {
  const v = readView();
  // Power view is the default for a first visit; after that the last choice wins.
  setPower(v?.power ?? true);
  if (v) {
    if (Array.isArray(v.types)) st.types = new Set(v.types.filter((t): t is NodeType => (NODE_TYPES as string[]).includes(t)));
    if (Array.isArray(v.kinds)) st.kinds = new Set(v.kinds.filter((k): k is EdgeKind => (EDGE_KINDS as string[]).includes(k)));
    if (Array.isArray(v.topics)) st.topics = new Set(v.topics.filter((t) => A.topicLabel.has(t)));
    st.hideFiltered = !!v.hideFiltered;
    syncFilterInputs();
    onFiltersChanged();
    if (v.names) toggleNames(true);
    if (v.minimap) toggleMinimap(true);
    if (v.selectedEdge && A.drawnEdges.some((e) => e.id === v.selectedEdge)) {
      if (v.edgeFromNode && A.nodeById.has(v.edgeFromNode)) st.selectedNode = v.edgeFromNode;
      selectEdge(v.selectedEdge, { fly: false });
    } else if (v.selectedNode && A.nodeById.has(v.selectedNode)) {
      selectNode(v.selectedNode, { fly: false });
    }
    // Keep an unselected map load on the centered overview. Restore a closer
    // saved camera only when the saved node/edge gives that framing context.
    if (v.camera && (st.selectedNode || st.selectedEdge)) scene.rig.setState(v.camera);
  }
  restoring = false;
  saveView();
}

refresh();
scene.overview(true);
restoreView();
(window as any).setBootCounts?.(A.mapNodeIds.length, A.drawnEdges.length);
// Every load plays the entrance (the same one Reset plays), unless the remembered
// view has an account or connection selected: then it reopens right there.
if (!st.selectedNode && !st.selectedEdge) scene.playIntro();
