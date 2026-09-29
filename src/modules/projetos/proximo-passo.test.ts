import { describe, expect, it } from "vitest";
import { etiquetaPagamento, proximoPasso, type EntradaProximoPasso } from "./proximo-passo";

type Upload = EntradaProximoPasso["uploads"][number];
const up = (pacote: Upload["pacote"], nome: string, validado: boolean): Upload => ({
  pacote,
  nomeArquivo: nome,
  versao: 1,
  validado,
  origem: "manual",
});

function disc(p: Partial<EntradaProximoPasso> = {}): EntradaProximoPasso {
  return {
    status: "em_andamento",
    usaPastas: false,
    aprovacaoSolicitadaEm: null,
    aprovacaoSolicitadaPorNome: null,
    exigePacoteA: true,
    exigePacoteB: false,
    qtdResponsaveis: 1,
    ehResponsavel: false,
    uploads: [],
    fasesPendentes: [],
    ...p,
  };
}
const GESTOR = { podeAprovar: true, podeEnviar: true, podeGerir: true };
const PROJETISTA = { podeAprovar: false, podeEnviar: true, podeGerir: false };

describe("proximoPasso — pacote A/B", () => {
  it("aprovada: só informa", () => {
    expect(proximoPasso(disc({ status: "aprovado" }), GESTOR)).toEqual({
      tom: "ok",
      texto: "Entrega validada · pagamento liberado.",
      acao: null,
    });
  });

  it("sem arquivo: pede o envio (só oferece o botão a quem pode enviar)", () => {
    expect(proximoPasso(disc(), GESTOR)).toMatchObject({ tom: "aviso", acao: "enviar", texto: "Envie os arquivos da entrega para poder aprovar." });
    expect(proximoPasso(disc(), { ...PROJETISTA, podeEnviar: false })?.acao).toBeNull();
  });

  it("falta pacote exigido: diz qual", () => {
    const d = disc({ exigePacoteB: true, uploads: [up("A", "4001.pdf", true)] });
    expect(proximoPasso(d, GESTOR)?.texto).toBe("Para aprovar, falta enviar: Backup do modelo.");
  });

  it("arquivos por validar: leva para a lista de arquivos", () => {
    const d = disc({ uploads: [up("A", "1.pdf", true), up("A", "2.pdf", false), up("A", "3.pdf", false)] });
    expect(proximoPasso(d, GESTOR)).toMatchObject({
      tom: "aviso",
      acao: "validar",
      texto: "1 de 3 arquivos validados — valide os 2 restantes para aprovar.",
    });
  });

  it("pronta: o gestor aprova; os demais esperam", () => {
    const d = disc({ uploads: [up("A", "1.pdf", true), up("A", "2.pdf", true)] });
    expect(proximoPasso(d, GESTOR)).toEqual({ tom: "pronto", texto: "2 arquivos validados — pronta para aprovação.", acao: "aprovar" });
    expect(proximoPasso(d, PROJETISTA)).toMatchObject({ tom: "pronto", acao: null });
  });

  it("tudo validado mas sem responsável: pede responsável", () => {
    const d = disc({ qtdResponsaveis: 0, uploads: [up("A", "1.pdf", true)] });
    expect(proximoPasso(d, GESTOR)).toMatchObject({ acao: "responsavel", texto: "Defina ao menos um responsável para poder aprovar." });
  });

  it("fase entregue vem antes do resto, para quem aprova", () => {
    const fases = [{ id: "f1", sigla: "AP", nomeFase: "Anteprojeto", percentual: 30 }];
    const d = disc({ fasesPendentes: fases });
    expect(proximoPasso(d, GESTOR)).toEqual({
      tom: "fase",
      texto: "Fase AP entregue (30%) — aguardando aprovação.",
      acao: "aprovar_fase",
      fases,
    });
    // Quem não aprova segue vendo o que falta.
    expect(proximoPasso(d, PROJETISTA)?.tom).toBe("aviso");
  });
});

describe("proximoPasso — aprovação/laudo (pastas)", () => {
  const pastas = { usaPastas: true };

  it("marcação pendente: o gestor confirma", () => {
    const d = disc({ ...pastas, status: "entregue", aprovacaoSolicitadaEm: "2026-09-20", aprovacaoSolicitadaPorNome: "Ana Silva" });
    expect(proximoPasso(d, GESTOR)).toEqual({
      tom: "confirmar",
      texto: "Ana Silva marcou o projeto como aprovado — falta a sua confirmação.",
      acao: "confirmar",
    });
    expect(proximoPasso(d, PROJETISTA)?.acao).toBeNull();
  });

  it("o responsável marca o projeto como aprovado", () => {
    expect(proximoPasso(disc({ ...pastas, ehResponsavel: true }), PROJETISTA)?.acao).toBe("solicitar");
  });

  it("sem responsável, ou ainda aguardando: explica de quem é a vez", () => {
    expect(proximoPasso(disc({ ...pastas, qtdResponsaveis: 0 }), GESTOR)?.acao).toBe("responsavel");
    expect(proximoPasso(disc({ ...pastas, status: "aguardando" }), GESTOR)?.texto).toMatch(/em andamento/);
    expect(proximoPasso(disc({ ...pastas }), GESTOR)?.texto).toBe("Aguardando o responsável marcar o projeto como aprovado.");
  });
});

describe("etiquetaPagamento", () => {
  it("pagamento já liberado, fases pagas, ou nada", () => {
    expect(etiquetaPagamento({ status: "entregue", pagamentoLiberado: true, fasesLiberadas: null })?.texto).toBe("Pagamento já liberado");
    expect(etiquetaPagamento({ status: "entregue", pagamentoLiberado: false, fasesLiberadas: { liberadas: 1, total: 3 } })?.texto).toBe(
      "Pago 1 de 3 fases",
    );
    expect(etiquetaPagamento({ status: "entregue", pagamentoLiberado: false, fasesLiberadas: { liberadas: 0, total: 3 } })).toBeNull();
    // Aprovada: o aviso do card já diz "pagamento liberado".
    expect(etiquetaPagamento({ status: "aprovado", pagamentoLiberado: true, fasesLiberadas: null })).toBeNull();
  });
});
