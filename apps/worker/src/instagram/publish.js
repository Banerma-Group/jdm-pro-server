import { buildCaption, coverPhoto } from "../listingFormat.js";

const MAX_CAROUSEL = 10;

function config() {
  return {
    version: process.env.IG_GRAPH_VERSION || "v21.0",
    userId: process.env.IG_USER_ID,
    accessToken: process.env.IG_ACCESS_TOKEN,
  };
}

function graphUrl(version, path, params) {
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, value);
  }
  return url;
}

async function graphPost(version, path, params) {
  const res = await fetch(graphUrl(version, path, params), { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const message = body.error?.message || `Graph API ${res.status}`;
    const error = new Error(message);
    error.graph = body.error || null;
    throw error;
  }
  return body;
}

function listingPhotos(listing) {
  const row = typeof listing.toJSON === "function" ? listing.toJSON() : listing;
  const photos = Array.isArray(row.photos) ? row.photos.filter(Boolean) : [];
  if (photos.length) return photos.slice(0, MAX_CAROUSEL);
  const cover = coverPhoto(row);
  return cover ? [cover] : [];
}

async function createSingleContainer(cfg, imageUrl, caption) {
  const { id } = await graphPost(cfg.version, `${cfg.userId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: cfg.accessToken,
  });
  return id;
}

async function createCarouselContainer(cfg, photos, caption) {
  const children = [];
  for (const imageUrl of photos) {
    const { id } = await graphPost(cfg.version, `${cfg.userId}/media`, {
      image_url: imageUrl,
      is_carousel_item: "true",
      access_token: cfg.accessToken,
    });
    children.push(id);
  }

  const { id } = await graphPost(cfg.version, `${cfg.userId}/media`, {
    media_type: "CAROUSEL",
    children: children.join(","),
    caption,
    access_token: cfg.accessToken,
  });
  return id;
}

// Publishes the listing's photos + caption to Instagram via the Graph API.
// Returns { ok, id?, error? }. Images must be publicly reachable (S3 mirror urls).
export async function publishListing(listing) {
  const cfg = config();
  if (!cfg.userId || !cfg.accessToken) {
    return { ok: false, error: "Instagram not configured" };
  }

  const photos = listingPhotos(listing);
  if (!photos.length) return { ok: false, error: "No photos to publish" };

  const caption = buildCaption(listing, { html: false, hashtags: true });

  try {
    const creationId =
      photos.length === 1
        ? await createSingleContainer(cfg, photos[0], caption)
        : await createCarouselContainer(cfg, photos, caption);

    const published = await graphPost(cfg.version, `${cfg.userId}/media_publish`, {
      creation_id: creationId,
      access_token: cfg.accessToken,
    });

    return { ok: true, id: published.id };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
