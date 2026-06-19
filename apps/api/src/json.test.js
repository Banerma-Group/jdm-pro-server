import { describe, expect, test } from "bun:test";
import { body } from "./json.js";

describe("request body parser", () => {
  test("parses urlencoded bodies like the old Express middleware", async () => {
    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "email=user%40example.com&password=secret",
    });

    expect(await body(request)).toEqual({ email: "user@example.com", password: "secret" });
  });

  test("rejects strict JSON primitives", async () => {
    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "\"plain\"",
    });

    await expect(body(request)).rejects.toThrow("Invalid JSON body");
  });
});
