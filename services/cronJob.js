const cron = require('node-cron');
const axios = require('axios');
const Project = require('../models/Project');
const PingLog = require('../models/PingLog');

const MIN_MONITOR_INTERVAL_SECONDS = 2;
const DEFAULT_MONITOR_INTERVAL_SECONDS = 3;
const PING_TIMEOUT_MS = Math.max(
  parseInt(process.env.PING_TIMEOUT_MS || '30000', 10) || 30000,
  5000
);

// Latency thresholds (in milliseconds)
const LATENCY_THRESHOLDS = {
  HEALTHY: 500,      // < 500ms = Healthy
  WARNING: 1000,     // 500ms - 1000ms = Warning
  CRITICAL: Infinity // > 1000ms = Critical (still up, not down)
};

let isCronRunning = false;
const DEFAULT_PROJECT_INTERVAL_MINUTES = 5;

/**
 * Determine status based on response time
 * @param {number} responseTime - Response time in milliseconds
 * @returns {string} - Status: 'up', 'warning', or 'critical'
 */
const getStatusFromResponseTime = (responseTime) => {
  if (responseTime < LATENCY_THRESHOLDS.HEALTHY) {
    return 'up';
  }
  if (responseTime < LATENCY_THRESHOLDS.WARNING) {
    return 'warning';
  }
  return 'critical';
};

const normalizeIntervalMinutes = (value) => {
  const parsedValue = parseInt(value, 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 1) {
    return DEFAULT_PROJECT_INTERVAL_MINUTES;
  }

  return parsedValue;
};

const getNextCheckAt = (checkedAt, intervalMinutes) => (
  new Date(checkedAt.getTime() + normalizeIntervalMinutes(intervalMinutes) * 60 * 1000)
);

const startCronJobs = () => {
  const monitorIntervalSeconds = Math.max(
    parseInt(process.env.MONITOR_INTERVAL_SECONDS || `${DEFAULT_MONITOR_INTERVAL_SECONDS}`, 10) || DEFAULT_MONITOR_INTERVAL_SECONDS,
    MIN_MONITOR_INTERVAL_SECONDS
  );
  const cronExpression = `*/${monitorIntervalSeconds} * * * * *`;

  console.log(`Automated monitoring cron job started (Runs every ${monitorIntervalSeconds} seconds)`);

  cron.schedule(cronExpression, async () => {
    if (isCronRunning) {
      return;
    }

    isCronRunning = true;
    try {
      const projects = await Project.find();
      if (!projects.length) return;

      console.log(`[CRON] Pinging ${projects.length} projects...`);

      await Promise.all(projects.map(async (project) => {
        const intervalMinutes = normalizeIntervalMinutes(project.interval);
        const intervalMs = intervalMinutes * 60 * 1000;
        const lastCheckedMs = project.lastCheckedAt ? project.lastCheckedAt.getTime() : 0;
        const nextCheckMs = project.nextCheckAt
          ? project.nextCheckAt.getTime()
          : lastCheckedMs + intervalMs;

        if (Date.now() < nextCheckMs) {
          return; // Skip if interval has not elapsed
        }

        const start = Date.now();
        let status = 'down'; // Default to down if fetch fails
        let responseTime = 0;
        let errorType = null;

        try {
          await axios.get(project.url, { timeout: PING_TIMEOUT_MS });
          responseTime = Date.now() - start;
          // Determine status based on response time
          status = getStatusFromResponseTime(responseTime);
        } catch (error) {
          responseTime = Date.now() - start;
          
          // Distinguish between different error types
          if (error.code === 'ECONNABORTED') {
            // Timeout occurred
            errorType = 'timeout';
            status = 'down';
          } else if (error.response) {
            // Server responded with error status code
            errorType = `http_${error.response.status}`;
            status = 'down';
          } else if (error.request) {
            // Request was made but no response received
            errorType = 'no_response';
            status = 'down';
          } else {
            // Network or other error
            errorType = error.code || 'network_error';
            status = 'down';
          }
        }

        const timestamp = new Date();
        const nextCheckAt = getNextCheckAt(timestamp, intervalMinutes);

        const log = new PingLog({
          projectId: project._id,
          userId: project.userId,
          status,
          responseTime,
          timestamp
        });
        await log.save();

        await Project.updateOne(
          { _id: project._id },
          {
            $set: {
              lastStatus: status,
              lastResponseTime: responseTime,
              lastCheckedAt: timestamp,
              nextCheckAt
            }
          }
        );

        console.log(`[CRON] ${project.name} (${project.url}) -> ${status.toUpperCase()} (${responseTime}ms)${errorType ? ` [${errorType}]` : ''}`);
      }));
    } catch (err) {
      console.error('[CRON] Error running ping job:', err);
    } finally {
      isCronRunning = false;
    }
  });
};

module.exports = startCronJobs;
