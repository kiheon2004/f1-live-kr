// The home screen's globe, drawn like the design's picture: an upright flat blue ball with a light 3 px edge and a
// fixed grid – two wide and two tall ellipses and the two centre lines – with the continents on it as rough flat shapes
// (globeland.js) and the season's circuits as markers.
// The ball and its grid are one SVG picture that does not turn; what turns is the globe underneath it – the land and
// the markers move over the ball – a camera
// around a unit sphere (three.js maths only: no WebGL context, nothing rendered): dragging, zooming, the slow turn and
// flying to a race move the markers over the ball, and a marker on the far side is hidden.
// Ownership: a Globe owns its SVG element, the camera and its controls, a ResizeObserver, its listeners and its marker
// elements; dispose() frees every one of them. It works only while started (the home screen shown) and only when
// something moved – the slow turn, a drag, a fly-to, a resize –; stop() ends the loop.
// Longitude 180°W is at the equirectangular left edge in HomeData.latLonToVec3.
import * as THREE from "./vendor/three.module.js";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { LAND } from "./globeland.js";

// (colours: the design tokens – the ball --c-blue, its edge, grid and the land --line; css/tokens.css)
const RIM = 1.03;                            // a point on the far side is drawn just outside the ball's edge (and cut off)
const R = 166;                               // the ball's radius in the picture's own units (as in the design)
const H = () => window.HomeData;
const SVG = "http://www.w3.org/2000/svg";

export class Globe {
  // host: the element the picture fills; markersEl: the layer for the marker buttons. opts: onPick(ids, x, y) when a
  // marker or cluster is clicked (not dragged), onError(message), onFirstFrame(), labelOf(ids) → the selected label
  constructor(host, markersEl, opts = {}) {
    this.host = host; this.markersEl = markersEl; this.opts = opts;
    this.running = false; this.raf = 0; this.dirty = true; this.places = []; this.selected = null;
    this.stats = { frames: 0, ticks: 0, started: 0, stopped: 0 };
    this.autoRotate = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.listeners = [];
    this.markerEls = new Map();
    this.fly = null;
  }

  // → true when the globe can draw, else false (opts.onError told why); the list works either way
  init() {
    if (this.svg) return true;
    try {
      if (this.opts.forceFail) throw new Error("그리기 사용 안 함 (개발용 시험)");
      const el = (name, attrs, parent) => { const n = document.createElementNS(SVG, name); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); parent?.appendChild(n); return n; };
      this.svg = el("svg", { class: "globe-ball", role: "img", "aria-label": "개최지 지구본" });
      this.ball = el("g", {}, this.svg);
      const keep = { "vector-effect": "non-scaling-stroke" };   // (the edge stays 3 px and the grid 1.5 px at any zoom)
      const clip = el("clipPath", { id: "globeClip" }, el("defs", {}, this.svg));
      el("circle", { r: R }, clip);
      el("circle", { r: R, style: "fill:var(--c-blue)" }, this.ball);
      // the land turns with the globe: its outline is written again whenever the view moves (draw → landPath)
      this.landEl = el("path", { style: "fill:var(--line)", "clip-path": "url(#globeClip)", "fill-rule": "evenodd" }, this.ball);
      const grid = el("g", { fill: "none", style: "stroke:var(--line)", "stroke-opacity": 0.4, "stroke-width": 1.5 }, this.ball);
      for (const [rx, ry] of [[R, 60], [R, 120], [60, R], [120, R]]) el("ellipse", { rx, ry, ...keep }, grid);
      el("line", { x1: -R, y1: 0, x2: R, y2: 0, ...keep }, grid);
      el("line", { x1: 0, y1: -R, x2: 0, y2: R, ...keep }, grid);
      el("circle", { r: R, fill: "none", style: "stroke:var(--line)", "stroke-width": 3, ...keep }, this.ball);   // the edge, over the land
      this.host.prepend(this.svg);
      // the land's outlines as points on the unit sphere, with long edges split (≤ 4°) so an outline crossing the
      // ball's edge is cut close to where it really crosses
      this.land = LAND.map((ring) => {
        const out = [];
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i], b = ring[(i + 1) % ring.length];
          let dLon = b[0] - a[0]; if (dLon > 180) dLon -= 360; else if (dLon < -180) dLon += 360;
          const n = Math.max(1, Math.ceil(Math.max(Math.abs(dLon), Math.abs(b[1] - a[1])) / 4));
          for (let k = 0; k < n; k++) out.push(H().latLonToVec3(a[1] + ((b[1] - a[1]) * k) / n, a[0] + (dLon * k) / n, 1));
        }
        return out;
      });
    } catch (e) {
      this.svg?.remove(); this.svg = null;
      this.opts.onError?.(`지구본을 그릴 수 없어요 (${e.message || "오류"}). 오른쪽 목록으로 고를 수 있어요.`);
      return false;
    }
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    // (looking at Europe at first – most races; the season's own race is flown to once the list is in. At this distance
    // the ball takes about 85 % of the board's height, as in the design)
    const start = H().latLonToVec3(30, 15, 4.25);
    this.camera.position.set(start.x, start.y, start.z);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.svg);
    Object.assign(this.controls, { enablePan: false, enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.45, zoomSpeed: 0.6, minDistance: 1.6, maxDistance: 6 });
    this.controls.addEventListener("change", () => { this.dirty = true; });
    // the slow turn stops for good at the first touch (no animation the user has to wait out)
    this.controls.addEventListener("start", () => { this.autoRotate = false; this.fly = null; this.host.classList.add("dragging"); });
    this.controls.addEventListener("end", () => this.host.classList.remove("dragging"));

    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.host);
    this.on(document, "visibilitychange", () => { if (!document.hidden) this.dirty = true; });
    this.resize();
    return true;
  }
  on(target, type, fn, opt) { target.addEventListener(type, fn, opt); this.listeners.push([target, type, fn, opt]); }

  resize() {
    if (!this.svg) return;
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.dirty = true;
  }
  // the ball's radius on screen in CSS pixels (its outline is a circle: the camera always looks at its centre)
  radiusPx() {
    const d = this.camera.position.length(), h = Math.max(1, this.host.clientHeight);
    return ((h / 2) * Math.tan(Math.asin(Math.min(0.999, 1 / d)))) / Math.tan((this.camera.fov * Math.PI) / 360);
  }

  start() {
    if (!this.svg || this.running) return;
    this.running = true; this.stats.started++; this.dirty = true; this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }
  stop() { if (!this.running) return; this.running = false; this.stats.stopped++; cancelAnimationFrame(this.raf); this.raf = 0; }

  frame(now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
    this.stats.ticks++;
    if (document.hidden) return;
    if (this.fly) {
      const f = this.fly, k = Math.min(1, (now - f.t0) / f.ms), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      this.camera.position.copy(f.from).lerp(f.to, e).setLength(f.dist);
      if (k >= 1) this.fly = null;
      this.dirty = true;
    }
    let idle = false;
    if (this.controls.update()) this.dirty = true;
    else if (!this.dirty && this.autoRotate && !this.fly) {
      // ~1° a second around the polar axis (a turn takes six minutes), drawn 30 times a second – nothing else moves
      if (now - (this.lastDraw || 0) < 32) return;
      this.camera.position.applyAxisAngle(THREE.Object3D.DEFAULT_UP, 0.0175 * Math.min(0.1, (now - (this.lastDraw || now)) / 1000));
      this.controls.update();   // (taken in now, so the next frame doesn't count it as a move to draw again)
      this.dirty = idle = true;
    }
    if (!this.dirty) return;
    this.lastDraw = now; this.stats.idleFrames = (this.stats.idleFrames || 0) + (idle ? 1 : 0);
    this.dirty = false;
    this.draw();
    this.stats.frames++;
    this.layoutMarkers();
    if (this.stats.frames === 1) this.opts.onFirstFrame?.();
  }
  // the picture: centred on the board, as large as the globe is seen from the camera's distance
  draw() {
    this.camera.updateMatrixWorld();   // (no renderer does it: the markers are projected with this camera)
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const tr = `translate(${(w / 2).toFixed(1)} ${(h / 2).toFixed(1)}) scale(${(this.radiusPx() / R).toFixed(4)})`;
    if (this._tr !== tr) { this.ball.setAttribute("transform", tr); this._tr = tr; }
    const d = this.landPath(w, h);
    if (this._land !== d) { this.landEl.setAttribute("d", d); this._land = d; }
  }
  // The land as it is seen now, in the picture's own units: every outline projected with the camera; a point on the far
  // side goes to the ball's rim in its own direction (just outside the edge, where the clip cuts it), so an outline that
  // runs over the horizon is closed along the rim. An outline wholly on the far side is left out.
  landPath(w, h) {
    const cam = this.camera, c = cam.position, k = R / this.radiusPx(), v = (this._v ||= new THREE.Vector3());
    let d = "";
    for (const ring of this.land) {
      let any = false, prev = null; const pts = [];
      for (const p of ring) {
        v.set(p.x, p.y, p.z).project(cam);
        let x = v.x * 0.5 * w * k, y = -v.y * 0.5 * h * k, ang = null;
        if (p.x * c.x + p.y * c.y + p.z * c.z > 1) any = true;
        else {
          ang = Math.atan2(y, x);
          // (two far-side points far apart along the rim: the straight line between them would cut across the ball –
          // rim points are put between them, the short way round)
          if (prev != null) { let da = ang - prev; if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI; const n = Math.floor(Math.abs(da) / 0.2); for (let i = 1; i <= n; i++) { const t = prev + (da * i) / (n + 1); pts.push(`${(Math.cos(t) * R * RIM).toFixed(1)} ${(Math.sin(t) * R * RIM).toFixed(1)}`); } }
          x = Math.cos(ang) * R * RIM; y = Math.sin(ang) * R * RIM;
        }
        prev = ang;
        pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      if (any) d += `M${pts.join("L")}Z`;
    }
    return d;
  }

  // places: [{ key, lat, lon, ids, label }] – one per spot (HomeData.placeGroups); selected: the selected race's id
  setMarkers(places, selected) {
    this.places = places; this.selected = selected;
    const keep = new Set(places.map((p) => p.key));
    for (const [k, el] of this.markerEls) if (!keep.has(k)) { el.remove(); this.markerEls.delete(k); }
    for (const p of places) p.v = H().latLonToVec3(p.lat, p.lon, 1.004);
    this.dirty = true;
    if (!this.svg) this.markersEl.replaceChildren();
  }
  select(id) { this.selected = id; this.dirty = true; }

  // Markers: projected, back-side ones hidden (and so not clickable), close ones merged into a numbered cluster, the
  // selected race's marker first with its label. DOM writes only when a marker's place or content changes.
  layoutMarkers() {
    if (!this.places.length && !this.markerEls.size) return;
    const cam = this.camera.position, w = this.host.clientWidth, h = this.host.clientHeight, v = new THREE.Vector3();
    const front = [];
    for (const p of this.places) {
      if (!p.v) continue;
      // (a point on the unit sphere faces the camera when p·c > 1; a little more keeps markers off the very edge)
      if (p.v.x * cam.x + p.v.y * cam.y + p.v.z * cam.z < 1.04) continue;
      v.set(p.v.x, p.v.y, p.v.z).project(this.camera);
      front.push({ id: p.key, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, p });
    }
    const selKey = this.places.find((p) => p.ids.includes(this.selected))?.key ?? null;
    const clusters = H().clusterPoints(front, 22, selKey);
    const used = new Set();
    for (const c of clusters) {
      const key = c.ids[0], places = c.ids.map((id) => front.find((f) => f.id === id).p), ids = places.flatMap((p) => p.ids);
      used.add(key);
      let el = this.markerEls.get(key);
      if (!el) {
        el = document.createElement("button"); el.className = "gm"; el.type = "button";
        let down = null;
        // a click is a press and release without moving (a drag over the globe never picks)
        el.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
        el.addEventListener("click", (e) => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; const r = el.getBoundingClientRect(), hr = this.host.getBoundingClientRect(); this.opts.onPick?.(el._ids, r.left - hr.left + 12, r.top - hr.top + 12); });
        this.markersEl.appendChild(el); this.markerEls.set(key, el);
      }
      el._ids = ids;
      const sel = selKey != null && c.ids.includes(selKey);
      const label = sel ? this.opts.labelOf?.(this.selected) || "" : "";
      const html = `<i></i>${ids.length > 1 ? `<b>${ids.length}</b>` : ""}${label ? `<span>${label.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]))}</span>` : ""}`;
      if (el._html !== html) { el.innerHTML = html; el._html = html; el.classList.toggle("sel", sel); el.title = places.map((p) => p.title || "").filter(Boolean).join("\n"); el.setAttribute("aria-label", el.title || "서킷"); }
      const tr = `translate(${(c.x - 7).toFixed(1)}px, ${(c.y - 7).toFixed(1)}px)`;
      if (el._tr !== tr) { el.style.transform = tr; el._tr = tr; }
      if (el.hidden) el.hidden = false;
    }
    for (const [k, el] of this.markerEls) if (!used.has(k) && !el.hidden) el.hidden = true;
  }

  // turn to face a spot (0.7 s, or at once when motion is reduced); the slow turn stops
  flyTo(lat, lon) {
    if (!this.svg || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    this.autoRotate = false;
    const dist = this.camera.position.length(), t = H().latLonToVec3(Math.max(-60, Math.min(60, lat)), lon, dist);
    const to = new THREE.Vector3(t.x, t.y, t.z);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !this.running) { this.camera.position.copy(to); this.camera.lookAt(0, 0, 0); this.dirty = true; return; }
    this.fly = { from: this.camera.position.clone(), to, dist, t0: performance.now(), ms: 700 };
  }

  info() {
    return this.svg ? { webgl: false, ...this.stats, running: this.running, texture: false, markers: this.markerEls.size } : { disposed: true, ...this.stats };
  }

  dispose() {
    this.stop();
    this.ro?.disconnect(); this.ro = null;
    for (const [t, type, fn, opt] of this.listeners) t.removeEventListener(type, fn, opt);
    this.listeners = [];
    this.controls?.dispose(); this.controls = null;
    for (const el of this.markerEls.values()) el.remove();
    this.markerEls.clear();
    this.svg?.remove();
    this.svg = this.ball = this.landEl = this.camera = null; this._tr = this._land = null;
  }
}
