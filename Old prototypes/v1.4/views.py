from django.shortcuts import render, redirect
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib import messages
import os
import shutil
import json

from .utils.dicom_utils import dicom_to_voxel, save_dicom_to_binary
from .utils.nifti_utils import convert_nifti_to_binary
from .utils.seg_utils import convert_segnifti_to_binary
from .utils.landmarks_utils import convert_landmarks

def login_view(request):
    if request.method == 'POST':
        if request.POST.get('access_code') == '1234':
            request.session['access_granted'] = True
            return redirect('upload')
        else:
            messages.error(request, 'Invalid access code')
    return render(request, 'interface/login.html')

def upload(request):
    if not request.session.get('access_granted'):
        return redirect('login')

    log_messages = []

    if request.method == 'POST':
        if request.FILES.getlist('dicom_file'):
            files = request.FILES.getlist('dicom_file')
            upload_dir = os.path.join(settings.MEDIA_ROOT, 'dicoms')
            os.makedirs(upload_dir, exist_ok=True)

            for f in files:
                with open(os.path.join(upload_dir, f.name), 'wb+') as dest:
                    for chunk in f.chunks():
                        dest.write(chunk)
            try:
                voxel, spacing = dicom_to_voxel(upload_dir)
                save_dicom_to_binary(voxel, spacing,
                                     os.path.join(settings.MEDIA_ROOT, 'volume_dicom.bin'),
                                     os.path.join(settings.MEDIA_ROOT, 'volume_dicom.meta.json'))
                log_messages.append("DICOM geüpload en verwerkt.")
            except Exception as e:
                log_messages.append(f"Fout bij DICOM verwerking: {e}")

        if 'nifti_file' in request.FILES:
            nifti_file = request.FILES['nifti_file']
            upload_dir = os.path.join(settings.MEDIA_ROOT, 'niftis')
            os.makedirs(upload_dir, exist_ok=True)
            file_path = os.path.join(upload_dir, nifti_file.name)

            with open(file_path, 'wb+') as dest:
                for chunk in nifti_file.chunks():
                    dest.write(chunk)
            try:
                convert_nifti_to_binary(file_path,
                                        os.path.join(settings.MEDIA_ROOT, 'volume_nifti.bin'),
                                        os.path.join(settings.MEDIA_ROOT, 'volume_nifti.meta.json'))
                log_messages.append("NIFTI geüpload en verwerkt.")
            except Exception as e:
                log_messages.append(f"Fout bij NIFTI verwerking: {e}")

    if request.headers.get('x-requested-with') == 'XMLHttpRequest':
        return JsonResponse({'log': log_messages})
    return render(request, 'interface/upload.html')

def list_media_files(request):
    entries = []
    for root, dirs, files in os.walk(settings.MEDIA_ROOT):
        for f in files:
            rel_path = os.path.relpath(os.path.join(root, f), settings.MEDIA_ROOT)
            entries.append(rel_path)
    return JsonResponse({'files': entries})

def viewer(request):
    if not request.session.get('access_granted'):
        return redirect('login')
    return render(request, 'interface/viewer.html')

def segmarks(request):
    if not request.session.get('access_granted'):
        return redirect('login')
    return render(request, 'interface/segmarks.html')

@csrf_exempt
def reset_viewer(request):
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
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

@csrf_exempt
def run_segmentation(request):
    if request.method == 'POST':
        nifti_file = request.FILES.get('nifti_file')  # Verkrijg het NIFTI bestand uit de POST data
        if nifti_file is None:
            return JsonResponse({'error': 'NIFTI bestand ontbreekt'}, status=400)
        
        # Opslaan van het bestand in de /media directory
        upload_dir = os.path.join(settings.MEDIA_ROOT, 'niftis')
        os.makedirs(upload_dir, exist_ok=True)
        file_path = os.path.join(upload_dir, nifti_file.name)

        with open(file_path, 'wb+') as destination:
            for chunk in nifti_file.chunks():
                destination.write(chunk)

        try:
            # Verwerk het NIFTI bestand zoals eerder gedaan in NIFTI_utils
            output_file_path = os.path.join(settings.MEDIA_ROOT, 'segmentation_result.bin')
            metadata_file_path = os.path.join(settings.MEDIA_ROOT, 'segmentation_result.meta.json')

            convert_segnifti_to_binary(file_path, output_file_path, metadata_file_path)

            return JsonResponse({'message': 'Segmentatie voltooid', 'output': output_file_path}, status=200)
        except Exception as e:
            return JsonResponse({'error': f'Fout bij verwerking: {str(e)}'}, status=500)

    return JsonResponse({'error': 'Ongeldig verzoek'}, status=400)

@csrf_exempt
def run_landmarks(request):
    if request.method == 'POST':
        landmark_files = request.FILES.getlist('landmarks_file')
        if not landmark_files:
            return JsonResponse({'error': 'Geen landmark bestanden geüpload.'}, status=400)

        upload_dir = os.path.join(settings.MEDIA_ROOT, 'landmarks')
        os.makedirs(upload_dir, exist_ok=True)

        for f in landmark_files:
            with open(os.path.join(upload_dir, f.name), 'wb+') as dest:
                for chunk in f.chunks():
                    dest.write(chunk)

        try:
            landmarks = convert_landmarks(upload_dir)
            output_path = os.path.join(settings.MEDIA_ROOT, 'landmarks_combined.json')
            with open(output_path, 'w') as outfile:
                json.dump(landmarks, outfile)

            return JsonResponse({'message': 'Landmarks opgeslagen', 'output': output_path}, status=200)

        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

    return JsonResponse({'error': 'Ongeldig verzoek'}, status=400)