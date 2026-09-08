#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const publicDocs = new Set([
  'docs/demo.md', 'docs/journey-recap.md', 'docs/driving-profile.md', 'docs/runtime-configuration.md',
  'docs/teslamate-compatibility.md', 'docs/rename-to-odovi.md',
  'docs/releases/pipeline.md', 'docs/releases/0.2.0.md', 'docs/releases/0.3.0.md',
  'docs/upgrade-odovi.md',
  'docs/release-acceptance.md',
  'docs/adr/0001-require-provider-activation-for-location-data.md',
  'docs/adr/0002-use-versioned-images-for-public-releases.md',
]);
const forbiddenPath = /(^|\/)(\.private|\.claude|\.agents|\.openai|acceptance-results|playwright-report|test-results)(\/|$)|^apps\/marketing\//;
const privateContent = [
  /(?:\/Users\/jan\/|\/home\/admin\/)/,
  /(?:below\s+Tessie|unter\s+Tessie)/i,
  /^#{1,6}\s+(?:Roadmap|Agent discussion|Internal handover)\b/im,
  /(?:BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY)/,
  /(?:ghp|github_pat)_[A-Za-z0-9_]{30,}/,
];
const git = args => execFileSync('git', args, { maxBuffer: 128 * 1024 * 1024 });
const args = process.argv.slice(2);
const history = args[0] === '--history';
if (args.length && !history && args[0] !== '--staged') throw new Error('Use --staged or --history [revision ...]');
const paths = new Map();
const filePaths = new Set();
if (history) {
  const refs = args.slice(1).length ? args.slice(1) : ['HEAD'];
  for (const ref of refs) {
    if (ref.startsWith('-')) throw new Error('Revision options are not accepted');
    git(['rev-parse', '--verify', `${ref}^{commit}`]);
  }
  for (const line of git(['rev-list', '--objects', ...refs, '--']).toString().trim().split('\n')) {
    const space = line.indexOf(' ');
    if (space > 0) paths.set(line.slice(0, space), line.slice(space + 1));
  }
  for (const path of git(['log', '--format=', '--name-only', ...refs, '--']).toString().split('\n').filter(Boolean)) filePaths.add(path);
} else {
  for (const entry of git(['ls-files', '--stage', '-z']).toString().split('\0').filter(Boolean)) {
    const [metadata, path] = entry.split('\t');
    if (metadata.split(' ')[2] !== '0') throw new Error('Resolve index conflicts before publication');
    filePaths.add(path);
    paths.set(metadata.split(' ')[1], path);
  }
}
const failures = new Set();
for (const path of filePaths) {
  if (forbiddenPath.test(path) || (path.startsWith('docs/') && !publicDocs.has(path)))
    failures.add(`Private or unreviewed path: ${path}`);
}
const objectIds = [...paths.keys()];
if (objectIds.length) {
  const output = execFileSync('git', ['cat-file', '--batch'], {
    input: objectIds.join('\n') + '\n', maxBuffer: 128 * 1024 * 1024,
  });
  let offset = 0;
  for (const oid of objectIds) {
    const end = output.indexOf(10, offset);
    const [, type, sizeText] = output.subarray(offset, end).toString().split(' ');
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size)) throw new Error('Unable to inspect Git object');
    const body = output.subarray(end + 1, end + 1 + size);
    offset = end + size + 2;
    if (type !== 'blob' || body.includes(0)) continue;
    if (privateContent.some(pattern => pattern.test(body.toString('utf8'))))
      failures.add(`Review confidential content: ${paths.get(oid)}`);
  }
}
if (history) {
  const refs = args.slice(1).length ? args.slice(1) : ['HEAD'];
  const messages = git(['log', '--format=%B', ...refs, '--']).toString();
  if (privateContent.some(pattern => pattern.test(messages))) failures.add('Review confidential commit messages');
}
if (failures.size) {
  console.error([...failures].join('\n'));
  process.exitCode = 1;
} else console.log(`Publication boundary passed (${history ? 'history' : 'index'}; automated checks, not a confidentiality guarantee).`);
