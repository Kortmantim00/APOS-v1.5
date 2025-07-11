// ======================================== //
// UPLOAD.JS                                // 
// Load en process DICOM en NIFTI uploads   // 
// ======================================== //

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
          //===================//
          // User interaction  //
          //===================//

//=== Upload DICOM files =====
document.getElementById('dicom-upload-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const formData = new FormData(this);
  addLog('Upload started...');

  fetch('/upload/', {
    method: 'POST',
    headers: { 'X-CSRFToken': getCSRFToken(), 'X-Requested-With': 'XMLHttpRequest' },
    body: formData
  })
  .then(response => response.json())
  .then(data => {
    if (data.log) data.log.forEach(msg => addLog(msg));
  })
  .catch(error => {
    console.error('Upload failure:', error);
    addLog('Error in code');   
  });
});

//=== Upload NIFIT files =====
document.getElementById('nifti-upload-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const formData = new FormData(this);
  addLog('Upload started...');

  fetch('/upload/', {
    method: 'POST',
    headers: { 'X-CSRFToken': getCSRFToken(), 'X-Requested-With': 'XMLHttpRequest' },
    body: formData
  })
  .then(response => response.json())
  .then(data => {
    if (data.log) data.log.forEach(msg => addLog(msg));
  })
  .catch(error => {
    console.error('Upload failure:', error);
    addLog('Error in code');   
  });
});

//===== reset all media function =====
document.getElementById('reset-btn').addEventListener('click', () => {
  if (!confirm("Are you sure you want to empty the media folder?")) return;
  fetch('/reset/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCSRFToken()
    }
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === 'success') {
      addLog('Media-map reset succesfully.');
      updateFileList();  
    } else {
      addLog('Reset failure: ' + (data.message || 'unknown error.'));
    }
  });
});

//==== Fetch and visualize files in /media =====
function updateFileList() {
  fetch('/media-files/')
    .then(response => response.json())
    .then(data => {
      const container = document.getElementById('file-list');
      container.innerHTML = ''; 
      if (data.files.length === 0) {
        container.textContent = 'No files in media/';
        return;
      }
      const list = document.createElement('ul');
      data.files.forEach(file => {
        const item = document.createElement('li');
        item.textContent = file;
        list.appendChild(item);
      });
      container.appendChild(list);
    });
}

//===== Refresh-button =====
document.getElementById('refresh-btn').addEventListener('click', function() {
  updateFileList(); 
});

