import "dotenv/config";
import type { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/prisma";
import { camposAlterados, categoriaDoTipo, type TipoEvento } from "../src/modules/uploads/historico/eventos";

/**
 * Leva ao histórico por documento (`DocumentoEvento`) o que o AuditLog já registrava antes da
 * feature existir (decisão do dono em 2026-09-15: "importar o que dá pra ligar").
 *
 * Só entra evento que aponta COM CERTEZA para um documento: `entidadeId` que é id de Upload, ou
 * `uploadId`/`documentoId` presente no input auditado. Fica de fora o que foi auditado só com
 * `disciplinaId`/`projetoId` sem o arquivo no input — `enviar-arquivos`, `validar-arquivos-lote`
 * (o input lista também os ignorados) e `excluir-arquivo-definitivo` (o Upload já não existe).
 * Downloads antigos entram como "download": antes não se distinguia a abertura no visualizador.
 *
 * SEM `--aplicar` roda em modo relatório. Idempotente: `auditLogId` é unique e o insert usa
 * `skipDuplicates` — reexecutar não duplica. Linhas importadas não são agrupadas (cada log vira
 * uma linha), justamente para manter essa idempotência.
 */

const APLICAR = process.argv.includes("--aplicar");

const ACOES: Record<string, TipoEvento> = {
  "download-arquivo": "download",
  "download-link-publico": "download",
  "editar-metadados-documento": "metadados",
  "atualizar-status-documento": "status",
  "validar-arquivo": "validacao",
  "reverter-validacao-arquivo": "validacao_revertida",
  "solicitar-ajuste-arquivo": "ajuste_solicitado",
  "renomear-arquivo": "renomeio",
  "excluir-arquivo": "lixeira",
  "restaurar-arquivo": "restauracao",
  "solicitar-exclusao-arquivo": "exclusao_solicitada",
  "aprovar-exclusao-arquivo": "exclusao_aprovada",
  "recusar-exclusao-arquivo": "exclusao_recusada",
  "gerar-aceite-cliente": "aceite_gerado",
  "revogar-aceite-cliente": "aceite_revogado",
  "enviar-apontamentos": "apontamentos_enviados",
  "adicionar-documento-lista": "lista_adicionado",
  "remover-documento-lista": "lista_removido",
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

async function main() {
  const logs = await prisma.auditLog.findMany({
    where: { acao: { in: Object.keys(ACOES) }, resultado: "sucesso" },
    select: { id: true, acao: true, entidade: true, entidadeId: true, userId: true, detalhe: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Upload referenciado por cada log: entidadeId de Upload, ou o uploadId do input auditado
  // (defineAction grava `{ antes, novo: input }` com capturarAntes, ou o input direto).
  const uploadDoLog = (l: (typeof logs)[number]): string | null => {
    const d = obj(l.detalhe);
    if (l.entidade === "Upload" && l.acao !== "renomear-arquivo" && l.acao !== "excluir-arquivo" && l.acao !== "restaurar-arquivo") {
      return l.entidadeId;
    }
    return str(d.uploadId) ?? str(obj(d.novo).uploadId) ?? str(obj(d.antes).uploadId);
  };
  const documentoDoLog = (l: (typeof logs)[number]): string | null => {
    const d = obj(l.detalhe);
    if (l.entidade === "DocumentoDisciplina") return l.entidadeId;
    return str(d.documentoId) ?? str(obj(d.novo).documentoId);
  };

  const uploadIds = [...new Set(logs.map(uploadDoLog).filter((id): id is string => id !== null))];
  const [uploads, fases, status, listas, links, docsExistentes] = await Promise.all([
    // Lookup só por id: isento do filtro de lixeira (lib/prisma.ts) — arquivo na lixeira conta.
    prisma.upload.findMany({ where: { id: { in: uploadIds } }, select: { id: true, documentoId: true, nomeArquivo: true, versao: true } }),
    prisma.pranchaCatalogo.findMany({ where: { categoria: "fase" }, select: { id: true, sigla: true } }),
    prisma.documentoStatus.findMany({ select: { id: true, nome: true } }),
    prisma.listaDocumentos.findMany({ select: { id: true, nome: true } }),
    prisma.linkPublicoArquivos.findMany({ select: { id: true, token: true } }),
    prisma.documentoDisciplina.findMany({ select: { id: true } }),
  ]);
  const uploadPorId = new Map(uploads.map((u) => [u.id, u]));
  const siglaFase = new Map(fases.map((f) => [f.id, f.sigla]));
  const nomeStatus = new Map(status.map((s) => [s.id, s.nome]));
  const nomeLista = new Map(listas.map((l) => [l.id, l.nome]));
  const linkPorToken = new Map(links.map((l) => [l.token, l.id]));
  const docValido = new Set(docsExistentes.map((d) => d.id));

  const linhas: Prisma.DocumentoEventoCreateManyInput[] = [];
  const porTipo = new Map<string, number>();
  const ignorados = new Map<string, number>();
  const ignorar = (acao: string) => ignorados.set(acao, (ignorados.get(acao) ?? 0) + 1);

  for (const l of logs) {
    const tipo = ACOES[l.acao];
    const d = obj(l.detalhe);
    const antes = obj(d.antes);
    const novo = Object.keys(obj(d.novo)).length ? obj(d.novo) : d;
    const upload = (() => {
      const id = uploadDoLog(l);
      return id ? uploadPorId.get(id) : undefined;
    })();
    const documentoId = upload?.documentoId ?? documentoDoLog(l);
    if (!documentoId || !docValido.has(documentoId)) {
      ignorar(l.acao);
      continue;
    }

    let detalhe: Obj = upload ? { arquivo: upload.nomeArquivo, versao: upload.versao } : {};
    if (tipo === "metadados") {
      const campos = camposAlterados(
        { titulo: str(antes.titulo), descricao: str(antes.descricao), fase: str(antes.faseId) ? siglaFase.get(antes.faseId as string) ?? null : null },
        { titulo: str(novo.titulo), descricao: str(novo.descricao), fase: str(novo.faseId) ? siglaFase.get(novo.faseId as string) ?? null : null },
        ["titulo", "descricao", "fase"] as const,
      );
      if (Object.keys(campos).length === 0) {
        ignorar(l.acao);
        continue;
      }
      detalhe = { campos };
    } else if (tipo === "status") {
      const de = str(antes.statusId) ? nomeStatus.get(antes.statusId as string) ?? null : null;
      const para = str(novo.statusId) ? nomeStatus.get(novo.statusId as string) ?? null : null;
      if (de === para) {
        ignorar(l.acao);
        continue;
      }
      detalhe = { de, para };
    } else if (tipo === "renomeio") {
      detalhe = { ...detalhe, de: str(antes.nomeArquivo), para: str(novo.nome) };
    } else if (tipo === "ajuste_solicitado" || tipo === "exclusao_recusada") {
      detalhe = { ...detalhe, motivo: str(novo.motivo) };
    } else if (tipo === "exclusao_solicitada") {
      detalhe = { ...detalhe, justificativa: str(novo.justificativa) };
    } else if (tipo === "lixeira" || tipo === "restauracao") {
      detalhe = { ...detalhe, escopo: str(novo.escopo) ?? "revisao" };
    } else if (tipo === "lista_adicionado" || tipo === "lista_removido") {
      // `antes` preenchido na adição = já estava na lista: no-op, não é evento.
      if (tipo === "lista_adicionado" && d.antes) {
        ignorar(l.acao);
        continue;
      }
      detalhe = { lista: nomeLista.get(str(novo.listaId) ?? "") ?? null };
    }

    const linkPublico = l.acao === "download-link-publico";
    linhas.push({
      documentoId,
      uploadId: upload?.id ?? null,
      tipo,
      categoria: categoriaDoTipo(tipo),
      origem: linkPublico ? "link_publico" : "interno",
      userId: linkPublico ? null : l.userId,
      linkId: linkPublico ? linkPorToken.get(str(d.token) ?? "") ?? null : null,
      detalhe: { ...detalhe, importado: true } as Prisma.InputJsonValue,
      auditLogId: l.id,
      createdAt: l.createdAt,
      ultimoEm: l.createdAt,
    });
    porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + 1);
  }

  const jaImportados = await prisma.documentoEvento.count({ where: { auditLogId: { not: null } } });
  console.log("== Backfill do histórico por documento ==");
  console.log("modo:", APLICAR ? "APLICAR (escreve)" : "RELATÓRIO (não escreve)");
  console.log("logs candidatos:", logs.length, "| já importados antes:", jaImportados);
  console.log("importáveis por tipo:", JSON.stringify(Object.fromEntries(porTipo)));
  console.log("ignorados (sem documento certo ou sem mudança):", JSON.stringify(Object.fromEntries(ignorados)));

  if (!APLICAR || linhas.length === 0) {
    console.log(APLICAR ? "\nNada a fazer." : "\nNada foi escrito. Revise o relatório e rode com --aplicar.");
    await prisma.$disconnect();
    return;
  }

  let gravados = 0;
  for (let i = 0; i < linhas.length; i += 500) {
    const r = await prisma.documentoEvento.createMany({ data: linhas.slice(i, i + 500), skipDuplicates: true });
    gravados += r.count;
  }
  console.log(`\ngravados: ${gravados} (duplicados ignorados: ${linhas.length - gravados})`);
  await prisma.$disconnect();
}

main();
