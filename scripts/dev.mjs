import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const webRequire = createRequire(new URL('../apps/web/package.json', import.meta.url));
// Run both servers with the same Node runtime; neither receives secrets in command-line arguments.
const api = spawn(process.execPath, [require.resolve('tsx/cli'), 'watch', 'apps/api/src/index.ts'], { cwd: root, stdio: 'inherit' });
const web = spawn(process.execPath, [fileURLToPath(new URL('./bin/vite.js', pathToFileURL(webRequire.resolve('vite/package.json')))), '--host', '127.0.0.1'], { cwd: root + 'apps/web', stdio: 'inherit' });
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  api.kill('SIGTERM'); web.kill('SIGTERM');
  process.exitCode = code;
}
for (const child of [api, web]) {
  child.on('error', () => { console.error('Unable to start a development server. Run npm ci with Node 22 first.'); stop(1); });
  child.on('exit', code => stop(code ?? 1));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
