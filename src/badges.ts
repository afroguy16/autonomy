// Camera-facing badges for accounts: an avatar when the data has one, otherwise initials.
// The badge keeps the node-type cue in both colour and shape:
// person = circle, organization = rounded square, agent = diamond.

import * as THREE from "three";
import { NODE_STYLE } from "./theme";
import type { Node, NodeType } from "./types";

const S = 128;

// Avatars load over the network; the entrance waits for them so photos don't
// arrive (and upload to the GPU) in the middle of the animation.
const pendingAvatars = new Set<HTMLImageElement>();
const avatarWaiters: (() => void)[] = [];
export function avatarsSettled(): Promise<void> {
  return pendingAvatars.size ? new Promise((r) => avatarWaiters.push(r)) : Promise.resolve();
}

export function initials(n: Node) {
  const name = (n.name ?? n.handle ?? n.id).replace(/^@/, "");
  const parts = name.split(/[\s\-_.]+/).filter(Boolean);
  const chars = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return chars.toUpperCase();
}

function shapePath(ctx: CanvasRenderingContext2D, type: NodeType, inset: number) {
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

// Badge face and initials follow the theme; the coloured ring and shape do not.
let darkFaces = false;
const registry: { ctx: CanvasRenderingContext2D; n: Node; img: HTMLImageElement | null; tex: any }[] = [];
export function setBadgeTheme(dark: boolean) {
  if (dark === darkFaces) return;
  darkFaces = dark;
  for (const b of registry) { draw(b.ctx, b.n, b.img); b.tex.needsUpdate = true; }
}

function draw(ctx: CanvasRenderingContext2D, n: Node, img: HTMLImageElement | null) {
  const style = NODE_STYLE[n.type];
  ctx.clearRect(0, 0, S, S);
  // Quiet badge: white face, type shown by a coloured ring and the shape itself.
  shapePath(ctx, n.type, 4);
  ctx.fillStyle = style.css;
  ctx.fill();
  shapePath(ctx, n.type, n.type === "agent" ? 19 : 16);
  ctx.fillStyle = darkFaces ? "#17181c" : "#ffffff";
  ctx.fill();
  if (img) {
    ctx.save();
    shapePath(ctx, n.type, n.type === "agent" ? 21 : 18);
    ctx.clip();
    const scale = Math.max(S / img.width, S / img.height);
    ctx.drawImage(img, (S - img.width * scale) / 2, (S - img.height * scale) / 2, img.width * scale, img.height * scale);
    ctx.restore();
    return;
  }
  ctx.fillStyle = darkFaces ? "#e6e7ea" : "#2b2f36";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${n.type === "agent" ? 30 : 40}px Inter, system-ui, sans-serif`;
  ctx.fillText(initials(n), S / 2, S / 2 + 2);
}

export function makeBadge(n: Node): any {
  const canvas = document.createElement("canvas");
  // Drawn at 2x so badges stay crisp when you fly right up to them.
  canvas.width = S * 2;
  canvas.height = S * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);
  draw(ctx, n, null);
  const tex = new THREE.CanvasTexture(canvas);
  const entry = { ctx, n, img: null as HTMLImageElement | null, tex };
  registry.push(entry);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (n.avatarUrl) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    pendingAvatars.add(img);
    const settle = () => { pendingAvatars.delete(img); if (!pendingAvatars.size) avatarWaiters.splice(0).forEach((r) => r()); };
    img.onload = () => { entry.img = img; draw(ctx, n, img); tex.needsUpdate = true; settle(); };
    img.onerror = settle; // the initials stay
    img.src = n.avatarUrl;
  }
  // Redraw once web fonts are ready so initials use the page face.
  (document as any).fonts?.ready?.then(() => { if (!entry.img) { draw(ctx, n, null); tex.needsUpdate = true; } });
  return tex;
}

export const badgeKey = (n: Node) => `${n.type}|${n.name ?? ""}|${n.handle ?? ""}|${n.avatarUrl ?? ""}`;
