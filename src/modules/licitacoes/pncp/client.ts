// Cliente da API pública de consulta do PNCP (Portal Nacional de Contratações Públicas).
// Sem auth, sem dependência nova — usa o fetch global.
// Endpoint verificado: GET /api/consulta/v1/contratacoes/publicacao

const BASE_URL = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao";

/** Órgão da contratação (recorte dos campos usados). */
export type PNCPOrgaoEntidade = {
  razaoSocial?: string | null;
};

/** Unidade do órgão (recorte dos campos usados). */
export type PNCPUnidadeOrgao = {
  ufSigla?: string | null;
  municipioNome?: string | null;
};

/** Item de contratação retornado pela consulta de publicação. */
export type PNCPContratacao = {
  numeroControlePNCP: string;
  objetoCompra?: string | null;
  orgaoEntidade?: PNCPOrgaoEntidade | null;
  unidadeOrgao?: PNCPUnidadeOrgao | null;
  /** ISO, ex.: "2026-07-06T08:31:00". */
  dataEncerramentoProposta?: string | null;
  modalidadeNome?: string | null;
  valorTotalEstimado?: number | null;
  linkSistemaOrigem?: string | null;
};

type PNCPResposta = {
  data?: PNCPContratacao[];
  totalPaginas?: number;
  totalRegistros?: number;
  numeroPagina?: number;
  paginasRestantes?: number;
  empty?: boolean;
};

/** Erro encapsulado de rede/HTTP, para o chamador logar e seguir. */
export class PNCPError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "PNCPError";
  }
}

/** Formata uma data no padrão yyyyMMdd exigido pela API. */
export function formatarDataPNCP(d: Date): string {
  const ano = d.getFullYear().toString().padStart(4, "0");
  const mes = (d.getMonth() + 1).toString().padStart(2, "0");
  const dia = d.getDate().toString().padStart(2, "0");
  return `${ano}${mes}${dia}`;
}

export type BuscarContratacoesParams = {
  modalidade: number;
  /** Date OU string já em yyyyMMdd. */
  dataInicial: Date | string;
  dataFinal: Date | string;
  pagina: number;
  tamanhoPagina?: number;
};

/**
 * Busca uma página de contratações publicadas no PNCP para UMA modalidade.
 * Lança PNCPError em falha de rede/HTTP/parse — o chamador deve try/catch e logar.
 */
export async function buscarContratacoesPNCP(
  params: BuscarContratacoesParams,
): Promise<{ data: PNCPContratacao[]; totalPaginas: number }> {
  const { modalidade, pagina, tamanhoPagina = 50 } = params;
  const dataInicial =
    typeof params.dataInicial === "string" ? params.dataInicial : formatarDataPNCP(params.dataInicial);
  const dataFinal =
    typeof params.dataFinal === "string" ? params.dataFinal : formatarDataPNCP(params.dataFinal);

  const qs = new URLSearchParams({
    dataInicial,
    dataFinal,
    codigoModalidadeContratacao: String(modalidade),
    pagina: String(pagina),
    tamanhoPagina: String(tamanhoPagina),
  });
  const url = `${BASE_URL}?${qs.toString()}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch (err) {
    throw new PNCPError(
      `Falha de rede ao consultar PNCP: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // A API responde 204 quando não há registros na página — trata como vazio.
  if (resp.status === 204) {
    return { data: [], totalPaginas: 0 };
  }
  if (!resp.ok) {
    throw new PNCPError(`PNCP respondeu HTTP ${resp.status}`, resp.status);
  }

  let json: PNCPResposta;
  try {
    json = (await resp.json()) as PNCPResposta;
  } catch (err) {
    throw new PNCPError(
      `Resposta do PNCP não é JSON válido: ${err instanceof Error ? err.message : String(err)}`,
      resp.status,
    );
  }

  return {
    data: Array.isArray(json.data) ? json.data : [],
    totalPaginas: typeof json.totalPaginas === "number" ? json.totalPaginas : 0,
  };
}
