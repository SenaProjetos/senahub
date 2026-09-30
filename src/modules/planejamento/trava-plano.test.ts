import { describe, expect, it } from "vitest";
import {
  MOTIVO_CANCELAR_COM_MUDANCA,
  MOTIVO_JA_EM_REVISAO,
  MOTIVO_NAO_ESTA_EM_REVISAO,
  MOTIVO_REVISAO_SEM_APROVACAO,
  impedimentoParaAbrirRevisao,
  impedimentoParaCancelarRevisao,
  mudaCampoDoPlano,
  planoTravado,
} from "./trava-plano";

describe("planoTravado", () => {
  it("rascunho e projeto sem cronograma são livres", () => {
    expect(planoTravado(null)).toBe(false);
    expect(planoTravado(undefined)).toBe(false);
    expect(planoTravado({ aprovado: false, emRevisao: false })).toBe(false);
  });

  it("aprovado trava; em revisão destrava", () => {
    expect(planoTravado({ aprovado: true, emRevisao: false })).toBe(true);
    expect(planoTravado({ aprovado: true, emRevisao: true })).toBe(false);
  });
});

describe("abrir e cancelar a revisão", () => {
  it("abre só aprovado e fechado", () => {
    expect(impedimentoParaAbrirRevisao(null)).toBe(MOTIVO_REVISAO_SEM_APROVACAO);
    expect(impedimentoParaAbrirRevisao({ aprovado: false, emRevisao: false })).toBe(MOTIVO_REVISAO_SEM_APROVACAO);
    expect(impedimentoParaAbrirRevisao({ aprovado: true, emRevisao: true })).toBe(MOTIVO_JA_EM_REVISAO);
    expect(impedimentoParaAbrirRevisao({ aprovado: true, emRevisao: false })).toBeNull();
  });

  it("cancela só a revisão aberta e sem mudança — com mudança, só a nova linha de base fecha", () => {
    expect(impedimentoParaCancelarRevisao({ aprovado: true, emRevisao: false, revisaoAlterada: false })).toBe(MOTIVO_NAO_ESTA_EM_REVISAO);
    expect(impedimentoParaCancelarRevisao({ aprovado: true, emRevisao: true, revisaoAlterada: true })).toBe(MOTIVO_CANCELAR_COM_MUDANCA);
    expect(impedimentoParaCancelarRevisao({ aprovado: true, emRevisao: true, revisaoAlterada: false })).toBeNull();
  });
});

describe("mudaCampoDoPlano", () => {
  const antes = { tipoEap: "atv", duracaoDias: 5, disciplinaId: "d1", etapaId: "f1" };

  it("renomear ou mudar o % manda a linha inteira igual: não é mudança do plano", () => {
    expect(mudaCampoDoPlano(antes, { tipoEap: "atv", duracaoDias: 5, disciplinaId: "d1", etapaId: "f1" })).toBe(false);
    // Fase ausente = não mexe; duração ausente = não grava (agrupamento).
    expect(mudaCampoDoPlano(antes, { tipoEap: "atv", duracaoDias: undefined, disciplinaId: "d1", etapaId: undefined })).toBe(false);
  });

  it("duração, marco, disciplina e fase são do plano", () => {
    expect(mudaCampoDoPlano(antes, { ...antes, duracaoDias: 6 })).toBe(true);
    expect(mudaCampoDoPlano(antes, { ...antes, tipoEap: "mrc", duracaoDias: 0 })).toBe(true);
    expect(mudaCampoDoPlano(antes, { ...antes, disciplinaId: null })).toBe(true);
    expect(mudaCampoDoPlano(antes, { ...antes, etapaId: null })).toBe(true);
  });

  it("decimal do banco não vira mudança falsa", () => {
    expect(mudaCampoDoPlano({ ...antes, duracaoDias: 2.5 }, { ...antes, duracaoDias: 2.5 })).toBe(false);
  });
});
