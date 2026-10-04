import { describe, expect, it } from "vitest";
import { AnalisadorIfc, analisarFonte, fonteDeTexto } from "./analise";
import { ifcDeTeste } from "./fixture-ifc";
import { LeitorStep } from "./step";

describe("analisarFonte", () => {
  it("lê schema, projeto, contextos, unidade, maior id e GlobalIds", async () => {
    const a = await analisarFonte(fonteDeTexto(ifcDeTeste(), 13));
    expect(a.schema).toBe("IFC4");
    expect(a.viewDefinition).toBe("ViewDefinition [CoordinationView]");
    expect(a.projetoId).toBe(1);
    expect(a.projetos).toBe(1);
    expect(a.contextosRaiz).toEqual([11]);
    expect(a.unidade).toBe("MILLI METRE");
    expect(a.maiorId).toBe(40);
    // GlobalIds de tudo que é IfcRoot, menos o do projeto (o projeto secundário some na junção).
    expect(a.guids).toHaveLength(8);
    expect(a.guids).not.toContain("0A1".padEnd(22, "A"));
  });

  it("metro sem prefixo", async () => {
    expect((await analisarFonte(fonteDeTexto(ifcDeTeste({ unidade: "METRE" })))).unidade).toBe("METRE");
  });

  it("pés: vale a unidade do projeto, não o IfcSIUnit de comprimento solto no arquivo", async () => {
    expect((await analisarFonte(fonteDeTexto(ifcDeTeste({ unidade: "FOOT" })))).unidade).toBe("FOOT");
  });

  it("schema declarado no cabeçalho, como veio", async () => {
    expect((await analisarFonte(fonteDeTexto(ifcDeTeste({ schema: "IFC2X3" })))).schema).toBe("IFC2X3");
  });

  it("projeto sem UnitsInContext: unidade null (não declarada)", async () => {
    const texto = ifcDeTeste().replace("(#11),#7);", "(#11),$);");
    expect((await analisarFonte(fonteDeTexto(texto))).unidade).toBeNull();
  });

  it("atribuição cita unidade que nunca aparece: unidade undefined (não lida)", async () => {
    const texto = ifcDeTeste().replace("IFCUNITASSIGNMENT((#13,#2,#3))", "IFCUNITASSIGNMENT((#13,#98,#2,#3))");
    expect((await analisarFonte(fonteDeTexto(texto))).unidade).toBeUndefined();
  });

  it("nome de parâmetro com 22 caracteres não é GlobalId (1º caractere só 0–3)", async () => {
    const texto = ifcDeTeste().replace(
      "ENDSEC;\nEND-ISO",
      "#41=IFCPROPERTYSINGLEVALUE('NomeDeParametro22Chars',$,IFCLABEL('x'),$);\nENDSEC;\nEND-ISO",
    );
    const a = await analisarFonte(fonteDeTexto(texto));
    expect(a.maiorId).toBe(41);
    expect(a.guids).not.toContain("NomeDeParametro22Chars");
    expect(a.guids).toHaveLength(8);
  });
});

describe("AnalisadorIfc.unidadeResolvida", () => {
  it("só fica verdadeiro depois de projeto, atribuição e unidade de comprimento", () => {
    const an = new AnalisadorIfc();
    const leitor = new LeitorStep();
    const instrucoes = leitor.alimentar(ifcDeTeste());
    let resolvidaEm = -1;
    instrucoes.forEach((instr, i) => {
      an.instrucao(instr);
      if (resolvidaEm < 0 && an.unidadeResolvida()) resolvidaEm = i;
    });
    // #7 (IFCUNITASSIGNMENT) é a última peça a chegar na fixture (a moeda #13 vem antes dela).
    expect(instrucoes[resolvidaEm]).toMatch(/^#7=IFCUNITASSIGNMENT/);
  });
});
