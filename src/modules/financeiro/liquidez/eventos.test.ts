import { describe, expect, it } from "vitest";
import {
  confiancaEfetiva,
  dataDoEvento,
  MOTIVO_APROVACAO,
  MOTIVO_ART,
  MOTIVO_P1,
  MOTIVO_PREVISAO,
  paraEventos,
  prioridadeEfetiva,
} from "@/modules/financeiro/liquidez/eventos";
import { dia, HOJE, reais } from "@/modules/financeiro/liquidez/fixtures";
import type { LancamentoEntrada } from "@/modules/financeiro/liquidez/tipos";

function lanc(p: Partial<LancamentoEntrada> & Pick<LancamentoEntrada, "id" | "tipo" | "status">): LancamentoEntrada {
  return {
    valor: reais(100),
    data: dia(1),
    vencimento: null,
    descricao: p.id,
    prioridade: null,
    confianca: null,
    categoria: { natureza: "resultado", prioridadePadrao: null, prioridadePadraoPai: null },
    ...p,
  };
}
const opcoes = { hoje: HOJE, diasParaIncerta: 30 };

describe("só pendente vira evento (realizado já está no caixa atual)", () => {
  it("previsto, aguardando aprovação e previsão do cronograma entram; o resto não", () => {
    const ev = paraEventos(
      [
        lanc({ id: "previsto", tipo: "despesa", status: "previsto" }),
        lanc({ id: "aguardando", tipo: "despesa", status: "aguardando_aprovacao" }),
        lanc({ id: "previsao", tipo: "receita", status: "previsao" }),
        lanc({ id: "realizado", tipo: "receita", status: "confirmado" }),
        lanc({ id: "cancelado", tipo: "despesa", status: "cancelado" }),
        lanc({ id: "excluido", tipo: "despesa", status: "previsto", excluido: true }),
        lanc({ id: "zerado", tipo: "despesa", status: "previsto", valor: 0 }),
      ],
      opcoes,
    );
    expect(ev.map((e) => e.id).sort()).toEqual(["aguardando", "previsao", "previsto"]);
  });
});

describe("status × confiança nunca se confundem (ADR-0007)", () => {
  it("receita realizada com confiança 'confirmada pelo cliente' não vira evento", () => {
    const ev = paraEventos([lanc({ id: "x", tipo: "receita", status: "confirmado", confianca: "confirmada_cliente" })], opcoes);
    expect(ev).toHaveLength(0);
  });

  it("confiança confirmada pelo cliente não realiza a receita: ela continua pendente na projeção", () => {
    const [e] = paraEventos([lanc({ id: "x", tipo: "receita", status: "previsto", confianca: "confirmada_cliente" })], opcoes);
    expect(e.status).toBe("previsto");
    expect(e.confianca).toBe("confirmada_cliente");
  });

  it("padrão: faturada = provável, previsão do cronograma = estimada; a gravada vence", () => {
    expect(confiancaEfetiva(lanc({ id: "a", tipo: "receita", status: "previsto" }), HOJE, 30)).toBe("provavel");
    expect(confiancaEfetiva(lanc({ id: "b", tipo: "receita", status: "previsao" }), HOJE, 30)).toBe("estimada");
    expect(confiancaEfetiva(lanc({ id: "c", tipo: "receita", status: "previsto", confianca: "estimada" }), HOJE, 30)).toBe("estimada");
  });

  it("despesa e realizado não têm confiança", () => {
    expect(confiancaEfetiva(lanc({ id: "d", tipo: "despesa", status: "previsto", confianca: "provavel" }), HOJE, 30)).toBeNull();
    expect(confiancaEfetiva(lanc({ id: "r", tipo: "receita", status: "confirmado", confianca: "provavel" }), HOJE, 30)).toBeNull();
  });

  it("receita vencida há mais de diasParaIncerta conta como incerta, sem gravar", () => {
    const vencida31 = lanc({ id: "v31", tipo: "receita", status: "previsto", confianca: "confirmada_cliente", data: dia(-31) });
    const vencida30 = lanc({ id: "v30", tipo: "receita", status: "previsto", data: dia(-30) });
    expect(confiancaEfetiva(vencida31, HOJE, 30)).toBe("incerta");
    expect(confiancaEfetiva(vencida30, HOJE, 30)).toBe("provavel");
    expect(vencida31.confianca).toBe("confirmada_cliente");
  });
});

describe("data, prioridade e o que não pode mudar de data", () => {
  it("data do evento = vencimento ?? data", () => {
    expect(dataDoEvento({ vencimento: dia(5), data: dia(1) })).toBe(dia(5));
    expect(dataDoEvento({ vencimento: null, data: dia(1) })).toBe(dia(1));
  });

  it("prioridade: lançamento, senão categoria, senão categoria-pai, senão P3; receita não tem", () => {
    const cat = (prioridadePadrao: "p1" | null, prioridadePadraoPai: "p2" | null) => ({ natureza: "resultado" as const, prioridadePadrao, prioridadePadraoPai });
    expect(prioridadeEfetiva({ tipo: "despesa", prioridade: "p4", categoria: cat("p1", "p2") })).toBe("p4");
    expect(prioridadeEfetiva({ tipo: "despesa", prioridade: null, categoria: cat("p1", "p2") })).toBe("p1");
    expect(prioridadeEfetiva({ tipo: "despesa", prioridade: null, categoria: cat(null, "p2") })).toBe("p2");
    expect(prioridadeEfetiva({ tipo: "despesa", prioridade: null, categoria: cat(null, null) })).toBe("p3");
    expect(prioridadeEfetiva({ tipo: "receita", prioridade: "p1", categoria: cat("p1", null) })).toBeNull();
  });

  it("motivos de não programável", () => {
    const ev = paraEventos(
      [
        lanc({ id: "previsao", tipo: "receita", status: "previsao" }),
        lanc({ id: "art", tipo: "despesa", status: "previsto", ehTaxaArt: true }),
        lanc({ id: "aguardando", tipo: "despesa", status: "aguardando_aprovacao" }),
        lanc({ id: "p1", tipo: "despesa", status: "previsto", prioridade: "p1" }),
        lanc({ id: "livre", tipo: "despesa", status: "previsto", prioridade: "p3" }),
      ],
      opcoes,
    );
    const m = Object.fromEntries(ev.map((e) => [e.id, e.naoProgramavel]));
    expect(m).toEqual({ previsao: MOTIVO_PREVISAO, art: MOTIVO_ART, aguardando: MOTIVO_APROVACAO, p1: MOTIVO_P1, livre: null });
  });

  it("vencido, transferência e caixinha só em despesa", () => {
    const [venc, transf, rec] = paraEventos(
      [
        lanc({ id: "venc", tipo: "despesa", status: "previsto", vencimento: dia(-2), caixinhaId: "k" }),
        lanc({
          id: "transf",
          tipo: "despesa",
          status: "previsto",
          categoria: { natureza: "transferencia", prioridadePadrao: null, prioridadePadraoPai: null },
          transferencia: { id: "t1", contrapartes: [] },
        }),
        lanc({ id: "rec", tipo: "receita", status: "previsto", caixinhaId: "k" }),
      ],
      opcoes,
    );
    expect(venc).toMatchObject({ vencido: true, caixinhaId: "k", transferencia: null });
    expect(transf).toMatchObject({ natureza: "transferencia", transferencia: { id: "t1", contrapartes: [] } });
    expect(rec.caixinhaId).toBeNull();
  });
});
