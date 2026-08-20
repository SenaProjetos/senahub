import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  diaLocal,
  diaSemanaLocal,
  diasSemInteracao,
  ehFimDeSemana,
  followUpAtrasado,
  frescorDe,
  proximaAcaoFutura,
  proximaAcaoHoje,
} from "./frescor";

/**
 * Recife é UTC-3 fixo. Um instante UTC às 02:00 ainda é o DIA ANTERIOR lá — é essa a armadilha
 * que estes testes existem para travar, e a razão de nada aqui usar `getDate()` direto.
 */
const utc = (iso: string) => new Date(iso);

describe("virada de dia no fuso de Recife (UTC-3)", () => {
  it("23h59 local ainda é o mesmo dia", () => {
    // 2026-08-20 23:59 em Recife = 2026-08-21 02:59 UTC.
    expect(diaLocal(utc("2026-08-21T02:59:00Z"))).toBe("2026-08-20");
  });

  it("00h01 local já é o dia seguinte", () => {
    // 2026-08-21 00:01 em Recife = 2026-08-21 03:01 UTC.
    expect(diaLocal(utc("2026-08-21T03:01:00Z"))).toBe("2026-08-21");
  });

  it("meia-noite UTC ainda é o dia anterior em Recife — o erro clássico", () => {
    // Quem usasse toISOString() aqui leria 2026-08-21 e erraria o dia por completo.
    expect(diaLocal(utc("2026-08-21T00:00:00Z"))).toBe("2026-08-20");
  });
});

describe("fim de semana no fuso local", () => {
  it("sábado e domingo são fim de semana", () => {
    expect(ehFimDeSemana(utc("2026-08-22T15:00:00Z"))).toBe(true); // sábado
    expect(ehFimDeSemana(utc("2026-08-23T15:00:00Z"))).toBe(true); // domingo
  });

  it("segunda a sexta não são", () => {
    for (const dia of ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21"]) {
      expect(ehFimDeSemana(utc(`${dia}T15:00:00Z`))).toBe(false);
    }
  });

  it("sábado 23h59 local ainda é fim de semana, mesmo já sendo domingo em UTC", () => {
    // 2026-08-22 23:59 Recife = 2026-08-23 02:59 UTC. Em UTC seria domingo — também fim de
    // semana, então o teste que importa é o oposto:
    expect(diaSemanaLocal(utc("2026-08-23T02:59:00Z"))).toBe(6); // sábado local
  });

  it("segunda 00h01 local é dia útil, embora ainda seja domingo em UTC", () => {
    // 2026-08-24 00:01 Recife = 2026-08-24 03:01 UTC — sem armadilha aqui; a inversa:
    // 2026-08-24 (segunda) 00:01 local vem de 03:01 UTC. Já domingo 23h local = segunda 02h UTC.
    expect(ehFimDeSemana(utc("2026-08-24T02:00:00Z"))).toBe(true); // ainda domingo local
    expect(ehFimDeSemana(utc("2026-08-24T03:01:00Z"))).toBe(false); // já segunda local
  });
});

describe("diasSemInteracao", () => {
  const agora = utc("2026-08-20T12:00:00Z"); // 09h de 2026-08-20 em Recife

  it("nunca houve interação devolve null, não zero", () => {
    // "Nunca falamos" e "falamos hoje" são estados diferentes; zero esconderia quem nunca foi
    // contatado justamente na lista feita para achar essas pessoas.
    expect(diasSemInteracao(null, agora)).toBeNull();
    expect(diasSemInteracao(undefined, agora)).toBeNull();
  });

  it("interação hoje é zero dia", () => {
    expect(diasSemInteracao(utc("2026-08-20T11:00:00Z"), agora)).toBe(0);
  });

  it("conta dias de CALENDÁRIO, não blocos de 24h", () => {
    // Interação às 23h de ontem (02h UTC de hoje): menos de 24h atrás, mas é "1 dia" para quem
    // vende — e é assim que o número bate com a memória da pessoa.
    expect(diasSemInteracao(utc("2026-08-20T02:00:00Z"), agora)).toBe(1);
  });

  it("conta a distância certa em dias", () => {
    expect(diasSemInteracao(utc("2026-08-13T12:00:00Z"), agora)).toBe(7);
    expect(diasSemInteracao(utc("2026-07-21T12:00:00Z"), agora)).toBe(30);
  });
});

describe("followUpAtrasado", () => {
  const agora = utc("2026-08-20T12:00:00Z");

  it("sem data marcada nunca está atrasado", () => {
    expect(followUpAtrasado(null, agora)).toBe(false);
  });

  it("marcado para hoje ainda está no prazo — o dia inteiro conta", () => {
    expect(followUpAtrasado(utc("2026-08-20T09:00:00Z"), agora)).toBe(false);
  });

  it("marcado para hoje às 23h59 local continua no prazo às 09h", () => {
    expect(followUpAtrasado(utc("2026-08-21T02:59:00Z"), agora)).toBe(false);
  });

  it("marcado para ontem está atrasado", () => {
    expect(followUpAtrasado(utc("2026-08-19T12:00:00Z"), agora)).toBe(true);
  });

  it("marcado para amanhã não está atrasado", () => {
    expect(followUpAtrasado(utc("2026-08-21T12:00:00Z"), agora)).toBe(false);
  });
});

describe("proximaAcaoHoje / proximaAcaoFutura", () => {
  const agora = utc("2026-08-20T12:00:00Z");

  it("hoje é hoje, em qualquer hora do dia local", () => {
    expect(proximaAcaoHoje(utc("2026-08-20T03:01:00Z"), agora)).toBe(true); // 00h01 local
    expect(proximaAcaoHoje(utc("2026-08-21T02:59:00Z"), agora)).toBe(true); // 23h59 local
  });

  it("hoje não é futuro", () => {
    expect(proximaAcaoFutura(utc("2026-08-20T18:00:00Z"), agora)).toBe(false);
  });

  it("amanhã é futuro e não é hoje", () => {
    const amanha = utc("2026-08-21T12:00:00Z");
    expect(proximaAcaoFutura(amanha, agora)).toBe(true);
    expect(proximaAcaoHoje(amanha, agora)).toBe(false);
  });

  it("ontem não é nem hoje nem futuro", () => {
    const ontem = utc("2026-08-19T12:00:00Z");
    expect(proximaAcaoHoje(ontem, agora)).toBe(false);
    expect(proximaAcaoFutura(ontem, agora)).toBe(false);
  });
});

describe("frescorDe — agregado do card", () => {
  const agora = utc("2026-08-20T12:00:00Z");

  it("prospecção abandonada com follow-up vencido", () => {
    expect(
      frescorDe(
        { ultimaInteracao: utc("2026-08-05T12:00:00Z"), proximaAcaoEm: utc("2026-08-18T12:00:00Z") },
        agora,
      ),
    ).toEqual({
      diasSemInteracao: 15,
      followUpAtrasado: true,
      proximaAcaoHoje: false,
      proximaAcaoFutura: false,
    });
  });

  it("prospecção nova, sem nada registrado", () => {
    expect(frescorDe({}, agora)).toEqual({
      diasSemInteracao: null,
      followUpAtrasado: false,
      proximaAcaoHoje: false,
      proximaAcaoFutura: false,
    });
  });
});

describe("relógio injetado", () => {
  it("nenhum `new Date()` sem argumento no CÓDIGO do módulo", () => {
    // O aceite da F2.9 exige isso literalmente. Um `new Date()` solto reintroduziria a
    // dependência do relógio real e tornaria a virada de dia não-testável de novo.
    //
    // Comentários e docblocks são removidos antes da checagem: a primeira versão deste teste
    // falhou por causa do próprio docblock que EXPLICA a regra — proibir mencioná-la seria
    // castigar a documentação em vez do código.
    const fonte = readFileSync(join(process.cwd(), "src/modules/comercial/frescor.ts"), "utf8");
    const semComentarios = fonte
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(semComentarios).not.toMatch(/new Date\(\s*\)/);
    // E a checagem tem que ser capaz de pegar o caso real:
    expect("const agora = new Date();").toMatch(/new Date\(\s*\)/);
  });
});
