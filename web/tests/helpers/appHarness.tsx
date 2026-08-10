import { fireEvent, render, screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import type { ComponentType } from "react";

import type { SceneSpec } from "../../src/api/scene";

export interface FetchCall {
  input: RequestInfo | URL;
  init: RequestInit | undefined;
}

export function createAppTestHarness(App: ComponentType) {
  const fetchCalls: FetchCall[] = [];
  const fetchResponses: Array<Response | Promise<Response>> = [];

  function resetFetchMock() {
    fetchCalls.length = 0;
    fetchResponses.length = 0;
    globalThis.fetch = (async (input, init) => {
      fetchCalls.push({ input, init });
      const response = fetchResponses.shift();
      if (!response) {
        throw new Error("Unexpected fetch request.");
      }

      return await response;
    }) as typeof fetch;
  }

  function queueFetchResponse(response: Response | Promise<Response>) {
    fetchResponses.push(response);
  }

  function getFileInput(): HTMLInputElement {
    const input = document.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Could not find structure file input.");
    }

    return input;
  }

  async function renderLoadedStructure(user: UserEvent, scene: SceneSpec) {
    queueFetchResponse(jsonResponse(scene));

    render(<App />);
    await user.upload(getFileInput(), structureFile());
    await screen.findByTestId("lattice-canvas");
  }

  async function openPreviewContextMenu() {
    fireEvent.contextMenu(screen.getByTestId("lattice-canvas"));
    await screen.findByRole("menu");
  }

  async function openSidebarContextMenu() {
    fireEvent.contextMenu(screen.getByRole("complementary", { name: "Sidebar" }));
    await screen.findByRole("menu");
  }

  return {
    errorResponse,
    fetchCalls,
    getFileInput,
    htmlResponse,
    jsonResponse,
    openPreviewContextMenu,
    openSidebarContextMenu,
    queueFetchResponse,
    renderLoadedStructure,
    resetFetchMock,
    structureFile,
  };
}

export function jsonResponse(body: unknown): Response {
  return {
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    ok: true,
  } as Response;
}

export function errorResponse(message: string): Response {
  return {
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({ detail: { message } }),
    ok: false,
    status: 422,
  } as Response;
}

export function htmlResponse(status: number): Response {
  return {
    headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON at position 0");
    },
    ok: status >= 200 && status < 300,
    status,
  } as unknown as Response;
}

export function structureFile(name = "NaCl.cif"): File {
  return new File(["data_NaCl"], name, { type: "chemical/x-cif" });
}
