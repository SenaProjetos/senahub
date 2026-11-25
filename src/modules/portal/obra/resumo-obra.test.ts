import { describe, expect, it } from "vitest";
import { listaEmMarkdown, textoDoSino } from "../resumo-diario";
import { diasDaConta, fatosDaObra, itemDoFato, mudancasDosControles, mudancasDosEventos, type MudancaObra } from "./resumo-obra";

const t = (iso: string) => new Date(iso);
const mud = (documentoId: string, numero: number, tipo: MudancaObra["tipo"], em: string): MudancaObra => ({ documentoId, numero, tipo, em: t(em) });

describe("mudancasDosControles (dentro do ciclo documental)", () => {
  it("controle ativo = só aplicado; removido = aplicado + removido, em ordem", () => {
    const m = mudancasDosControles([
      { documentoId: "d1", numero: 2, aplicadoEm: t("2026-11-20T15:00:00Z"), removidoEm: null, origem: null },
      { documentoId: "d1", numero: 1, aplicadoEm: t("2026-11-10T15:00:00Z"), removidoEm: t("2026-11-20T14:00:00Z"), origem: "publicacao" },
    ]);
    expect(m).toEqual([
      mud("d1", 1, "aplicado", "2026-11-10T15:00:00Z"),
      mud("d1", 1, "removido", "2026-11-20T14:00:00Z"),
      mud("d1", 2, "aplicado", "2026-11-20T15:00:00Z"),
    ]);
  });

  it("controle da migração não gera liberada (a data é a da migração), mas a remoção dele conta", () => {
    expect(
      mudancasDosControles([
        { documentoId: "d1", numero: 1, aplicadoEm: t("2026-10-08T03:00:00Z"), removidoEm: t("2026-11-20T14:00:00Z"), origem: "migracao" },
        { documentoId: "d2", numero: 1, aplicadoEm: t("2026-10-08T03:00:00Z"), removidoEm: null, origem: "migracao" },
      ]),
    ).toEqual([mud("d1", 1, "removido", "2026-11-20T14:00:00Z")]);
  });
});

describe("mudancasDosEventos (fora do ciclo documental)", () => {
  it("marcar sobre outra revisão = removido + aplicado; marcar de novo a mesma = nada; retirar = removido", () => {
    const m = mudancasDosEventos([
      { documentoId: "d1", tipo: "situacao_marcada", revisao: 1, em: t("2026-11-10T12:00:00Z") },
      { documentoId: "d1", tipo: "situacao_marcada", revisao: 2, em: t("2026-11-12T12:00:00Z") },
      { documentoId: "d1", tipo: "situacao_marcada", revisao: 2, em: t("2026-11-13T12:00:00Z") },
      { documentoId: "d1", tipo: "situacao_retirada", revisao: 2, em: t("2026-11-14T12:00:00Z") },
    ]);
    expect(m).toEqual([
      mud("d1", 1, "aplicado", "2026-11-10T12:00:00Z"),
      mud("d1", 1, "removido", "2026-11-12T12:00:00Z"),
      mud("d1", 2, "aplicado", "2026-11-12T12:00:00Z"),
      mud("d1", 2, "removido", "2026-11-14T12:00:00Z"),
    ]);
  });

  it("retirar sem nada marcado não gera nada; a ordem de entrada não importa", () => {
    expect(
      mudancasDosEventos([
        { documentoId: "d1", tipo: "situacao_marcada", revisao: 1, em: t("2026-11-12T12:00:00Z") },
        { documentoId: "d1", tipo: "situacao_retirada", revisao: 1, em: t("2026-11-10T12:00:00Z") },
      ]),
    ).toEqual([mud("d1", 1, "aplicado", "2026-11-12T12:00:00Z")]);
  });
});

describe("fatosDaObra", () => {
  const dias = ["2026-11-20", "2026-11-21"];

  it("removida uma revisão e liberada outra do mesmo documento no mesmo dia = substituída", () => {
    expect(
      fatosDaObra([mud("d1", 1, "removido", "2026-11-20T14:00:00Z"), mud("d1", 2, "aplicado", "2026-11-20T15:00:00Z")], dias),
    ).toEqual([{ dia: "2026-11-20", documentoId: "d1", tipo: "substituida", de: 1, para: 2 }]);
  });

  it("perto da meia-noite de São Paulo são dois dias: retirada num, liberada no outro", () => {
    // 23:50 de 20/11 em SP = 02:50Z de 21/11; 00:10 de 21/11 em SP = 03:10Z.
    expect(
      fatosDaObra([mud("d1", 1, "removido", "2026-11-21T02:50:00Z"), mud("d1", 2, "aplicado", "2026-11-21T03:10:00Z")], dias),
    ).toEqual([
      { dia: "2026-11-20", documentoId: "d1", tipo: "retirada", de: 1, para: null },
      { dia: "2026-11-21", documentoId: "d1", tipo: "liberada", de: null, para: 2 },
    ]);
  });

  it("só aplicado = liberada; só removido = retirada; fora dos dias = nada", () => {
    expect(
      fatosDaObra(
        [
          mud("d1", 1, "aplicado", "2026-11-20T12:00:00Z"),
          mud("d2", 3, "removido", "2026-11-20T13:00:00Z"),
          mud("d3", 1, "aplicado", "2026-11-19T12:00:00Z"),
        ],
        dias,
      ),
    ).toEqual([
      { dia: "2026-11-20", documentoId: "d1", tipo: "liberada", de: null, para: 1 },
      { dia: "2026-11-20", documentoId: "d2", tipo: "retirada", de: 3, para: null },
    ]);
  });

  it("liberada e retirada no mesmo dia = nada (veio e foi)", () => {
    expect(fatosDaObra([mud("d1", 1, "aplicado", "2026-11-20T12:00:00Z"), mud("d1", 1, "removido", "2026-11-20T18:00:00Z")], dias)).toEqual([]);
  });
});

describe("itemDoFato", () => {
  const doc = { disciplina: "Estrutural", nome: "EST-01*.pdf" };

  it("texto com o rótulo de revisão das Entregas", () => {
    expect(itemDoFato({ dia: "2026-11-20", documentoId: "d", tipo: "liberada", de: null, para: 2 }, doc).texto).toBe(
      "EST-01*.pdf · liberada para obra (R01)",
    );
    expect(itemDoFato({ dia: "2026-11-20", documentoId: "d", tipo: "substituida", de: 1, para: 2 }, doc).texto).toBe(
      "EST-01*.pdf · substituída: R00 → R01",
    );
    expect(itemDoFato({ dia: "2026-11-20", documentoId: "d", tipo: "retirada", de: 2, para: null }, doc).texto).toBe(
      "EST-01*.pdf · retirada de obra (R01)",
    );
  });

  it("o nome vindo do banco sai escapado na lista do e-mail; o sino mostra o texto puro", () => {
    const item = itemDoFato({ dia: "2026-11-20", documentoId: "d", tipo: "liberada", de: null, para: 1 }, doc);
    const porDia = new Map([["2026-11-20", [item]]]);
    expect(listaEmMarkdown(porDia)).toContain("EST-01\\*.pdf");
    expect(textoDoSino(porDia)).toBe("Estrutural · EST-01*.pdf · liberada para obra (R00)");
  });
});

describe("diasDaConta", () => {
  it("conta (ou obra) que entrou depois do fim de um dia não recebe aquele dia (mesma regra do resumo do cliente)", () => {
    // 10:00 de 20/11 em SP = 13:00Z: recebe 20 e 21, nunca 19.
    expect(diasDaConta(["2026-11-19", "2026-11-20", "2026-11-21"], t("2026-11-20T13:00:00Z"))).toEqual(["2026-11-20", "2026-11-21"]);
    // 00:30 de 21/11 em SP = 03:30Z: 20/11 já tinha terminado.
    expect(diasDaConta(["2026-11-20", "2026-11-21"], t("2026-11-21T03:30:00Z"))).toEqual(["2026-11-21"]);
  });

  it("quem já existia recebe todos os dias", () => {
    expect(diasDaConta(["2026-11-20", "2026-11-21"], t("2026-11-01T12:00:00Z"))).toEqual(["2026-11-20", "2026-11-21"]);
  });
});
