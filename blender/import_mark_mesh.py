"""Loads public/media/brand/glass-mark.mesh into the open Blender scene as "GlassMark".

Run inside Blender: exec(open(".../blender/import_mark_mesh.py").read())
"""

import math
import struct

import bpy

PATH = "/Users/momcilo/Desktop/Work/becomes/becomes.co/public/media/brand/glass-mark.mesh"
NAME = "GlassMark"
# Matches the scene's earlier 9.28 m tall mark.
SIZE = 4.64


def load():
    raw = open(PATH, "rb").read()
    magic, nv, ni, _ = struct.unpack_from("<4sIII", raw, 0)
    assert magic == b"BMK1", magic
    hx, hy, hz, _ = struct.unpack_from("<4f", raw, 16)
    verts, normals = [], []
    for i in range(nv):
        x, y, z, _, nx, ny, nz, _ = struct.unpack_from("<4h4b", raw, 32 + i * 12)
        verts.append((x / 32767 * hx, y / 32767 * hy, z / 32767 * hz))
        n = (nx / 127, ny / 127, nz / 127)
        length = math.sqrt(sum(c * c for c in n)) or 1.0
        normals.append(tuple(c / length for c in n))
    idx = struct.unpack_from(f"<{ni}H", raw, 32 + nv * 12)
    faces = [idx[k : k + 3] for k in range(0, ni, 3)]
    return verts, normals, faces


def build():
    verts, normals, faces = load()
    old = bpy.data.objects.get(NAME)
    materials = list(old.data.materials) if old else []
    for obj in [o for o in bpy.data.objects if o.name.startswith(NAME)]:
        bpy.data.objects.remove(obj, do_unlink=True)
    mesh = bpy.data.meshes.new(NAME)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    mesh.shade_smooth()
    mesh.normals_split_custom_set_from_vertices(normals)
    for m in materials:
        mesh.materials.append(m)
    obj = bpy.data.objects.new(NAME, mesh)
    bpy.context.collection.objects.link(obj)
    obj.scale = (SIZE, SIZE, SIZE)
    # Mesh z faces the viewer; the scene camera looks down +Y.
    obj.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    print(NAME, len(verts), "verts", len(faces), "tris")
    return obj


build()
