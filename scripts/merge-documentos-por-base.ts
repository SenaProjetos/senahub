import "dotenv/config";
import { writeFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { chaveDocumento } from "../src/modules/uploads/documento";

/**
 * Merge de documentos por nome-base (M4 do plano da Fase 2).
 *
 * Reagrupa `documento_disciplina` depois que `chaveDocumento()` deixou de incluir a
 * extensão: `EST-FOR-001-R03.pdf` e `.dwg`, hoje dois documentos, passam a ser um só.
 *
 * ESTE É O ÚNICO PASSO NÃO TRIVIALMENTE REVERSÍVEL DO PLANO. Antes de rodar com
 * --aplicar: `pg_dump -Fc` do banco alvo (ver docs/DEPLOY.md §8). Reverter depois só por
 * restore — a migration reversa não desfaz o reagrupamento.
 *
 * O perdedor do merge NÃO é apagado: recebe `substituidoPorId` apontando para o canônico
 * (soft-retire), porque `AuditLog.entidadeId` guarda id de documento sem FK e um DELETE
 * deixaria histórico apontando para o nada.
 *
 * Canônico do grupo = o de `createdAt` mais antigo (a linhagem que começou primeiro).
 *
 * Idempotente: já processados têm `chave` nova e `substituidoPorId` preenchido, então uma
 * segunda execução não encontra nada para fazer.
 */

const APLICAR = process.argv.includes("--aplicar");

type Doc = {
  id: string;
  disciplinaId: string;
  chave: string;
  nomeArquivo: string;
  createdAt: Date;
  substituidoPorId: string | null;
  _count: { uploads: number; pendencias: number };
};

async function main() {
  const docs = (await prisma.documentoDisciplina.findMany({
    where: { substituidoPorId: null },
    select: {
      id: true,
      disciplinaId: true,
      chave: true,
      nomeArquivo: true,
      createdAt: true,
      substituidoPorId: true,
      _count: { select: { uploads: true, pendencias: true } },
    },
    orderBy: { createdAt: "asc" },
  })) as Doc[];

  // Agrupa pela chave NOVA (sem extensão), dentro da mesma disciplina.
  const grupos = new Map<string, Doc[]>();
  for (const d of docs) {
    const nova = chaveDocumento({
      // A chave guardada já embute o local; reconstruímos a partir dela para não depender
      // de reler os uploads. Formato: "<local>/<nome>" — o local é tudo antes da 1ª barra.
      pacote: null,
      pastaId: null,
      nomeArquivo: d.nomeArquivo,
    });
    const local = d.chave.includes("/") ? d.chave.slice(0, d.chave.indexOf("/")) : "";
    const chaveNova = `${d.disciplinaId}::${local}/${nova.slice(nova.indexOf("/") + 1)}`;
    const lista = grupos.get(chaveNova);
    if (lista) lista.push(d);
    else grupos.set(chaveNova, [d]);
  }

  const paraMesclar = [...grupos.entries()].filter(([, ds]) => ds.length > 1);
  const jaCertos = [...grupos.values()].filter((ds) => ds.length === 1).length;

  console.log("== Merge de documentos por nome-base (M4) ==");
  console.log("modo:", APLICAR ? "APLICAR (escreve — IRREVERSÍVEL)" : "RELATÓRIO (não escreve)");
  console.log("documentos vivos:", docs.length);
  console.log("grupos que já são únicos (nada a fazer):", jaCertos);
  console.log("grupos a mesclar:", paraMesclar.length);
  console.log("documentos que virarão apelido:", paraMesclar.reduce((s, [, ds]) => s + ds.length - 1, 0));

  if (paraMesclar.length > 0) {
    console.log("\namostra (até 15 grupos):");
    for (const [chave, ds] of paraMesclar.slice(0, 15)) {
      const ordenados = [...ds].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const canonico = ordenados[0];
      console.log(`  ${chave.split("::")[1]}`);
      for (const d of ordenados) {
        const marca = d.id === canonico.id ? "CANÔNICO" : "→ apelido";
        console.log(`      ${marca} ${d.nomeArquivo} (uploads=${d._count.uploads}, pendências=${d._count.pendencias})`);
      }
    }
  }

  if (!APLICAR) {
    console.log("\nNada foi escrito. Faça o pg_dump, revise a amostra e rode com --aplicar.");
    await prisma.$disconnect();
    return;
  }

  const log: { canonico: string; absorvidos: string[] }[] = [];
  for (const [, ds] of paraMesclar) {
    const ordenados = [...ds].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const canonico = ordenados[0];
    const perdedores = ordenados.slice(1);

    await prisma.$transaction(async (tx) => {
      for (const p of perdedores) {
        // Revisões primeiro, uma a uma: `documento_revisao` tem UNIQUE (documentoId, numero),
        // e canônico e perdedor quase sempre têm ambos a R01 — mover em bloco colide. Quando o
        // número já existe no canônico, os arquivos migram para a revisão dele e a duplicata
        // é apagada: é exatamente o resultado que a Fase 2 quer (PDF R01 + DWG R01 = uma R01
        // com dois arquivos). Quando não existe, a revisão só troca de dono.
        const revsPerdedor = await tx.documentoRevisao.findMany({
          where: { documentoId: p.id },
          select: { id: true, numero: true },
        });
        for (const rev of revsPerdedor) {
          const equivalente = await tx.documentoRevisao.findUnique({
            where: { documentoId_numero: { documentoId: canonico.id, numero: rev.numero } },
            select: { id: true },
          });
          if (equivalente) {
            await tx.upload.updateMany({ where: { revisaoId: rev.id }, data: { revisaoId: equivalente.id } });
            await tx.documentoRevisao.delete({ where: { id: rev.id } });
          } else {
            await tx.documentoRevisao.update({ where: { id: rev.id }, data: { documentoId: canonico.id } });
          }
        }
        // Tudo que pendurava no perdedor passa a pendurar no canônico.
        await tx.upload.updateMany({ where: { documentoId: p.id }, data: { documentoId: canonico.id } });
        await tx.pendencia.updateMany({ where: { documentoId: p.id }, data: { documentoId: canonico.id } });
        await tx.calibracaoPrancha.updateMany({ where: { documentoId: p.id }, data: { documentoId: canonico.id } });
        await tx.leituraDocumento.updateMany({ where: { documentoId: p.id }, data: { documentoId: canonico.id } });
        // Soft-retire + chave neutralizada, para não brigar pelo UNIQUE com o canônico.
        await tx.documentoDisciplina.update({
          where: { id: p.id },
          data: { substituidoPorId: canonico.id, chave: `merged:${p.id}` },
        });
      }
      await tx.documentoDisciplina.update({
        where: { id: canonico.id },
        data: { chave: chaveNovaDoDocumento(canonico) },
      });
    });
    log.push({ canonico: canonico.id, absorvidos: perdedores.map((p) => p.id) });
  }

  // Grupos de um só documento também precisam da chave nova (a extensão sai da chave).
  let renomeados = 0;
  for (const [, ds] of grupos) {
    if (ds.length !== 1) continue;
    const d = ds[0];
    const nova = chaveNovaDoDocumento(d);
    if (d.chave !== nova) {
      await prisma.documentoDisciplina.update({ where: { id: d.id }, data: { chave: nova } });
      renomeados += 1;
    }
  }

  const arquivo = `merge-documentos-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.json`;
  writeFileSync(arquivo, JSON.stringify({ quando: new Date().toISOString(), grupos: log }, null, 2), "utf8");
  console.log(`\ngrupos mesclados: ${log.length} | chaves atualizadas sem merge: ${renomeados}`);
  console.log(`mapa canônico→absorvidos em ${arquivo}`);
  await prisma.$disconnect();
}

/** Chave nova preservando o local (parte antes da primeira barra) da chave atual. */
function chaveNovaDoDocumento(d: { chave: string; nomeArquivo: string }): string {
  const local = d.chave.includes("/") ? d.chave.slice(0, d.chave.indexOf("/")) : "sem-local";
  const semExt = chaveDocumento({ pacote: null, pastaId: null, nomeArquivo: d.nomeArquivo });
  return `${local}/${semExt.slice(semExt.indexOf("/") + 1)}`;
}

main();
