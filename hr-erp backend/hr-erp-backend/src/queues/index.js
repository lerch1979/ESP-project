/**
 * Bull Job Queues — graceful fallback when Redis unavailable.
 * Queues: email, pdf, translation
 */
const Queue = require('bull');
const { logger } = require('../utils/logger');
const { isConnected } = require('../config/redis');

const REDIS_URL = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;

let emailQueue = null;
let pdfQueue = null;
let translationQueue = null;

try {
  emailQueue = new Queue('email', REDIS_URL, { defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } } });
  pdfQueue = new Queue('pdf', REDIS_URL, { defaultJobOptions: { attempts: 2, backoff: { type: 'fixed', delay: 1000 } } });
  translationQueue = new Queue('translation', REDIS_URL, { defaultJobOptions: { attempts: 3 } });

  [emailQueue, pdfQueue, translationQueue].forEach((q) => {
    q.on('error', () => {}); // Suppress connection errors when Redis unavailable
    q.on('failed', (job, err) => logger.warn(`Queue job failed: ${q.name}`, { jobId: job?.id, error: err?.message }));
  });

  logger.info('Bull queues initialized (email, pdf, translation)');
} catch (err) {
  logger.info('Bull queues not available — running in synchronous mode');
}

/**
 * Add job to queue, or run synchronously if queue unavailable
 */
async function addJob(queue, name, data, processor) {
  if (queue && isConnected()) {
    return queue.add(data);
  }
  // Fallback: run synchronously
  logger.debug(`Running ${name} synchronously (no queue)`);
  return processor(data);
}

module.exports = { emailQueue, pdfQueue, translationQueue, addJob };
