import json
import math
import os

import bpy
from mathutils import Vector

JSON = "/Users/momcilo/Desktop/Work/becomes/becomes.co/blender/logomark_simple.json"
BLEND = "/Users/momcilo/Desktop/Work/becomes/becomes.co/blender/becomes-logomark.blend"
SCALE = 0.04
SVG_H = 232.0
THICK = 0.22


def purge():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.lights,
        bpy.data.cameras,
        bpy.data.materials,
        bpy.data.worlds,
    ):
        for item in list(coll):
            coll.remove(item)


def to_xy(pt):
    x, y = pt
    return (x * SCALE, (SVG_H - y) * SCALE)


def add_poly_spline(curve, pts):
    coords = list(pts)
    if coords[0] == coords[-1]:
        coords = coords[:-1]
    sp = curve.splines.new("POLY")
    sp.use_cyclic_u = True
    sp.points.add(len(coords) - 1)
    for i, p in enumerate(coords):
        x, y = to_xy(p)
        sp.points[i].co = (x, y, 0.0, 1.0)
    return sp


def make_mark(data):
    curve = bpy.data.curves.new("GlassMark", "CURVE")
    curve.dimensions = "2D"
    curve.fill_mode = "BOTH"
    curve.extrude = THICK
    curve.bevel_depth = 0.0
    add_poly_spline(curve, data["exterior"])
    for hole in data["holes"]:
        add_poly_spline(curve, hole)
    obj = bpy.data.objects.new("GlassMark", curve)
    bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    obj.location = (0.0, 0.0, 0.0)
    bpy.ops.object.convert(target="MESH")
    obj.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    mesh = obj.data
    mesh.shade_smooth()
    try:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(35.0))
    except Exception as e:
        print("auto_smooth", e)
    bev = obj.modifiers.new("EdgeBevel", "BEVEL")
    bev.width = 0.012
    bev.segments = 3
    bev.limit_method = "ANGLE"
    bev.angle_limit = math.radians(50.0)
    bpy.ops.object.modifier_apply(modifier="EdgeBevel")
    print("faces", len(mesh.polygons), "verts", len(mesh.vertices))
    xs = [v.co.x for v in mesh.vertices]
    ys = [v.co.y for v in mesh.vertices]
    zs = [v.co.z for v in mesh.vertices]
    print(
        "bbox",
        round(min(xs), 4),
        round(max(xs), 4),
        round(min(ys), 4),
        round(max(ys), 4),
        round(min(zs), 4),
        round(max(zs), 4),
        "size",
        round(max(xs) - min(xs), 4),
        round(max(ys) - min(ys), 4),
        round(max(zs) - min(zs), 4),
    )
    return obj


def make_clay():
    mat = bpy.data.materials.new("ClayWhite")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (0.95, 0.95, 0.95, 1.0)
    em.inputs["Strength"].default_value = 6.0
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return mat


def make_glass():
    mat = bpy.data.materials.new("LiquidChromeGlass")
    mat.use_nodes = True
    mat.use_screen_refraction = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    princ = nt.nodes.new("ShaderNodeBsdfPrincipled")
    # Principled inputs by identifier, not localized name
    def set_in(node, ident, value):
        sock = next(s for s in node.inputs if s.identifier == ident)
        sock.default_value = value

    ids = [s.identifier for s in princ.inputs]
    print("principled", ids)
    set_in(princ, "Base Color", (0.92, 0.95, 0.98, 1.0))
    if "Metallic" in ids:
        set_in(princ, "Metallic", 0.08)
    if "Roughness" in ids:
        set_in(princ, "Roughness", 0.04)
    if "IOR" in ids:
        set_in(princ, "IOR", 1.48)
    if "Transmission Weight" in ids:
        set_in(princ, "Transmission Weight", 1.0)
    elif "Transmission" in ids:
        set_in(princ, "Transmission", 1.0)
    if "Coat Weight" in ids:
        set_in(princ, "Coat Weight", 0.35)
        set_in(princ, "Coat Roughness", 0.03)
        if "Coat IOR" in ids:
            set_in(princ, "Coat IOR", 1.55)
    if "Specular IOR Level" in ids:
        set_in(princ, "Specular IOR Level", 0.65)
    nt.links.new(princ.outputs["BSDF"], out.inputs["Surface"])
    return mat


def make_world():
    world = bpy.data.worlds.new("BlackWorld")
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    bg.inputs["Strength"].default_value = 0.0
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    bpy.context.scene.world = world


def make_camera(obj):
    cam_data = bpy.data.cameras.new("Camera")
    cam_data.type = "ORTHO"
    xs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    minx = min(p.x for p in xs)
    maxx = max(p.x for p in xs)
    minz = min(p.z for p in xs)
    maxz = max(p.z for p in xs)
    w = maxx - minx
    h = maxz - minz
    cx = 0.5 * (minx + maxx)
    cz = 0.5 * (minz + maxz)
    aspect = 1440.0 / 1248.0
    pad = 1.18
    need_h = h * pad
    need_w = w * pad
    ortho = max(need_w, need_h * aspect)
    cam_data.ortho_scale = ortho
    cam_data.clip_start = 0.01
    cam_data.clip_end = 100.0
    cam = bpy.data.objects.new("Camera", cam_data)
    cam.location = (cx, -8.0, cz)
    cam.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    print("camera", cam.location[:], "ortho", round(ortho, 4), "obj_wh", round(w, 4), round(h, 4))
    return cam


def area(name, loc, size, energy, rot, color=(1.0, 1.0, 1.0)):
    data = bpy.data.lights.new(name, "AREA")
    data.shape = "RECTANGLE"
    data.size = size[0]
    data.size_y = size[1]
    data.energy = energy
    data.color = color
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    obj.rotation_euler = rot
    bpy.context.collection.objects.link(obj)
    return obj


def make_lights():
    # Facing the mark from -Y
    area("StripTop", (0.0, -1.6, 5.0), (6.0, 0.35), 900.0, (math.radians(55), 0, 0))
    area("StripLeft", (-4.2, -2.0, 0.4), (0.35, 7.0), 1100.0, (math.radians(90), 0, math.radians(70)))
    area("StripRight", (4.4, -1.0, -0.2), (0.35, 6.5), 800.0, (math.radians(90), 0, math.radians(-65)))
    area("StripFront", (0.2, -5.4, 0.2), (4.5, 3.5), 180.0, (math.radians(90), 0, 0), (0.85, 0.92, 1.0))
    area("StripHi", (1.2, -3.2, 3.8), (2.2, 0.3), 550.0, (math.radians(40), 0, math.radians(-15)))


def setup_render(engine="CYCLES", samples=64):
    sc = bpy.context.scene
    try:
        sc.render.engine = engine
    except TypeError as e:
        print("engine set failed", e, "current", sc.render.engine)
    sc.render.resolution_x = 1440
    sc.render.resolution_y = 1248
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    if engine == "CYCLES":
        sc.cycles.device = "GPU"
        sc.cycles.samples = samples
        sc.cycles.use_denoising = True
        prefs = bpy.context.preferences.addons.get("cycles")
        if prefs:
            cprefs = prefs.preferences
            cprefs.compute_device_type = "METAL"
            for d in cprefs.get_devices_for_type("METAL"):
                d.use = True
            print("cycles devices", [(d.name, d.use) for d in cprefs.get_devices_for_type("METAL")])


def main():
    purge()
    data = json.load(open(JSON))
    print("splines", 1 + len(data["holes"]), "ext", len(data["exterior"]), "holes", [len(h) for h in data["holes"]])
    obj = make_mark(data)
    clay = make_clay()
    glass = make_glass()
    obj.data.materials.append(clay)
    make_world()
    make_camera(obj)
    make_lights()
    setup_render("CYCLES", 48)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    print("saved", BLEND, "active_mat", obj.active_material.name if obj.active_material else None)


main()
