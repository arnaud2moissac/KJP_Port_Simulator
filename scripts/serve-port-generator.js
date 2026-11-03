"use strict";
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const generator = path.resolve(__dirname, "../generateur-port.html");
function createGeneratorServer() {
  return http.createServer(async (request, response) => {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { Allow: "GET, HEAD" });response.end();return;
    }
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    if (pathname === "/favicon.ico") { response.writeHead(204);response.end();return; }
    if (!["/", "/generateur-port.html"].includes(pathname)) { response.writeHead(404);response.end();return; }
    try {
      const html = await fs.readFile(generator);
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": html.length,
        "Referrer-Policy": "strict-origin-when-cross-origin" });
      response.end(request.method === "HEAD" ? undefined : html);
    } catch { response.writeHead(500);response.end("Build the generator first: npm run build:port-generator"); }
  });
}
if (require.main === module) {
  const port = Number(process.env.KJP_GENERATOR_PORT || 4173);
  const server = createGeneratorServer();
  server.on("error", error => { console.error(error.message);process.exitCode = 1; });
  server.listen(port, "127.0.0.1", () => console.log(`Générateur local : http://127.0.0.1:${server.address().port}/generateur-port.html`));
}
module.exports = { createGeneratorServer };
