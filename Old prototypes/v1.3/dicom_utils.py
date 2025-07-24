import pydicom
import numpy as np
import os
import json

def dicom_to_voxel(dicom_folder):
    slices = []
    spacing = [1.0, 1.0, 1.0]  
    slice_info = []

    dicom_files = [f for f in os.listdir(dicom_folder) if not f.startswith('.')] 

    for filename in dicom_files:
        path = os.path.join(dicom_folder, filename)
        try:
            ds = pydicom.dcmread(path)
            if hasattr(ds, 'pixel_array'):
                if hasattr(ds, 'ImagePositionPatient'):
                    position = ds.ImagePositionPatient
                    slice_loc = float(position[2])  
                elif hasattr(ds, 'InstanceNumber'):
                    slice_loc = float(ds.InstanceNumber)
                else:
                    slice_loc = None  

                if spacing == [1.0, 1.0, 1.0]:
                    if hasattr(ds, 'PixelSpacing') and hasattr(ds, 'SliceThickness'):
                        spacing = [
                            float(ds.PixelSpacing[1]),  # x spacing 
                            float(ds.PixelSpacing[0]),  # y spacing 
                            float(ds.SliceThickness)    # z spacing
                        ]

                slice_info.append((slice_loc, ds.pixel_array))
        except Exception as e:
            print(f"Skipping non-DICOM file or invalid file: {filename} ({e})")

    slice_info = [s for s in slice_info if s[0] is not None]

    if not slice_info:
        raise ValueError("No valid DICOM slices with positional information found.")

    slice_info.sort(key=lambda x: x[0])
    slices = [s[1] for s in slice_info]

    volume = np.stack(slices)
    return volume, spacing

def save_dicom_to_binary(volume, spacing, bin_path, meta_path):
    # Fixed window rendering
    hu_min = -300
    hu_max = 600
    volume_scaled = np.clip((volume - hu_min) / (hu_max - hu_min) * 255, 0, 255).astype(np.uint8)
    
    os.makedirs(os.path.dirname(bin_path), exist_ok=True)
    volume_scaled.astype(np.uint8).tofile(bin_path)
    dims = volume_scaled.shape
    with open(meta_path, 'w') as f:
        json.dump({'spacing': spacing, 'dims': dims[::-1]}, f)  