/**
 * Production Cluster Mode
 * Forks one worker per CPU core for maximum throughput.
 * Auto-restarts crashed workers.
 */
const cluster = require('cluster');
const os = require('os');

const WORKERS = parseInt(process.env.CLUSTER_WORKERS) || os.cpus().length;

if (cluster.isPrimary) {
  console.log(`[Cluster] Primary ${process.pid} starting ${WORKERS} workers...`);

  for (let i = 0; i < WORKERS; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`[Cluster] Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
    cluster.fork();
  });

  // Graceful shutdown: forward SIGTERM to all workers
  process.on('SIGTERM', () => {
    console.log('[Cluster] SIGTERM received — shutting down workers...');
    for (const id in cluster.workers) {
      cluster.workers[id].process.kill('SIGTERM');
    }
  });
} else {
  // Worker process — start the Express server
  require('./server.js');
}
