import { describe, expect, it } from "vitest";
import {
  HASH_GENESE,
  LIMITE_USER_AGENT,
  encadear,
  hashEvento,
  normalizarUserAgent,
  verificarCadeia,
  type EventoAssinaturaBase,
  type EventoAssinaturaEncadeado,
} from "./cadeia";

function base(over: Partial<EventoAssinaturaBase> = {}): EventoAssinaturaBase {
  return {
    sequencia: 1,
    tipo: "visualizado",
    ocorridoEm: new Date("2026-08-26T12:00:00.000Z"),
    ator: "user-1",
    ip: "203.0.113.10",
    userAgent: "Mozilla/5.0",
    hashArquivo: null,
    ...over,
  };
}

/** Cadeia válida de 3 eventos, o caminho feliz do fluxo real (viu → autenticou → assinou). */
function cadeiaDeTres(): EventoAssinaturaEncadeado[] {
  const e1 = encadear(base({ sequencia: 1, tipo: "visualizado" }), null);
  const e2 = encadear(base({ sequencia: 2, tipo: "autenticado" }), e1);
  const e3 = encadear(base({ sequencia: 3, tipo: "assinado", hashArquivo: "abc123" }), e2);
  return [e1, e2, e3];
}

describe("hashEvento", () => {
  it("é determinístico: mesma entrada, mesmo hash", () => {
    expect(hashEvento(base(), HASH_GENESE)).toBe(hashEvento(base(), HASH_GENESE));
  });

  it("muda se qualquer campo do evento mudar", () => {
    const original = hashEvento(base(), HASH_GENESE);
    expect(hashEvento(base({ ip: "198.51.100.1" }), HASH_GENESE)).not.toBe(original);
    expect(hashEvento(base({ tipo: "assinado" }), HASH_GENESE)).not.toBe(original);
    expect(hashEvento(base({ ator: "user-2" }), HASH_GENESE)).not.toBe(original);
    expect(hashEvento(base({ sequencia: 2 }), HASH_GENESE)).not.toBe(original);
    expect(hashEvento(base({ ocorridoEm: new Date("2026-08-26T12:00:00.001Z") }), HASH_GENESE)).not.toBe(original);
  });

  it("muda se o hash anterior mudar — é isso que amarra a cadeia", () => {
    expect(hashEvento(base(), HASH_GENESE)).not.toBe(hashEvento(base(), "f".repeat(64)));
  });

  it("não deixa forjar evento por colisão de delimitador (user-agent é do signatário)", () => {
    // Com `${ip}|${userAgent}` estes dois seriam a MESMA string ("1.2.3.4|x|y") e teriam o mesmo
    // hash — dois eventos diferentes, prova indistinguível. É o ataque que o prefixo de tamanho
    // fecha, e o user-agent chega de quem assina (caminho externo, Fase F).
    const honesto = hashEvento(base({ ip: "1.2.3.4", userAgent: "x|y" }), HASH_GENESE);
    const forjado = hashEvento(base({ ip: "1.2.3.4|x", userAgent: "y" }), HASH_GENESE);
    expect(forjado).not.toBe(honesto);
  });

  it("distingue nulo de string vazia", () => {
    expect(hashEvento(base({ ip: null }), HASH_GENESE)).not.toBe(hashEvento(base({ ip: "" }), HASH_GENESE));
  });

  it("hasheia o user-agent JÁ truncado — o guardado e o hasheado não podem divergir", () => {
    const longo = "U".repeat(LIMITE_USER_AGENT + 100);
    const truncado = longo.slice(0, LIMITE_USER_AGENT);
    expect(hashEvento(base({ userAgent: longo }), HASH_GENESE)).toBe(
      hashEvento(base({ userAgent: truncado }), HASH_GENESE),
    );
  });
});

describe("normalizarUserAgent", () => {
  it("corta no limite e preserva nulo", () => {
    expect(normalizarUserAgent("U".repeat(600))).toHaveLength(LIMITE_USER_AGENT);
    expect(normalizarUserAgent(null)).toBeNull();
    expect(normalizarUserAgent("curto")).toBe("curto");
  });
});

describe("encadear", () => {
  it("o primeiro evento aponta para a gênese", () => {
    const e1 = encadear(base(), null);
    expect(e1.hashAnterior).toBe(HASH_GENESE);
    expect(e1.hash).toBe(hashEvento(base(), HASH_GENESE));
  });

  it("o seguinte aponta para o hash do anterior", () => {
    const e1 = encadear(base({ sequencia: 1 }), null);
    const e2 = encadear(base({ sequencia: 2 }), e1);
    expect(e2.hashAnterior).toBe(e1.hash);
  });
});

describe("verificarCadeia", () => {
  it("aceita cadeia vazia — documento sem evento não tem o que quebrar", () => {
    expect(verificarCadeia([])).toEqual({ integra: true });
  });

  it("aceita a cadeia íntegra", () => {
    expect(verificarCadeia(cadeiaDeTres())).toEqual({ integra: true });
  });

  it("aceita fora de ordem — ordena pela sequência antes de conferir", () => {
    const [e1, e2, e3] = cadeiaDeTres();
    expect(verificarCadeia([e3!, e1!, e2!])).toEqual({ integra: true });
  });

  it("acusa adulteração de campo E aponta o evento exato", () => {
    const cadeia = cadeiaDeTres();
    // Trocar o IP do evento do meio sem recalcular nada — a edição pontual de banco.
    cadeia[1] = { ...cadeia[1]!, ip: "198.51.100.99" };
    expect(verificarCadeia(cadeia)).toEqual({ integra: false, sequencia: 2, motivo: "hash_invalido" });
  });

  it("acusa evento removido do meio (os que sobram continuam encadeados entre si)", () => {
    const [e1, , e3] = cadeiaDeTres();
    expect(verificarCadeia([e1!, e3!])).toEqual({ integra: false, sequencia: 2, motivo: "sequencia_faltando" });
  });

  it("acusa o último evento apagado", () => {
    const [e1, e2] = cadeiaDeTres();
    // Sem conferir continuidade da numeração isto passaria batido: e1→e2 seguem ligados.
    expect(verificarCadeia([e1!, e2!])).toEqual({ integra: true });
    // …por isso quem chama compara a contagem com o que espera. Já com o do MEIO apagado, pega:
    expect(verificarCadeia([e1!, cadeiaDeTres()[2]!]).integra).toBe(false);
  });

  it("acusa eventos reordenados (troca de sequência entre dois)", () => {
    const [e1, e2, e3] = cadeiaDeTres();
    const trocado2 = { ...e3!, sequencia: 2 };
    const trocado3 = { ...e2!, sequencia: 3 };
    expect(verificarCadeia([e1!, trocado2, trocado3])).toEqual({
      integra: false,
      sequencia: 2,
      motivo: "elo_quebrado",
    });
  });

  it("acusa cadeia bifurcada (mesma sequência duas vezes)", () => {
    const [e1, e2] = cadeiaDeTres();
    const concorrente = encadear(base({ sequencia: 2, tipo: "assinado", ator: "user-9" }), e1!);
    expect(verificarCadeia([e1!, e2!, concorrente])).toEqual({
      integra: false,
      sequencia: 2,
      motivo: "sequencia_duplicada",
    });
  });

  it("acusa elo trocado por outro hash válido de outro evento", () => {
    const cadeia = cadeiaDeTres();
    // Apontar o 3º direto para o 1º, pulando o 2º — cada hash é válido isolado, o elo é que mente.
    cadeia[2] = encadear(base({ sequencia: 3, tipo: "assinado", hashArquivo: "abc123" }), cadeia[0]!);
    expect(verificarCadeia(cadeia)).toEqual({ integra: false, sequencia: 3, motivo: "elo_quebrado" });
  });

  it("não considera íntegra uma cadeia que não começa em 1", () => {
    const e2 = encadear(base({ sequencia: 2 }), null);
    expect(verificarCadeia([e2])).toEqual({ integra: false, sequencia: 1, motivo: "sequencia_faltando" });
  });
});
