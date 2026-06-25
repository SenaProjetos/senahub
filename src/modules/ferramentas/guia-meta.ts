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
  "sapata-isolada": {
    subtitulo: "Guia dos dados de entrada para o dimensionamento da sapata isolada centrada.",
    grupos: [
      { n: 1, titulo: "Carga", descricao: "Carga vertical característica do pilar (Nk) que chega à fundação." },
      { n: 2, titulo: "Solo", descricao: "Tensão admissível do solo (σadm) e acréscimo estimado de peso próprio da sapata." },
      { n: 3, titulo: "Pilar", descricao: "Dimensões da seção do pilar (ap, bp) apoiado sobre a sapata." },
      { n: 4, titulo: "Sapata e materiais", descricao: "Altura da sapata (h), resistência do concreto (fck) e tipo de aço." },
    ],
    unidades: [
      "Comprimentos: cm",
      "Carga: kN · Tensão do solo: kPa",
      "Resistências: MPa · Peso próprio: %",
    ],
    dica: "Nk é a carga característica (sem majorar). A área em planta é dimensionada pela σadm; o % de peso próprio cobre o peso da própria sapata. A altura h define se a sapata é rígida ou flexível.",
  },
  "sapata-excentrica": {
    subtitulo: "Guia dos dados de entrada para sapata excêntrica isolada ou de divisa com viga de equilíbrio.",
    grupos: [
      { n: 1, titulo: "Tipo de cálculo", descricao: "Sapata excêntrica isolada (tensões no solo) ou de divisa com viga de equilíbrio (alavanca)." },
      { n: 2, titulo: "Cargas", descricao: "Isolada: carga (Nk) e momento (Mk). Divisa: cargas dos pilares (P1, P2) e distância entre eixos (ℓ)." },
      { n: 3, titulo: "Geometria", descricao: "Dimensões da sapata e dos pilares; na divisa, também a seção da viga de equilíbrio." },
      { n: 4, titulo: "Solo e materiais", descricao: "Tensão admissível do solo (σadm), resistência do concreto (fck) e tipo de aço." },
    ],
    unidades: [
      "Comprimentos: cm",
      "Cargas: kN · Momento: kN·m",
      "Tensão do solo: kPa · Resistências: MPa",
    ],
    dica: "Na sapata isolada, a excentricidade e = Mk/Nk define o diagrama de tensões (trapezoidal ou triangular). Na divisa, a viga de equilíbrio transfere a excentricidade ao pilar interno.",
  },
  "ancoragem": {
    subtitulo: "Guia dos dados de entrada para o comprimento de ancoragem e de traspasse de barras.",
    grupos: [
      { n: 1, titulo: "Barra", descricao: "Bitola (ø) e categoria do aço da barra a ancorar." },
      { n: 2, titulo: "Concreto e aderência", descricao: "Resistência do concreto (fck) e zona de aderência (boa ou má) da barra." },
      { n: 3, titulo: "Ancoragem", descricao: "Presença de gancho na extremidade e percentual de barras emendadas na mesma seção." },
    ],
    unidades: [
      "Bitola: mm",
      "Resistências: MPa",
      "Barras emendadas: %",
    ],
    dica: "A zona de aderência ruim (topo de peças altas concretadas de uma vez) reduz a aderência e aumenta lb. O gancho reduz o comprimento necessário de ancoragem.",
  },
  "estaca-spt": {
    subtitulo: "Guia dos dados de entrada para a capacidade de carga de estaca a partir do SPT.",
    grupos: [
      { n: 1, titulo: "Estaca", descricao: "Tipo de estaca (pré-moldada, hélice, escavada…) e diâmetro." },
      { n: 2, titulo: "Perfil de sondagem (SPT)", descricao: "Camadas do topo à ponta: tipo de solo, NSPT e espessura de cada camada." },
    ],
    unidades: [
      "Diâmetro: cm · Espessura: m",
      "NSPT: número de golpes",
      "Capacidade: kN",
    ],
    dica: "Liste as camadas na ordem real, do topo à ponta. A capacidade é estimada por Aoki-Velloso e Décourt-Quaresma; compare os dois métodos.",
  },
  "descida-cargas": {
    subtitulo: "Guia dos dados de entrada para o acúmulo de cargas verticais em um pilar.",
    grupos: [
      { n: 1, titulo: "Pavimentos", descricao: "Um por linha (do topo à base): nome, área de influência, carga permanente (g), sobrecarga (q) e carga extra concentrada." },
      { n: 2, titulo: "Redução da sobrecarga", descricao: "Fator de redução da carga acidental acumulada conforme o número de pavimentos." },
    ],
    unidades: [
      "Área: m² · Cargas distribuídas: kN/m²",
      "Carga extra: kN",
      "Fator de redução: 0 a 1",
    ],
    dica: "A carga extra é uma carga permanente concentrada (peso próprio de pilar, vigas, alvenaria). Fator 1,00 = sem redução da sobrecarga (NBR 6120, 6.2.2).",
  },
};

export function getGuia(slug: string): GuiaMeta | undefined {
  return GUIAS[slug];
}
