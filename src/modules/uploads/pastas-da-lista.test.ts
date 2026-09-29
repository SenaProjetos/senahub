import { describe, expect, it } from "vitest";
import { EXT_OUTROS, FASE_SEM, montarArvoreNavegacao } from "./arvore-navegacao";
import {
  arquivoNoFormato,
  entradasZipDaPasta,
  hrefDaPasta,
  hrefZipDaPasta,
  nivelDaPasta,
  pastasDoNivel,
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
  it("na raiz: todas as disciplinas, inclusive a vazia, e depois as áreas", () => {
    const pastas = pastasDoNivel(RAIZ, DISCIPLINAS, ARVORE, AREAS);
    expect(pastas.map((p) => [p.tipo, p.rotulo, p.total])).toEqual([
      ["disciplina", "Estrutural", 3],
      ["disciplina", "Hidrossanitário", 0],
      ["area", "Recebidos do cliente", 2],
      ["area", "Geral", 0],
    ]);
    expect(pastas[0].status).toBe("em_andamento");
    expect(pastas[0].zip).toEqual({ disciplinaId: "d-est", fase: null, ext: null });
    // Disciplina vazia não oferece .zip; área nunca oferece (tem tela própria).
    expect(pastas[1].zip).toBeNull();
    expect(pastas[2].zip).toBeNull();
    expect(pastas[2].destino).toEqual({ disciplinaId: null, fase: null, ext: null, area: "recebidos" });
  });

  it("na disciplina: só as fases — o sem fase fica solto na lista, não vira pasta", () => {
    const pastas = pastasDoNivel({ disciplinaId: "d-est", fase: null, ext: null }, DISCIPLINAS, ARVORE, AREAS);
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
    expect(pastasDoNivel({ disciplinaId: null, fase: "f-ex", ext: null }, DISCIPLINAS, ARVORE, AREAS)).toEqual([]);
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

describe("pastas do cliente (reunião de 29/09/2026)", () => {
  it("entram na raiz depois das disciplinas e antes das áreas, sem .zip e levando a situação na URL", () => {
    const raiz = pastasDoNivel(
      { disciplinaId: null, fase: null, ext: null },
      [{ id: "d-est", nome: "Estrutural", status: "em_andamento", total: 2 }],
      [],
      [{ id: "base", rotulo: "Base Arquitetônica", total: 1 }],
      [{ id: "compartilhado", rotulo: "Compartilhado", total: 3 }],
    );
    expect(raiz.map((p) => p.tipo)).toEqual(["disciplina", "situacao", "area"]);
    const pasta = raiz[1];
    expect(pasta).toMatchObject({ rotulo: "Compartilhado", total: 3, zip: null });
    expect(hrefDaPasta("/projetos/p1/arquivos", "sort=nome", pasta.destino)).toBe("/projetos/p1/arquivos?sort=nome&situacao=compartilhado");
  });

  it("entrar numa disciplina não perde a situação; voltar à raiz com situacao null tira", () => {
    const dentro = "situacao=compartilhado";
    expect(hrefDaPasta("/a", dentro, { disciplinaId: "d-est", fase: null, ext: null, area: null })).toBe("/a?situacao=compartilhado&disciplinaId=d-est");
    expect(hrefDaPasta("/a", dentro, { disciplinaId: null, fase: null, ext: null, area: null, situacao: null })).toBe("/a");
  });
});
