import { describe, expect, it } from "vitest";
import {
  ACAO_ABRIR_NA_VERSAO,
  ACAO_ADICIONAR_SUB,
  ACAO_EDITAR,
  ACAO_SIGLAS,
  ACAO_TIRAR,
  acaoUnica,
  itensDaLinhaCatalogo,
  itensDaLinhaTodas,
  itensDoLoteTodas,
} from "./acoes";

const card = { alvo: { tipo: "disciplina" as const, id: "hid" } };
const sub = { alvo: { tipo: "subdisciplina" as const, id: "agf" } };
const fase = { alvo: { tipo: "prancha" as const, id: "f-ex" } };
const tudo = { podeGerir: true, podeEditarCard: true, versao: 2 };

const ids = (itens: ReturnType<typeof itensDaLinhaCatalogo>) => itens.map((i) => i.id);

describe("itensDaLinhaCatalogo", () => {
  it("card: siglas, adicionar sub, editar, separador e tirar da versão", () => {
    const itens = itensDaLinhaCatalogo(card, tudo);
    expect(ids(itens)).toEqual([ACAO_SIGLAS, ACAO_ADICIONAR_SUB, ACAO_EDITAR, "sep-tirar", ACAO_TIRAR]);
    expect(itens.find((i) => i.id === ACAO_SIGLAS)).toMatchObject({ rotulo: "Siglas nesta versão…" });
    expect(itens.find((i) => i.id === ACAO_TIRAR)).toMatchObject({ rotulo: "Tirar da v2", variant: "destructive" });
  });

  it("tirar não leva `confirmar`: a tela confirma com o texto da versão", () => {
    const tirar = itensDaLinhaCatalogo(card, tudo).find((i) => i.id === ACAO_TIRAR);
    expect(tirar && "confirmar" in tirar ? tirar.confirmar : undefined).toBeUndefined();
  });

  it("sub, fase e tipo: sem adicionar sub-disciplina", () => {
    expect(ids(itensDaLinhaCatalogo(sub, tudo))).toEqual([ACAO_SIGLAS, ACAO_EDITAR, "sep-tirar", ACAO_TIRAR]);
    expect(ids(itensDaLinhaCatalogo(fase, tudo))).toEqual([ACAO_SIGLAS, ACAO_EDITAR, "sep-tirar", ACAO_TIRAR]);
  });

  it("sem gerir a nomenclatura: some o que muda a versão; editar o card segue pelo outro gate; sub/fase/tipo ficam sem nada", () => {
    expect(ids(itensDaLinhaCatalogo(card, { ...tudo, podeGerir: false }))).toEqual([ACAO_EDITAR]);
    expect(itensDaLinhaCatalogo(sub, { ...tudo, podeGerir: false })).toEqual([]);
    expect(itensDaLinhaCatalogo(fase, { ...tudo, podeGerir: false })).toEqual([]);
  });

  it("card sem permissão de cadastro: não edita, mas ainda muda a versão", () => {
    expect(ids(itensDaLinhaCatalogo(card, { ...tudo, podeEditarCard: false }))).toEqual([
      ACAO_SIGLAS,
      ACAO_ADICIONAR_SUB,
      "sep-tirar",
      ACAO_TIRAR,
    ]);
  });

  it("sem nenhuma permissão: lista vazia (a linha fica sem menu)", () => {
    expect(itensDaLinhaCatalogo(card, { podeGerir: false, podeEditarCard: false, versao: 2 })).toEqual([]);
  });

  it("não deixa separador solto quando só sobra um lado", () => {
    const itens = itensDaLinhaCatalogo(card, { podeGerir: true, podeEditarCard: false, versao: 3 });
    expect(itens[0].tipo).not.toBe("separador");
    expect(itens.find((i) => i.id === ACAO_TIRAR)).toMatchObject({ rotulo: "Tirar da v3" });
  });
});

describe("tirar de um card em uso, criado nesta versão (spec §4.6)", () => {
  it("o item aparece desabilitado com o motivo", () => {
    const motivo = "“Hidrossanitário” já está em 3 projeto(s) — arquive pela lente “Todas as versões” em vez de tirar da versão em que foi criado.";
    const tirar = itensDaLinhaCatalogo(card, { ...tudo, motivoTirar: motivo }).find((i) => i.id === ACAO_TIRAR);
    expect(tirar).toMatchObject({ desabilitado: motivo });
  });

  it("sem motivo, segue habilitado", () => {
    const tirar = itensDaLinhaCatalogo(card, { ...tudo, motivoTirar: null }).find((i) => i.id === ACAO_TIRAR);
    expect(tirar && "desabilitado" in tirar ? tirar.desabilitado : undefined).toBeUndefined();
  });
});

describe("acaoUnica (ADR-0002, regra 4: linha com uma ação só não tem menu)", () => {
  it("uma ação: devolve ela", () => {
    const itens = itensDaLinhaCatalogo(card, { podeGerir: false, podeEditarCard: true, versao: 2 });
    expect(acaoUnica(itens)).toMatchObject({ id: ACAO_EDITAR });
  });

  it("várias ações ou nenhuma: null", () => {
    expect(acaoUnica(itensDaLinhaCatalogo(card, tudo))).toBeNull();
    expect(acaoUnica([])).toBeNull();
  });

  it("separador não conta como ação", () => {
    expect(acaoUnica([{ tipo: "separador", id: "s" }, { tipo: "acao", id: "x", rotulo: "X" }])).toMatchObject({ id: "x" });
  });
});

describe("itensDaLinhaTodas (lente Todas as versões)", () => {
  type L = Parameters<typeof itensDaLinhaTodas>[0];
  const cardAtivo: L = { alvo: card.alvo, ativo: true };
  const subAtiva: L = { alvo: sub.alvo, ativo: true };
  const faseAtiva: L = { alvo: fase.alvo, ativo: true };
  const base = { podeGerir: true, podeEditarCard: true, versaoAbrir: 2, uso: 0 };
  const reordenar = { pode: true, temCima: true, temBaixo: true };

  it("card: editar, abrir na vN, subir/descer, arquivar e excluir, na ordem do mockup", () => {
    const itens = itensDaLinhaTodas(cardAtivo, { ...base, reordenar });
    expect(ids(itens)).toEqual([ACAO_EDITAR, ACAO_ABRIR_NA_VERSAO, "sep-ordem", "subir", "descer", "sep-estado", "arquivar", "excluir"]);
    expect(itens.find((i) => i.id === ACAO_ABRIR_NA_VERSAO)).toMatchObject({ rotulo: "Abrir na v2" });
    expect(itens.find((i) => i.id === "excluir")).toMatchObject({ variant: "destructive" });
  });

  it("excluir em uso: inerte com a frase exata (card, sub e fase)", () => {
    const frase = (l: L, uso: number) => itensDaLinhaTodas(l, { ...base, uso, reordenar }).find((i) => i.id === "excluir");
    expect(frase(cardAtivo, 4)).toMatchObject({ desabilitado: "Em uso em 4 projetos — arquive em vez de excluir." });
    expect(frase(cardAtivo, 1)).toMatchObject({ desabilitado: "Em uso em 1 projeto — arquive em vez de excluir." });
    expect(frase(subAtiva, 3)).toMatchObject({ desabilitado: "Em uso em 3 documentos — arquive em vez de excluir." });
    expect(frase(faseAtiva, 2)).toMatchObject({ desabilitado: "Usada por 2 etapas de disciplina — arquive em vez de excluir." });
  });

  it("sem uso, excluir segue habilitado", () => {
    const ex = itensDaLinhaTodas(cardAtivo, { ...base, reordenar }).find((i) => i.id === "excluir");
    expect(ex && "desabilitado" in ex ? ex.desabilitado : undefined).toBeUndefined();
  });

  it("arquivado: desarquivar no lugar de arquivar", () => {
    const itens = itensDaLinhaTodas({ alvo: card.alvo, ativo: false }, { ...base, reordenar });
    expect(ids(itens)).toContain("desarquivar");
    expect(ids(itens)).not.toContain("arquivar");
  });

  it("subir/descer: motivo da busca e dos extremos", () => {
    const sem = itensDaLinhaTodas(cardAtivo, { ...base, reordenar: { pode: false, temCima: true, temBaixo: true } });
    expect(sem.find((i) => i.id === "subir")).toMatchObject({ desabilitado: "Limpe a busca para reordenar." });
    expect(sem.find((i) => i.id === "descer")).toMatchObject({ desabilitado: "Limpe a busca para reordenar." });
    const topo = itensDaLinhaTodas(cardAtivo, { ...base, reordenar: { pode: true, temCima: false, temBaixo: true } });
    expect(topo.find((i) => i.id === "subir")).toMatchObject({ desabilitado: "Já é a primeira da categoria." });
    const fim = itensDaLinhaTodas(cardAtivo, { ...base, reordenar: { pode: true, temCima: true, temBaixo: false } });
    expect(fim.find((i) => i.id === "descer")).toMatchObject({ desabilitado: "Já é a última da categoria." });
  });

  it("sub e fase: sem subir/descer", () => {
    expect(ids(itensDaLinhaTodas(subAtiva, base))).toEqual([ACAO_EDITAR, ACAO_ABRIR_NA_VERSAO, "sep-estado", "arquivar", "excluir"]);
    expect(ids(itensDaLinhaTodas(faseAtiva, base))).toEqual([ACAO_EDITAR, ACAO_ABRIR_NA_VERSAO, "sep-estado", "arquivar", "excluir"]);
  });

  it("sem permissão do tipo: só abrir na vN, que vira botão", () => {
    const c = itensDaLinhaTodas(cardAtivo, { ...base, podeEditarCard: false, reordenar });
    expect(ids(c)).toEqual([ACAO_ABRIR_NA_VERSAO]);
    expect(acaoUnica(c)).toMatchObject({ id: ACAO_ABRIR_NA_VERSAO });
    expect(ids(itensDaLinhaTodas(subAtiva, { ...base, podeGerir: false }))).toEqual([ACAO_ABRIR_NA_VERSAO]);
    // O supervisor edita o card (projetos:gerir) mas não a sub (configuracoes:gerir).
    expect(ids(itensDaLinhaTodas(cardAtivo, { ...base, podeGerir: false, reordenar }))).toContain(ACAO_EDITAR);
  });

  it("A2: nunca oferece siglas nem tirar da versão", () => {
    for (const l of [cardAtivo, subAtiva, faseAtiva, { alvo: card.alvo, ativo: false }]) {
      const i = ids(itensDaLinhaTodas(l, { ...base, reordenar }));
      expect(i).not.toContain(ACAO_SIGLAS);
      expect(i).not.toContain(ACAO_TIRAR);
    }
  });
});

describe("itensDoLoteTodas", () => {
  it("arquivar/desarquivar/excluir e editar inerte; exclusão em uso inerte com motivo", () => {
    const itens = itensDoLoteTodas([{ ativo: true, uso: 2 }, { ativo: true, uso: 0 }]);
    expect(ids(itens)).toEqual([ACAO_EDITAR, "sep-estado", "lote-arquivar", "lote-desarquivar", "lote-excluir"]);
    expect(itens.find((i) => i.id === ACAO_EDITAR)).toMatchObject({ desabilitado: "Só funciona com uma disciplina por vez." });
    const todasEmUso = itensDoLoteTodas([{ ativo: true, uso: 1 }, { ativo: true, uso: 3 }]);
    expect(todasEmUso.find((i) => i.id === "lote-excluir")).toMatchObject({ desabilitado: expect.stringContaining("em uso") });
  });

  it("confirmação do lote fala de itens (a seleção mistura cards e subs)", () => {
    const ex = itensDoLoteTodas([{ ativo: true, uso: 0 }]).find((i) => i.id === "lote-excluir");
    expect(ex && "confirmar" in ex ? ex.confirmar?.titulo : null).toBe("Excluir os itens selecionados?");
  });
});
