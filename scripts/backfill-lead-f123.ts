/**
 * Backfill do F1.23: `Lead.canalId`/`origemDetalhada` + `Lead.responsavelId`.
 *
 * Fica em SCRIPT, não na migration, de propósito: `migrate deploy` roda ANTES de `db:seed` no
 * fluxo padrão de deploy (`deploy/gerenciar-servidor.ps1`), e este é o PRIMEIRO deploy de toda a
 * reforma do CRM — `canal_aquisicao` ainda estaria vazio no momento em que a migration roda. Um
 * `UPDATE` guardado por "se existir a linha 'Outro'" dentro da migration faria nada,
 * silenciosamente, e nada re-rodaria depois. Rodar este script DEPOIS do `db:seed` evita isso.
 *
 * ── 1. canalId / origemDetalhada (determinístico, docs/crm/03-migracao.md §3) ──────────────
 * `Lead.origem` nunca guardou canal de verdade — foi preenchido com nome de empreendimento
 * ("SMERALDA DEL MARE" etc.). Todo lead com `origem` preenchida ganha o canal "Outro" e o texto
 * original preservado em `origemDetalhada`. Nada é descartado.
 *
 * ── 2. responsavelId (heurístico — duas fontes, PRODUÇÃO só usa a primeira) ────────────────
 * `Lead` nunca teve campo de autor, e `criarLead` (`defineAction`) não passa `entidadeId` — o
 * AuditLog de "criar-lead" existe, mas sem link explícito para QUAL lead.
 *
 * 1. `audit_log` (acao="criar-lead"), casado por PROXIMIDADE DE HORÁRIO com `lead.createdAt`
 *    (dentro de `JANELA_SEGUNDOS`). **É o caminho real de produção**: conferido contra o dump de
 *    2026-08-14 (`senahub_20260814_160401.backup`, restaurado num banco throwaway pra checagem,
 *    descartado depois) — os 8 leads reais e as 8 linhas de audit "criar-lead" batem 1:1 por
 *    usuário (`Lúcio Sena`), ~10ms de diferença entre os dois `createdAt`. Produção NÃO tem
 *    nenhuma linha em `atividade_lead` para esses 8 leads (medido no mesmo dump) — o fallback
 *    abaixo nunca dispara lá.
 * 2. Fallback: `AtividadeLead.autorId` mais antigo do lead. **Só cobre o dev**: os 8 leads de
 *    `seed:demo` não têm nenhuma linha de audit (criados direto via `prisma.lead.create`, sem
 *    passar pela action), mas cada um tem exatamente 1 `AtividadeLead`.
 *
 * Lead sem nenhuma das duas fontes fica com `responsavelId = null` — não é erro, é o estado
 * esperado pra quem não tem sinal nenhum (o campo é só exibição/atribuição, não gate — ADR-15).
 *
 * O casamento por horário consome `audit_log` na ordem dos leads (guloso, não é pareamento
 * bipartido ótimo) — adequado para os n=8 de hoje; se o volume crescer e as janelas colidirem,
 * revisar antes de confiar cegamente no resultado.
 *
 * **Idempotente nos dois:** só toca `origemDetalhada IS NULL` / `responsavelId IS NULL`. Repetir
 * não tem efeito colateral em quem já foi preenchido (por este script ou manualmente).
 *
 * Uso (depois de `npm run db:seed`):
 *   tsx --tsconfig tsconfig.server.json scripts/backfill-lead-f123.ts              # dry-run
 *   tsx --tsconfig tsconfig.server.json scripts/backfill-lead-f123.ts --gravar
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const JANELA_SEGUNDOS = 30;

async function backfillCanalOrigem(gravar: boolean) {
  const canal = await prisma.canalAquisicao.findFirst({ where: { nome: "Outro" } });
  if (!canal) {
    console.log("[canal/origem] Catálogo sem a linha 'Outro' — rode `npm run db:seed` primeiro. Pulando.");
    return;
  }

  const leads = await prisma.lead.findMany({
    where: { origemDetalhada: null, origem: { not: null } },
    select: { id: true, nome: true, origem: true },
  });
  const comOrigem = leads.filter((l) => l.origem && l.origem.trim() !== "");

  console.log(gravar ? "\n[canal/origem] Gravando:" : "\n[canal/origem] [dry-run] atribuiria:");
  for (const l of comOrigem) console.log(`   ${l.nome}: origem="${l.origem}" -> canal="Outro" origemDetalhada="${l.origem}"`);

  if (gravar) {
    for (const l of comOrigem) {
      await prisma.lead.update({
        where: { id: l.id },
        data: { canalId: canal.id, origemDetalhada: l.origem },
      });
    }
  }
  console.log(`[canal/origem] ${gravar ? "Feito" : "[dry-run]"}: ${comOrigem.length} lead(s).`);
}

async function backfillResponsavel(gravar: boolean) {
  const leads = await prisma.lead.findMany({
    where: { responsavelId: null },
    select: { id: true, nome: true, createdAt: true },
  });
  if (leads.length === 0) {
    console.log("\n[responsável] Nenhum lead sem responsável. Nada a fazer.");
    return;
  }

  const auditos = await prisma.auditLog.findMany({
    where: { acao: "criar-lead", entidade: "Lead", userId: { not: null } },
    select: { userId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const atividades = await prisma.atividadeLead.findMany({
    select: { leadId: true, autorId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const primeiraAtividadePorLead = new Map<string, string>();
  for (const a of atividades) {
    if (!primeiraAtividadePorLead.has(a.leadId)) primeiraAtividadePorLead.set(a.leadId, a.autorId);
  }

  const usados = new Set<number>(); // índice em `auditos` já consumido por outro lead
  const plano: { id: string; nome: string; responsavelId: string; origem: "audit_log" | "atividade" }[] = [];
  const semSinal: string[] = [];

  for (const lead of leads) {
    let melhorIdx = -1;
    let melhorDelta = Infinity;
    for (const [i, a] of auditos.entries()) {
      if (usados.has(i)) continue;
      const delta = Math.abs(a.createdAt.getTime() - lead.createdAt.getTime());
      if (delta <= JANELA_SEGUNDOS * 1000 && delta < melhorDelta) {
        melhorDelta = delta;
        melhorIdx = i;
      }
    }

    if (melhorIdx >= 0) {
      usados.add(melhorIdx);
      plano.push({ id: lead.id, nome: lead.nome, responsavelId: auditos[melhorIdx].userId!, origem: "audit_log" });
      continue;
    }

    const viaAtividade = primeiraAtividadePorLead.get(lead.id);
    if (viaAtividade) {
      plano.push({ id: lead.id, nome: lead.nome, responsavelId: viaAtividade, origem: "atividade" });
      continue;
    }

    semSinal.push(lead.nome);
  }

  console.log(gravar ? "\n[responsável] Gravando:" : "\n[responsável] [dry-run] atribuiria:");
  for (const p of plano) console.log(`   ${p.nome} -> ${p.responsavelId} (via ${p.origem})`);
  if (semSinal.length > 0) console.log(`\n  Sem sinal nenhum (fica null): ${semSinal.join(", ")}`);

  if (gravar) {
    for (const p of plano) {
      await prisma.lead.update({ where: { id: p.id }, data: { responsavelId: p.responsavelId } });
    }
  }
  console.log(`[responsável] ${gravar ? "Feito" : "[dry-run]"}: ${plano.length} lead(s), ${semSinal.length} sem sinal.`);
}

async function main() {
  const gravar = process.argv.includes("--gravar");
  await backfillCanalOrigem(gravar);
  await backfillResponsavel(gravar);
  if (!gravar) console.log("\nNada gravado. Repita com --gravar.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
