import { describe, expect, it } from "vitest";
import { calcularExpediente, textosDoExpediente, type BatidaHero, type EscalaDoDia } from "@/modules/dashboard/hero/expediente";

const ESCALA: EscalaDoDia = {
  entrada: "08:00",
  saida: "17:00",
  descansos: [{ inicio: "12:00", fim: "13:00" }],
  horasDia: 8,
  toleranciaMin: 10,
};
const m = (h: number, min = 0) => h * 60 + min;
const DIA_NORMAL: BatidaHero[] = [
  { tipo: "entrada", minuto: m(7, 56) },
  { tipo: "inicio_descanso", minuto: m(12, 4) },
  { tipo: "fim_descanso", minuto: m(13, 2) },
  { tipo: "saida", minuto: m(17, 1) },
];

describe("calcularExpediente", () => {
  it("antes da entrada: escala do dia; passou da tolerância sem bater, avisa", () => {
    const cedo = calcularExpediente(ESCALA, [], m(7, 40));
    expect(cedo.estado).toBe("antes");
    expect(cedo.semEntrada).toBe(false);
    expect(textosDoExpediente(cedo, ESCALA)).toEqual({
      status: "Seu expediente hoje",
      resumo: "08:00 às 17:00, intervalo 12:00–13:00",
      extra: null,
    });
    const tarde = calcularExpediente(ESCALA, [], m(9));
    expect(tarde.semEntrada).toBe(true);
    expect(textosDoExpediente(tarde, ESCALA).status).toBe("Você ainda não bateu a entrada hoje");
  });

  it("trabalhando: trabalhado até agora e saída prevista com o intervalo planejado", () => {
    const ex = calcularExpediente(ESCALA, DIA_NORMAL, m(10));
    expect(ex.estado).toBe("trabalhando");
    expect(ex.trabalhadoMin).toBe(124);
    expect(ex.saidaPrevista).toBe(m(16, 56));
    expect(textosDoExpediente(ex, ESCALA)).toEqual({
      status: "Trabalhando desde 07:56",
      resumo: "2h04 hoje, saída prevista 16:56",
      extra: null,
    });
  });

  it("batida futura (no teste, depois de agora) não conta", () => {
    expect(calcularExpediente(ESCALA, DIA_NORMAL, m(10)).pausas).toEqual([]);
  });

  it("intervalo que se estende empurra a saída prevista", () => {
    const ex = calcularExpediente(ESCALA, DIA_NORMAL.slice(0, 2), m(13, 30));
    expect(ex.estado).toBe("intervalo");
    expect(ex.intervaloDesde).toBe(m(12, 4));
    expect(ex.saidaPrevista).toBe(m(7, 56) + 8 * 60 + 86);
    expect(textosDoExpediente(ex, ESCALA).status).toBe("No intervalo desde 12:04");
  });

  it("de volta do intervalo: saída prevista pelo intervalo feito", () => {
    const ex = calcularExpediente(ESCALA, DIA_NORMAL.slice(0, 3), m(15));
    expect(ex.saidaPrevista).toBe(m(7, 56) + 8 * 60 + 58);
    expect(textosDoExpediente(ex, ESCALA).status).toBe("De volta do intervalo às 13:02");
  });

  it("dia encerrado dentro da tolerância não tem hora extra", () => {
    const ex = calcularExpediente(ESCALA, DIA_NORMAL, m(20));
    expect(ex.estado).toBe("encerrado");
    expect(ex.trabalhadoMin).toBe(8 * 60 + 7);
    expect(ex.extraMin).toBe(0);
    expect(textosDoExpediente(ex, ESCALA)).toEqual({ status: "Dia encerrado às 17:01", resumo: "8h07 trabalhadas", extra: null });
  });

  it("acima da tolerância vira hora extra", () => {
    const batidas = [...DIA_NORMAL.slice(0, 3), { tipo: "saida" as const, minuto: m(18, 25) }];
    const ex = calcularExpediente(ESCALA, batidas, m(20));
    expect(ex.extraMin).toBe(91);
    expect(textosDoExpediente(ex, ESCALA).extra).toBe("+1h31 além da jornada");
  });

  it("eixo com meia hora de folga e acompanhando o agora enquanto aberto", () => {
    const ex = calcularExpediente(ESCALA, [{ tipo: "entrada", minuto: m(8) }], m(19));
    expect(ex.eixo).toEqual([m(7, 30), m(19, 30)]);
  });

  it("escala só com horas do dia: sem eixo antes da entrada, conta pela entrada batida depois", () => {
    const soHoras: EscalaDoDia = { entrada: null, saida: null, descansos: [], horasDia: 8, toleranciaMin: 10 };
    const antes = calcularExpediente(soHoras, [], m(9));
    expect(antes.eixo).toBeNull();
    expect(antes.saidaPrevista).toBeNull();
    expect(antes.semEntrada).toBe(false);
    expect(textosDoExpediente(antes, soHoras)).toEqual({ status: "Seu expediente hoje", resumo: "Jornada de 8h00", extra: null });
    const depois = calcularExpediente(soHoras, [{ tipo: "entrada", minuto: m(9) }], m(10));
    expect(depois.saidaPrevista).toBe(m(17));
    expect(depois.eixo).toEqual([m(8, 30), m(17, 30)]);
    expect(textosDoExpediente(depois, soHoras).resumo).toBe("1h00 hoje, saída prevista 17:00");
  });

  it("batida fora de ordem é ignorada (mesma máquina do ponto)", () => {
    const ex = calcularExpediente(ESCALA, [{ tipo: "saida", minuto: m(9) }], m(10));
    expect(ex.estado).toBe("antes");
  });
});
