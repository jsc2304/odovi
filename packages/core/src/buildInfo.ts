export const ODOVI_VERSION = "0.3.0";

export interface BuildEnvironment {
  ODOVI_VERSION?: string;
  ODOVI_COMMIT_SHA?: string;
}

export interface BuildInfo {
  version: string;
  commit: string;
  identity: string;
}

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const BUILD_PATTERN = /^[0-9A-Za-z._-]+$/;

function resolveVersion(value: string | undefined): string {
  const candidate = value?.trim();
  return candidate && VERSION_PATTERN.test(candidate) ? candidate : ODOVI_VERSION;
}

function resolveCommit(value: string | undefined): string {
  const candidate = value?.trim();
  if (!candidate || !BUILD_PATTERN.test(candidate)) return "dev";
  return candidate.slice(0, 12);
}

/**
 * Resolve the release identity shared by every Odovi process.
 *
 * Release images inject both values at build time. Source-based development
 * deliberately falls back to the checked-in semantic version and `dev`.
 */
export function resolveBuildInfo(env: BuildEnvironment = {}): BuildInfo {
  const version = resolveVersion(env.ODOVI_VERSION);
  const commit = resolveCommit(env.ODOVI_COMMIT_SHA);

  return {
    version,
    commit,
    identity: `Odovi ${version} (${commit})`,
  };
}
