import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;
const schoolImportFile = path.join(__dirname, "crm_school_pipeline_import.csv");
const proposalStoreFile = path.join(__dirname, "proposals_store.json");
const schoolImportFields = [
  "name",
  "category",
  "city",
  "state",
  "status",
  "heat",
  "source",
  "phone",
  "email",
  "source_url",
  "pic",
  "pic_role",
  "last_contact",
  "next_follow_up",
  "deal_size",
  "remarks",
];

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
  proposals: [],
  nextEnquiryId: 1,
  nextSchoolId: 1,
  nextProposalNumber: 1,
};

const proposalCategories = [
  "AI Workshop",
  "Coding Workshop",
  "Career Exposure",
  "Teacher Training",
  "Holiday Program",
  "Corporate Training",
  "Competition/Event",
  "Custom Program",
];

const proposalStatuses = ["Draft", "Ready", "Sent", "Follow Up", "Negotiating", "Approved", "Rejected", "Completed"];

const proposalSeedTemplates = [
  {
    proposalName: "AI Literacy Intro Talk",
    client: "",
    pic: "",
    category: "AI Workshop",
    topics: ["Introduction to AI", "AI Prompt Engineering"],
    audiences: ["Upper Secondary", "Teachers"],
    duration: "1 Hour Talk",
    price: 1200,
    status: "Ready",
    outcomes: ["AI Literacy", "Future Skills", "Career Readiness"],
    followUpDate: "",
    proposalFile: "",
    remarks: "Base template for schools exploring AI awareness sessions.",
  },
  {
    proposalName: "Python Fundamentals Bootcamp",
    client: "",
    pic: "",
    category: "Coding Workshop",
    topics: ["Python Fundamentals"],
    audiences: ["Lower Secondary", "Upper Secondary"],
    duration: "Half Day",
    price: 3500,
    status: "Ready",
    outcomes: ["Coding Fundamentals", "Problem Solving", "STEM"],
    followUpDate: "",
    proposalFile: "",
    remarks: "Reusable coding workshop proposal for school enrichment days.",
  },
  {
    proposalName: "Teacher AI Enablement",
    client: "",
    pic: "",
    category: "Teacher Training",
    topics: ["AI Prompt Engineering", "AI Content Creation", "AI for Workplace"],
    audiences: ["Teachers"],
    duration: "Full Day",
    price: 6800,
    status: "Draft",
    outcomes: ["AI Literacy", "Digital Creativity", "Future Skills"],
    followUpDate: "",
    proposalFile: "",
    remarks: "Teacher CPD style training package.",
  },
  {
    proposalName: "Holiday App Builder Program",
    client: "",
    pic: "",
    category: "Holiday Program",
    topics: ["App Development", "Build a Website"],
    audiences: ["Primary School", "Lower Secondary"],
    duration: "4 Weeks",
    price: 7200,
    status: "Ready",
    outcomes: ["Digital Creativity", "Entrepreneurship", "Coding Fundamentals"],
    followUpDate: "",
    proposalFile: "",
    remarks: "Clone for holiday camp or mall activation proposals.",
  },
];

const demoEnquiryNames = [
  "Puan Farah bt Ismail",
  "李美华 (Li Mei Hua)",
  "Ahmad Faris",
  "Ms Tan Siew Lin",
  "Nurul Ain",
  "张伟杰 (Zhang Weijie)",
  "Priya Nair",
  "Encik Razif",
  "Chloe Lim",
  "Puan Rohani",
  "Daniel Wong",
  "陈小明 (Chen Xiao Ming)",
  "Sarah Krishnan",
  "Ms Loh Yen Ping",
  "Amirul Hakeem",
];

const demoSchoolNames = [
  "Invictus International School JB",
  "Fairview International School JB",
  "Foon Yew High School JB",
  "ISKL",
  "SMK Sri Tebrau",
  "Sunway Intl School IP",
  "SMK Victoria",
  "Sri KL International",
  "UCSI International School KL",
  "SMK Teknik Johor Bahru",
  "SMK Sains JB",
  "SMK Taman Tun Dr Ismail",
  "Marlborough College Malaysia",
  "Taylor's International School KL",
  "Garden International School",
  "Priya Nair - SMK Sri Tebrau",
  "Priya Nair — SMK Sri Tebrau",
  "SMK Methodist Boys KL",
  "Epsom College Malaysia",
  "HELP International School",
  "Stellar International School",
];

async function query(sql, params = []) {
  if (!pool) return null;
  return pool.query(sql, params);
}

async function initDb() {
  if (!pool) {
    console.warn("DATABASE_URL not set. API is using temporary in-memory storage.");
    loadMemorySchools();
    loadMemoryProposals();
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
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      source TEXT DEFAULT '',
      last_contact DATE,
      next_follow_up DATE,
      deal_size INTEGER DEFAULT 0,
      remarks TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query("ALTER TABLE schools ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT ''");
  await query("ALTER TABLE schools ADD COLUMN IF NOT EXISTS email TEXT DEFAULT ''");

  await query(`
    CREATE TABLE IF NOT EXISTS proposals (
      id SERIAL PRIMARY KEY,
      proposal_id TEXT UNIQUE NOT NULL,
      proposal_name TEXT NOT NULL,
      client TEXT DEFAULT '',
      pic TEXT DEFAULT '',
      category TEXT DEFAULT 'Custom Program',
      topics TEXT[] DEFAULT '{}',
      audiences TEXT[] DEFAULT '{}',
      duration TEXT DEFAULT '',
      price NUMERIC(12,2) DEFAULT 0,
      status TEXT DEFAULT 'Draft',
      outcomes TEXT[] DEFAULT '{}',
      follow_up_date DATE,
      proposal_file TEXT DEFAULT '',
      remarks TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS schools_name_city_state_unique
    ON schools (name, city, state)
  `);

  await removeDemoRows();
  await seedSchoolsFromImport();
  await seedProposalTemplates();
}

async function removeDemoRows() {
  const [enquiryResult, schoolResult] = await Promise.all([
    query("DELETE FROM enquiries WHERE name = ANY($1::text[])", [demoEnquiryNames]),
    query("DELETE FROM schools WHERE name = ANY($1::text[])", [demoSchoolNames]),
  ]);

  const removed = Number(enquiryResult.rowCount || 0) + Number(schoolResult.rowCount || 0);
  if (removed > 0) {
    console.log(`Removed ${removed} old demo CRM rows.`);
  }
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
    phone: row.phone || "",
    email: row.email || "",
    source: row.source || "",
    last: row.last_contact ? new Date(row.last_contact).toISOString().slice(0, 10) : "",
    next: row.next_follow_up ? new Date(row.next_follow_up).toISOString().slice(0, 10) : "",
    dealSize: row.deal_size || 0,
    remarks: row.remarks || "",
  };
}

function toProposal(row) {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    proposalName: row.proposal_name,
    client: row.client || "",
    pic: row.pic || "",
    category: row.category || "Custom Program",
    topics: row.topics || [],
    audiences: row.audiences || [],
    duration: row.duration || "",
    price: Number(row.price || 0),
    status: row.status || "Draft",
    outcomes: row.outcomes || [],
    followUpDate: row.follow_up_date ? new Date(row.follow_up_date).toISOString().slice(0, 10) : "",
    proposalFile: row.proposal_file || "",
    remarks: row.remarks || "",
  };
}

function nextProposalId() {
  const id = `PROP-${String(memory.nextProposalNumber).padStart(4, "0")}`;
  memory.nextProposalNumber += 1;
  return id;
}

function normalizeProposal(data, existing = {}) {
  return {
    ...existing,
    proposalName: data.proposalName || data.proposal_name || existing.proposalName || "Untitled Proposal",
    client: data.client ?? existing.client ?? "",
    pic: data.pic ?? existing.pic ?? "",
    category: data.category || existing.category || "Custom Program",
    topics: Array.isArray(data.topics) ? data.topics : existing.topics || [],
    audiences: Array.isArray(data.audiences) ? data.audiences : existing.audiences || [],
    duration: data.duration ?? existing.duration ?? "",
    price: Number(data.price ?? existing.price ?? 0),
    status: data.status || existing.status || "Draft",
    outcomes: Array.isArray(data.outcomes) ? data.outcomes : existing.outcomes || [],
    followUpDate: data.followUpDate ?? existing.followUpDate ?? "",
    proposalFile: data.proposalFile ?? existing.proposalFile ?? "",
    remarks: data.remarks ?? existing.remarks ?? "",
  };
}

function ascii(text) {
  return String(text ?? "")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

function pdfEscape(text) {
  return ascii(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(text, max = 88) {
  const words = ascii(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > max) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function topicPlan(topic) {
  const map = {
    "Introduction to AI": "Students understand what AI is, where it appears in daily life, and how to use it responsibly.",
    "AI Prompt Engineering": "Participants practise writing clear prompts, iterating outputs, and checking AI responses critically.",
    "Build AI Chatbot": "Learners design a simple chatbot flow and understand intents, responses, and basic testing.",
    "AI Content Creation": "Participants create structured text, image, and campaign ideas while learning ethical content use.",
    "AI for Workplace": "Teams identify practical AI workflows for productivity, reporting, communication, and automation.",
    "Python Fundamentals": "Students learn variables, conditionals, loops, functions, and build beginner-friendly projects.",
    "Build a Website": "Learners create a simple responsive webpage using core HTML, CSS, and web layout concepts.",
    "App Development": "Students prototype an app idea, map user flows, and build a simple interactive experience.",
    "Game Development": "Learners use coding logic to build game mechanics, scoring, feedback, and iteration loops.",
  };
  return map[topic] || `Participants complete hands-on activities around ${topic} with guided facilitation and reflection.`;
}

function findSchoolByName(name) {
  if (!name) return null;
  const target = name.toLowerCase();
  return memory.schools.find((school) => school.name.toLowerCase() === target) || null;
}

function proposalLines(proposal, school) {
  const client = proposal.client || "Client / School";
  const schoolContext = school ? `${school.name}, ${school.city}, ${school.state}` : client;
  const audiences = (proposal.audiences || []).join(", ") || "Target audience to be confirmed";
  const topics = proposal.topics || [];
  const outcomes = proposal.outcomes || [];
  return [
    { text: "codencode.my", size: 20, font: "F2" },
    { text: "Proposal Document", size: 15, font: "F2" },
    { text: `${proposal.proposalId} | ${proposal.proposalName}`, size: 11, font: "F1" },
    { text: "", size: 8, font: "F1" },
    { text: "Prepared For", size: 13, font: "F2" },
    { text: schoolContext, size: 11, font: "F1" },
    { text: proposal.pic ? `PIC: ${proposal.pic}` : school?.pic ? `PIC: ${school.pic}` : "PIC: To be assigned", size: 11, font: "F1" },
    { text: school?.email ? `Contact: ${school.email}${school.phone ? ` | ${school.phone}` : ""}` : "", size: 10, font: "F1" },
    { text: "", size: 8, font: "F1" },
    { text: "Program Snapshot", size: 13, font: "F2" },
    { text: `Category: ${proposal.category}`, size: 11, font: "F1" },
    { text: `Audience: ${audiences}`, size: 11, font: "F1" },
    { text: `Duration: ${proposal.duration || "To be confirmed"}`, size: 11, font: "F1" },
    { text: `Investment: RM ${Number(proposal.price || 0).toLocaleString()}`, size: 11, font: "F1" },
    { text: "", size: 8, font: "F1" },
    { text: "Executive Summary", size: 13, font: "F2" },
    {
      text: `This proposal outlines a ${proposal.category.toLowerCase()} designed for ${client}. The program is tailored for ${audiences.toLowerCase()} and focuses on practical, beginner-friendly learning that students or participants can apply immediately.`,
      size: 11,
      font: "F1",
    },
    { text: "", size: 8, font: "F1" },
    { text: "Recommended Topics", size: 13, font: "F2" },
    ...topics.flatMap((topic) => [
      { text: `- ${topic}`, size: 11, font: "F2" },
      { text: topicPlan(topic), size: 10, font: "F1" },
    ]),
    { text: "", size: 8, font: "F1" },
    { text: "Learning Outcomes", size: 13, font: "F2" },
    ...(outcomes.length ? outcomes : ["AI Literacy", "Future Skills", "Problem Solving"]).map((outcome) => ({
      text: `- ${outcome}`,
      size: 11,
      font: "F1",
    })),
    { text: "", size: 8, font: "F1" },
    { text: "Delivery Approach", size: 13, font: "F2" },
    { text: "1. Short concept briefing with examples relevant to the audience.", size: 11, font: "F1" },
    { text: "2. Guided hands-on activity with facilitator support.", size: 11, font: "F1" },
    { text: "3. Mini showcase or reflection so participants leave with a visible output.", size: 11, font: "F1" },
    { text: "4. Optional post-session WhatsApp support and certificate of completion.", size: 11, font: "F1" },
    { text: "", size: 8, font: "F1" },
    { text: "School / Client Fit", size: 13, font: "F2" },
    {
      text: school
        ? `For ${school.name}, this program can be positioned as a ${school.cat || "school"} enrichment initiative for students in ${school.city}. The content can be adjusted for school timetable, venue constraints, and student readiness.`
        : "The proposal can be adapted after the client confirms participant level, venue, preferred language, and target learning outcome.",
      size: 11,
      font: "F1",
    },
    { text: "", size: 8, font: "F1" },
    { text: "Next Steps", size: 13, font: "F2" },
    { text: "- Confirm preferred date, group size, and venue.", size: 11, font: "F1" },
    { text: "- Finalise topic mix and language preference.", size: 11, font: "F1" },
    { text: "- Issue final PDF proposal and invoice once approved.", size: 11, font: "F1" },
    { text: proposal.remarks ? `Remarks: ${proposal.remarks}` : "", size: 10, font: "F1" },
  ].filter((line) => line.text !== "");
}

function buildPdf(lines) {
  const pages = [];
  let current = [];
  let y = 790;
  for (const item of lines) {
    for (const line of wrapText(item.text, item.size >= 13 ? 58 : 92)) {
      if (y < 54) {
        pages.push(current);
        current = [];
        y = 790;
      }
      current.push({ ...item, text: line, y });
      y -= item.size + 7;
    }
  }
  if (current.length) pages.push(current);

  const objects = [];
  const add = (content) => {
    objects.push(content);
    return objects.length;
  };
  const catalogId = add("");
  const pagesId = add("");
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldFontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds = [];
  for (const page of pages) {
    const stream = page
      .map((line) => `BT /${line.font || "F1"} ${line.size} Tf 54 ${line.y} Td (${pdfEscape(line.text)}) Tj ET`)
      .join("\n");
    const contentId = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

function loadMemoryProposals() {
  let proposals = proposalSeedTemplates.map((proposal, index) => ({
    id: index + 1,
    proposalId: `PROP-${String(index + 1).padStart(4, "0")}`,
    ...proposal,
  }));
  if (fs.existsSync(proposalStoreFile)) {
    try {
      proposals = JSON.parse(fs.readFileSync(proposalStoreFile, "utf8"));
    } catch (error) {
      console.warn("Could not read proposals_store.json; using starter proposal templates.");
    }
  }
  memory.proposals = proposals;
  const maxNumber = proposals.reduce((max, proposal) => {
    const number = Number(String(proposal.proposalId || "").replace("PROP-", ""));
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);
  memory.nextProposalNumber = maxNumber + 1;
  writeProposalStore();
}

function writeProposalStore() {
  fs.writeFileSync(proposalStoreFile, JSON.stringify(memory.proposals, null, 2), "utf8");
}

async function seedProposalTemplates() {
  const { rows } = await query("SELECT COUNT(*)::int AS count FROM proposals");
  if (rows[0].count > 0) return;
  for (let i = 0; i < proposalSeedTemplates.length; i += 1) {
    const proposal = proposalSeedTemplates[i];
    await query(
      `INSERT INTO proposals
        (proposal_id, proposal_name, client, pic, category, topics, audiences, duration, price, status, outcomes, follow_up_date, proposal_file, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        `PROP-${String(i + 1).padStart(4, "0")}`,
        proposal.proposalName,
        proposal.client,
        proposal.pic,
        proposal.category,
        proposal.topics,
        proposal.audiences,
        proposal.duration,
        proposal.price,
        proposal.status,
        proposal.outcomes,
        proposal.followUpDate || null,
        proposal.proposalFile,
        proposal.remarks,
      ],
    );
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (quoted && char === '"' && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function readSchoolImport() {
  if (!fs.existsSync(schoolImportFile)) return [];
  const [header, ...records] = parseCsv(fs.readFileSync(schoolImportFile, "utf8"));
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  return records
    .map((record) => {
      const value = (name) => record[index[name]] || "";
      return {
        name: value("name").trim(),
        cat: value("category"),
        city: value("city"),
        state: value("state"),
        status: value("status") || "Not Contacted",
        heat: value("heat") || "Cool",
        pic: value("pic"),
        picRole: value("pic_role"),
        phone: value("phone"),
        email: value("email"),
        source: value("source") || "School outreach",
        sourceUrl: value("source_url"),
        last: value("last_contact"),
        next: value("next_follow_up"),
        dealSize: Number.parseInt(value("deal_size") || "0", 10) || 0,
        remarks: value("remarks"),
      };
    })
    .filter((school) => school.name);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeSchoolImport(schools) {
  const rows = schools.map((school) => ({
    name: school.name,
    category: school.cat,
    city: school.city,
    state: school.state,
    status: school.status,
    heat: school.heat,
    source: school.source,
    phone: school.phone,
    email: school.email,
    source_url: school.sourceUrl,
    pic: school.pic,
    pic_role: school.picRole,
    last_contact: school.last,
    next_follow_up: school.next,
    deal_size: school.dealSize,
    remarks: school.remarks,
  }));
  const csv = [
    schoolImportFields.join(","),
    ...rows.map((row) => schoolImportFields.map((field) => csvCell(row[field])).join(",")),
  ].join("\n");
  fs.writeFileSync(schoolImportFile, `${csv}\n`, "utf8");
}

function loadMemorySchools() {
  const schools = readSchoolImport();
  memory.schools = schools.map((school, index) => ({ id: index + 1, ...school }));
  memory.nextSchoolId = memory.schools.length + 1;
  console.log(`Loaded ${memory.schools.length} schools into the CRM pipeline.`);
}

async function seedSchoolsFromImport() {
  const schools = readSchoolImport();
  for (const school of schools) {
    await query(
      `INSERT INTO schools
        (name, cat, city, state, status, heat, pic, pic_role, phone, email, source, last_contact, next_follow_up, deal_size, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (name, city, state)
       DO UPDATE SET
        phone = CASE WHEN schools.phone = '' THEN EXCLUDED.phone ELSE schools.phone END,
        email = CASE WHEN schools.email = '' THEN EXCLUDED.email ELSE schools.email END,
        updated_at = NOW()`,
      [
        school.name,
        school.cat,
        school.city,
        school.state,
        school.status,
        school.heat,
        school.pic,
        school.picRole,
        school.phone,
        school.email,
        school.source,
        school.last || null,
        school.next || null,
        school.dealSize,
        school.remarks,
      ],
    );
  }
  console.log(`Synced ${schools.length} schools into the CRM pipeline.`);
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
        phone: data.phone || "",
        email: data.email || "",
        source: data.source || "School outreach",
        last: data.last || "",
        next: data.next || "",
        dealSize: data.dealSize || 0,
        remarks: data.remarks || "",
      };
      memory.schools.push(item);
      writeSchoolImport(memory.schools);
      return res.status(201).json(item);
    }

    const { rows } = await query(
      `INSERT INTO schools
        (name, cat, city, state, status, heat, pic, pic_role, phone, email, source, last_contact, next_follow_up, deal_size, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
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
        data.phone || "",
        data.email || "",
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
    const allowed = {
      status: "status",
      heat: "heat",
      pic: "pic",
      phone: "phone",
      email: "email",
      remarks: "remarks",
      dealSize: "deal_size",
    };
    const updates = Object.entries(req.body || {}).filter(([key]) => key in allowed);
    if (!updates.length) return res.status(400).json({ error: "No supported school fields provided." });

    if (!pool) {
      const item = memory.schools.find((school) => school.id === id);
      if (!item) return res.status(404).json({ error: "School not found." });
      for (const [key, value] of updates) {
        item[key] = key === "dealSize" ? Number(value || 0) : value;
      }
      writeSchoolImport(memory.schools);
      return res.json(item);
    }

    const assignments = updates.map(([key], index) => `${allowed[key]} = $${index + 1}`);
    const values = updates.map(([key, value]) => (key === "dealSize" ? Number(value || 0) : value || ""));
    const { rows } = await query(
      `UPDATE schools SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${updates.length + 1} RETURNING *`,
      [...values, id],
    );
    if (!rows.length) return res.status(404).json({ error: "School not found." });
    res.json(toSchool(rows[0]));
  } catch (error) {
    next(error);
  }
});

app.get("/api/proposals", async (req, res, next) => {
  try {
    const account = String(req.query.account || "").toLowerCase();
    if (!pool) {
      const proposals = account
        ? memory.proposals.filter((proposal) => proposal.client.toLowerCase() === account)
        : memory.proposals;
      return res.json(proposals);
    }
    const params = [];
    let where = "";
    if (account) {
      params.push(account);
      where = "WHERE lower(client) = $1";
    }
    const { rows } = await query(`SELECT * FROM proposals ${where} ORDER BY proposal_id ASC`, params);
    res.json(rows.map(toProposal));
  } catch (error) {
    next(error);
  }
});

app.get("/api/accounts/:account/proposals", async (req, res, next) => {
  try {
    const account = req.params.account;
    if (!pool) {
      return res.json(memory.proposals.filter((proposal) => proposal.client.toLowerCase() === account.toLowerCase()));
    }
    const { rows } = await query("SELECT * FROM proposals WHERE lower(client) = lower($1) ORDER BY proposal_id ASC", [account]);
    res.json(rows.map(toProposal));
  } catch (error) {
    next(error);
  }
});

app.post("/api/proposals", async (req, res, next) => {
  try {
    const proposal = normalizeProposal(req.body || {});
    if (!pool) {
      const item = { id: memory.proposals.length + 1, proposalId: nextProposalId(), ...proposal };
      memory.proposals.push(item);
      writeProposalStore();
      return res.status(201).json(item);
    }

    const { rows: lastRows } = await query("SELECT proposal_id FROM proposals ORDER BY proposal_id DESC LIMIT 1");
    const lastNumber = Number(String(lastRows[0]?.proposal_id || "PROP-0000").replace("PROP-", "")) || 0;
    const proposalId = `PROP-${String(lastNumber + 1).padStart(4, "0")}`;
    const { rows } = await query(
      `INSERT INTO proposals
        (proposal_id, proposal_name, client, pic, category, topics, audiences, duration, price, status, outcomes, follow_up_date, proposal_file, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        proposalId,
        proposal.proposalName,
        proposal.client,
        proposal.pic,
        proposal.category,
        proposal.topics,
        proposal.audiences,
        proposal.duration,
        proposal.price,
        proposal.status,
        proposal.outcomes,
        proposal.followUpDate || null,
        proposal.proposalFile,
        proposal.remarks,
      ],
    );
    res.status(201).json(toProposal(rows[0]));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/proposals/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!pool) {
      const index = memory.proposals.findIndex((proposal) => proposal.id === id);
      if (index < 0) return res.status(404).json({ error: "Proposal not found." });
      memory.proposals[index] = normalizeProposal(req.body || {}, memory.proposals[index]);
      writeProposalStore();
      return res.json(memory.proposals[index]);
    }
    const current = await query("SELECT * FROM proposals WHERE id = $1", [id]);
    if (!current.rows.length) return res.status(404).json({ error: "Proposal not found." });
    const proposal = normalizeProposal(req.body || {}, toProposal(current.rows[0]));
    const { rows } = await query(
      `UPDATE proposals SET
        proposal_name = $1,
        client = $2,
        pic = $3,
        category = $4,
        topics = $5,
        audiences = $6,
        duration = $7,
        price = $8,
        status = $9,
        outcomes = $10,
        follow_up_date = $11,
        proposal_file = $12,
        remarks = $13,
        updated_at = NOW()
       WHERE id = $14
       RETURNING *`,
      [
        proposal.proposalName,
        proposal.client,
        proposal.pic,
        proposal.category,
        proposal.topics,
        proposal.audiences,
        proposal.duration,
        proposal.price,
        proposal.status,
        proposal.outcomes,
        proposal.followUpDate || null,
        proposal.proposalFile,
        proposal.remarks,
        id,
      ],
    );
    res.json(toProposal(rows[0]));
  } catch (error) {
    next(error);
  }
});

app.post("/api/proposals/:id/clone", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const assign = req.body || {};
    const source = pool
      ? (await query("SELECT * FROM proposals WHERE id = $1", [id])).rows[0]
      : memory.proposals.find((proposal) => proposal.id === id);
    if (!source) return res.status(404).json({ error: "Proposal not found." });
    const base = pool ? toProposal(source) : source;
    const cloned = normalizeProposal({
      proposalName: `${base.proposalName} Copy`,
      client: assign.client || "",
      pic: assign.pic || "",
      category: base.category,
      topics: base.topics,
      audiences: base.audiences,
      duration: base.duration,
      price: base.price,
      status: "Draft",
      outcomes: base.outcomes,
      followUpDate: "",
      proposalFile: "",
      remarks: base.remarks,
    });

    if (!pool) {
      const item = { id: memory.proposals.length + 1, proposalId: nextProposalId(), ...cloned };
      memory.proposals.push(item);
      writeProposalStore();
      return res.status(201).json(item);
    }

    const { rows: lastRows } = await query("SELECT proposal_id FROM proposals ORDER BY proposal_id DESC LIMIT 1");
    const lastNumber = Number(String(lastRows[0]?.proposal_id || "PROP-0000").replace("PROP-", "")) || 0;
    const proposalId = `PROP-${String(lastNumber + 1).padStart(4, "0")}`;
    const { rows } = await query(
      `INSERT INTO proposals
        (proposal_id, proposal_name, client, pic, category, topics, audiences, duration, price, status, outcomes, follow_up_date, proposal_file, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        proposalId,
        cloned.proposalName,
        cloned.client,
        cloned.pic,
        cloned.category,
        cloned.topics,
        cloned.audiences,
        cloned.duration,
        cloned.price,
        cloned.status,
        cloned.outcomes,
        null,
        cloned.proposalFile,
        cloned.remarks,
      ],
    );
    res.status(201).json(toProposal(rows[0]));
  } catch (error) {
    next(error);
  }
});

app.get("/api/proposals/:id/pdf", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    let proposal;
    let school = null;
    if (!pool) {
      proposal = memory.proposals.find((item) => item.id === id);
      school = findSchoolByName(proposal?.client);
    } else {
      const proposalResult = await query("SELECT * FROM proposals WHERE id = $1", [id]);
      if (proposalResult.rows.length) {
        proposal = toProposal(proposalResult.rows[0]);
        const schoolResult = await query("SELECT * FROM schools WHERE lower(name) = lower($1) LIMIT 1", [proposal.client]);
        school = schoolResult.rows[0] ? toSchool(schoolResult.rows[0]) : null;
      }
    }
    if (!proposal) return res.status(404).json({ error: "Proposal not found." });

    const pdf = buildPdf(proposalLines(proposal, school));
    const filename = `${proposal.proposalId}-${proposal.proposalName}`.replace(/[^a-z0-9_-]+/gi, "-").replace(/-+/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.pdf"`);
    res.send(pdf);
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
