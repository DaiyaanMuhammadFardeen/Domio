import { test } from "node:test";
import assert from "node:assert/strict";
import { UrlValidationError, validateMirrorUrl } from "../src/url.js";

// ---- POSITIVE --------------------------------------------------------------

test("validateMirrorUrl accepts https URLs", () => {
  const result = validateMirrorUrl("https://registry.npmjs.org/");
  assert.equal(result, "https://registry.npmjs.org/");
});

test("validateMirrorUrl accepts http URLs", () => {
  const result = validateMirrorUrl("http://10.0.0.5:4873");
  assert.equal(result, "http://10.0.0.5:4873/");
});

test("validateMirrorUrl accepts URLs with ports and paths", () => {
  const result = validateMirrorUrl("https://pypi.bd.example/+simple/");
  assert.equal(result, "https://pypi.bd.example/+simple/");
});

test("validateMirrorUrl normalizes the URL (adds trailing slash on host)", () => {
  const result = validateMirrorUrl("https://example.com");
  assert.equal(result, "https://example.com/");
});

// ---- NEGATIVE --------------------------------------------------------------

test("validateMirrorUrl rejects empty string", () => {
  assert.throws(() => validateMirrorUrl(""), UrlValidationError);
  assert.throws(() => validateMirrorUrl("   "), UrlValidationError);
});

test("validateMirrorUrl rejects non-string", () => {
  // @ts-expect-error testing runtime guard
  assert.throws(() => validateMirrorUrl(undefined), UrlValidationError);
  // @ts-expect-error testing runtime guard
  assert.throws(() => validateMirrorUrl(null), UrlValidationError);
});

test("validateMirrorUrl rejects invalid protocol", () => {
  assert.throws(
    () => validateMirrorUrl("ftp://example.com/"),
    (err: unknown) => {
      assert.ok(err instanceof UrlValidationError);
      assert.equal((err as UrlValidationError).code, "URL_BAD_PROTOCOL");
      return true;
    },
  );
  assert.throws(() => validateMirrorUrl("file:///etc/passwd"), UrlValidationError);
  assert.throws(() => validateMirrorUrl("git://github.com/foo.git"), UrlValidationError);
  assert.throws(() => validateMirrorUrl("javascript:alert(1)"), UrlValidationError);
});

test("validateMirrorUrl rejects embedded credentials", () => {
  assert.throws(
    () => validateMirrorUrl("https://user:pass@example.com/"),
    (err: unknown) => {
      assert.ok(err instanceof UrlValidationError);
      assert.equal((err as UrlValidationError).code, "URL_HAS_CREDENTIALS");
      return true;
    },
  );
  assert.throws(() => validateMirrorUrl("https://user@example.com/"), UrlValidationError);
});

test("validateMirrorUrl rejects malformed URL", () => {
  assert.throws(
    () => validateMirrorUrl("https://"),
    (err: unknown) => {
      assert.ok(err instanceof UrlValidationError);
      // The WHATWG URL parser accepts "https://" as a valid opaque URL with no host.
      // Either URL_PARSE_FAILED or URL_NO_HOST is acceptable per spec.
      assert.ok(
        (err as UrlValidationError).code === "URL_PARSE_FAILED" ||
          (err as UrlValidationError).code === "URL_NO_HOST",
      );
      return true;
    },
  );
  assert.throws(() => validateMirrorUrl("not a url"), UrlValidationError);
});