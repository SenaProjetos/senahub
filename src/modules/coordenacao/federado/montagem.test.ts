import { describe, expect, it } from "vitest";
import { analisarFonte, fonteDeTexto } from "./analise";
import { ifcDeTeste } from "./fixture-ifc";
import { avisoGuidsRepetidos, escreverFederado, planejarJuncao, type CabecalhoFederado } from "./montagem";
import { LeitorStep, idDaInstrucao, lerInstancia, palavraDaInstrucao, referencias } from "./step";

const CAB: CabecalhoFederado = {
  nomeArquivo: "26.001-FEDERADO-R00.ifc",
  autor: "Fulana Elétrica",
  quando: "2026-10-04T10:00:00",
  composicao: [
    { nome: "est.ifc", grupo: "Estrutural", revisao: "R02" },
    { nome: "ele.ifc", grupo: "Elétrica", revisao: "R00" },
  ],
};

async function juntar(textos: string[], tamanho = 17): Promise<string> {
  const fontes = textos.map((t) => fonteDeTexto(t, tamanho));
  const analises = [];
  for (const f of fontes) analises.push(await analisarFonte(f));
  let saida = "";
  for await (const pedaco of escreverFederado(fontes, analises, CAB)) saida += pedaco;
  return saida;
}

function instrucoes(texto: string): string[] {
  const l = new LeitorStep();
  return [...l.alimentar(texto), ...l.finalizar()];
}

describe("planejarJuncao", () => {
  it("desloca cada modelo pela soma dos maiores ids anteriores e junta os contextos no mestre", async () => {
    const a = await analisarFonte(fonteDeTexto(ifcDeTeste({ semente: "A" })));
    const b = await analisarFonte(fonteDeTexto(ifcDeTeste({ semente: "B" })));
    expect(planejarJuncao([a, b, a])).toEqual({ offsets: [0, 40, 80], projetoMestre: 1, contextosExtras: [51, 91] });
  });
});

describe("escreverFederado", () => {
  it("um só IfcProject, todas as paredes, nenhuma referência pendente", async () => {
    const texto = await juntar([ifcDeTeste({ semente: "A" }), ifcDeTeste({ semente: "B", dx: 5000 })]);
    const todas = instrucoes(texto);
    const instancias = todas.map(lerInstancia).filter((i) => i !== null);
    expect(instancias.filter((i) => i.tipo === "IFCPROJECT")).toHaveLength(1);
    expect(instancias.filter((i) => i.tipo === "IFCWALL")).toHaveLength(2);

    const definidos = new Set(todas.map(idDaInstrucao).filter((n) => n !== null));
    const pendentes = todas.flatMap((i) => referencias(i)).filter((r) => !definidos.has(r));
    expect(pendentes).toEqual([]);
    // os dois sites pendurados no mesmo projeto
    const aggProjeto = instancias.filter((i) => i.tipo === "IFCRELAGGREGATES" && /,\$,\$,\$,#1,/.test(i.args));
    expect(aggProjeto).toHaveLength(2);
  });

  it("o projeto mestre leva os contextos dos outros modelos", async () => {
    const texto = await juntar([ifcDeTeste({ semente: "A" }), ifcDeTeste({ semente: "B" })]);
    const projeto = instrucoes(texto).map(lerInstancia).find((i) => i?.tipo === "IFCPROJECT");
    expect(projeto?.args).toContain("(#11,#51)");
  });

  it("strings saem byte a byte, sem renumerar o #99 do nome", async () => {
    const texto = await juntar([ifcDeTeste({ semente: "A" }), ifcDeTeste({ semente: "B" })], 1);
    expect(texto.match(/'Parede ''A''; com #99 e \(parenteses\)'/g)).toHaveLength(2);
  });

  it("cabeçalho com schema do mestre, view definition e a composição em ASCII", async () => {
    const texto = await juntar([ifcDeTeste({ semente: "A" }), ifcDeTeste({ semente: "B" })]);
    const palavras = instrucoes(texto).map(palavraDaInstrucao);
    expect(palavras.slice(0, 7)).toEqual(["ISO-10303-21", "HEADER", "FILE_DESCRIPTION", "FILE_NAME", "FILE_SCHEMA", "ENDSEC", "DATA"]);
    expect(palavras.slice(-2)).toEqual(["ENDSEC", "END-ISO-10303-21"]);
    expect(texto).toContain("FILE_SCHEMA(('IFC4'))");
    expect(texto).toContain("'ViewDefinition [CoordinationView]'");
    expect(texto).toContain("'Modelo: ele.ifc (El\\X2\\00E9\\X0\\trica, R00)'");
    expect(/[^\x00-\x7F]/.test(texto)).toBe(false);
  });
});

describe("avisoGuidsRepetidos", () => {
  it("conta os GlobalIds que aparecem em mais de um modelo e diz em quais", async () => {
    const a = await analisarFonte(fonteDeTexto(ifcDeTeste({ semente: "A" })));
    const a2 = await analisarFonte(fonteDeTexto(ifcDeTeste({ semente: "A" })));
    const b = await analisarFonte(fonteDeTexto(ifcDeTeste({ semente: "B" })));
    expect(avisoGuidsRepetidos([a, b], ["Estrutural", "Elétrica"])).toBeNull();
    expect(avisoGuidsRepetidos([a, b, a2], ["Estrutural", "Elétrica", "Recebido do cliente"])).toBe(
      "8 elementos com GlobalId repetido entre Estrutural e Recebido do cliente. Visualizadores podem mostrar só um deles.",
    );
  });
});
