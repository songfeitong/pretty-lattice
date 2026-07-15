import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { StartupErrorBoundary } from "./app/StartupErrorBoundary";
import "./i18n";
import "./styles/global.css";

const DevAgentation = import.meta.env.DEV
  ? lazy(() => import("./dev/DevAgentation"))
  : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StartupErrorBoundary>
      <App />
      {DevAgentation ? (
        <Suspense fallback={null}>
          <DevAgentation />
        </Suspense>
      ) : null}
    </StartupErrorBoundary>
  </StrictMode>,
);
