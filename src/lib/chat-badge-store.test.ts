import { describe, it, expect } from "vitest";
import { decidirAlerta } from "./chat-badge-store";

const base = { ehMinha: false, chatAtivo: false, somHabilitado: true, emReuniao: false };

describe("decidirAlerta", () => {
  it("mensagem própria não alerta", () => {
    expect(decidirAlerta({ ...base, ehMinha: true })).toEqual({ tocarSom: false, mostrarToast: false });
  });

  it("com chat ativo, provider silencia (ChatView cuida)", () => {
    expect(decidirAlerta({ ...base, chatAtivo: true })).toEqual({ tocarSom: false, mostrarToast: false });
  });

  it("mensagem de outro fora do chat: som + toast", () => {
    expect(decidirAlerta(base)).toEqual({ tocarSom: true, mostrarToast: true });
  });

  it("som desligado: só toast", () => {
    expect(decidirAlerta({ ...base, somHabilitado: false })).toEqual({ tocarSom: false, mostrarToast: true });
  });

  it("em reunião: só toast (não perturbe suprime som)", () => {
    expect(decidirAlerta({ ...base, emReuniao: true })).toEqual({ tocarSom: false, mostrarToast: true });
  });

  it("em reunião e som ligado ainda suprime som", () => {
    expect(decidirAlerta({ ...base, emReuniao: true, somHabilitado: true }).tocarSom).toBe(false);
  });

  it("canal silenciado: sem som e sem toast", () => {
    expect(decidirAlerta({ ...base, canalSilenciado: true })).toEqual({ tocarSom: false, mostrarToast: false });
  });

  it("canalSilenciado=false preserva comportamento normal", () => {
    expect(decidirAlerta({ ...base, canalSilenciado: false })).toEqual({ tocarSom: true, mostrarToast: true });
  });
});
