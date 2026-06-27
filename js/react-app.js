import React, { useEffect, useMemo, useState } from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';
import htm from 'https://esm.sh/htm@3.1.1';

const html = htm.bind(React.createElement);
const supabase = window.supabaseClient;

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
      if (!supabase?.auth) {
        setAuthReady(true);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const sess = data?.session ?? null;
      setSession(sess);
      if (sess?.user) {
        setIsAdmin(await loadIsAdmin(sess.user.id));
      }
      setAuthReady(true);
    }

    bootstrap();

    if (!supabase?.auth) {
      return () => {
        mounted = false;
      };
    }

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
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
    await supabase.auth.signOut();
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
          : html`<p className="page-loading">Loading…</p>`}
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
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return false;
  return data?.role === 'admin';
}

function LoginModal({ onClose, onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    const { error: signInError } = await supabase.auth.signInWithPassword({
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
        <form onSubmit=${handleSubmit} className="auth-form">
          <label>
            Email
            <input
              type="email"
              required
              value=${email}
              onChange=${(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              value=${password}
              onChange=${(e) => setPassword(e.target.value)}
            />
          </label>
          ${error ? html`<p className="error-text">${error}</p>` : null}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick=${onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled=${busy}>
              ${busy ? 'Signing in…' : 'Sign in'}
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
      if (!supabase) {
        throw new Error('Supabase client not initialized');
      }

      let query = supabase
        .from('artworks')
        .select('id,title,description,medium,material,dimensions,year,price,status,available,prints_type,print_qty,print_size,print_price,created_at')
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

      <div className="react-gallery-grid">
        ${artworks.map(
          (art) => html`
            <button
              key=${art.id}
              className="art-card"
              onClick=${() => setActive(art)}
            >
              <div className="art-card-visual">No photo yet</div>
              <div className="art-card-meta">
                <h3>${art.title}</h3>
                <p>${[art.medium, art.year].filter(Boolean).join(' · ') || 'Untitled metadata'}</p>
                ${isAdmin ? html`<span className="status-pill">${art.status}</span>` : null}
              </div>
            </button>
          `,
        )}
      </div>

      ${active
        ? html`
            <${ArtworkModal}
              artwork=${active}
              isAdmin=${isAdmin}
              onClose=${() => setActive(null)}
              onSaved=${async () => {
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

function ArtworkModal({ artwork, isAdmin, onClose, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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

  async function save() {
    setBusy(true);
    setError('');

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      medium: form.medium.trim() || null,
      material: form.material.trim() || null,
      dimensions: form.dimensions.trim() || null,
      year: form.year ? Number(form.year) : null,
      price: form.price ? Number(form.price) : null,
      status: form.status,
    };

    const { error: updateError } = await supabase
      .from('artworks')
      .update(payload)
      .eq('id', artwork.id);

    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setEditing(false);
    await onSaved();
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
                <button className="btn btn-primary" disabled=${busy} onClick=${save}>
                  ${busy ? 'Saving…' : 'Save'}
                </button>
              </div>
            `
          : html`
              <div className="artwork-details">
                <p className="artwork-description-focus">${artwork.description || 'No description provided.'}</p>
                <dl>
                  ${detailRows.map(([label, value]) => html`<><dt>${label}</dt><dd>${String(value)}</dd></>`)}
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

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
    };

    const { error: insertError } = await supabase.from('artworks').insert(payload);

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    await onCreated();
  }

  return html`
    <div className="modal-backdrop" onClick=${onClose}>
      <div className="modal-card modal-card-lg" onClick=${(e) => e.stopPropagation()}>
        <h3>Add new work</h3>
        <form className="modal-content-grid" onSubmit=${create}>
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

          ${error ? html`<p className="error-text">${error}</p>` : null}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick=${onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled=${busy}>
              ${busy ? 'Creating…' : 'Create'}
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
