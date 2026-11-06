import { buildBatch, buildSeed } from "./seed";
import { analyze, mergeGraph, normalizeGraph, type Analysis } from "./normalize";
import { MapScene, escapeHtml as esc, type ViewState } from "./scene";
import { EDGE_STYLE, NODE_STYLE } from "./theme";
import { EDGE_KINDS, NODE_TYPES, type Confidence, type Edge, type EdgeKind, type GraphMap, type Node, type NodeType, type Source } from "./types";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let graph: GraphMap = buildSeed();
let A: Analysis = analyze(graph);
let batchNo = 0;
let onMap = new Set(A.mapNodeIds);

const st = {
  selectedNode: null as string | null,
  selectedEdge: null as string | null,
  edgeFromNode: null as string | null,
  query: "",
  types: new Set<NodeType>(),
  kinds: new Set<EdgeKind>(EDGE_KINDS),
  topics: new Set<string>(),
  hideLow: false,
  hideFiltered: false,
  sort: "links",
  resultIdx: 0
};

const scene = new MapScene($("stage"), $<HTMLCanvasElement>("map"), $("labels"), $("tooltip"), {
  onPickNode: (id) => selectNode(id, { fly: true }),
  onPickEdge: (id) => selectEdge(id, { fly: false }),
  onPickNothing: () => clearSelection(),
  onEscape: () => clearSelection(),
  onFrame: (info) => frameUi(info.depth),
  onHint: (t) => { $("hint").textContent = t; }
});

// ---------------- derived view ----------------

const nodeName = (id: string) => { const n = A.nodeById.get(id); return n?.name ?? n?.handle ?? id; };
const filtersActive = () => st.types.size > 0 || st.topics.size > 0 || st.kinds.size < EDGE_KINDS.length || st.hideLow;
function nodeMatch(id: string) {
  const n = A.nodeById.get(id);
  if (!n) return false;
  if (st.types.size && !st.types.has(n.type)) return false;
  if (st.topics.size && !n.topics.some((t) => st.topics.has(t))) return false;
  return true;
}
function edgeMatch(e: Edge) {
  if (!st.kinds.has(e.kind)) return false;
  if (st.hideLow && e.confidence === "low") return false;
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
    hideFiltered: st.hideFiltered
  };
  scene.setView(view);
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
  const dash = kind === "engagement" ? 'stroke-dasharray="5 3"' : kind === "shared_topic" ? 'stroke-dasharray="1.5 3.5" stroke-linecap="round"' : "";
  return `<svg class="edge-swatch" width="${w}" height="8" viewBox="0 0 ${w} 8" aria-hidden="true"><line x1="1" y1="4" x2="${w - 1}" y2="4" stroke="${s.css}" stroke-width="${Math.max(1.2, s.width)}" ${dash}/></svg>`;
}
function conf(c?: Confidence | null) {
  const lvl = c === "high" ? 3 : c === "medium" ? 2 : c === "low" ? 1 : 0;
  const bars = [6, 9, 12].map((h, i) => `<i style="height:${h}px" class="${i < lvl ? "on" : ""}"></i>`).join("");
  return `<span class="conf"><span class="bars" aria-hidden="true">${bars}</span>${c ? c[0].toUpperCase() + c.slice(1) : "Not assessed"}</span>`;
}
function sourceItem(id: string) {
  const s: Source | undefined = A.sourceById.get(id);
  if (!s) return `<li class="missing">Missing source record “${esc(id)}”</li>`;
  const meta = [s.publisher, s.date].filter(Boolean).join(" · ");
  return `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title ?? s.url)} ↗</a>${meta ? `<span class="m">${esc(meta)}</span>` : ""}</li>`;
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

function nodeHtml(n: Node) {
  const style = NODE_STYLE[n.type];
  const off = A.offMap.find((o) => o.id === n.id);
  const x = n.profiles.x, li = n.profiles.linkedin;
  const handle = n.handle ?? n.id;
  const edges = A.edgesByNode.get(n.id) ?? [];
  const groups = EDGE_KINDS.map((k) => ({ k, list: edges.filter((e) => e.kind === k) })).filter((g) => g.list.length);
  const conns = groups.map((g) => `
    <div class="conn-group">
      <div class="gh">${edgeSwatch(g.k, 22)}${EDGE_STYLE[g.k].label} · ${g.list.length}</div>
      ${g.list.map((e) => {
        const other = e.source === n.id ? e.target : e.source;
        const o = A.nodeById.get(other)!;
        const phrase = e.source === n.id ? `${esc(e.label ?? g.k)} ${esc(nodeName(other))}` : `${esc(nodeName(other))} ${esc(e.label ?? g.k)} this account`;
        const dim = filtersActive() && !edgeMatch(e) ? ' style="opacity:.55"' : "";
        return `<div class="conn"${dim}>
          <button type="button" class="main" data-act="edge" data-id="${esc(e.id)}" aria-label="Inspect relationship: ${phrase}">${shape(o.type)}<span class="t"><b>${esc(nodeName(other))}</b><span class="s">${phrase}</span></span>${conf(e.confidence)}</button>
          <button type="button" class="icon-btn" data-act="go" data-id="${esc(other)}" aria-label="Go to ${esc(nodeName(other))}" title="Go to ${esc(nodeName(other))}">→</button>
        </div>`;
      }).join("")}
    </div>`).join("");
  const claims = n.claims.filter((c) => c.source_ids.length);
  return `
  <div class="d-head">
    <div class="d-top"><span class="chip">${shape(n.type)}${style.label}</span>
      <span>${st.selectedNode && onMap.has(n.id) ? `<button type="button" class="icon-btn" data-act="locate" aria-label="Center on map" title="Center on map">◎</button> ` : ""}<button type="button" class="icon-btn" data-act="close" aria-label="Close details">✕</button></span></div>
    <h2 class="d-name">${esc(n.name ?? handle)}</h2>
    <div class="handle-row">
      <span class="handle">@${esc(handle)}</span>
      <button type="button" class="btn sm" data-act="copy" data-id="@${esc(handle)}">Copy handle</button>
    </div>
    <div class="handle-row">
      ${x ? `<a class="btn primary" href="${esc(x)}" target="_blank" rel="noopener noreferrer">Open X profile ↗</a>` : ""}
      ${li ? `<a class="btn sm" href="${esc(li)}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>` : ""}
      ${!x && !li ? `<span class="small" style="color:var(--warn)">No public profile on record</span>` : ""}
      ${graph.meta.is_sample ? `<span class="sample">Sample data</span>` : ""}
    </div>
  </div>
  <div class="d-body">
    ${off ? `<div class="offmap"><b>Not on the map.</b> ${esc(off.reason)}. The record is kept in the data; no connection has been invented for it.</div>` : ""}
    ${n.summary ? `<section class="d-sec"><h3>What they build</h3><p>${esc(n.summary)}</p></section>` : ""}
    ${n.notes ? `<section class="d-sec"><h3>Research notes</h3><div class="notes">${esc(n.notes)}</div></section>` : ""}
    ${n.topics.length ? `<section class="d-sec"><h3>Topics</h3><div class="chips">${n.topics.map((t) => `<button type="button" data-act="topic" data-id="${esc(t)}" aria-pressed="${st.topics.has(t)}">${esc(A.topicLabel.get(t) ?? t)}${st.topics.has(t) ? " ✓" : ""}</button>`).join("")}</div></section>` : ""}
    ${n.projects.length ? `<section class="d-sec"><h3>Projects</h3><ul class="src-list">${n.projects.map((p) => `<li><b>${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.name)} ↗</a>` : esc(p.name)}</b><span class="m">${esc(p.description ?? "")}</span></li>`).join("")}</ul></section>` : ""}
    <section class="d-sec"><h3>Connections · ${edges.length}</h3>${conns || `<p class="muted">No connections on record.</p>`}</section>
    <section class="d-sec"><h3>Why this account is included</h3><ul class="src-list">${n.inclusion_source_ids.map(sourceItem).join("") || `<li class="missing">No inclusion evidence on record.</li>`}</ul></section>
    ${claims.length ? `<section class="d-sec"><h3>Sources for statements</h3><ul class="src-list">${claims.map((c) => `<li><span class="m">${esc(c.field)}</span><ul class="src-list">${c.source_ids.map(sourceItem).join("")}</ul></li>`).join("")}</ul></section>` : ""}
    <section class="d-sec"><h3>Confidence</h3><p>${conf(n.confidence)} ${n.confidence_note ? `<span class="small muted">— ${esc(n.confidence_note)}</span>` : ""}</p>${n.confidence && graph.meta.confidence_levels?.[n.confidence] ? `<p class="small muted">${esc(graph.meta.confidence_levels[n.confidence]!)}</p>` : ""}</section>
    ${n.added_at ? `<p class="small muted">Added ${esc(n.added_at)}</p>` : ""}
  </div>`;
}

function edgeHtml(e: Edge) {
  const s = EDGE_STYLE[e.kind];
  const a = A.nodeById.get(e.source)!, b = A.nodeById.get(e.target)!;
  const pairOthers = A.drawnEdges.filter((x) => x.id !== e.id && ((x.source === e.source && x.target === e.target) || (x.source === e.target && x.target === e.source)));
  const project = e.project_id ? [a, b].flatMap((n) => n.projects).find((p) => p.id === e.project_id) : undefined;
  const explain = e.kind === "engagement"
    ? `<div class="callout engage"><b>Discovery path, not collaboration.</b> This records a reply or quote on X that led the research from one account to the other. On its own it does not mean they work together.</div>`
    : e.kind === "shared_topic"
      ? `<div class="callout"><b>Same area of work.</b> Both are linked to the same topic. No direct relationship between them is claimed.</div>`
      : e.kind === "cluster"
        ? `<div class="callout"><b>Legacy link.</b> Kept from older data. What a cluster link means has not been defined, so read nothing into it yet.</div>`
        : `<div class="callout"><b>${s.label}.</b> ${esc(s.means)}</div>`;
  const period = e.period && (e.period.start || e.period.end) ? `${e.period.start ?? "?"} – ${e.period.end ?? "present"}` : "";
  return `
  <div class="d-head">
    <div class="d-top"><span class="chip">${edgeSwatch(e.kind, 22)}Connection · ${s.label}</span>
      <span>${st.edgeFromNode ? `<button type="button" class="btn sm" data-act="back">← ${esc(nodeName(st.edgeFromNode))}</button> ` : ""}<button type="button" class="icon-btn" data-act="close" aria-label="Close details">✕</button></span></div>
    <h2 class="d-name" style="font-size:21px">${esc(nodeName(a.id))} <span class="muted" style="font-weight:500">${esc(e.label ?? e.kind)}</span> ${esc(nodeName(b.id))}</h2>
    ${graph.meta.is_sample ? `<div><span class="sample">Sample data</span></div>` : ""}
  </div>
  <div class="d-body">
    ${explain}
    ${e.detail ? `<section class="d-sec"><h3>Detail</h3><p>${esc(e.detail)}</p></section>` : ""}
    ${period ? `<section class="d-sec"><h3>Period</h3><p>${esc(period)}</p></section>` : ""}
    ${project ? `<section class="d-sec"><h3>Project</h3><p>${esc(project.name)}</p></section>` : ""}
    ${e.topic_ids?.length ? `<section class="d-sec"><h3>Shared topic</h3><div class="chips">${e.topic_ids.map((t) => `<button type="button" data-act="topic" data-id="${esc(t)}">${esc(A.topicLabel.get(t) ?? t)}</button>`).join("")}</div></section>` : ""}
    <section class="d-sec"><h3>Evidence</h3>${e.source_ids.length ? `<ul class="src-list">${e.source_ids.map(sourceItem).join("")}</ul>` : `<p class="muted">No direct evidence links these two${e.kind === "shared_topic" ? "; the topic comes from each account’s own sources" : ""}.</p>`}</section>
    <section class="d-sec"><h3>Confidence</h3><p>${conf(e.confidence)}</p>${e.note ? `<p class="small muted" style="margin-top:6px">${esc(e.note)}</p>` : ""}</section>
    ${pairOthers.length ? `<section class="d-sec"><h3>Other relationships between these two</h3><p class="small muted" style="margin-bottom:6px">Each is a separate record with its own evidence and its own line on the map.</p>${pairOthers.map((x) => `<div class="conn"><button type="button" class="main" data-act="edge" data-id="${esc(x.id)}">${edgeSwatch(x.kind, 22)}<span class="t"><b>${EDGE_STYLE[x.kind].label}</b><span class="s">${esc(nodeName(x.source))} ${esc(x.label ?? x.kind)} ${esc(nodeName(x.target))}</span></span>${conf(x.confidence)}</button></div>`).join("")}</section>` : ""}
    <section class="d-sec"><h3>Go to</h3><div class="pair-ends">${[a, b].map((n) => `<div class="conn"><button type="button" class="main" data-act="select" data-id="${esc(n.id)}">${shape(n.type)}<span class="t"><b>${esc(nodeName(n.id))}</b><span class="s">${NODE_STYLE[n.type].label} · @${esc(n.handle ?? n.id)}</span></span></button></div>`).join("")}</div></section>
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

// ---------------- search ----------------

const q = $<HTMLInputElement>("q");
const results = $("results");
function renderResults() {
  lastHits = search(st.query);
  const shown = lastHits.slice(0, 10);
  st.resultIdx = Math.min(st.resultIdx, Math.max(0, shown.length - 1));
  if (!st.query.trim() || st.query.trim().length < 2) { results.hidden = true; q.setAttribute("aria-expanded", "false"); pushView(); renderList(); return; }
  const fieldLabel: Record<string, string> = { name: "name", handle: "handle", notes: "research notes", summary: "summary", project: "project", topic: "topic" };
  const mapHits = shown.filter((h) => onMap.has(h.id)), offHits = shown.filter((h) => !onMap.has(h.id));
  const item = (h: Hit, i: number) => {
    const n = A.nodeById.get(h.id)!;
    return `<button type="button" class="result" role="option" id="res-${i}" aria-selected="${i === st.resultIdx}" data-id="${esc(h.id)}">${shape(n.type)}<span><span>${esc(n.name ?? n.id)}</span><span class="meta">@${esc(n.handle ?? n.id)} · ${NODE_STYLE[n.type].label}${h.field !== "name" && h.field !== "handle" ? ` · in ${fieldLabel[h.field]}: ${h.snippet}` : ""}</span></span></button>`;
  };
  let i = 0;
  results.innerHTML = shown.length
    ? `${mapHits.length ? `<div class="group">On the map · ${lastHits.filter((h) => onMap.has(h.id)).length}</div>${mapHits.map((h) => item(h, i++)).join("")}` : ""}${offHits.length ? `<div class="group">Not on the map (no connections)</div>${offHits.map((h) => item(h, i++)).join("")}` : ""}<div class="group" style="text-transform:none;letter-spacing:0">↑ ↓ move · Enter go · Esc close · matches glow on the map</div>`
    : `<div class="group" style="text-transform:none;letter-spacing:0">No accounts match “${esc(st.query)}”.</div>`;
  results.hidden = false;
  q.setAttribute("aria-expanded", "true");
  q.setAttribute("aria-activedescendant", shown.length ? `res-${st.resultIdx}` : "");
  pushView();
  renderList();
}
function orderedHits() { const s = lastHits.slice(0, 10); return [...s.filter((h) => onMap.has(h.id)), ...s.filter((h) => !onMap.has(h.id))]; }
q.addEventListener("input", () => { st.query = q.value; st.resultIdx = 0; renderResults(); });
q.addEventListener("focus", () => { if (st.query.trim().length >= 2) renderResults(); });
q.addEventListener("keydown", (e) => {
  const hits = orderedHits();
  if (e.key === "ArrowDown") { st.resultIdx = Math.min(hits.length - 1, st.resultIdx + 1); renderResults(); e.preventDefault(); }
  else if (e.key === "ArrowUp") { st.resultIdx = Math.max(0, st.resultIdx - 1); renderResults(); e.preventDefault(); }
  else if (e.key === "Enter") { const h = hits[st.resultIdx]; if (h) pickResult(h.id); e.preventDefault(); }
  else if (e.key === "Escape") { if (!results.hidden) { results.hidden = true; q.setAttribute("aria-expanded", "false"); } else { q.value = ""; st.query = ""; renderResults(); } }
});
results.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest(".result") as HTMLElement | null; if (b?.dataset.id) pickResult(b.dataset.id); });
function pickResult(id: string) {
  results.hidden = true;
  q.setAttribute("aria-expanded", "false");
  selectNode(id, { fly: true });
}
document.addEventListener("click", (e) => { if (!(e.target as HTMLElement).closest(".search")) { results.hidden = true; q.setAttribute("aria-expanded", "false"); } });
document.addEventListener("keydown", (e) => {
  const tag = (document.activeElement?.tagName ?? "").toLowerCase();
  if (e.key === "/" && tag !== "input" && tag !== "select" && tag !== "textarea") { e.preventDefault(); q.focus(); q.select(); }
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
  $<HTMLInputElement>("fLow").checked = st.hideLow;
  $<HTMLInputElement>("fHide").checked = st.hideFiltered;
}
$("filters").addEventListener("change", (e) => {
  const i = e.target as HTMLInputElement;
  if (i.dataset.f === "type") toggleSet(st.types, i.value as NodeType);
  else if (i.dataset.f === "kind") toggleSet(st.kinds, i.value as EdgeKind);
  else if (i.dataset.f === "topic") toggleSet(st.topics, i.value);
  else if (i.id === "fLow") st.hideLow = i.checked;
  else if (i.id === "fHide") st.hideFiltered = i.checked;
  onFiltersChanged();
});
function clearFilters() {
  st.types.clear(); st.topics.clear(); st.kinds = new Set(EDGE_KINDS); st.hideLow = false; st.hideFiltered = false;
  syncFilterInputs(); onFiltersChanged();
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
  $("legendEdges").innerHTML = EDGE_KINDS.filter((k) => present.has(k)).map((k) => `<li title="${esc(EDGE_STYLE[k].means)}">${edgeSwatch(k)}<span>${EDGE_STYLE[k].label}${k === "engagement" ? ' <span class="muted">— reply/quote path, not collaboration</span>' : k === "shared_topic" ? ' <span class="muted">— no direct link</span>' : ""}</span></li>`).join("");
}
function setPower(on: boolean) {
  document.body.classList.toggle("power", on);
  $("exitPower").hidden = !on;
  $("btnPower").setAttribute("aria-pressed", String(on));
  if (on) { results.hidden = true; $("filters").hidden = true; $("list").hidden = true; }
  try { localStorage.setItem("agentMap.power", on ? "1" : "0"); } catch { /* storage unavailable */ }
  announce(on ? "Power view: only the map is shown. Press P to show the controls." : "Controls shown.");
  ($(on ? "map" : "btnPower") as HTMLElement).focus();
}
$("btnPower").addEventListener("click", () => setPower(true));
$("exitPower").addEventListener("click", () => setPower(false));
document.addEventListener("keydown", (e) => {
  const tag = (document.activeElement?.tagName ?? "").toLowerCase();
  if ((e.key === "p" || e.key === "P") && !e.metaKey && !e.ctrlKey && !e.altKey && tag !== "input" && tag !== "select" && tag !== "textarea") {
    setPower(!document.body.classList.contains("power"));
  }
});
try { if (localStorage.getItem("agentMap.power") === "1") setPower(true); } catch { /* storage unavailable */ }

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
  $("counts").textContent = `${A.mapNodeIds.length} accounts · ${A.drawnEdges.length} connections`;
  $("sampleFlag").hidden = !graph.meta.is_sample;
  const errs = A.issues.filter((i) => i.level !== "info").length;
  $("issueBadge").hidden = errs === 0;
  $("issueBadge").textContent = String(errs);
}

function renderReport() {
  const lvls: ["error" | "warning" | "info", string][] = [["error", "Errors"], ["warning", "Warnings"], ["info", "Notes"]];
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
    <ul>${A.offMap.map((o) => `<li><button type="button" class="link" data-open="${esc(o.id)}">${esc(nodeName(o.id))}</button> — ${esc(o.reason)}</li>`).join("") || "<li>None</li>"}</ul>
    ${lvls.map(([l, label]) => { const list = A.issues.filter((i) => i.level === l); return list.length ? `<h3>${label}</h3><ul>${list.map((i) => `<li><span class="lvl-${l}">${l}</span> ${esc(i.message)}</li>`).join("")}</ul>` : ""; }).join("")}
    <h3>Research process</h3>
    <p class="small">Seeds: ${m.seeds?.length ?? 0} · Expanded: ${m.expanded?.length ?? 0} · Frozen: ${m.frozen?.length ?? 0} · Data version ${esc(String(m.version))}, updated ${esc(m.updated)}</p>
    <h3>Data shape</h3>
    <p class="small">Uses the merged GraphMap shape unchanged. Positions are not stored: they are worked out from the edges each time, so adding records re-settles the map instead of needing hand placement.</p>`;
}
$("btnReport").addEventListener("click", () => { renderReport(); $<HTMLDialogElement>("report").showModal(); });
$("closeReport").addEventListener("click", () => $<HTMLDialogElement>("report").close());
$("reportBody").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("[data-open]") as HTMLElement | null;
  if (b) { $<HTMLDialogElement>("report").close(); selectNode(b.dataset.open!, { fly: false }); }
});

// ---------------- camera UI ----------------

const depth = $<HTMLInputElement>("depth");
let depthDragging = false;
depth.addEventListener("pointerdown", () => { depthDragging = true; });
window.addEventListener("pointerup", () => { depthDragging = false; });
depth.addEventListener("input", () => scene.setDepth(Number(depth.value) / 1000));
$("zoomIn").addEventListener("click", () => scene.zoomBy(0.6));
$("zoomOut").addEventListener("click", () => scene.zoomBy(1 / 0.6));
$("home").addEventListener("click", () => scene.overview());

const depthName = (t: number) => {
  const ov = scene.overviewDepth;
  return t < ov - 0.04 ? "Far out" : t < ov + 0.12 ? "Surface" : t < ov + 0.35 ? "Shallow" : t < ov + 0.55 ? "Deep" : "Deepest";
};
const mini = $<HTMLCanvasElement>("minimap");
const mctx = mini.getContext("2d")!;
let lastMini = 0;
function frameUi(d: number) {
  if (!depthDragging && document.activeElement !== depth) depth.value = String(Math.round(d * 1000));
  depth.setAttribute("aria-valuetext", `${depthName(d)}, ${Math.round(d * 100)}% zoomed in`);
  $("depthRead").textContent = depthName(d);
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
    if (id === sel) { mctx.globalAlpha = 1; mctx.strokeStyle = "#16181D"; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(x, y, 5, 0, Math.PI * 2); mctx.stroke(); }
  }
  mctx.globalAlpha = 1;
  const c = scene.cameraInfo;
  const px = cx + (c.pos.x - ex.center.x) * s, py = cy + (c.pos.z - ex.center.z) * s;
  const tx = cx + (c.target.x - ex.center.x) * s, ty = cy + (c.target.z - ex.center.z) * s;
  mctx.strokeStyle = "rgba(22,24,29,.7)"; mctx.lineWidth = 1.2; mctx.setLineDash([3, 3]);
  mctx.beginPath(); mctx.moveTo(px, py); mctx.lineTo(tx, ty); mctx.stroke(); mctx.setLineDash([]);
  mctx.fillStyle = "#16181D"; mctx.beginPath(); mctx.arc(Math.max(4, Math.min(mini.width - 4, px)), Math.max(4, Math.min(mini.height - 4, py)), 4, 0, Math.PI * 2); mctx.fill();
  mctx.strokeStyle = "#16181D"; mctx.beginPath(); mctx.arc(tx, ty, 6, 0, Math.PI * 2); mctx.stroke();
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
  if (st.query) renderResults(); else renderList();
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

$("btnBatch").addEventListener("click", () => {
  batchNo++;
  const batch = buildBatch(graph, batchNo);
  addData({ ...batch, topics: [], meta: {} }, "merge");
  const first = batch.nodes[0]?.id;
  if (first) { lastHits = []; setTimeout(() => selectNode(first, { fly: true }), 600); }
});
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

refresh();
scene.overview(true);
