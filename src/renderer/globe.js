// The home screen's globe: a flat blue ball with a light edge, a latitude/longitude grid and the season's circuits as
// markers (v0.71: one colour, no photograph – the Blue Marble texture is no longer drawn).
// Ownership: a Globe owns its renderer (one WebGL context), scene, camera, controls, the Earth texture, a
// ResizeObserver, its pointer listeners and its marker elements; dispose() frees every one of them (disposeGroup for the
// scene's geometries, materials and the texture, then the renderer and its context). It draws only while started (the
// home screen shown) and only when something moved – the slow turn, a drag, a fly-to, a resize –; stop() ends the loop.
// The 3D circuit view (map3d.js) is stopped by the app while the home screen is up, so the two never draw together.
// Longitude 180°W is at the equirectangular left edge in HomeData.latLonToVec3; the ball itself has no map.
import * as THREE from "./vendor/three.module.js";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { disposeGroup } from "./dispose.js";

const BLUE = 0x3d4dff, EDGE = 0xf2efe6;   // (css/tokens.css --c-blue, --line)
const EDGE_PX = 3, GRID_DEG = 30, GRID_PX = 1.5;
const H = () => window.HomeData;

export class Globe {
  // host: the element the canvas fills; markersEl: the layer for the marker buttons. opts: onPick(ids, x, y) when a
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

  // → true when the globe can draw (WebGL there), else false (opts.onError told why); the list works either way
  init() {
    if (this.renderer) return true;
    try {
      if (this.opts.forceFail) throw new Error("WebGL 사용 안 함 (개발용 시험)");
      this.canvas = document.createElement("canvas");
      this.host.prepend(this.canvas);
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: "low-power" });
    } catch (e) {
      this.canvas?.remove(); this.canvas = null; this.renderer = null;
      this.opts.onError?.(`지구본을 그릴 수 없어요 (${e.message || "WebGL"}). 오른쪽 목록으로 고를 수 있어요.`);
      return false;
    }
    const R = this.renderer;
    R.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    R.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    // (looking at Europe at first – most races; the season's own first race is flown to once the list is in)
    const start = H().latLonToVec3(30, 15, 4.25);   // (the ball takes about 85 % of the board's height)
    this.camera.position.set(start.x, start.y, start.z);
    this.scene.add(this.camera);
    this.group = new THREE.Group(); this.scene.add(this.group);
    // the ball: one flat colour (unlit), and behind it a slightly larger light ball whose rim shows as the 3 px edge
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshBasicMaterial({ color: BLUE }));
    this.group.add(this.earth);
    this.edge = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshBasicMaterial({ color: EDGE, side: THREE.BackSide }));
    this.group.add(this.edge);
    // latitude/longitude lines every 30° as thin bands on the ball (a GL line is one device pixel – too thin to read):
    // each band is GRID_PX wide at the size the ball is first shown, and keeps to the ball as it is zoomed
    const pos = [], r = 1.002, seg = 120, half = (GRID_PX / 2) / 170;   // (radians: ≈ 1.5 px on a 170 px ball)
    const P = (lat, lon) => { const v = H().latLonToVec3(lat, lon, r); return [v.x, v.y, v.z]; };
    const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    const hd = (half * 180) / Math.PI;
    for (let lat = -60; lat <= 60; lat += GRID_DEG) for (let i = 0; i < seg; i++) {
      const l0 = -180 + (360 * i) / seg, l1 = -180 + (360 * (i + 1)) / seg;
      quad(P(lat - hd, l0), P(lat - hd, l1), P(lat + hd, l1), P(lat + hd, l0));
    }
    for (let lon = -180; lon < 180; lon += GRID_DEG) for (let i = 0; i < seg / 2; i++) {
      const a0 = -90 + (180 * i) / (seg / 2), a1 = -90 + (180 * (i + 1)) / (seg / 2);
      // (a meridian's band keeps its width towards the poles: the longitude step grows as the circle shrinks)
      const w = (a) => hd / Math.max(0.02, Math.cos((a * Math.PI) / 180));
      quad(P(a0, lon - w(a0)), P(a1, lon - w(a1)), P(a1, lon + w(a1)), P(a0, lon + w(a0)));
    }
    const gridGeo = new THREE.BufferGeometry(); gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    this.group.add(new THREE.Mesh(gridGeo, new THREE.MeshBasicMaterial({ color: EDGE, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide })));

    this.controls = new OrbitControls(this.camera, this.canvas);
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
    if (!this.renderer) return;
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.dirty = true;
  }
  // the ball's radius on screen in CSS pixels (its silhouette is a circle: the camera always looks at its centre)
  radiusPx() {
    const d = this.camera.position.length(), h = Math.max(1, this.host.clientHeight);
    return ((h / 2) * Math.tan(Math.asin(Math.min(0.999, 1 / d)))) / Math.tan((this.camera.fov * Math.PI) / 360);
  }

  start() {
    if (!this.renderer || this.running) return;
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
    this.edge.scale.setScalar(1 + EDGE_PX / Math.max(40, this.radiusPx()));   // (the light rim: 3 px at any zoom)
    this.renderer.render(this.scene, this.camera);
    this.stats.frames++;
    this.layoutMarkers();
    if (this.stats.frames === 1) this.opts.onFirstFrame?.();
  }

  // places: [{ key, lat, lon, ids, label }] – one per spot (HomeData.placeGroups); selected: the selected race's id
  setMarkers(places, selected) {
    this.places = places; this.selected = selected;
    const keep = new Set(places.map((p) => p.key));
    for (const [k, el] of this.markerEls) if (!keep.has(k)) { el.remove(); this.markerEls.delete(k); }
    for (const p of places) p.v = H().latLonToVec3(p.lat, p.lon, 1.004);
    this.dirty = true;
    if (!this.renderer) this.markersEl.replaceChildren();
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
      const tr = `translate(${(c.x - 9).toFixed(1)}px, ${(c.y - 9).toFixed(1)}px)`;
      if (el._tr !== tr) { el.style.transform = tr; el._tr = tr; }
      if (el.hidden) el.hidden = false;
    }
    for (const [k, el] of this.markerEls) if (!used.has(k) && !el.hidden) el.hidden = true;
  }

  // turn to face a spot (0.7 s, or at once when motion is reduced); the slow turn stops
  flyTo(lat, lon) {
    if (!this.renderer || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    this.autoRotate = false;
    const dist = this.camera.position.length(), t = H().latLonToVec3(Math.max(-60, Math.min(60, lat)), lon, dist);
    const to = new THREE.Vector3(t.x, t.y, t.z);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !this.running) { this.camera.position.copy(to); this.camera.lookAt(0, 0, 0); this.dirty = true; return; }
    this.fly = { from: this.camera.position.clone(), to, dist, t0: performance.now(), ms: 700 };
  }

  info() {
    const r = this.renderer;
    return r ? { geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs?.length ?? null, calls: r.info.render.calls, triangles: r.info.render.triangles, ...this.stats, running: this.running, texture: false, markers: this.markerEls.size } : { disposed: true, ...this.stats };
  }

  dispose() {
    this.stop();
    this.ro?.disconnect(); this.ro = null;
    for (const [t, type, fn, opt] of this.listeners) t.removeEventListener(type, fn, opt);
    this.listeners = [];
    this.controls?.dispose(); this.controls = null;
    for (const el of this.markerEls.values()) el.remove();
    this.markerEls.clear();
    if (this.scene) disposeGroup(this.scene);
    if (this.renderer) { this.renderer.dispose(); this.renderer.forceContextLoss(); }
    this.canvas?.remove();
    this.renderer = this.scene = this.camera = this.canvas = this.earth = this.edge = this.group = null;
  }
}
