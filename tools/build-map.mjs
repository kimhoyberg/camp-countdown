// Builds the SVG path data for the map from Danish municipality boundaries.
// Source: https://github.com/magnuslarsen/geoJSON-Danish-municipalities (municipality polygons, CRS84)
// Usage: node tools/build-map.mjs  (prints JSON; the resulting paths are embedded in index.html)
const SRC = "https://raw.githubusercontent.com/magnuslarsen/geoJSON-Danish-municipalities/master/municipalities/municipalities.geojson";

const K = 1000;                        // svg units per degree of latitude
const COS = Math.cos(56 * Math.PI / 180);
const proj = ([lon, lat]) => [lon * COS * K, -lat * K];

// Zoom window around Struer <-> Silkeborg (lon/lat)
const WIN = { lon: [8.15, 9.98], lat: [55.98, 56.72] };
const [x0, y0] = proj([WIN.lon[0], WIN.lat[1]]);
const [x1, y1] = proj([WIN.lon[1], WIN.lat[0]]);

function dp(pts, tol) {                // Douglas-Peucker
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let max = 0, idx = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function ringPath(ring, tol) {
  const pr = ring.map(proj), mid = Math.floor(pr.length / 2);   // ring is closed: split so Douglas-Peucker has a real baseline
  let p = [...dp(pr.slice(0, mid + 1), tol), ...dp(pr.slice(mid), tol).slice(1)].map(([x, y]) => [Math.round(x), Math.round(y)]);
  p = p.filter((q, i) => i === 0 || q[0] !== p[i - 1][0] || q[1] !== p[i - 1][1]);
  if (p.length < 4) return "";
  let d = `M${p[0][0]} ${p[0][1]}`;
  for (let i = 1; i < p.length; i++) d += `l${p[i][0] - p[i - 1][0]} ${p[i][1] - p[i - 1][1]}`;
  return d + "z";
}

const gj = await (await fetch(SRC)).json();
let coarse = "", fine = "";
for (const f of gj.features) {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) {
    const outer = poly[0].map(proj);
    const xs = outer.map(p => p[0]), ys = outer.map(p => p[1]);
    const inWin = Math.max(...xs) > x0 - 500 && Math.min(...xs) < x1 + 500 && Math.max(...ys) > y0 - 500 && Math.min(...ys) < y1 + 500;
    const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    for (const ring of poly) {
      if (area > 4000) coarse += ringPath(ring, 6);   // drop specks in overview
      if (inWin) fine += ringPath(ring, 0.7);
    }
  }
}
const all = gj.features.flatMap(f => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates).flatMap(p => p[0].map(proj)));
const bb = [Math.min(...all.map(p => p[0])), Math.min(...all.map(p => p[1])), Math.max(...all.map(p => p[0])), Math.max(...all.map(p => p[1]))].map(Math.round);
console.log(JSON.stringify({ K, cos: COS, win: [x0, y0, x1 - x0, y1 - y0].map(Math.round), dk: bb, coarse, fine }));
