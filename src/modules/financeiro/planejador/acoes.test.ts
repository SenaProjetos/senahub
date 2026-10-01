import { describe, expect, it } from "vitest";
import type { AcaoItem } from "@/components/ui/acoes";
import { evento, dia, reais } from "@/modules/financeiro/liquidez/fixtures";
import {
  ACAO_INCLUIR,
  ACAO_REMOVER_SIMULADO,
  ACAO_SIMULAR_DATA,
  ACAO_TIRAR,
  ACAO_VOLTAR,
  itensDeEventoDoPlanejador,
} from "@/modules/financeiro/planejador/acoes";

const ids = (xs: AcaoItem[]) => xs.map((x) => x.id);

describe("menu de um movimento do planejador (ADR-0002)", () => {
  const fornecedor = { ...evento({ id: "f", tipo: "despesa", valor: reais(10), data: dia(3), prioridade: "p3" }), noCenario: true };

  it("despesa no cenário: detalhes, simular data, tirar, prioridade, abrir e copiar", () => {
    expect(ids(itensDeEventoDoPlanejador(fornecedor))).toEqual([
      "detalhes",
      ACAO_SIMULAR_DATA,
      ACAO_TIRAR,
      "sep-mudar",
      "sub-prioridade",
      "sep-navegar",
      "abrir",
      "copiar-valor",
      "copiar-descricao",
    ]);
  });

  it("data com dono: simular data fica desabilitado com o motivo", () => {
    const itens = itensDeEventoDoPlanejador({ ...fornecedor, prioridade: "p1", naoProgramavel: "P1 não pode atrasar." });
    expect(itens.find((i) => i.id === ACAO_SIMULAR_DATA)).toMatchObject({ desabilitado: "P1 não pode atrasar." });
  });

  it("receita fora do cenário: incluir, e confiança no lugar de prioridade", () => {
    const rec = { ...evento({ id: "r", tipo: "receita", valor: reais(10), data: dia(3), confianca: "estimada" }), noCenario: false };
    const itens = itensDeEventoDoPlanejador(rec);
    expect(ids(itens)).toContain(ACAO_INCLUIR);
    expect(ids(itens)).toContain("sub-confianca");
    expect(ids(itens)).not.toContain("sub-prioridade");
    const sub = itens.find((i) => i.id === "sub-confianca");
    expect(sub && sub.tipo === "sub" && sub.itens.find((i) => i.tipo === "acao" && i.marcado)?.id).toBe("confianca:estimada");
  });

  it("tirado da simulação: voltar", () => {
    expect(ids(itensDeEventoDoPlanejador({ ...fornecedor, simulacao: { excluido: true } }))).toContain(ACAO_VOLTAR);
  });

  it("movimento simulado: remover (com confirmação), sem abrir lançamento nem mudar prioridade", () => {
    const sim = { ...evento({ id: "sim:1", tipo: "despesa", valor: reais(10), data: dia(3), origem: "simulado" }), noCenario: true };
    const itens = itensDeEventoDoPlanejador(sim);
    expect(ids(itens)).not.toContain("abrir");
    expect(ids(itens)).not.toContain("sub-prioridade");
    expect(itens.find((i) => i.id === ACAO_REMOVER_SIMULADO)).toMatchObject({ variant: "destructive", confirmar: expect.any(Object) });
  });

  it("compromisso programado (ainda não virou lançamento) não tem o que abrir", () => {
    const p = { ...evento({ id: "rec:1", tipo: "despesa", valor: reais(10), data: dia(3), origem: "programado" }), noCenario: true };
    expect(ids(itensDeEventoDoPlanejador(p))).not.toContain("abrir");
  });

  it("transferência não muda prioridade nem confiança", () => {
    const t = { ...evento({ id: "t", tipo: "despesa", natureza: "transferencia", valor: reais(10), data: dia(3) }), noCenario: true };
    expect(ids(itensDeEventoDoPlanejador(t))).not.toContain("sub-prioridade");
  });
});
