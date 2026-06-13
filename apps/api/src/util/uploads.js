import path from "path";
import { Readable } from "stream";

export function bufferToStream(buffer) {
  const rs = new Readable();
  rs._read = () => {};
  rs.push(buffer);
  rs.push(null);
  return rs;
}

export function buildS3Key(originalName) {
  const base = path.parse(originalName).name.replace(/[^\w-]+/g, "-").slice(0, 60);
  const ext = path.extname(originalName) || ".jpg";
  const ts = Date.now();
  return `media/jdm/${ts}-${base}${ext}`;
}

export function keyFromUrl(url) {
  try {
    const u = new URL(url);
    return decodeURIComponent(u.pathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }
}

const ALLOWED_UPLOAD = /^image\/(png|jpe?g|webp|gif|svg\+xml)$/;
const MAX_UPLOAD = 10 * 1024 * 1024;

// Replaces multer.single('file'): pulls a single uploaded file from multipart
// form data. Returns { file: { originalname, mimetype, buffer }, fields }.
export async function singleFile(request, field = "file") {
  const form = await request.formData();
  const blob = form.get(field);
  const fields = {};
  for (const [key, value] of form.entries()) {
    if (key !== field && typeof value === "string") fields[key] = value;
  }
  if (!blob || typeof blob === "string") return { file: null, fields };
  if (!ALLOWED_UPLOAD.test(blob.type)) {
    const err = new Error("Unsupported file type");
    err.status = 415;
    throw err;
  }
  if (blob.size > MAX_UPLOAD) {
    const err = new Error("file too large");
    err.status = 413;
    throw err;
  }
  const buffer = Buffer.from(await blob.arrayBuffer());
  return { file: { originalname: blob.name || "upload", mimetype: blob.type, buffer }, fields };
}
