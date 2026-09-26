import { describe, expect, it } from "vitest";
import { planoDeAvanco, planoDeInsercaoAcima, planoDeRecuo, type NoArvore } from "./arvore-eap";

const no = (id: string, parentId: string | null, ordem: number, tipoEap = "atv"): NoArvore => ({ id, parentId, ordem, tipoEap });

// 1 Projeto
//   2 Estrutural
//     3 Lançamento   4 Fôrmas   5 Armaduras
//   6 Hidráulica
// 7 Entrega (marco, raiz)
const nos = [
  no("proj", null, 0),
  no("est", "proj", 1),
  no("lanc", "est", 2),
  no("form", "est", 3),
  no("arm", "est", 4),
  no("hid", "proj", 5),
  no("ent", null, 6, "mrc"),
];

describe("planoDeRecuo", () => {
  it("vira subtarefa da irmã que está logo acima", () => {
    expect(planoDeRecuo(nos, "form")).toEqual({ ok: true, novoPaiId: "lanc" });
    expect(planoDeRecuo(nos, "hid")).toEqual({ ok: true, novoPaiId: "est" });
  });

  it("a primeira do nível não tem quem a receba", () => {
    expect(planoDeRecuo(nos, "lanc")).toMatchObject({ ok: false });
    expect(planoDeRecuo(nos, "est")).toMatchObject({ ok: false });
    expect(planoDeRecuo(nos, "proj")).toMatchObject({ ok: false });
  });

  it("marco não recebe subtarefa", () => {
    const comMarco = [no("a", null, 0, "mrc"), no("b", null, 1)];
    expect(planoDeRecuo(comMarco, "b")).toEqual({ ok: false, motivo: "A tarefa acima é um marco e não pode ter subtarefas." });
  });

  it("a irmã de cima é a do MESMO nível, não a de cima na tela", () => {
    // "hid" está logo abaixo de "arm" na tela (que é de outro nível): quem a recebe é "est".
    expect(planoDeRecuo(nos, "hid")).toEqual({ ok: true, novoPaiId: "est" });
  });

  it("ordem embaralhada na lista não muda o resultado", () => {
    const embaralhado = [...nos].reverse();
    expect(planoDeRecuo(embaralhado, "form")).toEqual({ ok: true, novoPaiId: "lanc" });
  });

  it("tarefa inexistente", () => {
    expect(planoDeRecuo(nos, "x")).toEqual({ ok: false, motivo: "Tarefa não encontrada." });
  });
});

describe("planoDeAvanco", () => {
  it("sobe um nível, logo depois do pai antigo, levando as irmãs de baixo como filhas", () => {
    const r = planoDeAvanco(nos, "form");
    expect(r).toEqual({ ok: true, novoPaiId: "proj", depoisDeId: "est", reparentarIds: ["arm"] });
  });

  it("a última irmã avança sem levar ninguém", () => {
    expect(planoDeAvanco(nos, "arm")).toEqual({ ok: true, novoPaiId: "proj", depoisDeId: "est", reparentarIds: [] });
  });

  it("a primeira irmã leva todas as outras", () => {
    expect(planoDeAvanco(nos, "lanc")).toEqual({ ok: true, novoPaiId: "proj", depoisDeId: "est", reparentarIds: ["form", "arm"] });
  });

  it("do segundo nível vai para a raiz", () => {
    expect(planoDeAvanco(nos, "est")).toEqual({ ok: true, novoPaiId: null, depoisDeId: "proj", reparentarIds: ["hid"] });
  });

  it("quem já está na raiz não avança", () => {
    expect(planoDeAvanco(nos, "proj")).toEqual({ ok: false, motivo: "Esta tarefa já está no nível mais alto." });
    expect(planoDeAvanco(nos, "ent")).toMatchObject({ ok: false });
  });

  it("linha órfã (pai que não existe) conta como raiz", () => {
    expect(planoDeAvanco([no("x", "fantasma", 0)], "x")).toMatchObject({ ok: false });
  });
});

describe("planoDeInsercaoAcima", () => {
  it("nasce no mesmo nível, no lugar da linha, empurrando as de ordem igual ou maior", () => {
    expect(planoDeInsercaoAcima(nos, "form")).toEqual({ ok: true, paiId: "est", aPartirDeOrdem: 3 });
    expect(planoDeInsercaoAcima(nos, "proj")).toEqual({ ok: true, paiId: null, aPartirDeOrdem: 0 });
  });

  it("tarefa inexistente", () => {
    expect(planoDeInsercaoAcima(nos, "x")).toEqual({ ok: false, motivo: "Tarefa não encontrada." });
  });
});
