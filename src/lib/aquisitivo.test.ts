import { describe, it, expect } from "vitest";
import { periodosAquisitivos, resumoAquisitivo } from "./aquisitivo";

const adm = new Date("2022-01-10T00:00:00Z");

describe("periodosAquisitivos", () => {
  it("gera um período por ano completo desde a admissão", () => {
    const ps = periodosAquisitivos(adm, [], new Date("2024-06-01T00:00:00Z"));
    // períodos iniciados: 2022-01-10, 2023-01-10, 2024-01-10 = 3
    expect(ps).toHaveLength(3);
    expect(ps[0].inicio).toBe("2022-01-10");
    expect(ps[0].fim).toBe("2023-01-09");
    expect(ps[0].vencimentoGozo).toBe("2024-01-09");
  });

  it("primeiro período fica 'a_gozar' quando concluído e sem férias", () => {
    const ps = periodosAquisitivos(adm, [], new Date("2023-06-01T00:00:00Z"));
    expect(ps[0].status).toBe("a_gozar");
    expect(ps[0].diasDisponiveis).toBe(30);
  });

  it("período corrente fica 'em_aquisicao'", () => {
    const ps = periodosAquisitivos(adm, [], new Date("2022-06-01T00:00:00Z"));
    expect(ps).toHaveLength(1);
    expect(ps[0].status).toBe("em_aquisicao");
  });

  it("desconta dias de férias aprovadas gozadas na janela concessiva", () => {
    const ferias = [{ inicio: new Date("2023-03-01T00:00:00Z"), fim: new Date("2023-03-30T00:00:00Z") }]; // 30 dias
    const ps = periodosAquisitivos(adm, ferias, new Date("2024-06-01T00:00:00Z"));
    expect(ps[0].diasGozados).toBe(30);
    expect(ps[0].diasDisponiveis).toBe(0);
    expect(ps[0].status).toBe("gozado");
  });

  it("marca 'vencido' quando passou a janela e não gozou", () => {
    const ps = periodosAquisitivos(adm, [], new Date("2024-06-01T00:00:00Z"));
    // período 1 vence em 2024-01-09 → em 2024-06-01 está vencido
    expect(ps[0].status).toBe("vencido");
  });
});

describe("resumoAquisitivo", () => {
  it("soma dias disponíveis dos períodos a_gozar e aponta vencido", () => {
    const ps = periodosAquisitivos(adm, [], new Date("2023-06-01T00:00:00Z"));
    const r = resumoAquisitivo(ps);
    expect(r.diasDisponiveis).toBe(30);
    expect(r.proximoVencimento).toBe("2024-01-09");
    expect(r.temVencido).toBe(false);
  });
});
