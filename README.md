# Art Portfolio

A minimal-cost MVP art portfolio site built with static HTML/CSS/JS (GitHub Pages) and Supabase for auth, database, and storage.

## Features

- **Public gallery** — masonry grid of published artworks with lazy loading
- **Artwork detail pages** — full metadata, pricing, prints info, and contact CTA
- **Admin panel** — login, single/bulk upload, metadata editing, publish/archive/draft workflow
- **Client-side image processing** — resize to max 2000 px, WebP/JPEG encoding, EXIF stripping, thumbnail generation (no originals stored)
- **Row Level Security** — anonymous users can only read `published` rows; only authenticated admins can write

## Stack

| Layer | Technology |
|---|---|
| Hosting | GitHub Pages |
| Auth | Supabase Auth (email/password) |
| Database | Supabase Postgres |
| Storage | Supabase Storage |
| Image processing | Browser Canvas API (client-side) |
| Gallery layout | CSS columns (masonry) |

## Project structure

```
art-portfolio/
├── index.html          # Public gallery
├── artwork.html        # Artwork detail page (?id=…)
├── admin.html          # Admin panel
├── css/
│   ├── style.css       # Public site styles
│   └── admin.css       # Admin panel styles
├── js/
│   ├── supabase-config.js   # Supabase client (put your keys here)
│   ├── image-processor.js   # Client-side resize/encode/thumbnail
│   ├── gallery.js           # Public gallery logic
│   ├── artwork.js           # Artwork detail logic
│   └── admin.js             # Admin panel logic
```

## Setup

1. Push this repository to GitHub.
2. In **Settings → Pages**, set the source to the `main` branch, root directory.
3. Your site will be live at `https://<username>.github.io/<repo>/`.

## Image upload policy

All image processing happens in the browser before upload:

- Longest edge resized to **2000 px** (thumbnail: **500 px**)
- Encoded as **WebP** (with JPEG fallback for older browsers)
- Quality **0.8**
- EXIF metadata stripped automatically by the Canvas API
- Originals are **never** uploaded or stored

## Scaling

When you're ready to add more admins:

```sql
UPDATE profiles SET role = 'admin' WHERE user_id = '<new-admin-uuid>';
```

The schema already supports `'editor'` and `'admin'` roles via the `profiles.role` column.

