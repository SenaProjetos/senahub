// src/modules/coordenacao/federado/regras.ts
/**
 * Regras do IFC federado (spec 2026-10-04 §4) — PURO. A mesma função decide o que o diálogo desabilita, o que
 * a action recusa e o que o job confere; a frase é a mesma nos três lugares.
 */
/**
 * Soma máxima das entradas: 2 GB, o mesmo `TAMANHO_MAX_IFC` do conversor (um teste garante que não divergem).
 * Não é importado de `conversao-estado.ts` de propósito: aquele arquivo importa `node:path`, e este roda no
 * navegador (diálogo de exportar) — o webpack do `dev:server` recusa o módulo e a tela da Compatibilização quebra.
 */
export const LIMITE_ENTRADA_FEDERADO = 2 * 1024 * 1024 * 1024;

export const FILA_FEDERAR_IFC = "gerar-ifc-federado";
export const GRUPO_FEDERADO = "Modelo federado";
export const MINUTOS_GERACAO_TRAVADA = 45;

export const MOTIVO_NAO_CONVERTIDO = "Este modelo ainda não foi convertido. Aguarde ou reconverta na lista de modelos.";
export const MOTIVO_ARQUIVO_SUMIU = "O arquivo IFC deste modelo não está mais no servidor.";
export const MOTIVO_CABECALHO = "Não foi possível ler o cabeçalho deste IFC.";
export const MOTIVO_POUCOS = "Marque pelo menos dois modelos.";
/** Frases genéricas da junção: o detalhe técnico (erro do Node, stderr) fica só no log do servidor. */
export const MOTIVO_FALHA_NO_DISCO = "Falha ao ler os modelos ou gravar o arquivo federado no servidor. Tente de novo ou fale com o suporte.";
export const MOTIVO_SEM_RESPOSTA = "O processo de junção terminou sem resposta. Tente de novo.";
export const MOTIVO_NAO_INICIOU = "Não foi possível iniciar a junção dos modelos no servidor. Tente de novo ou fale com o suporte.";

export type FamiliaSchema = "IFC2X3" | "IFC4" | "IFC4X3";

export function familiaDoSchema(schema: string | null): FamiliaSchema | null {
  const s = (schema ?? "").toUpperCase();
  if (s.startsWith("IFC4X3")) return "IFC4X3";
  if (s.startsWith("IFC4")) return "IFC4";
  if (s.startsWith("IFC2X3")) return "IFC2X3";
  return null;
}

const UNIDADES: Record<string, string> = {
  "MILLI METRE": "milímetros",
  "CENTI METRE": "centímetros",
  "DECI METRE": "decímetros",
  METRE: "metros",
  "KILO METRE": "quilômetros",
  FOOT: "pés",
  INCH: "polegadas",
};

export function rotuloUnidade(u: string | null): string {
  if (u === null) return "unidade não declarada";
  return UNIDADES[u] ?? u.toLowerCase();
}

export type CandidatoFederado = {
  modeloId: string;
  nome: string;
  grupo: string;
  revisao: string;
  tamanho: number;
  convertido: boolean;
  arquivoExiste: boolean;
  schema: string | null;
  /** `undefined` = a inspeção não achou a unidade a tempo; não bloqueia (o job confere no arquivo inteiro). */
  unidade: string | null | undefined;
};

export type AvaliacaoSelecao = {
  motivos: Record<string, string | null>;
  validos: string[];
  podeGerar: boolean;
  motivoGerar: string | null;
  totalBytes: number;
};

/** O que impede o modelo sozinho, marcado ou não (o diálogo desabilita o checkbox por isto). */
export function motivoIntrinseco(c: CandidatoFederado): string | null {
  if (!c.convertido) return MOTIVO_NAO_CONVERTIDO;
  if (!c.arquivoExiste) return MOTIVO_ARQUIVO_SUMIU;
  if (familiaDoSchema(c.schema) === null) return MOTIVO_CABECALHO;
  return null;
}

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1).replace(".", ",")} GB`;
}

export function avaliarSelecao(candidatos: CandidatoFederado[], marcados: readonly string[]): AvaliacaoSelecao {
  const marcado = new Set(marcados);
  const referencia = candidatos.find((c) => marcado.has(c.modeloId) && motivoIntrinseco(c) === null) ?? null;
  const famRef = referencia ? familiaDoSchema(referencia.schema) : null;
  const motivos: Record<string, string | null> = {};
  for (const c of candidatos) {
    let motivo = motivoIntrinseco(c);
    if (!motivo && referencia && c.modeloId !== referencia.modeloId) {
      const fam = familiaDoSchema(c.schema);
      if (fam !== famRef) motivo = `${fam} — os marcados são ${famRef}. Exporte de novo em ${famRef}.`;
      else if (c.unidade !== undefined && referencia.unidade !== undefined && c.unidade !== referencia.unidade) {
        motivo = `Em ${rotuloUnidade(c.unidade)} — os marcados estão em ${rotuloUnidade(referencia.unidade)}. Exporte de novo na mesma unidade.`;
      }
    }
    motivos[c.modeloId] = motivo;
  }
  const validos = candidatos.filter((c) => marcado.has(c.modeloId) && motivos[c.modeloId] === null).map((c) => c.modeloId);
  const totalBytes = candidatos.filter((c) => validos.includes(c.modeloId)).reduce((s, c) => s + c.tamanho, 0);
  let motivoGerar: string | null = null;
  if (validos.length < 2) motivoGerar = MOTIVO_POUCOS;
  else if (totalBytes > LIMITE_ENTRADA_FEDERADO) {
    motivoGerar = `Os modelos marcados somam ${gb(totalBytes)}; o limite é ${gb(LIMITE_ENTRADA_FEDERADO).replace(",0", "")}. Desmarque algum modelo.`;
  }
  return { motivos, validos, podeGerar: motivoGerar === null, motivoGerar, totalBytes };
}

/**
 * Confere de novo nas análises do arquivo inteiro (o child é a palavra final).
 * `unidade`: `null` = o projeto não declara unidade de comprimento; `undefined` = o analisador não conseguiu
 * resolvê-la (arquivo malformado) — aqui isso BLOQUEIA, diferente da inspeção rápida do diálogo.
 */
export function conflitoEntreAnalises(
  itens: { rotulo: string; schema: string | null; unidade: string | null | undefined; projetos: number }[],
): string | null {
  for (const it of itens) {
    if (it.projetos !== 1) return `${it.rotulo} tem ${it.projetos} IfcProject; um IFC válido tem um só.`;
    if (it.unidade === undefined) return `${it.rotulo}: não foi possível ler a unidade de comprimento deste IFC.`;
    if (familiaDoSchema(it.schema) === null) return `${it.rotulo}: ${MOTIVO_CABECALHO}`;
  }
  const [ref, ...resto] = itens;
  for (const it of resto) {
    const fam = familiaDoSchema(it.schema);
    const famRef = familiaDoSchema(ref.schema);
    if (fam !== famRef) return `${it.rotulo} é ${fam} e ${ref.rotulo} é ${famRef}. Exporte de novo em ${famRef}.`;
    if (it.unidade !== ref.unidade) {
      return `${it.rotulo} está em ${rotuloUnidade(it.unidade ?? null)} e ${ref.rotulo} em ${rotuloUnidade(ref.unidade ?? null)}. Exporte de novo na mesma unidade.`;
    }
  }
  return null;
}

export type SaidaFederar = { ok: true; tamanho: number; sha256: string; avisos: string[] } | { ok: false; erro: string };

export function lerSaidaDoFilho(stdout: string): SaidaFederar | null {
  const linhas = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = linhas.length - 1; i >= 0; i--) {
    try {
      const j = JSON.parse(linhas[i]) as Record<string, unknown>;
      if (j.ok === true) {
        return { ok: true, tamanho: Number(j.tamanho), sha256: String(j.sha256), avisos: (j.avisos as string[]) ?? [] };
      }
      if (j.ok === false) return { ok: false, erro: String(j.erro ?? "Falha desconhecida.") };
    } catch {
      // linha que não é JSON: segue procurando
    }
  }
  return null;
}
