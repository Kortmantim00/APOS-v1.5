// ====================================================//
// Segmarks.JS                                         //
// Add segmentation NIFTI and landmarks to the viewer  //
// Multi-volume viewer                                 //
// ====================================================//

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

const viewerManagers = {
  'viewer-3d': { renderer: null, renderWindow: null, actors: {} },
  'viewer-axial': { renderer: null, renderWindow: null, actors: {} },
  'viewer-coronal': { renderer: null, renderWindow: null, actors: {} },
  'viewer-sagittal': { renderer: null, renderWindow: null, actors: {} },
};

const viewerLandmarks = {
  'viewer-axial': [],
  'viewer-coronal': [],
  'viewer-sagittal': []
};

//===== Initialize VTK viewer =====
// Sets up renderer, interactor, container dimensions, etc.
function initializeViewer(viewerId, interactorStyle = '2D') {
  const container = document.getElementById(viewerId);
  const content = container.querySelector('.viewer-content');
  const viewer = viewerManagers[viewerId];

  if (viewer.renderer){ 
    return viewer;
  }

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

  viewer.renderer = renderer;
  viewer.renderWindow = renderWindow;
  viewer.actors = {};

  return viewer;
}

//===== Render input volume in all 2D and 3D viewers =====
// Renders a 3D volume in all viewer panes (2D and 3D) with dataset-specific color mapping and synchronized orientation.
function addVolumeToViewers(volumeData, datasetId) {
  const imageData = vtk.Common.DataModel.vtkImageData.newInstance();
  imageData.setDimensions(volumeData.dimensions);
  imageData.setSpacing(...volumeData.spacing);
  imageData.setOrigin(...volumeData.origin);

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
      const { renderer, renderWindow, actors} = initializeViewer(view.id, view.style || '2D');

      if (view.mapper === 'volume') {     // 3D viewer
        const volumeMapper = vtk.Rendering.Core.vtkVolumeMapper.newInstance();
        volumeMapper.setInputData(imageData);
        const volume = vtk.Rendering.Core.vtkVolume.newInstance();
        volume.setMapper(volumeMapper);

        const volumeProperty = vtk.Rendering.Core.vtkVolumeProperty.newInstance();
        volumeProperty.setShade(true);
        volumeProperty.setInterpolationTypeToLinear();
        const ctfun = vtk.Rendering.Core.vtkColorTransferFunction.newInstance();
        const ofun = vtk.Common.DataModel.vtkPiecewiseFunction.newInstance();
        if (datasetId.toLowerCase().includes('seg')) {    //seg
          ctfun.addRGBPoint(0, 0.0, 0.0, 0.0);
          ctfun.addRGBPoint(255, 1.0, 0.0, 0.0); // red
          ofun.addPoint(0.0, 0.0);
          ofun.addPoint(255.0, 1.0); 
        } else if (datasetId.toLowerCase().includes('landmark')) {    //landmark
          ctfun.addRGBPoint(0, 0.0, 0.0, 0.0);
          ctfun.addRGBPoint(255, 0.0, 0.0, 1.0); //blue
          ofun.addPoint(0.0, 0.0);
          ofun.addPoint(255.0, 1.0);
        } else {                                       // NIFTI
          ctfun.addRGBPoint(0, 0.0, 0.0, 0.0);
          ctfun.addRGBPoint(255, 1.0, 1.0, 1.0);
          ofun.addPoint(0.0, 0.0);
          ofun.addPoint(255.0, 1.0);
          }

        volumeProperty.setScalarOpacity(0, ofun);
        volumeProperty.setRGBTransferFunction(0, ctfun);
        volume.setProperty(volumeProperty);

        renderer.addVolume(volume);
        actors[datasetId]= volume;
        renderer.resetCamera();
        renderWindow.render();

      } else {      // 2D viewers
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

        const property = vtk.Rendering.Core.vtkImageProperty.newInstance();
        const ctfun = vtk.Rendering.Core.vtkColorTransferFunction.newInstance();
        const ofun = vtk.Common.DataModel.vtkPiecewiseFunction.newInstance();

        if (datasetId.toLowerCase().includes('seg')) {   //seg
          ctfun.addRGBPoint(0, 0.0, 0.0, 0.0);
          ctfun.addRGBPoint(255, 1.0, 0.0, 0.0);   //red
          ofun.addPoint(0.0, 0.0);
          ofun.addPoint(255.0, 1.0);
        } else if (datasetId.toLowerCase().includes('landmark')) {    //landmarks
          ctfun.addRGBPoint(0, 0.0, 0.0, 0.0);
          ctfun.addRGBPoint(255, 0.0, 0.0, 1.0);   //blue
          ofun.addPoint(0.0, 0.0);
          ofun.addPoint(255.0, 1.0);
        } else {                                    // NIFTI
          ctfun.addRGBPoint(0, 0.0, 0.0, 0.0);
          ctfun.addRGBPoint(255, 1.0, 1.0, 1.0);
          ofun.addPoint(0.0, 0.0);
          ofun.addPoint(1.0, 1.0);
          ofun.addPoint(255.0, 1.0);
        }

        property.setRGBTransferFunction(0, ctfun);
        property.setScalarOpacity(0, ofun);
        property.setInterpolationTypeToLinear();

        slice.setProperty(property);

        renderer.addViewProp(slice);
        actors[datasetId] = slice;

        // camera settings
        const camera = renderer.getActiveCamera();
        camera.setParallelProjection(true);

        const spacing = volumeData.spacing;
        const origin = volumeData.origin || [0, 0, 0];
        const focalPoint = origin.slice();
        focalPoint[axisIndex] += spacing[axisIndex] * sliceIndex;

        camera.setFocalPoint(...focalPoint);
        camera.setPosition(...focalPoint.map((v, i) => i === axisIndex ? v + spacing[axisIndex] : v));
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

      datasetId = "dnifti"

      fetch('/media/volume_dicom_preview.bin?t=' + new Date().getTime())
        .then(response => response.arrayBuffer())
        .then(buffer => {
          const flatData = new Uint8Array(buffer);
          if (flatData.length !== totalSize) {
            throw new Error(`Data mismatch: expected ${totalSize} voxels, but received ${flatData.length}`);
          }

          addLog('Volume data loaded successfully, start visualization...');
          addLog(`Volume dimensions: ${dims.join(' x ')}, spacing: ${spacing.join(', ')}, origin: ${origin.join(", ," )} `);
          addVolumeToViewers({ data: flatData, dimensions: dims, spacing: spacing, origin: origin}, datasetId);
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

      datasetId = "nifti"

      fetch('/media/volume_nifti_preview.bin?t=' + new Date().getTime())
        .then(response => response.arrayBuffer())
        .then(buffer => {
          const flatData = new Uint8Array(buffer);
          if (flatData.length !== totalSize) {
            throw new Error(`Data mismatch: expected ${totalSize} voxels, but received ${flatData.length}`);
          }

          addLog('Volume data loaded successfully, start visualization...');
          addLog(`Volume dimensions: ${dims.join(' x ')}, spacing: ${spacing.join(', ')}, origin: ${origin.join(", ," )}`);
          addVolumeToViewers({ data: flatData, dimensions: dims, spacing: spacing, origin: origin}, datasetId);
          addLog('NIFTI volume loaded and visualized.');
        });
    })
    .catch(error => {
      console.error('Error loading volume:', error);
      addLog('Meta or binary data not found.');
    });
}

//===== Fetch and render segmentation preview volume //
function fetchAndVisualizeSEGNIFTIvolume(datasetId) {
  addLog('Start visualisation of segmentation volume...');

  // Haal de meta- en binaire bestanden op voor het NIFTI bestand
  fetch('/media/volume_base.meta_preview.json?t=' + new Date().getTime())
    .then(response => {
      if (!response.ok) throw new Error("Meta-information not found.");
      return response.json();
    })
    .then(meta => {
      const spacing = meta.spacing;
      const dims = meta.dims;
      const origin = meta.origin;
      const totalSize = dims[0] * dims[1] * dims[2];

      fetch('/media/segmentation_result_preview.bin?t=' + new Date().getTime())
        .then(response => response.arrayBuffer())
        .then(buffer => {
          const flatData = new Uint8Array(buffer);
          if (flatData.length !== totalSize) {
            throw new Error(`Data mismatch: excpected ${totalSize} voxels, but received ${flatData.length}`);
          }

          addLog('Volume data loaded successfully, start visualization...');
          addLog(`Volume dimensions: ${dims.join(' x ')}, spacing: ${spacing.join(', ')}, origin: ${origin.join(", ," )}`);
          addVolumeToViewers({ data: flatData, dimensions: dims, spacing: spacing, origin: origin}, datasetId);
          addLog('NIFTI volume loaded and visualized.');
        });
    })
    .catch(error => {
      console.error('Error loading volume:', error);
      addLog('Meta or binary data not found.');
    });
}

//===== Fetch and render preview landmark volume =====
function fetchAndVisualizeLandmarkVolume(datasetId) {
  addLog('Start visualisation of landmark volume...');

  fetch('/media/volume_base.meta_preview.json?t=' + new Date().getTime())
    .then(response => {
      if (!response.ok) throw new Error("Meta-information not found.");
      return response.json();
    })
    .then(meta => {
      const spacing = meta.spacing;
      const dims = meta.dims;
      const origin = meta.origin;
      const totalSize = dims[0] * dims[1] * dims[2];

      fetch('/media/landmarks_volume_preview.bin?t=' + new Date().getTime())
        .then(response => response.arrayBuffer())
        .then(buffer => {
          const flatData = new Uint8Array(buffer);
          if (flatData.length !== totalSize) {
            throw new Error(`Data mismatch: expected ${totalSize} voxels, butreceived ${flatData.length}`);
          }

          addLog('Volume data loaded successfully, start visualization...');
          addLog(`Volume dimensions: ${dims.join(' x ')}, spacing: ${spacing.join(', ')}, origin: ${origin.join(", ," )}`);
          addVolumeToViewers({ data: flatData, dimensions: dims, spacing: spacing, origin: origin }, datasetId);
          addLog('Landmarkvolume volume loaded and visualized.');
        });
    })
    .catch(error => {
      console.error('Error loading volume:', error);
      addLog('Meta or binary data not found.');
    });
}

/////////////////////////////////////////////////////////////////////////////////////////////
          //==================//
          // Other functions  //
          //==================//

//===== Remove specific data by ID from the viewers =====
function removeDatasetFromViewers(datasetId) {
  Object.values(viewerManagers).forEach(({ renderer, renderWindow, actors }) => {
    Object.entries(actors).forEach(([key, actor]) => {
      if (key.toLowerCase().includes(datasetId.toLowerCase())) {
        renderer.removeViewProp(actor);
        delete actors[key];
      }
    });
    renderWindow.render();
  });
}

//===== Remove all data from the viewer =====
function clearAllViewers() {
  Object.entries(viewerManagers).forEach(([viewerId, { renderer, renderWindow, actors }]) => {
    Object.values(actors).forEach(actor => renderer.removeViewProp(actor));
    viewerManagers[viewerId].actors = {};
    renderWindow.render();
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
    } else {
      addLog('Error uploading DICOM')
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
      fetchAndVisualizeNiftivolume('nifti');
    } else {
      addLog('Error uploading NIFTI');
    }
  })
  .catch(error => {
    console.error('Upload failure:', error);
    addLog('error in code.');
  });
});

//=== Upload and visualize NIFTI volume =====
document.getElementById('visualize-seg-btn').addEventListener('click', function(e) {
  e.preventDefault();

  const niftiFileInput = document.getElementById('nifti-file-input');
  const niftiFile = niftiFileInput.files[0]; 

  if (!niftiFile) {
    alert('No NIFTI file selected!');
    addLog('No file selected')
    return; 
  }

  addLog('Start loading the segmentation file')
  const csrfToken = getCSRFToken();
  const formData = new FormData();
  formData.append('nifti_file', niftiFile); 

  // Fetch the file form the media backend
  fetch('/segmarks/run-segmentation/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': csrfToken
    },
    body: formData,
  })
  .then(response => {
    if (response.ok) {
      addLog('Segmantation file retrieved')
      return response.json();
    } else {
      throw new Error('Error uploading segmentation');
    }
  })
  .catch(error => {
    console.error('Error:', error);
  });
});
// Function to start visualisation of segmentation
document.getElementById('show-seg-btn').addEventListener('click', function() {
  addLog('segmentation file is loaded')
  fetchAndVisualizeSEGNIFTIvolume('segnifti');
});


//=== Upload and visualize landmark volume =====
document.getElementById('visualize-landmarks-btn').addEventListener('click', function(e) {
  e.preventDefault();

  const landmarkFileInput = document.getElementById('landmarks-file-input');
  const files = landmarkFileInput.files;

  if (files.length === 0) {
    alert('No landmark file selected');
    addLog('No landmark file selected');
    return;
  }

  addLog('Start loading the landmarks')
  const csrfToken = getCSRFToken();
  const formData = new FormData();
  for (const file of files) {
    formData.append('landmarks_file', file);
  }

  fetch('/segmarks/run-landmarks/', {
    method: 'POST',
    headers: { 'X-CSRFToken': csrfToken },
    body: formData,
  })
  .then(response => {
    if (response.ok) {
      addLog('Landmark files retreived');
      return response.json();
    } else {
      throw new Error('Error uploading landmarks');
    }
  })
  .catch(error => {
    console.error('Error:', error);
  });
});
// Function to start visualisation of landmarks
document.getElementById('show-landmarks-btn').addEventListener('click', function() {
  fetchAndVisualizeLandmarkVolume('landmarks');
});

//////////////////////////////////////////////////////////////////////////////////////////////

//===== Hide and reset buttons =====
// DICOM
document.getElementById('hide-dicom-btn').addEventListener('click', function() {
  removeDatasetFromViewers(datasetId = 'dnifti');
});
// NIFTI
document.getElementById('hide-nifti-btn').addEventListener('click', function() {
  removeDatasetFromViewers(datasetId = 'nifti');
});
// SEG
document.getElementById('hide-seg-btn').addEventListener('click', function() {
  removeDatasetFromViewers(datasetId = 'segnifti');
});
// LND
document.getElementById('hide-landmarks-btn').addEventListener('click', function() {
  removeDatasetFromViewers(datasetId = "landmarks");
});

// Reset button
document.getElementById('reset-viewer-btn').addEventListener('click',function() {
  addLog('Reset viewer');
  clearAllViewers();
  addLog('Entire viewer has been emptied');
});






