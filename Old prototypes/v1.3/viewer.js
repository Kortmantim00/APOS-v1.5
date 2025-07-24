// ====================
// VIEWER.JS
// Render volumes in viewer-tabblad
// ====================

// CSRF-token ophalen voor veilige POST-verzoeken
function getCSRFToken() {
  const tokeElement = document.querySelector('[name=csrfmiddlewaretoken]');
  return tokeElement ? tokeElement.value : '';
}

// Logregel toevoegen met timestamp
function addLog(message) {
  const logList = document.getElementById('log-list');
  if (!logList) return;
  const timestamp = new Date().toLocaleTimeString();
  const entry = document.createElement('li');
  entry.textContent = `[${timestamp}] ${message}`;
  logList.appendChild(entry);
  logList.scrollTop = logList.scrollHeight;
}

// Viewer aanmaken voor 2D of 3D interactie
function createViewer(containerId, interactorStyle = '2D') {
  const container = document.getElementById(containerId);
  const content = container.querySelector('.viewer-content');
  content.innerHTML = ''; // maak viewer leeg

  const renderWindow = vtk.Rendering.Core.vtkRenderWindow.newInstance();
  const renderer = vtk.Rendering.Core.vtkRenderer.newInstance();
  renderWindow.addRenderer(renderer);

  const openGLRenderWindow = vtk.Rendering.OpenGL.vtkRenderWindow.newInstance();
  openGLRenderWindow.setContainer(content);
  renderWindow.addView(openGLRenderWindow);

  const bbox = content.getBoundingClientRect();
  const width = Math.max(10, Math.floor(bbox.width));
  const height = Math.max(10, Math.floor(bbox.height));
  openGLRenderWindow.setSize(width, height);

  const interactor = vtk.Rendering.Core.vtkRenderWindowInteractor.newInstance();
  interactor.setView(openGLRenderWindow); 
  interactor.initialize();
  interactor.bindEvents(content);

  if (interactorStyle === '2D') {
    interactor.setInteractorStyle(vtk.Interaction.Style.vtkInteractorStyleImage.newInstance());
  } else {
    interactor.setInteractorStyle(vtk.Interaction.Style.vtkInteractorStyleTrackballCamera.newInstance());
  }

  setTimeout(() => {
    renderWindow.render();
  }, 10);

  console.log(`→ ${containerId} viewer-content size:`, content.clientWidth, content.clientHeight);

  return { renderer, renderWindow };
}

// 2D/3D weergaves laden met volumeData met slice-synchronisatie
function loadVolumeToViewers(volumeData) {
  const imageData = vtk.Common.DataModel.vtkImageData.newInstance();
  imageData.setDimensions(volumeData.dimensions);

  if (volumeData.spacing) {
    imageData.setSpacing(...volumeData.spacing);
  } else {
    imageData.setSpacing(1, 1, 1);
  }

  const dataArray = vtk.Common.Core.vtkDataArray.newInstance({
    name: 'Scalars',
    values: new Uint8Array(volumeData.data),
    numberOfComponents: 1 
  });
  imageData.getPointData().setScalars(dataArray);

  let slicingModeMap;
  let axisIndexMap;
  let viewUpMap;
  let views;
  const viewerState = {};

  if (volumeData.sourceType === 'dicom') {
    slicingModeMap = {
      I: vtk.Rendering.Core.vtkImageMapper.SlicingMode.X,
      J: vtk.Rendering.Core.vtkImageMapper.SlicingMode.Y,
      K: vtk.Rendering.Core.vtkImageMapper.SlicingMode.Z
    };
    axisIndexMap = { I: 0, J: 1, K: 2 };
    viewUpMap = {
      0: [0, 0, 1],
      1: [0, 0, 1],
      2: [0, -1, 0],
    };
    views = [
      { id: 'viewer-3d', style: '3D', mapper: 'volume' },
      { id: 'viewer-axial', mode: 'K' },
      { id: 'viewer-coronal', mode: 'J' },
      { id: 'viewer-sagittal', mode: 'I' }
    ];
  } else if (volumeData.sourceType === 'nifti') {
    slicingModeMap = {
      I: vtk.Rendering.Core.vtkImageMapper.SlicingMode.Z,
      J: vtk.Rendering.Core.vtkImageMapper.SlicingMode.X,
      K: vtk.Rendering.Core.vtkImageMapper.SlicingMode.Y
    };
    axisIndexMap = { I: 2, J: 0, K: 1 };
    viewUpMap = {
      'viewer-axial': [0, -1, 0],
      'viewer-coronal': [1, 0, 0],
      'viewer-sagittal': [0, 0, -1]
    };
    views = [
      { id: 'viewer-3d', style: '3D', mapper: 'volume' },
      { id: 'viewer-axial', mode: 'J' },
      { id: 'viewer-coronal', mode: 'K' },
      { id: 'viewer-sagittal', mode: 'I' }
    ];
  } else {
    throw new Error(`Onbekende sourceType: ${volumeData.sourceType}`);
  }

  views.forEach(view => {
    const container = document.getElementById(view.id);
    if (!container) return;

    try {
      const { renderer, renderWindow } = createViewer(view.id, view.style || '2D');

      if (view.mapper === 'volume') {
        const volumeMapper = vtk.Rendering.Core.vtkVolumeMapper.newInstance();
        volumeMapper.setInputData(imageData);
        const volume = vtk.Rendering.Core.vtkVolume.newInstance();
        volume.setMapper(volumeMapper);

        const volumeProperty = vtk.Rendering.Core.vtkVolumeProperty.newInstance();
        volumeProperty.setShade(true);
        volumeProperty.setInterpolationTypeToLinear();
        const ctfun = vtk.Rendering.Core.vtkColorTransferFunction.newInstance();
        ctfun.addRGBPoint(0, 0.0, 0.0, 0.0);
        ctfun.addRGBPoint(255, 1.0, 1.0, 1.0);
        const ofun = vtk.Common.DataModel.vtkPiecewiseFunction.newInstance();
        ofun.addPoint(0.0, 0.0);
        ofun.addPoint(255.0, 1.0);
        volumeProperty.setRGBTransferFunction(0, ctfun);
        volumeProperty.setScalarOpacity(0, ofun);
        volume.setProperty(volumeProperty);

        renderer.addVolume(volume);
        renderer.resetCamera();
        renderWindow.render();
      } else {
        const mapper = vtk.Rendering.Core.vtkImageMapper.newInstance();
        mapper.setInputData(imageData);

        const slicingMode = slicingModeMap[view.mode];
        const axisIndex = axisIndexMap[view.mode];
        const dim = volumeData.dimensions;
        const sliceIndex = Math.floor(dim[axisIndex] / 2);

        mapper.setSlicingMode(slicingMode);
        mapper.setSliceAtFocalPoint(true);
        mapper.setSlice(sliceIndex);

        const slice = vtk.Rendering.Core.vtkImageSlice.newInstance();
        slice.setMapper(mapper);
        renderer.addViewProp(slice);

        const camera = renderer.getActiveCamera();
        camera.setParallelProjection(true);

        const focalPoint = [0, 0, 0];
        focalPoint[axisIndex] = sliceIndex;
        camera.setFocalPoint(...focalPoint);
        camera.setPosition(...focalPoint.map((v, i) => i === axisIndex ? v + 1 : v));
        const customViewUp = viewUpMap[view.id] || viewUpMap[axisIndex];
        if (customViewUp) camera.setViewUp(...customViewUp);

        renderer.resetCamera();
        renderWindow.render();

        viewerState[view.id] = { mapper, mode: view.mode, axisIndex, container, renderWindow};

        const content = container.querySelector('.viewer-content');

        const hLine = document.createElement('div');
        hLine.className = 'crosshair-line h';
        const vLine = document.createElement('div');
        vLine.className = 'crosshair-line v';
        content.appendChild(hLine);
        content.appendChild(vLine);

        content.addEventListener('click', (event) => {
          const rect = content.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;

          const canvasX = (x / rect.width) * dim[(axisIndex + 1) % 3];
          const canvasY = (y / rect.height) * dim[(axisIndex + 2) % 3];

          const i = Math.floor(canvasX);
          const j = Math.floor(canvasY);
          const k = sliceIndex;

          let voxelCoord;
          if (view.mode === 'K') voxelCoord = [i, j, k];
          else if (view.mode === 'J') voxelCoord = [i, k, j];
          else if (view.mode === 'I') voxelCoord = [k, i, j];

          for (const [viewerId, state] of Object.entries(viewerState)) {
            const mapper = state.mapper;
            const otherAxis = axisIndexMap[state.mode];
            const viewerContent = state.container.querySelector('.viewer-content');
            const h = viewerContent.querySelector('.crosshair-line.h');
            const v = viewerContent.querySelector('.crosshair-line.v');

            if (viewerId !== view.id) {
              const otherVoxelCoord = voxelCoord.slice();
              otherVoxelCoord[otherAxis] = Math.min(Math.max(voxelCoord[otherAxis], 0), dim[otherAxis] - 1);
              mapper.setSlice(voxelCoord[otherAxis]);
              mapper.modified();
              viewerState[viewerId].renderWindow.render();
            }

            const width = viewerContent.clientWidth;
            const height = viewerContent.clientHeight;
            let relX, relY;
            if (viewerId === 'viewer-coronal') {
              relX = (voxelCoord[(otherAxis + 2) % 3] / dim[(otherAxis + 2) % 3]) * width;
              relY = (voxelCoord[(otherAxis + 1) % 3] / dim[(otherAxis + 1) % 3]) * height;
            } else {
              relX = (voxelCoord[(otherAxis + 1) % 3] / dim[(otherAxis + 1) % 3]) * width;
              relY = (voxelCoord[(otherAxis + 2) % 3] / dim[(otherAxis + 2) % 3]) * height;
            }
            h.style.top = `${relY}px`;
            v.style.left = `${relX}px`;

            updateResults(voxelCoord, {
              data: volumeData.data,
              spacing: volumeData.spacing,
              dimensions: volumeData.dimensions
            });
          }
        });
      }
    } catch (error) {
      console.error(`Fout bij renderen view ${view.id}:`, error);
      addLog(`Fout bij laden viewer ${view.id}: ${error.message}`);
    }
  });
}

//
// Volume ophalen en visualiseren
//

// DICOM volume ophalen en renderen
function fetchAndVisualizeVolume() {
  addLog('Start visualisatie van DICOM volume...');

  fetch('/media/volume_dicom.meta.json?t=' + new Date().getTime())
    .then(response => {
      if (!response.ok) throw new Error("Meta-informatie niet gevonden.");
      return response.json();
    })
    .then(meta => {
      const spacing = meta.spacing;
      const dims = meta.dims;
      const totalSize = dims[0] * dims[1] * dims[2];

      fetch('/media/volume_dicom.bin?t=' + new Date().getTime())
        .then(response => response.arrayBuffer())
        .then(buffer => {
          const flatData = new Uint8Array(buffer);
          if (flatData.length !== totalSize) {
            throw new Error(`Data mismatch: verwacht ${totalSize} voxels, maar kreeg ${flatData.length}`);
          }

          addLog('Volume data succesvol geladen, start visualisatie...');
          addLog(`Volume dimensies: ${dims.join(' x ')}, Spacing: ${spacing.join(', ')}`);
          loadVolumeToViewers({ data: flatData, dimensions: dims, spacing: spacing, sourceType: 'dicom' });
          addLog('DICOM volume geladen en gevisualiseerd.');
        });
    })
    .catch(error => {
      console.error('Fout bij laden DICOM volume:', error);
      addLog('DICOM meta of binaire data niet gevonden.');
    });
}

// NIFTI volume ophalen en renderen
function fetchAndVisualizeNifti() {
  addLog('Start visualisatie van NIFTI volume...');

  fetch('/media/volume_nifti.meta.json?t=' + new Date().getTime())
    .then(response => {
      if (!response.ok) throw new Error("Meta-informatie niet gevonden.");
      return response.json();
    })
    .then(meta => {
      const spacing = meta.spacing;
      const dims = meta.dims;
      const totalSize = dims[0] * dims[1] * dims[2];

      fetch('/media/volume_nifti.bin?t=' + new Date().getTime())
        .then(response => response.arrayBuffer())
        .then(buffer => {
          const flatData = new Uint8Array(buffer);
          if (flatData.length !== totalSize) {
            throw new Error(`Data mismatch: verwacht ${totalSize} voxels, maar kreeg ${flatData.length}`);
          }

          addLog('Volume data succesvol geladen, start visualisatie...');
          addLog(`Volume dimensies: ${dims.join(' x ')}, Spacing: ${spacing.join(', ')}`);
          loadVolumeToViewers({ data: flatData, dimensions: dims, spacing: spacing, sourceType: 'nifti' });
          addLog('NIFTI volume geladen en gevisualiseerd.');
        });
    })
    .catch(error => {
      console.error('Fout bij laden NIFTI volume:', error);
      addLog('NIFTI meta of binaire data niet gevonden.');
    });
}

//
// Gebruikersinteractie
//

// Uploadform verwerken DICOM-bestanden
document.getElementById('dicom-visualize-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const formData = new FormData(this);
  fetch('/upload/', {
    method: 'POST',
    headers: { 'X-CSRFToken': getCSRFToken() },
    body: formData,
  })
  .then(response => {
    if (response.ok) {
      fetchAndVisualizeVolume();
    }
  })
  .catch(error => {
    console.error('Upload fout:', error);
    addLog('fout in code');   
  });
});

// Uploadform verwerken NIFTI-bestanden
document.getElementById('nifti-visualize-form').addEventListener('submit', function(e) {
  e.preventDefault();

  const formData = new FormData(this);
  fetch('/upload/', {
    method: 'POST',
    headers: { 'X-CSRFToken': getCSRFToken() },
    body: formData,
  })
  .then(response => {
    if (response.ok) {
      fetchAndVisualizeNifti();
    } else {
      addLog('Fout bij upload NIFTI.');
    }
  })
  .catch(error => {
    console.error('Upload fout:', error);
    addLog('fout in code.');
  });
});

// Update de Results-sectie met voxelinformatie
function updateResults(voxel, volumeData) {
  const [x, y, z] = voxel;
  const dims = volumeData.dimensions;

  let value = 0;
  const index = z * dims[0] * dims[1] + y * dims[0] + x;
  if (index >= 0 && index < volumeData.data.length) {
    value = volumeData.data[index];
  }

  document.getElementById('voxel-index').textContent = `[${x}, ${y}, ${z}]`;
  document.getElementById('voxel-value').textContent = value;
}

// Viewer resetten
document.getElementById('reset-viewer-btn').addEventListener('click', () => {
  addLog('Resetten van viewer content');

  ['viewer-3d', 'viewer-axial', 'viewer-coronal', 'viewer-sagittal'].forEach(id => {
    const container = document.getElementById(id);
    const content = container.querySelector('.viewer-content');
    if (content) content.innerHTML = '';
  });

  addLog('viewer content geleegd')
});
