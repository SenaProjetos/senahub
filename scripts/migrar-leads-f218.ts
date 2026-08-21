/**
 * F2.18 — move os 8 leads reais para o modelo da Fase 2.
 *
 * ── O que o dado mostrou, e por que isso muda a tarefa ──────────────────────────────────────
 * O backlog descreve a F2.18 como "mover os 8 leads para `Lead` v2 / `Negociacao`". O inventário
 * (`scripts/inventario-leads-f218.ts`) revelou que **nenhum dos 8 é prospecção**: 6 estão na etapa
 * antiga "Contratado" e 2 em "Proposta enviada". Todos já passaram do funil de cima.
 *
 * Deixá-los como prospecção em `IDENTIFICADO` — que é o default que a migration da F2.3 preencheu
 * — retrataria como início o que já é negócio fechado, e contaminaria o forecast da Fase 6.
 *
 * A fonte do estágio real é `etapaId`/`FunilEtapa`, que a F2.3 deprecou mas **manteve populado**
 * exatamente para isto (§8.3). Sem ele, decidir o estágio de cada um seria chute.
 *
 * ── Regra de conversão ───────────────────────────────────────────────────────────────────────
 *   etapa "Contratado"       → Negociacao.estagio = CONTRATADO
 *   etapa "Proposta enviada" → Negociacao.estagio = PROPOSTA_ENVIADA
 *   em todos os casos, o Lead SOBREVIVE em OPORTUNIDADE_CRIADA apontando para a negociação —
 *   mesmo comportamento de `qualificarProspeccao` (F2.8): destruir o lead apagaria como a
 *   empresa chegou até nós, que é o que a Fase 6 precisa para medir origem.
 *
 * ── Empresa dos dois leads órfãos ────────────────────────────────────────────────────────────
 * Dois leads estão com `clienteId` nulo, e `Negociacao.clienteId` é NOT NULL. A empresa NÃO é
 * chutada: ela está em `Lead.nome`, que nesses registros guarda o nome da EMPRESA (o nome da obra
 * ficou em `origemDetalhada` depois do backfill da F1.23). O script casa por nome normalizado
 * contra `Cliente` e **recusa executar** se algum não resolver — melhor abortar que adivinhar.
 *
 * ── Vínculo com Projeto (decisão do dono, 2026-08-21) ────────────────────────────────────────
 * Só os dois inequívocos: `RES. PLINIO PAIVA → 260024` e `SMERALDA DEL MARE → 260028`, onde o
 * nome bate sem dúvida. Os outros quatro ficam SEM vínculo: dois têm nome divergente
 * (`EDIF. MARMARES` vs `HOTEL MARMARES - TAMANDARÉ`, `EDIF. ISA BEACH` vs `ISA BEACH 2`) e dois
 * não têm projeto nenhum. Errar o vínculo aponta uma obra para o negócio errado.
 *
 * ── needsReview ──────────────────────────────────────────────────────────────────────────────
 * Todos os 8 nascem com `needsReview = true` (ADR-16). Nada aqui foi decidido por uma pessoa que
 * conhece o negócio; foi derivado de dado antigo. A marca é o convite para essa conferência.
 *
 * IDEMPOTENTE: o `Negociacao.leadId @unique` impede duplicar, e o script pula lead que já tem
 * negociação. Rodar de novo não cria nada.
 *
 *   tsx --tsconfig tsconfig.server.json scripts/migrar-leads-f218.ts            # dry-run
 *   tsx --tsconfig tsconfig.server.json scripts/migrar-leads-f218.ts --gravar
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import type { EstagioNegociacao } from "../src/generated/prisma/client";

const GRAVAR = process.argv.includes("--gravar");

/** Etapa antiga → estágio da negociação. Fora deste mapa, o script aborta em vez de supor. */
const ETAPA_PARA_ESTAGIO: Record<string, EstagioNegociacao> = {
  Contratado: "CONTRATADO",
  "Proposta enviada": "PROPOSTA_ENVIADA",
  "Em negociação": "NEGOCIACAO",
  Orçamento: "ORCAMENTO",
  Perdido: "PERDIDO",
};

/** Vínculo com projeto — só os aprovados pelo dono. Chave = `origemDetalhada` do lead. */
const PROJETO_POR_OBRA: Record<string, string> = {
  "RES. PLINIO PAIVA": "260024",
  "SMERALDA DEL MARE": "260028",
};

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(ltda|me|epp|eireli|s\/?a|sa)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

async function main() {
  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      nome: true,
      status: true,
      clienteId: true,
      canalId: true,
      campaignId: true,
      parceiroId: true,
      origemDetalhada: true,
      valorEstimado: true,
      responsavelId: true,
      etapa: { select: { nome: true } },
      negociacao: { select: { id: true } },
    },
  });

  const clientes = await prisma.cliente.findMany({
    where: { fundidoEmId: null, excluidoEm: null },
    select: { id: true, nome: true },
  });
  const porNomeNormalizado = new Map(clientes.map((c) => [normalizar(c.nome), c.id]));

  const projetos = await prisma.projeto.findMany({
    where: { codigo: { in: Object.values(PROJETO_POR_OBRA) } },
    select: { id: true, codigo: true, nome: true, negociacaoId: true },
  });
  const projetoPorCodigo = new Map(projetos.map((p) => [p.codigo, p]));

  console.log(`${leads.length} lead(s) analisado(s).\n`);

  type Plano = {
    leadId: string;
    obra: string;
    empresa: string;
    clienteId: string;
    estagio: EstagioNegociacao;
    valor: number | null;
    projetoCodigo: string | null;
  };
  const plano: Plano[] = [];
  const problemas: string[] = [];

  for (const l of leads) {
    const obra = l.origemDetalhada ?? l.nome;

    if (l.negociacao) {
      console.log(`  = "${obra}" — já tem negociação, pulando`);
      continue;
    }

    const etapa = l.etapa?.nome ?? "";
    const estagio = ETAPA_PARA_ESTAGIO[etapa];
    if (!estagio) {
      problemas.push(`"${obra}": etapa antiga "${etapa}" não está no mapa de conversão`);
      continue;
    }

    // Empresa: usa a do lead se houver; senão deriva de `Lead.nome`, que nesses registros guarda
    // o nome da EMPRESA (a obra foi para `origemDetalhada` no backfill da F1.23).
    let clienteId = l.clienteId;
    let empresa = "";
    if (clienteId) {
      empresa = clientes.find((c) => c.id === clienteId)?.nome ?? "(?)";
    } else {
      const achado = porNomeNormalizado.get(normalizar(l.nome));
      if (!achado) {
        problemas.push(
          `"${obra}": sem clienteId e o nome "${l.nome}" não casa com nenhuma empresa — ` +
            `Negociacao.clienteId é NOT NULL, então este não pode ser migrado sem decisão humana`,
        );
        continue;
      }
      clienteId = achado;
      empresa = clientes.find((c) => c.id === achado)!.nome + "  (derivada de Lead.nome)";
    }

    const codigo = PROJETO_POR_OBRA[obra] ?? null;
    if (codigo) {
      const p = projetoPorCodigo.get(codigo);
      if (!p) problemas.push(`"${obra}": projeto ${codigo} não encontrado`);
      else if (p.negociacaoId) problemas.push(`"${obra}": projeto ${codigo} já tem negociação`);
    }

    plano.push({
      leadId: l.id,
      obra,
      empresa,
      clienteId,
      estagio,
      valor: l.valorEstimado != null ? Number(l.valorEstimado) : null,
      projetoCodigo: codigo,
    });
  }

  const rotulo = GRAVAR ? "Gravando" : "[dry-run] criaria";
  for (const p of plano) {
    console.log(`  ${rotulo}: "${p.obra}"`);
    console.log(`      empresa   ${p.empresa}`);
    console.log(`      estágio   ${p.estagio}   valor ${p.valor ?? "—"}`);
    console.log(`      projeto   ${p.projetoCodigo ?? "(sem vínculo — needsReview)"}`);
  }

  if (problemas.length > 0) {
    console.log(`\n⚠ ${problemas.length} problema(s) — NADA será gravado:`);
    for (const p of problemas) console.log(`   ${p}`);
    console.log(`\nResolva antes de rodar com --gravar.`);
    return;
  }

  console.log(
    `\n${plano.length} negociação(ões) a criar · ` +
      `${plano.filter((p) => p.projetoCodigo).length} com vínculo de projeto · ` +
      `todas com needsReview = true`,
  );

  if (!GRAVAR) {
    console.log("\nNada gravado. Repita com --gravar.");
    return;
  }

  for (const p of plano) {
    await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findUniqueOrThrow({
        where: { id: p.leadId },
        select: { canalId: true, campaignId: true, parceiroId: true, responsavelId: true },
      });

      const neg = await tx.negociacao.create({
        data: {
          titulo: p.obra,
          clienteId: p.clienteId,
          leadId: p.leadId,
          estagio: p.estagio,
          valorEstimado: p.valor,
          // Contrato fechado tem valor negociado igual ao estimado até alguém revisar — inventar
          // desconto aqui seria fabricar número que ninguém digitou.
          valorNegociado: p.estagio === "CONTRATADO" ? p.valor : null,
          probabilidade: p.estagio === "CONTRATADO" ? 100 : 55,
          dataFechamento: p.estagio === "CONTRATADO" ? new Date() : null,
          canalId: lead.canalId,
          campaignId: lead.campaignId,
          parceiroId: lead.parceiroId,
          responsavelId: lead.responsavelId,
          needsReview: true,
        },
        select: { id: true },
      });

      await tx.lead.update({
        where: { id: p.leadId },
        data: {
          status: "OPORTUNIDADE_CRIADA",
          needsReview: true,
          // Grava a empresa de volta no LEAD também quando ela foi derivada. Sem isto o lead
          // ficaria com `clienteId` nulo enquanto a negociação dele tem empresa — incoerência
          // que a Empresa 360 (Fase 3) mostraria como "prospecção sem empresa". É seguro:
          // `OPORTUNIDADE_CRIADA` não é status ativo, então não esbarra no índice da F2.5.
          clienteId: p.clienteId,
        },
      });

      if (p.projetoCodigo) {
        await tx.projeto.update({
          where: { codigo: p.projetoCodigo },
          data: { negociacaoId: neg.id },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: null,
          modulo: "comercial",
          acao: "migrar-lead-f218",
          entidade: "Lead",
          entidadeId: p.leadId,
          resultado: "sucesso",
          detalhe: {
            origem: "script:migrar-leads-f218",
            tarefa: "F2.18",
            obra: p.obra,
            estagio: p.estagio,
            negociacaoId: neg.id,
            projetoVinculado: p.projetoCodigo,
          },
          ip: null,
        },
      });
      console.log(`  ✓ "${p.obra}" → negociação ${neg.id.slice(0, 8)}…`);
    });
  }

  console.log(`\nFeito: ${plano.length} negociação(ões) criada(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
