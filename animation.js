/* =====================================================================
 * animation.js  -  Keyframe tracks and linear interpolation
 *
 * One track per part id. Each track has six channels of the motion
 * added on top of the rest pose (the joint offset stays in getParts):
 *   tx, ty, tz   translation
 *   rx, ry, rz   rotation in radians
 * A channel is a list of { t, value }, with t in the clock's 0–100
 * range, sorted by t.
 *
 * sample(id, time) does not read the clock. The caller passes
 * clock.time. A channel with no keys is 0, so a part with no
 * animation stays at the rest pose. Before the first key the first
 * value is held, between two keys the value is linear, and after the
 * last key the last value is held.
 *
 * save / load write that clip as JSON: a list of
 * { id, channel, t, value }. The file is only the keyframes. It does
 * not mention meshes, joint offsets, or the OBJ loader.
 * ===================================================================== */

const ANIM_CHANNELS = ["tx", "ty", "tz", "rx", "ry", "rz"];

const animation = {
  // Map<partId, { tx: [{t, value}, ...], ... }>
  tracks: new Map(),

  setKeyframe(id, channel, t, value) {
    if (!ANIM_CHANNELS.includes(channel)) {
      throw new Error("unknown channel: " + channel);
    }
    let track = this.tracks.get(id);
    if (!track) {
      track = {};
      for (const name of ANIM_CHANNELS) track[name] = [];
      this.tracks.set(id, track);
    }
    const keys = track[channel];
    const next = { t, value };
    const at = keys.findIndex((k) => k.t === t);
    if (at >= 0) keys[at] = next;
    else keys.push(next);
    keys.sort((a, b) => a.t - b.t);
  },

  removeKeyframe(id, channel, t) {
    const track = this.tracks.get(id);
    if (!track || !track[channel]) return;
    const keys = track[channel];
    const at = keys.findIndex((k) => k.t === t);
    if (at >= 0) keys.splice(at, 1);
  },

  // Local motion at `time`. Zeros mean "no offset from the rest pose".
  sample(id, time) {
    const track = this.tracks.get(id);
    const pose = {};
    for (const name of ANIM_CHANNELS) {
      pose[name] = track ? sampleChannel(track[name], time) : 0;
    }
    return pose;
  },

  // Flat list, so a saved file does not depend on Map or channel order.
  toJSON() {
    const rows = [];
    for (const [id, track] of this.tracks) {
      for (const channel of ANIM_CHANNELS) {
        for (const key of track[channel]) {
          rows.push({ id, channel, t: key.t, value: key.value });
        }
      }
    }
    return rows;
  },

  // Replace the whole clip. A bad file leaves the current tracks in place.
  load(text) {
    const rows = parseAnimation(text);
    this.tracks = new Map();
    for (const row of rows) this.setKeyframe(row.id, row.channel, row.t, row.value);
  },

  // Download the current clip. Nothing is drawn; the browser saves the file.
  save(filename = "animation.json") {
    const json = JSON.stringify(this.toJSON(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};

function parseAnimation(text) {
  let rows;
  try {
    rows = JSON.parse(text);
  } catch (err) {
    throw new Error("animation file is not valid JSON");
  }
  if (!Array.isArray(rows)) throw new Error("animation file must be a list of keyframes");
  return rows.map((row, i) => {
    if (!row || typeof row !== "object") throw new Error("bad keyframe at " + i);
    const id = row.id;
    const channel = row.channel;
    const t = row.t;
    const value = row.value;
    if (!Number.isFinite(id) || !ANIM_CHANNELS.includes(channel) ||
        !Number.isFinite(t) || !Number.isFinite(value)) {
      throw new Error("bad keyframe at " + i);
    }
    return { id, channel, t, value };
  });
}

function sampleChannel(keys, time) {
  if (!keys || keys.length === 0) return 0;
  if (time <= keys[0].t) return keys[0].value;
  const last = keys[keys.length - 1];
  if (time >= last.t) return last.value;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (time < a.t || time > b.t) continue;
    const span = b.t - a.t;
    if (span === 0) return b.value;
    const u = (time - a.t) / span;
    return a.value + (b.value - a.value) * u;
  }
  return last.value;
}

// The buttons are optional. save() and load() work without them.
const animSaveBtn = document.getElementById("animSaveBtn");
const animLoadBtn = document.getElementById("animLoadBtn");
const animFile = document.getElementById("animFile");
const animStatus = document.getElementById("animStatus");
if (animSaveBtn && animLoadBtn && animFile) {
  animSaveBtn.onclick = () => {
    animation.save();
    if (animStatus) animStatus.textContent = "Saved " + animation.toJSON().length + " keyframes";
  };
  animLoadBtn.onclick = () => animFile.click();
  animFile.onchange = () => {
    const file = animFile.files && animFile.files[0];
    animFile.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        animation.load(reader.result);
        if (animStatus) animStatus.textContent = "Loaded " + animation.toJSON().length + " keyframes";
      } catch (err) {
        if (animStatus) animStatus.textContent = err.message;
      }
    };
    reader.readAsText(file);
  };
}
