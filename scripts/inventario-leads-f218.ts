/**
 * Inventário dos leads reais, para decidir a F2.18. SOMENTE LEITURA.
 *
 * A informação que ninguém consumiu ainda: `etapaId`/`FunilEtapa` ficou DEPRECADO mas POPULADO
 * (F2.3, §8.3) — é ele que diz em que ponto do funil cada lead realmente estava antes da reforma.
 * Sem isso, decidir o estágio de cada um seria chute.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

(async () => {
  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      nome: true,
      status: true,
      arquivado: true,
      motivoPerda: true,
      origem: true,
      origemDetalhada: true,
      valorEstimado: true,
      createdAt: true,
      updatedAt: true,
      etapa: { select: { nome: true, ordem: true } },
      cliente: { select: { id: true, nome: true } },
      canal: { select: { nome: true } },
      responsavel: { select: { name: true } },
      _count: { select: { propostas: true, anexos: true, atividades: true, contatos: true } },
    },
  });

  console.log(`${leads.length} lead(s):\n`);
  for (const l of leads) {
    console.log(`─ ${l.origemDetalhada ?? l.nome}`);
    console.log(`   id           ${l.id}`);
    console.log(`   empresa      ${l.cliente?.nome ?? "(SEM CLIENTE)"}`);
    console.log(`   etapa ANTIGA ${l.etapa?.nome ?? "?"}  <- diz o estagio real`);
    console.log(`   status novo  ${l.status}${l.arquivado ? "  (ARQUIVADO)" : ""}`);
    console.log(`   canal        ${l.canal?.nome ?? "—"}   responsavel ${l.responsavel?.name ?? "—"}`);
    console.log(`   valor        ${l.valorEstimado ?? "—"}   motivoPerda ${l.motivoPerda ?? "—"}`);
    console.log(
      `   vinculos     ${l._count.propostas} proposta(s), ${l._count.anexos} anexo(s), ` +
        `${l._count.atividades} atividade(s), ${l._count.contatos} contato(s)`,
    );
    console.log(`   criado       ${l.createdAt.toISOString().slice(0, 10)}   mexido ${l.updatedAt.toISOString().slice(0, 10)}`);
    console.log("");
  }

  const etapas = await prisma.funilEtapa.findMany({
    orderBy: { ordem: "asc" },
    select: { nome: true, ordem: true, ativo: true, _count: { select: { leads: { where: { excluidoEm: null } } } } },
  });
  console.log("Etapas do funil antigo (com quantos leads cada):");
  for (const e of etapas) {
    console.log(`   ${String(e.ordem).padStart(2)} ${e.nome.padEnd(22)} ${e._count.leads} lead(s)${e.ativo ? "" : "  (inativa)"}`);
  }

  const contatos = await prisma.contatoCliente.count();
  console.log(`\ncontato_cliente no total: ${contatos}`);
  await prisma.$disconnect();
})();
