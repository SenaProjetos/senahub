import { describe, expect, it } from "vitest";
import { agruparRegistrosDiariosProjeto } from "./registros-projeto";

describe("registros diários do projeto", () => {
  it("agrupa jornada e apontamento por dia local, incluindo sessão em andamento", () => {
    const agora = new Date("2026-08-26T18:00:00.000Z");
    const registros = agruparRegistrosDiariosProjeto(
      [
        {
          id: "clt-1",
          inicio: new Date("2026-08-26T11:00:00.000Z"),
          fim: new Date("2026-08-26T13:00:00.000Z"),
          user: { id: "u-clt", name: "Ana", role: "clt" },
        },
        {
          id: "pj-1",
          inicio: new Date("2026-08-26T15:00:00.000Z"),
          fim: null,
          user: { id: "u-pj", name: "Bruno", role: "projetista_pj" },
        },
        {
          id: "freela-1",
          inicio: new Date("2026-08-25T14:00:00.000Z"),
          fim: new Date("2026-08-25T15:15:00.000Z"),
          user: { id: "u-freela", name: "Carla", role: "freelancer" },
        },
      ],
      agora,
    );

    expect(registros).toHaveLength(2);
    expect(registros[0]).toMatchObject({ dia: "2026-08-26", totalMinutos: 300 });
    expect(registros[0]?.registros).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "clt-1", tipo: "jornada", minutos: 120, emAndamento: false }),
        expect.objectContaining({ id: "pj-1", tipo: "apontamento", minutos: 180, emAndamento: true }),
      ]),
    );
    expect(registros[1]).toMatchObject({ dia: "2026-08-25", totalMinutos: 75 });
    expect(registros[1]?.registros[0]).toMatchObject({ tipo: "apontamento", minutos: 75 });
  });

  it("ignora sessões sem duração e ordena os registros recentes primeiro", () => {
    const agora = new Date("2026-08-26T18:00:00.000Z");
    const registros = agruparRegistrosDiariosProjeto(
      [
        {
          id: "antigo",
          inicio: new Date("2026-08-26T10:00:00.000Z"),
          fim: new Date("2026-08-26T11:00:00.000Z"),
          user: { id: "u-1", name: "Ana", role: "estagiario" },
        },
        {
          id: "recente",
          inicio: new Date("2026-08-26T12:00:00.000Z"),
          fim: new Date("2026-08-26T13:00:00.000Z"),
          user: { id: "u-2", name: "Bruno", role: "freelancer" },
        },
        {
          id: "sem-duracao",
          inicio: agora,
          fim: agora,
          user: { id: "u-3", name: "Carla", role: "clt" },
        },
      ],
      agora,
    );

    expect(registros).toHaveLength(1);
    expect(registros[0]?.registros.map((registro) => registro.id)).toEqual(["recente", "antigo"]);
  });
});
