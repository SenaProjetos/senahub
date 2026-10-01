import { describe, expect, it } from "vitest";
import { motivoCodigoTravado } from "./cadastro-disciplina";

describe("motivoCodigoTravado", () => {
  it("sem projeto usando: a pasta dos arquivos pode mudar", () => {
    expect(motivoCodigoTravado(0)).toBeNull();
  });

  it("em uso: trava com o motivo, no singular e no plural", () => {
    expect(motivoCodigoTravado(1)).toBe("Em uso em 1 projeto: mudar agora separaria os arquivos em duas pastas.");
    expect(motivoCodigoTravado(22)).toBe("Em uso em 22 projetos: mudar agora separaria os arquivos em duas pastas.");
  });
});
