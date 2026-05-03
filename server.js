require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { clerkMiddleware, getAuth } = require("@clerk/express");

// DNS (optional)
const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const connectDB = require("./config/db");
const startCronJobs = require("./services/cronJob");

// ✅ Routes Import (ADD HERE - TOP LEVEL)
const projectRoutes = require("./routes/projectRoutes");

connectDB().then(() => {
  // Start the background cron jobs once DB is connected
  startCronJobs();
});

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Middlewares — simple open CORS for development
app.use(cors());
app.use(express.json());

// Clerk Middleware
app.use(
  clerkMiddleware({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
  })
);

// ✅ Routes Section (ALL ROUTES HERE)

// Test Route
app.get("/", (req, res) => {
  res.json({ message: "Backend is running" });
});

// Auth Check Route
app.get("/api/check-user", (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    console.log("User ID:", userId);

    res.json({
      success: true,
      userId
    });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Project Routes (ADD HERE - AFTER MIDDLEWARES)
app.use("/api/projects", projectRoutes);

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});