import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCreds } from "@/lib/creds";

test("form input takes precedence over env default", () => {
  const c = resolveCreds(
    { email: "me@you.com", password: "mypw" },
    { ARCHIVE_EMAIL: "default@acct.com", ARCHIVE_PASSWORD: "defpw" },
  );
  assert.deepEqual(c, { email: "me@you.com", password: "mypw" });
});

test("falls back to env default when form fields are blank/whitespace", () => {
  const c = resolveCreds(
    { email: "   ", password: "" },
    { ARCHIVE_EMAIL: "default@acct.com", ARCHIVE_PASSWORD: "defpw" },
  );
  assert.deepEqual(c, { email: "default@acct.com", password: "defpw" });
});

test("returns empty strings when neither form nor env provide creds", () => {
  const c = resolveCreds({}, {});
  assert.deepEqual(c, { email: "", password: "" });
});

test("trims form email but never the password", () => {
  const c = resolveCreds({ email: "  a@b.com  ", password: "  pw with spaces  " }, {});
  assert.deepEqual(c, { email: "a@b.com", password: "  pw with spaces  " });
});
