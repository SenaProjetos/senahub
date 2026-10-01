import { describe, expect, it } from "vitest";
import {
  ajusteSchema,
  atualizarAntes,
  daLinha,
  diferencasObservadas,
  estadoDoAjuste,
  paraLinha,
  type AjusteSimulado,
} from "@/modules/financeiro/liquidez/ajustes";
import { observadoDe } from "@/modules/financeiro/liquidez/eventos";
import { aplicarSimulacao } from "@/modules/financeiro/liquidez/simulacao";
import { dia, evento, HOJE, reais } from "@/modules/financeiro/liquidez/fixtures";
import type { Observado } from "@/modules/financeiro/liquidez/tipos";

const foto: Observado = { status: "previsto", excluido: false, data: dia(9), valor: reais(15_000), prioridade: null, confianca: null, caixinhaId: null };

describe("esquema do ajuste (spec §6)", () => {
  it("aceita cada tipo e recusa o que não é ajuste", () => {
    const validos: AjusteSimulado[] = [
      { tipo: "REPROGRAMAR_DATA", eventoId: "a", data: dia(19), antes: foto, rotulo: "Fornecedor" },
      { tipo: "ALTERAR_PRIORIDADE", eventoId: "a", prioridade: "p4" },
      { tipo: "ALTERAR_CONFIANCA", eventoId: "b", confianca: "confirmada_cliente" },
      { tipo: "ALTERAR_CAIXINHA", eventoId: "a", caixinhaId: "cx1", caixinhaNome: "Impostos" },
      { tipo: "ALTERAR_CAIXINHA", eventoId: "a", caixinhaId: null },
      { tipo: "ALOCAR", eventoId: "b", regraNome: "Cliente", destinos: [{ caixinhaId: "cx1", caixinhaNome: "Impostos", valor: 6000 }] },
      { tipo: "EXCLUIR", eventoId: "a" },
      { tipo: "FORCAR_INCLUSAO", eventoId: "a" },
      { tipo: "INCLUIR", id: "d1", movimento: { tipo: "despesa", natureza: "fora_do_resultado", valor: reais(20_000), data: dia(15), descricao: "Distribuição" } },
    ];
    for (const a of validos) expect(ajusteSchema.safeParse(a).success).toBe(true);
    expect(ajusteSchema.safeParse({ tipo: "ALTERAR_VALOR", eventoId: "a", valor: 1 }).success).toBe(false);
    expect(ajusteSchema.safeParse({ tipo: "REPROGRAMAR_DATA", eventoId: "a", data: "10/10/2026" }).success).toBe(false);
    expect(ajusteSchema.safeParse({ tipo: "INCLUIR", id: "x", movimento: { tipo: "despesa", natureza: "resultado", valor: 0, data: dia(1), descricao: "x" } }).success).toBe(false);
  });

  it("ida e volta pela linha do banco (alvo, antes, depois) não perde nada", () => {
    const casos: AjusteSimulado[] = [
      { tipo: "REPROGRAMAR_DATA", eventoId: "a", data: dia(19), antes: foto, rotulo: "Fornecedor" },
      { tipo: "ALTERAR_PRIORIDADE", eventoId: "a", prioridade: "p4", antes: foto },
      { tipo: "ALTERAR_CONFIANCA", eventoId: "b", confianca: "incerta" },
      { tipo: "ALTERAR_CAIXINHA", eventoId: "a", caixinhaId: "cx1", caixinhaNome: "Impostos", antes: foto },
      { tipo: "ALOCAR", eventoId: "b", regraNome: "Cliente", destinos: [{ caixinhaId: "cx1", caixinhaNome: "Impostos", valor: 6000 }] },
      { tipo: "EXCLUIR", eventoId: "a", antes: foto },
      { tipo: "FORCAR_INCLUSAO", eventoId: "a" },
      { tipo: "INCLUIR", id: "d1", movimento: { tipo: "receita", natureza: "resultado", valor: reais(5_000), data: dia(3), descricao: "Entrada", categoriaId: "cat1", categoriaNome: "Projetos" } },
    ];
    for (const a of casos) {
      const linha = paraLinha(a);
      expect(daLinha(JSON.parse(JSON.stringify(linha)))).toEqual(a);
    }
    expect(paraLinha(casos[0]).lancamentoId).toBe("a");
    expect(paraLinha(casos[7]).lancamentoId).toBeNull();
    expect(paraLinha(casos[5]).depois).toEqual({ efeito: "nenhum" });
    expect(paraLinha(casos[4]).depois).toEqual({ destinos: [{ caixinhaId: "cx1", caixinhaNome: "Impostos", valor: 6000 }], regraNome: "Cliente" });
    expect(paraLinha(casos[3]).depois).toEqual({ caixinhaId: "cx1", caixinhaNome: "Impostos" });
  });

  it("linha que não valida vira null em vez de quebrar a tela", () => {
    expect(daLinha({ tipo: "REPROGRAMAR_DATA", alvo: { lancamento: "a" }, antes: null, depois: { data: "ontem" } })).toBeNull();
    expect(daLinha({ tipo: "QUALQUER", alvo: {}, antes: null, depois: {} })).toBeNull();
  });
});

describe("diferenças observadas e estado do ajuste (spec §11)", () => {
  it("nada mudou: válido", () => {
    const a: AjusteSimulado = { tipo: "REPROGRAMAR_DATA", eventoId: "a", data: dia(19), antes: foto };
    expect(estadoDoAjuste(a, { ...foto })).toEqual({ estado: "valido", motivo: null });
  });

  it("cenário salvo antes da F4 (foto sem caixinha) lê como sem caixinha e continua válido", () => {
    const { caixinhaId: _c, ...antiga } = foto;
    void _c;
    const a = { tipo: "REPROGRAMAR_DATA" as const, eventoId: "a", data: dia(19), antes: antiga };
    const lido = ajusteSchema.parse(a);
    expect(lido.tipo === "REPROGRAMAR_DATA" && lido.antes?.caixinhaId).toBeNull();
    expect(estadoDoAjuste(lido, { ...foto }).estado).toBe("valido");
  });

  it("caixinha trocada no real: obsoleto", () => {
    const a: AjusteSimulado = { tipo: "REPROGRAMAR_DATA", eventoId: "a", data: dia(19), antes: foto };
    expect(estadoDoAjuste(a, { ...foto, caixinhaId: "cx1" })).toEqual({ estado: "obsoleto", motivo: "a caixinha mudou" });
  });

  it("vencimento mudou: obsoleto, com o motivo em texto", () => {
    const a: AjusteSimulado = { tipo: "REPROGRAMAR_DATA", eventoId: "a", data: dia(19), antes: foto };
    const e = estadoDoAjuste(a, { ...foto, data: dia(11) });
    expect(e.estado).toBe("obsoleto");
    expect(e.motivo).toBe(`o vencimento mudou de ${dia(9).slice(8, 10)}/${dia(9).slice(5, 7)} para ${dia(11).slice(8, 10)}/${dia(11).slice(5, 7)}`);
  });

  it("pago, cancelado e excluído dizem só isso", () => {
    expect(diferencasObservadas(foto, { ...foto, status: "confirmado", data: dia(1) })).toEqual(["já foi pago ou recebido"]);
    expect(diferencasObservadas(foto, { ...foto, status: "cancelado" })).toEqual(["foi cancelado"]);
    expect(diferencasObservadas(foto, { ...foto, excluido: true })).toEqual(["foi excluído"]);
  });

  it("várias diferenças aparecem juntas; updatedAt não é campo observado", () => {
    const d = diferencasObservadas(foto, { ...foto, valor: reais(16_000), prioridade: "p2", confianca: "incerta" });
    expect(d).toHaveLength(3);
    expect(d[0]).toContain("valor");
  });

  it("alvo que não existe mais e ajuste já aplicado", () => {
    const a: AjusteSimulado = { tipo: "ALTERAR_PRIORIDADE", eventoId: "a", prioridade: "p4", antes: foto };
    expect(estadoDoAjuste(a, null).estado).toBe("inexistente");
    expect(estadoDoAjuste(a, foto, "2026-10-05T12:00:00.000Z")).toEqual({ estado: "aplicado", motivo: "aplicado em 05/10" });
  });

  it("INCLUIR não tem alvo: sempre válido até ser aplicado", () => {
    const a: AjusteSimulado = { tipo: "INCLUIR", id: "x", movimento: { tipo: "despesa", natureza: "resultado", valor: 1, data: dia(1), descricao: "x" } };
    expect(estadoDoAjuste(a, undefined).estado).toBe("valido");
  });

  it("“Atualizar ajustes” regrava o antes com a foto de agora", () => {
    const a: AjusteSimulado = { tipo: "REPROGRAMAR_DATA", eventoId: "a", data: dia(19), antes: foto };
    const agora = { ...foto, data: dia(11) };
    const novo = atualizarAntes(a, agora);
    expect(estadoDoAjuste(novo, agora).estado).toBe("valido");
    expect(a.antes).toEqual(foto); // não muta
  });
});

describe("efeito de cada tipo na projeção e simulação × real (spec §10)", () => {
  it("o evento leva a foto do lançamento com os valores GRAVADOS, não os efetivos", () => {
    const o = observadoDe({ status: "previsto", vencimento: null, data: dia(4), valor: reais(10), prioridade: null, confianca: null });
    expect(o).toEqual({ status: "previsto", excluido: false, data: dia(4), valor: reais(10), prioridade: null, confianca: null, caixinhaId: null });
  });

  it("FORCAR_INCLUSAO e EXCLUIR só marcam a simulação; o evento real não muda", () => {
    const base = [evento({ id: "a", tipo: "despesa", valor: reais(10), data: dia(2) })];
    const copia = JSON.parse(JSON.stringify(base));
    aplicarSimulacao(base, [{ tipo: "EXCLUIR", eventoId: "a" }, { tipo: "FORCAR_INCLUSAO", eventoId: "a" }], HOJE);
    expect(base).toEqual(copia);
  });
});
