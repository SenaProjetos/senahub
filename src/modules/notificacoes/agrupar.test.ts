import { describe, it, expect } from "vitest";
import { agruparNotificacoes, JANELA_AGRUPAMENTO_MS, type NotificacaoBruta } from "./agrupar";

const AGORA = new Date("2026-08-01T14:00:00Z");
const MIN = 60_000;

/** `minAtras` = quantos minutos antes de AGORA a notificação foi criada. */
function n(
  id: string,
  minAtras: number,
  campos: Partial<Pick<NotificacaoBruta, "titulo" | "corpo" | "href" | "lida">> = {},
): NotificacaoBruta {
  return {
    id,
    titulo: "Arquivo aguardando validação",
    corpo: "Elétrico (260023): 1 arquivo(s) novo(s) para validar.",
    href: "/projetos/p1/arquivos",
    lida: false,
    createdAt: new Date(AGORA.getTime() - minAtras * MIN),
    ...campos,
  };
}

describe("agruparNotificacoes", () => {
  it("junta 5 uploads idênticos da mesma janela num item só", () => {
    const grupos = agruparNotificacoes([n("a", 0), n("b", 1), n("c", 1), n("d", 2), n("e", 3)]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].total).toBe(5);
    expect(grupos[0].ids).toEqual(["a", "b", "c", "d", "e"]);
    expect(grupos[0].naoLidas).toBe(5);
    // Carimbo da ocorrência mais recente, não da primeira.
    expect(grupos[0].createdAt).toEqual(AGORA);
  });

  it("separa disciplinas diferentes do mesmo projeto (corpo difere)", () => {
    const grupos = agruparNotificacoes([
      n("a", 0),
      n("b", 1, { corpo: "Hidráulico (260023): 1 arquivo(s) novo(s) para validar." }),
    ]);
    expect(grupos).toHaveLength(2);
  });

  it("separa projetos diferentes com a mesma disciplina (href difere)", () => {
    const grupos = agruparNotificacoes([
      n("a", 0),
      n("b", 1, { href: "/projetos/p2/arquivos" }),
    ]);
    expect(grupos).toHaveLength(2);
  });

  it("não funde compromissos distintos que só diferem na data (regressão)", () => {
    // Motivo de a chave ser igualdade exata: normalizar dígitos colapsaria estes dois.
    const grupos = agruparNotificacoes([
      n("a", 0, { titulo: "Convite de agenda", corpo: "Reunião semanal — 05/08/2026 14:00", href: "/agenda" }),
      n("b", 1, { titulo: "Convite de agenda", corpo: "Reunião semanal — 12/08/2026 14:00", href: "/agenda" }),
    ]);
    expect(grupos).toHaveLength(2);
  });

  it("separa a mesma chave em bursts distintos quando passa da janela", () => {
    const grupos = agruparNotificacoes([n("a", 0), n("b", 60)]);
    expect(grupos).toHaveLength(2);
    expect(grupos.map((g) => g.total)).toEqual([1, 1]);
  });

  it("mede a janela contra o item mais novo, sem absorção encadeada", () => {
    // 0 e 14 min cabem na janela de 15; 28 min está a 28 do ÂNCORA (não a 14 do anterior).
    const grupos = agruparNotificacoes([n("a", 0), n("b", 14), n("c", 28)]);
    expect(grupos).toHaveLength(2);
    expect(grupos[0].ids).toEqual(["a", "b"]);
    expect(grupos[1].ids).toEqual(["c"]);
  });

  it("inclui a borda exata da janela", () => {
    const grupos = agruparNotificacoes([n("a", 0), n("b", JANELA_AGRUPAMENTO_MS / MIN)]);
    expect(grupos).toHaveLength(1);
  });

  it("mantém lidas e não lidas no mesmo grupo, contando as não lidas", () => {
    // Ler 2 de 5 em /notificacoes não pode partir o grupo em dois blocos idênticos.
    const grupos = agruparNotificacoes([n("a", 0), n("b", 1, { lida: true })]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].total).toBe(2);
    expect(grupos[0].naoLidas).toBe(1);
  });

  it("grupo todo lido tem naoLidas 0", () => {
    const grupos = agruparNotificacoes([n("a", 0, { lida: true }), n("b", 1, { lida: true })]);
    expect(grupos[0].naoLidas).toBe(0);
  });

  it("trata corpo/href nulos como vazios (ambos renderizam sem corpo)", () => {
    const grupos = agruparNotificacoes([
      n("a", 0, { corpo: null, href: null }),
      n("b", 1, { corpo: "", href: "" }),
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].corpo).toBeNull();
  });

  it("lista vazia devolve vazio; item único vira grupo de 1", () => {
    expect(agruparNotificacoes([])).toEqual([]);
    const grupos = agruparNotificacoes([n("a", 0)]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].total).toBe(1);
  });

  it("preserva a ordem decrescente de entrada", () => {
    const grupos = agruparNotificacoes([
      n("a", 0, { corpo: "X" }),
      n("b", 2, { corpo: "Y" }),
      n("c", 3, { corpo: "X" }),
    ]);
    expect(grupos.map((g) => g.corpo)).toEqual(["X", "Y"]);
    expect(grupos[0].ids).toEqual(["a", "c"]);
  });
});
