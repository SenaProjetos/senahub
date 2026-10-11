import { describe, expect, it } from "vitest";
import { linhasDaPessoa, mesTerminou, tabelaValidaVigente } from "./distribuicao";
import { custoDoMes } from "./encargos";
import { motivoParaNaoCriarVersao } from "@/modules/rh/tabela-encargos/regras";

const soma = (l: { custoCent: number }[]) => l.reduce((s, x) => s + x.custoCent, 0);

describe("linhasDaPessoa — o custo do mês nunca some nem duplica", () => {
  it("CLT: projeto, reunião com projeto e sem projeto somam o custo inteiro", () => {
    const linhas = linhasDaPessoa({
      contratacao: "clt",
      totalCent: 600000,
      jornadaReferenciaMin: 9600,
      mesEncerrado: true,
      sessoes: [
        { projetoId: "A", tipoAlocacao: "projeto", minutos: 3600 },
        { projetoId: "B", tipoAlocacao: "reuniao_interna", minutos: 1200 },
        { projetoId: null, tipoAlocacao: "sem_projeto", minutos: 1200 },
      ],
    });
    expect(linhas).toEqual([
      { projetoId: "A", natureza: "projeto", minutos: 3600, custoCent: 360000 },
      { projetoId: "B", natureza: "reuniao", minutos: 1200, custoCent: 120000 },
      { projetoId: null, natureza: "nao_alocado", minutos: 1200, custoCent: 120000 },
    ]);
    expect(soma(linhas)).toBe(600000);
  });

  it("sócio que apontou metade da jornada: a outra metade vai para não alocado, sem minutos", () => {
    const linhas = linhasDaPessoa({
      contratacao: "pro_labore",
      totalCent: 1000000,
      jornadaReferenciaMin: 9600,
      mesEncerrado: true,
      sessoes: [{ projetoId: "A", tipoAlocacao: "projeto", minutos: 4800 }],
    });
    expect(linhas).toEqual([
      { projetoId: "A", natureza: "projeto", minutos: 4800, custoCent: 500000 },
      { projetoId: null, natureza: "nao_alocado", minutos: 0, custoCent: 500000 },
    ]);
  });

  it("CLT sem sessão nenhuma: uma linha de não alocado com o custo todo", () => {
    expect(linhasDaPessoa({ contratacao: "clt", totalCent: 300000, jornadaReferenciaMin: 9600, mesEncerrado: true, sessoes: [] }))
      .toEqual([{ projetoId: null, natureza: "nao_alocado", minutos: 0, custoCent: 300000 }]);
  });

  it("sessões do mesmo projeto se juntam numa linha", () => {
    const linhas = linhasDaPessoa({
      contratacao: "clt",
      totalCent: 1000,
      jornadaReferenciaMin: 0,
      mesEncerrado: true,
      sessoes: [
        { projetoId: "A", tipoAlocacao: "projeto", minutos: 60 },
        { projetoId: "A", tipoAlocacao: "projeto", minutos: 60 },
      ],
    });
    expect(linhas).toEqual([{ projetoId: "A", natureza: "projeto", minutos: 120, custoCent: 1000 }]);
  });

  it("PJ: horas sem custo, nenhuma linha de não alocado vazia", () => {
    expect(linhasDaPessoa({ contratacao: "pj", totalCent: 0, jornadaReferenciaMin: 9600, mesEncerrado: true, sessoes: [{ projetoId: "A", tipoAlocacao: "projeto", minutos: 60 }] }))
      .toEqual([{ projetoId: "A", natureza: "projeto", minutos: 60, custoCent: 0 }]);
  });
});

describe("mesTerminou", () => {
  it("o mês só termina na virada em São Paulo", () => {
    expect(mesTerminou(2026, 10, new Date("2026-10-31T23:59:00-03:00"))).toBe(false);
    expect(mesTerminou(2026, 10, new Date("2026-11-01T00:00:00-03:00"))).toBe(true);
    expect(mesTerminou(2026, 12, new Date("2026-12-15T12:00:00-03:00"))).toBe(false);
  });
});

describe("tabelaValidaVigente", () => {
  const valida = { tipo: "pro_labore", inssEmpresaBp: 0 };
  it("versão mais recente inválida não derruba o cálculo: usa a anterior válida", () => {
    const r = tabelaValidaVigente([{ vigenciaEm: "2026-01-01", parametros: valida }, { vigenciaEm: "2026-10-01", parametros: {} }], "2026-10-01");
    expect(r?.parametros).toEqual(valida);
    expect(r?.posterior).toBe(false);
  });
  it("nenhuma versão válida", () => {
    expect(tabelaValidaVigente([{ vigenciaEm: "2026-10-01", parametros: { tipo: "x" } }], "2026-10-01")).toBeNull();
  });
});

describe("motivoParaNaoCriarVersao", () => {
  const MSG = "O mês 10/2026 já foi fechado. A versão nova precisa começar depois do último mês fechado.";
  it("vigência no mês fechado ou antes dele é recusada", () => {
    expect(motivoParaNaoCriarVersao({ vigencia: "2026-10", mesesFechadosV2: ["2026-10"] })).toBe(MSG);
    expect(motivoParaNaoCriarVersao({ vigencia: "2026-09", mesesFechadosV2: ["2026-10"] })).toBe(MSG);
  });
  it("vigência depois do último fechado passa", () => {
    expect(motivoParaNaoCriarVersao({ vigencia: "2026-11", mesesFechadosV2: ["2026-10"] })).toBeNull();
    expect(motivoParaNaoCriarVersao({ vigencia: "2027-01", mesesFechadosV2: [] })).toBeNull();
  });
});

describe("custoDoMes — combinações que faltavam", () => {
  const CLT = { tipo: "clt" as const, fgtsBp: 800, multaFgtsBp: 4000, inssEmpresaBp: 0, reservaDecimoTerceiro: false, reservaFerias: false, reservaAvisoPrevio: false, beneficios: [] };
  const entrada = { anosCompletos: 0, fracaoForaDeFerias: 1, viaAgenteIntegracao: false };
  it("CLT sem reservas: só FGTS e multa", () => {
    const c = custoDoMes({ baseCent: 400000, parametros: CLT, ...entrada });
    expect(c.itens.map((i) => i.chave)).toEqual(["fgts", "multa_fgts"]);
    expect(c.totalCent).toBe(400000 + 32000 + 12800);
  });
  it("multa zero e base zero não geram item", () => {
    expect(custoDoMes({ baseCent: 400000, parametros: { ...CLT, multaFgtsBp: 0 }, ...entrada }).itens.map((i) => i.chave)).toEqual(["fgts"]);
    expect(custoDoMes({ baseCent: 0, parametros: CLT, ...entrada }).totalCent).toBe(0);
  });
  it("estágio sem recesso e pró-labore no Anexo IV", () => {
    expect(custoDoMes({ baseCent: 150000, parametros: { tipo: "estagio", reservaRecesso: false, taxaAgenteCent: 8500 }, ...entrada, viaAgenteIntegracao: true }).totalCent).toBe(158500);
    expect(custoDoMes({ baseCent: 1000000, parametros: { tipo: "pro_labore", inssEmpresaBp: 2000 }, ...entrada }).totalCent).toBe(1200000);
  });
  it("frações fora de 0–1 são limitadas", () => {
    const p = { ...CLT, beneficios: [{ nome: "VT", valorCent: 20000, suspensoNasFerias: true }] };
    expect(custoDoMes({ baseCent: 0, parametros: p, ...entrada, fracaoForaDeFerias: 1.5 }).totalCent).toBe(20000);
    expect(custoDoMes({ baseCent: 0, parametros: p, ...entrada, fracaoForaDeFerias: -1 }).totalCent).toBe(0);
  });
});
