/**
 * Pastas na lista de documentos (regra pura, sem I/O): a aba Arquivos navegada como o Google
 * Drive — cada nível mostra só o que está DIRETAMENTE nele, com as subpastas no topo.
 *
 *   raiz        → pastas das disciplinas + áreas do projeto (Recebidos, Base, Geral, ARTs)
 *   disciplina  → pastas das fases + documentos sem fase, soltos
 *   fase        → pastas dos formatos (PDF, DWG… e Outros)
 *   formato     → os documentos, cada um só com o arquivo daquele formato
 *
 * São os mesmos nós de `montarArvoreNavegacao`, com as mesmas contagens: a pasta da lista é o
 * mesmo filtro da árvore da esquerda. "Sem fase" deixou de ser pasta — o documento sem fase mora
 * solto na disciplina. Busca e filtros não navegam: com eles a lista é resultado de pesquisa,
 * corrida, e quem decide isso é a página (`nivelDaPasta` só lê a posição na árvore).
 */
import type { StatusDisciplina } from "@/generated/prisma/client";
import { EXT_OUTROS, FASE_SEM, type ArvoreDaDisciplina, type NoFase } from "./arvore-navegacao";

export type SelecaoPasta = { disciplinaId: string | null; fase: string | null; ext: string | null };

export type NivelPasta = "raiz" | "disciplina" | "fase" | "formato";

/**
 * Para onde o clique leva: os parâmetros da URL que a árvore e as áreas já usam. `ano` e
 * `projetoId` só existem no diretório geral (/arquivos), acima do projeto; ausentes, ficam como
 * estão na URL.
 */
export type DestinoPasta = {
  disciplinaId: string | null;
  fase: string | null;
  ext: string | null;
  area: string | null;
  ano?: string | null;
  projetoId?: string | null;
};

/** Recorte do .zip de uma pasta (`/api/uploads/pasta/zip`). */
export type RecorteZipPasta = { disciplinaId: string; fase: string | null; ext: string | null };

export type DisciplinaDaPasta = { id: string; nome: string; status: StatusDisciplina; total: number };
export type AreaDaPasta = { id: string; rotulo: string; total: number };

export type PastaNaLista = {
  tipo: "ano" | "projeto" | "disciplina" | "fase" | "extensao" | "area";
  chave: string;
  rotulo: string;
  /** Nome por extenso da fase, para o `title`; `null` quando o rótulo já diz tudo. */
  titulo: string | null;
  /** Só a pasta de disciplina tem: pinta o ícone como a árvore pinta. */
  status: StatusDisciplina | null;
  /** Disciplina onde a pasta mora (ícone da coluna Disc.); `null` na área do projeto. */
  disciplinaNome: string | null;
  /** Documentos distintos no nó — a mesma conta da árvore. Na área, os itens dela. */
  total: number;
  destino: DestinoPasta;
  /** `null` = pasta sem .zip (área do projeto, que tem tela própria, ou pasta vazia). */
  zip: RecorteZipPasta | null;
};

export type SegmentoTrilha = { chave: string; rotulo: string; titulo: string | null; destino: DestinoPasta };

/** `""` na URL (`?fase=`) é o mesmo que não ter o parâmetro. */
function normalizar(selecao: SelecaoPasta): SelecaoPasta {
  return { disciplinaId: selecao.disciplinaId || null, fase: selecao.fase || null, ext: selecao.ext || null };
}

function fasesDa(arvore: ArvoreDaDisciplina[], disciplinaId: string): NoFase[] {
  return arvore.find((a) => a.disciplinaId === disciplinaId)?.fases ?? [];
}

function destino(disciplinaId: string | null, fase: string | null = null, ext: string | null = null): DestinoPasta {
  return { disciplinaId, fase, ext, area: null };
}

/**
 * Em que nível da árvore a seleção está — ou `null` quando ela não é um nó (fase escolhida pelo
 * seletor sem disciplina, formato pelo filtro sem fase, "Sem fase", que deixou de ser pasta).
 * Aí a lista é filtro, não pasta: mostra tudo que casa, sem subpastas.
 */
export function nivelDaPasta(selecaoBruta: SelecaoPasta): NivelPasta | null {
  const { disciplinaId, fase, ext } = normalizar(selecaoBruta);
  if (disciplinaId === null) return fase === null && ext === null ? "raiz" : null;
  if (fase === null) return ext === null ? "disciplina" : null;
  if (fase === FASE_SEM) return null;
  return ext === null ? "fase" : "formato";
}

/**
 * Subpastas do nível aberto, na ordem da árvore. Vazio no formato (folha) e fora da árvore.
 *
 * Na raiz entram TODAS as disciplinas visíveis, inclusive as sem documento — a árvore também as
 * mostra, e é por elas que se chega ao "envie o primeiro arquivo" — e depois as áreas que quem
 * chama liberou.
 */
export function pastasDoNivel(
  selecaoBruta: SelecaoPasta,
  disciplinas: DisciplinaDaPasta[],
  arvore: ArvoreDaDisciplina[],
  areas: AreaDaPasta[] = [],
): PastaNaLista[] {
  const selecao = normalizar(selecaoBruta);
  const nivel = nivelDaPasta(selecao);

  if (nivel === "raiz") {
    return [
      ...disciplinas.map((d): PastaNaLista => ({
        tipo: "disciplina",
        chave: d.id,
        rotulo: d.nome,
        titulo: null,
        status: d.status,
        disciplinaNome: d.nome,
        total: d.total,
        destino: destino(d.id),
        zip: d.total > 0 ? { disciplinaId: d.id, fase: null, ext: null } : null,
      })),
      ...areas.map((a): PastaNaLista => ({
        tipo: "area",
        chave: `area:${a.id}`,
        rotulo: a.rotulo,
        titulo: null,
        status: null,
        disciplinaNome: null,
        total: a.total,
        destino: { disciplinaId: null, fase: null, ext: null, area: a.id },
        zip: null,
      })),
    ];
  }

  const disciplina = disciplinas.find((d) => d.id === selecao.disciplinaId);
  if (!disciplina || (nivel !== "disciplina" && nivel !== "fase")) return [];
  const fases = fasesDa(arvore, disciplina.id);

  if (nivel === "disciplina") {
    return fases
      .filter((f) => f.chave !== FASE_SEM)
      .map((f) => ({
        tipo: "fase",
        chave: f.chave,
        rotulo: f.rotulo,
        titulo: f.titulo || null,
        status: null,
        disciplinaNome: disciplina.nome,
        total: f.total,
        destino: destino(disciplina.id, f.chave),
        zip: { disciplinaId: disciplina.id, fase: f.chave, ext: null },
      }));
  }

  const fase = fases.find((f) => f.chave === selecao.fase);
  if (!fase) return [];
  return fase.extensoes.map((e) => ({
    tipo: "extensao",
    chave: e.chave,
    rotulo: e.rotulo,
    titulo: null,
    status: null,
    disciplinaNome: disciplina.nome,
    total: e.total,
    destino: destino(disciplina.id, fase.chave, e.chave),
    zip: { disciplinaId: disciplina.id, fase: fase.chave, ext: e.chave },
  }));
}

/**
 * Caminho do nó aberto, da disciplina até onde a árvore reconhece a seleção (sem a raiz, que
 * quem desenha acrescenta). Vazio na raiz. Fase ou formato que a árvore não conhece — e o
 * antigo "Sem fase" — encerram a trilha ali: ela só mostra pasta que existe.
 */
export function trilhaDaPasta(
  selecaoBruta: SelecaoPasta,
  disciplinas: DisciplinaDaPasta[],
  arvore: ArvoreDaDisciplina[],
): SegmentoTrilha[] {
  const selecao = normalizar(selecaoBruta);
  const disciplina = disciplinas.find((d) => d.id === selecao.disciplinaId);
  if (!disciplina) return [];

  const trilha: SegmentoTrilha[] = [{ chave: disciplina.id, rotulo: disciplina.nome, titulo: null, destino: destino(disciplina.id) }];
  const fase =
    selecao.fase && selecao.fase !== FASE_SEM ? fasesDa(arvore, disciplina.id).find((f) => f.chave === selecao.fase) : undefined;
  if (!fase) return trilha;
  trilha.push({
    chave: `${disciplina.id}/${fase.chave}`,
    rotulo: fase.rotulo,
    titulo: fase.titulo || null,
    destino: destino(disciplina.id, fase.chave),
  });

  const ext = selecao.ext ? fase.extensoes.find((e) => e.chave === selecao.ext) : undefined;
  if (!ext) return trilha;
  trilha.push({
    chave: `${disciplina.id}/${fase.chave}/${ext.chave}`,
    rotulo: ext.rotulo,
    titulo: null,
    destino: destino(disciplina.id, fase.chave, ext.chave),
  });
  return trilha;
}

/**
 * Endereço da pasta: a URL atual com a posição trocada. Mantém ordenação, colunas e tamanho da
 * página; tira a página (outra pasta começa na 1) e a lista (pasta e lista não se misturam).
 */
export function hrefDaPasta(pathname: string, buscaAtual: string, alvo: DestinoPasta): string {
  const params = new URLSearchParams(buscaAtual);
  params.delete("page");
  params.delete("listaId");
  for (const [chave, valor] of Object.entries(alvo)) {
    if (valor === undefined) continue;
    if (valor) params.set(chave, valor);
    else params.delete(chave);
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Endereço do .zip da pasta. */
export function hrefZipDaPasta(recorte: RecorteZipPasta): string {
  const params = new URLSearchParams({ disciplinaId: recorte.disciplinaId });
  if (recorte.fase) params.set("fase", recorte.fase);
  if (recorte.ext) params.set("ext", recorte.ext);
  return `/api/uploads/pasta/zip?${params.toString()}`;
}

/** Extensão em minúsculas, sem ponto. `""` quando o nome não tem extensão. */
function extensaoDe(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i > 0 ? nome.slice(i + 1).toLowerCase() : "";
}

/**
 * O arquivo mora na pasta deste formato? Mesmo critério da árvore: extensão fora do catálogo (ou
 * nenhuma) vai para "Outros".
 */
export function arquivoNoFormato(nomeArquivo: string, formato: string, conhecidas: ReadonlySet<string>): boolean {
  const ext = extensaoDe(nomeArquivo);
  if (formato === EXT_OUTROS) return !conhecidas.has(ext);
  return conhecidas.has(ext) && ext === formato.toLowerCase();
}

export type ArquivoParaZipPasta = {
  uploadId: string;
  caminho: string;
  nome: string;
  faseId: string | null;
  /** Nome da pasta da fase (a sigla, como na árvore). */
  faseRotulo: string | null;
};

/**
 * Entradas do .zip de uma pasta, com os caminhos espelhando o que se vê na lista a partir dela:
 * da disciplina, `Fase/FORMATO/arquivo` e os sem fase soltos na raiz; da fase, `FORMATO/arquivo`;
 * do formato, só os arquivos daquele formato. Nome repetido ganha " (2)".
 */
export function entradasZipDaPasta(
  arquivos: ArquivoParaZipPasta[],
  extensoesConhecidas: Iterable<string>,
  recorte: { fase: string | null; ext: string | null },
): { uploadId: string; caminho: string; nome: string }[] {
  const conhecidas = new Set([...extensoesConhecidas].map((e) => e.toLowerCase()));
  const pastaDoFormato = (nome: string) => {
    const ext = extensaoDe(nome);
    return conhecidas.has(ext) ? ext.toUpperCase() : "Outros";
  };

  const usados = new Set<string>();
  const entradas: { uploadId: string; caminho: string; nome: string }[] = [];
  for (const a of arquivos) {
    const semFase = a.faseId === null;
    if (recorte.fase !== null) {
      const daFase = recorte.fase === FASE_SEM ? semFase : a.faseId === recorte.fase;
      if (!daFase) continue;
    }
    if (recorte.ext !== null && !arquivoNoFormato(a.nome, recorte.ext, conhecidas)) continue;

    let nome: string;
    if (recorte.ext !== null) nome = a.nome;
    else if (recorte.fase !== null) nome = `${pastaDoFormato(a.nome)}/${a.nome}`;
    else nome = semFase ? a.nome : `${a.faseRotulo ?? "Fase"}/${pastaDoFormato(a.nome)}/${a.nome}`;

    if (usados.has(nome)) {
      // O ponto da extensão tem de estar no nome do arquivo, não numa pasta do caminho.
      const i = nome.lastIndexOf(".");
      const temExt = i > nome.lastIndexOf("/") + 1;
      const raiz = temExt ? nome.slice(0, i) : nome;
      const sufixo = temExt ? nome.slice(i) : "";
      let n = 2;
      while (usados.has(`${raiz} (${n})${sufixo}`)) n++;
      nome = `${raiz} (${n})${sufixo}`;
    }
    usados.add(nome);
    entradas.push({ uploadId: a.uploadId, caminho: a.caminho, nome });
  }
  return entradas;
}
