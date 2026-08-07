// Static server for e2e with the same SPA fallback vercel.json ships, so
// deep links like /today resolve to index.html the way production does.
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

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  let file = join("dist", path);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join("dist", "index.html");
  res.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
  res.end(readFileSync(file));
}).listen(3000, "127.0.0.1");
