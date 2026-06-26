/**
 * artwork.js — Artwork detail page
 *
 * Reads ?id= from the URL, fetches the published artwork from Supabase,
 * and renders the detail view with a contact CTA.
 */

// ── Contact info ─────────────────────────────────────────────────────────────
// Replace with your actual contact details.
const CONTACT_EMAIL = 'hello@example.com';
const CONTACT_INSTAGRAM = 'https://www.instagram.com/yourhandle';

// ─────────────────────────────────────────────────────────────────────────────

async function loadArtwork() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  const container = document.getElementById('artwork-container');
  const loading = document.getElementById('artwork-loading');
  const error = document.getElementById('artwork-error');

  if (!id) {
    loading.hidden = true;
    error.textContent = 'Artwork not found.';
    error.hidden = false;
    return;
  }

  try {
    const { data: art, error: err } = await supabase
      .from('artworks')
      .select('*')
      .eq('id', id)
      .eq('status', 'published')
      .single();

    if (err || !art) {
      throw err ?? new Error('Not found');
    }

    loading.hidden = true;
    renderArtwork(art, container);
  } catch (e) {
    loading.hidden = true;
    error.textContent = 'Artwork not found or unavailable.';
    error.hidden = false;
    console.error('Artwork load error:', e);
  }
}

function getPublicUrl(path) {
  if (!path) return '';
  const { data } = supabase.storage.from('artworks').getPublicUrl(path);
  return data?.publicUrl ?? '';
}

function renderArtwork(art, container) {
  const imageUrl = getPublicUrl(art.image_path);

  // Update <title> and meta for SEO
  document.title = `${art.title} — Art Portfolio`;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc && art.description) metaDesc.content = art.description;

  const keywords = Array.isArray(art.seo_keywords) ? art.seo_keywords.join(', ') : '';
  const metaKeywords = document.querySelector('meta[name="keywords"]');
  if (metaKeywords && keywords) metaKeywords.content = keywords;

  container.innerHTML = `
    <div class="artwork-detail">
      <div class="artwork-image-wrap">
        ${imageUrl ? `<img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(art.title)}" class="artwork-image">` : '<div class="artwork-no-image">No image</div>'}
      </div>
      <div class="artwork-info">
        <h1 class="artwork-title">${escapeHtml(art.title)}</h1>
        ${buildMeta(art)}
        ${art.description ? `<p class="artwork-description">${escapeHtml(art.description)}</p>` : ''}
        ${buildPriceBlock(art)}
        ${buildPrintsBlock(art)}
        <div class="artwork-contact">
          <p class="artwork-contact-label">Interested in this piece?</p>
          <div class="artwork-contact-buttons">
            <a href="mailto:${escapeAttr(CONTACT_EMAIL)}?subject=${encodeURIComponent('Inquiry: ' + art.title)}"
               class="btn btn-primary">Email</a>
            <a href="${escapeAttr(CONTACT_INSTAGRAM)}" target="_blank" rel="noopener noreferrer"
               class="btn btn-secondary">Instagram</a>
          </div>
        </div>
      </div>
    </div>
    <a href="index.html" class="back-link">&larr; Back to gallery</a>
  `;
}

function buildMeta(art) {
  const items = [
    art.medium && `<dt>Medium</dt><dd>${escapeHtml(art.medium)}</dd>`,
    art.material && `<dt>Material</dt><dd>${escapeHtml(art.material)}</dd>`,
    art.dimensions && `<dt>Dimensions</dt><dd>${escapeHtml(art.dimensions)}</dd>`,
    art.year && `<dt>Year</dt><dd>${escapeHtml(String(art.year))}</dd>`,
  ].filter(Boolean);

  if (!items.length) return '';
  return `<dl class="artwork-meta">${items.join('')}</dl>`;
}

function buildPriceBlock(art) {
  if (!art.available) {
    return '<p class="artwork-sold">Sold</p>';
  }
  if (art.price) {
    return `<p class="artwork-price">$${Number(art.price).toLocaleString('en-US', { minimumFractionDigits: 0 })}</p>`;
  }
  return '';
}

function buildPrintsBlock(art) {
  if (!art.prints_type || art.prints_type === 'none') return '';

  const typeLabel = art.prints_type === 'limited' ? 'Limited edition prints' : 'Open edition prints';
  const details = [
    art.print_size && `Size: ${escapeHtml(art.print_size)}`,
    art.print_price && `$${Number(art.print_price).toLocaleString('en-US', { minimumFractionDigits: 0 })}`,
    art.prints_type === 'limited' && art.print_qty ? `Edition of ${art.print_qty}` : null,
  ].filter(Boolean);

  return `
    <div class="artwork-prints">
      <p class="artwork-prints-label">${typeLabel}</p>
      ${details.length ? `<p class="artwork-prints-details">${details.join(' · ')}</p>` : ''}
    </div>
  `;
}

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

document.addEventListener('DOMContentLoaded', loadArtwork);
