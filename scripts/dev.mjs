import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];
let shuttingDown = false;

function start(label, args) {
  const child = spawn(npmCommand, args, {
    stdio: 'inherit',
    env: process.env,
  });

  children.push(child);

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (code === 0 || signal === 'SIGINT' || signal === 'SIGTERM') return;
    console.error(`[FareTransit local] ${label} exited unexpectedly with code ${code ?? 'unknown'}.`);
    shutdown(code || 1);
  });

  child.on('error', (error) => {
    console.error(`[FareTransit local] Unable to start ${label}: ${error.message}`);
    shutdown(1);
  });

  return child;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(exitCode), 150);
}

console.log('[FareTransit local] Starting backend at http://localhost:5001 and frontend at http://localhost:3000');
console.log('[FareTransit local] Complete Reservation requires the backend process to remain running.');

start('backend', ['--prefix', 'backend', 'run', 'dev']);
start('frontend', ['--prefix', 'frontend', 'start']);

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
