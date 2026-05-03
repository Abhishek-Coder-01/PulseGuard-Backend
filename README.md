# 🛡️ PulseGuard — URL Uptime Monitor

> **Live Monitor karo apne URLs ko | Real-time Graphs | Smart Notifications | 24/7 Server Alive**

[![Frontend](https://img.shields.io/badge/Frontend-Vercel-black?logo=vercel)](https://pulse-guard-frontend.vercel.app/#hero)
[![Backend](https://img.shields.io/badge/Backend-Render-46E3B7?logo=render)](https://pulseguard-backend-yuyh.onrender.com/)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

---

## 🔗 Live Links

| Service | URL |
|---------|-----|
| 🌐 **Frontend** | [pulse-guard-frontend.vercel.app](https://pulse-guard-frontend.vercel.app/#hero) |
| ⚙️ **Backend API** | [pulseguard-backend-yuyh.onrender.com](https://pulseguard-backend-yuyh.onrender.com/) |

---

## ✨ Features

- 🔍 **URL Ping Monitor** — Koi bhi URL paste karo, real-time ping check hoga
- 📊 **Live Graph** — Response time ka live chart (auto-update every 60s)
- 🔔 **Smart Notifications** — Site down hone par instant alert (Email + In-App)
- 🔐 **JWT Authentication** — Secure login/signup with token-based auth
- 🎨 **Beautiful Modal UI** — Modern design with clean modals
- 🕐 **24/7 Uptime** — Backend hamesha alive (no Render cold-start sleep)

---

## 🚀 Quick Start

### 1. Clone karo

```bash
git clone https://github.com/YOUR_USERNAME/pulseguard.git
cd pulseguard
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### 3. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# .env me apni values bharo (niche dekho)
npm start
```

---

## ⚙️ Environment Variables

### Backend `.env`

```env
# Server
PORT=5000
NODE_ENV=production

# Database
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/pulseguard

# JWT Auth
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d

# Email Notifications (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password

# Ping Settings
PING_INTERVAL_MS=60000       # Har 60 sec me ping
PING_TIMEOUT_MS=10000        # 10 sec timeout
```

### Frontend `.env`

```env
VITE_API_BASE_URL=https://pulseguard-backend-yuyh.onrender.com
VITE_WS_URL=wss://pulseguard-backend-yuyh.onrender.com
```

---

## 🔐 Authentication Flow

PulseGuard JWT-based authentication use karta hai:

```
User Register/Login
       ↓
Backend JWT Token Generate karta hai
       ↓
Frontend localStorage me store karta hai
       ↓
Har API request me → Authorization: Bearer <token>
       ↓
Protected routes token validity check karte hain
```

### Auth API Endpoints

```http
POST /api/auth/register     → Naya account banao
POST /api/auth/login        → Login karo, JWT milega
GET  /api/auth/me           → Apna profile dekho  [Protected]
POST /api/auth/logout       → Logout karo
```

---

## 📡 Monitor API Endpoints

```http
POST   /api/monitors              → Naya URL add karo
GET    /api/monitors              → Apne saare monitors dekho
DELETE /api/monitors/:id          → Monitor hatao
GET    /api/monitors/:id/ping     → Manual ping trigger karo
GET    /api/monitors/:id/logs     → Ping history + graph data
```

### Example: URL Monitor Add karna

```bash
curl -X POST https://pulseguard-backend-yuyh.onrender.com/api/monitors \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-site.com",
    "name": "My Website",
    "interval": 60
  }'
```

---

## 📊 Live Graph — Kaise Kaam Karta Hai

```
Browser (Frontend)
    ↕  WebSocket / Polling
Backend Server (Express)
    ↕  Cron Job (every 60s)
Ping karo → Target URL
    ↓
Response time record karo
    ↓
MongoDB me save karo
    ↓
Frontend ko live update bhejo
    ↓
Recharts / Chart.js me graph update
```

### Graph Data Format

```json
{
  "monitorId": "abc123",
  "url": "https://your-site.com",
  "logs": [
    { "timestamp": "2026-05-03T10:00:00Z", "responseTime": 145, "status": 200, "alive": true },
    { "timestamp": "2026-05-03T10:01:00Z", "responseTime": 132, "status": 200, "alive": true },
    { "timestamp": "2026-05-03T10:02:00Z", "responseTime": null, "status": 0,   "alive": false }
  ],
  "uptime": 98.5,
  "avgResponseTime": 138
}
```

---

## 🔔 Notification System

| Type | Trigger | Channel |
|------|---------|---------|
| 📧 Email | Site down > 2 min | SMTP (Gmail) |
| 🔔 In-App | Har status change | WebSocket push |
| ✅ Recovery Alert | Site wapas online | Email + In-App |

---

## 😴 24/7 Server Alive — Render Free Tier Fix

> **Problem:** Render free tier 15 min inactivity ke baad server **sleep** kar deta hai → pehli request 30 sec late aati hai.

---

### ✅ Method 1: Self-Ping (No External Service — Best Option)

Apne backend `server.js` me ye add karo:

```javascript
// services/keepAlive.js
const SELF_URL = process.env.RENDER_EXTERNAL_URL || 'https://pulseguard-backend-yuyh.onrender.com';
const INTERVAL = 14 * 60 * 1000; // 14 minutes

function keepAlive() {
  setInterval(async () => {
    try {
      const res = await fetch(`${SELF_URL}/health`);
      console.log(`[KeepAlive] ✅ ${res.status} @ ${new Date().toISOString()}`);
    } catch (err) {
      console.error('[KeepAlive] ❌ Failed:', err.message);
    }
  }, INTERVAL);
  console.log('[KeepAlive] Self-ping started — server stays alive 24/7');
}

module.exports = keepAlive;
```

```javascript
// server.js me import karo
const keepAlive = require('./services/keepAlive');

// Health route — ZAROORI HAI
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  keepAlive(); // ← ye line add karo
});
```

---

### ✅ Method 2: Free External Ping Services (Recommended Backup)

| Service | Free Monitors | Interval | Link |
|---------|--------------|----------|------|
| **UptimeRobot** | 50 monitors | 5 min | [uptimerobot.com](https://uptimerobot.com) |
| **Cron-job.org** | Unlimited | 1 min | [cron-job.org](https://cron-job.org) |
| **FreshPing** | 50 monitors | 1 min | [freshping.io](https://freshping.io) |
| **BetterStack** | 10 monitors | 3 min | [betterstack.com](https://betterstack.com) |

**UptimeRobot Setup (5 min me done):**
1. [uptimerobot.com](https://uptimerobot.com) par free account banao
2. Dashboard → **"Add New Monitor"**
3. Monitor Type: **HTTP(s)**
4. Friendly Name: `PulseGuard Backend`
5. URL: `https://pulseguard-backend-yuyh.onrender.com/health`
6. Monitoring Interval: **5 minutes**
7. Save → ✅ Done! Server 24/7 alive rahega

---

### ✅ Method 3: GitHub Actions (Completely Free)

```yaml
# .github/workflows/keep-alive.yml
name: Keep PulseGuard Backend Alive

on:
  schedule:
    - cron: '*/14 * * * *'   # Har 14 minute me ping
  workflow_dispatch:           # Manual trigger bhi

jobs:
  ping-backend:
    runs-on: ubuntu-latest
    steps:
      - name: Ping PulseGuard Backend
        run: |
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
            https://pulseguard-backend-yuyh.onrender.com/health)
          echo "Response Status: $STATUS"
          if [ "$STATUS" = "200" ]; then
            echo "✅ Backend is alive!"
          else
            echo "⚠️ Backend might be down. Status: $STATUS"
          fi
```

> ⚠️ **Note:** GitHub Actions free me 2000 min/month milte hain.  
> Har 14 min ping → ~3100 runs/month → limit cross ho sakti hai.  
> **Best combo:** Self-ping (Method 1) + UptimeRobot (Method 2) = 100% alive

---

## 🗂️ Project Structure

```
pulseguard/
├── frontend/                    # React + Vite
│   ├── src/
│   │   ├── components/
│   │   │   ├── Auth/            # LoginModal.jsx, RegisterModal.jsx
│   │   │   ├── Dashboard/       # MonitorCard.jsx, LiveGraph.jsx
│   │   │   ├── Notifications/   # AlertCenter.jsx
│   │   │   └── UI/              # Button, Modal, Badge components
│   │   ├── hooks/
│   │   │   ├── useAuth.js       # JWT login/logout
│   │   │   ├── useMonitor.js    # CRUD for monitors
│   │   │   └── useWebSocket.js  # Live updates
│   │   ├── pages/
│   │   │   ├── Hero.jsx
│   │   │   └── Dashboard.jsx
│   │   └── utils/
│   │       ├── api.js           # Axios instance with JWT header
│   │       └── helpers.js
│   └── vercel.json
│
├── backend/                     # Node.js + Express
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── monitorController.js
│   │   └── pingController.js
│   ├── models/
│   │   ├── User.js              # Mongoose schema
│   │   ├── Monitor.js
│   │   └── PingLog.js
│   ├── routes/
│   │   ├── auth.js
│   │   └── monitors.js
│   ├── middleware/
│   │   └── authMiddleware.js    # JWT verify
│   ├── services/
│   │   ├── pingService.js       # URL ping logic (node-fetch / axios)
│   │   ├── notifyService.js     # Nodemailer email sender
│   │   ├── cronService.js       # node-cron scheduler
│   │   └── keepAlive.js         # Self-ping 24/7 ← IMPORTANT
│   ├── .env.example
│   └── server.js
│
├── .github/
│   └── workflows/
│       └── keep-alive.yml       # Optional GitHub Actions ping
│
└── README.md
```

---

## 🧪 Testing

```bash
# Health check
curl https://pulseguard-backend-yuyh.onrender.com/health

# Manual URL ping test
curl -X POST https://pulseguard-backend-yuyh.onrender.com/api/ping \
  -H "Content-Type: application/json" \
  -d '{"url": "https://google.com"}'

# Expected Response:
# {
#   "url": "https://google.com",
#   "status": 200,
#   "responseTime": 142,
#   "alive": true,
#   "checkedAt": "2026-05-03T10:30:00.000Z"
# }
```

---

## 🚢 Deployment

### Frontend → Vercel

```bash
# Option 1: CLI
npm install -g vercel
cd frontend && vercel --prod

# Option 2: GitHub se auto-deploy (Recommended)
# vercel.com → New Project → Import GitHub Repo → Deploy
```

### Backend → Render

1. [render.com](https://render.com) → **New Web Service**
2. GitHub repo connect karo
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Environment:** Node
4. Environment Variables add karo
5. **Deploy!**

```yaml
# render.yaml (optional)
services:
  - type: web
    name: pulseguard-backend
    env: node
    buildCommand: npm install
    startCommand: node server.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: MONGO_URI
        sync: false
      - key: JWT_SECRET
        generateValue: true
```

---

## 🔧 Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Backend 30s slow (first req) | Render free cold start | Self-ping + UptimeRobot lagao |
| CORS error frontend me | Backend CORS config missing | `app.use(cors({ origin: 'https://pulse-guard-frontend.vercel.app' }))` |
| JWT expired error | Token 7 din baad expire | Refresh token implement karo ya expiry badhao |
| Live graph update nahi | WebSocket disconnect | Polling fallback (setInterval) add karo |
| Email notification nahi aayi | SMTP credentials galat | Gmail → 2FA on karo → App Password banao |
| Render me environment variable missing | .env commit nahi kiya | Render dashboard me manually add karo |

---

## 📦 Key Dependencies

### Backend
```json
{
  "express": "^4.18.0",
  "mongoose": "^7.0.0",
  "jsonwebtoken": "^9.0.0",
  "bcryptjs": "^2.4.3",
  "node-cron": "^3.0.0",
  "nodemailer": "^6.9.0",
  "node-fetch": "^3.3.0",
  "cors": "^2.8.5",
  "dotenv": "^16.0.0",
  "socket.io": "^4.6.0"
}
```

### Frontend
```json
{
  "react": "^18.0.0",
  "axios": "^1.4.0",
  "recharts": "^2.7.0",
  "socket.io-client": "^4.6.0",
  "tailwindcss": "^3.3.0"
}
```

---

## 🤝 Contributing

1. Repo fork karo
2. Feature branch banao: `git checkout -b feature/amazing-feature`
3. Changes commit karo: `git commit -m 'Add: amazing feature'`
4. Branch push karo: `git push origin feature/amazing-feature`
5. Pull Request open karo 🎉

---

## 📄 License

MIT License — Free hai, use karo, improve karo, share karo!

---

<div align="center">

**Made with ❤️ | PulseGuard — Apni sites ka pulse check karo**

[🌐 Live Demo](https://pulse-guard-frontend.vercel.app/#hero) · [⚙️ Backend API](https://pulseguard-backend-yuyh.onrender.com/) · [🐛 Issues](https://github.com/YOUR_USERNAME/pulseguard/issues)

</div>
