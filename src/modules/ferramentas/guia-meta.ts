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
  "pilar-concreto": {
    subtitulo: "Guia dos dados de entrada para o dimensionamento do pilar à flexo-compressão.",
    grupos: [
      { n: 1, titulo: "Geometria da seção", descricao: "Dimensões da seção retangular do pilar: largura (b) e altura (h)." },
      { n: 2, titulo: "Materiais e armadura", descricao: "Resistência do concreto (fck), tipo de aço, cobrimento até o eixo da barra (d') e bitola do arranjo." },
      { n: 3, titulo: "Esforços de cálculo", descricao: "Força normal (Nd) e momentos fletores nas duas direções (Mdx, Mdy), já majorados." },
      { n: 4, titulo: "Esbeltez e 2ª ordem", descricao: "Comprimentos de flambagem (ℓe,x, ℓe,y) e coeficientes αb e de interação para os efeitos de 2ª ordem." },
    ],
    unidades: [
      "Comprimentos: cm",
      "Resistências: MPa",
      "Forças: kN",
      "Momentos: kN·m",
    ],
    dica: "Nd e os momentos são valores de cálculo (já majorados). Mdx atua em torno de x (profundidade h) e Mdy em torno de y (profundidade b). α = 1 é conservador; a NBR admite de 1 a 2.",
  },
  "laje-macica": {
    subtitulo: "Guia dos dados de entrada para o cálculo da laje maciça armada em cruz.",
    grupos: [
      { n: 1, titulo: "Vinculação", descricao: "Caso de apoio das bordas (engastadas, apoiadas ou livres) segundo as tabelas de Bares–Pinheiro." },
      { n: 2, titulo: "Geometria", descricao: "Menor vão (lx), maior vão (ly) e espessura da laje (h)." },
      { n: 3, titulo: "Carregamento", descricao: "Carga total característica distribuída (p) sobre a laje." },
      { n: 4, titulo: "Materiais", descricao: "Resistência característica do concreto (fck) e tipo de aço da armadura." },
    ],
    unidades: [
      "Comprimentos: cm",
      "Carga distribuída: kN/m²",
      "Resistências: MPa",
    ],
    dica: "lx é sempre o menor vão (o cálculo usa o mínimo). p é a carga total já somada (permanente + acidental); a flecha é estimada com a seção bruta.",
  },
  "puncao": {
    subtitulo: "Guia dos dados de entrada para a verificação à punção em laje lisa.",
    grupos: [
      { n: 1, titulo: "Posição do pilar", descricao: "Pilar interno, de borda ou de canto — define o perímetro crítico e o coeficiente β." },
      { n: 2, titulo: "Geometria", descricao: "Lados do pilar (c1 na direção do momento, c2) e altura útil da laje (d)." },
      { n: 3, titulo: "Solicitações", descricao: "Força de punção (FSd) e momento desbalanceado (MSd) no contorno do pilar." },
      { n: 4, titulo: "Materiais e flexão", descricao: "Resistência do concreto (fck) e taxas de armadura de flexão da laje (ρx, ρy)." },
    ],
    unidades: [
      "Comprimentos: cm",
      "Força: kN · Momento: kN·m",
      "Resistências: MPa · Taxas: %",
    ],
    dica: "c1 é a dimensão na direção do momento (perpendicular à borda, para pilar de borda/canto). ρ é a taxa de armadura de flexão já existente na laje.",
  },
  "escada": {
    subtitulo: "Guia dos dados de entrada para o dimensionamento da escada de lance reto.",
    grupos: [
      { n: 1, titulo: "Vinculação", descricao: "Condição de apoio do lance (biapoiado ou engastado), que define os momentos." },
      { n: 2, titulo: "Geometria", descricao: "Piso (g) e espelho (e) do degrau, projeção horizontal do lance, patamar e espessura da laje (hl)." },
      { n: 3, titulo: "Cargas", descricao: "Carga de revestimento e sobrecarga de uso (q) sobre a escada." },
      { n: 4, titulo: "Materiais", descricao: "Resistência característica do concreto (fck) e tipo de aço da armadura." },
    ],
    unidades: [
      "Comprimentos: cm",
      "Cargas distribuídas: kN/m²",
      "Resistências: MPa",
    ],
    dica: "O lance horizontal é a projeção em planta (não a medida inclinada). Deixe o patamar em 0 quando não houver. A sobrecarga q segue a NBR 6120.",
  },
};

export function getGuia(slug: string): GuiaMeta | undefined {
  return GUIAS[slug];
}
