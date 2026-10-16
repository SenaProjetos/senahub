import { describe, expect, it } from "vitest";
import type { Violacao } from "./integridade";
import {
  aplicarDispensas,
  alvoDaViolacao,
  assinaturaDaViolacao,
  detalheDaViolacao,
  dispensasObsoletas,
  ehDispensavel,
  resumoDoAviso,
  type DispensaAtiva,
  type ItemPendencia,
  type ViolacaoDispensavel,
} from "./pendencias";

type Lix = Extract<Violacao, { tipo: "publicada_com_lixeira" }>;
type Par = Extract<Violacao, { tipo: "analise_parada" }>;
type Dup = Extract<Violacao, { tipo: "duas_publicadas" }>;

const lixeira = (p: Partial<Lix> = {}): Lix => ({
  tipo: "publicada_com_lixeira",
  revisaoId: "r1",
  documentoId: "d1",
  projetoId: "p1",
  numero: 1,
  estado: "arquivado",
  qtdNaLixeira: 1,
  texto: "x",
  ...p,
});
const parada = (p: Partial<Par> = {}): Par => ({
  tipo: "analise_parada",
  revisaoId: "r2",
  documentoId: "d2",
  projetoId: "p1",
  numero: 2,
  dias: 14,
  limiteDias: 7,
  estadoEm: new Date("2026-10-01T10:00:00Z"),
  texto: "x",
  ...p,
});
const dupla = (p: Partial<Dup> = {}): Dup => ({
  tipo: "duas_publicadas",
  documentoId: "d3",
  projetoId: "p1",
  revisaoIds: ["b", "a"],
  texto: "x",
  ...p,
});
const dispensa = (v: ViolacaoDispensavel, p: Partial<DispensaAtiva> = {}): DispensaAtiva => ({
  id: "x1",
  alvoId: alvoDaViolacao(v),
  tipo: v.tipo,
  chave: assinaturaDaViolacao(v),
  motivo: "Limpeza",
  criadaPorId: "u1",
  criadaEm: new Date("2026-10-15T09:00:00Z"),
  ...p,
});

describe("alvo e assinatura", () => {
  it("o alvo é a revisão, ou o documento nas duas publicadas", () => {
    expect(alvoDaViolacao(lixeira())).toBe("r1");
    expect(alvoDaViolacao(parada())).toBe("r2");
    expect(alvoDaViolacao(dupla())).toBe("d3");
  });

  it("lixeira: muda com a quantidade de arquivos e com o estado", () => {
    expect(assinaturaDaViolacao(lixeira())).toBe("lix:1:arquivado");
    expect(assinaturaDaViolacao(lixeira({ qtdNaLixeira: 2 }))).toBe("lix:2:arquivado");
    expect(assinaturaDaViolacao(lixeira({ estado: "publicado" }))).toBe("lix:1:publicado");
  });

  it("análise parada: muda quando a revisão entra em análise de novo", () => {
    expect(assinaturaDaViolacao(parada())).toBe("par:2026-10-01T10:00:00.000Z");
    expect(assinaturaDaViolacao(parada({ estadoEm: new Date("2026-10-09T10:00:00Z") }))).not.toBe(assinaturaDaViolacao(parada()));
  });

  it("duas publicadas: não depende da ordem das revisões", () => {
    expect(assinaturaDaViolacao(dupla())).toBe("dup:a,b");
    expect(assinaturaDaViolacao(dupla({ revisaoIds: ["a", "b"] }))).toBe("dup:a,b");
  });

  it("I5 (controle fora de publicada) nunca é dispensável", () => {
    const i5: Violacao = { tipo: "controle_fora_de_publicada", revisaoId: "r", controleId: "c", projetoId: "p", texto: "x" };
    expect(ehDispensavel(i5)).toBe(false);
    expect(ehDispensavel(lixeira())).toBe(true);
    expect(ehDispensavel(parada())).toBe(true);
    expect(ehDispensavel(dupla())).toBe(true);
  });
});

describe("detalheDaViolacao", () => {
  it("lixeira no singular e no plural; revisão vigente é dita", () => {
    expect(detalheDaViolacao(lixeira())).toEqual({ detalhe: "1 arquivo na lixeira", complemento: null });
    expect(detalheDaViolacao(lixeira({ qtdNaLixeira: 3, estado: "publicado" }))).toEqual({
      detalhe: "3 arquivos na lixeira",
      complemento: "revisão vigente",
    });
  });
  it("análise parada traz dias e limite; duas publicadas traz a contagem", () => {
    expect(detalheDaViolacao(parada())).toEqual({ detalhe: "Em análise há 14 dias", complemento: "limite do projeto: 7 dias" });
    expect(detalheDaViolacao(dupla())).toEqual({ detalhe: "2 revisões publicadas", complemento: "o índice do banco devia impedir" });
  });
});

describe("aplicarDispensas", () => {
  it("sem dispensa: tudo aberto; I5 fica de fora", () => {
    const i5: Violacao = { tipo: "controle_fora_de_publicada", revisaoId: "r", controleId: "c", projetoId: "p", texto: "x" };
    const r = aplicarDispensas([lixeira(), parada(), i5], []);
    expect(r.abertas.map((i) => i.violacao.tipo)).toEqual(["publicada_com_lixeira", "analise_parada"]);
    expect(r.dispensadas).toEqual([]);
  });

  it("dispensa com a mesma assinatura esconde a pendência", () => {
    const v = lixeira();
    const r = aplicarDispensas([v, parada()], [dispensa(v)]);
    expect(r.abertas.map((i) => i.alvoId)).toEqual(["r2"]);
    expect(r.dispensadas).toHaveLength(1);
    expect(r.dispensadas[0]).toMatchObject({ alvoId: "r1", chave: "lix:1:arquivado" });
    expect(r.dispensadas[0].dispensa?.motivo).toBe("Limpeza");
  });

  it("estado mudou depois da dispensa: a pendência reaparece como aberta", () => {
    const antes = lixeira();
    const agora = lixeira({ qtdNaLixeira: 2 });
    const r = aplicarDispensas([agora], [dispensa(antes)]);
    expect(r.abertas).toHaveLength(1);
    expect(r.abertas[0].dispensa).toBeNull();
    expect(r.dispensadas).toEqual([]);
  });

  it("dispensa de outro tipo no mesmo alvo não vale", () => {
    const v = lixeira();
    const r = aplicarDispensas([v], [dispensa(v, { tipo: "analise_parada" })]);
    expect(r.abertas).toHaveLength(1);
  });
});

describe("dispensasObsoletas", () => {
  it("encerra a dispensa cuja pendência sumiu ou mudou de assinatura", () => {
    const v = lixeira();
    const sumiu = dispensa(parada(), { id: "sumiu" });
    const mudou = dispensa(lixeira({ qtdNaLixeira: 5 }), { id: "mudou" });
    const viva = dispensa(v, { id: "viva" });
    const r = dispensasObsoletas([v], [sumiu, mudou, viva]);
    expect(r.map((d) => d.id).sort()).toEqual(["mudou", "sumiu"]);
  });
});

describe("resumoDoAviso", () => {
  const item = (v: ViolacaoDispensavel): ItemPendencia => ({ violacao: v, alvoId: alvoDaViolacao(v), chave: assinaturaDaViolacao(v), dispensa: null });

  it("sem aberta e sem correção: nada a avisar", () => {
    expect(resumoDoAviso({ abertas: [], corrigidas: 0 })).toBeNull();
  });
  it("conta por tipo", () => {
    const abertas = [item(lixeira()), item(lixeira({ revisaoId: "r9" })), item(parada()), item(dupla())];
    expect(resumoDoAviso({ abertas, corrigidas: 0 })).toBe("4 pendências abertas (2 na lixeira, 1 parada, 1 duplicada).");
  });
  it("singular e correção automática abrem o texto", () => {
    expect(resumoDoAviso({ abertas: [item(lixeira())], corrigidas: 2 })).toBe(
      "2 liberações indevidas revogadas automaticamente. 1 pendência aberta (1 na lixeira).",
    );
  });
  it("só correção", () => {
    expect(resumoDoAviso({ abertas: [], corrigidas: 1 })).toBe("1 liberação indevida revogada automaticamente.");
  });
});
