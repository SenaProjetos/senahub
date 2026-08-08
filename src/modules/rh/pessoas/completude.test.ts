import { describe, expect, it } from "vitest";
import { camposFaltantes, cadastroIncompleto, type EntradaCompletude } from "./completude";

const BASE: EntradaCompletude = {
  role: "clt",
  contratacao: "clt",
  nomeCompleto: "Ana Silva Souza",
  cpf: "52998224725",
  rg: "MG-12.345.678",
  dataNascimento: "1990-01-01",
  enderecoCep: "30130-000",
  enderecoLogradouro: "Rua A",
  enderecoNumero: "100",
  enderecoBairro: "Centro",
  enderecoCidade: "Belo Horizonte",
  enderecoUf: "MG",
  telefone: "31999998888",
  dataAdmissao: "2024-01-01",
  cargoId: "cargo1",
  departamentoId: "depto1",
  temSalario: true,
  pjId: null,
  contasBancariasAtivas: 1,
  avaliarFolha: true,
};

describe("camposFaltantes — CLT/estágio", () => {
  it("cadastro completo não falta nada", () => {
    expect(camposFaltantes(BASE)).toEqual([]);
    expect(cadastroIncompleto(BASE)).toBe(false);
  });

  it("aponta CADA campo obrigatório vazio, um por um", () => {
    const casos: [Partial<EntradaCompletude>, string][] = [
      [{ nomeCompleto: null }, "nomeCompleto"],
      [{ cpf: "" }, "cpf"],
      [{ rg: null }, "rg"],
      [{ dataNascimento: null }, "dataNascimento"],
      [{ telefone: "  " }, "telefone"],
      [{ dataAdmissao: null }, "dataAdmissao"],
      [{ cargoId: null }, "cargoId"],
      [{ departamentoId: null }, "departamentoId"],
      [{ temSalario: false }, "salario"],
      [{ contasBancariasAtivas: 0 }, "contaBancaria"],
    ];
    for (const [patch, campo] of casos) {
      const r = camposFaltantes({ ...BASE, ...patch });
      expect(r.map((x) => x.campo), JSON.stringify(patch)).toContain(campo);
    }
  });

  it("estágio usa a mesma regra de CLT", () => {
    expect(camposFaltantes({ ...BASE, role: "estagiario", contratacao: "estagio" })).toEqual([]);
  });

  it("endereço parcial conta como 'endereco' faltando, não um item por sub-campo", () => {
    const r = camposFaltantes({ ...BASE, enderecoUf: null });
    const enderecos = r.filter((x) => x.campo === "endereco");
    expect(enderecos).toHaveLength(1);
  });
});

describe("camposFaltantes — PJ", () => {
  const PJ: EntradaCompletude = {
    ...BASE,
    role: "projetista_pj",
    contratacao: "pj",
    rg: null,
    dataNascimento: null,
    dataAdmissao: null,
    temSalario: false,
    pjId: "pj1",
  };

  it("completo não exige RG, nascimento, admissão nem salário", () => {
    expect(camposFaltantes(PJ)).toEqual([]);
  });

  it("exige PJ vinculada", () => {
    const r = camposFaltantes({ ...PJ, pjId: null });
    expect(r.map((x) => x.campo)).toContain("pjId");
  });

  it("exige departamento? NÃO — fora do bucket PJ", () => {
    const r = camposFaltantes({ ...PJ, departamentoId: null });
    expect(r.map((x) => x.campo)).not.toContain("departamentoId");
  });

  it("freelancer usa a mesma regra de PJ quando contratacao=pj", () => {
    expect(camposFaltantes({ ...PJ, role: "freelancer" })).toEqual([]);
  });
});

describe("camposFaltantes — autônomo RPA", () => {
  const RPA: EntradaCompletude = {
    ...BASE,
    role: "freelancer",
    contratacao: "autonomo_rpa",
    rg: null,
    dataNascimento: null,
    dataAdmissao: null,
    temSalario: false,
    pjId: null,
  };

  it("NÃO exige PJ vinculada (pessoa física, sem CNPJ)", () => {
    expect(camposFaltantes(RPA)).toEqual([]);
  });
});

describe("camposFaltantes — pró-labore (sócio)", () => {
  const SOCIO: EntradaCompletude = {
    ...BASE,
    role: "supervisor",
    contratacao: "pro_labore",
    rg: null,
    dataNascimento: null,
    dataAdmissao: null,
    temSalario: false,
    pjId: null,
  };

  it("completo sem admissão/salário/PJ", () => {
    expect(camposFaltantes(SOCIO)).toEqual([]);
  });

  it("ainda exige cargo, telefone, endereço e conta", () => {
    const r = camposFaltantes({ ...SOCIO, cargoId: null, telefone: null, contasBancariasAtivas: 0 });
    expect(r.map((x) => x.campo).sort()).toEqual(["cargoId", "contaBancaria", "telefone"]);
  });
});

describe("camposFaltantes — viewer sem rh:folha (avaliarFolha=false)", () => {
  it("CLT: salário e conta bancária somem da lista, mesmo vazios", () => {
    const r = camposFaltantes({ ...BASE, temSalario: false, contasBancariasAtivas: 0, avaliarFolha: false });
    expect(r).toEqual([]);
  });

  it("CLT: campos não-financeiros continuam sendo cobrados normalmente", () => {
    const r = camposFaltantes({ ...BASE, rg: null, avaliarFolha: false });
    expect(r.map((x) => x.campo)).toEqual(["rg"]);
  });

  it("PJ: conta bancária some da lista", () => {
    const PJ: EntradaCompletude = {
      ...BASE, role: "projetista_pj", contratacao: "pj", rg: null, dataNascimento: null,
      dataAdmissao: null, temSalario: false, pjId: "pj1", contasBancariasAtivas: 0, avaliarFolha: false,
    };
    expect(camposFaltantes(PJ)).toEqual([]);
  });

  it("com rh:folha (avaliarFolha=true) os mesmos dados vazios SÃO cobrados", () => {
    const r = camposFaltantes({ ...BASE, temSalario: false, contasBancariasAtivas: 0, avaliarFolha: true });
    expect(r.map((x) => x.campo).sort()).toEqual(["contaBancaria", "salario"]);
  });
});

describe("camposFaltantes — fallback por role quando contratação ainda não migrou", () => {
  it("clt sem Vinculo (contratacao null) cai na regra de CLT via derivarEixos", () => {
    const r = camposFaltantes({ ...BASE, contratacao: null, dataAdmissao: null });
    expect(r.map((x) => x.campo)).toContain("dataAdmissao");
  });

  it("projetista_pj sem Vinculo cai na regra de PJ (derivarEixos mapeia pj)", () => {
    const r = camposFaltantes({
      ...BASE, role: "projetista_pj", contratacao: null, rg: null, dataNascimento: null,
      dataAdmissao: null, temSalario: false, pjId: null,
    });
    expect(r.map((x) => x.campo)).toContain("pjId");
    expect(r.map((x) => x.campo)).not.toContain("dataAdmissao");
  });
});

describe("camposFaltantes — sem contratação mapeável", () => {
  it("admin sem vínculo só exige o mínimo universal (nome + CPF)", () => {
    const admin: EntradaCompletude = {
      ...BASE, role: "admin", contratacao: null, rg: null, dataNascimento: null,
      enderecoCep: null, enderecoLogradouro: null, enderecoNumero: null, enderecoBairro: null,
      enderecoCidade: null, enderecoUf: null, telefone: null, dataAdmissao: null,
      cargoId: null, departamentoId: null, temSalario: false, contasBancariasAtivas: 0,
    };
    expect(camposFaltantes(admin)).toEqual([]);
  });

  it("mas nome ou CPF vazio ainda acusa, mesmo sem contratação", () => {
    const admin: EntradaCompletude = {
      ...BASE, role: "admin", contratacao: null, nomeCompleto: null, cpf: null,
    };
    const r = camposFaltantes(admin);
    expect(r.map((x) => x.campo).sort()).toEqual(["cpf", "nomeCompleto"]);
  });
});

describe("camposFaltantes — papéis fora de CADASTRO_ROLES", () => {
  it("cliente nunca é incompleto, mesmo com tudo vazio", () => {
    const cliente: EntradaCompletude = { ...BASE, role: "cliente", contratacao: null, cpf: null, nomeCompleto: null };
    expect(camposFaltantes(cliente)).toEqual([]);
    expect(cadastroIncompleto(cliente)).toBe(false);
  });

  it("ti nunca é incompleto", () => {
    const ti: EntradaCompletude = { ...BASE, role: "ti", contratacao: null, cpf: null };
    expect(camposFaltantes(ti)).toEqual([]);
  });
});
