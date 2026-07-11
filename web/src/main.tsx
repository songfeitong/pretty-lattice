import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import "./i18n";
import "./styles/global.css";

const DevAgentation = import.meta.env.DEV
  ? lazy(() => import("./dev/DevAgentation"))
  : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    {DevAgentation ? (
      <Suspense fallback={null}>
        <DevAgentation />
      </Suspense>
    ) : null}
  </StrictMode>,
);
