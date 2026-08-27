import { describe, expect, it } from "vitest";
import {
  dentroDaJanela,
  diasAteVencimento,
  rotuloVencimento,
  situacaoVencimento,
} from "./vencimento";

const hoje = new Date("2026-08-27T14:30:00.000Z");
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("diasAteVencimento", () => {
  it("conta por dia civil, não por instante", () => {
    // O caso que quebra a subtração ingênua: `@db.Date` chega meia-noite UTC e "agora" é 14:30.
    // Dividir a diferença de milissegundos daria -0,6 → arredondado para baixo, -1 (vencido).
    expect(diasAteVencimento(dia("2026-08-27"), hoje)).toBe(0);
  });

  it("futuro é positivo, passado é negativo", () => {
    expect(diasAteVencimento(dia("2026-09-03"), hoje)).toBe(7);
    expect(diasAteVencimento(dia("2026-08-24"), hoje)).toBe(-3);
  });

  it("atravessa virada de mês e de ano", () => {
    expect(diasAteVencimento(dia("2026-09-01"), hoje)).toBe(5);
    expect(diasAteVencimento(dia("2027-01-01"), dia("2026-12-31"))).toBe(1);
  });
});

describe("situacaoVencimento", () => {
  it("classifica pelas faixas", () => {
    expect(situacaoVencimento(dia("2026-08-26"), hoje)).toBe("vencido");
    expect(situacaoVencimento(dia("2026-08-27"), hoje)).toBe("critico"); // vence hoje
    expect(situacaoVencimento(dia("2026-09-03"), hoje)).toBe("critico"); // 7 dias
    expect(situacaoVencimento(dia("2026-09-04"), hoje)).toBe("atencao"); // 8 dias
    expect(situacaoVencimento(dia("2026-09-26"), hoje)).toBe("atencao"); // 30 dias
    expect(situacaoVencimento(dia("2026-09-27"), hoje)).toBe("ok"); // 31 dias
  });

  it("sem data é `ok` — sem prazo não há o que cobrar", () => {
    expect(situacaoVencimento(null, hoje)).toBe("ok");
  });
});

describe("dentroDaJanela", () => {
  it("pega o que vence dentro do prazo E o que já venceu", () => {
    expect(dentroDaJanela(dia("2026-09-20"), 30, hoje)).toBe(true);
    expect(dentroDaJanela(dia("2026-08-01"), 30, hoje)).toBe(true); // vencido continua exigindo ação
    expect(dentroDaJanela(dia("2026-12-01"), 30, hoje)).toBe(false);
  });

  it("sem data nunca entra na janela", () => {
    expect(dentroDaJanela(null, 30, hoje)).toBe(false);
  });
});

describe("rotuloVencimento", () => {
  it("usa singular e plural certos", () => {
    expect(rotuloVencimento(dia("2026-08-28"), hoje)).toBe("vence em 1 dia");
    expect(rotuloVencimento(dia("2026-09-08"), hoje)).toBe("vence em 12 dias");
    expect(rotuloVencimento(dia("2026-08-26"), hoje)).toBe("vencido há 1 dia");
    expect(rotuloVencimento(dia("2026-08-24"), hoje)).toBe("vencido há 3 dias");
  });

  it("hoje tem texto próprio, não 'em 0 dias'", () => {
    expect(rotuloVencimento(dia("2026-08-27"), hoje)).toBe("vence hoje");
  });

  it("sem data", () => {
    expect(rotuloVencimento(null, hoje)).toBe("sem prazo");
  });
});
