import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4173);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    const decoded = decodeURIComponent(requestUrl.pathname);
    let target = path.resolve(root, decoded.replace(/^\/+/, ""));
    if (!target.startsWith(`${root}${path.sep}`) && target !== root) throw new Error("Unsafe path");
    if ((await stat(target)).isDirectory()) target = path.join(target, "index.html");

    const body = await readFile(target);
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": contentTypes[path.extname(target)] || "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Gregório's CAD: http://127.0.0.1:${port}`);
});
