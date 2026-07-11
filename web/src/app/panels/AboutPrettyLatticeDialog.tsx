import { DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import { PRETTY_LATTICE_VERSION } from "../appMetadata";
import { PrettyLatticeLogo } from "./PrettyLatticeLogo";

const PRETTY_LATTICE_GITHUB_URL = "https://github.com/songfeitong/pretty-lattice";

function GitHubMarkIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
      />
    </svg>
  );
}

export function AboutPrettyLatticeDialog() {
  const { t } = useTranslation();

  return (
    <DialogContent
      className="w-[min(calc(100vw-2rem),20rem)] overflow-hidden rounded-2xl border-foreground/10 bg-background p-0 shadow-xl shadow-foreground/12 sm:max-w-none"
      showCloseButton={false}
    >
      <div className="relative flex min-h-[19.5rem] flex-col items-center px-6 pb-5 pt-6 text-center">
        <a
          href={PRETTY_LATTICE_GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          aria-label={t("app.github")}
          className="absolute right-3 top-3 grid size-7 place-items-center rounded-[10px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 motion-reduced:transition-none [&_svg]:size-6"
        >
          <GitHubMarkIcon />
        </a>

        <div className="mt-5 flex flex-col items-center">
          <div
            className="grid size-20 place-items-center"
            style={{
              filter:
                "drop-shadow(0 9px 10px rgb(40 40 40 / 12%)) drop-shadow(0 2px 4px rgb(40 40 40 / 10%))",
            }}
          >
            <PrettyLatticeLogo className="size-20" />
          </div>

          <DialogTitle className="mt-5 text-xl font-semibold leading-tight tracking-normal">
            <span className="sr-only">{t("app.about")} </span>
            {t("app.prettyLattice")}
          </DialogTitle>

          <DialogDescription className="mt-2.5 max-w-[20rem] text-[0.9rem] leading-5 text-foreground/76">
            {t("app.description")}
          </DialogDescription>

          <p className="mt-4 text-sm leading-5 text-muted-foreground">
            {t("app.version", { version: PRETTY_LATTICE_VERSION })}
          </p>
        </div>

        <div className="mt-auto pt-5 text-[0.82rem] leading-5 text-muted-foreground">
          <p>© 2026 Feitong Song · MIT License</p>
        </div>
      </div>
    </DialogContent>
  );
}
