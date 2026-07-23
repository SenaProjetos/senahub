/**
 * Visualizador DWG — lógica PURA da máquina de estados da conversão DWG → DXF
 * (via ODA File Converter, subprocesso externo). Sem I/O (nem Prisma, nem spawn,
 * nem fs) para ser testável em isolamento — mesmo desenho de
 * `modules/coordenacao/conversao-estado.ts`, adaptado ao formato 2D e à origem
 * dupla (Upload de disciplina OU DocumentoVersao do repositório Documento).
 * O orquestrador (conversao.ts) e o converter (scripts/converter-dwg.ts) usam
 * estas funções; toda decisão de transição/retry/caminho fica aqui.
 */
import path from "node:path";

export type StatusConversao = "fila" | "processando" | "concluido" | "erro";

/** Nome da fila pg-boss on-demand da conversão DWG → DXF. */
export const FILA_CONVERTER_DWG = "converter-dwg";

/** Nº máximo de tentativas (o enfileiramento recusa quando já esgotou). */
export const MAX_TENTATIVAS = 3;

/**
 * Tamanho máximo do DWG aceito para conversão. DWGs reais raramente passam de
 * dezenas de MB; 500 MB é uma folga generosa, não um valor pesquisado — ajustar
 * se a prática mostrar necessário.
 */
export const TAMANHO_MAX_DWG = 500 * 1024 * 1024; // 500 MB

/**
 * Pode (re)enfileirar a conversão deste arquivo?
 * - `fila`/`processando`: já está em andamento, não reenfileira.
 * - `concluido`: só reprocessa se forçado (nova versão gera OUTRA linha, não passa por aqui).
 * - `erro`: reprocessa enquanto não estourou o teto de tentativas.
 * - sem linha ainda (`undefined`): sempre pode.
 */
export function podeEnfileirar(
  atual: { status: StatusConversao; tentativas: number } | undefined,
  opts: { forcar?: boolean } = {},
): boolean {
  if (!atual) return true;
  if (opts.forcar) return atual.status !== "processando";
  switch (atual.status) {
    case "erro":
      return atual.tentativas < MAX_TENTATIVAS;
    case "concluido":
    case "fila":
    case "processando":
      return false;
  }
}

/** Resultado do processo converter → estado final + campos a gravar. */
export function resultadoConversao(saida: {
  code: number | null;
  erro?: string | null;
  caminhoDxf?: string | null;
  tamanhoDxf?: number | null;
  duracaoMs?: number | null;
}): {
  status: Extract<StatusConversao, "concluido" | "erro">;
  caminhoDxf: string | null;
  tamanhoDxf: number | null;
  erro: string | null;
  duracaoMs: number | null;
} {
  const okProcesso = saida.code === 0 && !saida.erro && !!saida.caminhoDxf;
  if (okProcesso) {
    return {
      status: "concluido",
      caminhoDxf: saida.caminhoDxf ?? null,
      tamanhoDxf: saida.tamanhoDxf ?? null,
      erro: null,
      duracaoMs: saida.duracaoMs ?? null,
    };
  }
  return {
    status: "erro",
    caminhoDxf: null,
    tamanhoDxf: null,
    erro: saida.erro?.slice(0, 500) || `Conversão falhou (código ${saida.code ?? "?"}).`,
    duracaoMs: saida.duracaoMs ?? null,
  };
}

/**
 * Caminho relativo (posix, sob STORAGE_BASE_PATH) onde o .dxf de um Upload de
 * disciplina é gravado.
 * `.../{disciplina}/{pacote}/{arquivo.dwg}` → `.../{disciplina}/DWG/{uploadId}.dxf`
 * (irmão da pasta do pacote, um por versão de Upload). Pasta própria `DWG/` —
 * não reaproveita `COORDENACAO/` (aquela é escaneada pelo job de limpeza do IFC).
 */
export function caminhoDxfDeUpload(uploadCaminho: string, uploadId: string): string {
  const posix = path.posix;
  const normal = uploadCaminho.replace(/\\/g, "/");
  const discDir = posix.dirname(posix.dirname(normal));
  return posix.join(discDir, "DWG", `${uploadId}.dxf`);
}

/**
 * Caminho relativo do .dxf de um DWG do repositório Documento (DocumentoVersao —
 * Recebidos do cliente/Geral). O .dxf vai numa pasta `DWG` irmã do arquivo,
 * nomeada pelo id da versão (um .dxf por versão).
 */
export function caminhoDxfDeDocumento(versaoCaminho: string, versaoId: string): string {
  const posix = path.posix;
  const normal = versaoCaminho.replace(/\\/g, "/");
  return posix.join(posix.dirname(normal), "DWG", `${versaoId}.dxf`);
}

/** Assinaturas binárias conhecidas de DWG (6 bytes ASCII no início do arquivo). */
const ASSINATURAS_DWG_CONHECIDAS = [
  "AC1004", // R9
  "AC1006", // R10
  "AC1009", // R11/R12
  "AC1012", // R13
  "AC1014", // R14
  "AC1015", // 2000/2000i/2002
  "AC1018", // 2004/2005/2006
  "AC1021", // 2007/2008/2009
  "AC1024", // 2010/2011/2012
  "AC1027", // 2013–2017
  "AC1032", // 2018+
];

/**
 * Valida a assinatura binária de um DWG (os 6 primeiros bytes ASCII do arquivo,
 * ex.: `AC1032`). Falha rápido com mensagem amigável antes de gastar tempo
 * invocando o ODA File Converter num arquivo que não é DWG de verdade.
 */
export function validarAssinaturaDwg(bytes: Uint8Array): { ok: boolean; versao: string | null; motivo?: string } {
  if (bytes.length < 6) {
    return { ok: false, versao: null, motivo: "Arquivo pequeno demais para ser um DWG válido." };
  }
  const assinatura = Buffer.from(bytes.subarray(0, 6)).toString("ascii");
  if (!/^AC10\d{2}$/.test(assinatura)) {
    return {
      ok: false,
      versao: null,
      motivo:
        "O arquivo não é um DWG válido: falta a assinatura AutoCAD (ex.: AC1032). " +
        "Confirme que enviou o arquivo .dwg correto (e não outro arquivo renomeado) e que ele não está corrompido.",
    };
  }
  if (!ASSINATURAS_DWG_CONHECIDAS.includes(assinatura)) {
    return {
      ok: true,
      versao: assinatura,
      motivo: `Versão de DWG ${assinatura} não reconhecida na lista conhecida — a conversão pode falhar.`,
    };
  }
  return { ok: true, versao: assinatura };
}

/**
 * Traduz o erro cru da conversão (ODA File Converter, timeout, assinatura) numa
 * mensagem acionável em pt-BR. O ODA não dá stdout/stderr em uso normal (confirmado
 * em spike) — a maior parte dos erros aqui vem do próprio orquestrador/script
 * (arquivo de saída ausente, timeout, exe não encontrado), não de texto da ODA.
 * Fonte única de classificação (o converter só lança o cru).
 */
export function explicarErroConversaoDwg(raw: string): string {
  const texto = (raw ?? "").trim();
  const r = texto.toLowerCase();
  if (!texto) return "Erro desconhecido na conversão do DWG.";

  if (/não é um dwg|nao e um dwg|not a dwg|assinatura/.test(r)) {
    return "O arquivo não é um DWG válido (assinatura ausente ou corrompida). Reexporte o arquivo como DWG e reenvie.";
  }
  if (/excede o limite de conversão|excede o tamanho/.test(r)) {
    return texto; // já é a mensagem amigável do teto de tamanho
  }
  if (/enoent|não encontrado|not found|oda_converter_path/i.test(texto)) {
    return "Conversor de DWG não está configurado neste servidor (ODA_CONVERTER_PATH). Avise o suporte.";
  }
  if (/timeout|passou do tempo|excedeu.*min/.test(r)) {
    return "A conversão passou do tempo limite e foi abortada. Se o DWG for muito grande/complexo, avise o suporte.";
  }
  if (/nenhum .*\.dxf|arquivo de sa[ií]da (ausente|não gerado)|no .dxf produced/i.test(texto)) {
    return "O conversor rodou mas não gerou o arquivo de saída — o DWG pode ter conteúdo não suportado. Tente reexportar de outra versão do AutoCAD.";
  }
  // Desconhecido: preserva o texto cru para o suporte investigar.
  return `Falha na conversão: ${texto}`;
}
