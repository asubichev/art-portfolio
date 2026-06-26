/**
 * admin.js — Admin panel
 *
 * Handles:
 *  - Authentication (login / logout via Supabase Auth)
 *  - Artwork list (all statuses)
 *  - Single & bulk image upload with client-side processing
 *  - Metadata create / edit
 *  - Publish / archive / draft toggle
 *  - Delete
 */

// ─── State ───────────────────────────────────────────────────────────────────
let currentUser = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user ?? null;
  renderAuthState();

  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
    renderAuthState();
  });

  // Login form
  document.getElementById('login-form').addEventListener('submit', handleLogin);

  // Upload form
  document.getElementById('upload-form').addEventListener('submit', handleUpload);

  // File input preview
  document.getElementById('upload-files').addEventListener('change', handleFilePreview);
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
function renderAuthState() {
  const loginSection = document.getElementById('login-section');
  const dashSection = document.getElementById('dashboard-section');
  const userEmail = document.getElementById('user-email');

  if (currentUser) {
    loginSection.hidden = true;
    dashSection.hidden = false;
    userEmail.textContent = currentUser.email;
    loadArtworks();
  } else {
    loginSection.hidden = false;
    dashSection.hidden = true;
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');
  const loginError = document.getElementById('login-error');

  loginError.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Signing in…';

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  btn.disabled = false;
  btn.textContent = 'Sign in';

  if (error) {
    loginError.textContent = error.message;
  }
}

document.getElementById('logout-btn')?.addEventListener('click', async () => {
  await supabase.auth.signOut();
});

// ─── Artwork list ─────────────────────────────────────────────────────────────
async function loadArtworks() {
  const list = document.getElementById('artworks-list');
  list.innerHTML = '<p class="loading-text">Loading…</p>';

  const { data: artworks, error } = await supabase
    .from('artworks')
    .select('id, title, status, medium, year, thumb_path, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    list.innerHTML = `<p class="error-text">Error loading artworks: ${error.message}</p>`;
    return;
  }

  if (!artworks || artworks.length === 0) {
    list.innerHTML = '<p class="empty-text">No artworks yet. Upload your first piece above.</p>';
    return;
  }

  renderArtworkList(artworks, list);
}

function getPublicUrl(path) {
  if (!path) return '';
  const { data } = supabase.storage.from('artworks').getPublicUrl(path);
  return data?.publicUrl ?? '';
}

function renderArtworkList(artworks, container) {
  container.innerHTML = '';

  artworks.forEach((art) => {
    const thumbUrl = getPublicUrl(art.thumb_path);
    const row = document.createElement('div');
    row.className = `artwork-row artwork-row--${art.status}`;
    row.dataset.id = art.id;

    row.innerHTML = `
      <div class="artwork-row-thumb">
        ${thumbUrl ? `<img src="${escapeAttr(thumbUrl)}" alt="${escapeAttr(art.title)}" loading="lazy">` : '<span class="no-thumb">—</span>'}
      </div>
      <div class="artwork-row-info">
        <strong class="artwork-row-title">${escapeHtml(art.title)}</strong>
        <span class="artwork-row-meta">${[art.medium, art.year].filter(Boolean).join(', ')}</span>
      </div>
      <div class="artwork-row-status">
        <span class="status-badge status-badge--${art.status}">${art.status}</span>
      </div>
      <div class="artwork-row-actions">
        <button class="btn btn-sm btn-edit" data-id="${escapeAttr(art.id)}">Edit</button>
        ${art.status !== 'published' ? `<button class="btn btn-sm btn-publish" data-id="${escapeAttr(art.id)}">Publish</button>` : ''}
        ${art.status !== 'archived' ? `<button class="btn btn-sm btn-archive" data-id="${escapeAttr(art.id)}">Archive</button>` : ''}
        ${art.status !== 'draft' ? `<button class="btn btn-sm btn-draft" data-id="${escapeAttr(art.id)}">Draft</button>` : ''}
        <button class="btn btn-sm btn-delete" data-id="${escapeAttr(art.id)}">Delete</button>
      </div>
    `;

    container.appendChild(row);
  });

  // Attach event listeners
  container.querySelectorAll('.btn-edit').forEach((btn) =>
    btn.addEventListener('click', () => openEditModal(btn.dataset.id)),
  );
  container.querySelectorAll('.btn-publish').forEach((btn) =>
    btn.addEventListener('click', () => setStatus(btn.dataset.id, 'published')),
  );
  container.querySelectorAll('.btn-archive').forEach((btn) =>
    btn.addEventListener('click', () => setStatus(btn.dataset.id, 'archived')),
  );
  container.querySelectorAll('.btn-draft').forEach((btn) =>
    btn.addEventListener('click', () => setStatus(btn.dataset.id, 'draft')),
  );
  container.querySelectorAll('.btn-delete').forEach((btn) =>
    btn.addEventListener('click', () => deleteArtwork(btn.dataset.id)),
  );
}

async function setStatus(id, status) {
  const { error } = await supabase
    .from('artworks')
    .update({ status })
    .eq('id', id);

  if (error) {
    alert(`Failed to update status: ${error.message}`);
    return;
  }
  loadArtworks();
}

async function deleteArtwork(id) {
  if (!confirm('Delete this artwork? This cannot be undone.')) return;

  // Fetch paths first so we can clean up storage
  const { data: art } = await supabase
    .from('artworks')
    .select('image_path, thumb_path')
    .eq('id', id)
    .single();

  if (art) {
    const toDelete = [art.image_path, art.thumb_path].filter(Boolean);
    if (toDelete.length) {
      await supabase.storage.from('artworks').remove(toDelete);
    }
  }

  const { error } = await supabase.from('artworks').delete().eq('id', id);
  if (error) {
    alert(`Failed to delete: ${error.message}`);
    return;
  }
  loadArtworks();
}

// ─── Upload ───────────────────────────────────────────────────────────────────
let pendingFiles = []; // Array of { file, metaOverrides }

function handleFilePreview(e) {
  const files = Array.from(e.target.files);
  pendingFiles = files.map((f) => ({ file: f }));

  const preview = document.getElementById('upload-preview');
  preview.innerHTML = '';

  if (!files.length) return;

  files.forEach((file, idx) => {
    const url = URL.createObjectURL(file);
    const item = document.createElement('div');
    item.className = 'preview-item';
    item.innerHTML = `
      <img src="${escapeAttr(url)}" alt="Preview ${idx + 1}" class="preview-thumb">
      <input type="text" class="preview-title input" placeholder="Title *" data-idx="${idx}" data-field="title" required>
      <input type="text" class="preview-medium input" placeholder="Medium" data-idx="${idx}" data-field="medium">
      <input type="number" class="preview-year input" placeholder="Year" min="1800" max="2100" data-idx="${idx}" data-field="year">
    `;
    preview.appendChild(item);
  });

  // Sync input changes into pendingFiles
  preview.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', (ev) => {
      const idx = parseInt(ev.target.dataset.idx, 10);
      const field = ev.target.dataset.field;
      if (!pendingFiles[idx]) return;
      if (!pendingFiles[idx].meta) pendingFiles[idx].meta = {};
      pendingFiles[idx].meta[field] = ev.target.value;
    });
  });
}

async function handleUpload(e) {
  e.preventDefault();

  if (!currentUser) {
    alert('You must be logged in to upload.');
    return;
  }

  // Collect top-level form values (used as defaults when no per-file override)
  const defaultMeta = {
    title: document.getElementById('upload-title').value.trim(),
    description: document.getElementById('upload-description').value.trim(),
    medium: document.getElementById('upload-medium').value.trim(),
    material: document.getElementById('upload-material').value.trim(),
    dimensions: document.getElementById('upload-dimensions').value.trim(),
    year: document.getElementById('upload-year').value
      ? parseInt(document.getElementById('upload-year').value, 10)
      : null,
    price: document.getElementById('upload-price').value
      ? parseFloat(document.getElementById('upload-price').value)
      : null,
    available: document.getElementById('upload-available').checked,
    prints_type: document.getElementById('upload-prints-type').value,
    print_qty: document.getElementById('upload-print-qty').value
      ? parseInt(document.getElementById('upload-print-qty').value, 10)
      : null,
    print_size: document.getElementById('upload-print-size').value.trim(),
    print_price: document.getElementById('upload-print-price').value
      ? parseFloat(document.getElementById('upload-print-price').value)
      : null,
    seo_keywords: document
      .getElementById('upload-seo-keywords')
      .value.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    status: document.getElementById('upload-status').value,
  };

  if (!pendingFiles.length) {
    alert('Please select at least one image.');
    return;
  }

  const btn = document.getElementById('upload-btn');
  const progressWrap = document.getElementById('upload-progress');
  const progressBar = document.getElementById('upload-progress-bar');
  const progressText = document.getElementById('upload-progress-text');

  btn.disabled = true;
  progressWrap.hidden = false;

  let completed = 0;

  for (const { file, meta = {} } of pendingFiles) {
    const artworkTitle = meta.title || defaultMeta.title;
    if (!artworkTitle) {
      alert('Every artwork needs a title. Please fill in the title field.');
      btn.disabled = false;
      return;
    }

    progressText.textContent = `Uploading ${artworkTitle}… (${completed + 1}/${pendingFiles.length})`;

    try {
      await uploadArtwork(file, { ...defaultMeta, ...meta, title: artworkTitle });
    } catch (err) {
      alert(`Failed to upload "${artworkTitle}": ${err.message}`);
      btn.disabled = false;
      return;
    }

    completed++;
    progressBar.style.width = `${Math.round((completed / pendingFiles.length) * 100)}%`;
  }

  progressText.textContent = `Done! ${completed} artwork(s) uploaded.`;
  btn.disabled = false;

  // Reset form
  document.getElementById('upload-form').reset();
  document.getElementById('upload-preview').innerHTML = '';
  pendingFiles = [];

  setTimeout(() => {
    progressWrap.hidden = true;
    progressBar.style.width = '0%';
  }, 3000);

  loadArtworks();
}

async function uploadArtwork(file, meta) {
  // 1. Process images client-side (resize, EXIF strip, WebP/JPEG encode)
  const [imageResult, thumbResult] = await Promise.all([
    processImage(file),
    generateThumbnail(file),
  ]);

  // 2. Build storage paths
  const uid = currentUser.id;
  const uuid = crypto.randomUUID();
  const imagePath = `${uid}/${uuid}/image.${imageResult.ext}`;
  const thumbPath = `${uid}/${uuid}/thumb.${thumbResult.ext}`;

  // 3. Upload to Supabase Storage
  const [imgUpload, thumbUpload] = await Promise.all([
    supabase.storage
      .from('artworks')
      .upload(imagePath, imageResult.blob, {
        contentType: imageResult.mimeType,
        cacheControl: '31536000',
        upsert: false,
      }),
    supabase.storage
      .from('artworks')
      .upload(thumbPath, thumbResult.blob, {
        contentType: thumbResult.mimeType,
        cacheControl: '31536000',
        upsert: false,
      }),
  ]);

  if (imgUpload.error) throw imgUpload.error;
  if (thumbUpload.error) throw thumbUpload.error;

  // 4. Insert artwork record
  const record = {
    title: meta.title,
    description: meta.description || null,
    medium: meta.medium || null,
    material: meta.material || null,
    dimensions: meta.dimensions || null,
    year: meta.year || null,
    price: meta.price || null,
    seo_keywords: meta.seo_keywords?.length ? meta.seo_keywords : null,
    available: meta.available ?? true,
    prints_type: meta.prints_type || 'none',
    print_qty: meta.print_qty || null,
    print_size: meta.print_size || null,
    print_price: meta.print_price || null,
    status: meta.status || 'draft',
    image_path: imagePath,
    thumb_path: thumbPath,
    created_by: currentUser.id,
  };

  const { error } = await supabase.from('artworks').insert(record);
  if (error) throw error;
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
async function openEditModal(id) {
  const { data: art, error } = await supabase
    .from('artworks')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !art) {
    alert('Failed to load artwork data.');
    return;
  }

  const modal = document.getElementById('edit-modal');
  const form = document.getElementById('edit-form');

  // Populate fields
  setVal(form, 'edit-id', art.id);
  setVal(form, 'edit-title', art.title);
  setVal(form, 'edit-description', art.description ?? '');
  setVal(form, 'edit-medium', art.medium ?? '');
  setVal(form, 'edit-material', art.material ?? '');
  setVal(form, 'edit-dimensions', art.dimensions ?? '');
  setVal(form, 'edit-year', art.year ?? '');
  setVal(form, 'edit-price', art.price ?? '');
  form.querySelector('#edit-available').checked = art.available ?? true;
  setVal(form, 'edit-prints-type', art.prints_type ?? 'none');
  setVal(form, 'edit-print-qty', art.print_qty ?? '');
  setVal(form, 'edit-print-size', art.print_size ?? '');
  setVal(form, 'edit-print-price', art.print_price ?? '');
  setVal(form, 'edit-seo-keywords', (art.seo_keywords ?? []).join(', '));
  setVal(form, 'edit-status', art.status);

  modal.hidden = false;
}

function setVal(form, id, value) {
  const el = form.querySelector(`#${id}`) ?? document.getElementById(id);
  if (el) el.value = value ?? '';
}

document.getElementById('edit-modal-close')?.addEventListener('click', () => {
  document.getElementById('edit-modal').hidden = true;
});

document.getElementById('edit-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const id = form.querySelector('#edit-id').value;

  const updates = {
    title: form.querySelector('#edit-title').value.trim(),
    description: form.querySelector('#edit-description').value.trim() || null,
    medium: form.querySelector('#edit-medium').value.trim() || null,
    material: form.querySelector('#edit-material').value.trim() || null,
    dimensions: form.querySelector('#edit-dimensions').value.trim() || null,
    year: form.querySelector('#edit-year').value
      ? parseInt(form.querySelector('#edit-year').value, 10)
      : null,
    price: form.querySelector('#edit-price').value
      ? parseFloat(form.querySelector('#edit-price').value)
      : null,
    available: form.querySelector('#edit-available').checked,
    prints_type: form.querySelector('#edit-prints-type').value,
    print_qty: form.querySelector('#edit-print-qty').value
      ? parseInt(form.querySelector('#edit-print-qty').value, 10)
      : null,
    print_size: form.querySelector('#edit-print-size').value.trim() || null,
    print_price: form.querySelector('#edit-print-price').value
      ? parseFloat(form.querySelector('#edit-print-price').value)
      : null,
    seo_keywords: form
      .querySelector('#edit-seo-keywords')
      .value.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    status: form.querySelector('#edit-status').value,
  };

  const { error } = await supabase.from('artworks').update(updates).eq('id', id);

  if (error) {
    alert(`Failed to save: ${error.message}`);
    return;
  }

  document.getElementById('edit-modal').hidden = true;
  loadArtworks();
});

// Close modal on backdrop click
document.getElementById('edit-modal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('edit-modal')) {
    document.getElementById('edit-modal').hidden = true;
  }
});

// ─── Utilities ────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  return escapeHtml(str);
}
