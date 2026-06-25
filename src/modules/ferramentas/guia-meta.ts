/**
 * Metadados do "guia de entrada" de cada ferramenta — texto didático que
 * alimenta o cabeçalho, a legenda numerada, a caixa de unidades e a dica.
 *
 * Client-safe (sem server-only/Prisma/Node). Os desenhos esquemáticos são
 * componentes SVG (em components/ferramentas/guia/schematics), supridos pelo
 * próprio formulário; aqui ficam apenas os DADOS textuais, para o layout ser
 * consistente entre todas as ferramentas.
 */

/** Um grupo numerado de campos (ex.: "1. Geometria"). */
export type GuiaGrupoMeta = {
  /** Número de ordem exibido no badge e na legenda. */
  n: number;
  titulo: string;
  /** Explicação curta exibida na legenda lateral. */
  descricao: string;
};

export type GuiaMeta = {
  /** Linha de subtítulo abaixo do nome (o que o guia ajuda a fazer). */
  subtitulo: string;
  grupos: GuiaGrupoMeta[];
  /** Convenções de unidades (uma por linha). */
  unidades: string[];
  /** Texto da caixa de dica do rodapé. */
  dica: string;
};

/** Guia por slug de ferramenta. Vai sendo preenchido conforme cada form migra. */
export const GUIAS: Record<string, GuiaMeta> = {
  "viga-concreto": {
    subtitulo: "Guia dos dados de entrada para o predimensionamento da viga.",
    grupos: [
      { n: 1, titulo: "Geometria da viga", descricao: "Defina o formato da seção transversal e sua largura." },
      { n: 2, titulo: "Altura da viga", descricao: "Informe a altura total (h) e a altura útil (d) até o centro da armadura de tração." },
      { n: 3, titulo: "Materiais", descricao: "Selecione o tipo de aço da armadura e a resistência característica do concreto (fck)." },
      { n: 4, titulo: "Resistências (dimensionamento)", descricao: "Momento fletor de cálculo (Mk) e esforço cortante de cálculo (Vk)." },
      { n: 5, titulo: "Cargas e solicitações", descricao: "Comprimento do vão da viga e momento fletor de serviço (verificação de flecha)." },
    ],
    unidades: [
      "Comprimentos: cm (geometria) / m (vão)",
      "Resistências: MPa",
      "Momentos: kN·m",
      "Forças: kN",
    ],
    dica: "Forneça valores coerentes com seu projeto. Esses dados são usados para estimar as armaduras de tração e compressão, verificar os domínios e gerar os resultados.",
  },
};

export function getGuia(slug: string): GuiaMeta | undefined {
  return GUIAS[slug];
}
