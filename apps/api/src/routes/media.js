import { eq, or, ilike, inArray, count } from "drizzle-orm";
import { schema } from "@jdm-pro/db";
import { json, body } from "../json.js";
import { serialize } from "../serialize.js";
import * as aws from "../services/aws.js";
import { parseListQuery, orderColumn, listWhere } from "../util/listQuery.js";
import { pagination } from "../util/pagination.js";
import { buildS3Key, bufferToStream, keyFromUrl, singleFile } from "../util/uploads.js";

const ID_RE = /^\/api\/media\/([^/]+)$/;

async function attachUser(db, rows) {
  const ids = [...new Set(rows.map((r) => r.userId).filter((v) => v != null))];
  const users = ids.length ? await db.select().from(schema.users).where(inArray(schema.users.id, ids)) : [];
  const byId = new Map(users.map((u) => {
    const rest = { ...u };
    delete rest.salt;
    delete rest.hash;
    return [u.id, rest];
  }));
  for (const r of rows) {
    r.user = r.userId != null ? byId.get(r.userId) ?? null : null;
    // Match the old Sequelize wire shape: media's FK was snake_case (user_id).
    r.user_id = r.userId ?? null;
    delete r.userId;
  }
  return rows;
}

export async function mediaRoutes(db, request, url) {
  if (url.pathname === "/api/media/presign" && request.method === "POST") {
    const data = await body(request);
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) return json({ error: "items required" }, 400);
    const MAX = 25 * 1024 * 1024;
    for (const it of items) {
      if (!/^image\//.test(it.type)) return json({ error: "only images allowed" }, 415);
      if (it.size > MAX) return json({ error: "file too large" }, 413);
    }
    const out = [];
    for (const it of items) {
      const key = buildS3Key(it.name);
      const signed = await aws.getSignedUploadUrl(key, { ContentType: it.type });
      out.push({ key, url: signed, contentType: it.type, name: it.name });
    }
    return json({ items: out });
  }

  if (url.pathname === "/api/media/finalize" && request.method === "POST") {
    const data = await body(request);
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) return json({ error: "items required" }, 400);
    const results = [];
    for (const it of items) {
      const exists = await aws.headObjectExists(it.key);
      if (!exists) {
        results.push({ ok: false, key: it.key, error: "not uploaded" });
        continue;
      }
      const publicUrl = `https://${process.env.S3_BUCKET}.s3-${process.env.S3_REGION}.amazonaws.com/${it.key}`;
      const [media] = await db.insert(schema.media).values({ url: publicUrl, name: it.name }).returning();
      results.push(media);
    }
    return json({ data: results }, 201);
  }

  if (url.pathname === "/api/media/bulk-delete" && request.method === "POST") {
    const data = await body(request);
    const ids = data?.ids;
    if (!Array.isArray(ids) || ids.length === 0) return json({ message: "Invalid or empty IDs array" }, 400);
    const medias = await db.select().from(schema.media).where(inArray(schema.media.id, ids));
    if (!medias.length) return json({ message: "No media found for given IDs" }, 404);
    const keys = medias.map((m) => keyFromUrl(m.url)).filter(Boolean);
    if (keys.length) {
      try {
        await aws.deleteObjects(keys);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("S3 bulk delete error:", err);
      }
    }
    await db.delete(schema.vehicleMedia).where(inArray(schema.vehicleMedia.mediaId, ids));
    await db.delete(schema.media).where(inArray(schema.media.id, ids));
    return new Response(null, { status: 204 });
  }

  if (url.pathname === "/api/media" && request.method === "GET") {
    const { limit, offset, search } = parseListQuery(url);
    const searchWhere = search ? or(ilike(schema.media.name, `%${search}%`), ilike(schema.media.url, `%${search}%`)) : undefined;
    const where = listWhere(schema.media, url, [searchWhere]);
    const rows = await db
      .select()
      .from(schema.media)
      .where(where)
      .orderBy(orderColumn(schema.media, "created_at", "desc"))
      .limit(limit)
      .offset(offset);
    const [{ value: total }] = await db.select({ value: count() }).from(schema.media).where(where);
    await attachUser(db, rows);
    return json({ data: rows, pagination: pagination(limit, offset, Number(total)) });
  }

  if (url.pathname === "/api/media" && request.method === "POST") {
    const { file, fields } = await singleFile(request, "file");
    if (!file) return json({ error: "file is required" }, 400);
    const key = buildS3Key(file.originalname);
    const uploadedUrl = await aws.upload(key, bufferToStream(file.buffer));
    const [media] = await db
      .insert(schema.media)
      .values({ url: uploadedUrl, name: fields?.name || file.originalname })
      .returning();
    return json(serialize(media, { type: "Media" }), 201);
  }

  const match = url.pathname.match(ID_RE);
  if (!match) return null;
  const id = Number(match[1]);

  if (request.method === "GET") {
    const [row] = await db.select().from(schema.media).where(eq(schema.media.id, id)).limit(1);
    if (!row) return new Response(null, { status: 404 });
    return json(serialize(row, { type: "Media" }));
  }

  if (request.method === "DELETE") {
    const [media] = await db.select().from(schema.media).where(eq(schema.media.id, id)).limit(1);
    if (!media) return new Response(null, { status: 404 });
    const key = keyFromUrl(media.url);
    if (key) {
      try {
        await aws.deleteObject(key);
      } catch {
        /* log for diagnostics */
      }
    }
    await db.delete(schema.media).where(eq(schema.media.id, id));
    return new Response(null, { status: 204 });
  }

  return null;
}
