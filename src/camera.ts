import * as THREE from "three";

/**
 * Camera that orbits a focus point, with continuous zoom toward the cursor and
 * "driving" controls (move the focus point forward / turn / rise).
 * Every input changes a desired state; the camera eases toward it each frame.
 */
export class CameraRig {
  readonly camera: any;
  target = new THREE.Vector3();
  /** Centre of the whole map; zooming out drifts back toward it. */
  home = new THREE.Vector3();
  dist = 120;
  yaw = 0.7;
  pitch = 0.32;
  private cTarget = new THREE.Vector3();
  private cDist = 120;
  private cYaw = 0.7;
  private cPitch = 0.32;
  minDist = 0.35;
  maxDist = 600;
  reducedMotion = false;
  /** Set when the user has moved the camera themselves. */
  userMoved = false;

  constructor(camera: any) {
    this.camera = camera;
  }

  private offset(dist: number, yaw: number, pitch: number) {
    return new THREE.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)).multiplyScalar(dist);
  }

  /** Position the desired state would put the camera at. */
  desiredPosition() { return this.target.clone().add(this.offset(this.dist, this.yaw, this.pitch)); }

  forward() { return this.offset(1, this.cYaw, this.cPitch).negate(); }

  update(dt: number) {
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
    this.cTarget.lerp(this.target, k);
    // Interpolate distance in log space so zoom feels even across the range.
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

  get currentDist() { return this.cDist; }
  get currentTarget() { return this.cTarget; }
  get currentYaw() { return this.cYaw; }

  clampDist(d: number) { return Math.min(this.maxDist, Math.max(this.minDist, d)); }

  orbit(dx: number, dy: number) {
    this.yaw -= dx * 0.005;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + dy * 0.005));
    this.userMoved = true;
  }

  pan(dx: number, dy: number, viewportH: number) {
    const scale = (this.dist * 2 * Math.tan((this.camera.fov * Math.PI) / 360)) / viewportH;
    const fwd = this.offset(1, this.yaw, this.pitch).negate();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    this.target.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
    this.userMoved = true;
  }

  /** factor < 1 zooms in. ndc is the cursor position in normalized device coords. */
  zoomAt(factor: number, ndcX = 0, ndcY = 0) {
    if (factor < 1 && this.dist * factor < this.minDist) {
      // As close as orbiting allows: keep diving by moving forward toward the pointer.
      const cam = this.camera.clone();
      cam.position.copy(this.desiredPosition());
      cam.lookAt(this.target);
      cam.updateMatrixWorld();
      const dir = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(cam).sub(cam.position).normalize();
      this.target.addScaledVector(dir, Math.max(0.6, this.minDist * 6) * (1 - factor) * 4);
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
    const dir = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(cam).sub(cam.position).normalize();
    if (f < 1) {
      // Zoom in toward the pointer.
      const p = cam.position.clone().addScaledVector(dir, this.dist);
      this.target.add(p.sub(this.target).multiplyScalar(1 - f));
    } else {
      // Zoom out drifts back toward the map centre, reaching it at the widest view.
      const span = this.maxDist - this.dist;
      const k = span > 1e-6 ? Math.min(1, (newDist - this.dist) / span) : 1;
      this.target.lerp(this.home, k);
    }
    this.dist = newDist;
    this.userMoved = true;
  }

  setDist(d: number) { this.dist = this.clampDist(d); this.userMoved = true; }

  /** Driving: forward/back along the view, turn left/right, rise/sink. Units per second. */
  drive(forward: number, turn: number, rise: number, dt: number) {
    if (!forward && !turn && !rise) return;
    const speed = Math.max(this.dist, 3) * 0.9 * dt;
    const fwd = this.offset(1, this.yaw, this.pitch).negate();
    this.target.addScaledVector(fwd, forward * speed);
    this.target.y += rise * speed;
    this.yaw -= turn * 1.4 * dt;
    this.userMoved = true;
  }

  flyTo(point: { x: number; y: number; z: number }, dist?: number) {
    this.target.set(point.x, point.y, point.z);
    if (dist !== undefined) this.dist = this.clampDist(dist);
  }

  overview(center: { x: number; y: number; z: number }, radius: number, instant = false) {
    this.home.set(center.x, center.y, center.z);
    this.target.set(center.x, center.y, center.z);
    this.dist = this.clampDist(radius * 2.35);
    this.pitch = 0.32;
    if (instant) this.snap();
  }

  getState() {
    return { target: [this.target.x, this.target.y, this.target.z], dist: this.dist, yaw: this.yaw, pitch: this.pitch };
  }

  setState(v: { target: number[]; dist: number; yaw: number; pitch: number }) {
    if (!v || v.target?.length !== 3 || ![v.dist, v.yaw, v.pitch, ...v.target].every(Number.isFinite)) return false;
    this.target.set(v.target[0], v.target[1], v.target[2]);
    this.dist = this.clampDist(v.dist);
    this.yaw = v.yaw;
    this.pitch = Math.max(-1.45, Math.min(1.45, v.pitch));
    this.userMoved = true;
    this.snap();
    return true;
  }

  snap() {
    this.cTarget.copy(this.target);
    this.cDist = this.dist;
    this.cYaw = this.yaw;
    this.cPitch = this.pitch;
  }
}
