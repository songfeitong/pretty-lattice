import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

const LOGO_CENTER_X = 585;
const LOGO_CENTER_Y = 673;

export function PrettyLatticeLogo({
  className,
  isHovered = false,
}: {
  className?: string;
  isHovered?: boolean;
}) {
  const outerHexagonStyle = {
    transform: `rotate(${isHovered ? -60 : 0}deg)`,
    transformBox: "fill-box",
    transformOrigin: "center",
  } satisfies CSSProperties;
  const innerHexagonStyle = {
    transform: `rotate(${isHovered ? 90 : 0}deg)`,
    transformBox: "fill-box",
    transformOrigin: "center",
  } satisfies CSSProperties;

  return (
    <svg
      aria-hidden="true"
      className={cn("block", className)}
      focusable="false"
      viewBox="80.767 91.585 1008.466 1162.83"
    >
      <g transform={`rotate(30 ${LOGO_CENTER_X} ${LOGO_CENTER_Y})`}>
        <polygon
          className="fill-[#a4a7c8] transition-transform duration-[520ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduced:transition-none"
          points="299,176 871,176 1158,673 871,1170 299,1170 12,673"
          style={outerHexagonStyle}
        />
        <polygon
          className="fill-[#a5dcd8] transition-transform duration-[520ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduced:transition-none"
          points="585,341 871,508 871,839 585,1005 299,839 299,508"
          style={innerHexagonStyle}
        />
      </g>
    </svg>
  );
}
