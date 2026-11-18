/* =====================================================================
 * camera.js  -  Orbit camera with mouse rotate / pan / zoom
 *
 * Covers the assignment's camera requirements (10 pts: mouse orbit +
 * pan + zoom). Written from scratch for this assignment.
 *
 * HOW IT WORKS
 * The camera does not store a free position. It stores:
 *   - target   : the world point we orbit around and look at
 *   - distance : how far the eye is from the target (zoom)
 *   - yaw      : rotation around the world Y axis   (left/right orbit)
 *   - pitch    : elevation angle above the XZ plane (up/down orbit)
 * The eye position is derived from these spherical coordinates, so
 * rotating never changes the distance and the model stays centred.
 *
 * CONTROLS
 *   Left drag              -> orbit (rotate)
 *   Right drag / Shift+drag-> pan   (move the target in the screen plane)
 *   Mouse wheel            -> zoom  (change distance)
 *
 * PICKING HOOK
 * Later you will implement mouse picking for direct manipulation. Set
 *   camera.onPointerDownHook = (event) => true;  // return true to "claim" it
 * and the camera will ignore that drag, so picking and orbiting don't
 * fight over the left mouse button.
 * ===================================================================== */

class OrbitCamera {
  constructor(canvas, options = {}) {
    this.canvas = canvas;

    // ---- Camera state (spherical coordinates around the target) ----
    this.target   = options.target   || [0, 0.5, 0];
    this.distance = options.distance || 6;
    this.yaw      = options.yaw      || 0.6;   // radians
    this.pitch    = options.pitch    || 0.4;   // radians

    // ---- Projection parameters ----
    this.fovy = options.fovy || (45 * Math.PI / 180);
    this.near = options.near || 0.1;
    this.far  = options.far  || 100;

    // ---- Tuning constants ----
    this.rotateSpeed = 0.008;  // radians per pixel dragged
    this.zoomSpeed   = 0.001;  // exponent factor per wheel unit
    this.minDistance = 0.5;
    this.maxDistance = 50;

    // ---- Drag bookkeeping ----
    this.mode = null;          // null | "rotate" | "pan"
    this.lastX = 0;
    this.lastY = 0;
    this.onPointerDownHook = null; // optional picking hook (see header)

    this._bindEvents();
  }

  /* Eye position from spherical coordinates:
   *   x = d * cos(pitch) * sin(yaw)
   *   y = d * sin(pitch)
   *   z = d * cos(pitch) * cos(yaw)   (all offset by the target) */
  getEyePosition() {
    const cp = Math.cos(this.pitch);
    return [
      this.target[0] + this.distance * cp * Math.sin(this.yaw),
      this.target[1] + this.distance * Math.sin(this.pitch),
      this.target[2] + this.distance * cp * Math.cos(this.yaw),
    ];
  }

  // View matrix: look from the eye at the target, world Y is "up".
  getViewMatrix() {
    return mat4.lookAt(this.getEyePosition(), this.target, [0, 1, 0]);
  }

  // Projection matrix; the aspect ratio is read live so resizing works.
  getProjectionMatrix() {
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    return mat4.perspective(this.fovy, aspect, this.near, this.far);
  }

  /* ---------------------------- Input handling ---------------------------- */
  _bindEvents() {
    const c = this.canvas;

    // Pointer events unify mouse/pen/touch. Capture keeps receiving
    // move events even if the cursor leaves the canvas mid-drag.
    c.addEventListener("pointerdown", (e) => {
      if (this.onPointerDownHook && this.onPointerDownHook(e)) return; // picking claimed it
      // Right button (2), middle button (1) or Shift+left means pan.
      this.mode = (e.button === 2 || e.button === 1 || e.shiftKey) ? "pan" : "rotate";
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      c.setPointerCapture(e.pointerId);
    });

    c.addEventListener("pointermove", (e) => {
      if (!this.mode) return;
      const dx = e.clientX - this.lastX;   // pixels moved since last event
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      if (this.mode === "rotate") this._rotate(dx, dy);
      else this._pan(dx, dy);
    });

    const end = (e) => {
      this.mode = null;
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);

    // Zoom: multiplicative so it feels the same at any distance.
    c.addEventListener("wheel", (e) => {
      e.preventDefault(); // stop the page from scrolling
      this.distance *= Math.exp(e.deltaY * this.zoomSpeed);
      this.distance = Math.min(this.maxDistance, Math.max(this.minDistance, this.distance));
    }, { passive: false });

    // Disable the browser's right-click menu so right-drag can pan.
    c.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  // Orbit: horizontal drag changes yaw, vertical drag changes pitch.
  _rotate(dx, dy) {
    this.yaw   -= dx * this.rotateSpeed;  // drag right -> scene turns right
    this.pitch += dy * this.rotateSpeed;  // drag down  -> camera rises
    // Clamp just below +-90 degrees to avoid flipping at the poles
    // (lookAt breaks when the view direction is parallel to "up").
    const limit = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
  }

  /* Pan: slide the target in the camera's own screen plane.
   * Right/up vectors are read from the view matrix rows, so panning is
   * always relative to what you see. Pixels are converted to world units
   * with the visible height at the target distance:
   *   worldHeight = 2 * distance * tan(fovy / 2)
   * giving worldPerPixel = worldHeight / canvasHeight, so the scene
   * follows the cursor exactly at any zoom level. */
  _pan(dx, dy) {
    const view = this.getViewMatrix();
    const right = [view[0], view[4], view[8]];
    const up    = [view[1], view[5], view[9]];
    const worldPerPixel =
      (2 * this.distance * Math.tan(this.fovy / 2)) / this.canvas.clientHeight;
    // Scene follows the cursor, so the camera target moves the opposite way.
    this.target = vec3.sub(this.target, vec3.scale(right, dx * worldPerPixel));
    this.target = vec3.add(this.target, vec3.scale(up,    dy * worldPerPixel));
  }

  // Reset helper for a "Reset camera" button.
  reset() {
    this.target = [0, 0.5, 0];
    this.distance = 6;
    this.yaw = 0.6;
    this.pitch = 0.4;
  }
}
