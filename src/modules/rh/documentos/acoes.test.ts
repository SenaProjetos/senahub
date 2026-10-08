import { describe, expect, it } from "vitest";
import { itensDoDocumento, MOTIVO_SO_RH_REMOVE } from "./acoes";

const ids = (x: { id: string }[]) => x.map((i) => i.id);

describe("itensDoDocumento", () => {
  it("RH: validade, conferir (se falta) e remover", () => {
    expect(ids(itensDoDocumento({ conferido: false, enviadoPelaPessoa: true }, "rh"))).toEqual(["validade", "conferir", "s1", "remover"]);
    expect(ids(itensDoDocumento({ conferido: true, enviadoPelaPessoa: false }, "rh"))).toEqual(["validade", "s1", "remover"]);
  });
  it("a pessoa remove só o que ela enviou, antes da conferência", () => {
    expect(itensDoDocumento({ conferido: false, enviadoPelaPessoa: true }, "self")[0]).toMatchObject({ id: "remover", desabilitado: undefined });
    expect(itensDoDocumento({ conferido: true, enviadoPelaPessoa: true }, "self")[0]).toMatchObject({ desabilitado: MOTIVO_SO_RH_REMOVE });
    expect(itensDoDocumento({ conferido: true, enviadoPelaPessoa: false }, "self")).toEqual([]);
  });
});
