/**
 * Plano de importação da planilha de disciplinas para UMA versão do padrão — puro, client-safe.
 *
 * A planilha diz como a versão deve ficar; o plano diz o que muda no cadastro para chegar lá, sem
 * duplicar nada que já existe (um "Hidrossanitário" só, válido em todas as versões — D11). Regras:
 * - linha da planilha ↔ card do cadastro: pela SIGLA; senão pelo NOME (sem acento, sem "geral", sem
 *   o que está entre parênteses); senão, se as palavras de um nome estão contidas no outro
 *   ("Prevenção de Incêndio" × "Incêndio (PPCI)"), é uma ligação PROVÁVEL que quem importa confirma;
 * - nome diferente do cadastro não renomeia nada (D11: cadastro não é renomeado);
 * - card/sub do cadastro que está na versão e não está na planilha SAI dela;
 * - sigla da planilha que já é de outro item na versão: a planilha manda — a sigla deixa de valer
 *   no outro item a partir da versão (consequência listada, nunca silenciosa);
 * - a mesma sigla em dois itens da planilha é erro: corrige-se a planilha.
 */

import { normalizar } from "@/lib/disciplinas-core";
import type { LinhaPlanilha, PlanilhaCatalogo } from "./planilha";
import {
  chaveAlvo,
  colisoes,
  idCardNovo,
  siglasDoItemNaVersao,
  simular,
  versoesAPartirDe,
  type AlvoCatalogo,
  type CardSnap,
  type CatalogoSnap,
  type OperacaoComId,
  type SubSnap,
} from "./versao";
import { valeNaVersao } from "@/modules/uploads/nomenclatura/siglas-versao";

export type GrupoPlano = "ligacoes" | "entram" | "siglas" | "saem" | "consequencias";

export type ItemPlano = {
  /** Estável entre prévia e aplicação — é por ele que se desmarca. */
  id: string;
  grupo: GrupoPlano;
  descricao: string;
  detalhe?: string;
  opcional: boolean;
  /** Se algum destes for desmarcado, este cai junto (sub de card novo, consequência de sigla). */
  dependeDe: string[];
  /** Ligação provável não grava nada sozinha: decide se a linha usa o card existente ou cria um. */
  operacao: OperacaoComId | null;
};

export type Correspondencia = {
  linha: number;
  tipo: "card" | "sub";
  planilha: string;
  cadastro: string;
  como: "sigla" | "nome" | "provavel";
  aviso?: string;
};

export type PlanoImportacao = {
  versao: number;
  itens: ItemPlano[];
  correspondencias: Correspondencia[];
  /** Linhas que já batem com o cadastro, sem nada a mudar. */
  semMudanca: number;
  avisos: string[];
  erros: string[];
};

// ─── Nomes ───────────────────────────────────────────────────────────────────

const MENORES = new Set(["de", "da", "do", "das", "dos", "e", "ou", "para", "a", "o", "em", "com"]);

/** Nome para comparar: sem acento/caixa, sem o que está entre parênteses e sem a palavra "geral". */
export function nomeBase(nome: string): string {
  return normalizar(nome)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\bgeral\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function palavras(nome: string): Set<string> {
  return new Set(
    nomeBase(nome)
      .split(" ")
      .filter((p) => p && !MENORES.has(p))
      .map((p) => (p.length > 4 ? p.replace(/oes$/, "ao").replace(/s$/, "") : p)),
  );
}

function contido(a: Set<string>, b: Set<string>): boolean {
  return a.size > 0 && [...a].every((p) => b.has(p));
}

/** Algum par de palavras com o mesmo começo (5+ letras): Elétrico × Elétrica, Terraplenagem × Terraplanagem. */
function parecidos(a: string, b: string): boolean {
  const pa = [...palavras(a)];
  const pb = [...palavras(b)];
  return pa.some((x) => pb.some((y) => x === y || (x.length >= 5 && y.length >= 5 && x.slice(0, 5) === y.slice(0, 5))));
}

/**
 * Nome para gravar um item novo: a planilha vem em CAIXA ALTA; vira "Entrada de Energia". Palavra
 * sem vogal fica em maiúscula (CFTV, GLP); card perde o "GERAL" do fim ("FOTOVOLTAICO GERAL").
 * Texto que já tem minúscula fica como veio.
 */
export function nomeLegivel(texto: string, ehCard: boolean): string {
  let t = texto.replace(/\s+/g, " ").trim();
  if (ehCard) t = t.replace(/\s+geral$/i, "").trim() || t;
  if (/[a-zà-ÿ]/.test(t)) return t;
  let primeira = true;
  return t
    .split(/(\s+|\/)/)
    .map((parte) => {
      if (!parte || /^\s+$/.test(parte) || parte === "/") return parte;
      const ehPrimeira = primeira;
      primeira = false;
      if (!/[AEIOUÁÉÍÓÚÂÊÔÃÕÀ]/i.test(parte)) return parte;
      const minuscula = parte.toLocaleLowerCase("pt-BR");
      if (!ehPrimeira && MENORES.has(minuscula)) return minuscula;
      return minuscula.charAt(0).toLocaleUpperCase("pt-BR") + minuscula.slice(1);
    })
    .join("");
}

// ─── Plano ───────────────────────────────────────────────────────────────────

type Ligacao = { card: CardSnap; como: Correspondencia["como"] };

function existeAtivo(snap: CatalogoSnap, alvo: AlvoCatalogo, versao: number): boolean {
  if (alvo.tipo === "disciplina") {
    const c = snap.cards.find((x) => x.id === alvo.id);
    return !!c && c.ativo && valeNaVersao(c, versao);
  }
  const s = snap.subs.find((x) => x.id === alvo.id);
  const c = s && snap.cards.find((x) => x.id === s.cardId);
  return !!s && !!c && s.ativo && c.ativo && valeNaVersao(s, versao) && valeNaVersao(c, versao);
}

/** Siglas pelas quais um item é conhecido: a oficial na versão, na anterior e (card) a da coluna. */
function siglasDeReferencia(snap: CatalogoSnap, alvo: AlvoCatalogo, versao: number, coluna: string | null): Set<string> {
  const s = new Set<string>();
  for (const v of [versao, versao - 1]) {
    if (v < 1) continue;
    const oficial = siglasDoItemNaVersao(snap, alvo, v).oficial;
    if (oficial) s.add(oficial);
  }
  if (coluna) s.add(coluna.toUpperCase());
  return s;
}

/** Preferência entre candidatos: está na versão > estava na anterior > o resto (arquivado incluso). */
function rank(snap: CatalogoSnap, alvo: AlvoCatalogo, versao: number): number {
  if (existeAtivo(snap, alvo, versao)) return 0;
  if (versao > 1 && existeAtivo(snap, alvo, versao - 1)) return 1;
  return 2;
}

export function planejarImportacao(
  snap: CatalogoSnap,
  versao: number,
  planilha: Pick<PlanilhaCatalogo, "linhas" | "avisos">,
  opcoes: { desmarcados?: ReadonlySet<string>; versoesExistentes?: readonly number[] } = {},
): PlanoImportacao {
  const desmarcados = opcoes.desmarcados ?? new Set<string>();
  const itens: ItemPlano[] = [];
  const correspondencias: Correspondencia[] = [];
  const avisos = [...planilha.avisos];
  const erros: string[] = [];
  let semMudanca = 0;

  const add = (item: Omit<ItemPlano, "dependeDe"> & { dependeDe?: string[] }) =>
    itens.push({ dependeDe: [], ...item });
  const categorias = [...new Set(snap.cards.map((c) => c.categoria).filter((c): c is string => !!c))];
  const categoriaDoGrupo = (grupo: string | null) =>
    grupo ? (categorias.find((c) => normalizar(c) === normalizar(grupo)) ?? null) : null;

  // ── 1. Cards: planilha ↔ cadastro ──
  const usados = new Set<string>();
  const ligacaoDaLinha = new Map<number, Ligacao>();
  const cardsPorRank = (filtro: (c: CardSnap) => boolean) =>
    snap.cards
      .filter((c) => !usados.has(c.id) && filtro(c))
      .sort((a, b) => rank(snap, { tipo: "disciplina", id: a.id }, versao) - rank(snap, { tipo: "disciplina", id: b.id }, versao));

  const linhasCard = planilha.linhas.filter((l) => l.tipo === "card");
  for (const l of linhasCard) {
    let ligacao: Ligacao | null = null;
    if (l.sigla) {
      const [c] = cardsPorRank((c) => siglasDeReferencia(snap, { tipo: "disciplina", id: c.id }, versao, c.codigo).has(l.sigla!));
      if (c) ligacao = { card: c, como: "sigla" };
    }
    if (!ligacao) {
      const [c] = cardsPorRank((c) => nomeBase(c.nome) === nomeBase(l.nome));
      if (c) ligacao = { card: c, como: "nome" };
    }
    if (!ligacao) {
      const pl = palavras(l.nome);
      const candidatos = cardsPorRank((c) => {
        const pc = palavras(c.nome);
        return contido(pc, pl) || contido(pl, pc);
      });
      if (candidatos.length > 0) {
        const id = `ligar:${l.linha}`;
        add({
          id,
          grupo: "ligacoes",
          descricao: `“${l.nome}” (linha ${l.linha}) é o card existente “${candidatos[0].nome}”`,
          detalhe:
            candidatos.length > 1
              ? `Outros parecidos: ${candidatos.slice(1).map((c) => `“${c.nome}”`).join(", ")}. Desmarcado: cria um card novo.`
              : `Desmarcado: cria um card novo com o nome da planilha, e “${candidatos[0].nome}” entra na lista dos que saem.`,
          opcional: true,
          operacao: null,
        });
        if (!desmarcados.has(id)) ligacao = { card: candidatos[0], como: "provavel" };
      }
    }
    if (ligacao) {
      usados.add(ligacao.card.id);
      ligacaoDaLinha.set(l.linha, ligacao);
      const diferentes = !parecidos(ligacao.card.nome, l.nome);
      correspondencias.push({
        linha: l.linha,
        tipo: "card",
        planilha: l.nome,
        cadastro: ligacao.card.nome,
        como: ligacao.como,
        aviso:
          ligacao.como === "sigla" && diferentes
            ? `Confira: a sigla ${l.sigla} é de “${ligacao.card.nome}”, e a linha diz “${l.nome}”.`
            : undefined,
      });
    }
  }

  // ── 2. Operações dos cards ──
  const entraOps: OperacaoComId[] = [];
  const opIdCardNovo = new Map<number, string>();
  const nomesNovos = new Map<string, number>();
  for (const l of linhasCard) {
    const ligacao = ligacaoDaLinha.get(l.linha);
    const depende = ligacao?.como === "provavel" ? [`ligar:${l.linha}`] : [];
    if (!ligacao) {
      const id = `card-novo:${l.linha}`;
      const nome = nomeLegivel(l.nome, true);
      if (snap.cards.some((c) => normalizar(c.nome) === normalizar(nome))) {
        erros.push(`Linha ${l.linha}: já existe um card chamado “${nome}” que não foi ligado a esta linha — renomeie um dos dois.`);
        continue;
      }
      const repetida = nomesNovos.get(normalizar(nome));
      if (repetida !== undefined) {
        erros.push(`Linhas ${repetida} e ${l.linha} criariam dois cards chamados “${nome}” — corrija a planilha.`);
        continue;
      }
      nomesNovos.set(normalizar(nome), l.linha);
      opIdCardNovo.set(l.linha, id);
      add({
        id,
        grupo: "entram",
        descricao: `Card novo: ${nome}${l.sigla ? ` (${l.sigla})` : ""}`,
        detalhe: l.sigla ? undefined : "Sem sigla própria — os arquivos usam a sigla das subs.",
        opcional: true,
        operacao: { id, tipo: "card-novo", chave: String(l.linha), nome, sigla: l.sigla, categoria: categoriaDoGrupo(l.grupo) },
      });
      continue;
    }
    const alvo: AlvoCatalogo = { tipo: "disciplina", id: ligacao.card.id };
    if (!existeAtivo(snap, alvo, versao)) {
      const id = `entra:${chaveAlvo(alvo)}`;
      const op: OperacaoComId = { id, tipo: "entra", alvo };
      entraOps.push(op);
      add({ id, grupo: "entram", descricao: `Volta para a v${versao}: ${ligacao.card.nome}`, opcional: true, dependeDe: depende, operacao: op });
    }
  }

  // Siglas comparadas DEPOIS das voltas (o card que volta pode ter a sigla reposta junto).
  const aposEntrar = simular(snap, versao, entraOps);
  for (const l of linhasCard) {
    const ligacao = ligacaoDaLinha.get(l.linha);
    if (!ligacao) continue;
    const alvo: AlvoCatalogo = { tipo: "disciplina", id: ligacao.card.id };
    const atual = siglasDoItemNaVersao(aposEntrar, alvo, versao).oficial;
    if (l.sigla && l.sigla !== atual) {
      const id = `sigla:${chaveAlvo(alvo)}`;
      add({
        id,
        grupo: "siglas",
        descricao: `${ligacao.card.nome}: ${atual ?? "sem sigla"} → ${l.sigla}`,
        detalhe: atual ? `${atual} continua valendo nas versões anteriores.` : undefined,
        opcional: true,
        dependeDe: ligacao.como === "provavel" ? [`ligar:${l.linha}`] : [],
        operacao: { id, tipo: "sigla-nova", alvo, sigla: l.sigla },
      });
    } else if (!itens.some((i) => i.operacao?.tipo === "entra" && i.operacao.alvo.id === alvo.id)) {
      semMudanca++;
    }
  }

  // ── 3. Subs ──
  const subsLigadas = new Set<string>();
  for (const l of planilha.linhas.filter((x) => x.tipo === "sub")) {
    const pai = linhasCard.find((c) => c.linha === l.paiLinha);
    if (!pai) continue;
    const ligacaoPai = ligacaoDaLinha.get(pai.linha);
    const opPai = opIdCardNovo.get(pai.linha);
    if (!ligacaoPai && !opPai) continue; // card da linha com erro
    const nome = nomeLegivel(l.nome, false);

    let sub: SubSnap | undefined;
    if (ligacaoPai) {
      const candidatas = snap.subs
        .filter((s) => s.cardId === ligacaoPai.card.id && !subsLigadas.has(s.id))
        .sort((a, b) => rank(snap, { tipo: "subdisciplina", id: a.id }, versao) - rank(snap, { tipo: "subdisciplina", id: b.id }, versao));
      sub =
        candidatas.find((s) => nomeBase(s.nome) === nomeBase(l.nome)) ??
        (l.sigla ? candidatas.find((s) => siglasDeReferencia(snap, { tipo: "subdisciplina", id: s.id }, versao, null).has(l.sigla!)) : undefined);
    }

    if (!sub) {
      const id = `sub-nova:${l.linha}`;
      const card = ligacaoPai ? { id: ligacaoPai.card.id } : { chave: String(pai.linha) };
      const nomePai = ligacaoPai ? ligacaoPai.card.nome : nomeLegivel(pai.nome, true);
      add({
        id,
        grupo: "entram",
        descricao: `Sub nova em ${nomePai}: ${nome}${l.sigla ? ` (${l.sigla})` : ""}`,
        detalhe: l.sigla ? undefined : "Sem sigla — o envio não vai reconhecê-la pelo nome do arquivo.",
        opcional: true,
        dependeDe: opPai ? [opPai] : [],
        operacao: { id, tipo: "sub-nova", card, nome, sigla: l.sigla },
      });
      continue;
    }

    subsLigadas.add(sub.id);
    correspondencias.push({ linha: l.linha, tipo: "sub", planilha: l.nome, cadastro: sub.nome, como: nomeBase(sub.nome) === nomeBase(l.nome) ? "nome" : "sigla" });
    const alvo: AlvoCatalogo = { tipo: "subdisciplina", id: sub.id };
    let mudou = false;
    if (!existeAtivo(snap, alvo, versao)) {
      const id = `entra:${chaveAlvo(alvo)}`;
      add({ id, grupo: "entram", descricao: `Volta para a v${versao}: ${sub.nome} (sub de ${ligacaoPai!.card.nome})`, opcional: true, operacao: { id, tipo: "entra", alvo } });
      mudou = true;
    }
    const atual = siglasDoItemNaVersao(simular(snap, versao, [{ id: "x", tipo: "entra", alvo }]), alvo, versao).oficial;
    if (l.sigla && l.sigla !== atual) {
      const id = `sigla:${chaveAlvo(alvo)}`;
      add({
        id,
        grupo: "siglas",
        descricao: `${sub.nome} (sub de ${ligacaoPai!.card.nome}): ${atual ?? "sem sigla"} → ${l.sigla}`,
        opcional: true,
        operacao: { id, tipo: "sigla-nova", alvo, sigla: l.sigla },
      });
      mudou = true;
    }
    if (!mudou) semMudanca++;
  }

  // ── 4. O que está na versão e não está na planilha sai dela ──
  for (const c of snap.cards) {
    const alvo: AlvoCatalogo = { tipo: "disciplina", id: c.id };
    if (usados.has(c.id) || !existeAtivo(snap, alvo, versao)) continue;
    const id = `sai:${chaveAlvo(alvo)}`;
    add({
      id,
      grupo: "saem",
      descricao: `${c.nome}${c.codigo ? ` (${c.codigo})` : ""}`,
      detalhe:
        c.versaoDesde >= versao
          ? `Foi criado na v${versao}: será excluído (se não estiver em uso).`
          : `Continua valendo até a v${versao - 1}; projetos que já o usam não mudam.`,
      opcional: true,
      operacao: { id, tipo: "sai", alvo },
    });
  }
  for (const s of snap.subs) {
    const alvo: AlvoCatalogo = { tipo: "subdisciplina", id: s.id };
    if (subsLigadas.has(s.id) || !usados.has(s.cardId) || !existeAtivo(snap, alvo, versao)) continue;
    const card = snap.cards.find((c) => c.id === s.cardId);
    const id = `sai:${chaveAlvo(alvo)}`;
    add({ id, grupo: "saem", descricao: `${s.nome} (sub de ${card?.nome ?? "?"})`, opcional: true, operacao: { id, tipo: "sai", alvo } });
  }

  // ── 5. Conflitos de sigla: a planilha manda na versão ──
  const escolhidas = operacoesEscolhidas(itens, desmarcados);
  const depois = simular(snap, versao, escolhidas);
  for (const col of colisoes(depois, [versao])) {
    const daPlanilha = col.donos.filter((d) => d.linhaId.startsWith("nova:"));
    if (daPlanilha.length === 0) continue; // conflito antigo, que a importação não criou
    if (daPlanilha.length > 1) {
      erros.push(`A sigla ${col.sigla} aparece duas vezes na planilha: ${daPlanilha.map((d) => `“${d.rotulo}”`).join(" e ")}.`);
      continue;
    }
    const causa = daPlanilha[0].linhaId.slice("nova:".length).split("#")[0];
    for (const outro of col.donos.filter((d) => !d.linhaId.startsWith("nova:"))) {
      const linhaOutro = itemLinha(depois, outro.alvo, outro.linhaId);
      const id = `encerrar:${outro.chave}:${outro.linhaId}`;
      add({
        id,
        grupo: "consequencias",
        descricao: `${col.sigla} deixa de ser ${linhaOutro?.oficial ? "a sigla" : "sinônimo"} de “${outro.rotulo}” a partir da v${versao}`,
        detalhe: linhaOutro?.oficial ? `“${outro.rotulo}” fica sem sigla oficial na v${versao} — defina outra depois, se precisar.` : undefined,
        opcional: false,
        dependeDe: [causa],
        operacao: { id, tipo: "encerrar-sigla", alvo: outro.alvo, linhaId: outro.linhaId, sigla: col.sigla },
      });
    }
  }

  // ── 6. Conferência final: nada pode sobrar com dois donos, nesta versão ou nas seguintes ──
  const final = simular(snap, versao, operacoesEscolhidas(itens, desmarcados));
  const versoes = versoesAPartirDe(versao, opcoes.versoesExistentes ?? [versao]);
  for (const col of colisoes(final, versoes)) {
    if (!col.donos.some((d) => d.linhaId.startsWith("nova:"))) continue;
    erros.push(`Na v${col.versao}, a sigla ${col.sigla} ficaria com dois donos: ${col.donos.map((d) => `“${d.rotulo}”`).join(" e ")}.`);
  }

  return { versao, itens, correspondencias, semMudanca, avisos, erros: [...new Set(erros)] };
}

function itemLinha(snap: CatalogoSnap, alvo: AlvoCatalogo, linhaId: string) {
  const lista =
    alvo.tipo === "disciplina" ? snap.cards : alvo.tipo === "subdisciplina" ? snap.subs : snap.itens;
  return (lista as { id: string; siglas: { id: string; oficial: boolean }[] }[])
    .find((i) => i.id === alvo.id)
    ?.siglas.find((l) => l.id === linhaId);
}

/**
 * Itens que ficam valendo: não desmarcados (quando opcionais) e sem dependência desmarcada — em
 * cascata (desmarcar um card novo derruba as subs dele e as consequências das siglas delas).
 */
export function itensEscolhidos(itens: readonly ItemPlano[], desmarcados: ReadonlySet<string>): ItemPlano[] {
  const fora = new Set<string>();
  for (const i of itens) if (i.opcional && desmarcados.has(i.id)) fora.add(i.id);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const i of itens) {
      if (!fora.has(i.id) && i.dependeDe.some((d) => fora.has(d))) {
        fora.add(i.id);
        mudou = true;
      }
    }
  }
  return itens.filter((i) => !fora.has(i.id));
}

export function operacoesEscolhidas(itens: readonly ItemPlano[], desmarcados: ReadonlySet<string>): OperacaoComId[] {
  // Ordem de gravação: libera siglas antes de ocupar; cria cards antes das subs deles.
  const ordem: Record<OperacaoComId["tipo"], number> = {
    "encerrar-sigla": 0,
    sai: 1,
    entra: 2,
    "card-novo": 3,
    "item-novo": 3,
    "sigla-nova": 4,
    "sinonimo-novo": 4,
    "sub-nova": 5,
  };
  return itensEscolhidos(itens, desmarcados)
    .map((i) => i.operacao)
    .filter((o): o is OperacaoComId => o !== null)
    .sort((a, b) => ordem[a.tipo] - ordem[b.tipo]);
}

export { idCardNovo };
export type { LinhaPlanilha };
