import { describe, expect, it } from "vitest";
import { avisoPrevioMensalCent, custoDoMes } from "./encargos";
import { parametrosEncargosSchema, resumoParametros, type ParametrosClt } from "./parametros";

const CLT: ParametrosClt = {
  tipo: "clt",
  fgtsBp: 800,
  multaFgtsBp: 4000,
  inssEmpresaBp: 0,
  reservaDecimoTerceiro: true,
  reservaFerias: true,
  reservaAvisoPrevio: true,
  beneficios: [
    { nome: "Vale-transporte", valorCent: 20000, suspensoNasFerias: true },
    { nome: "Vale-refeição", valorCent: 55000, suspensoNasFerias: true },
  ],
};

const cent = (c: ReturnType<typeof custoDoMes>, chave: string) => c.itens.find((i) => i.chave === chave)?.cent ?? 0;

describe("custoDoMes — CLT", () => {
  it("salário de R$ 4.000 no 1º ano: tabela da decisão 4 + aviso + benefícios", () => {
    const c = custoDoMes({ baseCent: 400000, parametros: CLT, anosCompletos: 0, fracaoForaDeFerias: 1, viaAgenteIntegracao: false });
    expect(cent(c, "fgts")).toBe(32000);
    expect(cent(c, "decimo_terceiro")).toBe(33333);
    expect(cent(c, "ferias")).toBe(44444);
    expect(cent(c, "fgts_provisoes")).toBe(6222);
    expect(cent(c, "multa_fgts")).toBe(15289);
    expect(cent(c, "aviso_previo")).toBe(33333);
    expect(cent(c, "beneficio_0")).toBe(20000);
    expect(cent(c, "beneficio_1")).toBe(55000);
    expect(c.totalCent).toBe(639621);
  });

  it("encargos sem aviso e benefícios somam 32,82% do salário", () => {
    const c = custoDoMes({ baseCent: 400000, parametros: CLT, anosCompletos: 0, fracaoForaDeFerias: 1, viaAgenteIntegracao: false });
    const soma = ["fgts", "decimo_terceiro", "ferias", "fgts_provisoes", "multa_fgts"].reduce((s, k) => s + cent(c, k), 0);
    expect(soma).toBe(131288);
  });

  it("benefício suspenso nas férias entra proporcional", () => {
    const c = custoDoMes({ baseCent: 400000, parametros: CLT, anosCompletos: 0, fracaoForaDeFerias: 0.5, viaAgenteIntegracao: false });
    expect(cent(c, "beneficio_0")).toBe(10000);
    expect(cent(c, "beneficio_1")).toBe(27500);
  });

  it("INSS da empresa só aparece quando a tabela tem alíquota (Anexo IV)", () => {
    const c = custoDoMes({ baseCent: 400000, parametros: { ...CLT, inssEmpresaBp: 2000 }, anosCompletos: 0, fracaoForaDeFerias: 1, viaAgenteIntegracao: false });
    // 20% sobre salário + 13º + férias = 0,2 × (400000 + 33333 + 44444)
    expect(cent(c, "inss_empresa")).toBe(95555);
  });

  it("item com valor zero não aparece na lista", () => {
    const c = custoDoMes({ baseCent: 400000, parametros: CLT, anosCompletos: 0, fracaoForaDeFerias: 1, viaAgenteIntegracao: false });
    expect(c.itens.some((i) => i.chave === "inss_empresa")).toBe(false);
  });
});

describe("avisoPrevioMensalCent", () => {
  it("1º ano: 1/12 do salário", () => expect(avisoPrevioMensalCent(400000, 0)).toBe(33333));
  it("depois do 1º ano: só o acréscimo de 3 dias por ano (1/120)", () => expect(avisoPrevioMensalCent(400000, 3)).toBe(3333));
  it("ainda acumula enquanto 30 + 3 × anos ≤ 90", () => expect(avisoPrevioMensalCent(400000, 20)).toBe(3333));
  it("para quando passaria de 90 dias", () => expect(avisoPrevioMensalCent(400000, 21)).toBe(0));
});

describe("custoDoMes — estágio e pró-labore", () => {
  const EST = { tipo: "estagio" as const, reservaRecesso: true, taxaAgenteCent: 8500 };

  it("estagiário pelo agente: bolsa + recesso 1/12 + taxa", () => {
    const c = custoDoMes({ baseCent: 150000, parametros: EST, anosCompletos: 0, fracaoForaDeFerias: 1, viaAgenteIntegracao: true });
    expect(cent(c, "recesso")).toBe(12500);
    expect(cent(c, "taxa_agente")).toBe(8500);
    expect(c.totalCent).toBe(171000);
  });

  it("estagiário contratado direto não tem taxa", () => {
    const c = custoDoMes({ baseCent: 150000, parametros: EST, anosCompletos: 0, fracaoForaDeFerias: 1, viaAgenteIntegracao: false });
    expect(c.totalCent).toBe(162500);
  });

  it("pró-labore: só o bruto quando o INSS da empresa está no DAS", () => {
    const c = custoDoMes({ baseCent: 1000000, parametros: { tipo: "pro_labore", inssEmpresaBp: 0 }, anosCompletos: 0, fracaoForaDeFerias: 1, viaAgenteIntegracao: false });
    expect(c.totalCent).toBe(1000000);
    expect(c.itens).toHaveLength(0);
  });
});

describe("parametrosEncargosSchema", () => {
  it("aceita a tabela CLT e recusa percentual fora de 0–100%", () => {
    expect(parametrosEncargosSchema.safeParse(CLT).success).toBe(true);
    expect(parametrosEncargosSchema.safeParse({ ...CLT, fgtsBp: 10001 }).success).toBe(false);
  });

  it("resumo legível para a tela", () => {
    expect(resumoParametros(CLT)).toBe("FGTS 8% · multa 40% · INSS empresa 0% · 13º, férias e aviso prévio · Vale-transporte R$ 200,00 · Vale-refeição R$ 550,00");
    expect(resumoParametros({ tipo: "estagio", reservaRecesso: true, taxaAgenteCent: 8500 })).toBe("Recesso · taxa do agente R$ 85,00");
    expect(resumoParametros({ tipo: "pro_labore", inssEmpresaBp: 0 })).toBe("INSS empresa 0%");
  });
});

describe("custoDoMes — reservas pelo salário contratual (revisão final)", () => {
  it("mês inteiro de férias: sem salário, sem benefício, reservas continuam", () => {
    const c = custoDoMes({ baseCent: 0, salarioReservasCent: 400000, parametros: CLT, anosCompletos: 0, fracaoForaDeFerias: 0, viaAgenteIntegracao: false });
    expect(cent(c, "fgts")).toBe(0);
    expect(cent(c, "decimo_terceiro")).toBe(33333);
    expect(cent(c, "ferias")).toBe(44444);
    expect(cent(c, "fgts_provisoes")).toBe(6222);
    expect(cent(c, "multa_fgts")).toBe(2489);
    expect(cent(c, "aviso_previo")).toBe(33333);
    expect(c.totalCent).toBe(119821);
  });

  it("admitido no meio do mês: benefício não suspenso nas férias entra pela fração do vínculo", () => {
    const p: ParametrosClt = { ...CLT, beneficios: [{ nome: "Plano", valorCent: 30000, suspensoNasFerias: false }] };
    const c = custoDoMes({ baseCent: 200000, salarioReservasCent: 200000, parametros: p, anosCompletos: 0, fracaoForaDeFerias: 0.5, fracaoVinculo: 0.5, viaAgenteIntegracao: false });
    expect(cent(c, "beneficio_0")).toBe(15000);
  });
});

describe("parametrosEncargosSchema — mensagens em português (revisão final)", () => {
  const msg = (v: unknown) => {
    const r = parametrosEncargosSchema.safeParse(v);
    return r.success ? null : r.error.issues[0]?.message;
  };
  it("percentual fora de 0–100%", () => expect(msg({ ...CLT, fgtsBp: 10001 })).toBe("Percentual entre 0 e 100%."));
  it("valor negativo ou com fração de centavo", () => {
    expect(msg({ ...CLT, beneficios: [{ nome: "VT", valorCent: -1, suspensoNasFerias: true }] })).toBe("Valor em reais, de zero para cima.");
    expect(msg({ ...CLT, beneficios: [{ nome: "VT", valorCent: 1.5, suspensoNasFerias: true }] })).toBe("Valor em reais, de zero para cima.");
  });
  it("valor alto demais", () => expect(msg({ tipo: "estagio", reservaRecesso: true, taxaAgenteCent: 1e15 })).toBe("Valor alto demais para um encargo mensal."));
  it("nome do benefício vazio ou longo", () => {
    expect(msg({ ...CLT, beneficios: [{ nome: "  ", valorCent: 100, suspensoNasFerias: true }] })).toBe("Dê um nome ao benefício.");
    expect(msg({ ...CLT, beneficios: [{ nome: "x".repeat(61), valorCent: 100, suspensoNasFerias: true }] })).toBe("Nome do benefício com até 60 caracteres.");
  });
});
