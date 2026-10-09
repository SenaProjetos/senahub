/**
 * Mapeia os documentos existentes para o ciclo documental (ISO 19650) — Etapa 2.
 *
 *   npx tsx --tsconfig tsconfig.server.json scripts/migrar-ciclo-documental.ts           # só lê: relatório
 *   npx tsx --tsconfig tsconfig.server.json scripts/migrar-ciclo-documental.ts --gravar  # grava
 *
 * Roda UMA vez por banco, logo depois do `migrate deploy` da migração 20261009100000_ciclo_documental.
 * As regras são as de `src/modules/uploads/ciclo/migracao.ts` (puro, testado); aqui só há I/O.
 *
 * - Cada documento grava numa transação própria: estado de cada revisão, controles (automáticos, origem
 *   `migracao`) e um evento por mudança no histórico do documento (`motivo` = "Migração: …").
 * - Idempotente: documento que já tem evento de estado é pulado (não regrava nem duplica histórico).
 * - É a única escrita de estado fora do serviço do ciclo, e só porque é a carga inicial.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { planejarMigracao, type DocumentoParaMigrar, type PlanoDocumento } from "../src/modules/uploads/ciclo/migracao";
import { ROTULO_CONTROLE, ROTULO_ESTADO, type EstadoRevisao } from "../src/modules/uploads/ciclo/estados";

const GRAVAR = process.argv.includes("--gravar");

function extensao(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i > 0 ? nome.slice(i + 1).toLowerCase() : "";
}

async function carregar(): Promise<DocumentoParaMigrar[]> {
  const docs = await prisma.documentoDisciplina.findMany({
    where: { substituidoPorId: null },
    select: {
      id: true,
      chave: true,
      nomeArquivo: true,
      revisaoCompartilhadaId: true,
      revisaoLiberadaObraId: true,
      status: { select: { nome: true, chave: true, final: true } },
      revisoes: {
        select: {
          id: true,
          numero: true,
          // Lixeira incluída de propósito: `excluidoEm` decide a vigente, não some da leitura.
          uploads: { where: { excluidoEm: { not: undefined } }, select: { nomeArquivo: true, validado: true, excluidoEm: true } },
        },
      },
    },
  });
  return docs.map((d) => ({
    id: d.id,
    chave: d.chave,
    nome: d.nomeArquivo,
    statusChave: d.status?.chave ?? null,
    statusNome: d.status?.nome ?? null,
    statusFinal: d.status?.final ?? false,
    revisaoCompartilhadaId: d.revisaoCompartilhadaId,
    revisaoLiberadaObraId: d.revisaoLiberadaObraId,
    revisoes: d.revisoes.map((r) => ({
      id: r.id,
      numero: r.numero,
      arquivos: r.uploads.map((u) => ({ ext: extensao(u.nomeArquivo), validado: u.validado, naLixeira: u.excluidoEm !== null })),
    })),
  }));
}

async function gravar(plano: PlanoDocumento): Promise<"gravado" | "pulado"> {
  const jaMigrado = await prisma.documentoEvento.findFirst({
    where: { documentoId: plano.documentoId, tipo: "estado" },
    select: { id: true },
  });
  if (jaMigrado) return "pulado";
  const agora = new Date();
  await prisma.$transaction(async (tx) => {
    // Publicada por último: o índice parcial (uma publicada por documento) nunca vê duas no meio do caminho.
    const ordem = [...plano.revisoes].sort((a, b) => Number(a.estado === "publicado") - Number(b.estado === "publicado"));
    for (const r of ordem) {
      await tx.documentoRevisao.update({ where: { id: r.revisaoId }, data: { estado: r.estado, estadoEm: agora } });
      await tx.documentoEvento.create({
        data: {
          documentoId: plano.documentoId,
          revisaoId: r.revisaoId,
          tipo: "estado",
          categoria: "alteracao",
          userId: null,
          detalhe: { de: null, para: r.estado, motivo: r.motivo, revisao: r.numero, automatico: true, migracao: true },
        },
      });
    }
    // Os ponteiros das pastas do cliente viram espelho dos controles (o serviço do ciclo os mantém assim).
    const comPasta = (tipo: string) => plano.controles.find((c) => c.tipo === tipo)?.revisaoId ?? null;
    await tx.documentoDisciplina.update({
      where: { id: plano.documentoId },
      data: { revisaoCompartilhadaId: comPasta("enviado_cliente"), revisaoLiberadaObraId: comPasta("liberado_obra") },
    });
    for (const c of plano.controles) {
      const numero = plano.revisoes.find((r) => r.revisaoId === c.revisaoId)?.numero ?? null;
      await tx.controleRevisao.create({
        data: { revisaoId: c.revisaoId, tipo: c.tipo, escopos: [], motivo: c.motivo, automatico: true, origem: "migracao", aplicadoEm: agora },
      });
      await tx.documentoEvento.create({
        data: {
          documentoId: plano.documentoId,
          revisaoId: c.revisaoId,
          tipo: "controle_aplicado",
          categoria: "alteracao",
          userId: null,
          detalhe: { controle: c.tipo, motivo: c.motivo, revisao: numero, automatico: true, migracao: true },
        },
      });
    }
  });
  return "gravado";
}

async function main() {
  const docs = await carregar();
  const planos = docs.map(planejarMigracao);
  const doCiclo = planos.filter((p) => p.participa);

  const porEstado: Record<EstadoRevisao, number> = { em_andamento: 0, compartilhado: 0, publicado: 0, arquivado: 0 };
  for (const p of doCiclo) for (const r of p.revisoes) porEstado[r.estado]++;
  const porControle = new Map<string, number>();
  for (const p of doCiclo) for (const c of p.controles) porControle.set(c.tipo, (porControle.get(c.tipo) ?? 0) + 1);

  console.log(`\nCiclo documental — ${GRAVAR ? "GRAVANDO" : "modo leitura (use --gravar para gravar)"}`);
  console.log(`Documentos: ${docs.length} · no ciclo (pacote A, sem IFC): ${doCiclo.length} · fora: ${docs.length - doCiclo.length}`);
  console.log("Revisões por estado:");
  for (const e of Object.keys(porEstado) as EstadoRevisao[]) console.log(`  ${ROTULO_ESTADO[e].padEnd(14)} ${porEstado[e]}`);
  console.log("Controles a criar:");
  for (const [t, n] of porControle) console.log(`  ${ROTULO_CONTROLE[t as keyof typeof ROTULO_CONTROLE].padEnd(20)} ${n}`);

  const avisos = doCiclo.flatMap((p) => p.avisos);
  console.log(`\nCasos para conferir (${avisos.length}):`);
  for (const a of avisos) console.log(`  [${a.tipo}] ${a.texto}`);

  if (!GRAVAR) return;
  let gravados = 0;
  let pulados = 0;
  for (const p of doCiclo) {
    if ((await gravar(p)) === "gravado") gravados++;
    else pulados++;
  }
  console.log(`\nGravado: ${gravados} documento(s) · já migrados antes (pulados): ${pulados}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
