import os
import json
import numpy as np
from scipy.ndimage import zoom


def read_json_information(input_folder):
    """
    Parses JSON files in the input folder and extracts required landmark information
    
    Converts positions from LPS (Left-Posterior-Superior) to RAS (Right-Anterior-Superior)
    by negating x and y.
    Returns list of landmarks with id, label and positon in RAS orientation

    Args:
        input_folder (str): Path to folder containing .json landmark files.
    """
    landmarks = []
    for filename in os.listdir(input_folder):
        if filename.endswith(".json"):
            with open(os.path.join(input_folder, filename), 'r', encoding='utf-8') as file:
                data = json.load(file)
                for markup in data.get("markups", []):
                    for point in markup.get("controlPoints", []):
                        pos = point.get("position", [0, 0, 0])
                        landmarks.append({
                            "id": point.get("id"),
                            "label": point.get("label"),
                            "position": {
                                "x": -pos[0],  
                                "y": -pos[1],
                                "z": pos[2]
                            }
                        })
    return landmarks


def apply_axis_permutation(landmarks, order):
    """
    Reorders the axes of the landmark coordinates
    with [2, 1, 0]: z,y,x → x,y,z

    Args:
        landmarks (list): List of landmark dicts with 'position'.
        order (list[int]): New axis order.
    """
    permuted = []
    for lm in landmarks:
        x, y, z = lm["position"]["x"], lm["position"]["y"], lm["position"]["z"]
        coords = [x, y, z]
        new_pos = {
            "x": coords[order[0]],
            "y": coords[order[1]],
            "z": coords[order[2]]
        }
        permuted.append({**lm, "position": new_pos})
    return permuted


def transform_landmarks_to_voxel_space(landmarks, origin, spacing, dims=None):
    """
    Converts landmarks from world space to voxel indices using origin and spacing.

    First: transform origin to anatomy origin (offset_origin)
    then using spacing and origin to transform coordinates to voxel indices

    Args:
        landmarks (list): List of landmarks with world coordinates.
        origin (list[float]): Origin [x, y, z] of the volume.
        spacing (list[float]): Spacing [x, y, z] of the volume.
        dims (list[int], optional): Optional dimensions of the volume to check bounds.

    Returns:
        list: Same landmarks with added 'voxel' field containing i,j,k indices.
    """
    offset_origin = [-abs(origin[2]), -abs(origin[1]), -abs(origin[0])]

    print(f"[DEBUG] spacing: {spacing}")
    print(f"[DEBUG] origin: {origin}")
    print(f"[DEBUG] offset_origin: {offset_origin}")
    if dims:
        print(f"[DEBUG] dims: {dims}")

    voxel_landmarks = []
    for lm in landmarks:
        pos = lm['position']
        x, y, z = pos['x'], pos['y'], pos['z']

        # Convert world coordinates to voxel indices
        i = (x - offset_origin[0]) / spacing[0]
        j = (y - offset_origin[1]) / spacing[1]
        k = (z - offset_origin[2]) / spacing[2]

        voxel = {'i': i, 'j': j, 'k': k}
        lm_voxel = {**lm, 'voxel': voxel}
        voxel_landmarks.append(lm_voxel)

    return voxel_landmarks


def convert_landmarks_to_volume_binary(
    landmarks,
    dims,
    spacing,
    origin,
    bin_out,
    meta_out,
    radius_mm=3,
    generate_preview=True,
    preview_scale=0.25
):
    """
    Renders landmarks as binary spheres in a 3D numpy volume based on the anatomy dimensions

    note: when downsampling is used for the anatomy, also required to be used here

    Args:
        landmarks (list): Landmarks with voxel coordinates.
        dims (list[int]): Dimensions of the output volume [x, y, z].
        spacing (list[float]): Spacing [x, y, z] in mm.
        origin (list[float]): Origin of the volume.
        bin_out (str): Output path for binary volume (.bin).
        meta_out (str): Output path for metadata (.json).
        radius_mm (int): Radius of each landmark in mm.
        generate_preview (bool): Whether to generate a downscaled preview volume.
        preview_scale (float): Downscaling factor for preview.
    """
    volume = np.zeros(dims[::-1], dtype=np.uint8)  # Create volume in z,y,x order

    # Calculate radius in voxel units
    radii_vox = {
        'x': int(round(radius_mm / spacing[0])),
        'y': int(round(radius_mm / spacing[1])),
        'z': int(round(radius_mm / spacing[2]))
    }

    # Draw each landmark as a sphere in the volume
    for lm in landmarks:
        v = lm['voxel']
        i = int(round(v['i']))
        j = int(round(v['j']))
        k = int(round(v['k']))

        for dz in range(-radii_vox['z'], radii_vox['z'] + 1):
            for dy in range(-radii_vox['y'], radii_vox['y'] + 1):
                for dx in range(-radii_vox['x'], radii_vox['x'] + 1):
                    # Convert offsets to mm
                    dx_mm = dx * spacing[0]
                    dy_mm = dy * spacing[1]
                    dz_mm = dz * spacing[2]

                    if dx_mm**2 + dy_mm**2 + dz_mm**2 <= radius_mm**2:
                        zi, yi, xi = k + dz, j + dy, i + dx
                        if 0 <= zi < volume.shape[0] and 0 <= yi < volume.shape[1] and 0 <= xi < volume.shape[2]:
                            volume[zi, yi, xi] = 255

    # Save volume to binary
    volume.tofile(bin_out)

    # Write metadata
    with open(meta_out, 'w', encoding='utf-8') as f:
        json.dump({'spacing': spacing, 'dims': dims[::-1], 'origin': origin}, f)

    # Optional: generate preview
    if generate_preview:
        preview = zoom(volume, zoom=preview_scale, order=0)
        preview_spacing = [s / preview_scale for s in spacing]
        preview_bin = bin_out.replace('.bin', '_preview.bin')
        preview_meta = meta_out.replace('.json', '_preview.json')

        preview.tofile(preview_bin)
        with open(preview_meta, 'w', encoding='utf-8') as f:
            json.dump({'spacing': preview_spacing, 'dims': preview.shape[::-1], 'origin': origin}, f)
