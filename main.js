/* =====================================================================
 * main.js  -  WebGL 2 setup, geometry, and render loop for the camera
 * environment. Draws a ground grid, coloured axes and a few lit,
 * textured cubes so you can test orbit / pan / zoom.
 * ===================================================================== */

const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext("webgl2");
if (!gl) alert("WebGL 2 is not supported in this browser.");

/* ---------------------------- Shader helpers ---------------------------- */
function compileShader(type, source) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    // Log the GLSL compiler error: the first place to look when the screen is black.
    console.error(gl.getShaderInfoLog(sh));
  }
  return sh;
}

function createProgram(vsId, fsId) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(gl.VERTEX_SHADER,   document.getElementById(vsId).textContent));
  gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, document.getElementById(fsId).textContent));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(prog));
  return prog;
}

const litProgram  = createProgram("lit-vs",  "lit-fs");
const lineProgram = createProgram("line-vs", "line-fs");
const pickProgram = createProgram("pick-vs", "pick-fs"); // used only for mouse picking

/* ------------------------------ Cube geometry ------------------------------ */
function buildCube() {
  // Each face: outward normal, then two tangent axes u and v spanning the face.
  const faces = [
    { n: [ 1, 0, 0], u: [0, 0,-1], v: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [ 0, 1, 0], u: [1, 0, 0], v: [0, 0,-1] },
    { n: [ 0,-1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [ 0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [ 0, 0,-1], u: [-1,0, 0], v: [0, 1, 0] },
  ];
  const verts = [], indices = [];
  faces.forEach((f, i) => {
    [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([a, b]) => {
      const p = [0, 1, 2].map(k => 0.5 * (f.n[k] + a * f.u[k] + b * f.v[k]));
      verts.push(...p, ...f.n, (a + 1) / 2, (b + 1) / 2);
    });
    const o = i * 4; // two triangles per face
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  return { verts: new Float32Array(verts), indices: new Uint16Array(indices) };
}

const cube = buildCube();
const cubeVAO = gl.createVertexArray();
gl.bindVertexArray(cubeVAO); 
const cubeVBO = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cubeVBO);
gl.bufferData(gl.ARRAY_BUFFER, cube.verts, gl.STATIC_DRAW);
const cubeEBO = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeEBO);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cube.indices, gl.STATIC_DRAW);
const STRIDE = 8 * 4; // 8 floats * 4 bytes
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE, 0);      // position
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE, 3 * 4);  // normal
gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, STRIDE, 6 * 4);  // uv
gl.bindVertexArray(null);

/* ------------------------- Grid + axes (line geometry) ------------------------- */
// Interleaved: position(3) colour(3)
function buildGridAndAxes() {
  const data = [];
  const half = 10, gridColor = [0.35, 0.35, 0.4];
  for (let i = -half; i <= half; i++) {
    data.push(i, 0, -half, ...gridColor,  i, 0, half, ...gridColor); // line parallel to Z
    data.push(-half, 0, i, ...gridColor,  half, 0, i, ...gridColor); // line parallel to X
  }
  const gridVertexCount = data.length / 6;
  data.push(0,0,0, 1,0,0,  2,0,0, 1,0,0);  
  data.push(0,0,0, 0,1,0,  0,2,0, 0,1,0);  
  data.push(0,0,0, 0,0,1,  0,0,2, 0,0,1);  
  return { data: new Float32Array(data), gridVertexCount, total: data.length / 6 };
}
const lines = buildGridAndAxes();
const lineVAO = gl.createVertexArray();
gl.bindVertexArray(lineVAO);
const lineVBO = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, lineVBO);
gl.bufferData(gl.ARRAY_BUFFER, lines.data, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 6 * 4, 0);
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 6 * 4, 3 * 4);
gl.bindVertexArray(null);

/* ------------------------------ Texture loading ------------------------------ */
/*
 *   1. create the texture immediately and fill it with a 1x1 grey pixel
 *      (the cube shows grey instead of black while the file loads),
 *   2. start loading the image,
 *   3. when it arrives, upload it into the SAME texture object.
 * We try "texture.png" first and fall back to "texture.jpg". */
function loadTexture(urls) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  // Placeholder
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                new Uint8Array([160, 160, 160, 255]));

  function tryLoad(i) {
    if (i >= urls.length) {
      console.error("Could not load any of: " + urls.join(", "));
      return;
    }
    const img = new Image();
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); 
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    };
    img.onerror = () => tryLoad(i + 1);
    img.src = urls[i];
  }
  tryLoad(0);
  return tex;
}
const cubeTexture = loadTexture(["texture.png", "texture.jpg"]);

/* ------------------------------ Camera + UI ------------------------------ */
const camera = new OrbitCamera(canvas);
document.getElementById("resetBtn").onclick = () => camera.reset();

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.floor(canvas.clientWidth * dpr);
  const h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
}

/* ------------------------------ Render loop ------------------------------ */
gl.enable(gl.DEPTH_TEST);
gl.clearColor(0.105, 0.105, 0.135, 1);

const U = {};
["projection","view","model","lightPos","lightColor","ambientColor","viewPos","myTexture",
 "highlightColor","highlightAmount"]
  .forEach(n => U[n] = gl.getUniformLocation(litProgram, n));
const UP = {}; // uniform locations of the picking program
["projection","view","model","pickColor"]
  .forEach(n => UP[n] = gl.getUniformLocation(pickProgram, n));
const UL = {
  projection: gl.getUniformLocation(lineProgram, "projection"),
  view:       gl.getUniformLocation(lineProgram, "view"),
};

function drawCube(model, modelLoc = U.model) {
  gl.uniformMatrix4fv(modelLoc, false, model);
  gl.drawElements(gl.TRIANGLES, cube.indices.length, gl.UNSIGNED_SHORT, 0);
}

// Draw any part: a loaded mesh (non-indexed, drawArrays) or the demo cube
// (indexed, drawElements). Binds the right VAO each time because the two
// kinds of part have different buffers.
function drawPart(part, modelLoc = U.model) {
  if (part.mesh) {
    gl.bindVertexArray(part.mesh.vao);
    gl.uniformMatrix4fv(modelLoc, false, part.model);
    gl.drawArrays(gl.TRIANGLES, 0, part.mesh.count);
  } else {
    gl.bindVertexArray(cubeVAO);
    drawCube(part.model, modelLoc);
  }
}

/* ------------------------------ OBJ mesh loading ------------------------------ */
const meshes = new Map(); // name -> { name, id, vao, vbo, count, size }

/*
 * OBJ stores positions (v), texture coordinates (vt) and normals (vn) in
 * SEPARATE lists, and each face corner ("f") picks one entry from each list
 * by index ("v/vt/vn"). WebGL wants one complete vertex per index, so we
 * "de-index": every face corner is expanded into its own full vertex. This
 * uses more memory than sharing vertices but is simple and fine at insect
 * scale. */
function parseOBJ(text) {
  const P = [], T = [], N = [];   // the three separate OBJ lists
  const out = [];                  // final interleaved floats
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  // OBJ indices are 1-based; negative ones count back from the END of the
  // list so far (-1 = the most recently defined entry).
  const resolve = (s, list) => { const i = parseInt(s, 10); return i < 0 ? list.length + i : i - 1; };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line[0] === "#") continue;      // skip blanks and comments
    const tok = line.split(/\s+/);

    if (tok[0] === "v")  P.push([+tok[1], +tok[2], +tok[3]]);
    else if (tok[0] === "vt") T.push([+tok[1], +tok[2]]);
    else if (tok[0] === "vn") N.push([+tok[1], +tok[2], +tok[3]]);
    else if (tok[0] === "f") {
      // Each corner looks like "7", "7/2", "7//3" or "7/2/3".
      const corners = tok.slice(1).map((c) => {
        const [pi, ti, ni] = c.split("/");   
        const p = P[resolve(pi, P)];
        if (!p) throw new Error("face refers to a missing vertex: " + line);
        return { p, t: ti ? T[resolve(ti, T)] : null, n: ni ? N[resolve(ni, N)] : null };
      });

      // Triangulate: a face with k corners becomes a fan of k-2 triangles
      // (0,1,2), (0,2,3), ... Correct for any convex polygon, e.g. quads.
      for (let i = 1; i < corners.length - 1; i++) {
        const tri = [corners[0], corners[i], corners[i + 1]];

        // If the file has no normals, use the triangle's flat normal
        // (cross product of two edges). The mesh then looks faceted, not smooth.
        const flat = vec3.normalize(vec3.cross(
          vec3.sub(tri[1].p, tri[0].p), vec3.sub(tri[2].p, tri[0].p)));

        for (const c of tri) {
          const n = c.n || flat;
          const uv = c.t || [0, 0];              // no UVs: everything samples one texel
          out.push(c.p[0], c.p[1], c.p[2], n[0], n[1], n[2], uv[0], uv[1]);
          for (let k = 0; k < 3; k++) {          // track the bounding box
            min[k] = Math.min(min[k], c.p[k]);
            max[k] = Math.max(max[k], c.p[k]);
          }
        }
      }
    }
  }
  if (out.length === 0) throw new Error("no faces found (is this an OBJ file?)");
  return {
    data: new Float32Array(out),
    count: out.length / 8,                       // number of vertices
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
}

function createMesh(name, parsed, id) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, parsed.data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE, 3 * 4);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, STRIDE, 6 * 4);
  gl.bindVertexArray(null);
  return { name, id, vao, vbo, count: parsed.count, size: parsed.size };
}

function deleteMesh(mesh) {
  gl.deleteBuffer(mesh.vbo);
  gl.deleteVertexArray(mesh.vao);
}

function allocateId() {
  const used = new Set([...meshes.values()].map((m) => m.id));
  for (let id = 3; id <= 255; id++) if (!used.has(id)) return id;
  throw new Error("too many meshes (limit 253)");
}

/* Make the scene contain EXACTLY the files in `names`:
 *   - every listed file is (re)fetched and (re)parsed, so edits to a file on
 *     disk show up when you press Load again,
 *   - files that are loaded but not listed are unloaded,
 *   - a file that fails to load is reported and, if an older version was
 *     already loaded, that older version is kept.
 */
let loadGeneration = 0;
async function loadFiles(names) {
  const generation = ++loadGeneration;
  const statusLines = [];

  const results = await Promise.all(names.map(async (name) => {
    try {
      const response = await fetch(name, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status + " " + response.statusText);
      return { name, parsed: parseOBJ(await response.text()) };
    } catch (err) {
      return { name, error: err.message };
    }
  }));

  if (generation !== loadGeneration) return; // a newer Load click took over

  // 1. Unload everything that is no longer mentioned.
  const wanted = new Set(names);
  for (const [name, mesh] of meshes) {
    if (!wanted.has(name)) {
      deleteMesh(mesh);
      meshes.delete(name);   
      statusLines.push("Unloaded " + name);
    }
  }

  // 2. Add or replace the listed files.
  for (const r of results) {
    if (r.error) { statusLines.push(r.name + ": FAILED - " + r.error); continue; }
    try {
      const old = meshes.get(r.name);
      const id = old ? old.id : allocateId();   
      const mesh = createMesh(r.name, r.parsed, id);
      if (old) deleteMesh(old);
      meshes.set(r.name, mesh);
      const s = mesh.size.map((v) => v.toFixed(2)).join(" x ");
      statusLines.push(r.name + ": " + (mesh.count / 3) + " triangles, size " + s);
    } catch (err) {
      statusLines.push(r.name + ": FAILED - " + err.message);
    }
  }

  //If the selected part just disappeared, clear the selection.
  if (!getParts().some((p) => p.id === selectedId)) {
    selectedId = 0;
    document.getElementById("picked").textContent = "none";
  }
  document.getElementById("status").textContent = statusLines.join("\n");
}

function partName(id) {
  if (id === 1) return "body (demo cube)";
  if (id === 2) return "head (demo cube)";
  for (const m of meshes.values()) if (m.id === id) return m.name;
  return "none";
}

/* ------------------------------ Model parts ------------------------------ */
/* Every pickable part has a unique ID (1, 2, 3, ...; 0 is reserved for
 * "nothing / background") and a name for the UI. getParts() returns each
 * part's world matrix for the current time, so the same list is used for
 * normal drawing AND for the picking pass. They always agree, even while a
 * part is animating.
 *
 * Two matrices per part, as discussed: `transform` is what children inherit
 * (translation/rotation only), `model` is transform * scale and is only used
 * to draw this part's own cube. */
// (Part names for the UI come from partName(), defined with the mesh loader.)

function getParts() {
  const t = performance.now() / 1000;

  const bodyTransform = mat4.translation(0, 0.5, 0);
  const bodyModel = mat4.multiply(bodyTransform, mat4.scaling(1.5, 1, 1));

  /* Head: parent transform * local transform. Local is applied right to
   * left: scale the cube, rotate it (the animated joint), then move it to the
   * joint position relative to the parent. The head's centre is 1.0 from the
   * body's centre, which is exactly the body's half-width (0.75) plus the
   * head's half-width (0.25), so the two touch. */
  const headLocal = mat4.multiply(
    mat4.translation(1.0, 0.2, 0),
    mat4.multiply(mat4.rotationY(Math.sin(t) * 0.5), mat4.scaling(0.5, 0.5, 0.5))
  );
  const headModel = mat4.multiply(bodyTransform, headLocal);

  // Each part: { id, model matrix, mesh }. mesh === null means "the demo cube".
  const parts = [];

  // The demo cubes are only shown while no OBJ files are loaded; otherwise
  // they would clutter the scene. Unload all files to bring them back.
  if (meshes.size === 0) {
    parts.push({ id: 1, model: bodyModel, mesh: null });
    parts.push({ id: 2, model: headModel, mesh: null });
  }

  // Loaded meshes are drawn exactly as they are in the file (identity
  // matrix). When you build the insect hierarchy, compute a matrix per mesh
  // here, the same way the head's matrix is computed above.
  for (const m of meshes.values()) {
    parts.push({ id: m.id, model: mat4.identity(), mesh: m });
  }
  return parts;
}

/* ------------------------------ Picking ------------------------------ */
/* COLOUR-ID PICKING. The idea:
 *   1. Redraw the scene where every part is a flat colour that encodes its
 *      ID (no lighting, no texture).
 *   2. Read back the single pixel under the mouse.
 *   3. The colour of that pixel is the ID of the part under the cursor.
 * Because the GPU's depth test runs normally, the nearest part wins, and the
 * pick is exact for any shape or animation, with no ray maths needed.
 *
 * Efficiency trick: a scissor test restricts all drawing and clearing to the
 * single pixel we care about, so the extra pass costs almost nothing. The
 * pass runs inside render(), before the normal clear, so the picking colours
 * are overwritten by the real image and are never visible on screen. */
let pendingPick = null; // {x, y} in canvas pixels, set by the click handler
let selectedId = 0;     // 0 = nothing selected

function runPick(parts, projection, view) {
  const px = pendingPick.x, py = pendingPick.y;
  pendingPick = null;

  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(px, py, 1, 1);
  gl.clearColor(0, 0, 0, 0);                 // ID 0 = background
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(pickProgram);
  gl.uniformMatrix4fv(UP.projection, false, projection);
  gl.uniformMatrix4fv(UP.view, false, view);
  for (const p of parts) {
    // Encode the ID in the red channel (8 bits -> up to 255 parts).
    // For more parts, spread the ID over the green and blue channels as well.
    gl.uniform4f(UP.pickColor, p.id / 255, 0, 0, 1);
    drawPart(p, UP.model);
  }

  const pixel = new Uint8Array(4);
  gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  gl.disable(gl.SCISSOR_TEST);               // back to normal full-screen drawing
  gl.clearColor(0.105, 0.105, 0.135, 1);     // restore the real background colour

  selectedId = pixel[0];                     // decode: red channel = ID
  document.getElementById("picked").textContent = partName(selectedId);
}

/* Click detection. A click should select, but a drag should only orbit/pan.
 * So we remember where the button went down and only count it as a click if
 * the pointer barely moved. This lives next to (not inside) the camera's
 * handlers, so both work on the same left mouse button without conflict. */
let downX = 0, downY = 0;
canvas.addEventListener("pointerdown", (e) => { downX = e.clientX; downY = e.clientY; });
canvas.addEventListener("pointerup", (e) => {
  if (e.button !== 0 || e.shiftKey) return;                  // left click only
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) return; // it was a drag
  const rect = canvas.getBoundingClientRect();
  // CSS pixels -> drawing-buffer pixels (they differ on hi-DPI screens).
  // readPixels/scissor have their origin at the BOTTOM-left, so flip Y.
  const x = Math.floor((e.clientX - rect.left) * canvas.width / rect.width);
  const y = Math.floor(canvas.height - (e.clientY - rect.top) * canvas.height / rect.height);
  pendingPick = { x: Math.min(Math.max(x, 0), canvas.width - 1),
                  y: Math.min(Math.max(y, 0), canvas.height - 1) };
});

function render() {
  resizeCanvas();

  // Both matrices come from the camera every frame, so mouse input is
  // reflected immediately.
  const projection = camera.getProjectionMatrix();
  const view = camera.getViewMatrix();
  const parts = getParts();

  // Handle a click from the last frame (if any) BEFORE the real drawing.
  if (pendingPick) runPick(parts, projection, view);

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // ---- Grid and axes ----
  gl.useProgram(lineProgram);
  gl.uniformMatrix4fv(UL.projection, false, projection);
  gl.uniformMatrix4fv(UL.view, false, view);
  gl.bindVertexArray(lineVAO);
  gl.drawArrays(gl.LINES, 0, lines.total);

  // ---- Lit, textured cubes ----
  gl.useProgram(litProgram);
  gl.uniformMatrix4fv(U.projection, false, projection);
  gl.uniformMatrix4fv(U.view, false, view);
  gl.uniform3fv(U.lightPos, [3, 5, 4]);
  gl.uniform3fv(U.lightColor, [1, 1, 1]);
  gl.uniform3fv(U.ambientColor, [1, 1, 1]);
  gl.uniform3fv(U.viewPos, camera.getEyePosition()); // specular depends on the eye
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, cubeTexture);
  gl.uniform1i(U.myTexture, 0);                      // sampler reads texture unit 0
  gl.bindVertexArray(cubeVAO);

  // Draw every part. The selected one is tinted with the highlight colour.
  gl.uniform3fv(U.highlightColor, [1.0, 0.8, 0.2]);
  for (const p of parts) {
    gl.uniform1f(U.highlightAmount, p.id === selectedId ? 0.5 : 0.0);
    drawPart(p);
  }

  requestAnimationFrame(render);
}

/* ------------------------------ File-list UI ------------------------------ */
// Pressing Load reads the text box, splits it into file names (commas,
// spaces, semicolons or new lines), removes duplicates and empty entries,
// and makes the scene match that list. An empty box unloads everything.
document.getElementById("loadBtn").onclick = () => {
  const names = [...new Set(
    document.getElementById("fileNames").value.split(/[\s,;]+/).filter((s) => s.length > 0)
  )];
  loadFiles(names);
};

requestAnimationFrame(render);
