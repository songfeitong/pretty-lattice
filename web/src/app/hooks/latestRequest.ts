import { isAbortError } from "../../api/scene";

export type LatestRequestOutcome<T> =
  | { status: "success"; value: T }
  | { status: "error"; error: unknown }
  | { status: "discarded" };

export class LatestRequestRunner {
  private controller: AbortController | null = null;
  private generation = 0;

  cancel(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
  }

  async run<T>(request: (signal: AbortSignal) => Promise<T>): Promise<LatestRequestOutcome<T>> {
    this.cancel();

    const controller = new AbortController();
    const generation = this.generation;
    this.controller = controller;

    let outcome: LatestRequestOutcome<T>;
    try {
      outcome = { status: "success", value: await request(controller.signal) };
    } catch (error) {
      outcome = isAbortError(error)
        ? { status: "discarded" }
        : { status: "error", error };
    }

    if (!this.isCurrent(controller, generation)) {
      return { status: "discarded" };
    }

    this.controller = null;
    return outcome;
  }

  private isCurrent(controller: AbortController, generation: number): boolean {
    return (
      this.controller === controller &&
      this.generation === generation &&
      !controller.signal.aborted
    );
  }
}
