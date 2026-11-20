import { describe, expect, it } from "vitest";
import {
  descendentesDe,
  ehSemPavimento,
  gruposDePavimento,
  modeloServidoDaOrigem,
  motivoSemModelo,
  temModelo3dNoPortal,
  unirPavimentos,
  versaoIfcDoRecebido,
  visibilidadeDoPortal,
  pontoNaCena,
  pontoNoModelo,
  vistaNaCena,
  vistaNoModelo,
  type UploadDaCadeia,
} from "./regras";

const up = (
  id: string,
  realinhadoDeId: string | null,
  versao: number,
  convertido: boolean,
): UploadDaCadeia => ({ id, realinhadoDeId, versao, convertido });

describe("modeloServidoDaOrigem", () => {
  it("sem descendente serve a origem", () => {
    expect(modeloServidoDaOrigem("U", [up("U", null, 1, true)])).toBe("U");
    expect(modeloServidoDaOrigem("U", [])).toBe("U");
  });

  it("serve o descendente realinhado convertido", () => {
    const lista = [up("U", null, 1, true), up("R1", "U", 2, true)];
    expect(modeloServidoDaOrigem("U", lista)).toBe("R1");
  });

  it("pula o descendente mais novo que ainda não converteu", () => {
    const lista = [
      up("U", null, 1, true),
      up("R1", "U", 2, true),
      up("R2", "R1", 3, false),
    ];
    expect(modeloServidoDaOrigem("U", lista)).toBe("R1");
  });

  it("serve o mais recente da cadeia quando todos convertidos", () => {
    const lista = [
      up("R2", "R1", 3, true),
      up("U", null, 1, true),
      up("R1", "U", 2, true),
    ];
    expect(modeloServidoDaOrigem("U", lista)).toBe("R2");
  });

  it("volta à origem se nenhum descendente converteu", () => {
    const lista = [up("U", null, 1, true), up("R1", "U", 2, false)];
    expect(modeloServidoDaOrigem("U", lista)).toBe("U");
  });

  it("descendente de OUTRA origem nunca volta", () => {
    const lista = [
      up("U", null, 1, true),
      up("V", null, 1, true),
      up("RV", "V", 2, true),
    ];
    expect(modeloServidoDaOrigem("U", lista)).toBe("U");
    expect(modeloServidoDaOrigem("V", lista)).toBe("RV");
  });

  it("ciclo defensivo (A→B→A) não trava", () => {
    const lista = [up("A", "B", 1, true), up("B", "A", 2, true)];
    expect(() => modeloServidoDaOrigem("A", lista)).not.toThrow();
    expect(["A", "B"]).toContain(modeloServidoDaOrigem("A", lista));
  });
});

describe("descendentesDe", () => {
  it("devolve a cadeia inteira, sem a origem", () => {
    const lista = [
      up("U", null, 1, true),
      up("R1", "U", 2, true),
      up("R2", "R1", 3, false),
      up("X", null, 1, true),
      up("RX", "X", 2, true),
    ];
    expect(descendentesDe("U", lista)).toEqual(new Set(["R1", "R2"]));
  });

  it("vazio sem descendentes e seguro em ciclo", () => {
    expect(descendentesDe("U", [up("U", null, 1, true)])).toEqual(new Set());
    const ciclo = [up("A", "B", 1, true), up("B", "A", 2, true)];
    expect(descendentesDe("A", ciclo).has("B")).toBe(true);
  });
});

describe("ehSemPavimento", () => {
  it("só o grupo dos elementos sem pavimento", () => {
    const r = unirPavimentos([
      { modeloId: "m1", nome: null, pisoY: -2, localIds: [1] },
      { modeloId: "m1", nome: "Térreo", pisoY: 0, localIds: [2] },
    ]);
    expect(r.map(ehSemPavimento)).toEqual([false, true]);
  });
});

describe("unirPavimentos", () => {
  it("une 'Térreo' e 'TERREO ' de dois modelos, piso = o menor", () => {
    const r = unirPavimentos([
      { modeloId: "m1", nome: "Térreo", pisoY: 0.2, localIds: [1, 2] },
      { modeloId: "m2", nome: "TERREO ", pisoY: -0.1, localIds: [9] },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].pisoY).toBe(-0.1);
    expect(r[0].porModelo.get("m1")).toEqual([1, 2]);
    expect(r[0].porModelo.get("m2")).toEqual([9]);
    expect(r[0].nome).toBe("Térreo");
  });

  it("pavimento só de fundação num modelo não puxa o piso do mesmo pavimento do outro", () => {
    const r = unirPavimentos([
      { modeloId: "m1", nome: "Térreo", pisoY: -1.8, localIds: [1], soFundacao: true },
      { modeloId: "m2", nome: "TÉRREO", pisoY: 0, localIds: [2] },
    ]);
    expect(r[0].pisoY).toBe(0);
    expect(r[0].soFundacao).toBe(false);
    expect(r[0].porModelo.get("m1")).toEqual([1]);
  });

  it("só de fundação em todos os modelos: piso = o menor e soFundacao", () => {
    const r = unirPavimentos([
      { modeloId: "m1", nome: "Fundação", pisoY: -2, localIds: [1], soFundacao: true },
      { modeloId: "m2", nome: "FUNDACAO", pisoY: -2.5, localIds: [2], soFundacao: true },
    ]);
    expect(r[0].pisoY).toBe(-2.5);
    expect(r[0].soFundacao).toBe(true);
  });

  it("ignora espaços internos repetidos", () => {
    const r = unirPavimentos([
      { modeloId: "m1", nome: "1º   Pavimento", pisoY: 3, localIds: [1] },
      { modeloId: "m2", nome: "1º Pavimento", pisoY: 3.1, localIds: [2] },
    ]);
    expect(r).toHaveLength(1);
  });

  it("ordena por piso crescente", () => {
    const r = unirPavimentos([
      { modeloId: "m1", nome: "Cobertura", pisoY: 9, localIds: [1] },
      { modeloId: "m1", nome: "Térreo", pisoY: 0, localIds: [2] },
      { modeloId: "m1", nome: "1º Pavimento", pisoY: 3, localIds: [3] },
    ]);
    expect(r.map((p) => p.nome)).toEqual(["Térreo", "1º Pavimento", "Cobertura"]);
  });

  it("sem nome agrupa em 'Sem pavimento' por último", () => {
    const r = unirPavimentos([
      { modeloId: "m1", nome: null, pisoY: -5, localIds: [1] },
      { modeloId: "m2", nome: "  ", pisoY: -4, localIds: [2] },
      { modeloId: "m1", nome: "Térreo", pisoY: 0, localIds: [3] },
    ]);
    expect(r.map((p) => p.nome)).toEqual(["Térreo", "Sem pavimento"]);
    const sem = r[1];
    expect(sem.porModelo.get("m1")).toEqual([1]);
    expect(sem.porModelo.get("m2")).toEqual([2]);
  });

  it("mesmo nome repetido no mesmo modelo concatena os ids", () => {
    const r = unirPavimentos([
      { modeloId: "m1", nome: "Térreo", pisoY: 0, localIds: [1] },
      { modeloId: "m1", nome: "terreo", pisoY: 0.1, localIds: [2] },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].porModelo.get("m1")).toEqual([1, 2]);
  });

  it("lista vazia dá lista vazia", () => {
    expect(unirPavimentos([])).toEqual([]);
  });
});

describe("gruposDePavimento", () => {
  const el = (localId: number, pavimentoLocalId: number | null, pavimentoNome: string | null) => ({
    localId,
    pavimentoLocalId,
    pavimentoNome,
  });

  it("agrupa pelo pavimento do índice e junta os sem pavimento num grupo sem nome", () => {
    const grupos = gruposDePavimento([
      el(1, 10, "Térreo"),
      el(2, 20, "Cobertura"),
      el(3, 10, "Térreo"),
      el(4, null, null),
      el(5, null, null),
    ]);
    expect(grupos).toEqual([
      { nome: "Térreo", localIds: [1, 3] },
      { nome: "Cobertura", localIds: [2] },
      { nome: null, localIds: [4, 5] },
    ]);
  });

  it("pavimento sem nome resolvido vira grupo sem nome; índice vazio = nenhum grupo", () => {
    expect(gruposDePavimento([el(1, 10, null)])).toEqual([{ nome: null, localIds: [1] }]);
    expect(gruposDePavimento([])).toEqual([]);
  });
});

describe("visibilidadeDoPortal", () => {
  const todosIds = new Map<string, number[]>([
    ["A", [1, 2, 3]],
    ["B", [7, 8]],
  ]);
  const terreo = {
    chave: "terreo",
    nome: "Térreo",
    pisoY: 0,
    soFundacao: false,
    porModelo: new Map<string, number[]>([
      ["A", [1]],
      ["B", [7]],
    ]),
  };

  it("todos ligados e sem pavimento = mostra tudo", () => {
    expect(visibilidadeDoPortal({ carregados: ["A", "B"], desligados: new Set(), pavimento: null, todosIds })).toBe("tudo");
  });

  it("modelo desligado fica fora do mapa (escondido) e os ligados inteiros", () => {
    const v = visibilidadeDoPortal({ carregados: ["A", "B"], desligados: new Set(["B"]), pavimento: null, todosIds });
    expect(v).toEqual(new Map([["A", [1, 2, 3]]]));
  });

  it("pavimento isola os elementos dele só nos modelos ligados", () => {
    expect(visibilidadeDoPortal({ carregados: ["A", "B"], desligados: new Set(), pavimento: terreo, todosIds })).toEqual(
      new Map([
        ["A", [1]],
        ["B", [7]],
      ]),
    );
    expect(
      visibilidadeDoPortal({ carregados: ["A", "B"], desligados: new Set(["A"]), pavimento: terreo, todosIds }),
    ).toEqual(new Map([["B", [7]]]));
  });

  it("modelo ligado sem nada no pavimento escolhido fica todo escondido", () => {
    const soA = { ...terreo, porModelo: new Map([["A", [1]]]) };
    expect(visibilidadeDoPortal({ carregados: ["A", "B"], desligados: new Set(), pavimento: soA, todosIds })).toEqual(
      new Map([
        ["A", [1]],
        ["B", []],
      ]),
    );
  });

  it("desligado que não está carregado não muda nada", () => {
    expect(visibilidadeDoPortal({ carregados: ["A"], desligados: new Set(["Z"]), pavimento: null, todosIds })).toBe("tudo");
  });
});

describe("motivoSemModelo", () => {
  it("nenhum IFC = vazio; algum pronto = nada a explicar", () => {
    expect(motivoSemModelo([])).toBe("vazio");
    expect(motivoSemModelo(["erro", "pronto"])).toBeNull();
  });

  it("todos com erro = erro; algum preparando = preparando", () => {
    expect(motivoSemModelo(["erro", "erro"])).toBe("erro");
    expect(motivoSemModelo(["erro", "preparando"])).toBe("preparando");
    expect(motivoSemModelo(["preparando"])).toBe("preparando");
  });
});

describe("vista da marcação no referencial do próprio modelo", () => {
  // O mundo do visualizador é o do PRIMEIRO modelo aberto; a marcação é gravada como se o modelo dela tivesse aberto
  // primeiro (deslocamento zero) — é assim que o link ?apontamento=N da Coordenação o abre.
  const d: [number, number, number] = [10, -5, 2];
  const vista = { position: [11, -4, 5] as [number, number, number], target: [10, -5, 2] as [number, number, number] };
  it("da cena para o modelo e de volta é a identidade", () => {
    const noModelo = vistaNoModelo(vista, d);
    expect(noModelo).toEqual({ position: [1, 1, 3], target: [0, 0, 0] });
    expect(vistaNaCena(noModelo, d)).toEqual(vista);
    expect(pontoNoModelo([12, -5, 2], d)).toEqual([2, 0, 0]);
    expect(pontoNaCena([2, 0, 0], d)).toEqual([12, -5, 2]);
  });
  it("modelo que abriu primeiro (deslocamento zero) não muda nada", () => {
    expect(vistaNoModelo(vista, [0, 0, 0])).toEqual(vista);
    expect(pontoNaCena([1, 2, 3], [0, 0, 0])).toEqual([1, 2, 3]);
  });
});

describe("versaoIfcDoRecebido", () => {
  const v = (id: string, nomeArquivo: string) => ({ id, nomeArquivo });
  // Por número decrescente, como `recebidosDoProjeto` devolve.
  const versoes = [v("v4", "base-r4.ifc"), v("v3", "base-r3.pdf"), v("v2", "base-r2.ifc"), v("v1", "base-r1.IFC")];

  it("a IFC mais nova com conversão concluída", () => {
    expect(versaoIfcDoRecebido(versoes, new Set(["v2", "v1"]))?.id).toBe("v2");
    expect(versaoIfcDoRecebido(versoes, new Set(["v4", "v2"]))?.id).toBe("v4");
  });

  it("versão nova ainda convertendo não tira a anterior pronta", () => {
    expect(versaoIfcDoRecebido(versoes, new Set(["v1"]))?.id).toBe("v1");
  });

  it("nenhuma IFC convertida: a IFC mais nova (aparece em preparação)", () => {
    expect(versaoIfcDoRecebido(versoes, new Set())?.id).toBe("v4");
  });

  it("conversão de arquivo que não é IFC não conta; sem IFC = null", () => {
    expect(versaoIfcDoRecebido(versoes, new Set(["v3"]))?.id).toBe("v4");
    expect(versaoIfcDoRecebido([v("p", "planta.pdf")], new Set(["p"]))).toBeNull();
    expect(versaoIfcDoRecebido([], new Set())).toBeNull();
  });
});

describe("temModelo3dNoPortal", () => {
  it("sem modelo nenhum: sem atalho", () => {
    expect(temModelo3dNoPortal([])).toBe(false);
  });

  it("IFC das Entregas em qualquer situação: atalho (a página explica o que falta)", () => {
    expect(temModelo3dNoPortal([{ origem: "entrega", situacao: "preparando" }])).toBe(true);
    expect(temModelo3dNoPortal([{ origem: "entrega", situacao: "erro" }])).toBe(true);
  });

  it("só o IFC enviado pelo cliente: atalho quando ele está pronto", () => {
    expect(temModelo3dNoPortal([{ origem: "cliente", situacao: "pronto" }])).toBe(true);
    expect(temModelo3dNoPortal([{ origem: "cliente", situacao: "preparando" }])).toBe(false);
    expect(temModelo3dNoPortal([{ origem: "cliente", situacao: "erro" }])).toBe(false);
  });
});
