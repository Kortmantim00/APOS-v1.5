import os
import json
import numpy as np
import nibabel as nib

# def convert_nifti_to_json(nifti_path, output_path='media/volume_nifti.json'):
#     nifti_img = nib.load(nifti_path)
#     data = nifti_img.get_fdata()

#     # Fix spacing-conversie!
#     spacing_raw = nifti_img.header.get_zooms()[:3]
#     spacing = [float(spacing_raw[2]), float(spacing_raw[1]), float(spacing_raw[0])] 
#     contrast_factor = 0.5  # of 2.0 voor meer effect
#     data_enhanced = np.clip(data * contrast_factor, 0, 255).astype(np.uint8)
#     voxels_list = data_enhanced.tolist()

#     output_data = {
#         'voxels': voxels_list,
#         'spacing': spacing
#     }

#     os.makedirs(os.path.dirname(output_path), exist_ok=True)

#     # Schrijf eerst naar tijdelijk bestand
#     temp_path = output_path + '.tmp'
#     with open(temp_path, 'w') as f:
#         json.dump(output_data, f)
#         f.flush()
#         os.fsync(f.fileno())

#     os.replace(temp_path, output_path)

#     # Optioneel: controleer JSON geldigheid
#     try:
#         with open(output_path) as f:
#             json.load(f)
#     except json.JSONDecodeError as e:
#         print(f"JSON validatiefout: {e}")

#     return output_path

def convert_nifti_to_binary(nifti_path, bin_out, meta_out):
    img = nib.load(nifti_path)
    data = img.get_fdata()
    spacing = img.header.get_zooms()[:3]
    spacing = [float(spacing[2]), float(spacing[1]), float(spacing[0])]  # flip volgorde
    contrast_factor = 0.5
    volume = np.clip(data * contrast_factor, 0, 255).astype(np.uint8)
    os.makedirs(os.path.dirname(bin_out), exist_ok=True)
    volume.tofile(bin_out)
    dims = volume.shape
    with open(meta_out, 'w') as f:
        json.dump({'spacing': spacing, 'dims': dims[::-1]}, f)
