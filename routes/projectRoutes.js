const express = require("express");
const router = express.Router();
const axios = require("axios");
const Project = require("../models/Project");
const PingLog = require("../models/PingLog");
const auth = require("../middleware/auth");

const PING_TIMEOUT_MS = Math.max(
  parseInt(process.env.PING_TIMEOUT_MS || "30000", 10) || 30000,
  5000
);
const DEFAULT_PROJECT_INTERVAL_MINUTES = 5;
const PROJECT_TYPES = new Set(["api", "website", "service", "render", "other"]);

const normalizeIntervalMinutes = (value) => {
  const parsedValue = parseInt(value, 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 1) {
    return DEFAULT_PROJECT_INTERVAL_MINUTES;
  }

  return parsedValue;
};

const normalizeProjectUrl = (value) => {
  const fallbackValue = String(value || "").trim();

  try {
    const parsedUrl = new URL(fallbackValue);
    parsedUrl.protocol = parsedUrl.protocol.toLowerCase();
    parsedUrl.hostname = parsedUrl.hostname.toLowerCase();
    parsedUrl.hash = "";

    if (parsedUrl.pathname.length > 1) {
      parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, "");
    }

    return parsedUrl.toString();
  } catch {
    return fallbackValue.toLowerCase().replace(/\/+$/, "");
  }
};

const normalizeProjectType = (value) => {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return PROJECT_TYPES.has(normalizedValue) ? normalizedValue : "api";
};

const getNextCheckAt = (checkedAt, intervalMinutes) => (
  new Date(checkedAt.getTime() + normalizeIntervalMinutes(intervalMinutes) * 60 * 1000)
);

const isProjectOverdue = (project, now = new Date()) => {
  if (!project?.nextCheckAt) {
    return false;
  }

  return now.getTime() >= new Date(project.nextCheckAt).getTime();
};

const getEffectiveProjectStatus = (project, now = new Date()) => (
  isProjectOverdue(project, now) ? "down" : (project.lastStatus || "down")
);

const getEffectiveResponseTime = (project, now = new Date()) => (
  getEffectiveProjectStatus(project, now) === "up" ? (project.lastResponseTime || 0) : 0
);

const serializeProject = (projectDoc) => {
  const project = typeof projectDoc.toObject === "function"
    ? projectDoc.toObject()
    : projectDoc;
  const now = new Date();
  const intervalMinutes = normalizeIntervalMinutes(project.interval);
  const lastCheckedAt = project.lastCheckedAt ? new Date(project.lastCheckedAt) : null;
  const nextCheckAt = project.nextCheckAt
    ? new Date(project.nextCheckAt)
    : (lastCheckedAt ? getNextCheckAt(lastCheckedAt, intervalMinutes) : null);
  const serializedProject = {
    ...project,
    interval: intervalMinutes,
    lastCheckedAt,
    nextCheckAt,
    isOverdue: isProjectOverdue({ ...project, nextCheckAt }, now)
  };

  serializedProject.lastStatus = getEffectiveProjectStatus(serializedProject, now);
  serializedProject.lastResponseTime = getEffectiveResponseTime(serializedProject, now);

  return serializedProject;
};

// ─── POST /api/projects ────────────────────────────────────────────────────────
// Add a new project
router.post("/", auth, async (req, res) => {
  try {
    const { name, url, interval, type } = req.body;
    const intervalMinutes = normalizeIntervalMinutes(interval);
    const normalizedName = String(name || "").trim();
    const normalizedUrl = normalizeProjectUrl(url);
    const normalizedType = normalizeProjectType(type);

    if (!normalizedName || !normalizedUrl) {
      return res.status(400).json({ message: "Name and URL are required" });
    }

    const existingProjects = await Project.find({ userId: req.userId }).select("url");
    const hasDuplicateUrl = existingProjects.some(
      (project) => normalizeProjectUrl(project.url) === normalizedUrl
    );

    if (hasDuplicateUrl) {
      return res.status(409).json({ message: "This monitor URL already exists" });
    }

    const project = new Project({
      name: normalizedName,
      url: normalizedUrl,
      type: normalizedType,
      interval: intervalMinutes,
      userId: req.userId
    });

    await project.save();
    const start = Date.now();
    let status = "down";
    let responseTime = 0;

    try {
      await axios.get(project.url, { timeout: PING_TIMEOUT_MS });
      responseTime = Date.now() - start;
      status = "up";
    } catch {
      responseTime = Date.now() - start;
      status = "down";
    }

    const timestamp = new Date();
    const nextCheckAt = getNextCheckAt(timestamp, intervalMinutes);

    await PingLog.create({
      projectId: project._id,
      userId: req.userId,
      status,
      responseTime,
      timestamp
    });

    project.lastStatus = status;
    project.lastResponseTime = responseTime;
    project.lastCheckedAt = timestamp;
    project.nextCheckAt = nextCheckAt;
    await project.save();

    res.status(201).json({ success: true, data: serializeProject(project) });
  } catch (err) {
    console.error("POST /api/projects error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /api/projects ────────────────────────────────────────────────────────
// Fetch all projects for the logged-in user
// NOTE: This route MUST be defined before GET /:id to avoid "ping" being caught as :id
router.get("/", auth, async (req, res) => {
  try {
    const projects = await Project.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json(projects.map(serializeProject));
  } catch (err) {
    console.error("GET /api/projects error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /api/projects/ping?url=... ──────────────────────────────────────────
// Ping a URL and return status/responseTime, save to PingLog
router.get("/ping", auth, async (req, res) => {
  const { url, projectId } = req.query;

  if (!url) {
    return res.status(400).json({ message: "URL query parameter is required" });
  }

  const start = Date.now();
  let status = "down";
  let responseTime = 0;

  try {
    await axios.get(url, { timeout: PING_TIMEOUT_MS });
    responseTime = Date.now() - start;
    status = "up";
  } catch {
    responseTime = Date.now() - start;
    status = "down";
  }

  const timestamp = new Date();
  let nextCheckAt = null;

  // Save ping log if projectId provided
  if (projectId) {
    try {
      const project = await Project.findOne({ _id: projectId, userId: req.userId }).select("interval");
      const intervalMinutes = normalizeIntervalMinutes(project?.interval);
      nextCheckAt = getNextCheckAt(timestamp, intervalMinutes);

      const log = new PingLog({
        projectId,
        userId: req.userId,
        status,
        responseTime,
        timestamp
      });
      await log.save();

      await Project.updateOne(
        { _id: projectId, userId: req.userId },
        {
          $set: {
            lastStatus: status,
            lastResponseTime: responseTime,
            lastCheckedAt: timestamp,
            nextCheckAt
          }
        }
      );
    } catch (logErr) {
      console.error("PingLog save error:", logErr);
    }
  }

  res.json({ status, responseTime, timestamp, nextCheckAt });
});

// ─── GET /api/projects/:id/logs ───────────────────────────────────────────────
// Return last 20 ping logs for a project
router.get("/:id/logs", auth, async (req, res) => {
  try {
    const requestedLimit = parseInt(req.query.limit, 10);
    const logLimit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 20;

    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.userId
    }).lean();

    if (!project) {
      return res.status(404).json({ message: "Project not found or not authorized" });
    }

    const logs = await PingLog.find({
      projectId: req.params.id,
      userId: req.userId
    })
      .sort({ timestamp: -1 })
      .limit(logLimit)
      .lean();

    // Return oldest-first for chart rendering
    const orderedLogs = logs.reverse();
    const nextCheckAt = project.nextCheckAt ? new Date(project.nextCheckAt) : null;
    const overdue = isProjectOverdue(project);

    if (overdue && nextCheckAt) {
      const hasFreshLog = orderedLogs.some((log) => (
        new Date(log.timestamp).getTime() >= nextCheckAt.getTime()
      ));

      if (!hasFreshLog) {
        orderedLogs.push({
          _id: `synthetic-${project._id}-${nextCheckAt.getTime()}`,
          projectId: project._id,
          userId: req.userId,
          status: "down",
          responseTime: 0,
          timestamp: nextCheckAt.toISOString(),
          synthetic: true
        });
      }
    }

    res.json(orderedLogs.slice(-logLimit));
  } catch (err) {
    console.error("GET /api/projects/:id/logs error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /api/projects/:id/uptime ────────────────────────────────────────────
// Calculate uptime percentage for a project (based on last 100 ping logs)
router.get("/:id/uptime", auth, async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, userId: req.userId });

    if (!project) {
      return res.status(404).json({ message: "Project not found or not authorized" });
    }

    // Get last 100 ping logs for this project
    const logs = await PingLog.find({
      projectId: req.params.id,
      userId: req.userId
    })
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();

    if (logs.length === 0) {
      // No logs yet, return 100% if current status is up, 0% if down
      const defaultUptime = project.lastStatus === 'up' ? 100 : 0;
      return res.json({ uptime: defaultUptime, totalChecks: 0, successfulChecks: 0 });
    }

    // Count successful checks
    const successfulChecks = logs.filter(log => log.status === 'up').length;
    const uptime = (successfulChecks / logs.length) * 100;

    res.json({ 
      uptime: parseFloat(uptime.toFixed(2)), 
      totalChecks: logs.length, 
      successfulChecks 
    });
  } catch (err) {
    console.error("GET /api/projects/:id/uptime error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ─── DELETE /api/projects/:id ─────────────────────────────────────────────────
// Delete a project (only if userId matches)
router.delete("/:id", auth, async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, userId: req.userId });

    if (!project) {
      return res.status(404).json({ message: "Project not found or not authorized" });
    }

    await Project.deleteOne({ _id: req.params.id });

    // Also remove associated ping logs
    await PingLog.deleteMany({ projectId: req.params.id });

    res.json({ success: true, message: "Project deleted" });
  } catch (err) {
    console.error("DELETE /api/projects/:id error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
