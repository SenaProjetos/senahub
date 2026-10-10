import { describe, it, expect } from "vitest";
import { corrigirPerfisIfc } from "@/modules/coordenacao/perfis-ifc";

const bytes = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));
const texto = (b: Uint8Array) => Buffer.from(b).toString("latin1");

describe("corrigirPerfisIfc", () => {
  it("tira o raio interno do perfil C (IFC2X3, com centro de gravidade)", () => {
    const r = corrigirPerfisIfc(
      bytes("#94= IFCCSHAPEPROFILEDEF(.AREA.,'C200X75X25X4.75',#95,0.2,0.075,0.00475,0.025,0.00475,$);\n"),
    );
    expect(texto(r.bytes)).toBe("#94= IFCCSHAPEPROFILEDEF(.AREA.,'C200X75X25X4.75',#95,0.2,0.075,0.00475,0.025,$,$);\n");
    expect(r.corrigidos).toBe(1);
  });

  it("tira o raio interno do perfil C (IFC4, raio é o último argumento)", () => {
    const r = corrigirPerfisIfc(bytes("#9=IFCCSHAPEPROFILEDEF(.AREA.,$,#8,200.,75.,4.75,25.,4.75);"));
    expect(texto(r.bytes)).toBe("#9=IFCCSHAPEPROFILEDEF(.AREA.,$,#8,200.,75.,4.75,25.,$);");
    expect(r.corrigidos).toBe(1);
  });

  it("não se confunde com vírgula, parêntese ou aspas escapadas no nome do perfil", () => {
    const r = corrigirPerfisIfc(bytes("#1= IFCCSHAPEPROFILEDEF ( .AREA. , 'C 200,(75)''x', #2 , 0.2,0.075,0.00475,0.025, 0.003 ,$);"));
    expect(texto(r.bytes)).toBe("#1= IFCCSHAPEPROFILEDEF ( .AREA. , 'C 200,(75)''x', #2 , 0.2,0.075,0.00475,0.025,$,$);");
  });

  it("corrige todas as ocorrências e preserva o resto do arquivo", () => {
    const entrada =
      "#1= IFCBEAM('a',#2,'Peça',$,$,#3,#4,$);\n" +
      "#5= IFCCSHAPEPROFILEDEF(.AREA.,'C1',#6,0.2,0.075,0.002,0.025,0.002,$);\n" +
      "#7= IFCUSHAPEPROFILEDEF(.AREA.,'U1',#8,0.1,0.05,0.003,0.003,0.003,$,$,$);\n" +
      "#9= IFCCSHAPEPROFILEDEF(.AREA.,'C2',#10,0.25,0.075,0.002,0.025,0.002,$);\n";
    const r = corrigirPerfisIfc(bytes(entrada));
    expect(r.corrigidos).toBe(2);
    expect(texto(r.bytes)).toBe(
      entrada
        .replace("0.025,0.002,$);\n#7", "0.025,$,$);\n#7")
        .replace("'C2',#10,0.25,0.075,0.002,0.025,0.002,$", "'C2',#10,0.25,0.075,0.002,0.025,$,$"),
    );
  });

  it("devolve o mesmo buffer quando não há nada a corrigir", () => {
    const sem = bytes("#5= IFCCSHAPEPROFILEDEF(.AREA.,'C1',#6,0.2,0.075,0.002,0.025,$,$);\n#6= IFCBEAM($);");
    const r = corrigirPerfisIfc(sem);
    expect(r.corrigidos).toBe(0);
    expect(r.bytes).toBe(sem);
  });

  it("ignora entidade truncada (arquivo cortado) sem quebrar", () => {
    const r = corrigirPerfisIfc(bytes("#5= IFCCSHAPEPROFILEDEF(.AREA.,'C1',#6,0.2"));
    expect(r.corrigidos).toBe(0);
  });
});
