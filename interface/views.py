from django.shortcuts import render, redirect
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib import messages

import os
import shutil
import json

from .utils.dicom_utils import convert_dicom_to_nifti
from .utils.nifti_utils import convert_nifti_to_binary
from .utils.seg_utils import convert_segnifti_to_binary
from .utils.landmarks_utils import (
    read_json_information,
    convert_landmarks_to_volume_binary,
    transform_landmarks_to_voxel_space,
    apply_axis_permutation
)

def login_view(request):
    """
    Render login page and validate access code.
    """
    if request.method == 'POST':
        if request.POST.get('access_code') == '1234':  #acces code
            request.session['access_granted'] = True
            return redirect('upload')
        messages.error(request, 'Invalid access code')
    return render(request, 'interface/login.html')


def upload(request):
    """
    Handle upload of DICOM or NIfTI files in upload tab.
    """
    if not request.session.get('access_granted'):
        return redirect('login')

    log_messages = []

    if request.method == 'POST':
        # Handle DICOM upload, transform to NIFTI and convert to binary + meta
        dicom_files = request.FILES.getlist('dicom_file')
        if dicom_files:
            upload_dir = os.path.join(settings.MEDIA_ROOT, 'dicoms')
            os.makedirs(upload_dir, exist_ok=True)

            for f in dicom_files:
                with open(os.path.join(upload_dir, f.name), 'wb+') as dest:
                    for chunk in f.chunks():
                        dest.write(chunk)

            nifti_path = os.path.join(settings.MEDIA_ROOT, 'volume_dicom.nii.gz')
            bin_path = os.path.join(settings.MEDIA_ROOT, 'volume_dicom.bin')
            meta_path = os.path.join(settings.MEDIA_ROOT, 'volume_base.meta.json')

            try:
                convert_dicom_to_nifti(upload_dir, nifti_path)
                convert_nifti_to_binary(nifti_path, bin_path, meta_path)
                log_messages.append("DICOM uploaded, converted to NIfTI, and processed.")
            except Exception as exc:
                log_messages.append(f"Error during DICOM processing: {exc}")

        # Handle NIfTI upload and convert to binary + meta
        nifti_file = request.FILES.get('nifti_file')
        if nifti_file:
            upload_dir = os.path.join(settings.MEDIA_ROOT, 'niftis')
            os.makedirs(upload_dir, exist_ok=True)
            file_path = os.path.join(upload_dir, nifti_file.name)

            with open(file_path, 'wb+') as dest:
                for chunk in nifti_file.chunks():
                    dest.write(chunk)
            try:
                convert_nifti_to_binary(
                    file_path,
                    os.path.join(settings.MEDIA_ROOT, 'volume_nifti.bin'),
                    os.path.join(settings.MEDIA_ROOT, 'volume_base.meta.json')
                )
                log_messages.append("NIfTI uploaded and processed.")
            except Exception as exc:
                log_messages.append(f"Error during NIfTI processing: {exc}")

    # If AJAX request, return log as JSON
    if request.headers.get('x-requested-with') == 'XMLHttpRequest':
        return JsonResponse({'log': log_messages})

    return render(request, 'interface/upload.html')


def list_media_files(request):
    """
    Return a list of all files in the MEDIA_ROOT directory (used in upload tab.).
    """
    entries = []
    for root, _, files in os.walk(settings.MEDIA_ROOT):
        for f in files:
            rel_path = os.path.relpath(os.path.join(root, f), settings.MEDIA_ROOT)
            entries.append(rel_path)
    return JsonResponse({'files': entries})


def viewer(request):
    """
    Render the volume viewer in viewer tab.
    """
    if not request.session.get('access_granted'):
        return redirect('login')
    return render(request, 'interface/viewer.html')


def segmarks(request):
    """
    Render the volume viewer in the segmarks tab.
    """
    if not request.session.get('access_granted'):
        return redirect('login')
    return render(request, 'interface/segmarks.html')


def reset_viewer(request):
    """
    Empty the viewer in viewer tab and segmarks tab
    """
    if request.method != 'POST':
        return JsonResponse({'status': 'invalid'}, status=405)

    try:
        for filename in os.listdir(settings.MEDIA_ROOT):
            path = os.path.join(settings.MEDIA_ROOT, filename)
            if os.path.isfile(path):
                os.remove(path)
            else:
                shutil.rmtree(path)
        return JsonResponse({'status': 'success'})
    except Exception as exc:
        return JsonResponse({'status': 'error', 'message': str(exc)}, status=500)


def run_segmentation(request):
    """
    Process the segmentation NIfTI file and convert to binary format + meta.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Invalid request'}, status=400)

    nifti_file = request.FILES.get('nifti_file')
    if nifti_file is None:
        return JsonResponse({'error': 'Missing NIfTI file'}, status=400)

    upload_dir = os.path.join(settings.MEDIA_ROOT, 'niftis')
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, nifti_file.name)

    with open(file_path, 'wb+') as destination:
        for chunk in nifti_file.chunks():
            destination.write(chunk)

    try:
        output_file = os.path.join(settings.MEDIA_ROOT, 'segmentation_result.bin')
        metadata_file = os.path.join(settings.MEDIA_ROOT, 'segmentation_result.meta.json')
        reference_meta = os.path.join(settings.MEDIA_ROOT, 'volume_base.meta.json')

        convert_segnifti_to_binary(file_path, output_file, metadata_file, reference_meta)

        return JsonResponse({'message': 'Segmentation completed', 'output': output_file}, status=200)
    except Exception as exc:
        return JsonResponse({'error': f'Error during processing: {str(exc)}'}, status=500)


def run_landmarks(request):
    """
    Process landmark files, transform and convert them to voxel space, and export as binary volume.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Invalid request'}, status=400)

    landmark_files = request.FILES.getlist('landmarks_file')
    if not landmark_files:
        return JsonResponse({'error': 'No landmark files uploaded.'}, status=400)

    upload_dir = os.path.join(settings.MEDIA_ROOT, 'landmarks')
    os.makedirs(upload_dir, exist_ok=True)

    for f in landmark_files:
        with open(os.path.join(upload_dir, f.name), 'wb+') as dest:
            for chunk in f.chunks():
                dest.write(chunk)

    try:
        # Read and extract information from json files
        landmarks = read_json_information(upload_dir)

        # Load reference metadata
        ref_meta_path = os.path.join(settings.MEDIA_ROOT, 'volume_base.meta.json')
        if not os.path.exists(ref_meta_path):
            return JsonResponse({'error': 'Reference metadata not found.'}, status=400)

        with open(ref_meta_path, encoding='utf-8') as f:
            meta = json.load(f)

        spacing = meta.get("spacing", [1.0, 1.0, 1.0])
        origin = meta.get("origin", [0.0, 0.0, 0.0])
        dims = meta.get("dims", [0, 0, 0])

        # Apply axis transformation: z,y,x → x,y,z
        landmarks = apply_axis_permutation(landmarks, order=[2, 1, 0])

        # Convert to voxel space and export
        voxel_landmarks = transform_landmarks_to_voxel_space(landmarks, origin, spacing, dims)
        bin_out = os.path.join(settings.MEDIA_ROOT, 'landmarks_volume.bin')
        meta_out = os.path.join(settings.MEDIA_ROOT, 'landmarks_volume.meta.json')

        convert_landmarks_to_volume_binary(voxel_landmarks, dims, spacing, origin, bin_out, meta_out)

        return JsonResponse({'message': 'Landmarks processed'}, status=200)
    except Exception as exc:
        return JsonResponse({'error': str(exc)}, status=500)
