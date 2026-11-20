/* =====================================================================
 * clock.js  -  Animation playhead
 *
 * The clock only stores a time in [0, duration] and whether it is
 * running. It does not know about parts, keyframes, or matrices.
 * The render loop calls tick() once per frame. Later, getParts() and
 * the timeline UI read `time`; play / pause / stop are what the
 * transport buttons call.
 *
 * msPerUnit is real milliseconds per timeline unit. 50 means the
 * full 0–100 range lasts 5 seconds. At 100 the clock stops. play()
 * at the end restarts from 0.
 * ===================================================================== */

const clock = {
  time: 0,
  duration: 100,
  playing: false,
  msPerUnit: 50,
  _last: null,

  play() {
    if (this.playing) return;
    if (this.time >= this.duration) this.time = 0;
    this.playing = true;
    this._last = null; // first tick only records the timestamp
  },

  pause() {
    this.playing = false;
    this._last = null;
  },

  stop() {
    this.playing = false;
    this.time = 0;
    this._last = null;
  },

  // `now` is the requestAnimationFrame timestamp. A long gap (hidden
  // tab) is capped so one frame cannot skip the rest of the clip.
  tick(now) {
    if (!this.playing) return;
    if (this._last == null) {
      this._last = now;
      return;
    }
    const dt = Math.min(now - this._last, 100);
    this._last = now;
    this.time += dt / this.msPerUnit;
    if (this.time >= this.duration) {
      this.time = this.duration;
      this.playing = false;
      this._last = null;
    }
  },
};
