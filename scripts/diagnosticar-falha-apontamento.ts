/**
 * Mostra o ERRO REAL por trás de "Erro ao processar a solicitação." nas ações de apontamento.
 *
 * `with-action.ts` troca qualquer exceção que não seja `ActionError` por essa frase genérica —
 * mas grava o erro original no `AuditLog` (`resultado: "falha"`, `detalhe.erro`). A tela
 * `/auditoria` não renderiza o `detalhe`, então este script é a forma de ler.
 *
 * Somente leitura. Uso (na máquina onde roda o servidor, com o `.env` de lá):
 *   npx tsx --tsconfig tsconfig.server.json scripts/diagnosticar-falha-apontamento.ts
 *
 * Como ler o resultado:
 *   - `P2025` / "depends on one or more records that were required but not found"
 *       → ponteiro de checklist órfão. Rode `scripts/limpar-tarefaitem-orfao.ts --aplicar`.
 *   - "column ... does not exist" / "Unknown argument"
 *       → banco atrás do código (migration não aplicada) ou build velho.
 *         Rode `npx prisma migrate deploy`, refaça o build e suba o serviço de novo.
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";

const ACOES = [
  "resolver-pendencia",
  "assumir-correcao-pendencia",
  "reabrir-pendencia",
  "fechar-pendencia",
  "descartar-pendencia",
  "adiar-pendencia",
  "criar-pendencia",
  "enviar-apontamentos",
  "resolver-apontamento",
  "reabrir-apontamento",
  "fechar-apontamento",
  "descartar-apontamento",
];

async function main() {
  const falhas = await prisma.auditLog.findMany({
    where: { acao: { in: ACOES }, resultado: "falha" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { createdAt: true, acao: true, detalhe: true, user: { select: { name: true } } },
  });

  if (falhas.length === 0) {
    console.log("Nenhuma FALHA registrada nessas ações.");
    console.log("Se o usuário viu o erro, ele pode ter sido 'rejeitado' (regra de negócio) — veja /auditoria.");
    return;
  }

  for (const f of falhas) {
    const erro = (f.detalhe as { erro?: string } | null)?.erro ?? "(sem detalhe)";
    console.log("─".repeat(80));
    console.log(f.createdAt.toISOString(), "·", f.acao, "·", f.user?.name ?? "—");
    console.log(erro);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
