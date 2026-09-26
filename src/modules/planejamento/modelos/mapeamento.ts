/**
 * De arquivo do MS Project para modelo de EAP do SenaHub — PURO, sem I/O.
 *
 * O arquivo traz uma lista plana com "nível de estrutura de tópicos"; o SenaHub quer árvore, tipo de
 * linha (fase, disciplina, agrupamento, atividade, marco), disciplina e fase por linha. A tradução é
 * feita aqui, junto com a CONFERÊNCIA que a tela mostra antes de gravar.
 *
 * Por que existe conferência, e não casamento automático: no arquivo real da casa, dos 10 nomes de
 * disciplina só 4 batem com o catálogo — "FUNDAÇÃO" (catálogo: "Fundações"), "GLP" ("Gás") e
 * "TELECOMUNICAÇÕES" (sem par nenhum) não casam por texto. Adivinhar geraria linha sem disciplina, e
 * linha sem disciplina não herda responsável (D22), não fecha marco de fase (decisão #8) e derruba a
 * Saúde do projeto — tudo em silêncio. Então o palpite é SUGESTÃO, e quem confirma é gente.
 */
import type { ArquivoMspdi, LinhaMspdi, TipoVinculo } from "./mspdi";
import type { EstruturaModelo, LinhaModelo } from "./estrutura";

export type ItemCatalogo = {
  id: string;
  nome: string;
  /** Sigla oficial (`DisciplinaCatalogo.codigo` / `PranchaCatalogo.sigla`). */
  sigla?: string | null;
  /** Siglas alternativas que o motor de nomenclatura já reconhece. */
  sinonimos?: readonly string[];
};

export type CatalogosParaMapear = {
  disciplinas: readonly ItemCatalogo[];
  fases: readonly ItemCatalogo[];
  /**
   * O que a casa já respondeu antes, por nome normalizado (de modelos anteriores). É o que faz a
   * segunda importação não repetir a mesma conferência.
   */
  mapaDisciplinaConhecido?: Readonly<Record<string, string | null>>;
  mapaFaseConhecido?: Readonly<Record<string, string | null>>;
};

export type ParDeNome = {
  /** Nome como está no arquivo. */
  origem: string;
  /** Chave normalizada — é por ela que o mapa é guardado. */
  chave: string;
  /** Sugestão (ou confirmação) do catálogo; `null` = sem par. */
  catalogoId: string | null;
  catalogoNome: string | null;
  /** Como o par foi encontrado — a tela mostra, porque "igual" e "parecido" merecem confiança diferente. */
  como: "exato" | "sigla" | "parecido" | "lembrado" | "sem_par";
  /** Quantas linhas do arquivo caem debaixo deste nome. */
  linhas: number;
};

export type Conferencia = {
  disciplinas: ParDeNome[];
  fases: ParDeNome[];
  /** Linhas que o sistema sugere marcar como etapa de terceiro (decisão #1). */
  terceiros: { id: string; nome: string }[];
  totais: { linhas: number; agrupamentos: number; marcos: number; vinculos: number; comDisciplina: number };
  avisos: string[];
};

// ─────────────────────────────────────────────────────────────
// Normalização de nome
// ─────────────────────────────────────────────────────────────

/**
 * Chave de comparação: sem acento, minúscula, sem o que vem entre parênteses ("Climatização (AVAC)"
 * → "climatizacao"), sem pontuação e com espaço único. É ela que vai no mapa gravado — o nome cru
 * mudaria de "TELECOMUNICAÇÕES " para "TELECOMUNICAÇÕES" no próximo export e o mapa se perderia.
 */
export function chaveDeNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Singular grosseiro, só para comparar ("fundacoes" → "fundacao"). */
const singular = (s: string) =>
  s
    .split(" ")
    .map((p) => (p.endsWith("oes") ? `${p.slice(0, -3)}ao` : p.endsWith("es") || p.endsWith("s") ? p.replace(/e?s$/, "") : p))
    .join(" ");

/**
 * Palavras que não distinguem nada num nome de fase ou disciplina — sem tirá-las, "Projeto Básico"
 * casaria com "Projeto Executivo" pela palavra "projeto".
 */
const PALAVRAS_VAZIAS = new Set(["projeto", "projetos", "de", "do", "da", "dos", "das", "e", "a", "o", "para", "com"]);

const palavras = (chave: string) =>
  new Set(
    chave
      .split(" ")
      .map(singular)
      .filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p)),
  );

/** Todas as palavras de `parte` estão em `todo`? */
const contem = (todo: ReadonlySet<string>, parte: ReadonlySet<string>) => [...parte].every((p) => todo.has(p));

function acharNoCatalogo(nome: string, catalogo: readonly ItemCatalogo[]): { item: ItemCatalogo; como: ParDeNome["como"] } | null {
  const chave = chaveDeNome(nome);
  if (chave === "") return null;

  for (const i of catalogo) {
    if (chaveDeNome(i.nome) === chave) return { item: i, como: "exato" };
  }
  // Sigla: "GLP" não bate com "Gás", mas "EX" bate com a fase EX, e "ESTR" é sinônimo de Estrutural.
  for (const i of catalogo) {
    const siglas = [i.sigla, ...(i.sinonimos ?? [])].filter((s): s is string => !!s);
    if (siglas.some((s) => chaveDeNome(s) === chave)) return { item: i, como: "sigla" };
  }
  // Parecido, em três tentativas — nenhuma delas "chuta": todas exigem palavra em comum.
  const sing = singular(chave);
  // 1) singular/plural: "FUNDAÇÃO" × "Fundações".
  for (const i of catalogo) {
    if (singular(chaveDeNome(i.nome)) === sing) return { item: i, como: "parecido" };
  }
  // 2) um nome contém as palavras do outro: "BÁSICO" × "Projeto Básico", "PREVENÇÃO E COMBATE A
  //    INCÊNDIO" × "Incêndio (PPCI)". Palavras vazias ("projeto", "de") não contam, senão "Projeto
  //    Básico" casaria com "Projeto Executivo".
  const meus = palavras(chave);
  if (meus.size > 0) {
    for (const i of catalogo) {
      const dele = palavras(chaveDeNome(i.nome));
      if (dele.size === 0) continue;
      if (contem(dele, meus) || contem(meus, dele)) return { item: i, como: "parecido" };
    }
  }
  // 3) prefixo, só com 4+ letras ("GLP" não casa com nada por prefixo).
  if (chave.length >= 4) {
    for (const i of catalogo) {
      const c = chaveDeNome(i.nome);
      if (c.startsWith(chave) || chave.startsWith(c)) return { item: i, como: "parecido" };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Etapa de terceiro (sugestão)
// ─────────────────────────────────────────────────────────────

/**
 * Nomes que denunciam trabalho de FORA da casa. É palpite, não regra: a tela mostra a lista e a
 * pessoa desmarca o que estiver errado. Errar para o lado de sugerir é melhor que para o lado de
 * calar — linha de terceiro não marcada gera card e cobra hora de quem não a executa.
 */
const PADROES_DE_TERCEIRO: readonly RegExp[] = [
  /^receb(er|imento)\b/,
  /\baprova(cao|r)\b.*\b(cliente|prefeitura|orgao|concessionaria|bombeiro)/,
  /\bvalidacao\b.*\bcliente\b/,
  /\banalise\b.*\b(prefeitura|orgao|concessionaria|bombeiro)\b/,
  /\b(prefeitura|concessionaria|bombeiro|cartorio)\b/,
  /\bcomentarios?\b.*\bcliente/,
  /\bassinatura\b.*\bcliente/,
];

export function sugereTerceiro(nome: string): boolean {
  const c = chaveDeNome(nome);
  return PADROES_DE_TERCEIRO.some((r) => r.test(c));
}

// ─────────────────────────────────────────────────────────────
// A tradução
// ─────────────────────────────────────────────────────────────

type Preparada = LinhaMspdi & { ordemLista: number };

/**
 * Tira o resumo do PROJETO, quando o arquivo tem um só no topo ("XXXXX-EDF FULANO DE TAL"): a raiz da
 * EAP no SenaHub é o próprio projeto, e trazê-la criaria um nível a mais em todo cronograma. Os
 * filhos dela sobem um nível.
 *
 * "Ser um só no topo" NÃO basta, e o erro é caro nos dois sentidos — ou some a fase do cronograma
 * inteiro, ou todo projeto ganha um nível inútil. São duas condições:
 *
 * 1. O arquivo tem 3 ou mais níveis. Com dois, a linha de topo é agrupamento de verdade ("GESTÃO E
 *    INICIAÇÃO" com as atividades dentro), não o nome do empreendimento.
 * 2. O nome dela não casa com fase nem disciplina do catálogo. "BÁSICO" no topo é a fase; "XXXXX-EDF
 *    FULANO DE TAL" não é nada do catálogo — é o nome do prédio.
 */
function semRaizDoProjeto(
  linhas: readonly LinhaMspdi[],
  ehEstrutura: (nome: string) => boolean,
): { linhas: LinhaMspdi[]; removida: string | null } {
  const topo = linhas.filter((l) => l.nivel === Math.min(...linhas.map((x) => x.nivel)));
  if (topo.length !== 1 || !topo[0].resumo) return { linhas: [...linhas], removida: null };
  if (new Set(linhas.map((l) => l.nivel)).size < 3) return { linhas: [...linhas], removida: null };
  const raiz = topo[0];
  if (ehEstrutura(raiz.nome)) return { linhas: [...linhas], removida: null };
  const resto = linhas.filter((l) => l.uid !== raiz.uid).map((l) => ({ ...l, nivel: l.nivel - 1 }));
  return { linhas: resto, removida: raiz.nome };
}

/** Pai de cada linha pela pilha de níveis (a lista é plana e está em ordem de arquivo). */
function montarArvore(linhas: readonly Preparada[]): Map<string, string | null> {
  const pai = new Map<string, string | null>();
  const pilha: Preparada[] = [];
  for (const l of linhas) {
    while (pilha.length > 0 && pilha[pilha.length - 1].nivel >= l.nivel) pilha.pop();
    pai.set(l.uid, pilha.length > 0 ? pilha[pilha.length - 1].uid : null);
    pilha.push(l);
  }
  return pai;
}

/**
 * As fases que o modelo realmente usa, com quantas linhas caem em cada uma. É a lista que a
 * conferência pede percentual (D38) — fase que o modelo não usa não entra na divisão do valor.
 */
export function fasesDoModelo(estrutura: EstruturaModelo): { etapaId: string; linhas: number }[] {
  const por = new Map<string, number>();
  for (const l of estrutura.linhas) {
    if (!l.etapaId) continue;
    por.set(l.etapaId, (por.get(l.etapaId) ?? 0) + 1);
  }
  return [...por.entries()].map(([etapaId, linhas]) => ({ etapaId, linhas })).sort((a, b) => b.linhas - a.linhas);
}

/**
 * Os percentuais por fase fecham 100? Vazio é resposta válida ("não cadastrar fase"), e aí quem avisa o
 * que se perde é a tela. Preenchido pela metade, não: o pagamento por fase exige soma 100 para aprovar,
 * e gravar 40 + 40 deixaria 20% do valor da disciplina sem fase nenhuma.
 */
export function validarPercentuaisPorFase(
  estrutura: EstruturaModelo,
): { ok: true; cadastrar: boolean } | { ok: false; motivo: string } {
  const fases = fasesDoModelo(estrutura);
  const informados = Object.entries(estrutura.percentuaisPorFase).filter(([, v]) => Number.isFinite(v));
  if (informados.length === 0) return { ok: true, cadastrar: false };

  const doModelo = new Set(fases.map((f) => f.etapaId));
  const sobrando = informados.filter(([id]) => !doModelo.has(id));
  if (sobrando.length > 0) {
    return { ok: false, motivo: "Há percentual informado para uma fase que este modelo não usa." };
  }
  const faltando = fases.filter((f) => !informados.some(([id]) => id === f.etapaId));
  if (faltando.length > 0) {
    return { ok: false, motivo: `Informe o percentual de todas as ${fases.length} fases do modelo, ou de nenhuma.` };
  }
  // Centavos, para 33,33 + 33,33 + 33,34 fechar.
  const soma = informados.reduce((s, [, v]) => s + Math.round(v * 100), 0);
  if (soma !== 10_000) {
    return { ok: false, motivo: `A soma dos percentuais por fase é ${soma / 100}% — precisa fechar 100%.` };
  }
  return { ok: true, cadastrar: true };
}

export type ResultadoMapeamento = {
  estrutura: EstruturaModelo;
  conferencia: Conferencia;
};

/**
 * Traduz o arquivo lido em modelo + conferência.
 *
 * As regras de tipo de linha, na ordem: marco → `mrc`; folha → `atv`; agrupamento cujo nome casa com
 * uma FASE do catálogo → `fas`; agrupamento dentro de uma fase cujo nome casa com DISCIPLINA →
 * `disc`; qualquer outro agrupamento → `res` (atividade-resumo).
 *
 * Disciplina e fase DESCEM até a folha (`etapaId` e `disciplinaCatalogoId` herdados do ancestral mais
 * próximo que os define). Sem isso, o marco de uma fase não fecha a fase (`execucao-service` exige os
 * dois na linha) e a linha não herda o responsável da disciplina (D22) — e as duas falhas são
 * silenciosas.
 */
export function mapearArquivo(arquivo: ArquivoMspdi, cat: CatalogosParaMapear): ResultadoMapeamento {
  const avisos = [...arquivo.avisos];
  // A raiz só sai se o nome dela não for estrutura conhecida — nem fase, nem disciplina, nem resposta
  // que a casa já deu antes para esse nome.
  const ehEstrutura = (nome: string) => {
    const chave = chaveDeNome(nome);
    if (cat.mapaFaseConhecido?.[chave] || cat.mapaDisciplinaConhecido?.[chave]) return true;
    return acharNoCatalogo(nome, cat.fases) != null || acharNoCatalogo(nome, cat.disciplinas) != null;
  };
  const { linhas: semRaiz, removida } = semRaizDoProjeto(arquivo.linhas, ehEstrutura);
  if (removida) {
    avisos.push(`A linha de topo "${removida}" é o resumo do projeto no MS Project e não veio: no SenaHub a raiz da EAP é o próprio projeto.`);
  }

  const linhas: Preparada[] = semRaiz.map((l, i) => ({ ...l, ordemLista: i }));
  const pai = montarArvore(linhas);
  const porUid = new Map(linhas.map((l) => [l.uid, l]));
  const temFilho = new Set([...pai.values()].filter((p): p is string => p != null));

  // 1ª passada: quem é fase, quem é disciplina.
  const faseDe = new Map<string, string | null>();
  const discDe = new Map<string, string | null>();
  const paresFase = new Map<string, ParDeNome>();
  const paresDisc = new Map<string, ParDeNome>();

  const registrar = (
    mapa: Map<string, ParDeNome>,
    nome: string,
    catalogo: readonly ItemCatalogo[],
    conhecido: Readonly<Record<string, string | null>> | undefined,
  ): ParDeNome => {
    const chave = chaveDeNome(nome);
    const existente = mapa.get(chave);
    if (existente) {
      existente.linhas++;
      return existente;
    }
    let par: ParDeNome;
    if (conhecido && chave in conhecido) {
      const id = conhecido[chave];
      const item = id ? catalogo.find((c) => c.id === id) : undefined;
      par = {
        origem: nome.trim(),
        chave,
        catalogoId: item?.id ?? null,
        catalogoNome: item?.nome ?? null,
        como: "lembrado",
        linhas: 1,
      };
    } else {
      const achado = acharNoCatalogo(nome, catalogo);
      par = {
        origem: nome.trim(),
        chave,
        catalogoId: achado?.item.id ?? null,
        catalogoNome: achado?.item.nome ?? null,
        como: achado?.como ?? "sem_par",
        linhas: 1,
      };
    }
    mapa.set(chave, par);
    return par;
  };

  for (const l of linhas) {
    if (!temFilho.has(l.uid)) continue; // só agrupamento nomeia fase ou disciplina
    const dentroDeFase = (() => {
      let p = pai.get(l.uid) ?? null;
      while (p != null) {
        if (faseDe.get(p)) return true;
        p = pai.get(p) ?? null;
      }
      return false;
    })();

    if (!dentroDeFase) {
      const par = registrar(paresFase, l.nome, cat.fases, cat.mapaFaseConhecido);
      if (par.catalogoId) {
        faseDe.set(l.uid, par.catalogoId);
        continue;
      }
      // Não é fase conhecida: ainda pode ser disciplina (arquivo sem nível de fase).
      paresFase.delete(par.chave);
    }

    const par = registrar(paresDisc, l.nome, cat.disciplinas, cat.mapaDisciplinaConhecido);
    if (par.catalogoId) discDe.set(l.uid, par.catalogoId);
  }

  // 2ª passada: herança até a folha + tipo da linha.
  const herdado = (uid: string, mapa: Map<string, string | null>): string | null => {
    let p: string | null = uid;
    while (p != null) {
      const v = mapa.get(p);
      if (v) return v;
      p = pai.get(p) ?? null;
    }
    return null;
  };

  const ordemPorPai = new Map<string | null, number>();
  const linhasModelo: LinhaModelo[] = linhas.map((l) => {
    const p = pai.get(l.uid) ?? null;
    const ordem = ordemPorPai.get(p) ?? 0;
    ordemPorPai.set(p, ordem + 1);

    const etapaId = herdado(l.uid, faseDe);
    const disciplinaCatalogoId = herdado(l.uid, discDe);
    const ehAgrupamento = temFilho.has(l.uid);

    const tipoEap: LinhaModelo["tipoEap"] = l.marco
      ? "mrc"
      : !ehAgrupamento
        ? "atv"
        : faseDe.get(l.uid)
          ? "fas"
          : discDe.get(l.uid)
            ? "disc"
            : "res";

    return {
      id: l.uid,
      parentId: p,
      ordem,
      nome: l.nome.trim() || "(sem nome)",
      tipoEap,
      duracaoDias: tipoEap === "mrc" || ehAgrupamento ? 0 : l.duracaoDias,
      disciplinaCatalogoId,
      etapaId,
      // Agrupamento não recebe recurso (`linhaAceitaAtribuicao`), então a marca de terceiro só vale
      // em atividade e marco.
      deTerceiro: !ehAgrupamento && sugereTerceiro(l.nome),
      predecessoras: l.predecessoras
        .filter((v) => porUid.has(v.uid))
        .map((v) => ({ id: v.uid, tipo: v.tipo as TipoVinculo, lagDias: v.lagDias })),
    };
  });

  const vinculos = linhasModelo.reduce((s, l) => s + l.predecessoras.length, 0);
  const marcos = linhasModelo.filter((l) => l.tipoEap === "mrc").length;
  const agrupamentos = linhasModelo.filter((l) => temFilho.has(l.id)).length;

  const semPar = [...paresDisc.values()].filter((p) => p.catalogoId == null);
  if (semPar.length > 0) {
    avisos.push(`${semPar.length} nome(s) de disciplina do arquivo não têm par no catálogo (${semPar.map((p) => p.origem).join(", ")}). Escolha a disciplina de cada um antes de gravar.`);
  }

  return {
    estrutura: {
      versao: 1,
      jornadaMinutos: arquivo.minutosPorDia,
      linhas: linhasModelo,
      mapaDisciplina: Object.fromEntries([...paresDisc.values()].map((p) => [p.chave, p.catalogoId])),
      mapaFase: Object.fromEntries([...paresFase.values()].map((p) => [p.chave, p.catalogoId])),
      // D38: o arquivo não tem valor nenhum, então o percentual por fase nasce vazio e vem da
      // conferência (é dinheiro — ninguém adivinha).
      percentuaisPorFase: {},
      avisos,
    },
    conferencia: {
      disciplinas: [...paresDisc.values()].sort((a, b) => b.linhas - a.linhas),
      fases: [...paresFase.values()],
      terceiros: linhasModelo.filter((l) => l.deTerceiro).map((l) => ({ id: l.id, nome: l.nome })),
      totais: {
        linhas: linhasModelo.length,
        agrupamentos,
        marcos,
        vinculos,
        comDisciplina: linhasModelo.filter((l) => l.disciplinaCatalogoId != null).length,
      },
      avisos,
    },
  };
}

/**
 * Aplica as respostas da conferência: troca disciplina, fase e as marcas de terceiro, e DESCE de novo
 * a herança (mudar a disciplina de um agrupamento precisa chegar às folhas dele — é a mesma razão da
 * 2ª passada do mapeamento).
 */
export function aplicarRespostas(
  estrutura: EstruturaModelo,
  respostas: {
    mapaDisciplina?: Readonly<Record<string, string | null>>;
    mapaFase?: Readonly<Record<string, string | null>>;
    /** Ids de linha que a pessoa marcou/desmarcou como etapa de terceiro. */
    terceiros?: readonly string[];
    /** D38: percentual por fase do catálogo. `{}` = não cadastrar fase nenhuma. */
    percentuaisPorFase?: Readonly<Record<string, number>>;
  },
): EstruturaModelo {
  const mapaDisciplina = { ...estrutura.mapaDisciplina, ...(respostas.mapaDisciplina ?? {}) };
  const mapaFase = { ...estrutura.mapaFase, ...(respostas.mapaFase ?? {}) };
  const marcados = respostas.terceiros ? new Set(respostas.terceiros) : null;

  const pai = new Map(estrutura.linhas.map((l) => [l.id, l.parentId]));
  const comFilho = new Set(estrutura.linhas.map((l) => l.parentId).filter((p): p is string => p != null));
  const porId = new Map(estrutura.linhas.map((l) => [l.id, l]));

  // O que cada agrupamento define agora, pelo nome dele.
  const faseDe = new Map<string, string | null>();
  const discDe = new Map<string, string | null>();
  for (const l of estrutura.linhas) {
    if (!comFilho.has(l.id)) continue;
    const chave = chaveDeNome(l.nome);
    if (chave in mapaFase && mapaFase[chave]) faseDe.set(l.id, mapaFase[chave]);
    else if (chave in mapaDisciplina && mapaDisciplina[chave]) discDe.set(l.id, mapaDisciplina[chave]);
  }

  const herdado = (id: string, mapa: Map<string, string | null>): string | null => {
    let p: string | null = id;
    while (p != null) {
      const v = mapa.get(p);
      if (v) return v;
      p = pai.get(p) ?? null;
    }
    return null;
  };

  return {
    ...estrutura,
    mapaDisciplina,
    mapaFase,
    // Só as fases que sobraram no modelo: trocar um agrupamento de fase para disciplina na conferência
    // não pode deixar percentual órfão somando no total.
    percentuaisPorFase: Object.fromEntries(
      Object.entries(respostas.percentuaisPorFase ?? estrutura.percentuaisPorFase).filter(([id]) =>
        [...faseDe.values()].includes(id),
      ),
    ),
    linhas: estrutura.linhas.map((l) => {
      const ehAgrupamento = comFilho.has(l.id);
      const tipoEap: LinhaModelo["tipoEap"] =
        l.tipoEap === "mrc"
          ? "mrc"
          : !ehAgrupamento
            ? "atv"
            : faseDe.get(l.id)
              ? "fas"
              : discDe.get(l.id)
                ? "disc"
                : "res";
      return {
        ...l,
        tipoEap,
        etapaId: herdado(l.id, faseDe),
        disciplinaCatalogoId: herdado(l.id, discDe),
        deTerceiro: ehAgrupamento ? false : marcados ? marcados.has(l.id) : l.deTerceiro,
        predecessoras: l.predecessoras.filter((v) => porId.has(v.id)),
      };
    }),
  };
}
