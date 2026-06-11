import "@/lib/polyfill-als";
import "dotenv/config";
import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { initSocket } from "@/lib/socket";
import { startJobs, stopJobs } from "@/lib/jobs";

const dev = process.argv.includes("--dev");
const port = Number(process.env.PORT) || 3000;
const hostname = process.env.HOSTNAME || "0.0.0.0";

async function main() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = createServer((req, res) => {
    handle(req, res, parse(req.url!, true));
  });

  // Realtime (Socket.io) e jobs (pg-boss) no mesmo processo.
  initSocket(server);
  await startJobs();

  server.listen(port, hostname, () => {
    console.log(`▲ SenaHub pronto em http://${hostname}:${port} (${dev ? "dev" : "prod"})`);
  });

  async function shutdown(signal: string) {
    console.log(`\n${signal} recebido — encerrando…`);
    server.close();
    await stopJobs();
    process.exit(0);
  }
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Falha ao iniciar o servidor:", err);
  process.exit(1);
});
