# make_land.py – Natural Earth 1:110m land (public domain) → a small set of rough outlines for the home screen's globe:
# small islands dropped, each ring thinned (Douglas–Peucker, TOL degrees), coordinates to 0.1°. Writes globeland.js.
import json, math, sys
TOL = float(sys.argv[1]) if len(sys.argv) > 1 else 0.9
MIN_AREA = float(sys.argv[2]) if len(sys.argv) > 2 else 6.0     # square degrees (shoelace on lon/lat)
d = json.load(open('ne_110m_land.geojson'))
def area(r): return abs(sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))) / 2
def dp(pts, tol):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]; dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy) or 1e-9
    best, bi = 0, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]; dist = abs(dx * (a[1] - p[1]) - (a[0] - p[0]) * dy) / L
        if dist > best: best, bi = dist, i
    if best <= tol: return [a, b]
    return dp(pts[:bi + 1], tol)[:-1] + dp(pts[bi:], tol)
rings = []
for f in d['features']:
    g = f['geometry']; polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
    for poly in polys:
        r = poly[0]                      # the outer ring (lakes / holes are not drawn)
        if r[0] == r[-1]: r = r[:-1]
        if area(r) < MIN_AREA: continue
        # thin a closed ring: split at the two farthest-apart points so both halves keep their ends
        k = max(range(len(r)), key=lambda i: (r[i][0] - r[0][0]) ** 2 + (r[i][1] - r[0][1]) ** 2)
        s = dp(r[:k + 1], TOL)[:-1] + dp(r[k:] + [r[0]], TOL)[:-1]
        if len(s) >= 3: rings.append([[round(x, 1), round(y, 1)] for x, y in s])
rings.sort(key=lambda r: -area(r))
n = sum(len(r) for r in rings)
out = "// Rough land outlines for the home screen's globe (globe.js): Natural Earth 1:110m land – public domain,\n" \
      "// naturalearthdata.com – with small islands left out and every outline thinned to about %.1f° (made by the\n" \
      "// redesign round's make_land.py; %d outlines, %d points). Each outline is a closed ring of [longitude, latitude] in degrees.\n" \
      "export const LAND = %s;\n" % (TOL, len(rings), n, json.dumps(rings, separators=(",", ":")))
open('globeland.js', 'w').write(out)
print('rings', len(rings), 'points', n, 'bytes', len(out))
