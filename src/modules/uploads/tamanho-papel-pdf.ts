import "server-only";
import { promises as fs } from "node:fs";
import type { PgBoss } from "pg-boss";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { resolverCaminho } from "@/lib/storage";
import { classificarTamanhoPapel } from "@/modules/uploads/nomenclatura/tamanho-papel";
import { catalogosPrancha } from "@/modules/projetos/pranchas/queries";
import { registrarEventoDocumento } from "@/modules/uploads/historico/service";
import { camposAlterados } from "@/modules/uploads/historico/eventos";

/**
 * Leitura do tamanho do papel de um PDF recém-enviado (F4). Fire-and-forget, MESMO padrão de
 * `enfileirarConversao` (IFC) e `enfileirarConversaoDwg`: não bloqueia o upload, roda numa fila
 * própria do pg-boss, e só existe worker sob `dev:server`/produção — em `npm run dev` o job
 * fica publicado sem consumidor.
 *
 * Ao contrário das conversões, não há tabela de estado nem retry visível na tela: é só um
 * metadado a mais, nunca bloqueia nada, e falha silenciosa (log) é aceitável — o documento
 * segue utilizável sem `tamanhoPapelId`, exatamente como está hoje.
 */
export const FILA_TAMANHO_PAPEL_PDF = "ler-tamanho-papel-pdf";

/** PDF de prancha plotado passa longe disto; acima é sinal de algo fora do comum — não vale ler. */
const LIMITE_PDF_BYTES = 60 * 1024 * 1024;

/**
 * Acessa o pg-boss vivo pelo globalThis — mesma ponte de `lib/jobs.ts` e
 * `modules/coordenacao/service.ts`. Ler direto daqui evita puxar o grafo de handlers para o
 * bundle da rota de upload. `null` em `npm run dev` (sem server.ts).
 */
function bossVivo(): PgBoss | null {
  return (globalThis as unknown as { __senahubBoss?: PgBoss | null }).__senahubBoss ?? null;
}

/**
 * Publica a leitura na fila. Chamado pela rota de upload logo depois de gravar um PDF cujo
 * documento ainda não tem `tamanhoPapelId`. `singletonKey` pelo documento: se dois PDFs do
 * mesmo documento chegarem juntos (raro), só um precisa vencer a corrida de escrita.
 */
export async function enfileirarLeituraTamanhoPapel(documentoId: string, caminhoRelativo: string): Promise<void> {
  const boss = bossVivo();
  if (!boss) return; // sem worker (dev sem server.ts) — metadado fica ausente até o próximo backfill
  await boss.send(FILA_TAMANHO_PAPEL_PDF, { documentoId, caminho: caminhoRelativo }, { singletonKey: documentoId });
}

/**
 * Lê a 1ª página do PDF em `caminhoRelativo` e devolve a sigla A0–A4, ou `null` quando o
 * arquivo não existe, excede o limite de tamanho, está corrompido, ou a página não casa com
 * nenhum tamanho ISO conhecido. Nunca lança — quem chama trata ausência de leitura como
 * "não deu para classificar", não como erro.
 */
export async function lerTamanhoPapelPdf(caminhoRelativo: string) {
  try {
    const full = resolverCaminho(caminhoRelativo);
    const stat = await fs.stat(full);
    if (stat.size > LIMITE_PDF_BYTES) return null;
    const bytes = await fs.readFile(full);
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const primeira = doc.getPages()[0];
    if (!primeira) return null;
    const { width, height } = primeira.getSize();
    return classificarTamanhoPapel(width, height);
  } catch (err) {
    console.error(`[tamanho-papel] falha ao ler ${caminhoRelativo}:`, err);
    return null;
  }
}

/**
 * Handler da fila: lê o PDF, casa a sigla com o catálogo (projeto vence global, só ativos —
 * não se atribui um item que foi desativado) e grava SÓ SE o documento ainda estiver vazio
 * (`tamanhoPapelId: null` no `updateMany`). Sem escolha manual para este campo (F4 não abriu
 * edição de tamanho de papel no painel), então não há "manual" a respeitar — mas o
 * `updateMany` com a guarda ainda protege contra a corrida de dois jobs para o mesmo documento
 * e contra sobrescrever o que um backfill anterior já preencheu.
 */
export async function processarLeituraTamanhoPapel(documentoId: string, caminhoRelativo: string): Promise<void> {
  const documento = await prisma.documentoDisciplina.findUnique({
    where: { id: documentoId },
    select: { tamanhoPapelId: true, disciplina: { select: { projetoId: true } } },
  });
  if (!documento || documento.tamanhoPapelId) return;

  const sigla = await lerTamanhoPapelPdf(caminhoRelativo);
  if (!sigla) return;

  // Catálogo do projeto vence o global na mesma sigla (mesma precedência de `montarVocabulario`).
  const { folha } = await catalogosPrancha(documento.disciplina.projetoId);
  const encontrado =
    folha.find((f) => f.sigla === sigla && f.projetoId === documento.disciplina.projetoId) ??
    folha.find((f) => f.sigla === sigla && f.projetoId === null);
  if (!encontrado) return;

  const r = await prisma.documentoDisciplina.updateMany({
    where: { id: documentoId, tamanhoPapelId: null },
    data: { tamanhoPapelId: encontrado.id },
  });
  if (r.count === 0) return;

  const campos = camposAlterados({ tamanhoPapel: null }, { tamanhoPapel: sigla }, ["tamanhoPapel"] as const);
  await registrarEventoDocumento({
    documentoId,
    tipo: "metadados",
    userId: null,
    detalhe: { campos, origem: "pdf" },
  });
}
