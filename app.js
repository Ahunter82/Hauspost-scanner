// ─── Config ───────────────────────────────────────────────────────────────────
const STORAGE_KEY_CLIENT_ID = 'hauspost_client_id';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = 'Hauspost';

// ─── State ────────────────────────────────────────────────────────────────────
let photos = [];          // Array of base64 data URLs
let accessToken = null;
let tokenClient = null;
let selectedType = 'Brief';
let folderId = null;      // Cached Google Drive folder ID

// ─── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  const clientId = localStorage.getItem(STORAGE_KEY_CLIENT_ID);

  if (!clientId || clientId.trim() === '') {
    show('setup-screen');
  } else {
    show('app-screen');
    initGoogleAuth(clientId);
  }

  // Type chip selection
  document.getElementById('type-chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    selectedType = chip.dataset.type;
  });

  // Camera input
  document.getElementById('camera-input').addEventListener('change', onPhotosSelected);
});

function show(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
  document.getElementById(screenId).style.display = 'block';
}

// ─── Setup ────────────────────────────────────────────────────────────────────
function saveClientId() {
  const val = document.getElementById('client-id-input').value.trim();
  if (!val || !val.includes('.apps.googleusercontent.com')) {
    alert('Bitte eine gültige Google Client-ID eingeben (endet auf .apps.googleusercontent.com)');
    return;
  }
  localStorage.setItem(STORAGE_KEY_CLIENT_ID, val);
  show('app-screen');
  initGoogleAuth(val);
}

// ─── Google Auth ──────────────────────────────────────────────────────────────
function initGoogleAuth(clientId) {
  // Wait for Google library to load
  const tryInit = () => {
    if (typeof google === 'undefined') {
      setTimeout(tryInit, 300);
      return;
    }
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: handleTokenResponse,
    });
  };
  tryInit();
}

function handleTokenResponse(response) {
  if (response.error) {
    showToast('Anmeldung fehlgeschlagen: ' + response.error, 'error');
    return;
  }
  accessToken = response.access_token;
  folderId = null; // Reset folder cache on new token
  document.getElementById('login-btn').style.display = 'none';
  document.getElementById('user-badge').style.display = 'flex';
  showToast('Mit Google Drive verbunden ✓', 'success');
}

function signIn() {
  if (!tokenClient) {
    showToast('Google-Bibliothek lädt noch...', 'info');
    return;
  }
  tokenClient.requestAccessToken();
}

function signOut() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken);
  }
  accessToken = null;
  folderId = null;
  document.getElementById('login-btn').style.display = 'flex';
  document.getElementById('user-badge').style.display = 'none';
  showToast('Abgemeldet', 'info');
}

// ─── Camera / Photos ──────────────────────────────────────────────────────────
function onPhotosSelected(e) {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  let loaded = 0;
  files.forEach(file => {
    // Compress large images before storing
    const reader = new FileReader();
    reader.onload = ev => {
      compressImage(ev.target.result, (compressed) => {
        photos.push(compressed);
        loaded++;
        if (loaded === files.length) {
          renderPhotos();
          updateActionBar();
        }
      });
    };
    reader.readAsDataURL(file);
  });

  e.target.value = ''; // Reset so same photo can be re-added
}

function compressImage(dataUrl, callback) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const MAX = 2000;
    let w = img.width, h = img.height;

    if (w > MAX || h > MAX) {
      if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
      else        { w = Math.round(w * MAX / h); h = MAX; }
    }

    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    callback(canvas.toDataURL('image/jpeg', 0.82));
  };
  img.src = dataUrl;
}

function deletePhoto(index) {
  photos.splice(index, 1);
  renderPhotos();
  updateActionBar();
}

function clearAll() {
  if (photos.length === 0) return;
  if (!confirm(`Alle ${photos.length} Foto(s) löschen?`)) return;
  photos = [];
  renderPhotos();
  updateActionBar();
}

function renderPhotos() {
  const grid = document.getElementById('photo-grid');
  const empty = document.getElementById('empty-state');
  const countBar = document.getElementById('page-count-bar');

  if (photos.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    countBar.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  countBar.style.display = 'block';
  document.getElementById('page-count-text').textContent =
    `${photos.length} Seite${photos.length !== 1 ? 'n' : ''}`;

  grid.innerHTML = '';
  photos.forEach((photo, i) => {
    const div = document.createElement('div');
    div.className = 'photo-thumb';
    div.innerHTML = `
      <img src="${photo}" alt="Seite ${i + 1}" loading="lazy" />
      <div class="photo-overlay">
        <span class="page-num">Seite ${i + 1}</span>
        <button class="delete-btn" onclick="deletePhoto(${i})" title="Löschen">✕</button>
      </div>
    `;
    grid.appendChild(div);
  });
}

function updateActionBar() {
  document.getElementById('action-buttons').style.display =
    photos.length > 0 ? 'flex' : 'none';
}

// ─── PDF Generation ───────────────────────────────────────────────────────────
async function generatePDF() {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  for (let i = 0; i < photos.length; i++) {
    if (i > 0) pdf.addPage();

    const img = new Image();
    img.src = photos[i];
    await new Promise(resolve => { img.onload = resolve; });

    const pageW = 210, pageH = 297;
    const imgRatio  = img.naturalWidth / img.naturalHeight;
    const pageRatio = pageW / pageH;

    let w, h, x, y;
    if (imgRatio > pageRatio) {
      w = pageW; h = pageW / imgRatio;
      x = 0;     y = (pageH - h) / 2;
    } else {
      h = pageH; w = pageH * imgRatio;
      x = (pageW - w) / 2; y = 0;
    }

    pdf.addImage(photos[i], 'JPEG', x, y, w, h);
  }

  return pdf.output('blob');
}

// ─── Google Drive Upload ──────────────────────────────────────────────────────
async function uploadToDrive() {
  if (!accessToken) {
    showToast('Bitte zuerst mit Google Drive anmelden', 'warning');
    signIn();
    return;
  }

  if (photos.length === 0) {
    showToast('Keine Fotos vorhanden', 'error');
    return;
  }

  showProgress('PDF wird erstellt...');

  try {
    const pdfBlob = await generatePDF();

    showProgress('Hauspost-Ordner wird gesucht...');
    const folder = await getOrCreateFolder();

    showProgress('Wird hochgeladen...');
    const filename = buildFilename();

    const metadata = {
      name: filename,
      mimeType: 'application/pdf',
      parents: [folder],
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', pdfBlob);

    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      }
    );

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || res.statusText);
    }

    hideProgress();
    showToast(`✓ "${filename}" in Google Drive gespeichert!`, 'success', 4000);

    // Clear after success
    setTimeout(() => {
      photos = [];
      renderPhotos();
      updateActionBar();
    }, 1500);

  } catch (err) {
    hideProgress();
    // Token may have expired – prompt re-auth
    if (err.message?.includes('401') || err.message?.includes('invalid_token')) {
      accessToken = null;
      showToast('Sitzung abgelaufen – bitte erneut anmelden', 'warning', 4000);
      signIn();
    } else {
      showToast('Fehler: ' + err.message, 'error', 5000);
    }
  }
}

async function getOrCreateFolder() {
  if (folderId) return folderId;

  // Search for existing folder
  const query = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!searchRes.ok) throw new Error('Drive-Suche fehlgeschlagen');

  const data = await searchRes.json();

  if (data.files && data.files.length > 0) {
    folderId = data.files[0].id;
    return folderId;
  }

  // Create folder
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!createRes.ok) throw new Error('Ordner konnte nicht erstellt werden');

  const folder = await createRes.json();
  folderId = folder.id;
  return folderId;
}

function buildFilename() {
  const now = new Date();
  const date = now.toLocaleDateString('de-DE').replace(/\./g, '-');
  const time = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }).replace(':', '-');
  return `${selectedType}_${date}_${time}.pdf`;
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
let toastTimer = null;

function showToast(message, type = 'info', duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.style.display = 'block';

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.display = 'none';
  }, duration);
}

function showProgress(text) {
  document.getElementById('progress-text').textContent = text;
  document.getElementById('progress-overlay').style.display = 'flex';
  document.getElementById('upload-btn').disabled = true;
}

function hideProgress() {
  document.getElementById('progress-overlay').style.display = 'none';
  document.getElementById('upload-btn').disabled = false;
}

// ─── Service Worker Registration ──────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
