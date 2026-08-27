import { describe, expect, it } from "vitest";
import {
  decidirPrazoDoProjeto,
  devePassarParaAssinado,
  ehDocumentoContratual,
  pendenteDeAssinatura,
  vencimentoEfetivo,
} from "./estado";

describe("ehDocumentoContratual", () => {
  it("contrato e aditivo entram no ciclo", () => {
    expect(ehDocumentoContratual("contrato")).toBe(true);
    expect(ehDocumentoContratual("aditivo")).toBe(true);
  });

  it("procuração, proposta e outro ficam de fora — são arquivo, não compromisso com prazo", () => {
    expect(ehDocumentoContratual("procuracao")).toBe(false);
    expect(ehDocumentoContratual("proposta")).toBe(false);
    expect(ehDocumentoContratual("outro")).toBe(false);
  });
});

describe("pendenteDeAssinatura", () => {
  it("rascunho e aguardando contam como pendente", () => {
    expect(pendenteDeAssinatura("rascunho")).toBe(true);
    expect(pendenteDeAssinatura("aguardando_assinatura")).toBe(true);
  });

  it("assinado, vencido, rescindido e nulo não contam", () => {
    expect(pendenteDeAssinatura("assinado")).toBe(false);
    expect(pendenteDeAssinatura("vencido")).toBe(false);
    expect(pendenteDeAssinatura("rescindido")).toBe(false);
    // Documento anterior a esta feature: sem status, não pode acender alarme nenhum.
    expect(pendenteDeAssinatura(null)).toBe(false);
  });
});

describe("devePassarParaAssinado", () => {
  it("aditivo em rascunho vira assinado — era o caso que a regra antiga ignorava", () => {
    expect(devePassarParaAssinado("aditivo", "rascunho")).toBe(true);
  });

  it("não ressuscita contrato rescindido nem vencido", () => {
    expect(devePassarParaAssinado("contrato", "rescindido")).toBe(false);
    expect(devePassarParaAssinado("contrato", "vencido")).toBe(false);
  });

  it("assinar de novo o que já está assinado não é transição", () => {
    // É o que impede o efeito no RH de ser aplicado duas vezes quando há 2 signatários.
    expect(devePassarParaAssinado("contrato", "assinado")).toBe(false);
  });

  it("procuração nunca transiciona", () => {
    expect(devePassarParaAssinado("procuracao", "rascunho")).toBe(false);
  });
});

describe("decidirPrazoDoProjeto", () => {
  const prazo = new Date("2027-06-30T00:00:00.000Z");

  it("define quando o projeto ainda não tem prazo e nada conflita", () => {
    expect(decidirPrazoDoProjeto(prazo, null, [])).toEqual({ define: true });
  });

  it("NÃO sobrescreve prazo que alguém já definiu à mão", () => {
    expect(decidirPrazoDoProjeto(prazo, new Date("2027-01-01"), [])).toEqual({
      define: false,
      motivo: "projeto_ja_tem_prazo",
    });
  });

  it("NÃO define prazo anterior a disciplina já agendada", () => {
    // `projetos/actions.ts` recusa disciplina além do prazo do projeto; escrever por aqui criaria
    // justamente o estado que aquela validação impede, por um caminho que não a atravessa.
    expect(decidirPrazoDoProjeto(prazo, null, [new Date("2027-12-01")])).toEqual({
      define: false,
      motivo: "disciplina_ultrapassa",
    });
  });

  it("disciplina dentro do prazo não impede", () => {
    expect(decidirPrazoDoProjeto(prazo, null, [new Date("2027-05-01"), null])).toEqual({ define: true });
  });

  it("disciplina exatamente no prazo não impede", () => {
    expect(decidirPrazoDoProjeto(prazo, null, [new Date("2027-06-30T00:00:00.000Z")])).toEqual({ define: true });
  });

  it("contrato sem vencimento não define nada", () => {
    expect(decidirPrazoDoProjeto(null, null, [])).toEqual({ define: false, motivo: "sem_prazo_no_contrato" });
  });
});

describe("vencimentoEfetivo", () => {
  const base = new Date("2027-01-31T00:00:00.000Z");
  const prorrogado = new Date("2028-01-31T00:00:00.000Z");

  it("sem aditivo, vale o vencimento do próprio contrato", () => {
    expect(vencimentoEfetivo(base, [])).toEqual(base);
  });

  it("aditivo assinado que prorroga manda no prazo", () => {
    expect(
      vencimentoEfetivo(base, [{ vigenciaNova: prorrogado, assinadoEm: new Date("2026-12-01") }]),
    ).toEqual(prorrogado);
  });

  it("aditivo NÃO assinado não prorroga nada", () => {
    expect(vencimentoEfetivo(base, [{ vigenciaNova: prorrogado, assinadoEm: null }])).toEqual(base);
  });

  it("com vários, vale o assinado mais recente — não o de data maior", () => {
    // Uma prorrogação pode ser REVISTA por um aditivo posterior que encurta o prazo. Ordenar por
    // vigência escolheria a data mais longe; o que vale é o último acordo assinado.
    const encurtado = new Date("2027-06-30T00:00:00.000Z");
    expect(
      vencimentoEfetivo(base, [
        { vigenciaNova: prorrogado, assinadoEm: new Date("2026-12-01") },
        { vigenciaNova: encurtado, assinadoEm: new Date("2027-02-01") },
      ]),
    ).toEqual(encurtado);
  });

  it("aditivo que não mexe em prazo é ignorado", () => {
    expect(
      vencimentoEfetivo(base, [{ vigenciaNova: null, assinadoEm: new Date("2026-12-01") }]),
    ).toEqual(base);
  });

  it("contrato sem vencimento e sem aditivo continua sem vencimento", () => {
    expect(vencimentoEfetivo(null, [])).toBeNull();
  });
});
