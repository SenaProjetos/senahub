import { describe, expect, it } from "vitest";
import {
  campoOrdenacaoValido,
  contarFiltros,
  filtrarLinhas,
  linhasDeDocumentos,
  ordenarLinhas,
  type DisciplinaComArquivos,
  type LinhaDocumento,
} from "./lista-documentos";

function arquivo(over: Partial<DisciplinaComArquivos["arquivos"][number]> = {}) {
  return {
    id: "u1",
    nome: "planta.pdf",
    versao: 1,
    tamanho: 1000,
    aprovado: false,
    autor: "João",
    data: "2026-08-01T10:00:00.000Z",
    downloadUrl: "/api/uploads/u1/download",
    ...over,
  };
}

function disciplina(over: Partial<DisciplinaComArquivos> = {}): DisciplinaComArquivos {
  return { id: "d1", nome: "Estrutural", podeEnviar: false, arquivos: [], arquivosPasta: [], ...over };
}

describe("linhasDeDocumentos", () => {
  it("achata pacote e pasta na mesma lista, com a disciplina em cada linha", () => {
    const linhas = linhasDeDocumentos([
      disciplina({
        id: "d1",
        nome: "Estrutural",
        arquivos: [arquivo({ id: "a", nome: "forma.pdf" })],
        arquivosPasta: [arquivo({ id: "b", nome: "laudo.docx" })],
      }),
    ]);
    expect(linhas.map((l) => l.id)).toEqual(["a", "b"]);
    expect(linhas.every((l) => l.disciplinaNome === "Estrutural" && l.disciplinaId === "d1")).toBe(true);
  });

  it("deriva a extensão do nome, em minúscula e sem ponto", () => {
    const linhas = linhasDeDocumentos([
      disciplina({ arquivos: [arquivo({ nome: "PLANTA.PDF" }), arquivo({ id: "u2", nome: "modelo.IFC" })] }),
    ]);
    expect(linhas.map((l) => l.ext)).toEqual(["pdf", "ifc"]);
  });

  it("nome sem extensão vira string vazia, não quebra", () => {
    const linhas = linhasDeDocumentos([disciplina({ arquivos: [arquivo({ nome: "LEIAME" })] })]);
    expect(linhas[0].ext).toBe("");
  });

  it("validação é booleana no pacote e null na PastaProjeto (que não tem validação por-arquivo)", () => {
    const linhas = linhasDeDocumentos([
      disciplina({
        arquivos: [arquivo({ id: "a", aprovado: true })],
        arquivosPasta: [arquivo({ id: "b" })],
      }),
    ]);
    expect(linhas[0].validado).toBe(true);
    expect(linhas[1].validado).toBeNull();
  });

  it("junta várias disciplinas preservando a ordem que veio da query", () => {
    const linhas = linhasDeDocumentos([
      disciplina({ id: "d1", nome: "Estrutural", arquivos: [arquivo({ id: "a" })] }),
      disciplina({ id: "d2", nome: "Arquitetura", arquivos: [arquivo({ id: "b" })] }),
    ]);
    expect(linhas.map((l) => l.disciplinaNome)).toEqual(["Estrutural", "Arquitetura"]);
  });

  it("herda podeGerir da disciplina, por linha (a permissão é por disciplina, não por arquivo)", () => {
    const linhas = linhasDeDocumentos([
      disciplina({ id: "d1", podeEnviar: true, arquivos: [arquivo({ id: "a" })] }),
      disciplina({ id: "d2", nome: "Elétrica", podeEnviar: false, arquivos: [arquivo({ id: "b" })] }),
    ]);
    expect(linhas.map((l) => l.podeGerir)).toEqual([true, false]);
  });

  it("projeto sem arquivo nenhum devolve lista vazia", () => {
    expect(linhasDeDocumentos([disciplina()])).toEqual([]);
    expect(linhasDeDocumentos([])).toEqual([]);
  });
});

describe("ordenarLinhas", () => {
  const base: LinhaDocumento[] = [
    {
      id: "a", nome: "Épico.pdf", ext: "pdf", disciplinaId: "d2", disciplinaNome: "Hidráulica",
      versao: 3, validado: true, autor: "Ana", data: "2026-08-10T00:00:00.000Z", tamanho: 300, downloadUrl: "", podeGerir: true,
    },
    {
      id: "b", nome: "alfa.pdf", ext: "pdf", disciplinaId: "d1", disciplinaNome: "Arquitetura",
      versao: 1, validado: false, autor: "Bia", data: "2026-08-01T00:00:00.000Z", tamanho: 100, downloadUrl: "", podeGerir: true,
    },
    {
      id: "c", nome: "beta.dwg", ext: "dwg", disciplinaId: "d1", disciplinaNome: "Arquitetura",
      versao: 2, validado: null, autor: "Caio", data: "2026-08-05T00:00:00.000Z", tamanho: 200, downloadUrl: "", podeGerir: true,
    },
  ];

  it("não muta o array de entrada", () => {
    const antes = base.map((l) => l.id);
    ordenarLinhas(base, "nome", "asc");
    expect(base.map((l) => l.id)).toEqual(antes);
  });

  it("ordena por nome respeitando acento do pt-BR", () => {
    // "Épico" tem que cair entre "beta" e o fim, não antes de "alfa" (o que aconteceria
    // numa comparação por código de caractere).
    expect(ordenarLinhas(base, "nome", "asc").map((l) => l.nome)).toEqual(["alfa.pdf", "beta.dwg", "Épico.pdf"]);
  });

  it("inverte a ordem no desc", () => {
    expect(ordenarLinhas(base, "nome", "desc").map((l) => l.nome)).toEqual(["Épico.pdf", "beta.dwg", "alfa.pdf"]);
  });

  it("ordena por versão e tamanho como número, não como texto", () => {
    expect(ordenarLinhas(base, "versao", "asc").map((l) => l.versao)).toEqual([1, 2, 3]);
    expect(ordenarLinhas(base, "tamanho", "desc").map((l) => l.tamanho)).toEqual([300, 200, 100]);
  });

  it("ordena por data (ISO comparável como string)", () => {
    expect(ordenarLinhas(base, "data", "desc").map((l) => l.id)).toEqual(["a", "c", "b"]);
  });

  it("desempata disciplina igual pelo nome do arquivo", () => {
    const r = ordenarLinhas(base, "disciplina", "asc");
    expect(r.map((l) => l.id)).toEqual(["b", "c", "a"]);
  });
});

describe("filtrarLinhas", () => {
  const agora = new Date("2026-08-20T00:00:00.000Z");
  const base: LinhaDocumento[] = [
    {
      id: "a", nome: "Planta Épica.pdf", ext: "pdf", disciplinaId: "d1", disciplinaNome: "Estrutural",
      versao: 1, validado: true, autor: "Ana Souza", data: "2026-08-18T00:00:00.000Z", tamanho: 10, downloadUrl: "", podeGerir: true,
    },
    {
      id: "b", nome: "corte.dwg", ext: "dwg", disciplinaId: "d2", disciplinaNome: "Arquitetura",
      versao: 1, validado: false, autor: "Bia Lima", data: "2026-07-01T00:00:00.000Z", tamanho: 20, downloadUrl: "", podeGerir: true,
    },
    {
      id: "c", nome: "laudo.pdf", ext: "pdf", disciplinaId: "d2", disciplinaNome: "Arquitetura",
      versao: 1, validado: null, autor: "Ana Souza", data: "2026-08-19T00:00:00.000Z", tamanho: 30, downloadUrl: "", podeGerir: false,
    },
  ];

  it("sem filtro devolve tudo", () => {
    expect(filtrarLinhas(base, {}, agora)).toHaveLength(3);
  });

  it("busca por nome, disciplina ou responsável no mesmo campo", () => {
    expect(filtrarLinhas(base, { q: "corte" }, agora).map((l) => l.id)).toEqual(["b"]);
    expect(filtrarLinhas(base, { q: "arquitetura" }, agora).map((l) => l.id)).toEqual(["b", "c"]);
    expect(filtrarLinhas(base, { q: "bia" }, agora).map((l) => l.id)).toEqual(["b"]);
  });

  it("busca ignora acento e caixa nos dois lados", () => {
    // Quem digita "epica" tem que achar "Planta Épica.pdf" — e vice-versa.
    expect(filtrarLinhas(base, { q: "epica" }, agora).map((l) => l.id)).toEqual(["a"]);
    expect(filtrarLinhas(base, { q: "ÉPICA" }, agora).map((l) => l.id)).toEqual(["a"]);
  });

  it("filtra por extensão e por responsável", () => {
    expect(filtrarLinhas(base, { ext: "pdf" }, agora).map((l) => l.id)).toEqual(["a", "c"]);
    expect(filtrarLinhas(base, { autor: "Ana Souza" }, agora).map((l) => l.id)).toEqual(["a", "c"]);
  });

  it("filtra por período contando a partir do `agora` injetado", () => {
    expect(filtrarLinhas(base, { periodo: "7" }, agora).map((l) => l.id)).toEqual(["a", "c"]);
    expect(filtrarLinhas(base, { periodo: "90" }, agora).map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("período fora da whitelist é ignorado em vez de zerar a lista", () => {
    expect(filtrarLinhas(base, { periodo: "999" }, agora)).toHaveLength(3);
    expect(filtrarLinhas(base, { periodo: "abc" }, agora)).toHaveLength(3);
  });

  it("validado sim/não exclui o arquivo de pasta, que não tem validação", () => {
    expect(filtrarLinhas(base, { validado: "sim" }, agora).map((l) => l.id)).toEqual(["a"]);
    expect(filtrarLinhas(base, { validado: "nao" }, agora).map((l) => l.id)).toEqual(["b"]);
  });

  it("combina filtros (E, não OU)", () => {
    expect(filtrarLinhas(base, { ext: "pdf", autor: "Ana Souza", periodo: "7" }, agora).map((l) => l.id)).toEqual([
      "a",
      "c",
    ]);
    expect(filtrarLinhas(base, { ext: "pdf", validado: "sim" }, agora).map((l) => l.id)).toEqual(["a"]);
    expect(filtrarLinhas(base, { ext: "dwg", validado: "sim" }, agora)).toEqual([]);
  });
});

describe("contarFiltros", () => {
  it("conta só os filtros preenchidos", () => {
    expect(contarFiltros({})).toBe(0);
    expect(contarFiltros({ q: "planta" })).toBe(1);
    expect(contarFiltros({ q: "planta", ext: "pdf", validado: "sim" })).toBe(3);
  });

  it("string vazia ou só espaço não conta como filtro ativo", () => {
    expect(contarFiltros({ q: "", ext: "   " })).toBe(0);
  });
});

describe("campoOrdenacaoValido", () => {
  it("aceita os campos da whitelist", () => {
    expect(campoOrdenacaoValido("nome")).toBe("nome");
    expect(campoOrdenacaoValido("data")).toBe("data");
  });

  it("rejeita valor fora da whitelist, nulo ou vazio (vem da URL)", () => {
    expect(campoOrdenacaoValido("senha")).toBeNull();
    expect(campoOrdenacaoValido(null)).toBeNull();
    expect(campoOrdenacaoValido(undefined)).toBeNull();
    expect(campoOrdenacaoValido("")).toBeNull();
  });
});
