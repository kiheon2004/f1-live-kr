// Test helper: writes small self-contained GLB files (glTF 2.0 binary) – a box w × h × d metres standing on its
// base (origin at the base centre), optionally with an embedded PNG texture – for the facility model tests.
const zlib = require("node:zlib");

function png(w, h, rgba) {
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), c = Buffer.alloc(4); len.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) raw[y * (w * 4 + 1) + 1 + x * 4 + k] = rgba[k]; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function boxGlb({ w = 10, h = 5, d = 4, texture = false, externalImage = false } = {}) {
  const x = w / 2, z = d / 2;
  const P = [[-x, 0, -z], [x, 0, -z], [x, h, -z], [-x, h, -z], [-x, 0, z], [x, 0, z], [x, h, z], [-x, h, z]];
  const F = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]];
  const pos = [], uv = [], idx = [];
  for (const f of F) { const b = pos.length / 3; for (const [k, i] of f.entries()) { pos.push(...P[i]); uv.push(k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0); } idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  const pb = Buffer.from(new Float32Array(pos).buffer), ub = Buffer.from(new Float32Array(uv).buffer), ib = Buffer.from(new Uint16Array(idx).buffer);
  const img = texture && !externalImage ? png(4, 4, [200, 30, 40, 255]) : Buffer.alloc(0);
  const pad = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
  const parts = [pad(pb), pad(ub), pad(ib), pad(img)];
  const off = []; let o = 0; for (const p of parts) { off.push(o); o += p.length; }
  const bin = Buffer.concat(parts);
  const json = {
    asset: { version: "2.0", generator: "f1-live-kr test" },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: "box" }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.8, 0.8, 0.8, 1], metallicFactor: 0, roughnessFactor: 0.7, ...(texture ? { baseColorTexture: { index: 0 } } : {}) } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: off[0], byteLength: pb.length }, { buffer: 0, byteOffset: off[1], byteLength: ub.length }, { buffer: 0, byteOffset: off[2], byteLength: ib.length },
      ...(texture && !externalImage ? [{ buffer: 0, byteOffset: off[3], byteLength: img.length }] : [])],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.length / 3, type: "VEC3", min: [-x, 0, -z], max: [x, h, z] },
      { bufferView: 1, componentType: 5126, count: uv.length / 2, type: "VEC2" },
      { bufferView: 2, componentType: 5123, count: idx.length, type: "SCALAR" },
    ],
    ...(texture ? { textures: [{ source: 0 }], images: [externalImage ? { uri: "outside.png" } : { bufferView: 3, mimeType: "image/png" }] } : {}),
  };
  const jb = Buffer.from(JSON.stringify(json)), jpad = Buffer.concat([jb, Buffer.alloc((4 - (jb.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jpad.length + 8 + bin.length, 8);
  jh.writeUInt32LE(jpad.length, 0); jh.writeUInt32LE(0x4e4f534a, 4); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, jh, jpad, bh, bin]);
}

module.exports = { boxGlb, png };
