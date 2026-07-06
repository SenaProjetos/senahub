import "@/lib/polyfill-als";
import "dotenv/config";
import { createServer } from "node:http";
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
    // Sem 3º argumento: Next.js analisa req.url internamente (DEP0169 — evita
    // url.parse() legado aqui; parsedUrl explícito só é necessário para
    // rewrites/roteamento custom, que este server não faz).
    handle(req, res);
  });

  // Uploads grandes (arquivos BIM até 500 MB) podem levar vários minutos em
  // links lentos. O requestTimeout padrão do Node (5 min) abortaria a conexão
  // no meio do corpo → req.formData() lança e o cliente recebe "Falha ao
  // receber o arquivo". Desliga o teto por requisição (0 = sem limite);
  // headersTimeout continua protegendo contra slowloris no cabeçalho.
  server.requestTimeout = 0;
  server.headersTimeout = 60_000;

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
