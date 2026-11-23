import { describe, expect, it } from "vitest";
import { decisoesCombinadas, type DecisaoDeAtaDTO } from "./decisoes";

const daConversa = (id: string, em: string) => ({ mensagemId: id, resumo: `Resumo ${id}`, trecho: "trecho", mensagemEm: em, marcadaPor: "Registrada pela coordenação" });
const daAta = (titulo: string, data: string, comObservacoes = false): DecisaoDeAtaDTO => ({
  reuniaoId: `r-${titulo}`,
  chave: `k-${titulo}`,
  titulo,
  descricao: null,
  reuniaoTitulo: "Reunião X",
  reuniaoData: data,
  comObservacoes,
});

describe("atas — decisões combinadas", () => {
  it("junta conversa e atas por data, mais nova primeiro", () => {
    const lista = decisoesCombinadas(
      [daConversa("m1", "2026-11-10T15:00:00.000Z"), daConversa("m2", "2026-11-01T15:00:00.000Z")],
      [daAta("Telha", "2026-11-05"), daAta("Piso", "2026-11-12")],
    );
    expect(lista.map((d) => (d.origem === "conversa" ? d.mensagemId : d.titulo))).toEqual(["Piso", "m1", "Telha", "m2"]);
  });

  it("marca com observações", () => {
    const [d] = decisoesCombinadas([], [daAta("Piso", "2026-11-12", true)]);
    expect(d).toMatchObject({ origem: "ata", comObservacoes: true });
  });

  it("sem nada, lista vazia", () => {
    expect(decisoesCombinadas([], [])).toEqual([]);
  });
});
