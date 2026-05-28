import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    })
  : null;

const memory = {
  enquiries: [],
  schools: [],
  nextEnquiryId: 1,
  nextSchoolId: 1,
};

async function query(sql, params = []) {
  if (!pool) return null;
  return pool.query(sql, params);
}

async function initDb() {
  if (!pool) {
    console.warn("DATABASE_URL not set. API is using temporary in-memory storage.");
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS enquiries (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      source TEXT DEFAULT '',
      type TEXT DEFAULT '',
      course TEXT DEFAULT '',
      format TEXT DEFAULT '',
      lang TEXT DEFAULT '',
      stage TEXT DEFAULT 'New',
      msg TEXT DEFAULT '',
      date DATE DEFAULT CURRENT_DATE,
      notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS schools (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      cat TEXT DEFAULT '',
      city TEXT DEFAULT '',
      state TEXT DEFAULT '',
      status TEXT DEFAULT 'Not Contacted',
      heat TEXT DEFAULT 'Cool',
      pic TEXT DEFAULT '',
      pic_role TEXT DEFAULT '',
      source TEXT DEFAULT '',
      last_contact DATE,
      next_follow_up DATE,
      deal_size INTEGER DEFAULT 0,
      remarks TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

function toEnquiry(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || "",
    email: row.email || "",
    source: row.source || "",
    type: row.type || "",
    course: row.course || "",
    format: row.format || "",
    lang: row.lang || "",
    stage: row.stage || "New",
    msg: row.msg || "",
    date: row.date ? new Date(row.date).toISOString().slice(0, 10) : "",
    notes: row.notes || "",
  };
}

function toSchool(row) {
  return {
    id: row.id,
    name: row.name,
    cat: row.cat || "",
    city: row.city || "",
    state: row.state || "",
    status: row.status || "Not Contacted",
    heat: row.heat || "Cool",
    pic: row.pic || "",
    picRole: row.pic_role || "",
    source: row.source || "",
    last: row.last_contact ? new Date(row.last_contact).toISOString().slice(0, 10) : "",
    next: row.next_follow_up ? new Date(row.next_follow_up).toISOString().slice(0, 10) : "",
    dealSize: row.deal_size || 0,
    remarks: row.remarks || "",
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, database: Boolean(pool) });
});

app.get("/api/enquiries", async (_req, res, next) => {
  try {
    if (!pool) return res.json(memory.enquiries);
    const { rows } = await query("SELECT * FROM enquiries ORDER BY id DESC");
    res.json(rows.map(toEnquiry));
  } catch (error) {
    next(error);
  }
});

app.post("/api/enquiries", async (req, res, next) => {
  try {
    const data = req.body || {};
    if (!data.name || !data.name.trim()) {
      return res.status(400).json({ error: "Name is required." });
    }

    if (!pool) {
      const item = {
        id: memory.nextEnquiryId++,
        name: data.name.trim(),
        phone: data.phone || "",
        email: data.email || "",
        source: data.source || "WhatsApp",
        type: data.type || "Parent",
        course: data.course || "Not sure yet",
        format: data.format || "Not decided",
        lang: data.lang || "English",
        stage: data.stage || "New",
        msg: data.msg || "",
        date: data.date || new Date().toISOString().slice(0, 10),
        notes: data.notes || "",
      };
      memory.enquiries.unshift(item);
      return res.status(201).json(item);
    }

    const { rows } = await query(
      `INSERT INTO enquiries
        (name, phone, email, source, type, course, format, lang, stage, msg, date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        data.name.trim(),
        data.phone || "",
        data.email || "",
        data.source || "WhatsApp",
        data.type || "Parent",
        data.course || "Not sure yet",
        data.format || "Not decided",
        data.lang || "English",
        data.stage || "New",
        data.msg || "",
        data.date || new Date().toISOString().slice(0, 10),
        data.notes || "",
      ],
    );
    res.status(201).json(toEnquiry(rows[0]));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/enquiries/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const stage = req.body?.stage;
    if (!stage) return res.status(400).json({ error: "Stage is required." });

    if (!pool) {
      const item = memory.enquiries.find((enquiry) => enquiry.id === id);
      if (!item) return res.status(404).json({ error: "Enquiry not found." });
      item.stage = stage;
      return res.json(item);
    }

    const { rows } = await query(
      "UPDATE enquiries SET stage = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [stage, id],
    );
    if (!rows.length) return res.status(404).json({ error: "Enquiry not found." });
    res.json(toEnquiry(rows[0]));
  } catch (error) {
    next(error);
  }
});

app.get("/api/schools", async (_req, res, next) => {
  try {
    if (!pool) return res.json(memory.schools);
    const { rows } = await query("SELECT * FROM schools ORDER BY id ASC");
    res.json(rows.map(toSchool));
  } catch (error) {
    next(error);
  }
});

app.post("/api/schools", async (req, res, next) => {
  try {
    const data = req.body || {};
    if (!data.name || !data.name.trim()) {
      return res.status(400).json({ error: "School name is required." });
    }

    if (!pool) {
      const item = {
        id: memory.nextSchoolId++,
        name: data.name.trim(),
        cat: data.cat || "",
        city: data.city || "",
        state: data.state || "",
        status: data.status || "Not Contacted",
        heat: data.heat || "Cool",
        pic: data.pic || "",
        picRole: data.picRole || "",
        source: data.source || "School outreach",
        last: data.last || "",
        next: data.next || "",
        dealSize: data.dealSize || 0,
        remarks: data.remarks || "",
      };
      memory.schools.push(item);
      return res.status(201).json(item);
    }

    const { rows } = await query(
      `INSERT INTO schools
        (name, cat, city, state, status, heat, pic, pic_role, source, last_contact, next_follow_up, deal_size, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        data.name.trim(),
        data.cat || "",
        data.city || "",
        data.state || "",
        data.status || "Not Contacted",
        data.heat || "Cool",
        data.pic || "",
        data.picRole || "",
        data.source || "School outreach",
        data.last || null,
        data.next || null,
        Number(data.dealSize || 0),
        data.remarks || "",
      ],
    );
    res.status(201).json(toSchool(rows[0]));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/schools/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const status = req.body?.status;
    if (!status) return res.status(400).json({ error: "Status is required." });

    if (!pool) {
      const item = memory.schools.find((school) => school.id === id);
      if (!item) return res.status(404).json({ error: "School not found." });
      item.status = status;
      return res.json(item);
    }

    const { rows } = await query(
      "UPDATE schools SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [status, id],
    );
    if (!rows.length) return res.status(404).json({ error: "School not found." });
    res.json(toSchool(rows[0]));
  } catch (error) {
    next(error);
  }
});

app.use(express.static(__dirname));

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Server error." });
});

await initDb();

app.listen(port, () => {
  console.log(`codencode sales CRM running on port ${port}`);
});
