import { describe, expect, it } from "vitest";
import {
  MOTIVO_APROVADO_SEM_REVISAO,
  MOTIVO_JA_COMECOU,
  MOTIVO_JA_NA_TAREFA,
  MOTIVO_SEM_PERMISSAO_NO_PROJETO,
  MOTIVO_TIRAR_PESSOA,
  diasDoArrasto,
  motivoParaNaoMoverData,
  motivoParaNaoTrocarPessoa,
  resumoDasSeguintes,
  seguintesDaLinha,
  textoDasSeguintes,
  textoDoAvisoDeMudanca,
  traduzirMotivoDoServidor,
  type LinhaParaSeguintes,
} from "./planejador-acoes";
import { MOTIVO_PLANO_TRAVADO } from "./trava-plano";

const rascunho = { editavel: true, aprovado: false, emRevisao: false, souCoordenador: true };

describe("o que a barra pode fazer (cenário A do Ryan)", () => {
  it("rascunho: move a data e troca a pessoa", () => {
    expect(motivoParaNaoMoverData(rascunho, { iniciada: false })).toBeNull();
    expect(motivoParaNaoTrocarPessoa(rascunho, ["mireli"], "joao")).toBeNull();
  });

  it("aprovado sem revisão: a data não se move, a pessoa troca; com a revisão aberta, a data move", () => {
    const aprovado = { ...rascunho, aprovado: true };
    expect(motivoParaNaoMoverData(aprovado, { iniciada: false })).toBe(MOTIVO_APROVADO_SEM_REVISAO);
    expect(motivoParaNaoTrocarPessoa(aprovado, ["mireli"], "joao")).toBeNull();
    expect(motivoParaNaoMoverData({ ...aprovado, emRevisao: true }, { iniciada: false })).toBeNull();
  });

  it("sem permissão no projeto (ou sem dado do projeto): nada", () => {
    const fora = { ...rascunho, editavel: false };
    expect(motivoParaNaoMoverData(fora, { iniciada: false })).toBe(MOTIVO_SEM_PERMISSAO_NO_PROJETO);
    expect(motivoParaNaoTrocarPessoa(fora, [], "joao")).toBe(MOTIVO_SEM_PERMISSAO_NO_PROJETO);
    expect(motivoParaNaoMoverData(null, { iniciada: false })).toBe(MOTIVO_SEM_PERMISSAO_NO_PROJETO);
  });

  it("tarefa que já começou não muda de data; pessoa repetida e 'tirar' são recusados", () => {
    expect(motivoParaNaoMoverData(rascunho, { iniciada: true })).toBe(MOTIVO_JA_COMECOU);
    expect(motivoParaNaoTrocarPessoa(rascunho, ["mireli", "joao"], "joao")).toBe(MOTIVO_JA_NA_TAREFA);
    expect(motivoParaNaoTrocarPessoa(rascunho, ["mireli"], null)).toBe(MOTIVO_TIRAR_PESSOA);
  });

  it("a recusa do plano travado no servidor vira a frase da barra", () => {
    expect(traduzirMotivoDoServidor(MOTIVO_PLANO_TRAVADO)).toBe(MOTIVO_APROVADO_SEM_REVISAO);
    expect(traduzirMotivoDoServidor("outra")).toBe("outra");
  });
});

describe("diasDoArrasto", () => {
  it("arredonda para o dia mais perto, sem -0", () => {
    expect(diasDoArrasto(95, 44)).toBe(2);
    expect(diasDoArrasto(20, 44)).toBe(0);
    expect(diasDoArrasto(-20, 44)).toBe(0);
    expect(diasDoArrasto(-31, 12)).toBe(-3);
    expect(diasDoArrasto(10, 0)).toBe(0);
  });
});

describe("seguintesDaLinha", () => {
  const linhas = new Map<string, LinhaParaSeguintes>([
    ["a", { id: "a", nome: "Modelagem", restricaoData: null, aberta: true }],
    ["b", { id: "b", nome: "Revisão interna", restricaoData: null, aberta: true }],
    ["c", { id: "c", nome: "Entrega", restricaoData: "2026-12-10", aberta: true }],
    ["d", { id: "d", nome: "Aprovação", restricaoData: "2026-12-15", aberta: false }],
    ["x", { id: "x", nome: "Outra", restricaoData: "2026-12-01", aberta: true }],
  ]);
  const vinculos = [
    { tarefaId: "b", predecessoraId: "a" },
    { tarefaId: "c", predecessoraId: "b" },
    { tarefaId: "d", predecessoraId: "c" },
    // Ciclo não trava a busca.
    { tarefaId: "a", predecessoraId: "d" },
  ];

  it("todas pelos vínculos, em ordem de distância; fixadas = abertas com data fixada", () => {
    const s = seguintesDaLinha("a", vinculos, linhas);
    expect(s).toEqual({ todas: ["b", "c", "d"], fixadas: ["c"] });
    expect(seguintesDaLinha("x", vinculos, linhas)).toEqual({ todas: [], fixadas: [] });
  });

  it("o texto da confirmação", () => {
    const r = resumoDasSeguintes(seguintesDaLinha("a", vinculos, linhas), linhas);
    expect(r).toEqual({ total: 3, fixadas: 1, nomes: ["Revisão interna", "Entrega"] });
    expect(textoDasSeguintes(r)).toBe('"Revisão interna" e mais 2');
    expect(textoDasSeguintes({ total: 1, fixadas: 0, nomes: ["Revisão interna"] })).toBe('"Revisão interna"');
    expect(textoDasSeguintes({ total: 2, fixadas: 0, nomes: ["A", "B"] })).toBe('"A" e "B"');
    expect(textoDasSeguintes({ total: 0, fixadas: 0, nomes: [] })).toBe("");
  });
});

describe("textoDoAvisoDeMudanca", () => {
  it("data, troca e atribuição", () => {
    expect(textoDoAvisoDeMudanca({ tipo: "data", autor: "Ana", projeto: "X", tarefa: "Modelagem", inicio: "2026-11-30" })).toEqual({
      titulo: "Cronograma X: data mudada",
      corpo: 'Ana mudou o início de "Modelagem" para 30/11 na tela por pessoa de Recursos.',
    });
    expect(textoDoAvisoDeMudanca({ tipo: "pessoa", autor: "Ana", projeto: "X", tarefa: "M", de: "Mireli", para: "João" }).corpo).toBe(
      'Ana trocou Mireli por João em "M" na tela por pessoa de Recursos.',
    );
    expect(textoDoAvisoDeMudanca({ tipo: "pessoa", autor: "Ana", projeto: "X", tarefa: "M", de: null, para: "João" }).titulo).toBe(
      "Cronograma X: pessoa atribuída",
    );
  });
});
