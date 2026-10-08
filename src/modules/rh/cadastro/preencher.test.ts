import { describe, expect, it } from "vitest";
import { ActionError } from "@/lib/action-error";
import {
  MOTIVO_NADA_A_PREENCHER,
  planoDePreenchimento,
  reconfirmacaoDevida,
  reconfirmacaoPendente,
  situacaoDoPreenchimento,
  temAlgoAPedir,
  textoDaFaixa,
} from "./preencher";

const HOJE = "2026-10-08";
const nada = new Set<string>();

describe("situacaoDoPreenchimento", () => {
  it("mostra só os campos vazios dos faltantes, sem os do RH", () => {
    const s = situacaoDoPreenchimento(
      [
        { campo: "cpf", label: "CPF" },
        { campo: "endereco", label: "Endereço completo" },
        { campo: "cargoId", label: "Cargo" },
      ],
      { cpf: null, enderecoCep: "50000-000", enderecoLogradouro: "", enderecoNumero: "10" },
      nada,
      false,
    );
    expect(s.aPreencher.map((c) => c.campo)).toEqual([
      "cpf",
      "enderecoLogradouro",
      "enderecoComplemento",
      "enderecoBairro",
      "enderecoCidade",
      "enderecoUf",
    ]);
    expect(s.soRh).toEqual(["Cargo"]);
    // complemento é opcional: não conta como pendente
    expect(s.pendenteDaPessoa).toBe(5);
  });

  it("campo esperando o RH sai do formulário e aparece como aguardando", () => {
    const s = situacaoDoPreenchimento([{ campo: "cpf", label: "CPF" }], { cpf: null }, new Set(["cpf"]), false);
    expect(s.aPreencher).toEqual([]);
    expect(s.aguardandoRh).toEqual(["CPF"]);
    expect(s.pendenteDaPessoa).toBe(0);
  });

  it("conta bancária: falta conta como pendência da pessoa; proposta pendente não", () => {
    const falta = situacaoDoPreenchimento([{ campo: "contaBancaria", label: "Conta bancária" }], {}, nada, false);
    expect(falta.contaBancaria).toBe("falta");
    expect(falta.pendenteDaPessoa).toBe(1);
    const aguardando = situacaoDoPreenchimento([{ campo: "contaBancaria", label: "Conta bancária" }], {}, nada, true);
    expect(aguardando.contaBancaria).toBe("aguardando");
    expect(temAlgoAPedir(aguardando)).toBe(false);
  });

  it("só o RH tem o que fazer: nada a pedir à pessoa", () => {
    const s = situacaoDoPreenchimento([{ campo: "salario", label: "Salário" }], {}, nada, false);
    expect(temAlgoAPedir(s)).toBe(false);
  });
});

describe("planoDePreenchimento", () => {
  it("vazio comum vale direto; CPF e RG vão para o RH", () => {
    const r = planoDePreenchimento(
      { telefone: "81 99999-8888", cpf: "529.982.247-25", rg: "1234567", enderecoUf: "pe" },
      { telefone: null, cpf: null, rg: null, enderecoUf: null },
      HOJE,
    );
    expect(r.aplicar).toEqual({ telefone: "(81) 99999-8888", enderecoUf: "PE" });
    expect(Object.keys(r.aprovar).sort()).toEqual(["cpf", "rg"]);
  });

  it("campo já preenchido é ignorado (alterar é outro fluxo) e campo fora da lista também", () => {
    const r = planoDePreenchimento({ telefone: "(81) 99999-8888", salario: "9000", nomeCompleto: "Ana Maria" }, { telefone: "(81) 3333-4444" }, HOJE);
    expect(r.aplicar).toEqual({ nomeCompleto: "Ana Maria" });
    expect(r.aprovar).toEqual({});
  });

  it("CPF inválido volta no campo", () => {
    try {
      planoDePreenchimento({ cpf: "111.111.111-11" }, {}, HOJE);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ActionError);
      expect(Object.keys((e as ActionError).campos ?? {})).toEqual(["cpf"]);
    }
  });

  it("data de nascimento no futuro ou mal formada é recusada", () => {
    expect(() => planoDePreenchimento({ dataNascimento: "2030-01-01" }, {}, HOJE)).toThrow("A data precisa estar entre 1900 e hoje.");
    expect(() => planoDePreenchimento({ dataNascimento: "01/02/1990" }, {}, HOJE)).toThrow("Data inválida.");
    expect(planoDePreenchimento({ dataNascimento: "1990-02-01" }, {}, HOJE).aplicar).toEqual({ dataNascimento: "1990-02-01" });
  });

  it("UF fora da lista é recusada", () => {
    expect(() => planoDePreenchimento({ enderecoUf: "XX" }, {}, HOJE)).toThrow("UF inválida.");
  });

  it("nada preenchido é recusado", () => {
    expect(() => planoDePreenchimento({ telefone: "  " }, {}, HOJE)).toThrow(MOTIVO_NADA_A_PREENCHER);
  });
});

describe("textoDaFaixa", () => {
  it("conta o que falta e mostra o prazo", () => {
    expect(textoDaFaixa(3, "2026-10-20", HOJE)).toEqual({
      texto: "O RH pediu para você completar seus dados: faltam 3 informações. Prazo: 20/10.",
      vencido: false,
    });
  });
  it("prazo passado vira destaque, sem bloquear", () => {
    expect(textoDaFaixa(1, "2026-10-01", HOJE)).toEqual({
      texto: "O RH pediu para você completar seus dados: falta 1 informação. O prazo já passou.",
      vencido: true,
    });
  });
  it("sem prazo", () => {
    expect(textoDaFaixa(2, null, HOJE).texto).toBe("O RH pediu para você completar seus dados: faltam 2 informações.");
  });
});

describe("reconfirmação anual", () => {
  it("pendente até confirmar DEPOIS do pedido", () => {
    expect(reconfirmacaoPendente("2026-10-01T10:00:00Z", null)).toBe(true);
    expect(reconfirmacaoPendente("2026-10-01T10:00:00Z", "2025-09-01T10:00:00Z")).toBe(true);
    expect(reconfirmacaoPendente("2026-10-01T10:00:00Z", "2026-10-02T09:00:00Z")).toBe(false);
  });
  it("devida 365 dias após a última confirmação; nunca confirmou não é automático", () => {
    const agora = new Date("2026-10-08T12:00:00Z");
    expect(reconfirmacaoDevida(null, agora)).toBe(false);
    expect(reconfirmacaoDevida("2025-10-07T12:00:00Z", agora)).toBe(true);
    expect(reconfirmacaoDevida("2026-01-01T12:00:00Z", agora)).toBe(false);
  });
});
