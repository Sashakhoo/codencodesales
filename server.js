import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import AdmZip from "adm-zip";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;
const schoolImportFile = path.join(__dirname, "crm_school_pipeline_import.csv");
const proposalStoreFile = path.join(__dirname, "proposals_store.json");
const schoolEventProposalTemplateFile = path.join(__dirname, "proposal_templates", "CodeNCode_School_Event_Proposal_Template.docx");
const premiumProposalTemplateFile = path.join(__dirname, "proposal_templates", "CodeNCode_Premium_Proposal_Template.docx");
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

function xmlEscape(text) {
  return ascii(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function cleanList(items) {
  return [...new Set(items.filter(Boolean))];
}

function hasAny(text, terms) {
  const value = String(text || "").toLowerCase();
  return terms.some((term) => value.includes(term));
}

function inferProposalCategory(prompt, override = "") {
  if (proposalCategories.includes(override)) return override;
  if (hasAny(prompt, ["teacher", "cpd", "educator", "staff training for teachers"])) return "Teacher Training";
  if (hasAny(prompt, ["holiday", "camp", "school break", "semester break"])) return "Holiday Program";
  if (hasAny(prompt, ["corporate", "company", "workplace", "staff", "employee"])) return "Corporate Training";
  if (hasAny(prompt, ["competition", "hackathon", "event", "showcase"])) return "Competition/Event";
  if (hasAny(prompt, ["python", "coding", "website", "app", "game", "scratch", "programming"])) return "Coding Workshop";
  if (hasAny(prompt, ["ai", "artificial intelligence", "prompt", "chatbot", "content creation", "automation"])) return "AI Workshop";
  if (hasAny(prompt, ["career", "exposure", "pathway", "future career"])) return "Career Exposure";
  return "Custom Program";
}

function inferProposalTopics(category, prompt) {
  const topics = [];
  if (hasAny(prompt, ["introduction to ai", "ai literacy", "basic ai", "intro ai"])) topics.push("Introduction to AI");
  if (hasAny(prompt, ["prompt", "chatgpt", "gemini"])) topics.push("AI Prompt Engineering");
  if (hasAny(prompt, ["chatbot", "bot"])) topics.push("Build AI Chatbot");
  if (hasAny(prompt, ["content", "marketing", "poster", "copywriting"])) topics.push("AI Content Creation");
  if (hasAny(prompt, ["workplace", "productivity", "automation", "office"])) topics.push("AI for Workplace");
  if (hasAny(prompt, ["python"])) topics.push("Python Fundamentals");
  if (hasAny(prompt, ["website", "web page", "html", "css"])) topics.push("Build a Website");
  if (hasAny(prompt, ["app", "mobile"])) topics.push("App Development");
  if (hasAny(prompt, ["game", "pygame", "scratch"])) topics.push("Game Development");
  if (!topics.length && ["AI Workshop", "Teacher Training", "Corporate Training"].includes(category)) {
    topics.push("Introduction to AI", "AI Prompt Engineering");
  }
  if (!topics.length && ["Coding Workshop", "Holiday Program"].includes(category)) {
    topics.push("Python Fundamentals", "Build a Website");
  }
  if (!topics.length && category === "Career Exposure") topics.push("Introduction to AI", "Python Fundamentals");
  return cleanList(topics);
}

function inferProposalAudiences(prompt, school, override = "") {
  if (override) return [override];
  const audiences = [];
  const name = `${school?.name || ""} ${school?.cat || ""}`;
  if (hasAny(prompt, ["teacher", "educator", "school staff"]) || hasAny(name, ["teacher"])) audiences.push("Teachers");
  if (hasAny(prompt, ["parent"])) audiences.push("Parents");
  if (hasAny(prompt, ["university", "college"])) audiences.push("University");
  if (hasAny(prompt, ["pre-u", "pre u", "a level", "foundation"])) audiences.push("Pre-U");
  if (hasAny(prompt, ["primary", "standard 4", "standard 5", "standard 6"]) || hasAny(name, ["primary", "sjkc", "sk "])) audiences.push("Primary School");
  if (hasAny(prompt, ["lower secondary", "form 1", "form 2", "form 3"])) audiences.push("Lower Secondary");
  if (hasAny(prompt, ["upper secondary", "form 4", "form 5", "spm", "igcse"])) audiences.push("Upper Secondary");
  if (hasAny(prompt, ["working adult", "staff", "employee", "corporate"])) audiences.push("Working Adults");
  if (!audiences.length && hasAny(name, ["international"])) audiences.push("Lower Secondary", "Upper Secondary");
  if (!audiences.length && hasAny(name, ["smk", "smjk", "secondary", "high school"])) audiences.push("Lower Secondary", "Upper Secondary");
  if (!audiences.length) audiences.push("Upper Secondary");
  return cleanList(audiences);
}

function inferProposalDuration(prompt, override = "") {
  const allowed = ["1 Hour Talk", "2 Hour Workshop", "Half Day", "Full Day", "4 Weeks", "8 Weeks"];
  if (allowed.includes(override)) return override;
  if (hasAny(prompt, ["8 week", "eight week"])) return "8 Weeks";
  if (hasAny(prompt, ["4 week", "four week", "month"])) return "4 Weeks";
  if (hasAny(prompt, ["full day", "1 day", "one day"])) return "Full Day";
  if (hasAny(prompt, ["half day"])) return "Half Day";
  if (hasAny(prompt, ["2 hour", "two hour"])) return "2 Hour Workshop";
  if (hasAny(prompt, ["1 hour", "one hour", "talk", "assembly"])) return "1 Hour Talk";
  return "2 Hour Workshop";
}

function inferProposalPrice(duration, category, override) {
  const parsed = Number(override);
  if (parsed > 0) return parsed;
  const byDuration = {
    "1 Hour Talk": 1200,
    "2 Hour Workshop": 2500,
    "Half Day": 3500,
    "Full Day": 6800,
    "4 Weeks": 7200,
    "8 Weeks": 12800,
  };
  const base = byDuration[duration] || 2500;
  return category === "Corporate Training" ? Math.round(base * 1.25) : base;
}

function inferProposalOutcomes(category, topics, prompt) {
  const outcomes = [];
  if (category.includes("AI") || topics.some((topic) => topic.includes("AI"))) outcomes.push("AI Literacy", "Future Skills");
  if (topics.some((topic) => ["Python Fundamentals", "Build a Website", "App Development", "Game Development"].includes(topic))) outcomes.push("Coding Fundamentals", "Problem Solving", "STEM");
  if (hasAny(prompt, ["creative", "content", "app", "website", "game"])) outcomes.push("Digital Creativity");
  if (hasAny(prompt, ["business", "startup", "entrepreneur"])) outcomes.push("Entrepreneurship");
  if (category === "Career Exposure" || hasAny(prompt, ["career", "future job"])) outcomes.push("Career Readiness");
  if (!outcomes.length) outcomes.push("Future Skills", "Problem Solving");
  return cleanList(outcomes);
}

function buildGeneratedProposal(data, school = null) {
  const prompt = data.prompt || data.notes || data.remarks || "";
  const client = data.client || data.school || school?.name || "";
  const category = inferProposalCategory(prompt, data.category);
  const topics = inferProposalTopics(category, prompt);
  const audiences = inferProposalAudiences(prompt, school, data.audience);
  const duration = inferProposalDuration(prompt, data.duration);
  const price = inferProposalPrice(duration, category, data.price);
  const outcomes = inferProposalOutcomes(category, topics, prompt);
  const fit = school
    ? `Matched school profile: ${school.name}, ${school.city || "city TBC"}, ${school.state || "state TBC"} (${school.cat || "type TBC"}).`
    : "No exact school profile matched yet; assign account details before sending.";
  const request = prompt ? `Prompt/request: ${prompt}` : "Prompt/request: Auto-generated from school name and default codencode proposal structure.";
  return {
    proposalName: `${client || "New Client"} - ${category} Proposal`,
    client,
    pic: data.pic || school?.pic || "",
    category,
    topics,
    audiences,
    duration,
    price,
    status: "Draft",
    outcomes,
    followUpDate: "",
    proposalFile: "",
    remarks: `${fit}\n${request}\nGenerated sections follow Type A/B/J/F/I proposal structure.`,
  };
}

function proposalTemplateSections(proposal, school) {
  const client = proposal.client || "Client / School";
  const audiences = (proposal.audiences || []).join(", ") || "target participants";
  const topics = proposal.topics || [];
  const outcomes = proposal.outcomes || [];
  const schoolType = school?.cat || "education partner";
  const deliveryMode = proposal.duration === "1 Hour Talk" ? "Physical or online talk" : "Physical or online workshop";
  const participantCapacity = proposal.duration?.includes("Weeks") ? "Cohort size to be confirmed" : "30-80 participants recommended";
  return [
    {
      type: "A",
      title: "1. Executive Summary",
      lines: [
        school
          ? `${school.name} is a ${schoolType} in ${school.city}, ${school.state}. The proposal should position codencode.my as an enrichment partner that can adapt to school timetable, venue, and student readiness.`
          : `${client} requires a concise, adaptable proposal that can be finalised once participant level, preferred language, venue, and group size are confirmed.`,
        `This proposal recommends a ${proposal.category} for ${audiences}, focused on ${topics.join(", ") || "future-ready digital skills"}.`,
        `Expected outcome: participants gain practical confidence in ${outcomes.join(", ") || "AI literacy, coding, and problem solving"} through guided hands-on learning.`,
        "The program can be customised to school timetable, participant readiness, preferred language, venue, and final group size.",
      ],
    },
    {
      type: "B",
      title: "2. About CodeNCode and Why This Matters",
      lines: [
        "CodeNCode delivers beginner-friendly coding, AI, and digital skills programs for schools, parents, students, and working adults.",
        "Mission: make future-ready technology education practical, accessible, and confidence-building for learners with different starting points.",
        "Why it matters: AI literacy and coding exposure help students understand digital transformation, future careers, and responsible technology use.",
        "Differentiator 1 - Trilingual delivery: English, Mandarin, or Bahasa Melayu can be used based on participant preference.",
        "Differentiator 2 - Beginner-safe pacing: activities are scaffolded so first-time learners can participate without prior coding experience.",
        "Differentiator 3 - Project-based output: every session is designed around a tangible mini outcome instead of passive lecture only.",
      ],
    },
    {
      type: "J",
      title: "3. Proposed Workshop / Event Overview",
      lines: [
        `Program title: ${proposal.proposalName}.`,
        `Training audience: ${audiences}.`,
        `Duration: ${proposal.duration || "To be confirmed"}.`,
        `Delivery mode: ${deliveryMode}.`,
        `Venue: ${school ? `${school.name} campus or online` : "Client venue or online"}.`,
        `Expected participants: ${participantCapacity}.`,
        `Core topic plan: ${topics.length ? topics.join(" | ") : "Topic mix to be confirmed"}.`,
      ],
    },
    {
      type: "J",
      title: "4. Learning Outcomes and Workshop Modules",
      lines: [
        `Learning outcomes: ${(outcomes.length ? outcomes : ["AI Literacy", "Future Skills", "Problem Solving"]).join(", ")}.`,
        ...topics.map((topic) => `${topic}: ${topicPlan(topic)}`),
        "Module 1 - Introduction: set context, key concepts, and learner goals.",
        "Module 2 - Hands-on activity: guided practice with facilitator support.",
        "Module 3 - Project building: participants create a simple output linked to the topic.",
        "Module 4 - Showcase and Q&A: reflection, sharing, and next-step guidance.",
      ],
    },
    {
      type: "F",
      title: "5. Sample Program Schedule and Deliverables",
      lines: [
        "Opening: welcome, objectives, and relevance to students or staff.",
        "Concept briefing: short explanation with real-life examples.",
        "Practical build: guided activity, project work, and facilitator checkpoints.",
        "Showcase: selected participant outputs, Q&A, feedback, and next steps.",
        "Deliverables: training materials, certificate of participation, project files, attendance or feedback summary, and optional post-event support.",
      ],
    },
    {
      type: "I",
      title: "6. Pricing Package and Customisation Options",
      lines: [
        `Investment: RM ${Number(proposal.price || 0).toLocaleString()}.`,
        `Package basis: ${proposal.duration || "duration to be confirmed"} for ${audiences}.`,
        "Customisation options: school-specific projects, STEM integration, AI competition format, career talk add-on, or holiday camp format.",
        "Qualitative value: participants leave with clearer digital confidence, practical vocabulary, and a stronger sense of how coding/AI applies to study or work.",
      ],
    },
    {
      type: "I",
      title: "7. Requirements, Terms, and Acceptance",
      lines: [
        "Equipment requirements: internet access, projector/screen, suitable venue setup, and laptops/tablets where hands-on activities require devices.",
        "Payment terms, cancellation policy, minimum participant count, trainer assignment, event date, photos, and testimonials can be finalised before confirmation.",
        "Acceptance fields: school representative name, position, signature, date, final event date, pricing confirmation, and trainer assigned.",
        "Next steps: confirm date, group size, language, and approval pathway; codencode.my will issue the final PDF and invoice after confirmation.",
      ],
    },
  ];
}

function proposalLines(proposal, school) {
  const client = proposal.client || "Client / School";
  const schoolContext = school ? `${school.name}, ${school.city}, ${school.state}` : client;
  const audiences = (proposal.audiences || []).join(", ") || "Target audience to be confirmed";
  const topics = proposal.topics || [];
  const outcomes = proposal.outcomes || [];
  const templateSections = proposalTemplateSections(proposal, school);
  const today = new Date().toISOString().slice(0, 10);
  return [
    { text: "codencode.my", size: 20, font: "F2" },
    { text: "School Event / AI Workshop Proposal", size: 15, font: "F2" },
    { text: `${proposal.proposalId} | ${proposal.proposalName}`, size: 11, font: "F1" },
    { text: "", size: 8, font: "F1" },
    { text: "Prepared For", size: 13, font: "F2" },
    { text: schoolContext, size: 11, font: "F1" },
    { text: proposal.pic ? `PIC: ${proposal.pic}` : school?.pic ? `PIC: ${school.pic}` : "PIC: To be assigned", size: 11, font: "F1" },
    { text: school?.email ? `Contact: ${school.email}${school.phone ? ` | ${school.phone}` : ""}` : "", size: 10, font: "F1" },
    { text: `Prepared by: CodeNCode / codencode.my | Date: ${today}`, size: 10, font: "F1" },
    { text: "", size: 8, font: "F1" },
    { text: "Program Snapshot", size: 13, font: "F2" },
    { text: `Category: ${proposal.category}`, size: 11, font: "F1" },
    { text: `Audience: ${audiences}`, size: 11, font: "F1" },
    { text: `Duration: ${proposal.duration || "To be confirmed"}`, size: 11, font: "F1" },
    { text: `Investment: RM ${Number(proposal.price || 0).toLocaleString()}`, size: 11, font: "F1" },
    { text: `Workshop topics: ${topics.join(", ") || "To be confirmed"}`, size: 11, font: "F1" },
    { text: `Learning outcomes: ${outcomes.join(", ") || "To be confirmed"}`, size: 11, font: "F1" },
    { text: "", size: 8, font: "F1" },
    { text: "Template Reference", size: 13, font: "F2" },
    {
      text: "This proposal follows the CodeNCode school event and premium AI workshop templates: executive summary, company profile, event overview, outcomes, modules, deliverables, pricing, requirements, terms, and acceptance.",
      size: 11,
      font: "F1",
    },
    {
      text: "It also applies the section-type guide: A for client understanding, B for strategy, J for training design, F for schedule/WBS, and I for outcomes/value.",
      size: 11,
      font: "F1",
    },
    { text: "", size: 8, font: "F1" },
    ...templateSections.flatMap((section) => [
      { text: `${section.title} (Type ${section.type})`, size: 13, font: "F2" },
      ...section.lines.map((line) => ({ text: `- ${line}`, size: 10, font: "F1" })),
      { text: "", size: 8, font: "F1" },
    ]),
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

function selectProposalDocxTemplate(proposal) {
  if (["AI Workshop", "Teacher Training", "Corporate Training"].includes(proposal.category)) {
    return premiumProposalTemplateFile;
  }
  return schoolEventProposalTemplateFile;
}

function replaceXmlText(xml, replacements) {
  let output = xml;
  for (const [find, replace] of replacements) {
    output = output.split(find).join(xmlEscape(replace));
  }
  return output;
}

function proposalDocxReplacements(proposal, school) {
  const client = proposal.client || "Client / School";
  const schoolContext = school ? `${school.name}, ${school.city}, ${school.state}` : client;
  const audiences = (proposal.audiences || []).join(", ") || "Target audience to be confirmed";
  const topics = proposal.topics || [];
  const outcomes = proposal.outcomes || [];
  const today = new Date().toISOString().slice(0, 10);
  const venue = school ? `${school.name} campus or online` : "Client venue or online";
  const participants = proposal.duration?.includes("Weeks") ? "Cohort size to be confirmed" : "30-80 participants recommended";
  const summary = `CodeNCode proposes ${proposal.proposalName} for ${schoolContext}. The program is designed for ${audiences}, with practical activities around ${topics.join(", ") || "coding and AI"} and expected outcomes in ${outcomes.join(", ") || "future-ready digital skills"}.`;
  const about = "CodeNCode delivers beginner-friendly coding, AI, and digital skills programs for schools, students, parents, teachers, and working adults. Our approach combines clear explanation, guided hands-on practice, and project-based outputs.";
  const whyAi = "AI literacy, coding exposure, and digital confidence are now essential future skills. This program helps participants understand technology concepts, practise responsible tool use, and connect learning to study, work, and future careers.";
  const overview = `${proposal.proposalName} | Audience: ${audiences} | Duration: ${proposal.duration || "To be confirmed"} | Venue: ${venue} | Participants: ${participants} | Mode: Physical or online`;
  const learning = `Participants will understand ${topics.join(", ") || "AI and coding concepts"}, complete guided activities, and develop ${outcomes.join(", ") || "problem-solving and digital creativity"} skills.`;
  const schedule = `Opening and objectives | Concept briefing | Hands-on project build | Showcase and Q&A | Feedback and next steps`;
  const deliverables = "Training materials, certificate of participation, project files, attendance/feedback summary, and optional post-event support.";
  const pricing = `Recommended package: ${proposal.duration || "To be confirmed"} | ${participants} | RM ${Number(proposal.price || 0).toLocaleString()}`;
  const requirements = "Internet access, projector/screen, suitable venue setup, and laptops/tablets where hands-on activities require devices.";
  const terms = "Payment schedule, cancellation policy, minimum participants, trainer assignment, event date, photos, and testimonials to be confirmed before final approval.";
  const topicLine = topics.length ? topics.map((topic) => `- ${topic}`).join(" ") : "- Topic mix to be confirmed";
  return [
    ["CodeNCode School Event Proposal Template", "CodeNCode School Event Proposal"],
    ["Professional Template for Schools, Colleges &amp; Educational Institutions", `${proposal.proposalId} | Prepared for ${schoolContext}`],
    ["CodeNCodeSchool AI Workshop Proposal Template", "CodeNCode School AI Workshop Proposal"],
    ["School AI Workshop Proposal Template", "School AI Workshop Proposal"],
    ["Prepared For: [School Name]", `Prepared For: ${schoolContext}`],
    ["Date: [Date]", `Date: ${today}`],
    ["Contact: [Phone] | [Email] | [Website]", "Contact: +60 113 165 2854 | codencodemy@gmail.com | codencode.my"],
    ["Brief introduction of CodeNCode, objectives of the workshop/event, and expected outcomes.", summary],
    ["Introduce CodeNCode, the proposed workshop, objectives, expected outcomes, and benefits to students.", summary],
    ["Company background, mission, achievements, trainer profiles, previous schools served.", about],
    ["Company profile, mission, vision, achievements, trainer credentials, and previous collaborations.", about],
    ["Importance of AI literacy, future careers, digital transformation, and industry relevance.", whyAi],
    ["Event Name", `Event Name: ${proposal.proposalName}`],
    ["Target Audience", `Target Audience: ${audiences}`],
    ["Duration", `Duration: ${proposal.duration || "To be confirmed"}`],
    ["Mode (Physical/Online)", "Mode: Physical or online"],
    ["Venue", `Venue: ${venue}`],
    ["Expected Participants", `Expected Participants: ${participants}`],
    ["Workshop title, target audience, duration, venue, participant capacity, delivery mode.", overview],
    ["• Understand AI concepts", `- Understand ${topics[0] || "AI and coding"} concepts`],
    ["• Build practical projects", "- Build practical mini projects"],
    ["• Improve digital literacy", "- Improve digital literacy"],
    ["• Develop future-ready skills", `- Develop ${outcomes.join(", ") || "future-ready skills"}`],
    ["Students will understand AI concepts, create projects, and develop problem-solving skills.", learning],
    ["• Build Your First AI App", topicLine],
    ["• Intro to AI Creation", ""],
    ["• Build a Website in 2 Hours", ""],
    ["• AI for Future Creators", ""],
    ["• AI for Workplace", ""],
    ["• Career Exposure: Future Jobs &amp; AI", ""],
    ["Time | Activity | Learning Outcome", schedule],
    ["Module 1: Introduction", "Module 1: Introduction and context setting"],
    ["Module 2: Hands-On Activity", "Module 2: Guided hands-on activity"],
    ["Module 3: Project Building", "Module 3: Project building and facilitator support"],
    ["Module 4: Showcase &amp; Q&amp;A", "Module 4: Showcase, Q&amp;A, and feedback"],
    ["Training materialsCertificate of ParticipationProject filesPost-event support", deliverables],
    ["Training materials, certificates, project files, attendance report, post-event support.", deliverables],
    ["Package Name | Duration | Participants | Fee", pricing],
    ["Package A – 2 HoursPackage B – Half DayPackage C – Full DayPackage D – Holiday Camp", pricing],
    ["Industry-relevant curriculum, hands-on learning, experienced trainers, customizable content.", "Industry-relevant curriculum, hands-on learning, experienced trainers, trilingual delivery options, and customisable school content."],
    ["Photos, feedback, school references, success stories.", "Photos, participant feedback, school references, and success stories can be inserted before final sending."],
    ["Insert photos, testimonials, participant feedback, and school references.", "Insert photos, testimonials, participant feedback, and school references before final sending."],
    ["School-specific projects, STEM integration, AI competitions, career talks.", "School-specific projects, STEM integration, AI competitions, career talks, holiday programs, and teacher training adaptations."],
    ["Internet, projector, laptops/tablets, venue setup requirements.", requirements],
    ["Payment terms, cancellation policy, equipment requirements.", terms],
    ["Payment schedule, cancellation policy, minimum participants.", terms],
    ["School Representative Name:", "School Representative Name:"],
    ["☐ School Name Updated", `[ ] School Name Updated: ${client}`],
    ["☐ Event Date Updated", "[ ] Event Date Updated"],
    ["☐ Pricing Updated", `[ ] Pricing Updated: RM ${Number(proposal.price || 0).toLocaleString()}`],
    ["☐ Trainer Assigned", "[ ] Trainer Assigned"],
    ["☐ Acceptance Page Completed", "[ ] Acceptance Page Completed"],
  ];
}

function buildProposalDocx(proposal, school) {
  const templateFile = selectProposalDocxTemplate(proposal);
  if (!fs.existsSync(templateFile)) throw new Error("Proposal DOCX template is missing.");
  const zip = new AdmZip(templateFile);
  const documentXml = zip.readAsText("word/document.xml");
  const nextXml = replaceXmlText(documentXml, proposalDocxReplacements(proposal, school));
  zip.updateFile("word/document.xml", Buffer.from(nextXml, "utf8"));
  return zip.toBuffer();
}

function buildProposalPdf(proposal, school) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 46;
  const colors = {
    dark: [0.04, 0.09, 0.16],
    green: [0.07, 0.65, 0.45],
    teal: [0.18, 0.72, 0.66],
    soft: [0.95, 0.98, 0.97],
    line: [0.82, 0.87, 0.9],
    muted: [0.36, 0.4, 0.48],
    gold: [0.74, 0.57, 0.18],
    white: [1, 1, 1],
  };
  const client = proposal.client || "Client / School";
  const schoolContext = school ? `${school.name}, ${school.city}, ${school.state}` : client;
  const audiences = (proposal.audiences || []).join(", ") || "Target audience to be confirmed";
  const topics = proposal.topics || [];
  const outcomes = proposal.outcomes || [];
  const sections = proposalTemplateSections(proposal, school);
  const today = new Date().toISOString().slice(0, 10);
  const pages = [[]];
  let pageIndex = 0;
  let y = pageHeight - margin;

  const rgb = (color, op = "rg") => `${color.map((value) => value.toFixed(3)).join(" ")} ${op}`;
  const command = (value) => pages[pageIndex].push(value);
  const rect = (x, ry, width, height, color, stroke = false) => {
    command(`q ${rgb(color, stroke ? "RG" : "rg")} ${x} ${ry} ${width} ${height} re ${stroke ? "S" : "f"} Q`);
  };
  const line = (x1, y1, x2, y2, color = colors.line, width = 1) => {
    command(`q ${rgb(color, "RG")} ${width} w ${x1} ${y1} m ${x2} ${y2} l S Q`);
  };
  const text = (value, x, ty, size = 10, font = "F1", color = colors.dark) => {
    command(`BT /${font} ${size} Tf ${rgb(color)} ${x} ${ty} Td (${pdfEscape(value)}) Tj ET`);
  };
  const widthToChars = (width, size) => Math.max(24, Math.floor(width / (size * 0.48)));
  const paragraph = (value, x, width, size = 10, font = "F1", color = colors.dark, gap = 4) => {
    const lines = wrapText(value, widthToChars(width, size));
    lines.forEach((item) => {
      if (y < 90) addPage();
      text(item, x, y, size, font, color);
      y -= size + gap;
    });
  };
  const bullet = (value, x, width) => {
    if (y < 96) addPage();
    text("-", x, y, 10, "F2", colors.green);
    const startY = y;
    y = startY;
    paragraph(value, x + 14, width - 14, 10, "F1", colors.dark, 4);
  };
  const sectionTitle = (title, type = "") => {
    if (y < 132) addPage();
    y -= 10;
    rect(margin, y - 22, pageWidth - margin * 2, 30, colors.soft);
    rect(margin, y - 22, 5, 30, colors.green);
    text(title, margin + 14, y - 4, 13, "F2", colors.dark);
    if (type) text(`Type ${type}`, pageWidth - margin - 48, y - 4, 9, "F2", colors.green);
    y -= 42;
  };
  const keyValue = (label, value, x, ry, width) => {
    text(label, x, ry + 23, 8, "F2", colors.muted);
    paragraph(String(value || "To be confirmed"), x, width, 11, "F2", colors.dark, 4);
  };
  function addPage() {
    pageIndex += 1;
    pages.push([]);
    y = pageHeight - margin;
    rect(0, pageHeight - 34, pageWidth, 34, colors.dark);
    text("codencode.my", margin, pageHeight - 22, 12, "F2", colors.white);
    text(proposal.proposalId || "Proposal", pageWidth - margin - 80, pageHeight - 22, 9, "F1", colors.white);
    y -= 32;
  }

  rect(0, pageHeight - 76, pageWidth, 76, colors.dark);
  rect(0, pageHeight - 82, pageWidth, 6, colors.green);
  text("codencode.my", margin, pageHeight - 45, 26, "F2", colors.white);
  text("School Event / AI Workshop Proposal", margin, pageHeight - 112, 20, "F2", colors.dark);
  text(proposal.proposalName || "Proposal", margin, pageHeight - 140, 13, "F1", colors.muted);
  line(margin, pageHeight - 158, pageWidth - margin, pageHeight - 158, colors.green, 2);

  rect(margin, pageHeight - 318, pageWidth - margin * 2, 118, colors.soft);
  text("Prepared For", margin + 20, pageHeight - 230, 10, "F2", colors.green);
  y = pageHeight - 258;
  paragraph(schoolContext, margin + 20, pageWidth - margin * 2 - 40, 17, "F2", colors.dark, 6);
  text(proposal.pic ? `PIC: ${proposal.pic}` : school?.pic ? `PIC: ${school.pic}` : "PIC: To be assigned", margin + 20, pageHeight - 294, 11, "F1", colors.muted);
  text(`Prepared by CodeNCode | ${today}`, margin + 20, pageHeight - 312, 10, "F1", colors.muted);

  const cardY = pageHeight - 520;
  const cardW = (pageWidth - margin * 2 - 18) / 2;
  rect(margin, cardY, cardW, 120, colors.white, true);
  rect(margin + cardW + 18, cardY, cardW, 120, colors.white, true);
  y = cardY + 88;
  keyValue("CATEGORY", proposal.category, margin + 16, y, cardW - 32);
  y = cardY + 45;
  keyValue("AUDIENCE", audiences, margin + 16, y, cardW - 32);
  y = cardY + 88;
  keyValue("DURATION", proposal.duration || "To be confirmed", margin + cardW + 34, y, cardW - 32);
  y = cardY + 45;
  keyValue("INVESTMENT", `RM ${Number(proposal.price || 0).toLocaleString()}`, margin + cardW + 34, y, cardW - 32);

  y = pageHeight - 585;
  sectionTitle("Proposal Checklist");
  ["School Name Updated", "Event Date Updated", "Pricing Updated", "Trainer Assigned", "Acceptance Page Completed"].forEach((item) => {
    text("[ ]", margin + 8, y, 10, "F2", colors.green);
    text(item, margin + 34, y, 10, "F1", colors.dark);
    y -= 20;
  });

  addPage();
  sectionTitle("Program Snapshot");
  [
    `Workshop topics: ${topics.join(", ") || "To be confirmed"}.`,
    `Learning outcomes: ${outcomes.join(", ") || "To be confirmed"}.`,
    "Reference format: CodeNCode school event proposal and premium AI workshop proposal.",
  ].forEach((item) => bullet(item, margin, pageWidth - margin * 2));

  sections.forEach((section) => {
    sectionTitle(section.title, section.type);
    section.lines.forEach((item) => bullet(item, margin, pageWidth - margin * 2));
  });

  sectionTitle("Acceptance Form");
  const acceptanceRows = ["School Representative Name", "Position", "Signature", "Date", "Final Event Date"];
  acceptanceRows.forEach((label) => {
    if (y < 100) addPage();
    text(`${label}:`, margin, y, 10, "F2", colors.dark);
    line(margin + 170, y - 2, pageWidth - margin, y - 2, colors.line, 1);
    y -= 30;
  });
  if (proposal.remarks) {
    sectionTitle("Internal Remarks");
    paragraph(proposal.remarks, margin, pageWidth - margin * 2, 9, "F1", colors.muted, 4);
  }

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
    const stream = page.join("\n");
    const contentId = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
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

app.post("/api/proposals/generate", async (req, res, next) => {
  try {
    const input = req.body || {};
    let school = null;
    const schoolName = input.school || input.client || "";
    if (!pool) {
      school = findSchoolByName(schoolName);
    } else if (schoolName) {
      const schoolResult = await query("SELECT * FROM schools WHERE lower(name) = lower($1) LIMIT 1", [schoolName]);
      school = schoolResult.rows[0] ? toSchool(schoolResult.rows[0]) : null;
    }
    const proposal = normalizeProposal(buildGeneratedProposal(input, school));

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
        null,
        proposal.proposalFile,
        proposal.remarks,
      ],
    );
    res.status(201).json(toProposal(rows[0]));
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

app.get("/api/proposals/:id/docx", async (req, res, next) => {
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

    const docx = buildProposalDocx(proposal, school);
    const filename = `${proposal.proposalId}-${proposal.proposalName}`.replace(/[^a-z0-9_-]+/gi, "-").replace(/-+/g, "-");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.docx"`);
    res.send(docx);
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

    const pdf = buildProposalPdf(proposal, school);
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
