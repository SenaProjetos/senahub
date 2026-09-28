import { describe, expect, it } from "vitest";

import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import {
  ACAO_APONTAR_AQUI,
  ACAO_CALIBRAR,
  ACAO_COPIAR_TEXTO,
  ACAO_ESBOCO_CONCLUIR,
  ACAO_NAVEGAR,
  ACAO_ZOOM_MAIS,
  ACAO_ZOOM_MENOS,
  PREFIXO_FERRAMENTA,
  ferramentaDoItem,
  itensDoVisualizador,
  type EstadoVisualizador,
} from "./acoes-visualizador";

const achar = (itens: AcaoItem[], id: string) => itens.find((i) => i.id === id) as AcaoItemAcao | undefined;

const base: EstadoVisualizador = {
  podeApontar: true,
  modoApontar: false,
  ferramenta: "ponto",
  zoom: 1,
  zoomMin: 0.25,
  zoomMax: 20,
  emTelaCheia: false,
  pagina: 1,
  temTextoSelecionado: false,
  esboco: null,
};

describe("itensDoVisualizador", () => {
  it("quem só lê não recebe apontar, ferramentas nem escala — só a visualização", () => {
    const itens = itensDoVisualizador({ ...base, podeApontar: false });
    expect(achar(itens, ACAO_APONTAR_AQUI)).toBeUndefined();
    expect(achar(itens, ACAO_NAVEGAR)).toBeUndefined();
    expect(achar(itens, ACAO_CALIBRAR)).toBeUndefined();
    expect(achar(itens, ACAO_ZOOM_MAIS)).toBeDefined();
    expect(itens[0].tipo).not.toBe("separador");
  });

  it("a ferramenta em uso vem marcada; fora do modo apontar, marca Navegar", () => {
    const navegando = itensDoVisualizador(base);
    expect(achar(navegando, ACAO_NAVEGAR)?.marcado).toBe(true);
    expect(achar(navegando, `${PREFIXO_FERRAMENTA}ponto`)?.marcado).toBe(false);
    const medindo = itensDoVisualizador({ ...base, modoApontar: true, ferramenta: "medida" });
    expect(achar(medindo, ACAO_NAVEGAR)?.marcado).toBe(false);
    expect(achar(medindo, `${PREFIXO_FERRAMENTA}medida`)).toMatchObject({ marcado: true, atalho: "5" });
  });

  it("zoom no limite fica desabilitado, com o motivo", () => {
    expect(achar(itensDoVisualizador({ ...base, zoom: 20 }), ACAO_ZOOM_MAIS)?.desabilitado).toBeTruthy();
    expect(achar(itensDoVisualizador({ ...base, zoom: 0.25 }), ACAO_ZOOM_MENOS)?.desabilitado).toBeTruthy();
  });

  // Regra 1 da ADR-0002: o menu próprio repõe o "Copiar" que o nativo daria no texto selecionado.
  it("com texto selecionado, oferece copiar", () => {
    expect(achar(itensDoVisualizador(base), ACAO_COPIAR_TEXTO)).toBeUndefined();
    expect(achar(itensDoVisualizador({ ...base, temTextoSelecionado: true }), ACAO_COPIAR_TEXTO)).toBeDefined();
  });

  it("com desenho em andamento, concluir vem primeiro e não se abre outro apontamento", () => {
    const itens = itensDoVisualizador({ ...base, modoApontar: true, ferramenta: "medida", esboco: { tipo: "medida" } });
    expect(itens[0].id).toBe(ACAO_ESBOCO_CONCLUIR);
    expect(achar(itens, ACAO_APONTAR_AQUI)).toBeUndefined();
  });

  it("fora de uma página não há ponto para apontar nem página para calibrar", () => {
    const itens = itensDoVisualizador({ ...base, pagina: null });
    expect(achar(itens, ACAO_APONTAR_AQUI)).toBeUndefined();
    expect(achar(itens, ACAO_CALIBRAR)).toBeUndefined();
  });
});

describe("ferramentaDoItem", () => {
  it("lê a ferramenta e recusa o que não é uma", () => {
    expect(ferramentaDoItem(`${PREFIXO_FERRAMENTA}livre`)).toBe("livre");
    expect(ferramentaDoItem(`${PREFIXO_FERRAMENTA}inexistente`)).toBeNull();
    expect(ferramentaDoItem(ACAO_NAVEGAR)).toBeNull();
  });
});
