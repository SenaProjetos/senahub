import { describe, expect, it } from "vitest";
import { canalDoPush, incluirMensagem, mesclarCanais, mesclarMensagens } from "./sincronia";

const msg = (id: string, minuto: number, conteudo = id) => ({
  id,
  conteudo,
  createdAt: new Date(Date.UTC(2026, 8, 28, 10, minuto)).toISOString(),
});

describe("incluirMensagem", () => {
  it("acrescenta ao fim quando é a mais nova", () => {
    const r = incluirMensagem([msg("a", 1)], msg("b", 2));
    expect(r.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("não duplica a mesma mensagem vinda do socket e do retorno do envio", () => {
    const atuais = [msg("a", 1), msg("b", 2, "com recibos")];
    const r = incluirMensagem(atuais, msg("b", 2, "sem recibos"));
    expect(r).toBe(atuais);
    expect(r[1].conteudo).toBe("com recibos");
  });

  it("encaixa em ordem quando chega fora de ordem", () => {
    const r = incluirMensagem([msg("a", 1), msg("c", 3)], msg("b", 2));
    expect(r.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });
});

describe("mesclarMensagens", () => {
  it("traz as mensagens perdidas enquanto o socket estava fora", () => {
    const r = mesclarMensagens([msg("a", 1), msg("b", 2)], [msg("a", 1), msg("b", 2), msg("c", 3)], false);
    expect(r.substituiu).toBe(false);
    expect(r.mensagens.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("a versão do servidor vence (edição/exclusão/reação perdidas)", () => {
    const r = mesclarMensagens([msg("a", 1, "antes")], [msg("a", 1, "editada")], false);
    expect(r.mensagens[0].conteudo).toBe("editada");
  });

  it("mantém o histórico antigo já paginado que não veio na página nova", () => {
    const atuais = [msg("velha", 0), msg("a", 1)];
    const r = mesclarMensagens(atuais, [msg("a", 1), msg("b", 2)], true);
    expect(r.substituiu).toBe(false);
    expect(r.mensagens.map((m) => m.id)).toEqual(["velha", "a", "b"]);
  });

  it("substitui quando caiu mais de uma página (evita buraco no meio da conversa)", () => {
    const r = mesclarMensagens([msg("a", 1)], [msg("x", 50), msg("y", 51)], true);
    expect(r.substituiu).toBe(true);
    expect(r.mensagens.map((m) => m.id)).toEqual(["x", "y"]);
  });

  it("sem sobreposição mas sem histórico mais antigo: junta (não há buraco)", () => {
    const r = mesclarMensagens([msg("a", 1)], [msg("b", 2)], false);
    expect(r.substituiu).toBe(false);
    expect(r.mensagens.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("tela vazia recebe a página inteira", () => {
    const r = mesclarMensagens([], [msg("a", 1)], true);
    expect(r.mensagens.map((m) => m.id)).toEqual(["a"]);
  });

  it("desempata pelo id quando o horário é igual (mesma regra do servidor)", () => {
    const r = mesclarMensagens([msg("b", 1)], [msg("a", 1), msg("b", 1)], false);
    expect(r.mensagens.map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("mesclarCanais", () => {
  const canal = (id: string, naoLidas: number, nome = id) => ({ id, naoLidas, nome });

  it("atualiza não lidas dos canais que receberam mensagem enquanto o socket estava fora", () => {
    const r = mesclarCanais([canal("a", 0), canal("b", 0)], [canal("a", 0), canal("b", 3)], null);
    expect(r).toEqual([canal("a", 0), canal("b", 3)]);
  });

  it("o canal aberto fica zerado (está sendo lido)", () => {
    const r = mesclarCanais([canal("a", 0)], [canal("a", 2)], "a");
    expect(r[0].naoLidas).toBe(0);
  });

  it("mesma lista (mesmos objetos) devolve a mesma referência — sem re-render", () => {
    const atuais = [canal("a", 0), canal("b", 1)];
    expect(mesclarCanais(atuais, atuais, null)).toBe(atuais);
  });

  it("lista guardada do chat minimizado: lidas voltam a zero e conversa nova aparece", () => {
    const guardada = [canal("a", 4), canal("b", 2)];
    const doServidor = [canal("a", 0), canal("b", 0), canal("dm-nova", 1)];
    const r = mesclarCanais(guardada, doServidor, null);
    expect(r.map((c) => [c.id, c.naoLidas])).toEqual([["a", 0], ["b", 0], ["dm-nova", 1]]);
  });

  it("acrescenta canal novo e não remove os ausentes", () => {
    const r = mesclarCanais([canal("a", 0), canal("sumiu", 0)], [canal("a", 0), canal("novo", 1)], null);
    expect(r.map((c) => c.id)).toEqual(["a", "sumiu", "novo"]);
  });
});

describe("canalDoPush", () => {
  it("lê o canal da tag do push do chat", () => {
    expect(canalDoPush("chat-abc123")).toBe("abc123");
  });

  it("ignora push que não é do chat", () => {
    expect(canalDoPush("aviso-1")).toBeNull();
    expect(canalDoPush("chat-")).toBeNull();
    expect(canalDoPush(undefined)).toBeNull();
    expect(canalDoPush(42)).toBeNull();
  });
});
