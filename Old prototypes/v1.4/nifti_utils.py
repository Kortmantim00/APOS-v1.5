import os
import json
import numpy as np
import nibabel as nib

from scipy.ndimage import zoom

# def convert_nifti_to_binary(nifti_path, bin_out, meta_out):
#     img = nib.load(nifti_path)
#     data = img.get_fdata()
#     spacing = img.header.get_zooms()[:3]
#     spacing = [float(spacing[2]), float(spacing[1]), float(spacing[0])]  # flip volgorde
#     contrast_factor = 0.5
#     volume = np.clip(data * contrast_factor, 0, 255).astype(np.uint8)
#     os.makedirs(os.path.dirname(bin_out), exist_ok=True)
#     volume.tofile(bin_out)
#     dims = volume.shape
#     with open(meta_out, 'w') as f:
#         json.dump({'spacing': spacing, 'dims': dims[::-1]}, f)

def write_volume_to_binary(volume, spacing, bin_path, meta_path):
    os.makedirs(os.path.dirname(bin_path), exist_ok=True)

    with open(bin_path, 'wb') as f:
        f.write(volume.tobytes(order='C'))

    dims = volume.shape
    with open(meta_path, 'w') as f:
        json.dump({
            'spacing': spacing,
            'dims': dims[::-1]  # volgorde: [z, y, x]
        }, f)

def convert_nifti_to_binary(nifti_path, bin_out, meta_out, preview_scale=0.25, contrast_factor=0.5):
    img = nib.load(nifti_path)
    data = img.dataobj  # lazy loading
    spacing = img.header.get_zooms()[:3]
    spacing = [float(spacing[2]), float(spacing[1]), float(spacing[0])]  # flip volgorde

    # Lees en verwerk volume slice-per-slice
    volume = np.zeros(img.shape, dtype=np.uint8)
    for z in range(img.shape[2]):
        slice_data = data[:, :, z]
        slice_data = np.clip(slice_data * contrast_factor, 0, 255).astype(np.uint8)
        volume[:, :, z] = slice_data

    # Schrijf volledige resolutie
    write_volume_to_binary(volume, spacing, bin_out, meta_out)

    # Maak preview volume
    preview = zoom(volume, zoom=preview_scale)
    preview_spacing = [s / preview_scale for s in spacing]

    preview_bin = bin_out.replace('.bin', '_preview.bin')
    preview_meta = meta_out.replace('.json', '_preview.json')
    write_volume_to_binary(preview, preview_spacing, preview_bin, preview_meta)

# def convert_nifti_to_binary(nifti_path, bin_out, meta_out):
#     img = nib.load(nifti_path)
#     spacing = img.header.get_zooms()[:3]
#     spacing = [float(spacing[2]), float(spacing[1]), float(spacing[0])]

#     data = img.dataobj  # Lazy proxy (niet hele array in RAM!)
#     contrast_factor = 0.5

#     os.makedirs(os.path.dirname(bin_out), exist_ok=True)

#     # Open binair bestand en schrijf slice-voor-slice
#     with open(bin_out, 'wb') as f:
#         for z in range(0, data.shape[2], 20):  # 20 block slice-wise
#             slice_data = data[:, :, z:z+20]
#             slice_data = np.clip(slice_data * contrast_factor, 0, 255).astype(np.uint8)
#             f.write(slice_data.tobytes())


#     dims = data.shape
#     with open(meta_out, 'w') as f:
#         json.dump({'spacing': spacing, 'dims': dims[::-1]}, f)
