/**
 * Áreas do projeto que NÃO são documentos de disciplina — parte pura.
 *
 * Fica FORA do componente porque a página (Server Component) precisa validar `?area=` antes
 * de renderizar, e função exportada de arquivo `"use client"` não pode ser chamada no
 * servidor: o Next aceita em compilação e quebra em runtime com "Attempted to call
 * areaValida() from the server". Os ícones, que são React, ficam no componente.
 */

export const AREAS_PROJETO = ["recebidos", "base", "geral", "arts", "lixeira", "federado"] as const;
export type AreaProjeto = (typeof AREAS_PROJETO)[number];

/** Áreas listadas na raiz e no painel "Áreas do projeto". O federado mora DENTRO do Desenvolvimento (spec 2026-10-04 D4). */
export const AREAS_NA_RAIZ: readonly AreaProjeto[] = AREAS_PROJETO.filter((a) => a !== "federado");

export type AreaDisponivel = {
  id: AreaProjeto;
  total: number;
  /** Área sem permissão simplesmente não é listada — item invisível é melhor que item morto. */
  visivel: boolean;
};

/** Aceita só o que está na whitelist — o valor vem da URL. */
export function areaValida(v: string | null | undefined): AreaProjeto | null {
  return (AREAS_PROJETO as readonly string[]).includes(v ?? "") ? (v as AreaProjeto) : null;
}

export const AREA_ROTULO: Record<AreaProjeto, { rotulo: string; descricao: string }> = {
  recebidos: { rotulo: "Recebidos do cliente", descricao: "Material enviado pelo cliente" },
  base: { rotulo: "Base Arquitetônica", descricao: "Referência do arquiteto" },
  geral: { rotulo: "Geral", descricao: "Arquivos gerais do projeto" },
  arts: { rotulo: "ARTs", descricao: "Registros de responsabilidade técnica" },
  lixeira: { rotulo: "Lixeira", descricao: "Excluídos, restauráveis por 30 dias" },
  federado: { rotulo: "Modelo federado", descricao: "IFC único com as disciplinas, gerado na Compatibilização" },
};

export function rotuloArea(area: AreaProjeto): string {
  return AREA_ROTULO[area].rotulo;
}
