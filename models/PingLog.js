const mongoose = require("mongoose");

const pingLogSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ["up", "warning", "critical", "down"],
    required: true
  },
  responseTime: {
    type: Number,
    default: 0
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("PingLog", pingLogSchema);
