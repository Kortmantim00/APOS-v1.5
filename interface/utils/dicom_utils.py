import os
import dicom2nifti

def convert_dicom_to_nifti(dicom_folder, output_nifti_path):
    """
    Converts DICOM files to a single NIfTI (.nii.gz) file using the dicom2nifti function.

    Args:
        dicom_folder (str): Path to input folder with DICOM files.
        output_nifti_path (str): Path where the output NIfTI file will be saved.
    """
    try:
        os.makedirs(os.path.dirname(output_nifti_path), exist_ok=True)
        dicom2nifti.convert_directory(
            dicom_folder,
            os.path.dirname(output_nifti_path),
            compression=True,
            reorient=True                       # Transfrom LPS to RAS orientation
        )

        # Find and rename the first .nii.gz file to the expected name
        for filename in os.listdir(os.path.dirname(output_nifti_path)):
            if filename.endswith('.nii.gz'):
                actual_path = os.path.join(os.path.dirname(output_nifti_path), filename)
                os.rename(actual_path, output_nifti_path)
                break
    except Exception as exc:
        raise RuntimeError(f"Error converting DICOM to NIfTI: {exc}") from exc
