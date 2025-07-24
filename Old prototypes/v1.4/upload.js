// ====================
// UPLOAD.JS
// Verwerkt DICOM en NIFTI uploads
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

// DICOM
document.getElementById('dicom-upload-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const formData = new FormData(this);
  addLog('Upload gestart...');

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
    console.error('Upload fout:', error);
    addLog('Fout tijdens upload.');
  });
});

// NIFTI
document.getElementById('nifti-upload-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const formData = new FormData(this);
  addLog('Upload gestart...');

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
    console.error('Upload fout:', error);
    addLog('Fout tijdens upload.');
  });
});

//
// Gebruikersinteractie
//

document.getElementById('reset-btn').addEventListener('click', () => {
  if (!confirm("Weet je zeker dat je de media-map wil leegmaken?")) return;
  fetch('/reset/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCSRFToken()
    }
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === 'success') {
      addLog('Media-map succesvol gereset.');
      updateFileList();  
    } else {
      addLog('Reset mislukt: ' + (data.message || 'onbekende fout.'));
    }
  });
});

// Bestanden in /media ophalen en weergeven
function updateFileList() {
  fetch('/media-files/')
    .then(response => response.json())
    .then(data => {
      const container = document.getElementById('file-list');
      container.innerHTML = ''; 
      if (data.files.length === 0) {
        container.textContent = 'Geen bestanden in media/';
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

// Refresh-knop
document.getElementById('refresh-btn').addEventListener('click', function() {
  updateFileList(); 
});

