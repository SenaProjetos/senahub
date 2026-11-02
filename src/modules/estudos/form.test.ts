import { describe, expect, it } from "vitest";

import { novaLinha } from "@/modules/ferramentas/carga-linha";

import { conteudoSchema, MAX_AMBIENTES, MAX_CARGAS_ESTUDO } from "./conteudo";
import {
  assinatura,
  duplicarAmbiente,
  estadoInicial,
  linhaEmBranco,
  moverCargaParaAmbiente,
  montarConteudo,
  novoAmbiente,
  podeAdicionarAmbiente,
  podeAdicionarCarga,
  type EstadoEstudo,
} from "./form";

const base = (): EstadoEstudo => estadoInicial("Casa", null);
const comCarga = (over: Partial<ReturnType<typeof novaLinha>> = {}) => novaLinha({ descricao: "Chuveiro", potenciaW: "5500", tensaoV: "220", ...over });

describe("montarConteudo", () => {
  it("estudo sem ambientes é válido (estado inicial)", () => {
    const m = montarConteudo(base());
    expect(m.erro).toBeUndefined();
    expect(m.conteudo?.ambientes).toEqual([]);
  });

  it("converte o texto digitado e passa no esquema do servidor", () => {
    const e = base();
    e.ambientes = [novoAmbiente({ nome: " Banheiro ", linhas: [comCarga({ tipoPonto: "tomada_uso_especifico", fdPct: "80" })] })];
    e.fonte = " NDU da concessionária ";
    const m = montarConteudo(e);
    expect(m.erro).toBeUndefined();
    expect(conteudoSchema.safeParse(m.conteudo).success).toBe(true);
    expect(m.conteudo?.ambientes[0]).toMatchObject({ nome: "Banheiro" });
    expect(m.conteudo?.ambientes[0].cargas[0]).toMatchObject({ descricao: "Chuveiro", potenciaW: 5500, fd: 0.8, tipoPonto: "tomada_uso_especifico" });
    expect(m.conteudo?.fonteFatorDemanda).toBe("NDU da concessionária");
    expect(m.conteudo?.observacoes).toBeUndefined();
  });

  it("linha em branco é ignorada (e contada); linha pela metade é erro citando ambiente e carga", () => {
    const e = base();
    e.ambientes = [novoAmbiente({ nome: "Sala", linhas: [novaLinha(), comCarga(), novaLinha({ descricao: "Lâmpadas" })] })];
    const m = montarConteudo(e);
    expect(m.erro).toBe("Sala · Carga 2: informe a potência unitária em W.");
    e.ambientes[0].linhas.pop();
    const ok = montarConteudo(e);
    expect(ok.ignoradas).toBe(1);
    expect(ok.conteudo?.ambientes[0].cargas).toHaveLength(1);
  });

  it("descrição vazia com potência vira 'Carga N'", () => {
    const e = base();
    e.ambientes = [novoAmbiente({ nome: "Sala", linhas: [comCarga({ descricao: "" })] })];
    expect(montarConteudo(e).conteudo?.ambientes[0].cargas[0].descricao).toBe("Carga 1");
  });

  it("ambiente sem nome é erro; temperatura fora da tabela é recusada pelo esquema", () => {
    const e = base();
    e.ambientes = [novoAmbiente({ nome: "  " })];
    expect(montarConteudo(e).erro).toBe("Ambiente 1: dê um nome.");
    e.ambientes[0].nome = "Sala";
    e.geral.temperaturaC = "33";
    expect(montarConteudo(e).erro).toMatch(/Temperatura fora da Tabela 40/);
  });
});

describe("estadoInicial", () => {
  it("ida e volta: o que foi gravado reabre igual", () => {
    const e = base();
    e.ambientes = [novoAmbiente({ nome: "Sala", linhas: [comCarga({ fdPct: "33,33" })] })];
    e.geral.isolacao = "EPR";
    e.geral.temperaturaC = "40";
    const gravado = montarConteudo(e).conteudo!;
    const reaberto = estadoInicial("Casa", gravado);
    expect(reaberto.ambientes[0].linhas[0]).toMatchObject({ potenciaW: "5500", fdPct: "33.33", tensaoV: "220" });
    expect(reaberto.geral).toMatchObject({ isolacao: "EPR", temperaturaC: "40" });
    expect(montarConteudo(reaberto).conteudo).toMatchObject({ condicoes: gravado.condicoes, ambientes: [{ id: gravado.ambientes[0].id, nome: "Sala" }] });
  });

  it("conteúdo ilegível abre vazio, sem quebrar", () => {
    expect(estadoInicial("X", null).ambientes).toEqual([]);
  });
});

describe("assinatura", () => {
  it("só muda quando o conteúdo muda (chaves internas não contam)", () => {
    const e = base();
    e.ambientes = [novoAmbiente({ id: "a1", nome: "Sala", linhas: [comCarga()] })];
    const antes = assinatura(e);
    const clone: EstadoEstudo = { ...e, ambientes: [{ ...e.ambientes[0], chave: 999, linhas: e.ambientes[0].linhas.map((l) => ({ ...l, chave: 12345 })) }] };
    expect(assinatura(clone)).toBe(antes);
    clone.ambientes[0].linhas[0].potenciaW = "5600";
    expect(assinatura(clone)).not.toBe(antes);
  });
});

describe("operações nos ambientes", () => {
  it("linhaEmBranco", () => {
    expect(linhaEmBranco(novaLinha())).toBe(true);
    expect(linhaEmBranco(novaLinha({ potenciaW: "10" }))).toBe(false);
  });

  it("duplicar ambiente: cópia logo abaixo, identificadores novos, mesmo conteúdo", () => {
    const a = novoAmbiente({ nome: "Sala", linhas: [comCarga()] });
    const b = novoAmbiente({ nome: "Cozinha" });
    const r = duplicarAmbiente([a, b], a.chave);
    expect(r.map((x) => x.nome)).toEqual(["Sala", "Sala (cópia)", "Cozinha"]);
    expect(r[1].id).not.toBe(a.id);
    expect(r[1].linhas[0].chave).not.toBe(a.linhas[0].chave);
    expect(r[1].linhas[0].potenciaW).toBe("5500");
  });

  it("duplicar não passa dos limites", () => {
    const cheio = Array.from({ length: MAX_AMBIENTES }, (_, i) => novoAmbiente({ nome: `A${i}` }));
    expect(duplicarAmbiente(cheio, cheio[0].chave)).toHaveLength(MAX_AMBIENTES);
    const grande = novoAmbiente({ nome: "G", linhas: Array.from({ length: MAX_CARGAS_ESTUDO / 2 + 1 }, () => comCarga()) });
    expect(duplicarAmbiente([grande], grande.chave)).toHaveLength(1);
  });

  it("mover carga para outro ambiente (vai para o fim do destino)", () => {
    const l1 = comCarga({ descricao: "um" });
    const l2 = comCarga({ descricao: "dois" });
    const a = novoAmbiente({ nome: "A", linhas: [l1, l2] });
    const b = novoAmbiente({ nome: "B", linhas: [comCarga({ descricao: "três" })] });
    const r = moverCargaParaAmbiente([a, b], a.chave, l1.chave, b.id);
    expect(r[0].linhas.map((l) => l.descricao)).toEqual(["dois"]);
    expect(r[1].linhas.map((l) => l.descricao)).toEqual(["três", "um"]);
  });

  it("mover para o mesmo ambiente ou para um que não existe não muda nada", () => {
    const l1 = comCarga();
    const a = novoAmbiente({ nome: "A", linhas: [l1] });
    expect(moverCargaParaAmbiente([a], a.chave, l1.chave, a.id)[0].linhas).toHaveLength(1);
    expect(moverCargaParaAmbiente([a], a.chave, l1.chave, "x")[0].linhas).toHaveLength(1);
  });

  it("limites de adicionar", () => {
    expect(podeAdicionarAmbiente(Array.from({ length: MAX_AMBIENTES }, () => novoAmbiente()))).toBe(false);
    expect(podeAdicionarCarga([novoAmbiente({ linhas: Array.from({ length: MAX_CARGAS_ESTUDO }, () => comCarga()) })])).toBe(false);
  });
});
