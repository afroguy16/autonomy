import * as THREE from "three";
import CameraControls from "camera-controls";

CameraControls.install({ THREE });

const ACTION = CameraControls.ACTION;

/**
 * Camera built on camera-controls (yomotsu/camera-controls).
 *
 * One camera state, one smoothing rule: every input (drag, wheel, pinch, keys,
 * fly-to) moves the same desired state and the library eases toward it with a
 * critically damped spring, so new input extends a motion instead of restarting it.
 * Wheel and pinch zoom scale around the point under the pointer.
 */
export class CameraRig {
  readonly camera: any;
  readonly controls: any;
  /** Centre of the whole map, used by the wide view. */
  home = new THREE.Vector3();
  reducedMotion = false;
  /** Set when the user has moved the camera themselves. */
  userMoved = false;
  private _min = 0.35;
  private _max = 600;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  private dom: HTMLElement;

  constructor(camera: any, dom: HTMLElement) {
    this.camera = camera;
    this.dom = dom;
    const c = new CameraControls(camera, dom);
    this.controls = c;
    c.minDistance = this._min;
    c.maxDistance = this._max;
    // Zoom past the closest orbit distance by moving forward, so zoom-in is never capped.
    // The library applies this at the far end too (zooming out would push the whole
    // view away forever), so it is only switched on while the input zooms in.
    c.infinityDolly = false;
    // These run on the window in the capture phase, so they always see the event
    // before the library's own handlers on the canvas.
    window.addEventListener("wheel", (e: WheelEvent) => { if (e.target === dom) this.beforeWheel(e); }, { capture: true, passive: false });
    // Shift-drag orbits (trackpads have no easy right-drag); the library has no Shift binding.
    window.addEventListener("pointerdown", (e: PointerEvent) => {
      if (e.target === dom) c.mouseButtons.left = e.shiftKey ? ACTION.ROTATE : ACTION.TRUCK;
    }, { capture: true });
    c.smoothTime = 0.12;
    c.draggingSmoothTime = 0.05;
    c.dollySpeed = 1;
    // The library's pan moves half a pixel per pixel at speed 1; 2 keeps the map under the hand.
    c.truckSpeed = 2;
    c.minPolarAngle = 0.12;
    c.maxPolarAngle = Math.PI - 0.12;
    // Map conventions: drag pans, right-drag orbits, wheel zooms toward the pointer.
    c.mouseButtons.left = ACTION.TRUCK;
    c.mouseButtons.middle = ACTION.DOLLY;
    c.mouseButtons.right = ACTION.ROTATE;
    c.mouseButtons.wheel = ACTION.NONE; // wheel zoom is handled in beforeWheel
    if ("shiftLeft" in c.mouseButtons) c.mouseButtons.shiftLeft = ACTION.ROTATE;
    c.touches.one = ACTION.TOUCH_TRUCK;
    c.touches.two = ACTION.TOUCH_DOLLY_TRUCK;
    c.touches.three = ACTION.TOUCH_ROTATE;
    // Any direct input (drag, wheel, pinch) means the user now owns the view.
    c.addEventListener("controlstart", () => { this.userMoved = true; });
    c.addEventListener("control", () => { this.userMoved = true; });
    // Default view until the map is measured.
    c.setLookAt(0, 0, 120, 0, 0, 0, false);
  }

  /**
   * Where the user is pointing, in 3D: the badge under the cursor, or the nearest
   * one on screen. Set by the scene. Zoom aims there, so you can always reach it.
   */
  depthAt: ((clientX: number, clientY: number) => { x: number; y: number; z: number } | null) | null = null;
  /** World size of the map, so the forward dive moves at a useful speed. */
  mapRadius = 50;
  private lastWheelAt = 0;
  /** Called when the rig consumes a wheel event itself, so the scene can redraw. */
  onWheelHandled: (() => void) | null = null;

  private wheelAnchor: any = null;

  /**
   * Wheel and trackpad zoom. Each event scales the camera (position and focus
   * point together) about one 3D anchor, so the anchor stays exactly under the
   * pointer; the library's spring then smooths the motion.
   * Zooming in anchors on the badge under the pointer (or the nearest one), so any
   * account can be reached. Past the closest orbit distance the camera keeps
   * flying forward at a steady pace, through the map.
   */
  private beforeWheel(e: WheelEvent) {
    e.preventDefault();
    const c = this.controls;
    const now = performance.now();
    const gestureStart = now - this.lastWheelAt > 250;
    this.lastWheelAt = now;
    this.userMoved = true;
    this.onWheelHandled?.();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    // Trackpad pinch arrives as small ctrl-wheel deltas; give it more reach.
    const dy = Math.max(-150, Math.min(150, e.deltaY * unit * (e.ctrlKey ? 4 : 1)));
    if (!dy) return;
    const zoomIn = dy < 0;

    const r = this.dom.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
    const ny = -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1;
    const t = c.getTarget(new THREE.Vector3(), true);
    const p = c.getPosition(new THREE.Vector3(), true);
    const d = p.distanceTo(t);

    // Pick the anchor once per gesture so the zoom heads somewhere steady.
    if (gestureStart || !this.wheelAnchor || this.wheelAnchor.zoomIn !== zoomIn) {
      let pt: any = null;
      if (zoomIn && this.depthAt) {
        const q = this.depthAt(e.clientX, e.clientY);
        if (q) pt = new THREE.Vector3(q.x, q.y, q.z);
      }
      if (!pt) {
        // Fall back to the focus plane under the pointer.
        const ray = this.tmp.set(nx, ny, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
        const fwd = this.forward();
        pt = this.camera.position.clone().addScaledVector(ray, d / Math.max(0.05, ray.dot(fwd)));
      }
      this.wheelAnchor = { pt, zoomIn };
    }
    const anchor = this.wheelAnchor.pt;

    if (zoomIn && d * Math.exp(dy * 0.005) < this._min) {
      // As close as orbiting allows: fly forward along the pointer ray.
      const ray = this.tmp.set(nx, ny, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
      const step = -dy * this.mapRadius * 0.0012;
      t.addScaledVector(ray, step);
      p.addScaledVector(ray, step);
      this.wheelAnchor = null;
    } else {
      let f = Math.exp(dy * 0.005);
      // Never closer than the orbit minimum, never wider than the widest view.
      f = Math.min(Math.max(f, this._min / d), this._max / d);
      if (Math.abs(1 - f) < 1e-6) return;
      t.sub(anchor).multiplyScalar(f).add(anchor);
      p.sub(anchor).multiplyScalar(f).add(anchor);
      if (!zoomIn) {
        // Zooming out eases the view back over the map, arriving centred at the
        // widest view, so the map can never be pushed off-screen.
        const nd = d * f;
        const k = this._max - d > 1e-6 ? Math.min(1, (nd - d) / (this._max - d)) : 1;
        const shift = this.home.clone().sub(t).multiplyScalar(k);
        t.add(shift);
        p.add(shift);
      }
    }
    c.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, !this.reducedMotion);
  }

  setReducedMotion(on: boolean) {
    this.reducedMotion = on;
    this.controls.smoothTime = on ? 0.0001 : 0.12;
    this.controls.draggingSmoothTime = on ? 0.0001 : 0.05;
  }

  get minDist() { return this._min; }
  set minDist(v: number) { this._min = v; this.controls.minDistance = v; }
  get maxDist() { return this._max; }
  set maxDist(v: number) { this._max = v; this.controls.maxDistance = v; }

  /** Desired (end) target and distance. */
  get target() { return this.controls.getTarget(new THREE.Vector3(), true); }
  get dist() { return this.controls.distance; }
  /** Values the camera is showing right now. */
  get currentTarget() { return this.controls.getTarget(new THREE.Vector3(), false); }
  get currentDist() { return this.camera.position.distanceTo(this.controls.getTarget(this.tmp, false)); }
  get currentYaw() { return this.controls.azimuthAngle; }

  forward() { return this.camera.getWorldDirection(new THREE.Vector3()); }

  /** Advances the spring; returns true while the camera is still moving. */
  update(dt: number) { return this.controls.update(dt); }

  clampDist(d: number) { return Math.min(this._max, Math.max(this._min, d)); }

  /** Pan by a screen-space pixel delta (used by release momentum). */
  pan(dx: number, dy: number, viewportH: number) {
    const scale = (this.currentDist * 2 * Math.tan((this.camera.fov * Math.PI) / 360)) / viewportH;
    this.controls.truck(-dx * scale, -dy * scale, false);
    this.userMoved = true;
  }

  orbit(dx: number, dy: number) {
    this.controls.rotate(-dx * 0.005, -dy * 0.005, false);
    this.userMoved = true;
  }

  /** factor < 1 zooms in, around the screen point (ndc) given. */
  zoomAt(factor: number, ndcX = 0, ndcY = 0, smooth = true) {
    const c = this.controls;
    const d = c.distance;
    const nd = d * factor;
    if (nd < this._min) {
      // Past the closest orbit distance: keep going forward.
      c.forward(d * (1 - factor), smooth);
    } else if (ndcX === 0 && ndcY === 0) {
      c.dollyTo(this.clampDist(nd), smooth);
    } else {
      // Scale about the point under the pointer on the focus plane.
      const ray = this.tmp.set(ndcX, ndcY, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
      const fwd = this.forward();
      const anchor = this.tmp2.copy(this.camera.position).addScaledVector(ray, d / Math.max(0.05, ray.dot(fwd)));
      const f = this.clampDist(nd) / d;
      const t = c.getTarget(new THREE.Vector3(), true);
      const p = c.getPosition(new THREE.Vector3(), true);
      t.sub(anchor).multiplyScalar(f).add(anchor);
      p.sub(anchor).multiplyScalar(f).add(anchor);
      c.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, smooth);
    }
    this.userMoved = true;
  }

  setDist(d: number) { this.controls.dollyTo(this.clampDist(d), true); this.userMoved = true; }

  /** Driving: forward/back along the view, turn left/right, rise/sink. Units per second. */
  drive(forward: number, turn: number, rise: number, dt: number) {
    if (!forward && !turn && !rise) return;
    const speed = Math.max(this.controls.distance, 3) * 0.9 * dt;
    if (forward) this.controls.forward(forward * speed, false);
    if (rise) this.controls.elevate(rise * speed, false);
    if (turn) this.controls.rotate(-turn * 1.4 * dt, 0, false);
    this.userMoved = true;
  }

  /** Glide to look at a point from the current direction. */
  flyTo(point: { x: number; y: number; z: number }, dist?: number) {
    const c = this.controls;
    const d = dist !== undefined ? this.clampDist(dist) : c.distance;
    const dir = c.getPosition(new THREE.Vector3(), true).sub(c.getTarget(new THREE.Vector3(), true)).normalize();
    c.setLookAt(point.x + dir.x * d, point.y + dir.y * d, point.z + dir.z * d, point.x, point.y, point.z, !this.reducedMotion);
  }

  overview(center: { x: number; y: number; z: number }, radius: number, instant = false) {
    this.home.set(center.x, center.y, center.z);
    const d = this.clampDist(radius * 2.35);
    const yaw = this.controls.azimuthAngle, pitch = 0.32;
    const off = new THREE.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)).multiplyScalar(d);
    this.controls.setLookAt(center.x + off.x, center.y + off.y, center.z + off.z, center.x, center.y, center.z, !instant && !this.reducedMotion);
  }

  getState() {
    const t = this.target;
    return { target: [t.x, t.y, t.z], dist: this.dist, yaw: this.controls.azimuthAngle, pitch: Math.PI / 2 - this.controls.polarAngle };
  }

  setState(v: { target: number[]; dist: number; yaw: number; pitch: number }) {
    if (!v || v.target?.length !== 3 || ![v.dist, v.yaw, v.pitch, ...v.target].every(Number.isFinite)) return false;
    const d = this.clampDist(v.dist);
    const pitch = Math.max(-1.45, Math.min(1.45, v.pitch));
    const [x, y, z] = v.target;
    // Ignore a saved view that has wandered far outside the map.
    if (Math.hypot(x - this.home.x, y - this.home.y, z - this.home.z) > this._max * 2) return false;
    const off = new THREE.Vector3(Math.cos(pitch) * Math.sin(v.yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(v.yaw)).multiplyScalar(d);
    this.controls.setLookAt(x + off.x, y + off.y, z + off.z, x, y, z, false);
    this.userMoved = true;
    return true;
  }

  /** Jump straight to the desired state. */
  snap() { this.controls.update(10); }
}
