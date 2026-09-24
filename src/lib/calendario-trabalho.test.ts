import { describe, expect, it } from "vitest";
import {
  criarCalendario,
  diaUtilAnterior,
  diasOcupados,
  diasUteisEntre,
  ehDiaUtil,
  fimPorDuracao,
  inicioPorDuracao,
  proximoDiaUtil,
  somarDiasUteis,
} from "./calendario-trabalho";

// Referências de 2026 usadas nos testes (conferidas no calendário):
//   2026-09-07 segunda (Independência, feriado)  2026-09-11 sexta
//   2026-09-12 sábado  2026-09-13 domingo        2026-09-14 segunda
const cal = criarCalendario();
const comFeriado = criarCalendario({ feriados: ["2026-09-07"] });

describe("dia útil", () => {
  it("conta segunda a sexta e ignora o fim de semana", () => {
    expect(ehDiaUtil("2026-09-11", cal)).toBe(true); // sexta
    expect(ehDiaUtil("2026-09-12", cal)).toBe(false); // sábado
    expect(ehDiaUtil("2026-09-13", cal)).toBe(false); // domingo
    expect(ehDiaUtil("2026-09-14", cal)).toBe(true); // segunda
  });

  it("tira o feriado mesmo caindo em dia de semana", () => {
    expect(ehDiaUtil("2026-09-07", cal)).toBe(true); // segunda, sem feriado cadastrado
    expect(ehDiaUtil("2026-09-07", comFeriado)).toBe(false); // mesma segunda, agora feriado
  });

  it("aceita calendário com sábado, para a obra que trabalha aos sábados", () => {
    const comSabado = criarCalendario({ diasSemana: [1, 2, 3, 4, 5, 6] });
    expect(ehDiaUtil("2026-09-12", comSabado)).toBe(true);
    expect(ehDiaUtil("2026-09-13", comSabado)).toBe(false); // domingo segue fora
  });
});

describe("normalização", () => {
  it("devolve o próprio dia quando já é útil", () => {
    expect(proximoDiaUtil("2026-09-11", cal)).toBe("2026-09-11");
    expect(diaUtilAnterior("2026-09-11", cal)).toBe("2026-09-11");
  });

  it("pula o fim de semana para frente e para trás", () => {
    expect(proximoDiaUtil("2026-09-12", cal)).toBe("2026-09-14"); // sábado → segunda
    expect(diaUtilAnterior("2026-09-13", cal)).toBe("2026-09-11"); // domingo → sexta
  });

  it("pula feriado colado no fim de semana", () => {
    // 05/09 sábado, 06/09 domingo, 07/09 feriado → o próximo útil é 08/09 (terça).
    expect(proximoDiaUtil("2026-09-05", comFeriado)).toBe("2026-09-08");
  });
});

describe("somarDiasUteis", () => {
  it("atravessa o fim de semana", () => {
    // Sexta + 1 dia útil = segunda.
    expect(somarDiasUteis("2026-09-11", 1, cal)).toBe("2026-09-14");
  });

  it("atravessa o feriado", () => {
    // Sexta 04/09 + 1 dia útil: 07/09 é feriado, então cai em 08/09.
    expect(somarDiasUteis("2026-09-04", 1, comFeriado)).toBe("2026-09-08");
  });

  it("anda para trás com número negativo", () => {
    expect(somarDiasUteis("2026-09-14", -1, cal)).toBe("2026-09-11");
  });

  it("normaliza a partida antes de contar", () => {
    // Partindo do sábado, 1 dia útil conta a partir da segunda → terça.
    expect(somarDiasUteis("2026-09-12", 1, cal)).toBe("2026-09-15");
    // Para trás, partindo do sábado, normaliza para a sexta → quinta.
    expect(somarDiasUteis("2026-09-12", -1, cal)).toBe("2026-09-10");
  });

  it("com zero apenas normaliza, na direção pedida", () => {
    expect(somarDiasUteis("2026-09-12", 0, cal)).toBe("2026-09-14");
  });

  it("recusa fração — dia útil é contagem inteira", () => {
    expect(() => somarDiasUteis("2026-09-14", 1.5, cal)).toThrow(/inteiro/i);
  });
});

describe("diasUteisEntre (inclusivo nas duas pontas)", () => {
  it("conta uma semana cheia como 5", () => {
    expect(diasUteisEntre("2026-09-14", "2026-09-18", cal)).toBe(5);
  });

  it("conta o mesmo dia como 1", () => {
    expect(diasUteisEntre("2026-09-14", "2026-09-14", cal)).toBe(1);
  });

  it("não conta as pontas não-úteis", () => {
    // Sábado a domingo da semana seguinte: só os 5 dias úteis do meio.
    expect(diasUteisEntre("2026-09-12", "2026-09-20", cal)).toBe(5);
  });

  it("desconta o feriado", () => {
    expect(diasUteisEntre("2026-09-07", "2026-09-11", cal)).toBe(5);
    expect(diasUteisEntre("2026-09-07", "2026-09-11", comFeriado)).toBe(4);
  });

  it("devolve 0 quando o fim vem antes do início", () => {
    expect(diasUteisEntre("2026-09-18", "2026-09-14", cal)).toBe(0);
  });
});

describe("diasOcupados", () => {
  it("marco não ocupa dia nenhum", () => {
    expect(diasOcupados(0)).toBe(0);
  });

  it("fração ocupa o dia inteiro — meio dia de trabalho ainda gasta um dia de calendário", () => {
    expect(diasOcupados(0.5)).toBe(1);
    expect(diasOcupados(2.5)).toBe(3);
  });

  it("inteiro passa direto", () => {
    expect(diasOcupados(5)).toBe(5);
  });

  it("recusa duração negativa", () => {
    expect(() => diasOcupados(-1)).toThrow(/inválida/i);
  });
});

describe("fimPorDuracao (duração INCLUSIVA)", () => {
  it("5 dias começando na segunda termina na sexta, não no sábado", () => {
    expect(fimPorDuracao("2026-09-14", 5, cal)).toBe("2026-09-18");
  });

  it("1 dia termina no próprio dia", () => {
    expect(fimPorDuracao("2026-09-14", 1, cal)).toBe("2026-09-14");
  });

  it("marco termina no dia em que começa", () => {
    expect(fimPorDuracao("2026-09-14", 0, cal)).toBe("2026-09-14");
  });

  it("empurra o início para o dia útil quando cai em fim de semana", () => {
    // Começar no sábado significa começar na segunda: 1 dia termina na segunda.
    expect(fimPorDuracao("2026-09-12", 1, cal)).toBe("2026-09-14");
  });

  it("atravessa o feriado do meio", () => {
    // 5 dias a partir de 07/09 com feriado no dia 07: 08,09,10,11,14.
    expect(fimPorDuracao("2026-09-07", 5, comFeriado)).toBe("2026-09-14");
  });

  it("10 dias atravessam dois fins de semana", () => {
    expect(fimPorDuracao("2026-09-14", 10, cal)).toBe("2026-09-25");
  });
});

describe("inicioPorDuracao (passe de volta)", () => {
  it("espelha fimPorDuracao", () => {
    for (const duracao of [1, 2, 5, 10, 21]) {
      const fim = fimPorDuracao("2026-09-14", duracao, cal);
      expect(inicioPorDuracao(fim, duracao, cal)).toBe("2026-09-14");
    }
  });

  it("espelha mesmo com feriado no caminho", () => {
    const fim = fimPorDuracao("2026-09-08", 5, comFeriado);
    expect(inicioPorDuracao(fim, 5, comFeriado)).toBe("2026-09-08");
  });

  it("marco começa no dia em que termina", () => {
    expect(inicioPorDuracao("2026-09-14", 0, cal)).toBe("2026-09-14");
  });
});

describe("guardas", () => {
  it("recusa data fora do formato", () => {
    expect(() => ehDiaUtil("14/09/2026", cal)).toThrow(/YYYY-MM-DD/);
    expect(() => ehDiaUtil("", cal)).toThrow(/YYYY-MM-DD/);
  });

  it("recusa data que o Date.UTC aceitaria rolando o mês em silêncio", () => {
    // Sem a checagem da volta, 2026-13-01 viraria 2027-01-01 e o cronograma sairia
    // um ano deslocado sem erro nenhum.
    expect(() => ehDiaUtil("2026-13-01", cal)).toThrow(/inexistente/i);
    expect(() => ehDiaUtil("2026-02-30", cal)).toThrow(/inexistente/i);
    expect(() => ehDiaUtil("2026-00-10", cal)).toThrow(/inexistente/i);
  });

  it("aceita 29 de fevereiro em ano bissexto", () => {
    expect(() => ehDiaUtil("2028-02-29", cal)).not.toThrow();
    expect(() => ehDiaUtil("2026-02-29", cal)).toThrow(/inexistente/i);
  });

  it("recusa calendário sem nenhum dia útil, em vez de entrar em laço", () => {
    expect(() => criarCalendario({ diasSemana: [] })).toThrow(/sem nenhum dia útil/i);
  });

  it("recusa feriado fora do formato na montagem, não na primeira conta", () => {
    expect(() => criarCalendario({ feriados: ["07/09/2026"] })).toThrow(/YYYY-MM-DD/);
  });

  it("falha com mensagem clara quando o calendário não tem dia útil alcançável", () => {
    // Só domingos úteis, e todos os domingos de um intervalo longo como feriado seria
    // impraticável de montar; o caso realista é o intervalo grande demais.
    expect(() => diasUteisEntre("1990-01-01", "2090-01-01", cal)).toThrow(/grande demais/i);
  });
});
