import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy";

test("school hostname rewrites clean URLs while consumer routes and static assets remain intact", () => {
  const consumer = proxy(new NextRequest("https://www.freereader.io/reader", { headers: { host: "www.freereader.io" } }));
  assert.equal(consumer.headers.get("x-middleware-rewrite"), null);
  assert.equal(consumer.headers.get("x-middleware-next"), "1");
  const school = proxy(new NextRequest("https://edu.freereader.io/assignments/id", { headers: { host: "edu.freereader.io" } }));
  assert.equal(school.headers.get("x-middleware-rewrite"), "https://edu.freereader.io/edu/assignments/id");
  assert.equal(school.headers.get("Referrer-Policy"), "no-referrer");
  assert.match(school.headers.get("set-cookie") ?? "", /freereader-edu-surface=1/);
  const api = proxy(new NextRequest("https://edu.freereader.io/api/edu/session", { headers: { host: "edu.freereader.io" } }));
  assert.equal(api.headers.get("x-middleware-rewrite"), null);
  const asset = proxy(new NextRequest("https://edu.freereader.io/_next/static/worker.js", { headers: { host: "edu.freereader.io" } }));
  assert.equal(asset.headers.get("x-middleware-rewrite"), null);
});
