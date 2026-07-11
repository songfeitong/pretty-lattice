import { cn } from "@/lib/utils";

export function LoadingSpinner({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-3 rounded-full border-2 border-current/25 border-t-current motion-enabled:animate-spin motion-enabled:[animation-duration:450ms]", className)} />;
}
