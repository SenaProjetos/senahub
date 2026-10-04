import { describe, expect, it } from "vitest";
import { EXT_OUTROS, FASE_SEM, montarArvoreNavegacao } from "./arvore-navegacao";
import {
  arquivoNoFormato,
  entradasZipDaPasta,
  hrefDaPasta,
  hrefZipDaPasta,
  nivelDaPasta,
  pastasDaRaiz,
  pastasDoNivel,
  raizDaNavegacao,
  segmentoDaRaiz,
  trilhaDaPasta,
  type ArquivoParaZipPasta,
  type DisciplinaDaPasta,
} from "./pastas-da-lista";

const DISCIPLINAS: DisciplinaDaPasta[] = [
  { id: "d-est", nome: "Estrutural", status: "em_andamento", total: 3 },
  { id: "d-hid", nome: "Hidrossanitário", status: "aguardando", total: 0 },
];

const ARVORE = montarArvoreNavegacao(
  [
    { id: "1", disciplinaId: "d-est", faseId: "f-ex", faseSigla: "EX", faseNome: "Projeto Executivo", extensoes: ["pdf", "dwg"] },
    { id: "2", disciplinaId: "d-est", faseId: "f-ex", faseSigla: "EX", faseNome: "Projeto Executivo", extensoes: ["pdf"] },
    { id: "3", disciplinaId: "d-est", faseId: null, faseSigla: null, faseNome: null, extensoes: ["xyz"] },
  ],
  ["pdf", "dwg"],
);

const RAIZ = { disciplinaId: null, fase: null, ext: null };
const AREAS = [
  { id: "recebidos", rotulo: "Recebidos do cliente", total: 2 },
  { id: "geral", rotulo: "Geral", total: 0 },
];

describe("nivelDaPasta", () => {
  it("reconhece os quatro níveis da árvore", () => {
    expect(nivelDaPasta(RAIZ)).toBe("raiz");
    expect(nivelDaPasta({ disciplinaId: "d", fase: null, ext: null })).toBe("disciplina");
    expect(nivelDaPasta({ disciplinaId: "d", fase: "f", ext: null })).toBe("fase");
    expect(nivelDaPasta({ disciplinaId: "d", fase: "f", ext: "pdf" })).toBe("formato");
  });

  it("recorte que não é pasta é filtro", () => {
    expect(nivelDaPasta({ disciplinaId: null, fase: "f", ext: null })).toBeNull();
    expect(nivelDaPasta({ disciplinaId: null, fase: null, ext: "pdf" })).toBeNull();
    expect(nivelDaPasta({ disciplinaId: "d", fase: null, ext: "pdf" })).toBeNull();
    // "Sem fase" deixou de ser pasta: o documento sem fase mora solto na disciplina.
    expect(nivelDaPasta({ disciplinaId: "d", fase: FASE_SEM, ext: null })).toBeNull();
  });

  it("parâmetro vazio na URL vale como ausente", () => {
    expect(nivelDaPasta({ disciplinaId: "", fase: "", ext: "" })).toBe("raiz");
  });
});

describe("pastasDoNivel", () => {
  it("na raiz da pasta-mãe: todas as disciplinas, inclusive a vazia, e nada mais", () => {
    const pastas = pastasDoNivel(RAIZ, DISCIPLINAS, ARVORE);
    expect(pastas.map((p) => [p.tipo, p.rotulo, p.total])).toEqual([
      ["disciplina", "Estrutural", 3],
      ["disciplina", "Hidrossanitário", 0],
    ]);
    expect(pastas[0].status).toBe("em_andamento");
    expect(pastas[0].zip).toEqual({ disciplinaId: "d-est", fase: null, ext: null });
    // Disciplina vazia não oferece .zip.
    expect(pastas[1].zip).toBeNull();
  });

  it("na disciplina: só as fases — o sem fase fica solto na lista, não vira pasta", () => {
    const pastas = pastasDoNivel({ disciplinaId: "d-est", fase: null, ext: null }, DISCIPLINAS, ARVORE);
    expect(pastas.map((p) => [p.tipo, p.rotulo, p.total])).toEqual([["fase", "EX", 2]]);
    expect(pastas[0].titulo).toBe("Projeto Executivo");
    expect(pastas[0].disciplinaNome).toBe("Estrutural");
    expect(pastas[0].destino).toEqual({ disciplinaId: "d-est", fase: "f-ex", ext: null, area: null });
    expect(pastas[0].zip).toEqual({ disciplinaId: "d-est", fase: "f-ex", ext: null });
  });

  it("na fase: os formatos, contando documentos como a árvore", () => {
    const pastas = pastasDoNivel({ disciplinaId: "d-est", fase: "f-ex", ext: null }, DISCIPLINAS, ARVORE);
    expect(pastas.map((p) => [p.tipo, p.rotulo, p.total])).toEqual([
      ["extensao", "DWG", 1],
      ["extensao", "PDF", 2],
    ]);
    expect(pastas[1].destino).toEqual({ disciplinaId: "d-est", fase: "f-ex", ext: "pdf", area: null });
    expect(pastas[1].zip).toEqual({ disciplinaId: "d-est", fase: "f-ex", ext: "pdf" });
  });

  it("formato é folha, disciplina vazia não tem subpasta", () => {
    expect(pastasDoNivel({ disciplinaId: "d-est", fase: "f-ex", ext: "pdf" }, DISCIPLINAS, ARVORE)).toEqual([]);
    expect(pastasDoNivel({ disciplinaId: "d-hid", fase: null, ext: null }, DISCIPLINAS, ARVORE)).toEqual([]);
  });

  it("recorte que não é nó da árvore não lista pasta", () => {
    expect(pastasDoNivel({ disciplinaId: null, fase: "f-ex", ext: null }, DISCIPLINAS, ARVORE)).toEqual([]);
    expect(pastasDoNivel({ disciplinaId: "d-est", fase: null, ext: "pdf" }, DISCIPLINAS, ARVORE)).toEqual([]);
    expect(pastasDoNivel({ disciplinaId: "d-est", fase: "f-lo", ext: null }, DISCIPLINAS, ARVORE)).toEqual([]);
    expect(pastasDoNivel({ disciplinaId: "d-outra", fase: null, ext: null }, DISCIPLINAS, ARVORE)).toEqual([]);
  });
});

describe("trilhaDaPasta", () => {
  it("na raiz é vazia", () => {
    expect(trilhaDaPasta(RAIZ, DISCIPLINAS, ARVORE)).toEqual([]);
  });

  it("vai da disciplina ao formato", () => {
    const trilha = trilhaDaPasta({ disciplinaId: "d-est", fase: "f-ex", ext: "pdf" }, DISCIPLINAS, ARVORE);
    expect(trilha.map((s) => s.rotulo)).toEqual(["Estrutural", "EX", "PDF"]);
    expect(trilha[1].destino).toEqual({ disciplinaId: "d-est", fase: "f-ex", ext: null, area: null });
  });

  it("para onde a árvore deixa de reconhecer a seleção — inclusive no antigo Sem fase", () => {
    const rotulos = (fase: string, ext: string | null) =>
      trilhaDaPasta({ disciplinaId: "d-est", fase, ext }, DISCIPLINAS, ARVORE).map((s) => s.rotulo);
    expect(rotulos("f-lo", "pdf")).toEqual(["Estrutural"]);
    expect(rotulos(FASE_SEM, EXT_OUTROS)).toEqual(["Estrutural"]);
    expect(rotulos("f-ex", "ifc")).toEqual(["Estrutural", "EX"]);
  });

  it("disciplina fora da lista visível não gera trilha", () => {
    expect(trilhaDaPasta({ disciplinaId: "d-outra", fase: null, ext: null }, DISCIPLINAS, ARVORE)).toEqual([]);
  });
});

describe("hrefDaPasta", () => {
  it("troca a posição, mantém ordenação e tira página e lista", () => {
    const href = hrefDaPasta("/projetos/p1/arquivos", "sort=nome&dir=asc&page=3&listaId=l1&ext=pdf", {
      disciplinaId: "d-est",
      fase: "f-ex",
      ext: null,
      area: null,
    });
    expect(href).toBe("/projetos/p1/arquivos?sort=nome&dir=asc&disciplinaId=d-est&fase=f-ex");
  });

  it("voltar à raiz sem outros parâmetros dá o endereço limpo", () => {
    expect(hrefDaPasta("/x", "disciplinaId=d&area=geral", { disciplinaId: null, fase: null, ext: null, area: null })).toBe("/x");
  });
});

describe("hrefZipDaPasta", () => {
  it("leva só o recorte informado", () => {
    expect(hrefZipDaPasta({ disciplinaId: "d", fase: null, ext: null })).toBe("/api/uploads/pasta/zip?disciplinaId=d");
    expect(hrefZipDaPasta({ disciplinaId: "d", fase: "f", ext: EXT_OUTROS })).toBe(
      "/api/uploads/pasta/zip?disciplinaId=d&fase=f&ext=__outros__",
    );
  });
});

describe("arquivoNoFormato", () => {
  const conhecidas = new Set(["pdf", "dwg"]);
  it("formato do catálogo casa pela extensão, sem diferenciar caixa", () => {
    expect(arquivoNoFormato("A.PDF", "pdf", conhecidas)).toBe(true);
    expect(arquivoNoFormato("A.dwg", "pdf", conhecidas)).toBe(false);
  });
  it("Outros é o que está fora do catálogo, inclusive sem extensão", () => {
    expect(arquivoNoFormato("A.xyz", EXT_OUTROS, conhecidas)).toBe(true);
    expect(arquivoNoFormato("LEIAME", EXT_OUTROS, conhecidas)).toBe(true);
    expect(arquivoNoFormato("A.pdf", EXT_OUTROS, conhecidas)).toBe(false);
  });
});

describe("entradasZipDaPasta", () => {
  const conhecidas = ["pdf", "dwg"];
  const arq = (uploadId: string, nome: string, faseId: string | null): ArquivoParaZipPasta => ({
    uploadId,
    caminho: `/s/${uploadId}`,
    nome,
    faseId,
    faseRotulo: faseId ? faseId.toUpperCase() : null,
  });
  const ARQUIVOS = [
    arq("1", "4001.pdf", "ex"),
    arq("2", "4001.dwg", "ex"),
    arq("3", "4002.pdf", "lo"),
    arq("4", "memorial.xyz", null),
    arq("5", "solto.pdf", null),
  ];

  it("da disciplina: Fase/FORMATO/arquivo, e o sem fase solto na raiz", () => {
    expect(entradasZipDaPasta(ARQUIVOS, conhecidas, { fase: null, ext: null }).map((e) => e.nome)).toEqual([
      "EX/PDF/4001.pdf",
      "EX/DWG/4001.dwg",
      "LO/PDF/4002.pdf",
      "memorial.xyz",
      "solto.pdf",
    ]);
  });

  it("da fase: FORMATO/arquivo, só daquela fase", () => {
    expect(entradasZipDaPasta(ARQUIVOS, conhecidas, { fase: "ex", ext: null }).map((e) => e.nome)).toEqual([
      "PDF/4001.pdf",
      "DWG/4001.dwg",
    ]);
  });

  it("do formato: só os arquivos daquele formato — a pasta PDF não leva DWG", () => {
    expect(entradasZipDaPasta(ARQUIVOS, conhecidas, { fase: "ex", ext: "pdf" }).map((e) => e.uploadId)).toEqual(["1"]);
    expect(entradasZipDaPasta(ARQUIVOS, conhecidas, { fase: FASE_SEM, ext: EXT_OUTROS }).map((e) => e.uploadId)).toEqual([
      "4",
    ]);
  });

  it("nome repetido ganha sufixo antes da extensão", () => {
    const repetidos = [arq("1", "a.pdf", "ex"), arq("2", "a.pdf", "ex"), arq("3", "a.pdf", "ex")];
    expect(entradasZipDaPasta(repetidos, conhecidas, { fase: "ex", ext: "pdf" }).map((e) => e.nome)).toEqual([
      "a.pdf",
      "a (2).pdf",
      "a (3).pdf",
    ]);
  });
});

describe("pastas-mãe da raiz (reunião de 29/09/2026)", () => {
  it("raiz geral: Desenvolvimento, as pastas do cliente e as áreas — nenhuma com .zip", () => {
    const raiz = pastasDaRaiz({
      totalDesenvolvimento: 23,
      situacoes: [
        { id: "compartilhado", rotulo: "Compartilhado", total: 3 },
        { id: "liberado_obra", rotulo: "Liberado para obra", total: 0 },
      ],
      areas: AREAS,
    });
    expect(raiz.map((p) => [p.tipo, p.rotulo, p.total])).toEqual([
      ["desenvolvimento", "Desenvolvimento", 23],
      ["situacao", "Compartilhado", 3],
      ["situacao", "Liberado para obra", 0],
      ["area", "Recebidos do cliente", 2],
      ["area", "Geral", 0],
    ]);
    expect(raiz.every((p) => p.zip === null)).toBe(true);
    const url = (i: number) => hrefDaPasta("/p", "sort=nome", raiz[i].destino);
    expect(url(0)).toBe("/p?sort=nome&pasta=desenvolvimento");
    expect(url(1)).toBe("/p?sort=nome&situacao=compartilhado");
    expect(url(3)).toBe("/p?sort=nome&area=recebidos");
  });

  it("trocar de pasta-mãe tira a marca da outra", () => {
    const [dev, compartilhado] = pastasDaRaiz({
      totalDesenvolvimento: 1,
      situacoes: [{ id: "compartilhado", rotulo: "Compartilhado", total: 1 }],
      areas: [],
    });
    expect(hrefDaPasta("/p", "situacao=compartilhado&disciplinaId=d", dev.destino)).toBe("/p?pasta=desenvolvimento");
    expect(hrefDaPasta("/p", "pasta=desenvolvimento&disciplinaId=d", compartilhado.destino)).toBe("/p?situacao=compartilhado");
  });

  it("raizDaNavegacao: a pasta do cliente vence; disciplina sem situação é Desenvolvimento", () => {
    expect(raizDaNavegacao({ situacao: null, pasta: null, disciplinaId: null })).toBe("geral");
    expect(raizDaNavegacao({ situacao: null, pasta: "desenvolvimento", disciplinaId: null })).toBe("desenvolvimento");
    // Link antigo (`?disciplinaId=`) e o "Enviar arquivos" do card caem dentro do Desenvolvimento.
    expect(raizDaNavegacao({ situacao: null, pasta: null, disciplinaId: "d" })).toBe("desenvolvimento");
    expect(raizDaNavegacao({ situacao: "compartilhado", pasta: "desenvolvimento", disciplinaId: "d" })).toBe("compartilhado");
    // Valor desconhecido na URL não é pasta.
    expect(raizDaNavegacao({ situacao: "xyz", pasta: "xyz", disciplinaId: "" })).toBe("geral");
  });

  it("a trilha começa na pasta-mãe e volta para a raiz dela", () => {
    expect(segmentoDaRaiz("geral")).toBeNull();
    const dev = segmentoDaRaiz("desenvolvimento");
    expect(dev?.rotulo).toBe("Desenvolvimento");
    expect(hrefDaPasta("/a", "disciplinaId=d&fase=f", dev!.destino)).toBe("/a?pasta=desenvolvimento");
    const lib = segmentoDaRaiz("liberado_obra");
    expect(lib?.rotulo).toBe("Liberado para obra");
    expect(hrefDaPasta("/a", "situacao=liberado_obra&disciplinaId=d", lib!.destino)).toBe("/a?situacao=liberado_obra");
  });

  it("entrar numa disciplina não perde a pasta-mãe; voltar à raiz geral tira", () => {
    const dentro = "situacao=compartilhado";
    expect(hrefDaPasta("/a", dentro, { disciplinaId: "d-est", fase: null, ext: null, area: null })).toBe("/a?situacao=compartilhado&disciplinaId=d-est");
    expect(hrefDaPasta("/a", "pasta=desenvolvimento&disciplinaId=d", { disciplinaId: null, fase: null, ext: null, area: null, situacao: null, pasta: null })).toBe("/a");
  });
});
