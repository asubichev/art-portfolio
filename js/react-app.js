import React, { useEffect, useMemo, useRef, useState } from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';
import htm from 'https://esm.sh/htm@3.1.1';

const html = htm.bind(React.createElement);
const SUPABASE_URL = 'https://mmiluhqhiyxqmceexcpw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1taWx1aHFoaXl4cW1jZWV4Y3B3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MDQ3MjYsImV4cCI6MjA5ODA4MDcyNn0.peueizWg91WWpiKt6GhxLwkQoreXRULeex_jI8ILqQY';

function getSupabaseClient() {
  const existing = window.supabaseClient;
  if (existing?.from && existing?.auth) return existing;

  const supabaseLib = window.supabase;
  if (!supabaseLib?.createClient) return null;

  window.supabaseClient = supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  return window.supabaseClient;
}

function getPublicUrl(path) {
  const sb = getSupabaseClient();
  if (!sb?.storage || !path) return '';
  const { data } = sb.storage.from('artworks').getPublicUrl(path);
  return data?.publicUrl ?? '';
}

function useEscapeToClose(onClose) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
}

function getHashRoute() {
  const hash = window.location.hash || '#/gallery';
  const route = hash.replace(/^#/, '');
  return route || '/gallery';
}

function useHashRoute() {
  const [route, setRoute] = useState(getHashRoute());

  useEffect(() => {
    const onHashChange = () => setRoute(getHashRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}

function App() {
  const route = useHashRoute();
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (!window.location.hash) {
      window.location.replace('#/gallery');
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const sb = getSupabaseClient();
      if (!sb?.auth) {
        setAuthReady(true);
        return;
      }

      const { data } = await sb.auth.getSession();
      if (!mounted) return;
      const sess = data?.session ?? null;
      setSession(sess);
      if (sess?.user) {
        setIsAdmin(await loadIsAdmin(sess.user.id));
      }
      setAuthReady(true);
    }

    bootstrap();

    const sb = getSupabaseClient();
    if (!sb?.auth) {
      return () => {
        mounted = false;
      };
    }

    const { data: sub } = sb.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        setIsAdmin(await loadIsAdmin(nextSession.user.id));
      } else {
        setIsAdmin(false);
      }
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    const sb = getSupabaseClient();
    if (!sb?.auth) return;
    await sb.auth.signOut();
  }

  return html`
    <div className="app-shell">
      <header className="site-header react-header">
        <div className="site-logo">Portfolio</div>
        <nav className="site-nav" aria-label="Site navigation">
          <a href="#/gallery">Gallery</a>
          ${session
            ? html`<button className="nav-btn" onClick=${handleLogout}>Logout</button>`
            : html`<button className="nav-btn" onClick=${() => setShowLogin(true)}>Login</button>`}
          <a href="mailto:asubichev@gmail.com">Contact</a>
        </nav>
      </header>

      <main>
        ${authReady
          ? (route === '/gallery'
              ? html`<${GalleryPage} isAdmin=${isAdmin} user=${session?.user ?? null} />`
              : html`<p className="page-loading">Redirecting…</p>`)
          : html`<p className="page-loading loading-pulse">Loading…</p>`}
      </main>

      <footer className="site-footer">
        <p>&copy; ${new Date().getFullYear()} Art Portfolio. All rights reserved.</p>
      </footer>

      ${showLogin
        ? html`
            <${LoginModal}
              onClose=${() => setShowLogin(false)}
              onSuccess=${() => setShowLogin(false)}
            />
          `
        : null}
    </div>
  `;
}

async function loadIsAdmin(userId) {
  const sb = getSupabaseClient();
  if (!sb) return false;

  const { data, error } = await sb
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return false;
  return data?.role === 'admin';
}

function LoginModal({ onClose, onSuccess }) {
  useEscapeToClose(onClose);

  const formRef = useRef(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function submitOnEnter(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    const sb = getSupabaseClient();
    if (!sb?.auth) {
      setBusy(false);
      setError('Supabase client not initialized');
      return;
    }

    const { error: signInError } = await sb.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setBusy(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    onSuccess();
  }

  return html`
    <div className="modal-backdrop" onClick=${onClose}>
      <div className="modal-card" onClick=${(e) => e.stopPropagation()}>
        <h3>Login</h3>
        <form ref=${formRef} onSubmit=${handleSubmit} className="auth-form">
          <label>
            Email
            <input
              type="email"
              required
              autoFocus
              value=${email}
              onKeyDown=${submitOnEnter}
              onChange=${(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              value=${password}
              onKeyDown=${submitOnEnter}
              onChange=${(e) => setPassword(e.target.value)}
            />
          </label>
          ${error ? html`<p className="error-text error-pop">${error}</p>` : null}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick=${onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary ${busy ? 'btn-loading' : ''}" disabled=${busy}>
              ${busy
                ? html`<span className="btn-loading-inner"><span className="inline-spinner" aria-hidden="true"></span>Signing in…</span>`
                : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function GalleryPage({ isAdmin, user }) {
  const [artworks, setArtworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  async function loadArtworks() {
    setLoading(true);
    setError('');

    try {
      const sb = getSupabaseClient();
      if (!sb) {
        throw new Error('Supabase client not initialized');
      }

      let query = sb
        .from('artworks')
        .select('id,title,description,medium,material,dimensions,year,price,status,available,prints_type,print_qty,print_size,print_price,image_path,thumb_path,created_at')
        .order('created_at', { ascending: false });

      if (!isAdmin) {
        query = query.eq('status', 'published');
      }

      const { data, error: loadError } = await query;

      if (loadError) {
        throw loadError;
      }

      setArtworks(data ?? []);
    } catch (err) {
      setError(err?.message || 'Unexpected error while loading artworks');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadArtworks();
  }, [isAdmin]);

  return html`
    <section className="gallery-section" aria-label="Gallery">
      <div className="gallery-heading-row">
        <h2>Works</h2>
        ${isAdmin
          ? html`<button className="btn btn-primary" onClick=${() => setShowCreate(true)}>Add work</button>`
          : null}
      </div>

      ${loading ? html`<p className="page-loading">Loading…</p>` : null}
      ${error ? html`<p className="error-text">Failed to load gallery: ${error}</p>` : null}
      ${!loading && !error && artworks.length === 0
        ? html`
            <div className="gallery-empty-state" role="status" aria-live="polite">
              <p className="gallery-empty-title">No works yet.</p>
              <p className="gallery-empty-body">
                ${isAdmin
                  ? 'Use “Add work” to create your first artwork, then set status to published to show it publicly.'
                  : 'Please check back soon.'}
              </p>
            </div>
          `
        : null}

      <div className="react-gallery-grid">
        ${artworks.map(
          (art) => {
            const thumbUrl = getPublicUrl(art.thumb_path || art.image_path);
            return html`
            <button
              key=${art.id}
              className="art-card"
              onClick=${() => setActive(art)}
            >
              <div className="art-card-visual">
                ${thumbUrl
                  ? html`<img src=${thumbUrl} alt=${art.title || 'Artwork'} loading="lazy" />`
                  : 'No photo yet'}
              </div>
              <div className="art-card-meta">
                <h3>${art.title}</h3>
                <p>${[art.medium, art.year].filter(Boolean).join(' · ') || 'Untitled metadata'}</p>
                ${isAdmin ? html`<span className="status-pill">${art.status}</span>` : null}
              </div>
            </button>
          `;
          },
        )}
      </div>

      ${active
        ? html`
            <${ArtworkModal}
              artwork=${active}
              isAdmin=${isAdmin}
              user=${user}
              onClose=${() => setActive(null)}
              onSaved=${async (updatedArtwork) => {
                if (updatedArtwork?.id === active?.id) {
                  setActive(updatedArtwork);
                }
                await loadArtworks();
              }}
            />
          `
        : null}

      ${showCreate && isAdmin
        ? html`
            <${CreateArtworkModal}
              user=${user}
              onClose=${() => setShowCreate(false)}
              onCreated=${async () => {
                setShowCreate(false);
                await loadArtworks();
              }}
            />
          `
        : null}
    </section>
  `;
}

function ArtworkModal({ artwork, isAdmin, user, onClose, onSaved }) {
  useEscapeToClose(onClose);

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [replaceFile, setReplaceFile] = useState(null);
  const [replacePreviewUrl, setReplacePreviewUrl] = useState('');
  const replaceInputRef = useRef(null);
  const [form, setForm] = useState(() => ({
    title: artwork.title ?? '',
    description: artwork.description ?? '',
    medium: artwork.medium ?? '',
    material: artwork.material ?? '',
    dimensions: artwork.dimensions ?? '',
    year: artwork.year ?? '',
    price: artwork.price ?? '',
    status: artwork.status ?? 'draft',
  }));

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleReplaceFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (replacePreviewUrl) URL.revokeObjectURL(replacePreviewUrl);
    setReplaceFile(file);
    setReplacePreviewUrl(URL.createObjectURL(file));
  }

  async function save() {
    setBusy(true);
    setError('');
    setUploadStatus('');

    const sb = getSupabaseClient();
    if (!sb) {
      setBusy(false);
      setError('Supabase client not initialized');
      return;
    }

    try {
      let imagePaths = {};
      if (replaceFile) {
        setUploadStatus('Processing…');
        const [full, thumb] = await Promise.all([
          window.processImage(replaceFile),
          window.generateThumbnail(replaceFile),
        ]);
        const pathId = crypto.randomUUID();
        const userId = user?.id ?? artwork.created_by ?? 'unknown';
        const imageStoragePath = `${userId}/${pathId}/image.${full.ext}`;
        const thumbStoragePath = `${userId}/${pathId}/thumb.${thumb.ext}`;

        setUploadStatus('Uploading…');
        const [imageUpload, thumbUpload] = await Promise.all([
          sb.storage.from('artworks').upload(imageStoragePath, full.blob, {
            contentType: full.mimeType,
            cacheControl: '31536000',
          }),
          sb.storage.from('artworks').upload(thumbStoragePath, thumb.blob, {
            contentType: thumb.mimeType,
            cacheControl: '31536000',
          }),
        ]);
        if (imageUpload.error) throw imageUpload.error;
        if (thumbUpload.error) throw thumbUpload.error;
        imagePaths = { image_path: imageStoragePath, thumb_path: thumbStoragePath };
      }

      setUploadStatus('Saving…');
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        medium: form.medium.trim() || null,
        material: form.material.trim() || null,
        dimensions: form.dimensions.trim() || null,
        year: form.year ? Number(form.year) : null,
        price: form.price ? Number(form.price) : null,
        status: form.status,
        ...imagePaths,
      };

      const { data: updatedArtwork, error: updateError } = await sb
        .from('artworks')
        .update(payload)
        .eq('id', artwork.id)
        .select('*')
        .single();

      if (updateError) throw updateError;

      setEditing(false);
      await onSaved(updatedArtwork ?? { ...artwork, ...payload });
    } catch (err) {
      setError(err?.message || 'Save failed');
    } finally {
      setBusy(false);
      setUploadStatus('');
    }
  }

  const detailRows = useMemo(
    () => [
      ['Medium', artwork.medium],
      ['Material', artwork.material],
      ['Dimensions', artwork.dimensions],
      ['Year', artwork.year],
      ['Price', artwork.price ? `$${Number(artwork.price).toLocaleString('en-US')}` : null],
      ['Status', artwork.status],
      ['Available', artwork.available ? 'Yes' : 'No'],
      ['Prints', artwork.prints_type],
      ['Print qty', artwork.print_qty],
      ['Print size', artwork.print_size],
      ['Print price', artwork.print_price],
    ].filter(([, value]) => value !== null && value !== undefined && value !== ''),
    [artwork],
  );

  const popupImageUrl = getPublicUrl(artwork.thumb_path || artwork.image_path);

  return html`
    <div className="modal-backdrop" onClick=${onClose}>
      <div className="modal-card modal-card-lg" onClick=${(e) => e.stopPropagation()}>
        <div className="modal-header-row">
          <h3>${artwork.title}</h3>
          <button className="icon-btn" onClick=${onClose} aria-label="Close">×</button>
        </div>

        ${editing
          ? html`
              <div className="modal-content-grid">
                <div className="upload-replace-row">
                  ${(replacePreviewUrl || getPublicUrl(artwork.thumb_path || artwork.image_path))
                    ? html`<img
                        src=${replacePreviewUrl || getPublicUrl(artwork.thumb_path || artwork.image_path)}
                        alt="Photo"
                        className="upload-replace-thumb"
                      />`
                    : null}
                  <div className="upload-replace-actions">
                    <button type="button" className="btn btn-secondary" onClick=${() => replaceInputRef.current?.click()}>
                      ${artwork.image_path || replaceFile ? 'Replace photo' : 'Add photo'}
                    </button>
                    ${replaceFile ? html`<span className="upload-replace-note">New photo staged — will upload on save</span>` : null}
                  </div>
                  <input ref=${replaceInputRef} type="file" accept="image/*" style="display:none" onChange=${handleReplaceFile} />
                </div>
                <label>Title<input value=${form.title} onChange=${(e) => setField('title', e.target.value)} /></label>
                <label>Description<textarea rows="4" value=${form.description} onChange=${(e) => setField('description', e.target.value)} /></label>
                <label>Medium<input value=${form.medium} onChange=${(e) => setField('medium', e.target.value)} /></label>
                <label>Material<input value=${form.material} onChange=${(e) => setField('material', e.target.value)} /></label>
                <label>Dimensions<input value=${form.dimensions} onChange=${(e) => setField('dimensions', e.target.value)} /></label>
                <label>Year<input type="number" value=${form.year} onChange=${(e) => setField('year', e.target.value)} /></label>
                <label>Price<input type="number" step="0.01" value=${form.price} onChange=${(e) => setField('price', e.target.value)} /></label>
                <label>
                  Status
                  <select value=${form.status} onChange=${(e) => setField('status', e.target.value)}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
              </div>
              ${error ? html`<p className="error-text">${error}</p>` : null}
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick=${() => setEditing(false)}>Cancel</button>
                <button className="btn btn-primary${busy ? ' btn-loading' : ''}" disabled=${busy} onClick=${save}>
                  ${busy
                    ? html`<span className="btn-loading-inner"><span className="inline-spinner" aria-hidden="true"></span>${uploadStatus || 'Saving…'}</span>`
                    : 'Save'}
                </button>
              </div>
            `
          : html`
              <div className="artwork-details">
                ${popupImageUrl
                  ? html`
                      <div className="artwork-modal-image-wrap">
                        <img src=${popupImageUrl} alt=${artwork.title || 'Artwork'} className="artwork-modal-image" />
                      </div>
                    `
                  : null}
                <p className="artwork-description-focus">${artwork.description || 'No description provided.'}</p>
                <dl>
                  ${detailRows.map(
                    ([label, value]) => html`<${React.Fragment}><dt>${label}</dt><dd>${String(value)}</dd><//>`,
                  )}
                </dl>
              </div>
              <div className="modal-actions">
                ${isAdmin
                  ? html`<button className="btn btn-primary" onClick=${() => setEditing(true)}>Edit</button>`
                  : null}
                <button className="btn btn-secondary" onClick=${onClose}>Close</button>
              </div>
            `}
      </div>
    </div>
  `;
}

function CreateArtworkModal({ user, onClose, onCreated }) {
  useEscapeToClose(onClose);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    medium: '',
    material: '',
    dimensions: '',
    year: '',
    price: '',
    status: 'draft',
    available: true,
  });

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function pickFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function handleFileChange(e) {
    pickFile(e.target.files?.[0]);
  }

  function handleDragOver(e) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    pickFile(e.dataTransfer.files?.[0]);
  }

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setUploadStatus('');

    const sb = getSupabaseClient();
    if (!sb) {
      setBusy(false);
      setError('Supabase client not initialized');
      return;
    }

    try {
      let image_path = null;
      let thumb_path = null;

      if (imageFile) {
        setUploadStatus('Processing…');
        const [full, thumb] = await Promise.all([
          window.processImage(imageFile),
          window.generateThumbnail(imageFile),
        ]);
        const pathId = crypto.randomUUID();
        const imageStoragePath = `${user.id}/${pathId}/image.${full.ext}`;
        const thumbStoragePath = `${user.id}/${pathId}/thumb.${thumb.ext}`;

        setUploadStatus('Uploading…');
        const [imageUpload, thumbUpload] = await Promise.all([
          sb.storage.from('artworks').upload(imageStoragePath, full.blob, {
            contentType: full.mimeType,
            cacheControl: '31536000',
          }),
          sb.storage.from('artworks').upload(thumbStoragePath, thumb.blob, {
            contentType: thumb.mimeType,
            cacheControl: '31536000',
          }),
        ]);
        if (imageUpload.error) throw imageUpload.error;
        if (thumbUpload.error) throw thumbUpload.error;

        image_path = imageStoragePath;
        thumb_path = thumbStoragePath;
      }

      setUploadStatus('Saving…');
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        medium: form.medium.trim() || null,
        material: form.material.trim() || null,
        dimensions: form.dimensions.trim() || null,
        year: form.year ? Number(form.year) : null,
        price: form.price ? Number(form.price) : null,
        status: form.status,
        available: !!form.available,
        created_by: user.id,
        ...(image_path && { image_path }),
        ...(thumb_path && { thumb_path }),
      };

      const { error: insertError } = await sb.from('artworks').insert(payload);
      if (insertError) throw insertError;

      await onCreated();
    } catch (err) {
      setError(err?.message || 'Failed to create artwork');
    } finally {
      setBusy(false);
      setUploadStatus('');
    }
  }

  return html`
    <div className="modal-backdrop" onClick=${onClose}>
      <div className="modal-card modal-card-lg" onClick=${(e) => e.stopPropagation()}>
        <h3>Add new work</h3>
        <form className="modal-content-grid" onSubmit=${create}>
          <div
            className="upload-zone${isDragging ? ' upload-zone-over' : ''}"
            onClick=${() => fileInputRef.current?.click()}
            onDragOver=${handleDragOver}
            onDragLeave=${handleDragLeave}
            onDrop=${handleDrop}
          >
            ${previewUrl
              ? html`
                  <img src=${previewUrl} alt="Preview" className="upload-preview-img" />
                  <span className="upload-zone-change-label">Click or drag to replace</span>
                `
              : html`
                  <div className="upload-zone-prompt">
                    <span className="upload-zone-icon" aria-hidden="true">↑</span>
                    <span>Click or drag photo here</span>
                  </div>
                `}
          </div>
          <input
            ref=${fileInputRef}
            type="file"
            accept="image/*"
            style="display:none"
            onChange=${handleFileChange}
          />

          <label>Title *<input required value=${form.title} onChange=${(e) => setField('title', e.target.value)} /></label>
          <label>Description<textarea rows="4" value=${form.description} onChange=${(e) => setField('description', e.target.value)} /></label>
          <label>Medium<input value=${form.medium} onChange=${(e) => setField('medium', e.target.value)} /></label>
          <label>Material<input value=${form.material} onChange=${(e) => setField('material', e.target.value)} /></label>
          <label>Dimensions<input value=${form.dimensions} onChange=${(e) => setField('dimensions', e.target.value)} /></label>
          <label>Year<input type="number" value=${form.year} onChange=${(e) => setField('year', e.target.value)} /></label>
          <label>Price<input type="number" step="0.01" value=${form.price} onChange=${(e) => setField('price', e.target.value)} /></label>
          <label>
            Status
            <select value=${form.status} onChange=${(e) => setField('status', e.target.value)}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked=${form.available}
              onChange=${(e) => setField('available', e.target.checked)}
            />
            Available
          </label>

          ${error ? html`<p className="error-text error-pop">${error}</p>` : null}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick=${onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary${busy ? ' btn-loading' : ''}" disabled=${busy}>
              ${busy
                ? html`<span className="btn-loading-inner"><span className="inline-spinner" aria-hidden="true"></span>${uploadStatus || 'Creating…'}</span>`
                : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

createRoot(document.getElementById('app')).render(
  html`<${React.StrictMode}><${App} /><//>`,
);
