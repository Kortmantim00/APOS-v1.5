// ====================================================//
// Segmarks.JS                                         //
// Add segmentation NIFTI and landmarks to the viewer  //
// Multi-volume viewer                                 //
// ====================================================//

// CSRF-token ophalen voor veilige POST-verzoeken //
function getCSRFToken() {
  const tokeElement = document.querySelector('[name=csrfmiddlewaretoken]');
  return tokeElement ? tokeElement.value : '';
}

// Logregel toevoegen met timestamp //
function addLog(message) {
  const logList = document.getElementById('log-list');
  if (!logList) return;
  const timestamp = new Date().toLocaleTimeString();
  const entry = document.createElement('li');
  entry.textContent = `[${timestamp}] ${message}`;
  logList.appendChild(entry);
  logList.scrollTop = logList.scrollHeight;
}

            //=========================//
            // 3D, 2D viewer definitie //
            //=========================//

const viewerManagers = {
  'viewer-3d': { renderer: null, renderWindow: null, actors: {} },
  'viewer-axial': { renderer: null, renderWindow: null, actors: {} },
  'viewer-coronal': { renderer: null, renderWindow: null, actors: {} },
  'viewer-sagittal': { renderer: null, renderWindow: null, actors: {} },
};

// Viewer aanmaken voor 2D of 3D interactie
function initializeViewer(viewerId, interactorStyle = '2D') {
  const container = document.getElementById(viewerId);
  const content = container.querySelector('.viewer-content');
  const viewer = viewerManagers[viewerId];

  if (viewer.renderer){ 
    return viewer;
  }

  content.innerHTML = ''; // Maak de viewer leeg

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

  renderer.setBackground(0.0, 0.0, 0.0);

  viewer.renderer = renderer;
  viewer.renderWindow = renderWindow;
  viewer.actors = {};

  return viewer;
}

function flipNiftiData(data, dimensions) {
  const flippedData = new Array(data.length);
  const nx = dimensions[0];  // x-dimensie
  const ny = dimensions[1];  // y-dimensie
  const nz = dimensions[2];  // z-dimensie

  // Loop door de data en flip de y-as (bijv. links-rechts)
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const oldIndex = i + j * nx + k * nx * ny;
        const newIndex = i + (ny - 1 - j) * nx + k * nx * ny;  // Flip langs de y-as
        flippedData[newIndex] = data[oldIndex];
      }
    }
  }
  return flippedData;
}

// 2D/3D weergaves laden met volumeData met slice-synchronisatie //
function addVolumeToViewers(volumeData, datasetId) {
  const imageData = vtk.Common.DataModel.vtkImageData.newInstance();
  imageData.setDimensions(volumeData.dimensions);

  if (volumeData.spacing) {
    imageData.setSpacing(...volumeData.spacing);
  } else {
    imageData.setSpacing(1, 1, 1);
  }

  // Flip de NIFTI data langs de y-as (horizontaal)
  if (datasetId === 'nifti') {
    const flippedData = flipNiftiData(volumeData.data, volumeData.dimensions);
    imageData.getPointData().setScalars(vtk.Common.Core.vtkDataArray.newInstance({
      name: 'Scalars',
      values: new Uint8Array(flippedData),
      numberOfComponents: 1
    }));
  } else {
    // Gebruik de originele data voor andere bestandstypes (DICOM, segmentatie, etc.)
    const dataArray = vtk.Common.Core.vtkDataArray.newInstance({
      name: 'Scalars',
      values: new Uint8Array(volumeData.data),
      numberOfComponents: 1
    });
    imageData.getPointData().setScalars(dataArray);
  }

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
      const { renderer, renderWindow, actors} = initializeViewer(view.id, view.style || '2D');

      if (view.mapper === 'volume') {
        const volumeMapper = vtk.Rendering.Core.vtkVolumeMapper.newInstance();
        volumeMapper.setInputData(imageData);
        const volume = vtk.Rendering.Core.vtkVolume.newInstance();
        volume.setMapper(volumeMapper);

        const volumeProperty = vtk.Rendering.Core.vtkVolumeProperty.newInstance();
        volumeProperty.setShade(true);
        volumeProperty.setInterpolationTypeToLinear();
        const ctfun = vtk.Rendering.Core.vtkColorTransferFunction.newInstance();
        const ofun = vtk.Common.DataModel.vtkPiecewiseFunction.newInstance();
        if (datasetId.toLowerCase().includes('seg')) {
          ctfun.addRGBPoint(0, 0.0, 0.0, 0.0);
          ctfun.addRGBPoint(255, 1.0, 0.0, 0.0); 
          ofun.addPoint(0.0, 0.0);
          ofun.addPoint(255.0, 1.0); 
        } else {
          ctfun.addRGBPoint(0, 0.0, 0.0, 0.0);
          ctfun.addRGBPoint(255, 1.0, 1.0, 1.0);
          ofun.addPoint(0.0, 0.0);
          ofun.addPoint(1.0, 1.0);
          ofun.addPoint(255.0, 1.0);
          }

        volumeProperty.setScalarOpacity(0, ofun);
        volumeProperty.setRGBTransferFunction(0, ctfun);
        volume.setProperty(volumeProperty);

        // Add volume to the renderer and render it
        renderer.addVolume(volume);
        actors[datasetId]= volume;
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

        const property = vtk.Rendering.Core.vtkImageProperty.newInstance();
        const ctfun = vtk.Rendering.Core.vtkColorTransferFunction.newInstance();
        const ofun = vtk.Common.DataModel.vtkPiecewiseFunction.newInstance();

        if (datasetId.toLowerCase().includes('seg')) {
          ctfun.addRGBPoint(0, 0.0, 0.0, 0.0);
          ctfun.addRGBPoint(255, 1.0, 0.0, 0.0);
          ofun.addPoint(0.0, 0.0);
          ofun.addPoint(255.0, 1.0);
        } else {
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
      }
    } catch (error) {
      console.error(`Fout bij renderen view ${view.id}:`, error);
      addLog(`Fout bij laden viewer ${view.id}: ${error.message}`);
    }
  });
}

              //=================================//
              // Volumes ophalen en visualiseren //
              //=================================//

// DICOM volume ophalen en renderen
function fetchAndVisualizeDICOM(datasetId = 'dicom') {
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

          addLog(`Volume dimensies: ${dims.join(' x ')}, Spacing: ${spacing.join(', ')}`);
          addVolumeToViewers({ data: flatData, dimensions: dims, spacing: spacing, sourceType: 'dicom' }, datasetId);
          addLog('DICOM volume geladen en gevisualiseerd.');
        });
    })
    .catch(error => {
      console.error('Fout bij laden DICOM volume:', error);
      addLog('DICOM meta of binaire data niet gevonden.');
    });
}

// NIFTI volume ophalen en renderen //
function fetchAndVisualizeNifti(datasetId = 'nifti') {
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

          addLog(`Volume dimensies: ${dims.join(' x ')}, Spacing: ${spacing.join(', ')}`);
          addVolumeToViewers({ data: flatData, dimensions: dims, spacing: spacing, sourceType: 'nifti' }, datasetId);
          addLog('NIFTI volume geladen en gevisualiseerd.');
        });
    })
    .catch(error => {
      console.error('Fout bij laden NIFTI volume:', error);
      addLog('NIFTI meta of binaire data niet gevonden.');
    });
}

// SEGMENTATIE volume ophalen en renderen //
function fetchAndVisualizesegNifti(datasetId = "segnifti") {
  console.log('Start visualisatie van het NIFTI bestand...');

  // Haal de meta- en binaire bestanden op voor het NIFTI bestand
  fetch('/media/segmentation_result.meta.json?t=' + new Date().getTime())
    .then(response => {
      if (!response.ok) throw new Error("Meta-informatie niet gevonden.");
      return response.json();
    })
    .then(meta => {
      const spacing = meta.spacing;
      const dims = meta.dims;
      const totalSize = dims[0] * dims[1] * dims[2];

      fetch('/media/segmentation_result.bin?t=' + new Date().getTime())
        .then(response => response.arrayBuffer())
        .then(buffer => {
          const flatData = new Uint8Array(buffer);
          if (flatData.length !== totalSize) {
            throw new Error(`Data mismatch: verwacht ${totalSize} voxels, maar kreeg ${flatData.length}`);
          }

          addLog(`Volume dimensies: ${dims.join(' x ')}, Spacing: ${spacing.join(', ')}`);
          addVolumeToViewers({ data: flatData, dimensions: dims, spacing: spacing, sourceType: 'nifti' }, datasetId);
          addLog('NIFTI volume geladen en gevisualiseerd.');
        });
    })
    .catch(error => {
      console.error('Fout bij laden NIFTI volume:', error);
      addLog('NIFTI meta of binaire data niet gevonden.');
    });
}

// LANDMARK volume ophalen en renderen
function fetchAndVisualizeLandmarks(datasetId = "landmarks") {
  addLog('Start ophalen en visualiseren van landmarks');

  fetch('/media/landmarks_combined.json?t=' + new Date().getTime())
    .then(response => {
      if (!response.ok) throw new Error("Landmark data niet gevonden.");
      return response.json();
    })
    .then(landmarks => {
      // test: Haal de metadata op van dicom of nifti (voorbeeld hier met dicom)
      fetch('/media/volume_dicom.meta.json')
        .then(response => {
          if (!response.ok) throw new Error("Meta-informatie niet gevonden.");
          return response.json();
        })
        .then(meta => {
          const spacing = [1, 1, 1];
          const origin = meta.origin || [70, 45, 45]; // nog mee spelen

          const viewers = ['viewer-3d', 'viewer-axial', 'viewer-coronal', 'viewer-sagittal'];

          viewers.forEach(viewerId => {
            initializeViewer(viewerId, viewerId === 'viewer-3d' ? '3D' : '2D');
          });

          landmarks.forEach(landmark => {
            const labelClean = landmark.label.replace(/\s+/g, '_').replace(/[^\w\-]/g, '');
            const actorKey = datasetId + "_" + labelClean;

            const transformedPosition = [
              origin[0] + landmark.position.x * spacing[0],
              origin[1] + landmark.position.y * spacing[1],
              origin[2] + landmark.position.z * spacing[2]
            ];

            viewers.forEach(viewerId => {
              const viewer = viewerManagers[viewerId];

              const sphereSource = vtk.Filters.Sources.vtkSphereSource.newInstance({
                center: transformedPosition,
                radius: viewerId === 'viewer-3d' ? 2.5 : 1.5,
                thetaResolution: 12,
                phiResolution: 12
              });

              const mapper = vtk.Rendering.Core.vtkMapper.newInstance();
              mapper.setInputConnection(sphereSource.getOutputPort());

              const actor = vtk.Rendering.Core.vtkActor.newInstance();
              actor.setMapper(mapper);

              actor.getProperty().setColor(1, 0, 0); // rood


              viewer.renderer.addActor(actor);
              viewer.actors[actorKey + "_" + viewerId] = actor;
              viewer.renderWindow.render();
            });
          });

          addLog('Landmarks gevisualiseerd in 3D en 2D, gesynchroniseerd.');
        });
    })
    .catch(error => {
      console.error('Fout bij laden landmarks:', error);
      addLog('Landmark data niet gevonden.');
    });
}



            //==================//
            // Overige functies //
            //==================//

// Update de Results-sectie met voxelinformatie //
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

// Dataset verwijderen uit viewers //
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

// Viewer volledig resetten //
function clearAllViewers() {
  Object.entries(viewerManagers).forEach(([viewerId, { renderer, renderWindow, actors }]) => {
    Object.values(actors).forEach(actor => renderer.removeViewProp(actor));
    viewerManagers[viewerId].actors = {};
    renderWindow.render();
  });
}

          //======================//
          // Gebruikersinteractie //
          //======================//

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
      fetchAndVisualizeDICOM("dicom");
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
      fetchAndVisualizeNifti('nifti');
    } else {
      addLog('Fout bij upload NIFTI.');
    }
  })
  .catch(error => {
    console.error('Upload fout:', error);
    addLog('fout in code.');
  });
});

// Uplaodform verwerken SEGMENTATIE-bestanden
document.getElementById('visualize-seg-btn').addEventListener('click', function(e) {
  e.preventDefault();

  const niftiFileInput = document.getElementById('nifti-file-input');
  const niftiFile = niftiFileInput.files[0];  // Verkrijg het eerste bestand (als er een geselecteerd is)

  if (!niftiFile) {
    alert('Geen NIFTI bestand geselecteerd!');
    addLog('geen bestand geselecteerd')
    return;  // Stop de uitvoering als er geen bestand is geselecteerd
  }

  addLog('Start ophalen segmentatiefile')
  const csrfToken = getCSRFToken();
  const formData = new FormData();
  formData.append('nifti_file', niftiFile);  // Voeg het geselecteerde bestand toe

  // Stuur het bestand naar de server
  fetch('/segmarks/run-segmentation/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': csrfToken
    },
    body: formData,
  })
  .then(response => {
    if (response.ok) {
      addLog('Segmantatie file opgehaald')
      return response.json();
    } else {
      throw new Error('Er ging iets mis bij het verwerken van het bestand.');
    }
  })
  .catch(error => {
    console.error('Error:', error);
  });
});

document.getElementById('show-seg-btn').addEventListener('click', function() {
  // Functie om de visualisatie van het NIFTI bestand op te starten
  addLog('segmentatie file wordt ingeladen')
  fetchAndVisualizesegNifti('segnifti');
});

// Uplaodform verwerken LANDMARK-bestanden //
document.getElementById('visualize-landmarks-btn').addEventListener('click', function(e) {
  e.preventDefault();

  const landmarkFileInput = document.getElementById('landmarks-file-input');
  const files = landmarkFileInput.files;

  if (files.length === 0) {
    alert('Geen landmark bestand geselecteerd!');
    addLog('Geen landmark bestand geselecteerd');
    return;
  }

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
      addLog('Landmark bestanden verwerkt');
      return response.json();
    } else {
      throw new Error('Fout bij verwerken van landmarks');
    }
  })
  .catch(error => {
    console.error('Error:', error);
    addLog('Fout bij verwerken landmarks');
  });
});

document.getElementById('show-landmarks-btn').addEventListener('click', function() {
  fetchAndVisualizeLandmarks('landmarks');
});

// Hide buttons
document.getElementById('hide-dicom-btn').addEventListener('click', function() {
  removeDatasetFromViewers(datasetId = 'dicom');
});

document.getElementById('hide-nifti-btn').addEventListener('click', function() {
  removeDatasetFromViewers(datasetId = 'nifti');
});

document.getElementById('hide-seg-btn').addEventListener('click', function() {
  removeDatasetFromViewers(datasetId = 'segnifti');
});

document.getElementById('hide-landmarks-btn').addEventListener('click', function() {
  removeDatasetFromViewers(datasetId = "landmarks");
});

// Reset button
document.getElementById('reset-viewer-btn').addEventListener('click',function() {
  addLog('Reset viewer');
  clearAllViewers();
  addLog('Gehele viewer is geleegd');
});






