import { describe, expect, test } from "bun:test";

import { LatestRequestRunner } from "../src/app/hooks/latestRequest";

interface Deferred<T> {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("LatestRequestRunner", () => {
  test("aborts the previous request and discards its late success", async () => {
    const runner = new LatestRequestRunner();
    const first = deferred<string>();
    const second = deferred<string>();
    let firstSignal: AbortSignal | undefined;

    const firstOutcome = runner.run((signal) => {
      firstSignal = signal;
      return first.promise;
    });
    const secondOutcome = runner.run(() => second.promise);

    expect(firstSignal?.aborted).toBe(true);
    second.resolve("new");
    expect(await secondOutcome).toEqual({ status: "success", value: "new" });

    first.resolve("old");
    expect(await firstOutcome).toEqual({ status: "discarded" });
  });

  test("discards a superseded error even when the request ignores abort", async () => {
    const runner = new LatestRequestRunner();
    const first = deferred<string>();
    const firstOutcome = runner.run(() => first.promise);
    const secondOutcome = runner.run(async () => "new");

    first.reject(new Error("late failure"));

    expect(await secondOutcome).toEqual({ status: "success", value: "new" });
    expect(await firstOutcome).toEqual({ status: "discarded" });
  });

  test("treats a native AbortError as cancellation instead of failure", async () => {
    const runner = new LatestRequestRunner();

    const outcome = await runner.run(async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    });

    expect(outcome).toEqual({ status: "discarded" });
  });
});
