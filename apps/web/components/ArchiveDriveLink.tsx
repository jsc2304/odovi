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
  const params = useSearchParams();
  useEffect(() => {
    if (!/^#drive-\d+$/.test(window.location.hash)) return;
    const row = document.getElementById(window.location.hash.slice(1));
    row?.focus({ preventScroll: false });
  }, [pathname, params]);
  return null;
}
