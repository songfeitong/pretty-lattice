import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

import {
  applyResolvedMotion,
  MOTION_MEDIA_QUERY,
  readMotionPreference,
  readSystemMotion,
  resolveMotion,
  type MotionPreference,
  type ResolvedMotion,
  writeMotionPreference,
} from "./motionPreference";

interface MotionContextValue {
  motion: MotionPreference;
  reducedMotion: boolean;
  resolvedMotion: ResolvedMotion;
  setMotion: (motion: MotionPreference) => void;
}

const MotionContext = createContext<MotionContextValue>({
  motion: "system",
  reducedMotion: false,
  resolvedMotion: "full",
  setMotion: () => {},
});

export function MotionProvider({ children }: { children: ReactNode }) {
  const [motion, setMotionState] = useState(readMotionPreference);
  const [systemMotion, setSystemMotion] = useState(readSystemMotion);
  const resolvedMotion = resolveMotion(motion, systemMotion);

  useLayoutEffect(() => {
    applyResolvedMotion(resolvedMotion);
  }, [resolvedMotion]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(MOTION_MEDIA_QUERY);
    const handleSystemMotionChange = (event: MediaQueryListEvent) => {
      setSystemMotion(event.matches ? "reduce" : "full");
    };

    mediaQuery.addEventListener("change", handleSystemMotionChange);
    return () => mediaQuery.removeEventListener("change", handleSystemMotionChange);
  }, []);

  const setMotion = useCallback((nextMotion: MotionPreference) => {
    writeMotionPreference(nextMotion);
    setMotionState(nextMotion);
  }, []);

  const value = useMemo(
    () => ({
      motion,
      reducedMotion: resolvedMotion === "reduce",
      resolvedMotion,
      setMotion,
    }),
    [motion, resolvedMotion, setMotion],
  );

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useMotion() {
  return useContext(MotionContext);
}
