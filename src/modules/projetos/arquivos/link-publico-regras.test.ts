import { describe, expect, it } from "vitest";
import {
  ehBackupDoModelo,
  faseLiberada,
  filtrarPorFases,
  recortarParaLinkPublico,
  somenteUltimaRevisao,
  type UploadParaLink,
} from "./link-publico-regras";

function up(id: string, p: Partial<UploadParaLink> = {}): UploadParaLink {
  return { id, documentoId: "doc1", revisaoNumero: 1, pacote: "A", ...p };
}
const ids = (us: UploadParaLink[]) => us.map((u) => u.id);

describe("ehBackupDoModelo", () => {
  it("só o pacote B é backup do modelo", () => {
    expect(ehBackupDoModelo({ pacote: "B" })).toBe(true);
    expect(ehBackupDoModelo({ pacote: "A" })).toBe(false);
    expect(ehBackupDoModelo({ pacote: "OUTROS" })).toBe(false);
    // Arquivo em PastaProjeto não tem pacote — não é backup.
    expect(ehBackupDoModelo({ pacote: null })).toBe(false);
  });
});

describe("somenteUltimaRevisao", () => {
  it("descarta as revisões anteriores do mesmo documento", () => {
    const r = somenteUltimaRevisao([
      up("r1", { revisaoNumero: 1 }),
      up("r2", { revisaoNumero: 2 }),
      up("r3", { revisaoNumero: 3 }),
    ]);
    expect(ids(r)).toEqual(["r3"]);
  });

  it("mantém TODOS os arquivos quando a última revisão tem vários", () => {
    const r = somenteUltimaRevisao([
      up("antigo", { revisaoNumero: 1 }),
      up("planta", { revisaoNumero: 2 }),
      up("memorial", { revisaoNumero: 2 }),
      up("tabela", { revisaoNumero: 2 }),
    ]);
    expect(ids(r)).toEqual(["planta", "memorial", "tabela"]);
  });

  it("cada documento tem a sua própria última revisão", () => {
    const r = somenteUltimaRevisao([
      up("a1", { documentoId: "A", revisaoNumero: 1 }),
      up("a2", { documentoId: "A", revisaoNumero: 2 }),
      up("b1", { documentoId: "B", revisaoNumero: 1 }),
    ]);
    expect(ids(r)).toEqual(["a2", "b1"]);
  });

  it("upload sem documento entra sempre — é arquivo solto, não revisão", () => {
    const r = somenteUltimaRevisao([
      up("solto1", { documentoId: null, revisaoNumero: null }),
      up("solto2", { documentoId: null, revisaoNumero: null }),
    ]);
    expect(ids(r)).toEqual(["solto1", "solto2"]);
  });

  it("upload sem revisão sobrevive ao lado de revisões numeradas", () => {
    // Linha legada anterior ao backfill: sumir com ela deixaria o cliente sem o arquivo
    // e sem qualquer sinal de que ele existe.
    const r = somenteUltimaRevisao([
      up("legado", { revisaoNumero: null }),
      up("r1", { revisaoNumero: 1 }),
      up("r2", { revisaoNumero: 2 }),
    ]);
    expect(ids(r)).toEqual(["legado", "r2"]);
  });

  it("apelido de merge agrupa pelo documento canônico", () => {
    // Sem isso, apelido e canônico calculariam cada um a "sua" última revisão e o
    // cliente veria duas gerações do mesmo desenho.
    const r = somenteUltimaRevisao([
      up("velho", { documentoId: "apelido", documentoCanonicoId: "canon", revisaoNumero: 1 }),
      up("novo", { documentoId: "canon", revisaoNumero: 4 }),
    ]);
    expect(ids(r)).toEqual(["novo"]);
  });

  it("preserva a ordem de entrada", () => {
    const r = somenteUltimaRevisao([
      up("c", { documentoId: "C", revisaoNumero: 1 }),
      up("a", { documentoId: "A", revisaoNumero: 1 }),
      up("b", { documentoId: "B", revisaoNumero: 1 }),
    ]);
    expect(ids(r)).toEqual(["c", "a", "b"]);
  });

  it("lista vazia devolve lista vazia", () => {
    expect(somenteUltimaRevisao([])).toEqual([]);
  });
});

describe("recortarParaLinkPublico", () => {
  it("tira backup do modelo e revisão anterior de uma vez", () => {
    const r = recortarParaLinkPublico([
      up("r1", { revisaoNumero: 1 }),
      up("r2", { revisaoNumero: 2 }),
      up("backup", { revisaoNumero: 2, pacote: "B" }),
      up("solto", { documentoId: null, revisaoNumero: null }),
    ]);
    expect(ids(r)).toEqual(["r2", "solto"]);
  });

  it("backup do modelo sai mesmo sendo a revisão mais alta do documento", () => {
    // O B não pode 'puxar' o máximo para cima e apagar a última entrega de verdade:
    // por isso o filtro de pacote roda ANTES do cálculo da revisão.
    const r = recortarParaLinkPublico([
      up("entrega", { revisaoNumero: 2 }),
      up("backup", { revisaoNumero: 3, pacote: "B" }),
    ]);
    expect(ids(r)).toEqual(["entrega"]);
  });

  /**
   * PINO DE COMPORTAMENTO — não é bug, é decisão. Não "consertar".
   *
   * O máximo é calculado sobre o que CHEGA aqui, e o que chega já passou pelo filtro
   * `{ validado: true, excluidoEm: null }` da consulta. Logo, mandar a revisão corrente
   * para a lixeira PROMOVE a anterior a "entrega corrente" no link público.
   *
   * Isso já foi um chamado real (projeto 260032, set/2026): R02 e R03 do desenho foram
   * para a lixeira uma a uma, a R01 ficou para trás e o cliente passou a baixar a R01
   * como se fosse a entrega. A correção NÃO foi mudar este cálculo — foi tornar o escopo
   * da exclusão explícito na hora de excluir (`modules/uploads/exclusao-escopo.ts`):
   *   - "excluir só esta revisão" = pedido deliberado de voltar para a anterior → é isto
   *     que a promoção abaixo entrega;
   *   - "excluir o documento inteiro" = todas as revisões vão juntas → não sobra ninguém
   *     para promover e o documento simplesmente sai do link.
   *
   * Trocar isto por "documento some quando a corrente é excluída" quebra o primeiro caso.
   */
  it("promove a revisão anterior quando as posteriores não chegam (lixeira/não validadas)", () => {
    const r = recortarParaLinkPublico([up("r1", { documentoId: "doc", revisaoNumero: 1 })]);
    expect(ids(r)).toEqual(["r1"]);
  });
});

describe("filtro de fase do link (F4)", () => {
  const f = (faseIds: string[], incluirSemFase = false) => ({ faseIds, incluirSemFase });
  const arq = (id: string, faseId: string | null) => ({ id, faseId });

  it("faseIds VAZIO libera todas as fases, inclusive sem fase — link antigo não perde nada", () => {
    // Semântica INVERTIDA em relação a `disciplinaIds` (vazio = nada), de propósito: é o
    // valor que todo link criado antes da F4 recebe na migration.
    const itens = [arq("bs", "BS"), arq("ex", "EX"), arq("solto", null)];
    expect(filtrarPorFases(itens, f([]))).toEqual(itens);
    expect(faseLiberada(null, f([]))).toBe(true);
  });

  it("lista preenchida é lista branca", () => {
    const r = filtrarPorFases([arq("bs", "BS"), arq("ex", "EX")], f(["EX"]));
    expect(r.map((x) => x.id)).toEqual(["ex"]);
  });

  it("com lista, arquivo SEM fase é bloqueado por padrão — não vaza Executivo não classificado", () => {
    expect(faseLiberada(null, f(["BS"]))).toBe(false);
  });

  it("`incluirSemFase` libera o sem-fase junto — a saída para acervo sem fase preenchida", () => {
    expect(faseLiberada(null, f(["BS"], true))).toBe(true);
    // Mas não libera outra fase por tabela.
    expect(faseLiberada("EX", f(["BS"], true))).toBe(false);
  });

  it("`incluirSemFase` sem lista não muda nada — vazio já libera tudo", () => {
    expect(faseLiberada(null, f([], false))).toBe(true);
  });

  it("ORDEM: recortar ANTES, filtrar fase DEPOIS — merge de fase divergente não promove revisão antiga", () => {
    // O apelido (fase EX) carrega a R03, a entrega corrente; o canônico (fase BS) só tem
    // R01. Link liberado só para BS.
    type U = UploadParaLink & { faseId: string | null };
    const uploads: U[] = [
      { id: "r1", documentoId: "canon", revisaoNumero: 1, pacote: "A", faseId: "BS" },
      { id: "r3", documentoId: "apelido", documentoCanonicoId: "canon", revisaoNumero: 3, pacote: "A", faseId: "EX" },
    ];

    // Certo: a entrega corrente é a R03 (EX), que não é liberada → o documento sai inteiro.
    const certo = filtrarPorFases(recortarParaLinkPublico(uploads), f(["BS"]));
    expect(certo).toEqual([]);

    // Errado (o que esta ordem impede): filtrar antes tira a R03, e o recorte promove a R01
    // a "entrega" — o cliente receberia uma revisão vencida como se fosse a corrente.
    const errado = recortarParaLinkPublico(filtrarPorFases(uploads, f(["BS"])));
    expect(errado.map((u) => u.id)).toEqual(["r1"]);
  });
});
