// Camera-facing badges for accounts: an avatar when the data has one, otherwise initials.
// The badge keeps the node-type cue in both colour and shape:
// person = circle, organization = rounded square, agent = diamond.

import * as THREE from "three";
import { NODE_STYLE } from "./theme";
import type { Node, NodeType } from "./types";

const S = 128;

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

function draw(ctx: CanvasRenderingContext2D, n: Node, img: HTMLImageElement | null) {
  const style = NODE_STYLE[n.type];
  ctx.clearRect(0, 0, S, S);
  // White outline keeps neighbouring badges apart.
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

export function makeBadge(n: Node): any {
  const canvas = document.createElement("canvas");
  // Drawn at 2x so badges stay crisp when you fly right up to them.
  canvas.width = S * 2;
  canvas.height = S * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);
  draw(ctx, n, null);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (n.avatarUrl) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { draw(ctx, n, img); tex.needsUpdate = true; };
    img.src = n.avatarUrl; // on error the initials stay
  }
  // Redraw once web fonts are ready so initials use the page face.
  (document as any).fonts?.ready?.then(() => { if (!n.avatarUrl) { draw(ctx, n, null); tex.needsUpdate = true; } });
  return tex;
}

export const badgeKey = (n: Node) => `${n.type}|${n.name ?? ""}|${n.handle ?? ""}|${n.avatarUrl ?? ""}`;
