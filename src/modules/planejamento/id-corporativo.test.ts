import { describe, expect, it } from "vitest";
import { formatarIdCorporativo, prefixoDoTipo, reservarIdsParaLinhas, type ClienteSequenciaEap } from "./id-corporativo";

/** Contador em memória, com a semântica do upsert + increment do Prisma. */
function contador(inicial: Record<string, number> = {}) {
  const estado = new Map(Object.entries(inicial));
  const chamadas: string[] = [];
  const cliente = {
    eapSequencia: {
      upsert: async (args: {
        where: { prefixo: string };
        create: { prefixo: string; ultimo: number };
        update: { ultimo: { increment: number } };
      }) => {
        const { prefixo } = args.where;
        chamadas.push(prefixo);
        const atual = estado.get(prefixo);
        const ultimo = atual == null ? args.create.ultimo : atual + args.update.ultimo.increment;
        estado.set(prefixo, ultimo);
        return { prefixo, ultimo };
      },
    },
  } as unknown as ClienteSequenciaEap;
  return { cliente, estado, chamadas };
}

describe("formatarIdCorporativo / prefixoDoTipo", () => {
  it("prefixo em maiúsculas, número com 5 dígitos", () => {
    expect(prefixoDoTipo("atv")).toBe("ATV");
    expect(prefixoDoTipo("disc")).toBe("DISC");
    expect(formatarIdCorporativo("ATV", 1842)).toBe("ATV-01842");
    expect(formatarIdCorporativo("MRC", 3)).toBe("MRC-00003");
    expect(formatarIdCorporativo("ATV", 123456)).toBe("ATV-123456");
  });
});

describe("reservarIdsParaLinhas", () => {
  it("continua de onde o contador parou e devolve na ordem das linhas", async () => {
    const { cliente, estado } = contador({ ATV: 41 });
    expect(await reservarIdsParaLinhas(cliente, ["atv", "atv", "atv"])).toEqual(["ATV-00042", "ATV-00043", "ATV-00044"]);
    expect(estado.get("ATV")).toBe(44);
  });

  it("um prefixo novo nasce em 1, e tipos misturados voltam na ordem pedida", async () => {
    const { cliente, estado } = contador({ ATV: 10 });
    const ids = await reservarIdsParaLinhas(cliente, ["atv", "mrc", "atv", "mrc", "disc"]);
    expect(ids).toEqual(["ATV-00011", "MRC-00001", "ATV-00012", "MRC-00002", "DISC-00001"]);
    expect(Object.fromEntries(estado)).toEqual({ ATV: 12, MRC: 2, DISC: 1 });
  });

  it("um incremento por prefixo, não um por linha", async () => {
    const { cliente, chamadas } = contador();
    await reservarIdsParaLinhas(cliente, ["atv", "atv", "atv", "mrc"]);
    expect(chamadas).toEqual(["ATV", "MRC"]);
  });

  it("nenhuma linha, nenhuma chamada", async () => {
    const { cliente, chamadas } = contador();
    expect(await reservarIdsParaLinhas(cliente, [])).toEqual([]);
    expect(chamadas).toEqual([]);
  });

  it("duas reservas seguidas nunca repetem número", async () => {
    const { cliente } = contador({ ATV: 5 });
    const a = await reservarIdsParaLinhas(cliente, ["atv", "atv"]);
    const b = await reservarIdsParaLinhas(cliente, ["atv"]);
    expect([...a, ...b]).toEqual(["ATV-00006", "ATV-00007", "ATV-00008"]);
  });
});
