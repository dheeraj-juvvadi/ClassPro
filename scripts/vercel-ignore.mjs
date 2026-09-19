// Vercel: 0 skips a build; 1 builds. Compare against the last successful deploy.
import { pathToFileURL } from 'node:url';
import { changedPaths } from './ci-scope.mjs';

export function shouldBuild(paths) {
  if (paths === null) return true;
  return paths.some(path => /^portal-app\//.test(path) || /^scripts\/(?:ci-scope|vercel-ignore)/.test(path)
    || path === '.gitignore' || path === '.vercelignore' || path === 'vercel.json');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paths = changedPaths(process.env.VERCEL_GIT_PREVIOUS_SHA, process.env.VERCEL_GIT_COMMIT_SHA);
  const build = shouldBuild(paths);
  console.log(build ? 'Build: app inputs changed or prior deployment is unavailable.' : 'Skip: no app inputs changed since the last successful deployment.');
  process.exitCode = build ? 1 : 0;
}
