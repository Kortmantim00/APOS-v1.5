// Logfunctie
function addLog(message) {
  const logList = document.getElementById('log-list');
  if (!logList) return;
  const entry = document.createElement('li');
  const timestamp = new Date().toLocaleTimeString();
  entry.textContent = `[${timestamp}] ${message}`;
  logList.appendChild(entry);
  logList.scrollTop = logList.scrollHeight;
}

// DICOM upload handler
document.getElementById('visualize-btn').addEventListener('click', function (e) {
  e.preventDefault();

  const files = document.getElementById('dicom-files').files;
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('dicom_files', files[i]);
  }

  fetch('/upload-dicom/', {
    method: 'POST',
    body: formData,
  })
    .then(response => response.json())
    .then(data => {
      if (data.error) {
        addLog('Fout bij uploaden: ' + data.error);
      } else {
        addLog('DICOM succesvol verwerkt.');
        console.log(data.voxels);
        // TODO: gebruik echte data in plaats van dummy
      }
    })
    .catch(err => {
      addLog('Netwerkfout bij uploaden.');
      console.error(err);
    });
});

// Viewer setup
function createViewer(containerId, interactorStyle = '2D') {
  const container = document.getElementById(containerId);

  const renderWindow = vtk.Rendering.Core.vtkRenderWindow.newInstance();
  const renderer = vtk.Rendering.Core.vtkRenderer.newInstance();
  renderWindow.addRenderer(renderer);

  const openGLRenderWindow = vtk.Rendering.OpenGL.vtkRenderWindow.newInstance();
  openGLRenderWindow.setContainer(container);
  renderWindow.addView(openGLRenderWindow);
  openGLRenderWindow.setSize(container.clientWidth, container.clientHeight);

  const interactor = vtk.Rendering.Core.vtkRenderWindowInteractor.newInstance();
  interactor.setView(openGLRenderWindow);
  interactor.initialize();
  interactor.bindEvents(container);

  if (interactorStyle === '2D') {
    interactor.setInteractorStyle(vtk.Interaction.Style.vtkInteractorStyleImage.newInstance());
  } else {
    interactor.setInteractorStyle(vtk.Interaction.Style.vtkInteractorStyleTrackballCamera.newInstance());
  }

  return { renderer, renderWindow };
}

// Dummy volume
function createDummyVolumeData() {
  const imageData = vtk.Common.DataModel.vtkImageData.newInstance();
  const dims = [100, 100, 100];
  imageData.setDimensions(dims);
  const scalars = new Uint8Array(dims[0] * dims[1] * dims[2]);
  for (let i = 0; i < scalars.length; i++) {
    scalars[i] = Math.random() * 255;
  }
  const dataArray = vtk.Common.Core.vtkDataArray.newInstance({
    name: 'Scalars',
    values: scalars,
  });
  imageData.getPointData().setScalars(dataArray);
  return imageData;
}

// Volledig viewer-init
document.addEventListener('DOMContentLoaded', () => {
  const imageData = createDummyVolumeData();

  // 3D
  const { renderer: r3D, renderWindow: rw3D } = createViewer('viewer-3d', '3D');
  const volumeMapper = vtk.Rendering.Core.vtkVolumeMapper.newInstance();
  volumeMapper.setInputData(imageData);
  const volume = vtk.Rendering.Core.vtkVolume.newInstance();
  volume.setMapper(volumeMapper);
  r3D.addVolume(volume);
  r3D.resetCamera();
  rw3D.render();

  // Axial
  const { renderer: rAxial, renderWindow: rwAxial } = createViewer('viewer-axial', '2D');
  const mAxial = vtk.Rendering.Core.vtkImageMapper.newInstance();
  mAxial.setInputData(imageData);
  mAxial.setSliceAtFocalPoint(true);
  mAxial.setSlicingMode(vtk.Rendering.Core.vtkImageMapper.SlicingMode.K);
  mAxial.setSlice(50);
  const sAxial = vtk.Rendering.Core.vtkImageSlice.newInstance();
  sAxial.setMapper(mAxial);
  rAxial.addViewProp(sAxial);
  rAxial.resetCamera();
  rwAxial.render();

  // Coronal
  const { renderer: rCoronal, renderWindow: rwCoronal } = createViewer('viewer-coronal', '2D');
  const mCoronal = vtk.Rendering.Core.vtkImageMapper.newInstance();
  mCoronal.setInputData(imageData);
  mCoronal.setSliceAtFocalPoint(true);
  mCoronal.setSlicingMode(vtk.Rendering.Core.vtkImageMapper.SlicingMode.J);
  mCoronal.setSlice(50);
  const sCoronal = vtk.Rendering.Core.vtkImageSlice.newInstance();
  sCoronal.setMapper(mCoronal);
  rCoronal.addViewProp(sCoronal);
  rCoronal.resetCamera();
  rwCoronal.render();

  // Sagittal
  const { renderer: rSagittal, renderWindow: rwSagittal } = createViewer('viewer-sagittal', '2D');
  const mSagittal = vtk.Rendering.Core.vtkImageMapper.newInstance();
  mSagittal.setInputData(imageData);
  mSagittal.setSliceAtFocalPoint(true);
  mSagittal.setSlicingMode(vtk.Rendering.Core.vtkImageMapper.SlicingMode.I);
  mSagittal.setSlice(50);
  const sSagittal = vtk.Rendering.Core.vtkImageSlice.newInstance();
  sSagittal.setMapper(mSagittal);
  rSagittal.addViewProp(sSagittal);
  rSagittal.resetCamera();
  rwSagittal.render();
});
