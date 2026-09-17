/**
 * Árvore de navegação dos documentos (regra pura, sem I/O): disciplina → fase → extensão.
 *
 * É pasta só na aparência: cada nó é um FILTRO que a tela já tinha (`disciplinaId`, `fase`,
 * `ext`) — não existe pasta no banco para esses três níveis. Por isso nenhum nó vazio aparece:
 * a árvore nasce dos documentos que existem.
 *
 * CONTAGEM: todo nó conta DOCUMENTOS distintos, inclusive o de extensão. Um documento com PDF e
 * DWG conta 1 na disciplina, 1 na fase e 1 em CADA uma das duas extensões — então a soma dos
 * filhos pode passar do número do pai. É a leitura certa por nó ("quantos documentos eu vejo se
 * clicar aqui"), que é o que o clique entrega; somar irmãos é que não faz sentido aqui.
 */

/** Fase ausente e extensão fora do catálogo viram nó próprio, com chave de filtro reservada. */
export const FASE_SEM = "__sem__";
export const EXT_OUTROS = "__outros__";

export type DocumentoParaArvore = {
  id: string;
  disciplinaId: string;
  faseId: string | null;
  faseSigla: string | null;
  faseNome: string | null;
  /** Extensões dos arquivos vivos do documento, em minúsculas e sem ponto. */
  extensoes: string[];
};

export type NoExtensao = { chave: string; rotulo: string; total: number };
export type NoFase = { chave: string; rotulo: string; titulo: string; total: number; extensoes: NoExtensao[] };
export type ArvoreDaDisciplina = { disciplinaId: string; fases: NoFase[] };

function ordenarPorRotulo<T extends { rotulo: string }>(itens: T[]): T[] {
  return itens.sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/**
 * Monta as fases (e, dentro delas, as extensões) de cada disciplina.
 *
 * `extensoesConhecidas` é o catálogo de extensões (Configurações → Extensões): o que não está
 * nele cai em "Outros" — mesmo critério do filtro de categoria de extensão, e evita uma pasta
 * por sigla estranha de software (`.ed3`, `.sv$`).
 */
export function montarArvoreNavegacao(
  documentos: DocumentoParaArvore[],
  extensoesConhecidas: Iterable<string>,
): ArvoreDaDisciplina[] {
  const conhecidas = new Set([...extensoesConhecidas].map((e) => e.toLowerCase()));
  // disciplina → fase → extensão → documentos distintos
  const porDisciplina = new Map<string, Map<string, { rotulo: string; titulo: string; docs: Set<string>; exts: Map<string, Set<string>> }>>();

  for (const doc of documentos) {
    const fases = porDisciplina.get(doc.disciplinaId) ?? new Map();
    porDisciplina.set(doc.disciplinaId, fases);

    const chaveFase = doc.faseId ?? FASE_SEM;
    const fase = fases.get(chaveFase) ?? {
      rotulo: doc.faseSigla ?? "Sem fase",
      titulo: doc.faseNome ?? (doc.faseId ? (doc.faseSigla ?? "") : "Documentos ainda sem fase definida"),
      docs: new Set<string>(),
      exts: new Map<string, Set<string>>(),
    };
    fases.set(chaveFase, fase);
    fase.docs.add(doc.id);

    // Sem extensão nenhuma (nome sem ponto) também é "Outros" — o documento existe e precisa
    // aparecer em algum lugar, senão some da árvore e a contagem da fase não fecha com nada.
    const chaves = doc.extensoes.length > 0 ? doc.extensoes : [EXT_OUTROS];
    for (const bruta of chaves) {
      const ext = bruta.toLowerCase();
      const chave = ext === EXT_OUTROS || !conhecidas.has(ext) ? EXT_OUTROS : ext;
      const docs = fase.exts.get(chave) ?? new Set<string>();
      fase.exts.set(chave, docs);
      docs.add(doc.id);
    }
  }

  return [...porDisciplina].map(([disciplinaId, fases]) => ({
    disciplinaId,
    fases: ordenarPorRotulo(
      [...fases].map(([chave, fase]) => ({
        chave,
        rotulo: fase.rotulo,
        titulo: fase.titulo,
        total: fase.docs.size,
        extensoes: ordenarPorRotulo(
          [...fase.exts].map(([chaveExt, docs]) => ({
            chave: chaveExt,
            rotulo: chaveExt === EXT_OUTROS ? "Outros" : chaveExt.toUpperCase(),
            total: docs.size,
          })),
        ),
      })),
    ),
  }));
}

/** Um arquivo que a árvore pública posiciona: cada arquivo mora em UMA pasta de formato. */
export type ArquivoParaPasta = {
  nome: string;
  faseId: string | null;
  faseSigla: string | null;
  faseNome: string | null;
};

export type PastaExtensao<T> = { chave: string; rotulo: string; total: number; arquivos: T[] };
export type PastaFase<T> = { chave: string; rotulo: string; titulo: string; total: number; extensoes: PastaExtensao<T>[] };

/** Extensão em minúsculas, sem ponto. `""` quando o nome não tem extensão. */
export function extensaoDoNome(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i > 0 ? nome.slice(i + 1).toLowerCase() : "";
}

/**
 * Mesmas pastas de `montarArvoreNavegacao` (fase → formato, nada vazio, "Sem fase" e "Outros"),
 * mas com os ARQUIVOS nas folhas — é o que o link público precisa para listar e para o download
 * por pasta. Aqui a contagem fecha: cada arquivo cai em uma pasta só, então o total da fase é a
 * soma dos formatos dela.
 */
export function montarPastasDeArquivos<T extends ArquivoParaPasta>(
  arquivos: T[],
  extensoesConhecidas: Iterable<string>,
): PastaFase<T>[] {
  const conhecidas = new Set([...extensoesConhecidas].map((e) => e.toLowerCase()));
  const fases = new Map<string, PastaFase<T>>();

  for (const arquivo of arquivos) {
    const chaveFase = arquivo.faseId ?? FASE_SEM;
    let fase = fases.get(chaveFase);
    if (!fase) {
      fase = {
        chave: chaveFase,
        rotulo: arquivo.faseSigla ?? "Sem fase",
        titulo: arquivo.faseNome ?? (arquivo.faseId ? (arquivo.faseSigla ?? "") : "Arquivos ainda sem fase definida"),
        total: 0,
        extensoes: [],
      };
      fases.set(chaveFase, fase);
    }
    fase.total += 1;

    const ext = extensaoDoNome(arquivo.nome);
    const chaveExt = ext && conhecidas.has(ext) ? ext : EXT_OUTROS;
    let pasta = fase.extensoes.find((e) => e.chave === chaveExt);
    if (!pasta) {
      pasta = { chave: chaveExt, rotulo: chaveExt === EXT_OUTROS ? "Outros" : chaveExt.toUpperCase(), total: 0, arquivos: [] };
      fase.extensoes.push(pasta);
    }
    pasta.total += 1;
    pasta.arquivos.push(arquivo);
  }

  const porRotulo = <U extends { rotulo: string }>(a: U, b: U) => a.rotulo.localeCompare(b.rotulo, "pt-BR");
  for (const fase of fases.values()) fase.extensoes.sort(porRotulo);
  return [...fases.values()].sort(porRotulo);
}
