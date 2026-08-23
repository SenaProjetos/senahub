/**
 * F7.8 / P20 — encadeia os smokes que exercitam o fluxo comercial completo no PostgreSQL de
 * desenvolvimento. Cada etapa cria e remove sua própria fixture; o encadeamento prova que as
 * fronteiras Empresa → Prospecção → Negociação → Proposta → Projeto continuam compatíveis.
 *
 * Uso: npm run smoke:crm-e2e
 */
import { execFileSync } from "node:child_process";

const npmCli = process.env.npm_execpath;

if (!npmCli) {
  throw new Error("O caminho do CLI do npm não foi informado pelo processo pai.");
}

const etapas = [
  ["1–3", "smoke:crm-fase1"],
  ["3–10", "smoke:crm-fase2"],
  ["4–6, 16, 19", "smoke:crm-fase3"],
  ["1–4, 20", "smoke:crm-fase4"],
  ["10–15", "smoke:crm-fase5"],
  ["17–18", "smoke:crm-fase6"],
  ["lembretes", "smoke:crm-automacoes"],
] as const;

for (const [criterios, script] of etapas) {
  console.log(`\n══ Critérios ${criterios}: ${script} ══\n`);
  // Executar o arquivo JavaScript do npm pelo Node evita depender da execução
  // direta de npm.cmd, que não é suportada por execFileSync no Windows.
  execFileSync(process.execPath, [npmCli, "run", script], { stdio: "inherit" });
}

console.log("\n✔ CRM E2E: os smokes encadeados concluíram sem falhas.\n");
