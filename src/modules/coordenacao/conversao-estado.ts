/**
 * Coordenação BIM — lógica PURA da máquina de estados da conversão IFC → Fragments.
 * Sem I/O (nem Prisma, nem spawn, nem fs) para ser testável em isolamento.
 * O orquestrador (conversao.ts) e o converter (scripts/converter-ifc.ts) usam estas
 * funções; toda decisão de transição/retry/caminho fica aqui.
 */
import path from "node:path";

export type StatusConversao = "fila" | "processando" | "concluido" | "erro";

/** Nome da fila pg-boss on-demand da conversão IFC → Fragments. */
export const FILA_CONVERTER_IFC = "converter-ifc";

/** Nº máximo de tentativas (o enfileiramento recusa quando já esgotou). */
export const MAX_TENTATIVAS = 3;

/** Tamanho máximo do IFC aceito para conversão (limite prático do wasm32 ~4 GB). */
export const TAMANHO_MAX_IFC = 2 * 1024 * 1024 * 1024; // 2 GB

/**
 * Pode (re)enfileirar a conversão deste modelo?
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
  caminhoFrag?: string | null;
  tamanhoFrag?: number | null;
  duracaoMs?: number | null;
}): {
  status: Extract<StatusConversao, "concluido" | "erro">;
  caminhoFrag: string | null;
  tamanhoFrag: number | null;
  erro: string | null;
  duracaoMs: number | null;
} {
  const okProcesso = saida.code === 0 && !saida.erro && !!saida.caminhoFrag;
  if (okProcesso) {
    return {
      status: "concluido",
      caminhoFrag: saida.caminhoFrag ?? null,
      tamanhoFrag: saida.tamanhoFrag ?? null,
      erro: null,
      duracaoMs: saida.duracaoMs ?? null,
    };
  }
  return {
    status: "erro",
    caminhoFrag: null,
    tamanhoFrag: null,
    erro: saida.erro?.slice(0, 500) || `Conversão falhou (código ${saida.code ?? "?"}).`,
    duracaoMs: saida.duracaoMs ?? null,
  };
}

/**
 * Caminho relativo (posix, sob STORAGE_BASE_PATH) onde o .frag é gravado.
 * `.../{disciplina}/{pacote}/{arquivo.ifc}` → `.../{disciplina}/COORDENACAO/{uploadId}.frag`
 * (irmão da pasta do pacote, um por versão de Upload).
 */
export function caminhoFragDeUpload(uploadCaminho: string, uploadId: string): string {
  const posix = path.posix;
  const normal = uploadCaminho.replace(/\\/g, "/");
  const discDir = posix.dirname(posix.dirname(normal));
  return posix.join(discDir, "COORDENACAO", `${uploadId}.frag`);
}

/**
 * Caminho relativo do .frag de um IFC RECEBIDO do cliente (DocumentoVersao). O
 * repositório de documentos tem estrutura de pastas própria; o .frag vai numa pasta
 * `COORDENACAO` irmã do arquivo, nomeada pelo id da versão (um .frag por versão).
 */
export function caminhoFragDeDocumento(versaoCaminho: string, versaoId: string): string {
  const posix = path.posix;
  const normal = versaoCaminho.replace(/\\/g, "/");
  return posix.join(posix.dirname(normal), "COORDENACAO", `${versaoId}.frag`);
}

/**
 * Valida o cabeçalho de um IFC (texto dos primeiros KB do arquivo). Todo IFC STEP
 * começa com `ISO-10303-21;` e declara o schema em `FILE_SCHEMA(('IFC4'))`.
 * Retorna o schema declarado (para contexto) ou o motivo amigável da recusa.
 */
export function validarHeaderIfc(header: string): { ok: boolean; schema: string | null; motivo?: string } {
  if (!header.includes("ISO-10303-21")) {
    return {
      ok: false,
      schema: null,
      motivo:
        "O arquivo não é um IFC válido: falta o cabeçalho ISO-10303-21. " +
        "Confirme que enviou o modelo IFC (e não outro arquivo renomeado) e que ele não está corrompido.",
    };
  }
  const m = header.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i);
  return { ok: true, schema: m ? m[1] : null };
}

/** Schemas IFC que o web-ifc converte com segurança (prefixos). */
const SCHEMAS_SUPORTADOS = ["IFC2X3", "IFC4"];

/** True quando o schema declarado provavelmente não é suportado pelo web-ifc. */
export function schemaProvavelmenteNaoSuportado(schema: string | null): boolean {
  if (!schema) return false; // sem schema declarado → deixa tentar
  const s = schema.toUpperCase();
  return !SCHEMAS_SUPORTADOS.some((p) => s.startsWith(p));
}

/**
 * Traduz o erro cru da conversão (web-ifc/IfcImporter, timeout, header) numa
 * mensagem acionável em pt-BR — o usuário precisa saber o que corrigir antes de
 * reenviar o IFC. Fonte única de classificação (o converter só lança o cru).
 */
export function explicarErroConversao(raw: string): string {
  const texto = (raw ?? "").trim();
  const r = texto.toLowerCase();
  if (!texto) return "Erro desconhecido na conversão do IFC.";

  if (/out of memory|allocation failed|cannot enlarge memory|memory access out of bounds|invalid array length|maximum call stack|rangeerror/.test(r)) {
    return "Memória insuficiente para converter — o IFC é grande ou tem geometria muito pesada. Exporte por pavimento/setor no Revit e reenvie.";
  }
  if (/excede o limite de conversão/.test(r)) {
    return texto; // já é a mensagem amigável do teto de tamanho
  }
  if (/iso-10303-21|não é um ifc|nao e um ifc|not an ifc/.test(r)) {
    return "O arquivo não é um IFC válido (cabeçalho ausente ou corrompido). Reexporte o modelo como IFC no Revit e reenvie.";
  }
  if (/file_schema|schema|ifc2x2|ifc4x1|unsupported schema|não suportad|nao suportad/.test(r)) {
    return "Versão do schema IFC não suportada. Exporte como IFC 4 ou IFC 2x3 no Revit (nas opções de exportação IFC).";
  }
  if (/unexpected token|parse|syntax|malformed|unterminated|corrupt/.test(r)) {
    return "O IFC está mal formado ou incompleto (falha ao ler a estrutura do arquivo). O upload pode ter sido interrompido — reenvie o arquivo.";
  }
  if (/no geometry|sem geometria|empty model|no meshes|zero/.test(r)) {
    return "O IFC não tem geometria conversível (modelo vazio ou só com dados). Confira o que foi marcado na exportação IFC.";
  }
  if (/excedeu.*min|timeout|passou do tempo/.test(r)) {
    return "A conversão passou do tempo limite e foi abortada — o modelo é muito pesado. Exporte por disciplina/setor e reenvie.";
  }
  // Abort do WASM do web-ifc (Emscripten): o motor não conseguiu processar o IFC.
  // Mensagem crua típica: "Aborted(). Build with -sASSERTIONS for more info."
  if (/\baborted\b|assertions|sassertions|emscripten|wasm|unreachable/.test(r)) {
    return (
      "O motor de conversão não conseguiu processar este IFC. Costuma ser geometria " +
      "não suportada, coordenadas absolutas muito distantes da origem, ou o arquivo " +
      "grande/incompleto. Tente reexportar do Revit como IFC 2x3 (mais compatível) ou " +
      "IFC 4 com a opção de coordenadas na origem/base do projeto; se for grande, " +
      "exporte por pavimento/setor. Se persistir, envie o arquivo ao suporte."
    );
  }
  // Desconhecido: preserva o texto cru para o suporte investigar.
  return `Falha na conversão: ${texto}`;
}
