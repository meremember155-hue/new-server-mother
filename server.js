import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const DB_FILE = path.join(__dirname, "db.json");

// قراءة قاعدة البيانات
function readDB() {
  try {
    const data = fs.readFileSync(DB_FILE, "utf8");
    return JSON.parse(data);
  } catch (e) {
    return { tasks: [] };
  }
}

// كتابة قاعدة البيانات
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// الحصول على المهام
app.get("/tasks", (req, res) => {
  const db = readDB();
  res.json(db.tasks);
});

// إضافة مهمة جديدة
app.post("/tasks", (req, res) => {
  const db = readDB();
  const newTask = {
    id: Date.now(),
    subject: req.body.subject || "",
    text: req.body.text || "",
    date: req.body.date || ""
  };
  db.tasks.push(newTask);
  writeDB(db);
  res.json({ success: true, task: newTask });
});

// حذف مهمة
app.delete("/tasks/:id", (req, res) => {
  const db = readDB();
  const id = Number(req.params.id);
  db.tasks = db.tasks.filter(t => t.id !== id);
  writeDB(db);
  res.json({ success: true });
});

// تشغيل السيرفر
app.listen(10000, () => {
  console.log("Server is running on port 10000");
});
