import { describe, expect, it } from "vitest";
import { projetar } from "@/modules/financeiro/liquidez/motor";
import { situacaoDaPerna } from "@/modules/financeiro/liquidez/transferencias";
import { dia, entradaMotor, evento, reais, saldoEm } from "@/modules/financeiro/liquidez/fixtures";
import type { Contraparte, EventoCaixa } from "@/modules/financeiro/liquidez/tipos";

function perna(id: string, tipo: "receita" | "despesa", data: string, transferenciaId: string | null, contrapartes: Contraparte[]): EventoCaixa {
  return evento({ id, tipo, natureza: "transferencia", valor: reais(100), data, transferencia: { id: transferenciaId, contrapartes } });
}

const S0 = reais(1_000);

describe("transferência entre contas próprias (spec §2)", () => {
  it("a) duas pernas no mesmo dia: o fechamento do dia não muda e T = 0", () => {
    const p = projetar(
      entradaMotor({
        caixaAtual: S0,
        eventos: [
          perna("sai", "despesa", dia(2), "t1", [{ id: "entra", realizada: false, data: dia(2) }]),
          perna("entra", "receita", dia(2), "t1", [{ id: "sai", realizada: false, data: dia(2) }]),
        ],
      }),
    );
    expect(saldoEm(p.serie, 2)).toBe(S0);
    expect(p.totais.transferencias).toBe(0);
    expect(p.totais.entradas).toBe(0);
    expect(p.totais.compromissos).toBe(0);
    expect(p.avisos).toHaveLength(0);
    expect(p.eventos.every((e) => e.situacaoTransferencia === "pareada")).toBe(true);
  });

  it("b) pernas em dias diferentes: o dinheiro fica em trânsito entre as datas e volta", () => {
    const p = projetar(
      entradaMotor({
        caixaAtual: S0,
        eventos: [
          perna("sai", "despesa", dia(2), "t1", [{ id: "entra", realizada: false, data: dia(5) }]),
          perna("entra", "receita", dia(5), "t1", [{ id: "sai", realizada: false, data: dia(2) }]),
        ],
      }),
    );
    for (const n of [2, 3, 4]) expect(saldoEm(p.serie, n)).toBe(S0 - reais(100));
    expect(saldoEm(p.serie, 5)).toBe(S0);
    expect(p.totais.transferencias).toBe(0);
    expect(p.avisos).toHaveLength(0);
  });

  it("c) perna sem contraparte: muda o saldo até o fim e avisa — não some", () => {
    const p = projetar(entradaMotor({ caixaAtual: S0, eventos: [perna("sozinha", "despesa", dia(2), null, [])] }));
    expect(saldoEm(p.serie, 1)).toBe(S0);
    expect(saldoEm(p.serie, 2)).toBe(S0 - reais(100));
    expect(p.fimDoHorizonte.caixa).toBe(S0 - reais(100));
    expect(p.totais.transferencias).toBe(reais(-100));
    expect(p.totais.compromissos).toBe(0);
    expect(p.avisos).toEqual([{ tipo: "transferencia", eventoId: "sozinha", mensagem: expect.stringContaining("sem contraparte") }]);
  });

  it("d) contraparte depois do horizonte: a perna de dentro muda o saldo; T ≠ 0 e avisa", () => {
    const p = projetar(
      entradaMotor({
        caixaAtual: S0,
        horizonteDias: 30,
        eventos: [perna("sai", "despesa", dia(2), "t1", [{ id: "entra", realizada: false, data: dia(40) }])],
      }),
    );
    expect(p.fimDoHorizonte.caixa).toBe(S0 - reais(100));
    expect(p.totais.transferencias).toBe(reais(-100));
    expect(p.eventos[0].situacaoTransferencia).toBe("contraparte_fora_do_horizonte");
    expect(p.avisos[0].mensagem).toContain("fora do horizonte");
  });

  it("e) contraparte já realizada: a perna pendente desfaz o desequilíbrio que ficou no caixa atual", () => {
    // A saída já aconteceu (S0 está R$ 100 menor); a entrada na outra conta ainda é pendente.
    const p = projetar(
      entradaMotor({
        caixaAtual: S0 - reais(100),
        eventos: [perna("entra", "receita", dia(1), "t1", [{ id: "sai", realizada: true, data: dia(-1) }])],
      }),
    );
    expect(saldoEm(p.serie, 1)).toBe(S0);
    expect(p.eventos[0].situacaoTransferencia).toBe("contraparte_realizada");
    expect(p.avisos[0].mensagem).toContain("Em trânsito");
  });

  it("pernas entram em qualquer cenário e nunca nos totais; a identidade fecha com T", () => {
    const p = projetar(
      entradaMotor({
        caixaAtual: S0,
        eixos: { entradas: "confirmadas", compromissos: "p1" },
        eventos: [
          perna("sozinha", "despesa", dia(3), null, []),
          evento({ id: "cliente", tipo: "receita", valor: reais(200), data: dia(4), confianca: "confirmada_cliente" }),
          evento({ id: "folha", tipo: "despesa", valor: reais(300), data: dia(5), prioridade: "p1" }),
        ],
      }),
    );
    const { entradas: E, compromissos: C, transferencias: T } = p.totais;
    expect(E).toBe(reais(200));
    expect(C).toBe(reais(300));
    expect(T).toBe(reais(-100));
    expect(p.fimDoHorizonte.caixa).toBe(S0 + E - C + T);
    expect(p.serie.find((s) => s.dia === dia(3))!).toMatchObject({ entradas: 0, saidas: 0, transferencias: reais(-100) });
  });

  it("transferência não entra no total reprogramável nem no impacto %", () => {
    const p = projetar(
      entradaMotor({ caixaAtual: reais(50), reservaMinima: reais(30), eventos: [perna("sozinha", "despesa", dia(1), null, [])] }),
    );
    expect(p.primeiroDiaNegativo).toBe(dia(1));
    expect(p.reprogramavelP3P4).toBe(0);
    expect(p.eventos[0].impactoPercentual).toBeNull();
  });
});

describe("situacaoDaPerna", () => {
  const fim = dia(29);
  it("prefere par pendente no horizonte, depois realizada, depois fora do horizonte", () => {
    expect(situacaoDaPerna(perna("x", "despesa", dia(1), "t", [{ id: "y", realizada: false, data: dia(3) }]), fim).situacao).toBe("pareada");
    expect(situacaoDaPerna(perna("x", "despesa", dia(1), "t", [{ id: "y", realizada: true, data: dia(-2) }]), fim).situacao).toBe("contraparte_realizada");
    expect(situacaoDaPerna(perna("x", "despesa", dia(1), "t", [{ id: "y", realizada: false, data: dia(60) }]), fim).situacao).toBe("contraparte_fora_do_horizonte");
    expect(situacaoDaPerna(perna("x", "despesa", dia(1), "t", []), fim).situacao).toBe("sem_contraparte");
    expect(situacaoDaPerna(perna("x", "despesa", dia(1), null, [{ id: "y", realizada: false, data: dia(3) }]), fim).situacao).toBe("sem_contraparte");
  });
});
