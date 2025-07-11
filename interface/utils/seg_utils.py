import os
import json
import numpy as np
import nibabel as nib
from scipy.ndimage import zoom


def convert_segnifti_to_binary(nifti_path, bin_out, meta_out, reference_meta_path, generate_preview=True, preview_scale=0.25):
    """
    Writes the segmentation NIfTI file to a binary and seperate metadata. 
    metadata is influenced bij the anatomy's metadata (base.meta) if available.

    binary mask of segmentation (0, 1) is converted to 0, 255 values.
    note: when downsampling is aplied for the anatomy NIFTI, also use it for the segmentation

    Args:
        nifti_path (str): Input NIfTI file with segmentation.
        bin_out (str): Output binary file path.
        meta_out (str): Output metadata file path (.json).
        reference_meta_path (str): Optional reference metadata to match resolution/origin.
        generate_preview (bool): Whether to generate a low-res preview.
        preview_scale (float): Scale factor for preview generation.
    """
    img = nib.load(nifti_path)
    data = img.get_fdata()
    data = np.where(data == 1, 255, 0) 

    if reference_meta_path and os.path.exists(reference_meta_path):
        with open(reference_meta_path, encoding='utf-8') as f:
            ref_meta = json.load(f)
        ref_dims = tuple(ref_meta['dims'][::-1])
        ref_spacing = ref_meta['spacing']
        ref_origin = ref_meta.get('origin', img.affine[:3, 3].tolist())

        zoom_factors = [r / s for r, s in zip(ref_dims, data.shape)]
        volume = zoom(data, zoom=zoom_factors, order=0).astype(np.uint8)
        spacing = ref_spacing
        dims = ref_dims
        origin = ref_origin
    else:
        spacing = [float(img.header.get_zooms()[2]), float(img.header.get_zooms()[1]), float(img.header.get_zooms()[0])]
        volume = data.astype(np.uint8)
        dims = volume.shape
        origin = img.affine[:3, 3].tolist()

    os.makedirs(os.path.dirname(bin_out), exist_ok=True)
    volume.tofile(bin_out)

    with open(meta_out, 'w') as f:
        json.dump({'spacing': spacing, 'dims': dims[::-1], 'origin': origin}, f)

    if generate_preview:
        preview = zoom(volume, zoom=preview_scale, order=0)
        preview_spacing = [s / preview_scale for s in spacing]
        preview_bin = bin_out.replace('.bin', '_preview.bin')
        preview_meta = meta_out.replace('.json', '_preview.json')
        preview.tofile(preview_bin)
        with open(preview_meta, 'w') as f:
            json.dump({'spacing': preview_spacing, 'dims': preview.shape[::-1], 'origin': origin}, f)
