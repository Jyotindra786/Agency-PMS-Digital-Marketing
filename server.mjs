import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import apiHandler from "./api/[...path].js";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.PORT || 3000);
const maxBodyBytes = 1_000_000;
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"]
]);
const publicFiles = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/Agency PMS – Digital Marketing.css", "Agency PMS – Digital Marketing.css"],
  ["/Agency PMS – Digital Marketing.js", "Agency PMS – Digital Marketing.js"]
]);

function respond(res, status, message) {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(message);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      const error = new Error("Request body exceeds the 1 MB limit.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON request.");
    error.status = 400;
    throw error;
  }
}

const server = createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return respond(res, 400, "Invalid URL path.");
  }
  if (pathname.startsWith("/api/")) {
    if (!["GET", "POST", "PUT"].includes(req.method)) {
      return respond(res, 405, "Method not allowed.");
    }
    try {
      if (req.method === "POST" || req.method === "PUT") req.body = await readJsonBody(req);
      res.setHeader("X-Content-Type-Options", "nosniff");
      await apiHandler(req, res);
    } catch (error) {
      respond(res, error.status || 500, error.status ? error.message : "The request could not be completed.");
      if (!error.status) console.error("Local server request failed:", error);
    }
    return;
  }

  const relativePath = publicFiles.get(pathname);
  if (!relativePath || req.method !== "GET" && req.method !== "HEAD") {
    return respond(res, 404, "Not found.");
  }

  const filePath = resolve(root, relativePath);
  if (!filePath.startsWith(`${root}${sep}`)) return respond(res, 404, "Not found.");
  try {
    const info = await stat(filePath);
    const headers = {
      "Cache-Control": "no-cache",
      "Content-Length": info.size,
      "Content-Type": contentTypes.get(extname(filePath)) || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    };
    if (req.method === "HEAD") {
      res.writeHead(200, headers);
      return res.end();
    }
    const content = await readFile(filePath);
    res.writeHead(200, headers);
    res.end(content);
  } catch (error) {
    if (error.code === "ENOENT") return respond(res, 404, "Not found.");
    console.error("Local server file error:", error);
    return respond(res, 500, "The file could not be served.");
  }
});

const logReady = () => {
  console.log(`Agency PMS running at http://localhost:${port}`);
  console.log("Press Ctrl+C to stop the server.");
};

if (process.env.VERCEL) server.listen(port, logReady);
else server.listen(port, "127.0.0.1", logReady);
