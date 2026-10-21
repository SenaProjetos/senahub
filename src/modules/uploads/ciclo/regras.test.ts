import { describe, expect, it } from "vitest";

import {
  decidirLiberacaoAutomatica,
  decidirPublicacao,
  documentosSemPublicacao,
  motivoEntregaSemPublicacao,
  MOTIVO_SEM_DWG_SEM_TIPO,
  restricaoDePendenciasPodeSair,
} from "./regras";

const arq = (validado = true) => ({ id: "u1", nome: "A-01.pdf", ext: "pdf", validado });
const pend = (severidade: string | null = "media", status = "aberta", publicadoEm: Date | null = new Date()) => ({ status, severidade, publicadoEm });

describe("decidirPublicacao", () => {
  it("D2-a: arquivo sem validação impede publicar e diz qual", () => {
    expect(decidirPublicacao({ arquivos: [arq(true), { ...arq(false), nome: "A-01.dwg" }], pendencias: [], permitirComPendencias: false })).toEqual({
      ok: false,
      motivo: "Valide os arquivos antes de publicar: A-01.dwg.",
    });
  });

  it("DWG obrigatório: sem DWG recusa; com DWG, ou modelo IFC, passa", () => {
    expect(decidirPublicacao({ arquivos: [arq()], pendencias: [], permitirComPendencias: false, exigirDwg: true, siglaTipo: "PLB" })).toMatchObject({
      ok: false,
      motivo: expect.stringMatching(/tipo PLB só publicam com o DWG/),
    });
    const dwg = { ...arq(), id: "u2", nome: "A-01.dwg", ext: "dwg" };
    expect(decidirPublicacao({ arquivos: [arq(), dwg], pendencias: [], permitirComPendencias: false, exigirDwg: true })).toEqual({ ok: true, restricao: null });
    const ifc = { ...arq(), id: "u3", nome: "modelo.ifc", ext: "ifc" };
    expect(decidirPublicacao({ arquivos: [ifc], pendencias: [], permitirComPendencias: false, exigirDwg: true })).toEqual({ ok: true, restricao: null });
    expect(decidirPublicacao({ arquivos: [arq()], pendencias: [], permitirComPendencias: false, exigirDwg: false })).toEqual({ ok: true, restricao: null });
  });

  it("documento sem tipo e sem DWG: pede confirmação, e só depois do resto estar certo", () => {
    const base = { pendencias: [], permitirComPendencias: false, exigirDwg: "confirmar" as const };
    expect(decidirPublicacao({ ...base, arquivos: [arq()] })).toEqual({ ok: false, motivo: MOTIVO_SEM_DWG_SEM_TIPO });
    expect(decidirPublicacao({ ...base, arquivos: [arq()], confirmarSemDwg: true })).toEqual({ ok: true, restricao: null, semDwgConfirmado: true });
    // Arquivo sem validação vem primeiro: a confirmação não é pedida antes da hora.
    expect(decidirPublicacao({ ...base, arquivos: [arq(false)] })).toMatchObject({ ok: false, motivo: expect.stringMatching(/^Valide/) });
    // Com pendência permitida, a confirmação vem depois da justificativa e a restrição segue.
    const comPend = { ...base, arquivos: [arq()], pendencias: [pend()], permitirComPendencias: true };
    expect(decidirPublicacao({ ...comPend })).toMatchObject({ ok: false, motivo: expect.stringMatching(/justificativa/) });
    expect(decidirPublicacao({ ...comPend, justificativa: "x" })).toEqual({ ok: false, motivo: MOTIVO_SEM_DWG_SEM_TIPO });
    expect(decidirPublicacao({ ...comPend, justificativa: "x", confirmarSemDwg: true })).toMatchObject({ ok: true, semDwgConfirmado: true, restricao: { abertos: 1 } });
  });

  it("documento sem tipo COM DWG, ou modelo IFC: publica sem perguntar", () => {
    const dwg = { ...arq(), id: "u2", nome: "A-01.dwg", ext: "dwg" };
    const ifc = { ...arq(), id: "u3", nome: "modelo.ifc", ext: "ifc" };
    for (const arquivos of [[arq(), dwg], [ifc]]) {
      expect(decidirPublicacao({ arquivos, pendencias: [], permitirComPendencias: false, exigirDwg: "confirmar" })).toEqual({ ok: true, restricao: null });
    }
  });

  it("tipo que exige DWG não aceita a confirmação", () => {
    expect(
      decidirPublicacao({ arquivos: [arq()], pendencias: [], permitirComPendencias: false, exigirDwg: true, siglaTipo: "PLB", confirmarSemDwg: true }),
    ).toMatchObject({ ok: false, motivo: expect.stringMatching(/tipo PLB/) });
  });

  it("A3 sem pendências: publica sem restrição", () => {
    expect(decidirPublicacao({ arquivos: [arq()], pendencias: [pend("media", "resolvida")], permitirComPendencias: false })).toEqual({ ok: true, restricao: null });
  });

  it("D3-c: impeditivo em aberto bloqueia mesmo com o projeto permitindo pendências", () => {
    const r = decidirPublicacao({ arquivos: [arq()], pendencias: [pend("impeditivo", "em_correcao")], permitirComPendencias: true, justificativa: "x" });
    expect(r).toMatchObject({ ok: false });
  });

  it("A3 com pendências e projeto que não permite: bloqueia", () => {
    expect(decidirPublicacao({ arquivos: [arq()], pendencias: [pend()], permitirComPendencias: false })).toMatchObject({ ok: false });
  });

  it("A3 com pendências e projeto que permite: exige justificativa e devolve a restrição", () => {
    expect(decidirPublicacao({ arquivos: [arq()], pendencias: [pend(), pend("baixa")], permitirComPendencias: true })).toMatchObject({ ok: false, motivo: expect.stringMatching(/justificativa/) });
    expect(decidirPublicacao({ arquivos: [arq()], pendencias: [pend(), pend("baixa")], permitirComPendencias: true, justificativa: "prazo da obra" })).toEqual({
      ok: true,
      restricao: { motivo: "Publicado com 2 apontamentos pendentes", abertos: 2 },
    });
  });

  it("rascunho de apontamento não conta", () => {
    expect(decidirPublicacao({ arquivos: [arq()], pendencias: [pend("impeditivo", "aberta", null)], permitirComPendencias: false })).toEqual({ ok: true, restricao: null });
  });

  it("restrição dos apontamentos sai quando nada fica em aberto", () => {
    expect(restricaoDePendenciasPodeSair([pend("media", "resolvida"), pend("alta", "fechada")])).toBe(true);
    expect(restricaoDePendenciasPodeSair([pend("media", "aberta")])).toBe(false);
  });
});

describe("decidirLiberacaoAutomatica (A2)", () => {
  it("libera só com a opção ligada e sem restrição", () => {
    expect(decidirLiberacaoAutomatica({ liberarAutomaticamente: false, temRestricao: false })).toBe("nao_configurado");
    expect(decidirLiberacaoAutomatica({ liberarAutomaticamente: true, temRestricao: false })).toBe("liberar");
    expect(decidirLiberacaoAutomatica({ liberarAutomaticamente: true, temRestricao: true })).toBe("restricao");
  });
});

describe("documentosSemPublicacao (6-B: pagamento na publicação)", () => {
  it("só passa quem tem revisão publicada; documento todo arquivado (cancelado) não conta", () => {
    expect(
      documentosSemPublicacao([
        { nome: "A", estados: ["arquivado", "publicado"] },
        { nome: "B", estados: ["publicado", "em_andamento"] },
        { nome: "C", estados: ["compartilhado"] },
        { nome: "D", estados: ["arquivado", "arquivado"] },
        { nome: "E", estados: ["em_andamento"] },
      ]),
    ).toEqual(["C", "E"]);
  });

  it("mensagem lista até 5 e resume o resto", () => {
    expect(motivoEntregaSemPublicacao([], "disciplina")).toBeNull();
    expect(motivoEntregaSemPublicacao(["A", "B"], "fase")).toBe(
      "Publique todos os documentos da fase antes de aprovar: 2 sem revisão publicada (A, B).",
    );
    expect(motivoEntregaSemPublicacao(["1", "2", "3", "4", "5", "6", "7"], "disciplina")).toMatch(/e mais 2\)\.$/);
  });
});
