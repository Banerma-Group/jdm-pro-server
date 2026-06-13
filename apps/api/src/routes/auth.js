import { eq } from "drizzle-orm";
import { schema } from "@jdm-pro/db";
import { json, body } from "../json.js";
import { getAuthToken } from "../auth.js";
import { matchPassword } from "../util/crypto.js";

// Public auth routes (no device guard).
export async function authRoutes(db, request, url) {
  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    return new Response(null, { status: 204 });
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    const data = await body(request);
    const email = typeof data.email === "string" ? data.email : "";
    const password = typeof data.password === "string" ? data.password : "";
    if (email.length < 9 || !password) {
      return json({ errors: [{ msg: "Invalid email or password" }] }, 400);
    }

    const [user] = await db
      .select({ id: schema.users.id, salt: schema.users.salt, hash: schema.users.hash })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    const ok = user ? await matchPassword(password, user.salt, user.hash) : false;
    if (!user || !ok) return new Response(null, { status: 400 });

    return json(getAuthToken(user.id));
  }

  return null;
}
