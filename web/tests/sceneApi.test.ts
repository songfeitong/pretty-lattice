import { describe, expect, test } from "bun:test";

import { uploadStructurePreview } from "../src/api/scene";

describe("scene API", () => {
  test("preserves the native AbortError from fetch", async () => {
    const originalFetch = globalThis.fetch;
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    globalThis.fetch = Object.assign(
      async (_input: RequestInfo | URL, _init?: RequestInit) => {
        throw abortError;
      },
      { preconnect: originalFetch.preconnect },
    );

    try {
      const request = uploadStructurePreview(new File(["structure"], "NaCl.cif"));
      await expect(request).rejects.toBe(abortError);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
