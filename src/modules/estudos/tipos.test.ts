import { describe, expect, it } from "vitest";

import { FERRAMENTA_POR_TIPO, TIPOS_DE_ESTUDO, liberacaoDaAba, situacaoDoMotor, tipoDeEstudoValido } from "./acesso";
import { conteudoVazioDoTipo, MOTIVO_CONTEUDO_DE_OUTRO_TIPO, tipoDaLinha, validarConteudoDoTipo } from "./tipos";

describe("tipo do estudo", () => {
  it("linha sem tipo reconhecível é o legado (cargas por ambiente)", () => {
    expect(tipoDaLinha(undefined)).toBe("cargas_eletricas");
    expect(tipoDaLinha(null)).toBe("cargas_eletricas");
    expect(tipoDaLinha("outro")).toBe("cargas_eletricas");
    expect(tipoDaLinha("cargas_demanda")).toBe("cargas_demanda");
    expect(tipoDeEstudoValido("cargas_demanda")).toBe(true);
    expect(tipoDeEstudoValido("x")).toBe(false);
  });

  it("cada tipo nasce com o documento do seu esquema e o aceita", () => {
    for (const t of TIPOS_DE_ESTUDO) {
      expect(validarConteudoDoTipo(t, conteudoVazioDoTipo(t)).ok, t).toBe(true);
    }
  });

  it("o documento de um tipo não serve no outro", () => {
    const r = validarConteudoDoTipo("cargas_eletricas", conteudoVazioDoTipo("cargas_demanda"));
    expect(r.ok).toBe(false);
    // O documento do legado não vira um estudo de cargas e demanda vazio (apagaria o gravado).
    expect(validarConteudoDoTipo("cargas_demanda", { ambientes: [] })).toEqual({ ok: false, mensagem: MOTIVO_CONTEUDO_DE_OUTRO_TIPO });
    expect(validarConteudoDoTipo("cargas_demanda", { toString: 1, ambientes: [] }).ok).toBe(false); // chave herdada não engana a trava
    expect(validarConteudoDoTipo("cargas_demanda", {}).ok).toBe(true); // o vazio, com os defaults, segue valendo
  });

  it("recusa com a mensagem do esquema", () => {
    const r = validarConteudoDoTipo("cargas_demanda", { levantamentos: [{ id: "a", nome: "", pavimentos: [] }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensagem).toMatch(/nome/i);
  });
});

describe("liberação por tipo e da aba", () => {
  it("cada tipo segue a validação da sua calculadora no registro", () => {
    expect(FERRAMENTA_POR_TIPO.cargas_eletricas).toBe("corrente-demanda");
    expect(FERRAMENTA_POR_TIPO.cargas_demanda).toBe("cargas-demanda");
    for (const t of TIPOS_DE_ESTUDO) expect(["em_validacao", "validada"]).toContain(situacaoDoMotor(t));
  });

  it("a aba abre se algum tipo está liberado; o aviso aparece se algum está em validação", () => {
    expect(liberacaoDaAba(["validada", "em_validacao"], false)).toEqual({ liberado: true, emValidacao: true });
    expect(liberacaoDaAba(["em_validacao", "em_validacao"], false)).toEqual({ liberado: false, emValidacao: true });
    expect(liberacaoDaAba(["em_validacao", "em_validacao"], true)).toEqual({ liberado: true, emValidacao: true });
    expect(liberacaoDaAba(["validada", "nao_exige"], false)).toEqual({ liberado: true, emValidacao: false });
  });
});
