/**
 * Abas internas da Coordenação (pura, sem React): Modelo 3D (IFC) | Sobreposição 2D, cada uma com
 * o seu endereço. Decisão do dono (2026-11-05): com IFC o padrão é o 3D, que fica como sempre foi;
 * sem IFC (EP típico) a aba Coordenação abre na Sobreposição 2D.
 */

export type AbaCoordenacao = "3d" | "sobreposicao";

export type ItemNavCoordenacao = { id: AbaCoordenacao; rotulo: string; href: string };

/**
 * Qual aba abre quando se entra em `/projetos/[id]/coordenacao`. `pediu3d` é o `?3d=1` do link da
 * própria nav: o projeto sem IFC ainda vê o "Nenhum modelo IFC" do 3D quando escolhe essa aba.
 */
export function abaInicialDaCoordenacao({
  temIfcConvertido,
  pediu3d,
}: {
  temIfcConvertido: boolean;
  pediu3d: boolean;
}): AbaCoordenacao {
  return temIfcConvertido || pediu3d ? "3d" : "sobreposicao";
}

export function abasDaCoordenacao(projetoId: string): ItemNavCoordenacao[] {
  return [
    { id: "3d", rotulo: "Modelo 3D (IFC)", href: `/projetos/${projetoId}/coordenacao?3d=1` },
    { id: "sobreposicao", rotulo: "Sobreposição 2D", href: `/projetos/${projetoId}/coordenacao/sobreposicao` },
  ];
}
