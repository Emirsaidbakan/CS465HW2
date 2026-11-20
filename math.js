/* =====================================================================
 * math.js  -  Minimal vec3 / mat4 helpers written from scratch
 * (no gl-matrix / three.js, as the assignment requires).
 *
 * CONVENTION: matrices are Float32Array(16) in COLUMN-MAJOR order, which
 * is what WebGL's gl.uniformMatrix4fv expects (with transpose = false).
 * Element (row r, column c) lives at index  c * 4 + r.
 * ===================================================================== */

const vec3 = {
  add:   (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub:   (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot:   (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  normalize: (a) => {
    const len = Math.hypot(a[0], a[1], a[2]) || 1; // || 1 avoids divide-by-zero
    return [a[0] / len, a[1] / len, a[2] / len];
  },
};

const mat4 = {
  identity() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  },

  // out = a * b  (apply b first, then a, when multiplying column vectors)
  multiply(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
        out[c * 4 + r] = sum;
      }
    }
    return out;
  },

  // Translation matrix: the translation lives in the 4th column (indices 12..14)
  translation(x, y, z) {
    const m = mat4.identity();
    m[12] = x; m[13] = y; m[14] = z;
    return m;
  },

  // Non-uniform scale matrix: scale factors on the diagonal
  scaling(x, y, z) {
    const m = mat4.identity();
    m[0] = x; m[5] = y; m[10] = z;
    return m;
  },

  // Rotations about the principal axes (angle in radians). Same layout as
  // rotationY: column-major, right-handed, so a positive angle turns the
  // other two axes in the right-hand sense.
  rotationX(a) {
    const m = mat4.identity();
    const c = Math.cos(a), s = Math.sin(a);
    m[5] = c;  m[9] = -s;
    m[6] = s;  m[10] = c;
    return m;
  },

  rotationY(a) {
    const m = mat4.identity();
    const c = Math.cos(a), s = Math.sin(a);
    m[0] = c;  m[8] = s;
    m[2] = -s; m[10] = c;
    return m;
  },

  rotationZ(a) {
    const m = mat4.identity();
    const c = Math.cos(a), s = Math.sin(a);
    m[0] = c;  m[4] = -s;
    m[1] = s;  m[5] = c;
    return m;
  },

  /* Perspective projection (same maths as gluPerspective).
   * fovy   : vertical field of view in radians
   * aspect : canvas width / height
   * near/far : clipping planes (both positive)
   * Maps the view frustum to clip space; w = -z_view gives perspective divide. */
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const m = new Float32Array(16);
    m[0]  = f / aspect;
    m[5]  = f;
    m[10] = (far + near) / (near - far);
    m[11] = -1;                              // puts -z into w
    m[14] = (2 * far * near) / (near - far);
    return m;
  },

  /* View matrix (same maths as gluLookAt).
   * Builds an orthonormal camera basis (x = right, y = up, z = backwards)
   * and then expresses the world in that basis: rotate by the basis
   * transpose, then translate by -eye. */
  lookAt(eye, center, up) {
    const z = vec3.normalize(vec3.sub(eye, center)); // camera looks down -z
    const x = vec3.normalize(vec3.cross(up, z));     // right
    const y = vec3.cross(z, x);                      // true up (already unit)
    const m = new Float32Array(16);
    m[0] = x[0]; m[4] = x[1]; m[8]  = x[2]; m[12] = -vec3.dot(x, eye);
    m[1] = y[0]; m[5] = y[1]; m[9]  = y[2]; m[13] = -vec3.dot(y, eye);
    m[2] = z[0]; m[6] = z[1]; m[10] = z[2]; m[14] = -vec3.dot(z, eye);
    m[15] = 1;
    return m;
  },
};
