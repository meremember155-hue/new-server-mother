// server.js (ES module)
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Low, JSONFile } from "lowdb";
import { nanoid } from "nanoid";
import xss from "xss";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * CONFIGURATION (use environment variables in Render)
 * - PORT (Render sets automatically)
 * - ALLOWED_ORIGINS (comma-separated list) or default '*'
 * - SENDER_TOKEN (secret token required for POST)
 */
const PORT = process.env.PORT || 10000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim()).filter(Boolean);
const SENDER_TOKEN = process.env.SENDER_TOKEN || "changeme_replace_this_with_env_secret";

// LowDB setup (db.json in project root)
const file = path.join(__dirname, "db.json");
const adapter = new JSONFile(file);
const db = new Low(adapter);

// initialize db if empty
await db.read();
db.data = db.data || { tasks: [] };
await db.write();

const app = express();

// Security middlewares
app.use(helmet());

// CORS: if ALLOWED_ORIGINS is '*' allow all, otherwise restrict
if (ALLOWED_ORIGINS.length === 0 || (ALLOWED_ORIGINS.length === 1 && ALLOWED_ORIGINS[0] === "*")) {
  app.use(cors());
} else {
  app.use(cors({
    origin: (origin, callback) => {
      // allow server-to-server requests (no origin)
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error("CORS origin not allowed"), false);
    }
  }));
}

// Rate limiting: protect against spam
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // limit each IP to 60 requests / minute
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// body parser
app.use(express.json({ limit: "10kb" })); // small payloads only

// Simple logger (console)
app.use((req, res, next) => {
  console.log(new Date().toISOString(), req.method, req.path, req.ip);
  next();
});

// Health check
app.get("/healthz", (req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

// GET tasks - returns array of tasks
app.get("/tasks", async (req, res) => {
  await db.read();
  const tasks = db.data.tasks || [];
  // return shallow copy
  return res.json(tasks);
});

// POST task - requires SENDER_TOKEN header for authentication
// Request body: { subject: string, task: string, date?: string }
app.post("/tasks", async (req, res) => {
  try {
    const token = req.headers["x-sender-token"] || "";
    if (!token || token !== SENDER_TOKEN) {
      return res.status(401).json({ error: "Unauthorized: invalid token" });
    }

    const { subject, task, date } = req.body || {};
    if (!subject || !task) {
      return res.status(400).json({ error: "subject and task are required" });
    }

    // sanitize fields to avoid XSS
    const cleanSubject = xss(String(subject)).slice(0, 200);
    const cleanTask = xss(String(task)).slice(0, 2000);
    const cleanDate = date ? xss(String(date)).slice(0, 50) : "";

    await db.read();
    const id = nanoid(8);
    const newTask = {
      id,
      subject: cleanSubject,
      task: cleanTask,
      date: cleanDate,
      createdAt: new Date().toISOString()
    };

    db.data.tasks.push(newTask);
    await db.write();

    return res.status(201).json({ ok: true, task: newTask });
  } catch (err) {
    console.error("POST /tasks error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Optional: delete task (protected)
app.delete("/tasks/:id", async (req, res) => {
  try {
    const token = req.headers["x-sender-token"] || "";
    if (!token || token !== SENDER_TOKEN) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const id = req.params.id;
    await db.read();
    const before = db.data.tasks.length;
    db.data.tasks = db.data.tasks.filter(t => t.id !== id);
    await db.write();
    return res.json({ ok: true, deleted: before - db.data.tasks.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Serve a tiny index for quick manual test
app.get("/", (req, res) => {
  res.send("RemmberMe API - OK. Use /tasks and /healthz");
});

// global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  if (err.message && err.message.includes("CORS origin not allowed")) {
    return res.status(403).json({ error: "CORS blocked" });
  }
  res.status(500).json({ error: "Server error" });
});

app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});
