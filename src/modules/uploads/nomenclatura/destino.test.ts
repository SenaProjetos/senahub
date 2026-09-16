import { describe, expect, it } from "vitest";
import { CATALOGO_SENA } from "@/test/catalogo-nomenclatura";
import { EXTENSOES_INICIAIS } from "./extensoes-iniciais";
import { interpretarNomeArquivo } from "./interpretar";
import { montarVocabulario } from "./vocabulario";
import { resolverDestino } from "./destino";

const vocabulario = montarVocabulario(CATALOGO_SENA, null);

function destinoDe(nome: string) {
  const interp = interpretarNomeArquivo(nome, {
    projeto: { codigo: "260020", ano: 26, sequencial: 20 },
    disciplinaCatalogoId: null,
    padrao: null,
    vocabulario,
    extensoes: EXTENSOES_INICIAIS,
  });
  return resolverDestino(interp);
}

describe("resolverDestino", () => {
  it("extensão de backup vai pra backup, nome não importa", () => {
    expect(destinoDe("qualquer coisa.qibzip")).toBe("backup");
    expect(destinoDe("ENTREGA BÁSICO.zip")).toBe("backup");
    expect(destinoDe("desenho.bak")).toBe("backup");
    expect(destinoDe("modelo.0001.rvt")).toBe("backup");
  });

  it("CAD/BIM com nome estruturado vai pra pranchas", () => {
    expect(destinoDe("260020-EST-EX-4001-DET.dwg")).toBe("pranchas");
    expect(destinoDe("260020-EST-EX-4001-DET.ifc")).toBe("pranchas");
  });

  it("office com nome estruturado também vai pra pranchas", () => {
    expect(destinoDe("260020-EST-EX-4001-MEM.docx")).toBe("pranchas");
    expect(destinoDe("260020-EST-EX-4001-PQT.xlsx")).toBe("pranchas");
  });

  it("nome genérico (sem número nem fase+tipo) vai pra outros, sem perguntar nada", () => {
    expect(destinoDe("planilha de custos.xlsx")).toBe("outros");
    expect(destinoDe("relatorio final.docx")).toBe("outros");
    expect(destinoDe("foto do terreno.jpg")).toBe("outros");
  });
});
