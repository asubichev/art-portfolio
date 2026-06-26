/**
 * gallery.js — Public masonry gallery
 *
 * Fetches published artworks from Supabase and renders them in a
 * CSS-columns masonry layout with IntersectionObserver lazy loading.
 */

const ARTWORKS_PER_PAGE = 50;

async function loadGallery() {
  const grid = document.getElementById('gallery-grid');
  const loading = document.getElementById('gallery-loading');
  const error = document.getElementById('gallery-error');

  try {
    const { data: artworks, error: err } = await supabase
      .from('artworks')
      .select('id, title, thumb_path, medium, year, available, price')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(ARTWORKS_PER_PAGE);

    if (err) throw err;

    loading.hidden = true;

    if (!artworks || artworks.length === 0) {
      error.textContent = 'No artworks yet — check back soon!';
      error.hidden = false;
      return;
    }

    renderGallery(artworks, grid);
  } catch (e) {
    loading.hidden = true;
    error.textContent = 'Failed to load gallery. Please try again later.';
    error.hidden = false;
    console.error('Gallery load error:', e);
  }
}

function getPublicUrl(path) {
  if (!path) return '';
  const { data } = supabase.storage.from('artworks').getPublicUrl(path);
  return data?.publicUrl ?? '';
}

function renderGallery(artworks, grid) {
  grid.innerHTML = '';

  artworks.forEach((art) => {
    const thumbUrl = getPublicUrl(art.thumb_path);

    const item = document.createElement('article');
    item.className = 'gallery-item';

    const link = document.createElement('a');
    link.href = `artwork.html?id=${encodeURIComponent(art.id)}`;
    link.setAttribute('aria-label', art.title);

    const img = document.createElement('img');
    img.alt = art.title;
    img.loading = 'lazy';
    // Use data-src for IntersectionObserver lazy loading
    img.dataset.src = thumbUrl;
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // 1×1 placeholder

    const caption = document.createElement('figcaption');
    caption.className = 'gallery-caption';

    const titleEl = document.createElement('span');
    titleEl.className = 'gallery-title';
    titleEl.textContent = art.title;

    caption.appendChild(titleEl);

    if (art.medium || art.year) {
      const meta = document.createElement('span');
      meta.className = 'gallery-meta';
      meta.textContent = [art.medium, art.year].filter(Boolean).join(', ');
      caption.appendChild(meta);
    }

    link.appendChild(img);
    link.appendChild(caption);
    item.appendChild(link);
    grid.appendChild(item);
  });

  initLazyLoad();
}

function initLazyLoad() {
  const images = document.querySelectorAll('img[data-src]');
  if (!images.length) return;

  if (!('IntersectionObserver' in window)) {
    // Fallback: load all images immediately
    images.forEach((img) => {
      img.src = img.dataset.src;
      delete img.dataset.src;
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          delete img.dataset.src;
          observer.unobserve(img);
        }
      });
    },
    { rootMargin: '200px 0px' },
  );

  images.forEach((img) => observer.observe(img));
}

document.addEventListener('DOMContentLoaded', loadGallery);
