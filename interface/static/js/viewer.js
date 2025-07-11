// ==========================================//
// VIEWER.JS                                 //
// Render anatomy volumes in viewer-tabblad  // 
// ==========================================//

// ===== CSRF TOKEN HANDLING =====
// Retrieves CSRF token from the DOM for secure POST requests
function getCSRFToken() {
  const tokenElement = document.querySelector('[name=csrfmiddlewaretoken]');
  return tokenElement ? tokenElement.value : '';
}

// ===== LOGGING =====
// Appends a timestamped log message to a <ul id="log-list">
function addLog(message) {
  const logList = document.getElementById('log-list');
  if (!logList) return;
  const timestamp = new Date().toLocaleTimeString();
  const entry = document.createElement('li');
  entry.textContent = `[${timestamp}] ${message}`;
  logList.appendChild(entry);
  logList.scrollTop = logList.scrollHeight;
}

//////////////////////////////////////////////////////////////////////////////////////////////
      //=====================//
      // Viewer Definition   //
      //=====================//

//===== Initialize VTK viewer =====
// Sets up renderer, interactor, container dimensions, etc.
function createViewer(containerId, interactorStyle = '2D') {
  const container = document.getElementById(containerId);
  const content = container.querySelector('.viewer-content');
  content.innerHTML = '';

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
  
  return {renderer, renderWindow};
}

//===== Render input volume in all 2D and 3D viewers =====
// Renders a 3D volume in all viewer panes (2D and 3D) with synchronized orientation.
function addVolumeToViewers(volumeData) {
  const imageData = vtk.Common.DataModel.vtkImageData.newInstance();
  imageData.setDimensions(volumeData.dimensions);
  imageData.setSpacing(...volumeData.spacing);
  imageData.setOrigin(...volumeData.origin)

  imageData.getPointData().setScalars(
    vtk.Common.Core.vtkDataArray.newInstance({
      name: 'Scalars',
      values: new Uint8Array(volumeData.data),
      numberOfComponents: 1
    })
  );

  // Set orientation to LPS for logic visualisation (AP, LR, SI)
  const slicingModeMap = {
    I: vtk.Rendering.Core.vtkImageMapper.SlicingMode.Z,
    J: vtk.Rendering.Core.vtkImageMapper.SlicingMode.X,
    K: vtk.Rendering.Core.vtkImageMapper.SlicingMode.Y
  };
  const axisIndexMap = { I: 2, J: 0, K: 1 };
  const viewUpMap = {
    'viewer-axial': [0, 1, 0],     
    'viewer-coronal': [1, 0, 0],    
    'viewer-sagittal': [0, 0, -1]  
  };
  const views = [
    { id: 'viewer-3d', style: '3D', mapper: 'volume' },
    { id: 'viewer-axial', mode: 'J' },
    { id: 'viewer-coronal', mode: 'K' },
    { id: 'viewer-sagittal', mode: 'I' }
  ];

  // fill in the viewblocks
  views.forEach(view => {
    const container = document.getElementById(view.id);
    if (!container) return;

    try {
      const { renderer, renderWindow } = createViewer(view.id, view.style || '2D');

      if (view.mapper === 'volume') {   // 3D viewer
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

      } else {     // 2D viewers
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

        // camera settings
        const camera = renderer.getActiveCamera();
        camera.setParallelProjection(true);

        const spacing = volumeData.spacing;
        const origin = volumeData.origin || [0, 0, 0];
        const focalPoint = origin.slice();
        focalPoint[axisIndex] += spacing[axisIndex] * sliceIndex;

        camera.setFocalPoint(...focalPoint);
        camera.setPosition(...focalPoint.map((v, i) => i === axisIndex ? v + 1 : v));
        const customViewUp = viewUpMap[view.id] || viewUpMap[axisIndex];
        if (customViewUp) camera.setViewUp(...customViewUp);

        renderer.resetCamera();
        renderWindow.render();

      }
    } catch (error) {
      console.error(`Failure during rendering view ${view.id}:`, error);
      addLog(`Failure during rendering view ${view.id}: ${error.message}`);
    }
  });
}

//////////////////////////////////////////////////////////////////////////////////////////////

        //===================================================//
        // Fetch volumes from media and visualize in viewer  //
        //===================================================//
   
//===== Fetch and render converted DICOM as preview volume =====
function fetchAndVisualizeDICOM2NIFTIvolume() {
  addLog('Start visualisation of DICOM volume...');

  fetch('/media/volume_base.meta_preview.json?t=' + new Date().getTime())
    .then(response => {
      if (!response.ok) throw new Error("Meta-information not found.");
      return response.json();
    })
    .then(meta => {
      const spacing = meta.spacing;
      const dims = meta.dims;
      const totalSize = dims[0] * dims[1] * dims[2];
      const origin = meta.origin;

      fetch('/media/volume_dicom_preview.bin?t=' + new Date().getTime())
        .then(response => response.arrayBuffer())
        .then(buffer => {
          const flatData = new Uint8Array(buffer);
          if (flatData.length !== totalSize) {
            throw new Error(`Data mismatch: expected ${totalSize} voxels, but received ${flatData.length}`);
          }

          addLog('Volume data loaded successfully, start visualization...');
          addLog(`Volume dimensions: ${dims.join(' x ')}, spacing: ${spacing.join(', ')}, origin: ${origin.join(", ," )} `);
          addVolumeToViewers({ data: flatData, dimensions: dims, spacing: spacing, origin: origin});
          addLog('DICOM volume loaded and visualized.');
        });
    })
    .catch(error => {
      console.error('Error loading volume:', error);
      addLog('Meta or binary data not found.');
    });
}

//===== Fetch and render uploaded NIFTI preview volume =====
function fetchAndVisualizeNiftivolume() {
  addLog('Start visualisation of NIFTI volume...');

  fetch('/media/volume_base.meta_preview.json?t=' + new Date().getTime())
    .then(response => {
      if (!response.ok) throw new Error("Meta-information not found.");
      return response.json();
    })
    .then(meta => {
      const spacing = meta.spacing;
      const dims = meta.dims;
      const totalSize = dims[0] * dims[1] * dims[2];
      const origin = meta.origin;

      fetch('/media/volume_nifti_preview.bin?t=' + new Date().getTime())
        .then(response => response.arrayBuffer())
        .then(buffer => {
          const flatData = new Uint8Array(buffer);
          if (flatData.length !== totalSize) {
            throw new Error(`Data mismatch: expected ${totalSize} voxels, but received ${flatData.length}`);
          }

          addLog('Volume data loaded successfully, start visualization...');
          addLog(`Volume dimensions: ${dims.join(' x ')}, spacing: ${spacing.join(', ')}, origin: ${origin.join(", ," )}`);
          addVolumeToViewers({ data: flatData, dimensions: dims, spacing: spacing, origin: origin});
          addLog('NIFTI volume loaded and visualized.');
        });
    })
    .catch(error => {
      console.error('Error loading volume:', error);
      addLog('Meta or binary data not found.');
    });
}

//////////////////////////////////////////////////////////////////////////////////////////////
          //===================//
          // User interaction  //
          //===================//

//=== Upload and visualize DICOM volume =====
document.getElementById('dnifti-visualize-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const formData = new FormData(this);
  fetch('/upload/', {
    method: 'POST',
    headers: { 'X-CSRFToken': getCSRFToken() },
    body: formData,
  })
  .then(response => {
    if (response.ok) {
      fetchAndVisualizeDICOM2NIFTIvolume();
    }
  })
  .catch(error => {
    console.error('Upload failure:', error);
    addLog('Error in code');   
  });
});

//=== Upload and visualize NIFTI volume =====
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
      fetchAndVisualizeNiftivolume();
    } else {
      addLog('Error uploading NIFTI');
    }
  })
  .catch(error => {
    console.error('Upload failure:', error);
    addLog('error in code.');
  });
});

//=== Reset viewer
document.getElementById('reset-viewer-btn').addEventListener('click', () => {
  addLog('Reset viewer');

  ['viewer-3d', 'viewer-axial', 'viewer-coronal', 'viewer-sagittal'].forEach(id => {
    const container = document.getElementById(id);
    const content = container.querySelector('.viewer-content');
    if (content) content.innerHTML = '';
  });

  addLog('viewer content has been emptied')
});
