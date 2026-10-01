import { describe, expect, it } from "vitest";
import {
  ACAO_ADICIONAR_SUB,
  ACAO_EDITAR,
  ACAO_SIGLAS,
  ACAO_TIRAR,
  acaoUnica,
  itensDaLinhaCatalogo,
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
    const motivo = "“Hidrossanitário” já está em 3 projeto(s) — arquive pela tela de Disciplinas em vez de tirar da versão em que foi criado.";
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
