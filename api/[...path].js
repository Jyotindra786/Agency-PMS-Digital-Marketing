import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const SESSION_COOKIE = "pms_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const DASHBOARD_WIDGETS = new Set(["clients", "active", "done", "tasks", "cost", "paid", "out", "rev"]);
let sql;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function database() {
  if (!process.env.DATABASE_URL) throw new HttpError(503, "Database is not configured.");
  return sql ||= neon(process.env.DATABASE_URL);
}

function json(res, status, value, headers = {}) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.statusCode = status;
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.end(JSON.stringify(value));
}

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      throw new HttpError(400, "Invalid JSON request.");
    }
  }
  return req.body;
}

function ensureSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "Request origin is not allowed.");
  }
  const requestHost = req.headers["x-forwarded-host"] || req.headers.host;
  if (!requestHost || originHost !== requestHost) throw new HttpError(403, "Request origin is not allowed.");
}

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new HttpError(503, "Session signing secret is not configured.");
  return value;
}

function cookieValue(req) {
  const cookie = req.headers.cookie || "";
  const token = cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`));
  return token ? token.slice(SESSION_COOKIE.length + 1) : "";
}

function sign(payload) {
  const value = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(value).digest("base64url");
  return `${value}.${signature}`;
}

function verify(token) {
  if (!token) return null;
  const [value, signature, extra] = token.split(".");
  if (!value || !signature || extra) return null;
  const expected = createHmac("sha256", secret()).update(value).digest();
  let actual;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure}`);
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}

async function authenticatedUser(req) {
  const payload = verify(cookieValue(req));
  if (!payload?.sub) throw new HttpError(401, "Please sign in again.");
  const [user] = await database()`SELECT id, username, role, client_id FROM auth_users WHERE id = ${payload.sub}`;
  if (!user || user.role !== payload.role || user.client_id !== payload.clientId) {
    throw new HttpError(401, "Please sign in again.");
  }
  return user;
}

async function getState() {
  const [row] = await database()`SELECT data, revision FROM app_state WHERE id = 1`;
  if (!row) throw new HttpError(503, "Database has not been initialized. Run the database bootstrap script.");
  return row;
}

function clientState(data, user) {
  const client = data.clients.find(item => item.id === user.client_id);
  if (!client) throw new HttpError(403, "This client account is no longer active.");
  const permissions = client.perms || {};
  const canViewProjects = permissions.projects === "view" || permissions.projects === "edit";
  const canViewReports = permissions.reports === "view" || permissions.reports === "edit";
  const projectContext = ["services", "tasks", "costing", "payments"].some(key => permissions[key] === "view" || permissions[key] === "edit");
  const ownProjects = data.projects.filter(project => project.cid === client.id);
  const projects = canViewProjects || canViewReports
    ? ownProjects
    : projectContext ? ownProjects.map(project => permissions.services === "view" || permissions.services === "edit"
      ? { id: project.id, cid: project.cid, name: project.name, sids: project.sids }
      : { id: project.id, cid: project.cid, name: project.name }) : [];
  const projectIds = new Set(ownProjects.map(project => project.id));
  return {
    services: permissions.services === "view" || permissions.services === "edit" || canViewProjects || canViewReports ? data.services : [],
    clients: [client],
    projects,
    tasks: permissions.tasks === "view" || permissions.tasks === "edit" || canViewReports
      ? data.tasks.filter(task => projectIds.has(task.pid)) : [],
    costs: permissions.costing === "view" || permissions.costing === "edit" || canViewReports
      ? data.costs.filter(cost => projectIds.has(cost.pid)) : [],
    payments: permissions.payments === "view" || permissions.payments === "edit" || canViewReports
      ? data.payments.filter(payment => projectIds.has(payment.pid)) : [],
    dash: { [client.id]: data.dash?.[client.id] || [] }
  };
}

function validAppState(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if ("admin" in data || Object.keys(data).some(key => !["services", "clients", "projects", "tasks", "costs", "payments", "dash"].includes(key))) return false;
  if (!["services", "clients", "projects", "tasks", "costs", "payments"].every(key => Array.isArray(data[key]))) return false;
  if (data.clients.some(client => !client || typeof client !== "object" || "pw" in client || "password" in client || "password_hash" in client)) return false;
  if (!data.dash || typeof data.dash !== "object" || Array.isArray(data.dash)) return false;
  if (JSON.stringify(data).length > 1_000_000) throw new HttpError(413, "Application data exceeds the 1 MB limit.");
  return true;
}

function mergeClientState(current, requested, user) {
  if (!validAppState(requested)) throw new HttpError(400, "Invalid application data.");
  const before = clientState(current, user);
  const client = before.clients[0];
  if (!isDeepStrictEqual(requested.clients, before.clients) ||
      !isDeepStrictEqual(requested.services, before.services) ||
      !isDeepStrictEqual(requested.costs, before.costs) ||
      !isDeepStrictEqual(requested.payments, before.payments)) {
    throw new HttpError(403, "Your account cannot change this data.");
  }

  const projectEdit = client.perms?.projects === "edit";
  if (requested.projects.length !== before.projects.length) throw new HttpError(403, "Your account cannot add or remove projects.");
  const nextProjects = new Map(requested.projects.map(project => [project.id, project]));
  for (const previous of before.projects) {
    const next = nextProjects.get(previous.id);
    if (!next) throw new HttpError(403, "Your account cannot remove projects.");
    if (!projectEdit) {
      if (!isDeepStrictEqual(previous, next)) throw new HttpError(403, "Your account cannot change this project.");
      continue;
    }
    const oldWithoutNote = { ...previous };
    const newWithoutNote = { ...next };
    delete oldWithoutNote.note;
    delete newWithoutNote.note;
    if (!isDeepStrictEqual(oldWithoutNote, newWithoutNote) ||
        (!projectEdit && next.note !== previous.note) ||
        typeof next.note !== "string" || next.note.length > 4000) {
      throw new HttpError(403, "Your account cannot change this project.");
    }
  }

  const taskEdit = client.perms?.tasks === "edit";
  const oldTasks = new Map(before.tasks.map(task => [task.id, task]));
  const nextTasks = new Map(requested.tasks.map(task => [task.id, task]));
  if (nextTasks.size !== requested.tasks.length) throw new HttpError(400, "Duplicate task ID.");
  const allowedStatuses = new Set(["Pending", "In Progress", "Done"]);
  for (const [id, previous] of oldTasks) {
    const next = nextTasks.get(id);
    if (!next) throw new HttpError(403, "Your account cannot remove tasks.");
    const oldWithoutStatus = { ...previous };
    const newWithoutStatus = { ...next };
    delete oldWithoutStatus.status;
    delete newWithoutStatus.status;
    if (!isDeepStrictEqual(oldWithoutStatus, newWithoutStatus) ||
        (!taskEdit && next.status !== previous.status) ||
        !allowedStatuses.has(next.status)) {
      throw new HttpError(403, "Your account cannot change this task.");
    }
  }
  const projectIds = new Set(before.projects.map(project => project.id));
  const addedTasks = requested.tasks.filter(task => !oldTasks.has(task.id));
  if (addedTasks.length && !taskEdit) throw new HttpError(403, "Your account cannot add tasks.");
  for (const task of addedTasks) {
    if (!task.id || task.id.length > 64 || !projectIds.has(task.pid) || task.who !== "Client" ||
        task.status !== "Pending" || typeof task.title !== "string" || !task.title.trim() ||
        task.title.length > 300 || !/^\d{4}-\d{2}-\d{2}$/.test(task.due)) {
      throw new HttpError(400, "Invalid client task.");
    }
  }

  const ownDashboard = requested.dash?.[client.id] || [];
  if (Object.keys(requested.dash || {}).some(key => key !== client.id) ||
      !Array.isArray(ownDashboard) || ownDashboard.some(widget => !DASHBOARD_WIDGETS.has(widget))) {
    throw new HttpError(403, "Your account cannot change these dashboard settings.");
  }

  const merged = structuredClone(current);
  if (projectEdit) for (const project of merged.projects) {
    if (project.cid === client.id) project.note = nextProjects.get(project.id).note;
  }
  const requestedTaskMap = new Map(requested.tasks.map(task => [task.id, task]));
  for (const task of merged.tasks) {
    if (projectIds.has(task.pid)) task.status = requestedTaskMap.get(task.id).status;
  }
  merged.tasks.push(...addedTasks);
  merged.dash = { ...(merged.dash || {}), [client.id]: ownDashboard };
  return merged;
}

function cleanPasswords(data) {
  for (const client of data.clients) {
    if ("pw" in client || "password" in client || "password_hash" in client) {
      throw new HttpError(400, "Password data must not be stored in application state.");
    }
  }
}

async function login(req, res) {
  ensureSameOrigin(req);
  const body = readBody(req);
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username) || !password || password.length > 200) {
    throw new HttpError(401, "Invalid ID or password.");
  }
  const [user] = await database()`SELECT id, username, password_hash, role, client_id, failed_login_count, locked_until
    FROM auth_users WHERE lower(username) = lower(${username}) LIMIT 1`;
  const dummyHash = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6NjG7wB1Y8eK9XgS0j2YIY4H4fB2e";
  const matches = await bcrypt.compare(password, user?.password_hash || dummyHash);
  const locked = user?.locked_until && new Date(user.locked_until).getTime() > Date.now();
  if (!user || locked || !matches) {
    if (user && !locked) {
      await database()`UPDATE auth_users
        SET failed_login_count = failed_login_count + 1,
            locked_until = CASE WHEN failed_login_count + 1 >= 10 THEN now() + interval '15 minutes' ELSE locked_until END
        WHERE id = ${user.id}`;
    }
    throw new HttpError(401, "Invalid ID or password.");
  }
  await database()`UPDATE auth_users SET failed_login_count = 0, locked_until = NULL WHERE id = ${user.id}`;
  const token = sign({
    sub: user.id,
    role: user.role,
    clientId: user.client_id,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    nonce: randomBytes(8).toString("hex")
  });
  setSessionCookie(res, token);
  json(res, 200, { user: { role: user.role, clientId: user.client_id, username: user.username } });
}

async function updateState(req, res, user) {
  ensureSameOrigin(req);
  const body = readBody(req);
  const requested = body.data;
  const revision = body.revision;
  if (!Number.isSafeInteger(Number(revision)) || Number(revision) < 1) throw new HttpError(400, "Invalid data revision.");
  if (!validAppState(requested)) throw new HttpError(400, "Invalid application data.");
  cleanPasswords(requested);

  const sqlClient = database();
  const currentRow = await getState();
  if (String(currentRow.revision) !== String(revision)) throw new HttpError(409, "Data changed in another session. The latest version has been reloaded.");
  if (!Array.isArray(currentRow.data.clients)) throw new HttpError(503, "Database state is invalid.");
  let nextData;
  let credential = null;
  if (user.role === "admin") {
    nextData = requested;
    if (body.credential !== undefined) {
      const clientId = body.credential?.clientId;
      const client = requested.clients.find(item => item.id === clientId);
      if (!client || !/^[a-zA-Z0-9._-]{3,64}$/.test(client.uid)) {
        throw new HttpError(400, "Client login ID must be 3–64 letters, numbers, dots, underscores, or hyphens.");
      }
      if (typeof body.credential.password !== "string" ||
          body.credential.password.length < 12 || body.credential.password.length > 200) {
        throw new HttpError(400, "Client passwords must be at least 12 characters.");
      }
      credential = {
        clientId,
        username: client.uid,
        passwordHash: await bcrypt.hash(body.credential.password, 12)
      };
    }
    const accountRows = await sqlClient`SELECT client_id, username FROM auth_users WHERE role = 'client'`;
    const accounts = new Map(accountRows.map(account => [account.client_id, account]));
    for (const client of requested.clients) {
      const account = accounts.get(client.id);
      const isCredentialClient = credential?.clientId === client.id;
      if ((!account || account.username !== client.uid) && !isCredentialClient) {
        throw new HttpError(400, "Set a password whenever you add a client or change its login ID.");
      }
    }
  } else {
    if (body.credential !== undefined) throw new HttpError(403, "Client accounts cannot change login credentials.");
    nextData = mergeClientState(currentRow.data, requested, user);
  }
  cleanPasswords(nextData);
  const encoded = JSON.stringify(nextData);
  let result;
  if (credential) {
    result = await sqlClient`
      WITH changed AS (
        UPDATE app_state SET data = ${encoded}::jsonb, revision = revision + 1, updated_at = now()
        WHERE id = 1 AND revision = ${revision}::bigint
        RETURNING revision
      ),
      account AS (
        INSERT INTO auth_users (username, password_hash, role, client_id)
        SELECT ${credential.username}, ${credential.passwordHash}, 'client', ${credential.clientId}
        FROM changed
        ON CONFLICT (client_id) DO UPDATE
        SET username = EXCLUDED.username, password_hash = EXCLUDED.password_hash
        RETURNING id
      ),
      removed AS (
        DELETE FROM auth_users
        WHERE role = 'client'
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(${encoded}::jsonb->'clients') item
            WHERE item->>'id' = auth_users.client_id
          )
          AND EXISTS (SELECT 1 FROM changed)
        RETURNING id
      )
      SELECT revision FROM changed`;
  } else {
    result = await sqlClient`
      WITH changed AS (
        UPDATE app_state SET data = ${encoded}::jsonb, revision = revision + 1, updated_at = now()
        WHERE id = 1 AND revision = ${revision}::bigint
        RETURNING revision
      ),
      removed AS (
        DELETE FROM auth_users
        WHERE role = 'client'
          AND ${user.role === "admin"}
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(${encoded}::jsonb->'clients') item
            WHERE item->>'id' = auth_users.client_id
          )
          AND EXISTS (SELECT 1 FROM changed)
        RETURNING id
      )
      SELECT revision FROM changed`;
  }
  if (!result.length) throw new HttpError(409, "Data changed in another session. Reload and try again.");
  json(res, 200, { revision: result[0].revision });
}

async function changePassword(req, res, user) {
  ensureSameOrigin(req);
  const body = readBody(req);
  if (typeof body.newPassword !== "string" || body.newPassword.length < 12 || body.newPassword.length > 200) {
    throw new HttpError(400, "New password must be at least 12 characters.");
  }
  const [account] = await database()`SELECT password_hash FROM auth_users WHERE id = ${user.id}`;
  if (!account || typeof body.currentPassword !== "string" ||
      !await bcrypt.compare(body.currentPassword, account.password_hash)) {
    throw new HttpError(401, "Current password is incorrect.");
  }
  const passwordHash = await bcrypt.hash(body.newPassword, 12);
  await database()`UPDATE auth_users SET password_hash = ${passwordHash}, failed_login_count = 0, locked_until = NULL WHERE id = ${user.id}`;
  json(res, 200, { ok: true });
}

export default async function handler(req, res) {
  try {
    const path = new URL(req.url, "http://localhost").pathname.replace(/^\/api\/?/, "");
    if (path === "login" && req.method === "POST") return await login(req, res);
    if (path === "logout" && req.method === "POST") {
      ensureSameOrigin(req);
      clearSessionCookie(res);
      return json(res, 200, { ok: true });
    }
    if (path === "session" && req.method === "GET") {
      const user = await authenticatedUser(req);
      return json(res, 200, { user: { role: user.role, clientId: user.client_id, username: user.username } });
    }
    const user = await authenticatedUser(req);
    if (path === "state" && req.method === "GET") {
      const row = await getState();
      const data = user.role === "admin" ? row.data : clientState(row.data, user);
      return json(res, 200, { data, revision: row.revision });
    }
    if (path === "state" && req.method === "PUT") return await updateState(req, res, user);
    if (path === "password" && req.method === "POST") return await changePassword(req, res, user);
    throw new HttpError(404, "API route not found.");
  } catch (error) {
    if (error instanceof HttpError) return json(res, error.status, { error: error.message });
    console.error("Agency PMS API error:", error);
    return json(res, 500, { error: "The request could not be completed. Please try again." });
  }
}

export { clientState, mergeClientState, validAppState };
