"""Builds the Glass mark mesh from blender/logomark.svg.

    python3 blender/build_mark_mesh.py

Needs: svgpathtools, shapely 2, triangle, numpy.

The even-odd fill of the SVG is lofted into a rounded rim on both faces: inset contours of the shape
sit on a quarter-circle profile, so either face reads as liquid chrome while the silhouette stays
exact. Straight walls join the two.
Normals are analytic (direction to the nearest edge), not averaged faces.

Writes public/media/brand/glass-mark.mesh, little endian:
  char[4] "BMK1", u32 vertexCount, u32 indexCount, u32 0
  f32 halfExtent x, y, z, 0
  vertexCount * (snorm16 x, y, z, 0, snorm8 nx, ny, nz, 0)  12 bytes, positions / halfExtent
  indexCount * u16, padded to 4 bytes
Axes: x right, y up, z toward the viewer. The mark is 2 units tall, centred on the origin in all three.
"""

import math
import re
import struct
from pathlib import Path
from xml.etree import ElementTree as ET

import numpy as np
import shapely
import shapely.affinity
import triangle
from shapely.geometry import LinearRing, MultiPolygon, Polygon
from shapely.geometry.polygon import orient
from svgpathtools import parse_path

ROOT = Path(__file__).resolve().parent.parent
SVG = ROOT / "blender/logomark.svg"
OUT = ROOT / "public/media/brand/glass-mark.mesh"

SVG_H = 232.0
# Stroke is ~12.2 SVG units wide; the rim radius leaves a narrow flat crown.
RIM = 5.2
LEVELS = 14
WALL = 6.0
SIMPLIFY = 0.018
SHARP = math.radians(32.0)


def svg_polygon() -> Polygon:
    d = ET.parse(SVG).find(".//{http://www.w3.org/2000/svg}path").get("d")
    parts = [p for p in re.split(r"(?=[Mm])", d) if p.strip()]
    result = None
    for part in parts:
        path = parse_path(part)
        n = max(400, int(path.length() * 10))
        pts = [path.point(t) for t in np.linspace(0, 1, n, endpoint=False)]
        poly = shapely.make_valid(Polygon([(p.real, SVG_H - p.imag) for p in pts]))
        result = poly if result is None else result.symmetric_difference(poly)
    assert result.geom_type == "Polygon", result.geom_type
    return orient(result, 1.0)


def polygons(geom):
    if geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon):
        return list(geom.geoms)
    return [g for g in geom.geoms if isinstance(g, Polygon)]


def ring_points(ring: LinearRing) -> np.ndarray:
    return np.asarray(ring.coords)[:-1]


class Builder:
    def __init__(self, shape: Polygon):
        self.shape = shape
        self.edge = shape.boundary
        self.pos: list[tuple[float, float, float]] = []
        self.nrm: list[tuple[float, float, float]] = []
        self.idx: list[int] = []
        self.keys: dict[tuple, int] = {}
        self.outline: dict[tuple, tuple[float, float]] = {}
        for ring in [shape.exterior, *shape.interiors]:
            pts = ring_points(ring)
            en = self.edge_normals(pts)
            for i, p in enumerate(pts):
                v = en[i - 1] + en[i]
                v = v / (np.linalg.norm(v) or 1.0)
                self.outline[(round(p[0], 4), round(p[1], 4))] = (float(v[0]), float(v[1]))

    @staticmethod
    def edge_normals(pts):
        # Oriented: exterior CCW, holes CW, so (dy, -dx) points out of the material.
        edges = np.roll(pts, -1, axis=0) - pts
        en = np.stack([edges[:, 1], -edges[:, 0]], axis=1)
        return en / np.linalg.norm(en, axis=1, keepdims=True)

    def vertex(self, p, n) -> int:
        key = (round(p[0], 4), round(p[1], 4), round(p[2], 4), round(n[0], 2), round(n[1], 2), round(n[2], 2))
        i = self.keys.get(key)
        if i is None:
            i = len(self.pos)
            self.keys[key] = i
            self.pos.append(p)
            self.nrm.append(n)
        return i

    def tri(self, a, b, c, facing):
        pa, pb, pc = (np.array(self.pos[i]) for i in (a, b, c))
        if np.dot(np.cross(pb - pa, pc - pa), facing) < 0:
            b, c = c, b
        self.idx += [a, b, c]

    def surface(self, contours: list):
        """
        Front and back surfaces: one constrained Delaunay triangulation with every inset contour as
        a constraint, so triangles span neighbouring levels instead of fanning along one. Each vertex
        is lifted onto the rim profile by its distance to the edge; the back is the front mirrored
        through the walls.
        """
        rings = [r for c in contours for poly in polygons(c) for r in (poly.exterior, *poly.interiors)]
        pts = [ring_points(r) for r in rings]
        segments = []
        start = 0
        for p in pts:
            n = len(p)
            segments += [(start + i, start + (i + 1) % n) for i in range(n)]
            start += n
        holes = [Polygon(r).representative_point().coords[0] for r in self.shape.interiors]
        cdt = triangle.triangulate(
            {"vertices": np.concatenate(pts), "segments": np.array(segments), "holes": np.array(holes)}, "pQ"
        )
        flat = cdt["vertices"]
        tris = cdt["triangles"].reshape(-1)

        geoms = shapely.points(flat)
        dist = shapely.distance(geoms, self.edge)
        near = shapely.get_coordinates(shapely.shortest_line(geoms, self.edge))[1::2]
        front = []
        back = []
        for (x, y), d, (nx, ny) in zip(flat, dist, near):
            t = min(1.0, d / RIM)
            theta = math.acos(max(-1.0, min(1.0, 1.0 - t)))
            z = RIM * math.sin(theta)
            if t >= 1.0:
                ox, oy = 0.0, 0.0
            elif (round(x, 4), round(y, 4)) in self.outline:
                ox, oy = self.outline[(round(x, 4), round(y, 4))]
            elif d > 1e-6:
                ox, oy = (nx - x) / d, (ny - y) / d
            else:
                ox, oy = self.rim_normal(x, y)
            c = math.cos(theta)
            s = math.sin(theta)
            front.append(self.vertex((x, y, z), (ox * c, oy * c, s)))
            back.append(self.vertex((x, y, -WALL - z), (ox * c, oy * c, -s)))
        for ids, facing in ((front, (0, 0, 1)), (back, (0, 0, -1))):
            for k in range(0, len(tris), 3):
                self.tri(ids[tris[k]], ids[tris[k + 1]], ids[tris[k + 2]], facing)

    def rim_normal(self, x, y):
        """Outward direction at a point on (or within RIM of) the outline: away from the material."""
        p = shapely.Point(x, y)
        q = self.edge.interpolate(self.edge.project(p))
        # Step inside and look back out, so points lying exactly on the edge still get a direction.
        for step in (0.05, 0.2, 0.6):
            for ang in np.linspace(0, 2 * math.pi, 16, endpoint=False):
                probe = shapely.Point(q.x + step * math.cos(ang), q.y + step * math.sin(ang))
                if self.shape.contains(probe):
                    break
            else:
                continue
            break
        dx, dy = q.x - probe.x, q.y - probe.y
        length = math.hypot(dx, dy) or 1.0
        return dx / length, dy / length

    def walls(self):
        rings = [self.shape.exterior, *self.shape.interiors]
        for ring in rings:
            pts = ring_points(ring)
            n = len(pts)
            en = self.edge_normals(pts)
            for i in range(n):
                j = (i + 1) % n
                normal_i = self.wall_normal(en, i, start=True)
                normal_j = self.wall_normal(en, j, start=False)
                a = self.vertex((*pts[i], 0.0), (*normal_i, 0.0))
                b = self.vertex((*pts[j], 0.0), (*normal_j, 0.0))
                c = self.vertex((*pts[j], -WALL), (*normal_j, 0.0))
                d = self.vertex((*pts[i], -WALL), (*normal_i, 0.0))
                facing = (*en[i], 0.0)
                self.tri(a, b, c, facing)
                self.tri(a, c, d, facing)

    @staticmethod
    def wall_normal(en, i, start):
        """Normal at vertex i for the edge starting (start) or ending there; split at sharp corners."""
        prev = en[i - 1]
        cur = en[i]
        turn = math.acos(max(-1.0, min(1.0, float(np.dot(prev, cur)))))
        if turn > SHARP:
            v = cur if start else prev
        else:
            v = prev + cur
            v = v / (np.linalg.norm(v) or 1.0)
        return float(v[0]), float(v[1])


def build():
    shape = svg_polygon()
    shape = orient(shape.simplify(SIMPLIFY, preserve_topology=True), 1.0)
    minx, miny, maxx, maxy = shape.bounds
    cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
    shape = orient(shapely.affinity.translate(shape, -cx, -cy), 1.0)

    b = Builder(shape)
    insets = [RIM * (1 - math.cos(0.5 * math.pi * i / LEVELS)) for i in range(LEVELS + 1)]
    contours = [shape]
    for d in insets[1:]:
        c = shape.buffer(-d, quad_segs=12, join_style="round")
        contours.append(c.simplify(SIMPLIFY, preserve_topology=True))
    b.surface(contours)
    b.walls()

    pos = np.array(b.pos)
    # Centred in depth too, so it spins about the middle of its body.
    pos[:, 2] += WALL / 2
    nrm = np.array(b.nrm)
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
    half_h = (maxy - miny) / 2
    pos /= half_h
    half = np.abs(pos).max(axis=0)
    assert len(pos) < 65536, len(pos)

    q = np.clip(np.round(pos / half * 32767), -32767, 32767).astype("<i2")
    qn = np.clip(np.round(nrm * 127), -127, 127).astype("i1")
    out = bytearray(struct.pack("<4sIII", b"BMK1", len(pos), len(b.idx), 0))
    out += struct.pack("<4f", *half, 0.0)
    for (x, y, z), (nx, ny, nz) in zip(q, qn):
        out += struct.pack("<4h4b", x, y, z, 0, nx, ny, nz, 0)
    out += np.asarray(b.idx, dtype="<u2").tobytes()
    if len(b.idx) % 2:
        out += b"\0\0"
    OUT.write_bytes(out)
    print(f"{OUT.relative_to(ROOT)}: {len(pos)} verts, {len(b.idx) // 3} tris, {len(out)} bytes, half {half.round(4)}")


if __name__ == "__main__":
    build()
