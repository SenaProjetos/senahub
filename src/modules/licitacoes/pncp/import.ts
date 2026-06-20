import "server-only";
import { prisma } from "@/lib/prisma";
import { notificarAdmins } from "@/lib/notifications";
import { getConfigLicitacoes } from "@/modules/licitacoes/config/queries";
import {
  buscarContratacoesPNCP,
  formatarDataPNCP,
  PNCPError,
  type PNCPContratacao,
} from "@/modules/licitacoes/pncp/client";

/** Teto de páginas por modalidade — evita laço infinito em janelas grandes. */
const MAX_PAGINAS_POR_MODALIDADE = 20;
const TAMANHO_PAGINA = 50;
const MAX_TITULO = 200;

/** Remove acentos e baixa a caixa, para casamento de palavra-chave tolerante. */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Verifica se o objeto contém ALGUMA das palavras-chave (já normalizadas). */
function casaPalavraChave(objeto: string, chavesNorm: string[]): boolean {
  const alvo = normalizar(objeto);
  return chavesNorm.some((c) => alvo.includes(c));
}

/** Converte a data ISO de encerramento da proposta em Date (ou null). */
function parsePrazo(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Importa editais do PNCP filtrados pelas palavras-chave configuradas.
 * - No-op se modo != "api" OU sem palavras-chave.
 * - Nunca lança: o lote inteiro está em try/catch e cada item também.
 * @returns { importados, verificados } — quantos foram criados e quantos itens foram avaliados.
 */
export async function importarEditaisPNCP(): Promise<{ importados: number; verificados: number }> {
  let importados = 0;
  let verificados = 0;

  try {
    const cfg = await getConfigLicitacoes();
    const { modo, palavrasChave, modalidades, ufs, janelaDias } = cfg.pncp;

    // Guardas: só roda no modo API e com palavras-chave definidas.
    if (modo !== "api" || palavrasChave.length === 0) {
      return { importados: 0, verificados: 0 };
    }
    if (modalidades.length === 0) {
      return { importados: 0, verificados: 0 };
    }

    const chavesNorm = palavrasChave.map(normalizar).filter((c) => c.length > 0);
    if (chavesNorm.length === 0) return { importados: 0, verificados: 0 };

    const ufsNorm = ufs.map((u) => u.trim().toUpperCase()).filter((u) => u.length > 0);

    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - Math.max(0, janelaDias));
    const dataFinal = formatarDataPNCP(hoje);
    const dataInicial = formatarDataPNCP(inicio);

    for (const modalidade of modalidades) {
      let pagina = 1;
      let totalPaginas = 1;

      while (pagina <= totalPaginas && pagina <= MAX_PAGINAS_POR_MODALIDADE) {
        let resultado: { data: PNCPContratacao[]; totalPaginas: number };
        try {
          resultado = await buscarContratacoesPNCP({
            modalidade,
            dataInicial,
            dataFinal,
            pagina,
            tamanhoPagina: TAMANHO_PAGINA,
          });
        } catch (err) {
          // Falha de página: loga e segue para a próxima modalidade.
          const msg = err instanceof PNCPError ? err.message : String(err);
          await registrarLog({
            referencia: `modalidade:${modalidade}:pagina:${pagina}`,
            status: "erro",
            mensagem: `Consulta PNCP falhou: ${msg}`,
          });
          break;
        }

        totalPaginas = Math.max(1, resultado.totalPaginas);

        for (const item of resultado.data) {
          verificados++;
          try {
            const novo = await processarItem(item, chavesNorm, ufsNorm);
            if (novo) importados++;
          } catch (err) {
            // Erro por item nunca derruba o lote.
            await registrarLog({
              referencia: item?.numeroControlePNCP ?? null,
              status: "erro",
              mensagem: `Falha ao importar: ${err instanceof Error ? err.message : String(err)}`,
              payload: safePayload(item),
            });
          }
        }

        pagina++;
      }
    }

    if (importados > 0) {
      await notificarAdmins({
        titulo: "Editais importados do PNCP",
        corpo: `${importados} novo(s) edital(is) importado(s) do PNCP.`,
        href: "/licitacoes",
      });
    }
  } catch (err) {
    // Falha global (config, etc.) — registra e retorna o que houver.
    try {
      await registrarLog({
        referencia: null,
        status: "erro",
        mensagem: `Importação PNCP abortou: ${err instanceof Error ? err.message : String(err)}`,
      });
    } catch {
      // se nem o log grava, não há mais o que fazer.
    }
  }

  return { importados, verificados };
}

/**
 * Avalia um item: aplica filtros, deduplica e cria a Licitacao + log.
 * @returns true se criou uma nova Licitacao; false se foi filtrado/duplicado.
 */
async function processarItem(
  item: PNCPContratacao,
  chavesNorm: string[],
  ufsNorm: string[],
): Promise<boolean> {
  const numeroControle = item?.numeroControlePNCP;
  if (!numeroControle) return false;

  const objeto = item.objetoCompra ?? "";
  if (!casaPalavraChave(objeto, chavesNorm)) return false;

  // Filtro de UF (quando configurado).
  if (ufsNorm.length > 0) {
    const uf = (item.unidadeOrgao?.ufSigla ?? "").trim().toUpperCase();
    if (!ufsNorm.includes(uf)) return false;
  }

  // DEDUP 1: já existe Licitacao com esse numeroControlePNCP.
  const jaExiste = await prisma.licitacao.findFirst({
    where: { numeroControlePNCP: numeroControle },
    select: { id: true },
  });
  if (jaExiste) return false;

  // DEDUP 2: já houve import ok desse numeroControle (mesmo que a Licitacao tenha sido removida).
  const jaImportado = await prisma.integracaoPNCPLog.findFirst({
    where: { direcao: "import", referencia: numeroControle, status: "ok" },
    select: { id: true },
  });
  if (jaImportado) return false;

  const titulo = (objeto || numeroControle).slice(0, MAX_TITULO);
  const valor = typeof item.valorTotalEstimado === "number" ? item.valorTotalEstimado : null;

  const lic = await prisma.licitacao.create({
    data: {
      titulo,
      orgao: item.orgaoEntidade?.razaoSocial ?? null,
      modalidade: item.modalidadeNome ?? null,
      prazoProposta: parsePrazo(item.dataEncerramentoProposta),
      valorEstimado: valor,
      numeroControlePNCP: numeroControle,
      pncpUrl: item.linkSistemaOrigem ?? null,
      origemPNCP: true,
      status: "em_andamento",
    },
    select: { id: true },
  });

  await registrarLog({
    referencia: numeroControle,
    licitacaoId: lic.id,
    status: "ok",
    mensagem: `Edital importado: ${titulo}`,
    payload: safePayload(item),
  });

  return true;
}

/** Grava um IntegracaoPNCPLog de import. Engole falhas para não derrubar o lote. */
async function registrarLog(input: {
  referencia: string | null;
  licitacaoId?: string | null;
  status: "ok" | "erro";
  mensagem: string;
  payload?: unknown;
}): Promise<void> {
  try {
    await prisma.integracaoPNCPLog.create({
      data: {
        direcao: "import",
        referencia: input.referencia,
        licitacaoId: input.licitacaoId ?? null,
        status: input.status,
        mensagem: input.mensagem,
        payload: (input.payload ?? undefined) as never,
      },
    });
  } catch {
    // não propaga: log é best-effort.
  }
}

/** Garante que o payload seja JSON serializável (evita ciclos/objetos exóticos). */
function safePayload(item: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(item));
  } catch {
    return undefined;
  }
}
