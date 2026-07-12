/**
 * admin.js — Admin panel
 *
 * Handles:
 *  - Authentication (login / logout via Supabase Auth)
 *  - Artwork list with inline-editable cards
 *  - Single & bulk image upload with client-side processing
 *  - Inline metadata editing with save/cancel (per card)
 *  - Drag-and-drop photo replacement on existing artworks
 *  - Bulk status change and bulk delete (word-confirmation friction)
 */

// ─── State ───────────────────────────────────────────────────────────────────
let currentUser = null;
const selectedIds = new Set();
let currentlyEditingCard = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user ?? null;
  renderAuthState();

  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
    renderAuthState();
  });

  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('upload-form').addEventListener('submit', handleUpload);
  document.getElementById('upload-files').addEventListener('change', handleFilePreview);

  // Cancel any in-progress card edit when clicking outside all cards
  document.addEventListener('click', (e) => {
    if (!currentlyEditingCard) return;
    if (!currentlyEditingCard.contains(e.target)) cancelCard(currentlyEditingCard);
  });

  // Bulk toolbar
  document.getElementById('bulk-status-apply')?.addEventListener('click', () => {
    handleBulkStatusChange(document.getElementById('bulk-status-select').value);
  });
  document.getElementById('bulk-delete-btn')?.addEventListener('click', handleBulkDelete);

  // Bulk delete confirmation modal
  document.getElementById('bulk-delete-confirm-btn')?.addEventListener('click', confirmBulkDelete);
  document.getElementById('bulk-delete-cancel-btn')?.addEventListener('click', hideBulkDeleteModal);
  document.getElementById('bulk-delete-word-input')?.addEventListener('input', checkBulkDeleteWord);
  document.getElementById('bulk-delete-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('bulk-delete-modal')) hideBulkDeleteModal();
  });
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
  if (error) loginError.textContent = error.message;
}

document.getElementById('logout-btn')?.addEventListener('click', async () => {
  await supabase.auth.signOut();
});

// ─── Artwork list ─────────────────────────────────────────────────────────────
async function loadArtworks() {
  const list = document.getElementById('artworks-list');
  list.innerHTML = '<p class="loading-text">Loading…</p>';

  selectedIds.clear();
  currentlyEditingCard = null;
  updateBulkToolbar();

  const { data: artworks, error } = await supabase
    .from('artworks')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    list.innerHTML = `<p class="error-text">Error loading artworks: ${error.message}</p>`;
    return;
  }

  if (!artworks || artworks.length === 0) {
    list.innerHTML = '<p class="empty-text">No artworks yet. Upload your first piece above.</p>';
    return;
  }

  list.innerHTML = '';
  artworks.forEach((art) => list.appendChild(buildArtworkCard(art)));
}

function getPublicUrl(path) {
  if (!path) return '';
  const { data } = supabase.storage.from('artworks').getPublicUrl(path);
  return data?.publicUrl ?? '';
}

// ─── Card building ────────────────────────────────────────────────────────────
function buildArtworkCard(art) {
  const thumbUrl = getPublicUrl(art.thumb_path);
  const card = document.createElement('div');
  card.className = `artwork-card artwork-card--${art.status}`;
  card.dataset.id = art.id;

  card.innerHTML = `
    <div class="artwork-card-img-wrap">
      ${thumbUrl
        ? `<img class="artwork-card-img" src="${escapeAttr(thumbUrl)}" alt="${escapeAttr(art.title)}" loading="lazy">`
        : `<div class="artwork-card-img-placeholder">No image</div>`}
      <div class="artwork-card-img-overlay">
        <span class="img-overlay-hint">Drop or click to replace</span>
      </div>
      <input type="file" class="img-replace-input" accept="image/jpeg,image/png,image/webp" tabindex="-1" aria-hidden="true">
      <span class="status-badge status-badge--${escapeAttr(art.status)} card-status-badge">${escapeHtml(art.status)}</span>
      <label class="bulk-check-label" title="Select">
        <input type="checkbox" class="bulk-check">
      </label>
    </div>

    <div class="artwork-card-body">
      <div class="card-field-title">
        <input type="text" class="card-input card-input--title" data-field="title"
          value="${escapeAttr(art.title)}" placeholder="Title *" aria-label="Title">
      </div>

      <div class="card-meta-row">
        <input type="text" class="card-input card-input--meta" data-field="medium"
          value="${escapeAttr(art.medium ?? '')}" placeholder="Medium" aria-label="Medium">
        <input type="number" class="card-input card-input--meta card-input--year" data-field="year"
          value="${escapeAttr(String(art.year ?? ''))}" placeholder="Year" min="1800" max="2100" aria-label="Year">
      </div>

      <div class="card-extended">
        <textarea class="card-input card-input--textarea" data-field="description"
          placeholder="Description" aria-label="Description" rows="3">${escapeHtml(art.description ?? '')}</textarea>

        <div class="card-row">
          <input type="text" class="card-input" data-field="material"
            value="${escapeAttr(art.material ?? '')}" placeholder="Material" aria-label="Material">
          <input type="text" class="card-input" data-field="dimensions"
            value="${escapeAttr(art.dimensions ?? '')}" placeholder="Dimensions" aria-label="Dimensions">
        </div>

        <div class="card-row">
          <input type="number" class="card-input" data-field="price"
            value="${escapeAttr(String(art.price ?? ''))}" placeholder="Price (USD)" min="0" step="0.01" aria-label="Price">
          <select class="card-input card-input--select" data-field="status" aria-label="Status">
            <option value="draft"${art.status === 'draft' ? ' selected' : ''}>Draft</option>
            <option value="published"${art.status === 'published' ? ' selected' : ''}>Published</option>
            <option value="archived"${art.status === 'archived' ? ' selected' : ''}>Archived</option>
          </select>
        </div>

        <div class="card-check-row">
          <input type="checkbox" class="card-checkbox" data-field="available"
            id="avail-${escapeAttr(art.id)}"${art.available ? ' checked' : ''}>
          <label for="avail-${escapeAttr(art.id)}" class="card-check-label-text">Available for sale</label>
        </div>

        <p class="card-section-label">Prints</p>
        <div class="card-row card-row--3">
          <select class="card-input card-input--select" data-field="prints_type" aria-label="Prints type">
            <option value="none"${(art.prints_type ?? 'none') === 'none' ? ' selected' : ''}>No prints</option>
            <option value="open"${art.prints_type === 'open' ? ' selected' : ''}>Open edition</option>
            <option value="limited"${art.prints_type === 'limited' ? ' selected' : ''}>Limited edition</option>
          </select>
          <input type="number" class="card-input" data-field="print_qty"
            value="${escapeAttr(String(art.print_qty ?? ''))}" placeholder="Edition qty" min="1" aria-label="Edition quantity">
          <input type="number" class="card-input" data-field="print_price"
            value="${escapeAttr(String(art.print_price ?? ''))}" placeholder="Print price" min="0" step="0.01" aria-label="Print price">
        </div>
        <input type="text" class="card-input" data-field="print_size"
          value="${escapeAttr(art.print_size ?? '')}" placeholder="Print size" aria-label="Print size">

        <input type="text" class="card-input" data-field="seo_keywords"
          value="${escapeAttr((art.seo_keywords ?? []).join(', '))}"
          placeholder="SEO keywords (comma-separated)" aria-label="SEO keywords">

        <div class="card-delete-row">
          <button type="button" class="btn btn-sm btn-delete card-delete-btn">Delete artwork</button>
        </div>
      </div>

      <div class="card-save-bar">
        <button type="button" class="btn btn-sm card-cancel-btn">Cancel</button>
        <button type="button" class="btn btn-sm btn-primary card-save-btn">Save changes</button>
      </div>
    </div>
  `;

  card._artData = { ...art };
  card._dirty = false;
  card._pendingImageFile = null;

  wireCardEvents(card);
  return card;
}

function wireCardEvents(card) {
  const imgWrap = card.querySelector('.artwork-card-img-wrap');
  const imgInput = card.querySelector('.img-replace-input');
  const bulkCheckLabel = card.querySelector('.bulk-check-label');
  const bulkCheck = card.querySelector('.bulk-check');
  const saveBtn = card.querySelector('.card-save-btn');
  const cancelBtn = card.querySelector('.card-cancel-btn');
  const deleteBtn = card.querySelector('.card-delete-btn');

  // Enter edit mode on focus; mark dirty on change
  card.querySelectorAll('.card-input, .card-checkbox').forEach((el) => {
    el.addEventListener('focus', () => enterEditMode(card));
    el.addEventListener('input', () => markDirty(card));
    el.addEventListener('change', () => markDirty(card));
  });

  // Image area: click enters edit mode + opens file picker
  imgWrap.addEventListener('click', (e) => {
    if (e.target.closest('.bulk-check-label')) return;
    enterEditMode(card);
    imgInput.click();
  });
  imgInput.addEventListener('change', () => {
    if (imgInput.files[0]) applyPendingImage(card, imgInput.files[0]);
  });

  // Drag-and-drop image replacement
  imgWrap.addEventListener('dragover', (e) => {
    e.preventDefault();
    imgWrap.classList.add('drag-over');
  });
  imgWrap.addEventListener('dragleave', () => imgWrap.classList.remove('drag-over'));
  imgWrap.addEventListener('drop', (e) => {
    e.preventDefault();
    imgWrap.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) applyPendingImage(card, file);
  });

  // Save / cancel / delete
  saveBtn.addEventListener('click', (e) => { e.stopPropagation(); saveCard(card); });
  cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); cancelCard(card); });
  deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteCard(card); });

  // Bulk checkbox — stop propagation so clicking it doesn't trigger the document cancel-edit listener
  bulkCheckLabel.addEventListener('click', (e) => e.stopPropagation());
  bulkCheck.addEventListener('change', () => {
    if (bulkCheck.checked) {
      selectedIds.add(card.dataset.id);
    } else {
      selectedIds.delete(card.dataset.id);
    }
    updateBulkToolbar();
  });
}

// ─── Card edit state ──────────────────────────────────────────────────────────
function enterEditMode(card) {
  if (currentlyEditingCard === card) return;
  if (currentlyEditingCard) cancelCard(currentlyEditingCard);
  currentlyEditingCard = card;
  card.classList.add('artwork-card--editing');
}

function exitEditMode(card) {
  card.classList.remove('artwork-card--editing', 'artwork-card--dirty');
  card._dirty = false;
  card._pendingImageFile = null;
  card.querySelector('.card-save-bar').classList.remove('card-save-bar--visible');
  if (currentlyEditingCard === card) currentlyEditingCard = null;
}

function markDirty(card) {
  if (!card.classList.contains('artwork-card--editing') || card._dirty) return;
  card._dirty = true;
  card.classList.add('artwork-card--dirty');
  card.querySelector('.card-save-bar').classList.add('card-save-bar--visible');
}

// ─── Card values ──────────────────────────────────────────────────────────────
function getCardFieldValue(card, field) {
  const el = card.querySelector(`[data-field="${field}"]`);
  if (!el) return null;
  return el.type === 'checkbox' ? el.checked : el.value;
}

function setCardFieldValue(card, field, value) {
  const el = card.querySelector(`[data-field="${field}"]`);
  if (!el) return;
  if (el.type === 'checkbox') { el.checked = !!value; return; }
  el.value = value ?? '';
}

function getCardValues(card) {
  const g = (f) => getCardFieldValue(card, f);
  return {
    title: (g('title') ?? '').trim(),
    description: (g('description') ?? '').trim() || null,
    medium: (g('medium') ?? '').trim() || null,
    material: (g('material') ?? '').trim() || null,
    dimensions: (g('dimensions') ?? '').trim() || null,
    year: g('year') ? parseInt(g('year'), 10) : null,
    price: g('price') ? parseFloat(g('price')) : null,
    available: g('available'),
    prints_type: g('prints_type') || 'none',
    print_qty: g('print_qty') ? parseInt(g('print_qty'), 10) : null,
    print_size: (g('print_size') ?? '').trim() || null,
    print_price: g('print_price') ? parseFloat(g('print_price')) : null,
    seo_keywords: (g('seo_keywords') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    status: g('status') || 'draft',
  };
}

function restoreCardValues(card) {
  const art = card._artData;
  const s = (f, v) => setCardFieldValue(card, f, v);
  s('title', art.title);
  s('description', art.description ?? '');
  s('medium', art.medium ?? '');
  s('material', art.material ?? '');
  s('dimensions', art.dimensions ?? '');
  s('year', art.year ?? '');
  s('price', art.price ?? '');
  s('available', art.available);
  s('prints_type', art.prints_type ?? 'none');
  s('print_qty', art.print_qty ?? '');
  s('print_size', art.print_size ?? '');
  s('print_price', art.print_price ?? '');
  s('seo_keywords', (art.seo_keywords ?? []).join(', '));
  s('status', art.status);

  // Restore image if a replacement was staged but not saved
  if (card._pendingImageFile) {
    const img = card.querySelector('.artwork-card-img');
    const thumbUrl = getPublicUrl(art.thumb_path);
    if (img && thumbUrl) img.src = thumbUrl;
  }
}

function cancelCard(card) {
  if (card._dirty) restoreCardValues(card);
  exitEditMode(card);
}

async function saveCard(card) {
  const id = card._artData.id;
  const values = getCardValues(card);

  if (!values.title) {
    alert('Title is required.');
    card.querySelector('[data-field="title"]')?.focus();
    return;
  }

  const saveBtn = card.querySelector('.card-save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    if (card._pendingImageFile) {
      const art = card._artData;
      const [imageResult, thumbResult] = await Promise.all([
        processImage(card._pendingImageFile),
        generateThumbnail(card._pendingImageFile),
      ]);

      const uid = currentUser.id;
      const uuid = crypto.randomUUID();
      const imagePath = `${uid}/${uuid}/image.${imageResult.ext}`;
      const thumbPath = `${uid}/${uuid}/thumb.${thumbResult.ext}`;

      const [imgUpload, thumbUpload] = await Promise.all([
        supabase.storage.from('artworks').upload(imagePath, imageResult.blob, {
          contentType: imageResult.mimeType, cacheControl: '31536000', upsert: false,
        }),
        supabase.storage.from('artworks').upload(thumbPath, thumbResult.blob, {
          contentType: thumbResult.mimeType, cacheControl: '31536000', upsert: false,
        }),
      ]);
      if (imgUpload.error) throw imgUpload.error;
      if (thumbUpload.error) throw thumbUpload.error;

      const oldPaths = [art.image_path, art.thumb_path].filter(Boolean);
      if (oldPaths.length) await supabase.storage.from('artworks').remove(oldPaths);

      values.image_path = imagePath;
      values.thumb_path = thumbPath;
    }

    const { error } = await supabase.from('artworks').update(values).eq('id', id);
    if (error) throw error;

    Object.assign(card._artData, values);

    // Update status badge
    const badge = card.querySelector('.card-status-badge');
    if (badge) {
      badge.textContent = values.status;
      badge.className = `status-badge status-badge--${values.status} card-status-badge`;
    }

    // Reapply status class (preserve editing/dirty classes during transition)
    const extra = [
      card.classList.contains('artwork-card--editing') ? 'artwork-card--editing' : '',
      card.classList.contains('artwork-card--dirty') ? 'artwork-card--dirty' : '',
    ].filter(Boolean).join(' ');
    card.className = `artwork-card artwork-card--${values.status}${extra ? ' ' + extra : ''}`;

    exitEditMode(card);

    card.classList.add('artwork-card--saved');
    setTimeout(() => card.classList.remove('artwork-card--saved'), 800);
  } catch (err) {
    alert(`Failed to save: ${err.message}`);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save changes';
  }
}

async function deleteCard(card) {
  if (!confirm('Delete this artwork? This cannot be undone.')) return;

  const art = card._artData;
  const toDelete = [art.image_path, art.thumb_path].filter(Boolean);
  if (toDelete.length) await supabase.storage.from('artworks').remove(toDelete);

  const { error } = await supabase.from('artworks').delete().eq('id', art.id);
  if (error) { alert(`Failed to delete: ${error.message}`); return; }

  if (currentlyEditingCard === card) currentlyEditingCard = null;
  selectedIds.delete(art.id);
  updateBulkToolbar();

  card.classList.add('artwork-card--removing');
  setTimeout(() => card.remove(), 300);
}

// ─── Image replacement ────────────────────────────────────────────────────────
function applyPendingImage(card, file) {
  card._pendingImageFile = file;

  const wrap = card.querySelector('.artwork-card-img-wrap');
  const previewUrl = URL.createObjectURL(file);
  let img = wrap.querySelector('.artwork-card-img');

  if (img) {
    img.src = previewUrl;
  } else {
    const placeholder = wrap.querySelector('.artwork-card-img-placeholder');
    img = document.createElement('img');
    img.className = 'artwork-card-img';
    img.alt = card._artData.title;
    img.src = previewUrl;
    if (placeholder) {
      placeholder.replaceWith(img);
    } else {
      wrap.prepend(img);
    }
  }

  enterEditMode(card);
  markDirty(card);
}

// ─── Bulk select ──────────────────────────────────────────────────────────────
function updateBulkToolbar() {
  const toolbar = document.getElementById('bulk-toolbar');
  if (!toolbar) return;
  const count = selectedIds.size;
  toolbar.hidden = count === 0;
  if (count > 0) {
    const label = toolbar.querySelector('.bulk-count');
    if (label) label.textContent = `${count} selected`;
  }
}

async function handleBulkStatusChange(status) {
  if (!selectedIds.size) return;
  const ids = [...selectedIds];
  const { error } = await supabase.from('artworks').update({ status }).in('id', ids);
  if (error) { alert(`Failed to update status: ${error.message}`); return; }
  selectedIds.clear();
  updateBulkToolbar();
  loadArtworks();
}

// ─── Bulk delete ──────────────────────────────────────────────────────────────
let _bulkDeleteWord = '';

function randomWord() {
  const consonants = 'bcdfghjklmnprstvwz';
  const vowels = 'aeiou';
  const len = 6 + Math.floor(Math.random() * 3);
  let w = '';
  for (let i = 0; i < len; i++) {
    w += i % 2 === 0
      ? consonants[Math.floor(Math.random() * consonants.length)]
      : vowels[Math.floor(Math.random() * vowels.length)];
  }
  return w.toUpperCase();
}

function handleBulkDelete() {
  if (!selectedIds.size) return;
  _bulkDeleteWord = randomWord();
  const modal = document.getElementById('bulk-delete-modal');
  modal.querySelector('.bulk-delete-word').textContent = _bulkDeleteWord;
  modal.querySelector('.bulk-delete-count').textContent = selectedIds.size;
  document.getElementById('bulk-delete-word-input').value = '';
  document.getElementById('bulk-delete-confirm-btn').disabled = true;
  modal.hidden = false;
  document.getElementById('bulk-delete-word-input').focus();
}

function checkBulkDeleteWord() {
  const val = document.getElementById('bulk-delete-word-input').value.toUpperCase();
  document.getElementById('bulk-delete-confirm-btn').disabled = val !== _bulkDeleteWord;
}

function hideBulkDeleteModal() {
  document.getElementById('bulk-delete-modal').hidden = true;
  _bulkDeleteWord = '';
}

async function confirmBulkDelete() {
  hideBulkDeleteModal();
  const ids = [...selectedIds];

  const { data: artworks } = await supabase
    .from('artworks')
    .select('image_path, thumb_path')
    .in('id', ids);

  if (artworks?.length) {
    const paths = artworks.flatMap((a) => [a.image_path, a.thumb_path].filter(Boolean));
    if (paths.length) await supabase.storage.from('artworks').remove(paths);
  }

  const { error } = await supabase.from('artworks').delete().in('id', ids);
  if (error) { alert(`Failed to delete: ${error.message}`); return; }

  selectedIds.clear();
  currentlyEditingCard = null;
  updateBulkToolbar();
  loadArtworks();
}

// ─── Upload ───────────────────────────────────────────────────────────────────
let pendingFiles = [];

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
  if (!currentUser) { alert('You must be logged in to upload.'); return; }

  const defaultMeta = {
    title: document.getElementById('upload-title').value.trim(),
    description: document.getElementById('upload-description').value.trim(),
    medium: document.getElementById('upload-medium').value.trim(),
    material: document.getElementById('upload-material').value.trim(),
    dimensions: document.getElementById('upload-dimensions').value.trim(),
    year: document.getElementById('upload-year').value
      ? parseInt(document.getElementById('upload-year').value, 10) : null,
    price: document.getElementById('upload-price').value
      ? parseFloat(document.getElementById('upload-price').value) : null,
    available: document.getElementById('upload-available').checked,
    prints_type: document.getElementById('upload-prints-type').value,
    print_qty: document.getElementById('upload-print-qty').value
      ? parseInt(document.getElementById('upload-print-qty').value, 10) : null,
    print_size: document.getElementById('upload-print-size').value.trim(),
    print_price: document.getElementById('upload-print-price').value
      ? parseFloat(document.getElementById('upload-print-price').value) : null,
    seo_keywords: document.getElementById('upload-seo-keywords').value
      .split(',').map((s) => s.trim()).filter(Boolean),
    status: document.getElementById('upload-status').value,
  };

  if (!pendingFiles.length) { alert('Please select at least one image.'); return; }

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

  document.getElementById('upload-form').reset();
  document.getElementById('upload-preview').innerHTML = '';
  pendingFiles = [];

  setTimeout(() => { progressWrap.hidden = true; progressBar.style.width = '0%'; }, 3000);
  loadArtworks();
}

async function uploadArtwork(file, meta) {
  const [imageResult, thumbResult] = await Promise.all([
    processImage(file),
    generateThumbnail(file),
  ]);

  const uid = currentUser.id;
  const uuid = crypto.randomUUID();
  const imagePath = `${uid}/${uuid}/image.${imageResult.ext}`;
  const thumbPath = `${uid}/${uuid}/thumb.${thumbResult.ext}`;

  const [imgUpload, thumbUpload] = await Promise.all([
    supabase.storage.from('artworks').upload(imagePath, imageResult.blob, {
      contentType: imageResult.mimeType, cacheControl: '31536000', upsert: false,
    }),
    supabase.storage.from('artworks').upload(thumbPath, thumbResult.blob, {
      contentType: thumbResult.mimeType, cacheControl: '31536000', upsert: false,
    }),
  ]);
  if (imgUpload.error) throw imgUpload.error;
  if (thumbUpload.error) throw thumbUpload.error;

  const { error } = await supabase.from('artworks').insert({
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
  });
  if (error) throw error;
}

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
