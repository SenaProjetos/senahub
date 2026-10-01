/**
 * Siglas por versão do padrão de nomenclatura — puro, client-safe, sem Prisma (D4/D11 da spec
 * `docs/superpowers/specs/2026-09-21-nomenclatura-versionada-subdisciplinas.md`).
 *
 * `SiglaNomenclatura` liga "esta sigla significa este item" por faixa de versões; os itens de
 * catálogo também têm validade própria. Aqui ficam as regras que transformam essas linhas no
 * formato que `montarVocabulario()` já consome (`CatalogosNomenclatura`), para UMA versão — o
 * motor continua sem saber que versões existem.
 */

import type { CatalogosNomenclatura, ItemVocabulario, SubdisciplinaVocabulario } from "./vocabulario";

export type FaixaVersao = { versaoDesde: number; versaoAte: number | null };

export type SiglaLinha = FaixaVersao & { sigla: string; oficial: boolean };

/** A faixa inclui a versão? `versaoAte` null = sem fim. */
export function valeNaVersao(faixa: FaixaVersao, versao: number): boolean {
  return faixa.versaoDesde <= versao && (faixa.versaoAte === null || versao <= faixa.versaoAte);
}

const SEMPRE: FaixaVersao = { versaoDesde: 1, versaoAte: null };

/**
 * Sigla oficial + sinônimos das colunas antigas (`codigo`/`sigla` + `sinonimos`) como linhas na
 * faixa do item (padrão: da v1 em diante). Mesma normalização da migration
 * `20260922120000_nomenclatura_versionada` (maiúscula, sem espaço nas pontas, sem vazio, sinônimo
 * igual à oficial sai, sem duplicata) — as duas precisam dar o mesmo resultado, senão o espelho
 * das telas diverge do que a migration gravou.
 */
export function siglasDasColunas(
  oficial: string | null,
  sinonimos: readonly string[],
  faixa: FaixaVersao = SEMPRE,
): SiglaLinha[] {
  const { versaoDesde, versaoAte } = faixa;
  const siglaOficial = (oficial ?? "").trim().toUpperCase();
  const linhas: SiglaLinha[] = [];
  if (siglaOficial) linhas.push({ sigla: siglaOficial, oficial: true, versaoDesde, versaoAte });
  const vistos = new Set<string>();
  for (const bruto of sinonimos) {
    const sigla = bruto.trim().toUpperCase();
    if (!sigla || sigla === siglaOficial || vistos.has(sigla)) continue;
    vistos.add(sigla);
    linhas.push({ sigla, oficial: false, versaoDesde, versaoAte });
  }
  return linhas;
}

export type ColunasSigla = { oficial: string | null; sinonimos: readonly string[] };

function mesmasLinhas(a: readonly SiglaLinha[], b: readonly SiglaLinha[]): boolean {
  const chaves = (ls: readonly SiglaLinha[]) =>
    ls.map((l) => `${l.sigla.trim().toUpperCase()}|${l.oficial ? 1 : 0}|${l.versaoDesde}|${l.versaoAte ?? ""}`).sort();
  const ka = chaves(a);
  const kb = chaves(b);
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

/**
 * As siglas do item ainda são só o espelho das colunas, na faixa do próprio item? É o estado de
 * todo item que nunca passou por "Siglas por versão". Depois que alguém registra uma sigla por
 * versão (PDA a partir da v2, ESG encerrado na v1), as linhas deixam de bater com as colunas — e
 * a tabela de siglas passa a ser a única fonte.
 */
export function siglasSaoEspelho(linhas: readonly SiglaLinha[], colunas: ColunasSigla, faixa: FaixaVersao): boolean {
  // Pela faixa EFETIVA (linha ∩ item): desde a E3 da spec 2026-09-30 as linhas não acompanham a
  // validade do item, então um item que saiu ("até a v1") com as linhas em aberto segue espelho.
  return mesmasLinhas(siglasEfetivas(linhas, faixa), siglasDasColunas(colunas.oficial, colunas.sinonimos, faixa));
}

/** A faixa nova cobre alguma versão que a antiga não cobria? */
function ampliou(antes: FaixaVersao, depois: FaixaVersao): boolean {
  if (depois.versaoDesde < antes.versaoDesde) return true;
  return antes.versaoAte !== null && (depois.versaoAte === null || depois.versaoAte > antes.versaoAte);
}

/**
 * Faixa em que o formulário regrava o espelho: a união da validade de antes e de depois. Estreitar o
 * item nunca corta as linhas (a faixa efetiva já as recorta); ampliar reabre as que o espelho antigo
 * cortou junto com o item.
 */
export function faixaDoEspelho(antes: FaixaVersao, depois: FaixaVersao): FaixaVersao {
  return {
    versaoDesde: Math.min(antes.versaoDesde, depois.versaoDesde),
    versaoAte: antes.versaoAte === null || depois.versaoAte === null ? null : Math.max(antes.versaoAte, depois.versaoAte),
  };
}

/**
 * O que fazer com as siglas do item quando o formulário dele (card ou item da Lista Mestre) é
 * salvo — pelo lápis, pelo olho de ativar/desativar, por qualquer caminho:
 * - `manter`: sigla e sinônimos não mudaram e a validade não ampliou. Estreitar o item cai aqui (E3
 *   da spec 2026-09-30): a faixa efetiva (sigla ∩ item) já recorta as linhas; regravá-las na faixa do
 *   item tirava as siglas junto (incidente do Hidrossanitário);
 * - `espelhar`: as linhas ainda eram o espelho das colunas e a sigla ou um sinônimo mudou — ou a
 *   validade ampliou (reabre linhas que o espelho antigo cortou junto com o item) → regravar as
 *   linhas a partir das colunas, na faixa de `faixaDoEspelho` (nunca mais estreita que antes);
 * - `bloquear`: o item tem siglas por versão e o formulário tentou mudar sigla/sinônimo pelas
 *   colunas — regravar apagaria as decisões por versão (salvar o lápis recriava o `ESG` "da v1 em
 *   diante" por cima do ESG encerrado na v1).
 */
export function decidirSiglasAoSalvar(entrada: {
  linhas: readonly SiglaLinha[];
  colunasAntes: ColunasSigla;
  faixaAntes: FaixaVersao;
  colunasDepois: ColunasSigla;
  faixaDepois: FaixaVersao;
}): "espelhar" | "manter" | "bloquear" {
  const { linhas, colunasAntes, faixaAntes, colunasDepois, faixaDepois } = entrada;
  const colunasMudaram = !mesmasLinhas(
    siglasDasColunas(colunasAntes.oficial, colunasAntes.sinonimos),
    siglasDasColunas(colunasDepois.oficial, colunasDepois.sinonimos),
  );
  const espelho = siglasSaoEspelho(linhas, colunasAntes, faixaAntes);
  if (colunasMudaram) return espelho ? "espelhar" : "bloquear";
  return espelho && ampliou(faixaAntes, faixaDepois) ? "espelhar" : "manter";
}

/**
 * Que linhas conferir contra colisão ao salvar o formulário, já na faixa nova do item: o espelho
 * novo (`espelhar`); as linhas atuais quando só a validade mudou — ampliar a faixa pode pôr uma
 * sigla numa versão em que outro item já a usa —; nada nos outros casos.
 */
export function linhasParaChecarColisao(entrada: {
  decisao: "espelhar" | "manter" | "bloquear";
  linhas: readonly SiglaLinha[];
  colunasDepois: ColunasSigla;
  faixaAntes: FaixaVersao;
  faixaDepois: FaixaVersao;
}): readonly SiglaLinha[] {
  const { decisao, linhas, colunasDepois, faixaAntes, faixaDepois } = entrada;
  if (decisao === "espelhar") return siglasDasColunas(colunasDepois.oficial, colunasDepois.sinonimos, faixaDepois);
  const faixaMudou = faixaAntes.versaoDesde !== faixaDepois.versaoDesde || faixaAntes.versaoAte !== faixaDepois.versaoAte;
  return decisao === "manter" && faixaMudou ? linhas : [];
}

/** Parte comum de duas faixas; null quando não têm versão em comum. */
export function intersecaoFaixas(a: FaixaVersao, b: FaixaVersao): FaixaVersao | null {
  const versaoDesde = Math.max(a.versaoDesde, b.versaoDesde);
  const versaoAte =
    a.versaoAte === null ? b.versaoAte : b.versaoAte === null ? a.versaoAte : Math.min(a.versaoAte, b.versaoAte);
  if (versaoAte !== null && versaoAte < versaoDesde) return null;
  return { versaoDesde, versaoAte };
}

/**
 * Linhas de sigla recortadas pela validade do item (e do card-mãe, para sub): é o que vale de
 * fato. Um card encerrado na v1 com a sigla ainda "em aberto" não ocupa a sigla na v2 — sem o
 * recorte, a checagem de colisão e a trava de publicação enxergariam o card antigo na v2.
 */
export function siglasEfetivas<L extends SiglaLinha>(linhas: readonly L[], ...faixas: FaixaVersao[]): L[] {
  const saida: L[] = [];
  for (const linha of linhas) {
    let faixa: FaixaVersao | null = linha;
    for (const f of faixas) {
      faixa = faixa && intersecaoFaixas(faixa, f);
    }
    if (faixa) saida.push({ ...linha, versaoDesde: faixa.versaoDesde, versaoAte: faixa.versaoAte });
  }
  return saida;
}

/**
 * A versão mais nova cadastrada (rascunho incluso): o "a partir da" padrão das telas de catálogo,
 * porque cadastro novo quase sempre é a preparação da próxima versão. Abrir na v1 fazia a sigla
 * nova valer também nos projetos antigos quando alguém esquecia de trocar.
 */
export function versaoMaisNova(versoes: readonly { numero: number }[]): number | null {
  return versoes.length === 0 ? null : Math.max(...versoes.map((v) => v.numero));
}

/**
 * "Vale até" sugerido ao encerrar uma sigla: a versão anterior à mais nova (ela deixa de valer a
 * partir da mais nova), sem ficar antes do início da própria linha.
 */
export function versaoAteSugerida(versoes: readonly { numero: number }[], versaoDesde: number): number {
  const nova = versaoMaisNova(versoes) ?? versaoDesde;
  return Math.max(versaoDesde, nova - 1);
}

/** Rótulo curto da validade de um item para as listas; null quando vale sempre (o caso comum). */
export function rotuloFaixa(faixa: FaixaVersao): string | null {
  const { versaoDesde: de, versaoAte: ate } = faixa;
  if (de <= 1 && ate === null) return null;
  if (ate === null) return `a partir da v${de}`;
  if (de === ate) return `só na v${de}`;
  if (de <= 1) return `até a v${ate}`;
  return `da v${de} à v${ate}`;
}

/**
 * Sigla oficial e sinônimos de um item numa versão. Mais de uma oficial valendo na mesma
 * versão é cadastro inconsistente (a action barra); aqui vence a de `versaoDesde` mais recente,
 * que é a última decisão tomada — as outras não viram sinônimo, para não inventar leitura.
 */
export function siglasNaVersao(
  linhas: readonly SiglaLinha[],
  versao: number,
): { oficial: string | null; sinonimos: string[] } {
  const validas = linhas.filter((l) => valeNaVersao(l, versao));
  const oficiais = validas.filter((l) => l.oficial).sort((a, b) => b.versaoDesde - a.versaoDesde);
  const oficial = oficiais[0]?.sigla ?? null;
  const sinonimos: string[] = [];
  for (const l of validas) {
    if (l.oficial || l.sigla === oficial || sinonimos.includes(l.sigla)) continue;
    sinonimos.push(l.sigla);
  }
  return { oficial, sinonimos };
}

export type DisciplinaComSiglas = FaixaVersao & {
  id: string;
  numeracao: number | null;
  numeracaoFim: number | null;
  siglas: readonly SiglaLinha[];
};

export type SubdisciplinaComSiglas = FaixaVersao & {
  id: string;
  disciplinaCatalogoId: string;
  siglas: readonly SiglaLinha[];
};

export type PranchaComSiglas = FaixaVersao & {
  id: string;
  categoria: "fase" | "tipo" | "folha";
  projetoId: string | null;
  siglas: readonly SiglaLinha[];
};

/**
 * Catálogos de UMA versão, no formato de `montarVocabulario()`. Item fora da versão não entra;
 * item sem sigla oficial na versão também não (sem sigla não há o que reconhecer no nome, e o
 * gerador de nome não teria o que escrever) — exceto o card que tem sub válida na versão: ele
 * entra com `codigo` null, para as subs terem a quem apontar (card de v2 sem sigla "geral").
 * Folha fica de fora: o motor não lê tamanho de papel pelo nome.
 *
 * Quem chama já filtrou `ativo` e o escopo de projeto (global + o do próprio projeto), como
 * `carregarCatalogosNomenclatura` faz hoje.
 */
export function catalogosDaVersao(
  entrada: {
    disciplinas: readonly DisciplinaComSiglas[];
    subdisciplinas?: readonly SubdisciplinaComSiglas[];
    pranchas: readonly PranchaComSiglas[];
  },
  versao: number,
): CatalogosNomenclatura {
  const cardsNaVersao = new Set(entrada.disciplinas.filter((d) => valeNaVersao(d, versao)).map((d) => d.id));
  const subdisciplinas: SubdisciplinaVocabulario[] = (entrada.subdisciplinas ?? [])
    .filter((sub) => cardsNaVersao.has(sub.disciplinaCatalogoId) && valeNaVersao(sub, versao))
    .map((sub) => ({ sub, siglas: siglasNaVersao(sub.siglas, versao) }))
    .filter(({ siglas }) => siglas.oficial !== null)
    .map(({ sub, siglas }) => ({
      id: sub.id,
      sigla: siglas.oficial as string,
      sinonimos: siglas.sinonimos,
      disciplinaId: sub.disciplinaCatalogoId,
    }));
  const cardsComSub = new Set(subdisciplinas.map((sub) => sub.disciplinaId));

  const disciplinas = entrada.disciplinas
    .filter((d) => cardsNaVersao.has(d.id))
    .map((d) => ({ d, siglas: siglasNaVersao(d.siglas, versao) }))
    .filter(({ d, siglas }) => siglas.oficial !== null || cardsComSub.has(d.id))
    .map(({ d, siglas }) => ({
      id: d.id,
      codigo: siglas.oficial,
      numeracao: d.numeracao,
      numeracaoFim: d.numeracaoFim,
      sinonimos: siglas.sinonimos,
    }));

  const itens = (categoria: "fase" | "tipo"): ItemVocabulario[] =>
    entrada.pranchas
      .filter((p) => p.categoria === categoria && valeNaVersao(p, versao))
      .map((p) => ({ p, siglas: siglasNaVersao(p.siglas, versao) }))
      .filter(({ siglas }) => siglas.oficial !== null)
      .map(({ p, siglas }) => ({
        id: p.id,
        sigla: siglas.oficial as string,
        sinonimos: siglas.sinonimos,
        projetoId: p.projetoId,
      }));

  return { disciplinas, subdisciplinas, fases: itens("fase"), tipos: itens("tipo") };
}
