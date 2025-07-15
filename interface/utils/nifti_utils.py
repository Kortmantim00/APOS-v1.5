import os
import json
import numpy as np
import nibabel as nib
from scipy.ndimage import zoom


def write_volume_to_binary(volume, spacing, origin, bin_path, meta_path, is_base=False):
    """
    Writes the NIFTI (transformed from DICOM (dNIFTI) or the original NIFTI) 
    to a binary file and seperate metadata.

    Args:
        volume (np.ndarray): 3D numpy array to save.
        spacing (list): Voxel spacing [x, y, z].
        origin (list): World origin [x, y, z].
        bin_path (str): Path to save the .bin file.
        meta_path (str): Path to save the .json metadata.
        is_base (bool): Prevent overwrite of meta file if already exists.
    """
    os.makedirs(os.path.dirname(bin_path), exist_ok=True)

    with open(bin_path, 'wb') as f:
        f.write(volume.tobytes(order='C'))

    dims = volume.shape

    if is_base and os.path.exists(meta_path):
        print(f"[INFO] {meta_path} already exists, skipping overwrite.")
        return

    with open(meta_path, 'w') as f:
        json.dump({'spacing': spacing, 'dims': dims[::-1], 'origin': origin}, f)


def convert_nifti_to_binary(nifti_path, bin_out, meta_out, preview_scale=0.25, contrast_factor=0.3, generate_preview=True):
    """
    Converts a NIfTI file to binary format with optional downscaled preview.
    -> for speed: using lazy loading
    -> for speed: converts in batches of 20 slices 

    Because the frontend viewer cannot handle full resolution (>250MB) 
    -> downsample to 0.25 (preview_scale)
    -> can be turned off with generate_preview=False

    Args:
        nifti_path (str): Path to the input NIfTI file.
        bin_out (str): Output path for .bin file.
        meta_out (str): Output path for metadata .json file.
        preview_scale (float): Scaling factor for preview.
        contrast_factor (float): Multiplier for intensity normalization.
        generate_preview (bool): Whether to generate a preview version.
    """
    img = nib.load(nifti_path)
    data = img.dataobj         
    spacing = [float(img.header.get_zooms()[2]), float(img.header.get_zooms()[1]), float(img.header.get_zooms()[0])]
    origin = img.affine[:3, 3].tolist()

    volume = np.zeros(img.shape, dtype=np.uint8)
    for z in range(0, img.shape[2], 20):
        slice_data = data[:, :, z:z + 20]
        slice_data = np.clip(slice_data * contrast_factor, 0, 255).astype(np.uint8) #contrast / windowrendering
        volume[:, :, z:z + slice_data.shape[2]] = slice_data

    write_volume_to_binary(volume, spacing, origin, bin_out, meta_out, is_base=True)

    if generate_preview:
        preview = zoom(volume, zoom=preview_scale)
        preview_spacing = [s / preview_scale for s in spacing]

        preview_bin = bin_out.replace('.bin', '_preview.bin')
        preview_meta = meta_out.replace('.json', '_preview.json')
        write_volume_to_binary(preview, preview_spacing, origin, preview_bin, preview_meta)
