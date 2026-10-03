"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

export function ArchiveDriveLink({ driveId, children, className }: { driveId: number; children: ReactNode; className?: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const returnTo = `${pathname}${params.size ? `?${params}` : ""}#drive-${driveId}`;
  return <Link id={`drive-${driveId}`} href={`/drives/${driveId}?returnTo=${encodeURIComponent(returnTo)}`} className={className}>{children}</Link>;
}

/** URL anchors restore the relevant row without storing a personal history. */
export function ArchiveReturnFocus() {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  useEffect(() => {
    let observer: MutationObserver | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => { observer?.disconnect(); if (timer) clearTimeout(timer); };
    function attempt() {
      if (!/^#drive-\d+$/.test(window.location.hash)) return false;
      const row = document.getElementById(window.location.hash.slice(1));
      if (!row) return false;
      row.focus({ preventScroll: false });
      stop();
      return true;
    }
    function restore() {
      stop();
      if (!/^#drive-\d+$/.test(window.location.hash) || attempt()) return;
      // Streamed results can mount after the route URL commits.
      observer = new MutationObserver(attempt);
      observer.observe(document.getElementById("main-content") ?? document.body, { childList: true, subtree: true });
      timer = setTimeout(stop, 10_000);
    }
    restore();
    window.addEventListener("hashchange", restore);
    return () => { stop(); window.removeEventListener("hashchange", restore); };
  }, [pathname, query]);
  return null;
}
