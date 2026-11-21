import { describe, expect, it } from "vitest";
import { MOTIVO_EXTERNO_NO_JURIDICO } from "@/modules/portal/contratos/regras";
import {
  MOTIVO_SEM_PERMISSAO_PARA_ASSINAR,
  MOTIVO_SO_RH_ASSINA_EQUIPE_ALHEIA,
  motivoParaNaoAssinarNoJuridico,
  type EntradaQuemAssina,
} from "./quem-assina";

function entrada(over: Partial<EntradaQuemAssina> = {}): EntradaQuemAssina {
  return {
    tipo: "interno",
    podeGerirJuridico: false,
    ehDonoDoVinculo: false,
    temVinculo: false,
    ehHrAdmin: false,
    ...over,
  };
}

describe("motivoParaNaoAssinarNoJuridico", () => {
  it("conta externa é recusada antes de tudo, mesmo com todas as outras condições", () => {
    expect(
      motivoParaNaoAssinarNoJuridico(
        entrada({ tipo: "externo", podeGerirJuridico: true, ehDonoDoVinculo: true, temVinculo: true, ehHrAdmin: true }),
      ),
    ).toBe(MOTIVO_EXTERNO_NO_JURIDICO);
  });

  it("quem gere o jurídico assina contrato de cliente", () => {
    expect(motivoParaNaoAssinarNoJuridico(entrada({ podeGerirJuridico: true }))).toBeNull();
  });

  it("o dono do vínculo assina o próprio contrato sem juridico:gerir nem RH", () => {
    expect(motivoParaNaoAssinarNoJuridico(entrada({ temVinculo: true, ehDonoDoVinculo: true }))).toBeNull();
  });

  it("contrato de equipe de outra pessoa sem RH é recusado", () => {
    expect(motivoParaNaoAssinarNoJuridico(entrada({ podeGerirJuridico: true, temVinculo: true }))).toBe(
      "Só RH pode assinar contrato de equipe de outra pessoa.",
    );
    expect(MOTIVO_SO_RH_ASSINA_EQUIPE_ALHEIA).toBe("Só RH pode assinar contrato de equipe de outra pessoa.");
  });

  it("contrato de equipe de outra pessoa com RH e juridico:gerir passa", () => {
    expect(
      motivoParaNaoAssinarNoJuridico(entrada({ podeGerirJuridico: true, temVinculo: true, ehHrAdmin: true })),
    ).toBeNull();
  });

  it("sem juridico:gerir e sem ser dono: sem permissão (RH sozinho não basta)", () => {
    expect(motivoParaNaoAssinarNoJuridico(entrada())).toBe("Sem permissão para assinar este documento.");
    expect(motivoParaNaoAssinarNoJuridico(entrada({ temVinculo: true, ehHrAdmin: true }))).toBe(
      "Sem permissão para assinar este documento.",
    );
    expect(MOTIVO_SEM_PERMISSAO_PARA_ASSINAR).toBe("Sem permissão para assinar este documento.");
  });
});
