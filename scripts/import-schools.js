import fs from "node:fs";
import pg from "pg";

const { Pool } = pg;
const file = process.argv[2];

if (!file) {
  console.error("Usage: node scripts/import-schools.js crm_school_pipeline_import.csv");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
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

const [header, ...records] = parseCsv(fs.readFileSync(file, "utf8"));
const index = Object.fromEntries(header.map((name, i) => [name, i]));
const asInt = (value) => Number.parseInt(value || "0", 10) || 0;
const asDate = (value) => value || null;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

await pool.query(`
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

await pool.query(`
  CREATE UNIQUE INDEX IF NOT EXISTS schools_name_city_state_unique
  ON schools (name, city, state)
`);

let imported = 0;
for (const record of records) {
  const value = (name) => record[index[name]] || "";
  await pool.query(
    `INSERT INTO schools
      (name, cat, city, state, status, heat, pic, pic_role, source, last_contact, next_follow_up, deal_size, remarks)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (name, city, state)
     DO UPDATE SET
      cat = EXCLUDED.cat,
      status = EXCLUDED.status,
      heat = EXCLUDED.heat,
      pic = EXCLUDED.pic,
      pic_role = EXCLUDED.pic_role,
      source = EXCLUDED.source,
      last_contact = EXCLUDED.last_contact,
      next_follow_up = EXCLUDED.next_follow_up,
      deal_size = EXCLUDED.deal_size,
      remarks = EXCLUDED.remarks,
      updated_at = NOW()`,
    [
      value("name"),
      value("category"),
      value("city"),
      value("state"),
      value("status") || "Not Contacted",
      value("heat") || "Cool",
      value("pic"),
      value("pic_role"),
      value("source") || "Web crawl",
      asDate(value("last_contact")),
      asDate(value("next_follow_up")),
      asInt(value("deal_size")),
      [value("remarks"), value("phone") && `Phone: ${value("phone")}`, value("email") && `Email: ${value("email")}`]
        .filter(Boolean)
        .join(" | "),
    ],
  );
  imported += 1;
}

await pool.end();
console.log(`Imported ${imported} schools from ${file}.`);
