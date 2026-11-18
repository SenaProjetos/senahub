/**
 * Catálogo de ferramentas de engenharia.
 * Client-safe: sem imports de server-only, Prisma ou Node.js.
 * IDs estáveis — nunca renomear chaves já publicadas (quebra saves históricos).
 */

import type { Disciplina, TipoFerramenta, FormatoExport } from "./types";
import {
  ArrowLeftRight,
  Shapes,
  RectangleHorizontal,
  Anchor,
  Table2,
  Layers,
  ArrowDownToLine,
  Wind,
  Sigma,
  RectangleVertical,
  Grid2x2,
  Footprints,
  Crosshair,
  Square,
  SquareStack,
  Droplets,
  PlugZap,
  ArrowUpFromLine,
  Waves,
  Shovel,
  type LucideIcon,
} from "lucide-react";

/**
 * Registro da validação técnica de uma calculadora (feita por engenheiro da casa).
 * Vale para UMA versão do motor: se `versaoCalc` da ferramenta mudar, volta a "em validação".
 */
export type ValidacaoFerramenta = {
  /** Quem validou (nome e registro profissional). */
  por: string;
  /** Data da validação, `YYYY-MM-DD`. */
  em: string;
  /** Versão do motor validada. */
  versaoCalc: number;
  /** Caminho da ficha de validação assinada (docs/engenharia/validacao/…). */
  ficha: string;
};

export type FerramentaMeta = {
  /** Chave estável da ferramenta (ex.: "conversor-unidades"). Igual ao entradasJson.ferramenta. */
  key: string;
  nome: string;
  descricao: string;
  disciplina: Disciplina;
  tipo: TipoFerramenta;
  /** Norma de referência (ex.: "NBR 6118:2023"). Omitir quando não aplicável. */
  norma?: string;
  /** Formatos de exportação disponíveis. Vazio na F0; preenchido na F1+. */
  exportaveis: FormatoExport[];
  /**
   * Versão do engine de cálculo. Omitida = 1. Incrementar SEMPRE que uma fórmula ou hipótese
   * padrão mudar depois de publicada — snapshots antigos guardam a versão com que foram gerados
   * e não devem ser reinterpretados silenciosamente pela regra nova.
   */
  versaoCalc?: number;
  /**
   * Calculadora que só vai à equipe depois de um engenheiro validar fórmulas e tabelas.
   * Sem `validacao` da versão atual, fica "em validação" (ver `situacaoValidacao`).
   */
  exigeValidacao?: boolean;
  validacao?: ValidacaoFerramenta;
  /**
   * Motor que só roda dentro do módulo Estudos (não é calculadora avulsa): fica fora da galeria, a rota
   * `/ferramentas/[key]` responde 404 e o cálculo avulso o recusa. A entrada existe para a trava de validação
   * (`exigeValidacao`/`validacao`) do estudo daquele tipo.
   */
  soEstudo?: boolean;
  icon: LucideIcon;
};

export type SituacaoValidacao = "nao_exige" | "validada" | "em_validacao";

/** Pura. A validação só conta se foi feita para a versão atual do motor. */
export function situacaoValidacao(
  meta: Pick<FerramentaMeta, "exigeValidacao" | "validacao" | "versaoCalc">,
): SituacaoValidacao {
  if (!meta.exigeValidacao) return "nao_exige";
  return meta.validacao && meta.validacao.versaoCalc === (meta.versaoCalc ?? 1) ? "validada" : "em_validacao";
}

/** Ferramenta em validação só é vista e usada por quem gere as ferramentas. */
export function ferramentaVisivel(meta: FerramentaMeta, podeVerEmValidacao: boolean): boolean {
  return podeVerEmValidacao || situacaoValidacao(meta) !== "em_validacao";
}

export const FERRAMENTAS: FerramentaMeta[] = [
  {
    key: "conversor-unidades",
    nome: "Conversor de Unidades",
    descricao: "Converte valores entre unidades de engenharia: comprimento, área, volume, massa, força, tensão, momento, vazão e ângulo.",
    disciplina: "Universal",
    tipo: "rapida",
    exportaveis: ["pdf"],
    icon: ArrowLeftRight,
  },
  {
    key: "propriedades-secao",
    nome: "Propriedades de Seção",
    descricao: "Área, centroide, momentos de inércia, módulos resistentes e raios de giração para seções retangular, circular, T e poligonal.",
    disciplina: "Universal",
    tipo: "rapida",
    exportaveis: ["pdf", "docx", "xlsx", "dxf"],
    icon: Shapes,
  },
  {
    key: "viga-concreto",
    nome: "Viga de Concreto à Flexão",
    descricao: "Dimensionamento à flexão simples (ELU): armadura de tração e compressão, domínios e armadura mínima/máxima, para seções retangular e T.",
    disciplina: "Estrutural",
    tipo: "completa",
    norma: "NBR 6118:2023",
    exportaveis: ["pdf", "docx", "xlsx", "dxf"],
    icon: RectangleHorizontal,
  },
  {
    key: "pilar-concreto",
    nome: "Pilar de Concreto",
    descricao: "Flexo-compressão oblíqua (NBR 6118:2023): esbeltez, 2ª ordem (pilar-padrão), dimensionamento de As por interação biaxial e detalhamento da seção.",
    disciplina: "Estrutural",
    tipo: "completa",
    norma: "NBR 6118:2023",
    exportaveis: ["pdf", "docx", "xlsx", "dxf"],
    icon: RectangleVertical,
  },
  {
    key: "laje-macica",
    nome: "Laje Maciça",
    descricao: "Laje retangular armada em cruz (tabelas de Bares, NBR 6118): momentos por direção, armadura e flecha elástica, para 9 casos de vinculação.",
    disciplina: "Estrutural",
    tipo: "completa",
    norma: "NBR 6118:2023",
    exportaveis: ["pdf", "docx", "xlsx", "dxf"],
    icon: Grid2x2,
  },
  {
    key: "puncao",
    nome: "Punção em Laje Lisa",
    descricao: "Verificação à punção (NBR 6118 §19.5) em pilar interno, de borda e de canto: perímetros C/C', coeficiente β (Wp), armadura de punção e perímetro C''.",
    disciplina: "Estrutural",
    tipo: "rapida",
    norma: "NBR 6118:2023",
    exportaveis: ["pdf", "xlsx"],
    icon: Crosshair,
  },
  {
    key: "escada",
    nome: "Escada (lance reto)",
    descricao: "Escada de lance reto com patamar (NBR 6118): cargas, momentos por vinculação (biapoiado/engastado), armadura e flecha com fissuração.",
    disciplina: "Estrutural",
    tipo: "completa",
    norma: "NBR 6118:2023",
    exportaveis: ["pdf", "docx", "xlsx", "dxf"],
    icon: Footprints,
  },
  {
    key: "ancoragem",
    nome: "Ancoragem e Traspasse",
    descricao: "Comprimento de ancoragem (lb, lb,nec, lb,mín) e de traspasse de barras, com/sem gancho e por zona de aderência.",
    disciplina: "Estrutural",
    tipo: "rapida",
    norma: "NBR 6118:2023",
    exportaveis: ["pdf"],
    icon: Anchor,
  },
  {
    key: "resumo-aco",
    nome: "Resumo de Aço",
    descricao: "Quantitativo de aço (corte e dobra): peso por bitola e total com perda, a partir da lista de barras.",
    disciplina: "Estrutural",
    tipo: "rapida",
    norma: "NBR 7480",
    exportaveis: ["xlsx", "pdf"],
    icon: Table2,
  },
  {
    key: "descida-cargas",
    nome: "Descida de Cargas",
    descricao: "Acúmulo de cargas verticais em pilar por área de influência, do topo à base, separando permanente e acidental (com fator de redução opcional).",
    disciplina: "Estrutural",
    tipo: "rapida",
    norma: "NBR 6120:2019",
    exportaveis: ["pdf", "xlsx"],
    icon: ArrowDownToLine,
  },
  {
    key: "acao-vento",
    nome: "Ação do Vento",
    descricao: "Velocidade característica e pressão dinâmica do vento (Vk, q) e força de arrasto global (F = Ca·q·Ae), com fatores S1, S2 e S3.",
    disciplina: "Estrutural",
    tipo: "rapida",
    norma: "NBR 6123:1988",
    exportaveis: ["pdf"],
    icon: Wind,
  },
  {
    key: "combinacoes-acoes",
    nome: "Combinações de Ações",
    descricao: "Combinações últimas (normal, especial, excepcional) e de serviço (quase-permanente, frequente, rara) a partir das ações permanentes e variáveis.",
    disciplina: "Estrutural",
    tipo: "rapida",
    norma: "NBR 8681:2003",
    exportaveis: ["pdf", "xlsx"],
    icon: Sigma,
  },
  {
    key: "sapata-isolada",
    nome: "Sapata Isolada",
    descricao: "Sapata isolada centrada (NBR 6118/6122): área pela σadm, rigidez, armadura por bielas-tirantes (rígida) ou flexão + punção (flexível), com detalhamento.",
    disciplina: "Fundações",
    tipo: "completa",
    norma: "NBR 6118/6122",
    exportaveis: ["pdf", "docx", "xlsx", "dxf"],
    icon: Square,
  },
  {
    key: "sapata-excentrica",
    nome: "Sapatas Excêntricas",
    descricao: "Sapata excêntrica isolada (tensões no solo, trapezoidal/triangular) e sapata de divisa com viga de equilíbrio (alavanca), com dimensionamento e detalhamento.",
    disciplina: "Fundações",
    tipo: "completa",
    norma: "NBR 6118/6122",
    exportaveis: ["pdf", "docx", "xlsx", "dxf"],
    versaoCalc: 2, // v2: alívio parcial (pctAlivio, default 50%) na viga de equilíbrio
    icon: SquareStack,
  },
  {
    key: "sapata-spt",
    nome: "Sapata por SPT (Alonso)",
    descricao:
      "Pré-dimensiona sapata quadrada por σadm estimado do SPT (Alonso, N ≤ 20) e verifica o bulbo de tensões (2B) a partir do perfil de sondagem. Estimativa de anteprojeto — não substitui laudo geotécnico.",
    disciplina: "Fundações",
    tipo: "rapida",
    norma: "NBR 6484 / NBR 6122",
    exportaveis: ["pdf", "xlsx"],
    icon: Square,
  },
  {
    key: "recalque-fundacao",
    nome: "Recalque de Fundação Rasa",
    descricao:
      "Estimativa de recalque de sapata: imediato (elástico e por fatias/Holl), por adensamento primário e compressão secundária. Verificação de ELS.",
    disciplina: "Fundações",
    tipo: "completa",
    norma: "NBR 6122",
    exportaveis: ["pdf", "xlsx"],
    icon: ArrowDownToLine,
  },
  {
    key: "estaca-spt",
    nome: "Estaca por SPT",
    descricao: "Capacidade de carga de estaca por Aoki-Velloso e Décourt-Quaresma, a partir do perfil de sondagem (SPT).",
    disciplina: "Fundações",
    tipo: "rapida",
    norma: "NBR 6122",
    exportaveis: ["pdf", "xlsx"],
    icon: Layers,
  },
  {
    key: "reservatorios",
    nome: "Reservatórios (inferior e superior)",
    descricao:
      "Pré-dimensiona reservatório inferior e superior pelo consumo diário e dias de reserva, com reserva técnica de incêndio opcional e área em planta pela altura útil.",
    disciplina: "Hidrossanitário",
    tipo: "rapida",
    norma: "NBR 5626 / NBR 13714",
    exportaveis: ["pdf", "docx", "xlsx"],
    exigeValidacao: true,
    icon: Droplets,
  },
  {
    key: "bomba-recalque",
    nome: "Bomba de Recalque",
    descricao:
      "Vazão pelo consumo diário e horas de funcionamento, diâmetros de recalque e sucção (Forchheimer), perda de carga, altura manométrica e potência do motor.",
    disciplina: "Hidrossanitário",
    tipo: "rapida",
    norma: "NBR 5626",
    exportaveis: ["pdf", "docx", "xlsx"],
    exigeValidacao: true,
    icon: ArrowUpFromLine,
  },
  {
    key: "bomba-piscina",
    nome: "Bomba de Piscina",
    descricao:
      "Volume, vazão pelo tempo de recirculação, diâmetros de sucção e retorno, perda de carga com os equipamentos, altura manométrica e potência do motor.",
    disciplina: "Hidrossanitário",
    tipo: "rapida",
    norma: "NBR 10339",
    exportaveis: ["pdf", "docx", "xlsx"],
    exigeValidacao: true,
    icon: Waves,
  },
  {
    key: "esgoto-infiltracao",
    nome: "Destino Final do Esgoto",
    descricao:
      "Sumidouro pelo teste de percolação: coeficiente de infiltração por furo, área necessária, profundidade por unidade e verificação do nível d'água da sondagem.",
    disciplina: "Hidrossanitário",
    tipo: "rapida",
    norma: "NBR 17076:2024",
    exportaveis: ["pdf", "docx", "xlsx"],
    exigeValidacao: true,
    icon: Shovel,
  },
  {
    key: "corrente-demanda",
    nome: "Corrente e Demanda",
    descricao:
      "Corrente de projeto, corrente corrigida (temperatura e agrupamento) e carga demandada por linha de carga, com a demanda total em kW e kVA.",
    disciplina: "Elétrico",
    tipo: "rapida",
    norma: "NBR 5410",
    exportaveis: ["pdf", "docx", "xlsx"],
    exigeValidacao: true,
    icon: PlugZap,
  },
  {
    key: "cargas-demanda",
    nome: "Cargas e demanda",
    descricao: "Demanda de edificações de múltiplas unidades por concessionária, a partir do levantamento de cargas, com entrada por CMD e CPG.",
    disciplina: "Elétrico",
    tipo: "completa",
    norma: "NBR 5410",
    exportaveis: ["docx", "xlsx", "pdf"],
    exigeValidacao: true,
    soEstudo: true,
    icon: PlugZap,
  },
];

export function getFerramenta(key: string): FerramentaMeta | undefined {
  return FERRAMENTAS.find((f) => f.key === key);
}

/** Versão do engine de cálculo da ferramenta (1 quando não declarada). */
export function versaoCalcDe(key: string): number {
  return getFerramenta(key)?.versaoCalc ?? 1;
}

export function porDisciplina(): Record<Disciplina, FerramentaMeta[]> {
  const map = {} as Record<Disciplina, FerramentaMeta[]>;
  for (const f of FERRAMENTAS) {
    if (f.soEstudo) continue; // só roda no módulo Estudos: não entra na galeria
    if (!map[f.disciplina]) map[f.disciplina] = [];
    map[f.disciplina].push(f);
  }
  return map;
}
