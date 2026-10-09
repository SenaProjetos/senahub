import { describe, expect, it } from "vitest";

import { decidirLiberacaoAutomatica, decidirPublicacao, restricaoDePendenciasPodeSair } from "./regras";

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
    expect(decidirPublicacao({ arquivos: [arq()], pendencias: [], permitirComPendencias: false, exigirDwg: true })).toMatchObject({
      ok: false,
      motivo: expect.stringMatching(/DWG/),
    });
    const dwg = { ...arq(), id: "u2", nome: "A-01.dwg", ext: "dwg" };
    expect(decidirPublicacao({ arquivos: [arq(), dwg], pendencias: [], permitirComPendencias: false, exigirDwg: true })).toEqual({ ok: true, restricao: null });
    const ifc = { ...arq(), id: "u3", nome: "modelo.ifc", ext: "ifc" };
    expect(decidirPublicacao({ arquivos: [ifc], pendencias: [], permitirComPendencias: false, exigirDwg: true })).toEqual({ ok: true, restricao: null });
    expect(decidirPublicacao({ arquivos: [arq()], pendencias: [], permitirComPendencias: false, exigirDwg: false })).toEqual({ ok: true, restricao: null });
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
