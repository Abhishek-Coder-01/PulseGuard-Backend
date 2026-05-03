const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  url: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  interval: {
    type: Number,
    default: 5
  },
  type: {
    type: String,
    enum: ["api", "website", "service", "render", "other"],
    default: "api"
  },
  lastStatus: {
    type: String,
    default: "up"
  },
  lastResponseTime: {
    type: Number,
    default: 0
  },
  lastCheckedAt: {
    type: Date,
    default: Date.now
  },
  nextCheckAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model("Project", projectSchema);
