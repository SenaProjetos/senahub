import { describe, expect, it } from "vitest";
import { sinalDaLinha } from "./sinais-linha";

const base = { ehResumo: false, progresso: 40, status: "and", fimPrevisto: "2026-10-20", cardConcluidoEm: null };
const hoje = "2026-10-10";

describe("sinalDaLinha", () => {
  it("verde: card concluído e a linha ainda não está em 100%", () => {
    expect(sinalDaLinha({ ...base, cardConcluidoEm: "2026-10-09" }, hoje)).toBe("validar");
  });
  it("verde vence vermelho", () => {
    expect(sinalDaLinha({ ...base, fimPrevisto: "2026-10-01", cardConcluidoEm: "2026-10-09" }, hoje)).toBe("validar");
  });
  it("vermelho: término atual passou e não chegou a 100%", () => {
    expect(sinalDaLinha({ ...base, fimPrevisto: "2026-10-09" }, hoje)).toBe("atrasada");
  });
  it("no dia do término ainda não é atraso", () => {
    expect(sinalDaLinha({ ...base, fimPrevisto: hoje }, hoje)).toBeNull();
  });
  it("sem sinal: 100%, resumo ou linha encerrada", () => {
    expect(sinalDaLinha({ ...base, progresso: 100, fimPrevisto: "2026-10-01", cardConcluidoEm: "2026-10-09" }, hoje)).toBeNull();
    expect(sinalDaLinha({ ...base, ehResumo: true, fimPrevisto: "2026-10-01" }, hoje)).toBeNull();
    for (const status of ["con", "can", "arq"]) expect(sinalDaLinha({ ...base, status, fimPrevisto: "2026-10-01" }, hoje)).toBeNull();
  });
});
