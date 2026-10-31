// Seeded random numbers for the game engine – never Math.random (DESIGN §3).
// sfc32 (Chris Doty-Humphrey's Small Fast Counting generator, public domain; passes PractRand to 2^41+ bytes): four 32-bit
// words of state, so a stream is saved and restored exactly. Each subsystem draws from its own NAMED stream, derived from
// the race's master seed and the name: one model drawing more or fewer numbers never shifts another's sequence (adding a
// pit-crew error check must not change who crashes on lap 30).

// 32-bit FNV-1a of a string, then a murmur3 finaliser – spreads similar names ("driver:1", "driver:11") apart
function hash32(str, seed = 0x811c9dc5) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
  return h >>> 0;
}

export class Stream {
  constructor(a, b, c, d) { this.a = a >>> 0; this.b = b >>> 0; this.c = c >>> 0; this.d = d >>> 0; this.spare = null; }
  // uniform 32-bit integer
  u32() {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = (this.b ^ (this.b >>> 9)) >>> 0;   // (unsigned like the other words: the same bits – v0.52, a saved stream read back equal)
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
    this.c = (this.c + t) >>> 0;
    return t;
  }
  // uniform [0, 1) with 32 bits
  next() { return this.u32() / 4294967296; }
  // standard normal (Marsaglia polar; the spare is part of the state, so it is saved too)
  normal() {
    if (this.spare != null) { const s = this.spare; this.spare = null; return s; }
    let u, v, q;
    do { u = this.next() * 2 - 1; v = this.next() * 2 - 1; q = u * u + v * v; } while (q >= 1 || q === 0);
    const f = Math.sqrt((-2 * Math.log(q)) / q);
    this.spare = v * f; return u * f;
  }
  // true with probability p (p outside [0, 1] clamps)
  chance(p) { return this.next() < p; }
  save() { return [this.a, this.b, this.c, this.d, this.spare]; }
  static load(s) { const r = new Stream(s[0], s[1], s[2], s[3]); r.spare = s[4] ?? null; return r; }
}

// a stream from a master seed and a name; 12 discarded outputs mix the seeded words (sfc32's recommended warm-up)
export function streamFor(seed, name) {
  const s = seed >>> 0, r = new Stream(hash32(name, s), hash32(name, s ^ 0x9e3779b9), hash32(name, s ^ 0x7f4a7c15), 1);
  for (let i = 0; i < 12; i++) r.u32();
  return r;
}

// All of a race's streams, made on first use by name and saved together (DESIGN §14).
export class Streams {
  constructor(seed) { this.seed = seed >>> 0; this.map = new Map(); }
  get(name) { let r = this.map.get(name); if (!r) { r = streamFor(this.seed, name); this.map.set(name, r); } return r; }
  save() { const o = {}; for (const [k, v] of [...this.map].sort((x, y) => (x[0] < y[0] ? -1 : 1))) o[k] = v.save(); return { seed: this.seed, streams: o }; }
  static load(s) { const R = new Streams(s.seed); for (const [k, v] of Object.entries(s.streams)) R.map.set(k, Stream.load(v)); return R; }
}
