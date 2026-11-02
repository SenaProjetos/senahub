import { describe, expect, it } from "vitest";
import type { SecaoBriefing } from "./briefing-schema";
import {
  adicionarCampo,
  adicionarSecao,
  atualizarCampo,
  duplicarCampo,
  moverCampoParaSecao,
  moverItem,
  removerCampo,
  reordenarCampos,
  reordenarOpcoes,
  reordenarSecoes,
} from "./modelo-editor";

const base = (): SecaoBriefing[] => [
  {
    id: "s1",
    titulo: "Um",
    campos: [
      { chave: "a", label: "A", tipo: "text", obrigatorio: false, formato: "email", importarDoCadastro: "email" },
      { chave: "b", label: "B", tipo: "radio", obrigatorio: true, opcoes: ["x", "y", "z"] },
    ],
  },
  { id: "s2", titulo: "Dois", campos: [{ chave: "c", label: "C", tipo: "textarea", obrigatorio: false }] },
];

describe("modelo-editor", () => {
  it("moverItem ignora índice inválido", () => {
    expect(moverItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moverItem([1, 2, 3], 0, 9)).toEqual([1, 2, 3]);
  });

  it("adiciona seção e pergunta com chaves novas, sem mexer no resto", () => {
    const e = adicionarSecao(base());
    expect(e).toHaveLength(3);
    const f = adicionarCampo(e, "s2");
    expect(f[1].campos).toHaveLength(2);
    expect(f[1].campos[1].chave).toMatch(/^c[a-z0-9]{8}$/);
    expect(f[0]).toEqual(base()[0]);
  });

  it("mudar o tipo ajusta opções, formato e placeholder", () => {
    let e = atualizarCampo(base(), "a", { tipo: "radio" });
    expect(e[0].campos[0].opcoes).toEqual(["Opção 1", "Opção 2"]);
    expect(e[0].campos[0].formato).toBeUndefined();
    e = atualizarCampo(base(), "b", { tipo: "sim-nao" });
    expect(e[0].campos[1].opcoes).toEqual(["Sim", "Não"]);
    e = atualizarCampo(base(), "b", { tipo: "checkbox" });
    expect(e[0].campos[1].opcoes).toEqual(["x", "y", "z"]);
    e = atualizarCampo(base(), "b", { tipo: "checkbox-single" });
    expect(e[0].campos[1].opcoes).toEqual(["x"]);
    e = atualizarCampo(base(), "b", { tipo: "text" });
    expect(e[0].campos[1].opcoes).toBeUndefined();
  });

  it("duplicar cria chave própria logo abaixo e não leva o vínculo com o cadastro", () => {
    const e = duplicarCampo(base(), "a");
    expect(e[0].campos.map((c) => c.label)).toEqual(["A", "A (cópia)", "B"]);
    expect(e[0].campos[1].chave).not.toBe("a");
    expect(e[0].campos[1].importarDoCadastro).toBeUndefined();
  });

  it("mover para outra seção leva ao fim e remover tira só ela", () => {
    const e = moverCampoParaSecao(base(), "a", "s2");
    expect(e[0].campos.map((c) => c.chave)).toEqual(["b"]);
    expect(e[1].campos.map((c) => c.chave)).toEqual(["c", "a"]);
    expect(removerCampo(e, "c")[1].campos.map((c) => c.chave)).toEqual(["a"]);
  });

  it("reordena seções, perguntas e opções", () => {
    expect(reordenarSecoes(base(), "s2", "s1").map((s) => s.id)).toEqual(["s2", "s1"]);
    expect(reordenarCampos(base(), "s1", "b", "a")[0].campos.map((c) => c.chave)).toEqual(["b", "a"]);
    expect(reordenarOpcoes(base(), "b", 2, 0)[0].campos[1].opcoes).toEqual(["z", "x", "y"]);
  });
});
