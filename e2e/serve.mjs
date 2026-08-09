// Static server for e2e with the same SPA fallback vercel.json ships, so
// deep links like /today resolve to index.html the way production does —
// plus the real api/ handlers mounted the way Vercel mounts them, so
// endpoint-backed flows are provable locally.
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
};

// the api handlers read Vercel env; feed them the local files once
for (const envFile of [".env.local", ".secrets.env"]) {
  if (!existsSync(envFile)) continue;
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0 && !line.startsWith("#") && !process.env[line.slice(0, i)]) {
      process.env[line.slice(0, i)] = line.slice(i + 1);
    }
  }
}

async function handleApi(req, res, name) {
  let body = "";
  for await (const chunk of req) body += chunk;
  const vercelReq = {
    method: req.method,
    headers: req.headers,
    body: body ? JSON.parse(body) : {},
  };
  const vercelRes = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      res.writeHead(this.statusCode, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    },
  };
  try {
    const mod = await import(`../api/${name}.js`);
    await mod.default(vercelReq, vercelRes);
  } catch {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "local api shim failed" }));
  }
}

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  const api = /^[/\\]api[/\\]([a-z-]+)$/.exec(path);
  if (api) {
    void handleApi(req, res, api[1]);
    return;
  }
  let file = join("dist", path);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join("dist", "index.html");
  res.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
  res.end(readFileSync(file));
}).listen(3000, "127.0.0.1");
