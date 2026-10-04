import { describe, expect, it } from "vitest";
import {
  LeitorStep, atributos, idDaInstrucao, lerInstancia, palavraDaInstrucao, referencias, textoStep, trocarReferencias,
} from "./step";

function lerEmPedacos(texto: string, tamanho: number): string[] {
  const leitor = new LeitorStep();
  const saida: string[] = [];
  for (let i = 0; i < texto.length; i += tamanho) saida.push(...leitor.alimentar(texto.slice(i, i + tamanho)));
  saida.push(...leitor.finalizar());
  return saida;
}

const ARQUIVO = [
  "ISO-10303-21;",
  "HEADER;",
  "FILE_SCHEMA(('IFC4'));",
  "ENDSEC;",
  "DATA;",
  "#1=IFCWALL('A1AAAAAAAAAAAAAAAAAAAA',$,'Parede ''A''; com #99 e /* nao e comentario */',$,$,#2,$,$,$);",
  "/* comentario com ; e #5 */",
  "#2=IFCLOCALPLACEMENT($,\n#3);",
  "ENDSEC;",
  "END-ISO-10303-21;",
].join("\n");

describe("LeitorStep", () => {
  it.each([1, 7, 64, 10_000])("acha as mesmas instruções com pedaços de %i caracteres", (tamanho) => {
    const instrucoes = lerEmPedacos(ARQUIVO, tamanho);
    // O comentário não tem ";" próprio: gruda na instrução seguinte (#2).
    expect(instrucoes.map(palavraDaInstrucao)).toEqual([
      "ISO-10303-21", "HEADER", "FILE_SCHEMA", "ENDSEC", "DATA", "#1", "#2", "ENDSEC", "END-ISO-10303-21",
    ]);
    expect(instrucoes[5]).toContain("'Parede ''A''; com #99 e /* nao e comentario */'");
  });

  it("instrução que ocupa várias linhas sai inteira", () => {
    const [, , , , , , dois] = lerEmPedacos(ARQUIVO, 3);
    expect(dois).toMatch(/^\/\* comentario com ; e #5 \*\/\s*#2=IFCLOCALPLACEMENT\(\$,\n#3\)$/);
  });

  it("arquivo que termina dentro de um texto é recusado", () => {
    const leitor = new LeitorStep();
    leitor.alimentar("#1=IFCWALL('sem fim");
    expect(() => leitor.finalizar()).toThrow("IFC truncado");
  });
});

describe("lerInstancia / idDaInstrucao", () => {
  it("lê id, tipo em maiúsculas e argumentos", () => {
    expect(lerInstancia("#12= IfcSiUnit(*,.LENGTHUNIT.,.MILLI.,.METRE.)")).toEqual({
      id: 12, tipo: "IFCSIUNIT", args: "*,.LENGTHUNIT.,.MILLI.,.METRE.",
    });
  });
  it("comentário antes da instância não atrapalha", () => {
    expect(idDaInstrucao("/* x */ #7=IFCDIRECTION((0.,0.,1.))")).toBe(7);
  });
  it("cabeçalho e instância complexa não são Instancia", () => {
    expect(lerInstancia("FILE_SCHEMA(('IFC4'))")).toBeNull();
    expect(lerInstancia("#3=(IFCA()IFCB())")).toBeNull();
    expect(idDaInstrucao("#3=(IFCA()IFCB())")).toBe(3);
  });
});

describe("atributos", () => {
  it("separa só no nível de topo, respeitando string e parênteses", () => {
    expect(atributos("'a,b',$,(#1,#2),IFCLENGTHMEASURE(1.),'x''y'")).toEqual([
      "'a,b'", "$", "(#1,#2)", "IFCLENGTHMEASURE(1.)", "'x''y'",
    ]);
  });
});

describe("trocarReferencias / referencias", () => {
  it("troca só referências fora de string e de comentário", () => {
    const t = "#1=IFCX(#2,'#3',(#4,#5)) /* #6 */";
    expect(trocarReferencias(t, (n) => n + 100)).toBe("#101=IFCX(#102,'#3',(#104,#105)) /* #6 */");
    expect(referencias("(#4,'#9',#5)")).toEqual([4, 5]);
  });
});

describe("textoStep", () => {
  it("escapa aspas, barra e acento", () => {
    expect(textoStep("D'Ávila\\x")).toBe("'D''\\X2\\00C1\\X0\\vila\\\\x'");
  });
  it("caractere fora do plano básico vira \\X4\\ inteiro, sem perder metade", () => {
    expect(textoStep("aé😀b")).toBe("'a\\X2\\00E9\\X0\\\\X4\\0001F600\\X0\\b'");
  });
});
