
from django.shortcuts import render, redirect
from .forms import NiftiFileForm
from .models import NiftiFile

def index(request):
    return render(request, 'visualizer/index.html')

def upload_file(request):
    if request.method == 'POST':
        form = NiftiFileForm(request.POST, request.FILES)
        if form.is_valid():
            form.save()
            return redirect('uploaded_files')
    else:
        form = NiftiFileForm()
    return render(request, 'visualizer/upload.html', {'form': form})

def uploaded_files(request):
    files = NiftiFile.objects.all().order_by('-uploaded_at')
    return render(request, 'visualizer/uploaded_files.html', {'files': files})

def viewer(request):
    return render(request, 'visualizer/viewer.html')

