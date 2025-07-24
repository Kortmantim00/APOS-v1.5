import os
import json
import numpy as np
import nibabel as nib

def convert_segnifti_to_binary(nifti_path, bin_out, meta_out):
    img = nib.load(nifti_path)
    data = img.get_fdata()

    data = np.where(data == 1, 255, 0)

    spacing = img.header.get_zooms()[:3]
    spacing = [float(spacing[2]), float(spacing[1]), float(spacing[0])]  # flip volgorde
    contrast_factor = 0.5
    volume = np.clip(data * contrast_factor, 0, 255).astype(np.uint8)
    os.makedirs(os.path.dirname(bin_out), exist_ok=True)
    volume.tofile(bin_out)
    dims = volume.shape
    with open(meta_out, 'w') as f:
        json.dump({'spacing': spacing, 'dims': dims[::-1]}, f)
