import { createHash } from "crypto";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { debugLog } from "@jdm-pro/shared";

const DEFAULT_IMAGE_PREFIX = "listings";

export function buildPublicUrl(key, { bucket = process.env.S3_BUCKET, region = process.env.S3_REGION } = {}) {
  if (!bucket) throw new Error("S3_BUCKET is missing");
  if (!region) return `https://${bucket}.s3.amazonaws.com/${key}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

function cleanSegment(value, fallback) {
  const cleaned = String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function basenameFromUrl(imageUrl) {
  try {
    const pathname = new URL(imageUrl).pathname;
    const raw = pathname.split("/").filter(Boolean).pop();
    return cleanSegment(decodeURIComponent(raw || ""), "image");
  } catch {
    return "image";
  }
}

export function buildImageKey(
  { source, sourceListingId, index, url },
  { prefix = process.env.S3_IMAGE_PREFIX || DEFAULT_IMAGE_PREFIX } = {}
) {
  const hash = createHash("sha256").update(String(url)).digest("hex").slice(0, 12);
  const ordinal = String(index).padStart(2, "0");
  return [
    cleanSegment(prefix, DEFAULT_IMAGE_PREFIX),
    cleanSegment(source, "unknown-source"),
    cleanSegment(sourceListingId, "unknown-listing"),
    `${ordinal}-${hash}-${basenameFromUrl(url)}`,
  ].join("/");
}

export function createS3Client({
  region = process.env.S3_REGION,
  accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY,
  secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_KEY,
} = {}) {
  return new S3Client({
    region,
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    followRegionRedirects: true,
  });
}

async function downloadImage(url, { fetchImpl = fetch } = {}) {
  debugLog("worker.s3.download.start", { url });
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Image download failed (${response.status} ${response.statusText}) for ${url}`);

  const contentType = response.headers?.get?.("content-type")?.split(";")[0] || undefined;
  const body = Buffer.from(await response.arrayBuffer());
  debugLog("worker.s3.download.done", { url, contentType, byteLength: body.length });
  return { body, contentType };
}

export async function uploadListingPhoto(
  imageUrl,
  listing,
  index,
  {
    bucket = process.env.S3_BUCKET,
    region = process.env.S3_REGION,
    prefix = process.env.S3_IMAGE_PREFIX || DEFAULT_IMAGE_PREFIX,
    client = createS3Client({ region }),
    fetchImpl = fetch,
    Uploader = Upload,
  } = {}
) {
  if (!bucket) throw new Error("S3_BUCKET is missing");

  debugLog("worker.s3.upload.start", {
    imageUrl,
    source: listing.source,
    sourceListingId: listing.sourceListingId,
    index,
    bucket,
    region,
    prefix,
  });

  const { body, contentType } = await downloadImage(imageUrl, { fetchImpl });
  const key = buildImageKey({ ...listing, index, url: imageUrl }, { prefix });
  const params = {
    Bucket: bucket,
    ACL: "public-read",
    Key: key,
    Body: body,
    ...(contentType ? { ContentType: contentType } : {}),
  };

  const uploader = new Uploader({ client, params });
  await uploader.done();
  const publicUrl = buildPublicUrl(key, { bucket, region });
  debugLog("worker.s3.upload.done", { imageUrl, key, publicUrl, contentType });
  return publicUrl;
}

function normalizeError(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function mirrorListingPhotos(canonical, { uploadPhoto = uploadListingPhoto } = {}) {
  const originalPhotos = Array.isArray(canonical.photos) ? canonical.photos.filter(Boolean) : [];
  debugLog("worker.s3.mirror.start", {
    source: canonical.source,
    sourceListingId: canonical.sourceListingId,
    originalPhotoCount: originalPhotos.length,
  });

  if (originalPhotos.length === 0) return canonical;
  if (process.env.CRAWLER_MIRROR_PHOTOS === "false") return canonical;

  const uploadedPhotos = [];
  const photoUploadErrors = [];

  for (const [index, photoUrl] of originalPhotos.entries()) {
    try {
      uploadedPhotos.push(await uploadPhoto(photoUrl, canonical, index));
      debugLog("worker.s3.mirror.photo.done", { sourceListingId: canonical.sourceListingId, index, photoUrl });
    } catch (error) {
      photoUploadErrors.push({ url: photoUrl, error: normalizeError(error) });
      debugLog("worker.s3.mirror.photo.error", {
        sourceListingId: canonical.sourceListingId,
        index,
        photoUrl,
        message: normalizeError(error),
      });
    }
  }

  if (photoUploadErrors.length === 0) {
    debugLog("worker.s3.mirror.done", {
      sourceListingId: canonical.sourceListingId,
      uploadedPhotoCount: uploadedPhotos.length,
      errorCount: 0,
    });
    return { ...canonical, photos: uploadedPhotos };
  }

  const raw = {
    ...(canonical.raw && typeof canonical.raw === "object" ? canonical.raw : {}),
    photoUploadErrors,
  };

  debugLog("worker.s3.mirror.done", {
    sourceListingId: canonical.sourceListingId,
    uploadedPhotoCount: uploadedPhotos.length,
    errorCount: photoUploadErrors.length,
  });

  return {
    ...canonical,
    photos: uploadedPhotos.length > 0 ? uploadedPhotos : originalPhotos,
    raw,
  };
}
