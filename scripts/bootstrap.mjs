import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { readFile } from "node:fs/promises";

const databaseUrl = process.env.DATABASE_URL;
const username = process.env.ADMIN_USERNAME?.trim();
const password = process.env.ADMIN_PASSWORD;

if (!databaseUrl || !username || !password) {
  throw new Error("Set DATABASE_URL, ADMIN_USERNAME, and ADMIN_PASSWORD before bootstrapping.");
}
if (password.length < 12) {
  throw new Error("ADMIN_PASSWORD must be at least 12 characters.");
}
if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username)) {
  throw new Error("ADMIN_USERNAME must be 3–64 letters, numbers, dots, underscores, or hyphens.");
}

const sql = neon(databaseUrl);
const schema = await readFile(new URL("../database/schema.sql", import.meta.url), "utf8");
for (const statement of schema.split(";").map(part => part.trim()).filter(Boolean)) {
  await sql.query(statement);
}

const services = [
  ["svc-seo", "SEO", "Monthly SEO retainer", 15000],
  ["svc-social", "Social Media Management", "Posts, reels, community", 20000],
  ["svc-ads", "Google Ads Management", "Search + display campaigns", 12000],
  ["svc-web", "Website Development", "Business website", 50000],
  ["svc-content", "Content Writing", "Blogs & copy", 8000],
  ["svc-brand", "Branding", "Logo & brand kit", 25000]
].map(([id, name, desc, price]) => ({ id, name, desc, price }));
const initialState = {
  services,
  clients: [],
  projects: [],
  tasks: [],
  costs: [],
  payments: [],
  dash: {}
};

const passwordHash = await bcrypt.hash(password, 12);
await sql.transaction([
  sql`INSERT INTO app_state (id, data) VALUES (1, ${JSON.stringify(initialState)}::jsonb) ON CONFLICT (id) DO NOTHING`,
  sql`INSERT INTO auth_users (username, password_hash, role)
      VALUES (${username}, ${passwordHash}, 'admin')
      ON CONFLICT DO NOTHING`
]);

const [admin] = await sql`SELECT role FROM auth_users WHERE lower(username) = lower(${username})`;
if (!admin || admin.role !== "admin") {
  throw new Error("The requested admin username is already assigned to a client account.");
}

console.log("Database schema and initial state are ready. Existing state and accounts were not overwritten.");
