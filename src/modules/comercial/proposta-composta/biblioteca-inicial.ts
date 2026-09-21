import type { SecaoProposta } from "@/generated/prisma/client";

/**
 * Semente da biblioteca de cláusulas e dos modelos de proposta (ADR-0006, G3).
 *
 * **De onde vem:** das 163 propostas reais analisadas em 2026-09-19
 * (`docs/superpowers/specs/2026-09-19-propostas-analise.md`). Cada texto abaixo é a variante MAIS
 * FREQUENTE da sua seção — o número entre colchetes no comentário é em quantas propostas ela
 * aparece. Não é texto inventado: é o que o escritório já escreve, para a gestão revisar e
 * ajustar em vez de começar do zero.
 *
 * **O que foi deliberadamente NÃO copiado do corpus:**
 * - Telefone, e-mail, CNPJ, razão social e dados bancários. Eles vazavam do rodapé para dentro do
 *   texto extraído, e são justamente o que circulava divergente (dois e-mails, duas contas). Agora
 *   vivem em `empresa.dados` e são lidos na hora de imprimir. O teste desta semente recusa
 *   qualquer cláusula que traga um deles de volta.
 * - Valores, prazos, validade e assinatura: são dados, não texto — saem calculados.
 * - Nome de concessionária em cláusula genérica: virou variante por UF (ver `escopo-eletrico-pe`).
 *
 * **Create-only por slug:** o `db:seed` roda em todo deploy e NÃO sobrescreve texto que a gestão
 * editou. Por isso o slug é o contrato — corrigir uma cláusula já publicada é slug novo
 * (`...-v2`) com a antiga desativada, nunca editar o texto daqui.
 */

export type ClausulaSemente = {
  slug: string;
  secao: SecaoProposta;
  titulo: string;
  texto: string;
  /** Nome exato no `DisciplinaCatalogo`; a semente ignora a cláusula se a disciplina não existir. */
  disciplina?: string;
  /** Variante por estado. Sem UF = genérica. */
  uf?: string;
  ordem: number;
};

export const CLAUSULAS_INICIAIS: ClausulaSemente[] = [
  // ── Escopo por disciplina (era "Considerações do projeto" nas propostas) ──────────────
  {
    slug: "escopo-instalacoes",
    secao: "escopo",
    titulo: "Instalações — escopo padrão",
    // [23x] a variante mais frequente da seção.
    texto:
      "Serão elaborados os Projetos de Instalações descritos nesta proposta, todos seguindo as normas técnicas brasileiras atuais. Projeto contendo planta baixa, cortes, detalhes e notas que permitam uma execução adequada. Serão fornecidas listas de quantitativos dos projetos e planilha LPU preenchida. Serão fornecidas as ARTs (Anotação de Responsabilidade Técnica) dos projetos.",
    ordem: 10,
  },
  {
    slug: "escopo-estrutural",
    secao: "escopo",
    titulo: "Estrutural com fundação",
    // [6x] — a fundação fica condicionada à sondagem, como o texto original já dizia.
    texto:
      "Projeto Estrutural em concreto armado, incluindo fundação. O tipo de fundação indicado nesta proposta é uma estimativa e será confirmado após a avaliação da sondagem do terreno. Fornecimento dos desenhos em meio digital fechado para plotagem. Serão fornecidos os quadros de aço e concreto e a lista de quantitativos.",
    disciplina: "Estrutural",
    ordem: 20,
  },
  {
    slug: "escopo-arquitetura",
    secao: "escopo",
    titulo: "Arquitetura — escopo padrão",
    // [10x]
    texto:
      "Será elaborado o Projeto Arquitetônico seguindo as normas técnicas brasileiras atuais, contendo planta baixa civil, planta de piso, planta de forro, planta de layout, planta de pontos elétricos, planta de comunicação visual, cortes, ampliação de áreas molhadas e detalhamentos. Será fornecido o RRT (Registro de Responsabilidade Técnica) do projeto arquitetônico.",
    disciplina: "Arquitetura",
    ordem: 20,
  },
  {
    slug: "escopo-eletrico",
    secao: "escopo",
    titulo: "Elétrico — escopo padrão (sem citar concessionária)",
    // Genérica: a versão do corpus nomeava a Neoenergia, que só atende alguns estados.
    texto:
      "Será elaborado o Projeto de Instalações Elétricas seguindo as normas técnicas brasileiras atuais e as normas específicas da concessionária local de energia. Projeto contendo planta baixa, cortes, detalhes e notas que permitam uma execução adequada, com lista de quantitativos.",
    disciplina: "Elétrico",
    ordem: 20,
  },
  {
    slug: "escopo-eletrico-pe",
    secao: "escopo",
    titulo: "Elétrico — Pernambuco (Neoenergia)",
    // [14x] no corpus, mas a concessionária é regional: vira variante de UF, não regra nacional.
    texto:
      "Será elaborado o Projeto de Instalações Elétricas seguindo as normas técnicas brasileiras atuais e as normas específicas da Neoenergia. Projeto contendo planta baixa, cortes, detalhes e notas que permitam uma execução adequada, com lista de quantitativos.",
    disciplina: "Elétrico",
    uf: "PE",
    ordem: 15,
  },
  {
    slug: "escopo-pci",
    secao: "escopo",
    titulo: "Prevenção e combate a incêndio — escopo padrão",
    texto:
      "Será elaborado o Projeto de Prevenção e Combate a Incêndio seguindo as normas técnicas brasileiras atuais e as exigências do Corpo de Bombeiros do estado da obra. Projeto contendo planta baixa, cortes, detalhes e notas que permitam uma execução adequada, com lista de quantitativos.",
    disciplina: "Incêndio (PPCI)",
    ordem: 20,
  },
  {
    slug: "escopo-pci-pe",
    secao: "escopo",
    titulo: "Prevenção e combate a incêndio — Pernambuco (COSCIP)",
    // [10x] — o COSCIP é de PE. Foi copiado para obra em AL nas propostas de Milagres; por isso
    // esta variante existe COM uf, e `escolherClausula` nunca a oferece a outro estado.
    texto:
      "Será elaborado o Projeto de Prevenção e Combate a Incêndio seguindo as normas técnicas brasileiras atuais e o Código de Segurança Contra Incêndio e Pânico de Pernambuco (COSCIP). Projeto contendo planta baixa, cortes, detalhes e notas que permitam uma execução adequada, com lista de quantitativos.",
    disciplina: "Incêndio (PPCI)",
    uf: "PE",
    ordem: 15,
  },

  // ── Observação sobre o valor ────────────────────────────────────────────────────────
  {
    slug: "valor-pacote-completo",
    secao: "valor_observacao",
    titulo: "Preço é de pacote, não é aditivo",
    // [23x + 5x] — as duas variantes diziam a mesma coisa; fica a que explicita a consequência.
    texto:
      "Os valores consideram a contratação de todos os itens listados. A contratação de disciplina isolada deverá ser objeto de novo orçamento.",
    ordem: 10,
  },

  // ── Observação sobre o pagamento ────────────────────────────────────────────────────
  {
    slug: "pagamento-sinal-e-boleto",
    secao: "pagamento_observacao",
    titulo: "Sinal por transferência, saldo por boleto",
    // [55x] a variante mais frequente de todas.
    texto:
      "O pagamento inicial (sinal) pode ser realizado por transferência ou depósito bancário, conforme o plano de pagamento acima. O pagamento final poderá ocorrer por boleto bancário.",
    ordem: 10,
  },
  {
    slug: "pagamento-transferencia",
    secao: "pagamento_observacao",
    titulo: "Somente transferência ou depósito",
    // [24x]
    texto:
      "O pagamento pode ser realizado por transferência ou depósito bancário, conforme combinado com a contratante.",
    ordem: 20,
  },
  {
    slug: "pagamento-prazo-aprovacao-orgao",
    secao: "pagamento_observacao",
    titulo: "Prazo de análise de órgão externo não conta como atraso",
    // [8x + 8x] — as duas observações do corpus, unificadas e sem nomear a concessionária.
    texto:
      "Os prazos que dependem de análise de órgão externo — Corpo de Bombeiros, concessionária de energia e demais aprovações — seguem o tempo de análise do próprio órgão e não estão incluídos nos prazos acima.",
    ordem: 30,
  },

  // ── Não incluso ─────────────────────────────────────────────────────────────────────
  {
    slug: "nao-incluso-padrao",
    secao: "nao_incluso",
    titulo: "Não incluso — padrão",
    // [97x] a cláusula mais repetida do corpus inteiro.
    texto:
      "Programação visual, maquetes físicas, custos com taxas, aprovações dos projetos perante órgãos competentes, cópias, certidões, execução e demais serviços não expressos nesta proposta.",
    ordem: 10,
  },
  {
    slug: "nao-incluso-com-ensaios",
    secao: "nao_incluso",
    titulo: "Não incluso — com ensaios e sondagem",
    // [6x + 4x + 2x]
    texto:
      "Ensaios técnicos, sondagem, testes de laboratório, escavação ou quebra de estruturas e pisos, programação visual, maquetes físicas, custos com taxas, aprovações dos projetos perante órgãos competentes, cópias, certidões, execução e demais serviços não expressos nesta proposta.",
    ordem: 20,
  },

  // ── Competências ────────────────────────────────────────────────────────────────────
  {
    slug: "competencia-contratada-padrao",
    secao: "competencia_contratada",
    titulo: "Competências da contratada — padrão",
    // [152x / 151x / 123x / 109x] — os quatro itens que aparecem em quase toda proposta.
    texto:
      "Avaliar os projetos de acordo com as Normas Técnicas Brasileiras atuais;\nEntregar os itens descritos nesta proposta no prazo combinado;\nFornecer à contratante os desenhos do projeto em meio digital fechado para plotagem;\nRegistrar a ART (Anotação de Responsabilidade Técnica) dos projetos.",
    ordem: 10,
  },
  {
    slug: "competencia-contratada-laudo",
    secao: "competencia_contratada",
    titulo: "Competências da contratada — laudo",
    // [9x + 7x] — variante de laudo: ART do laudo, entrega em meio digital.
    texto:
      "Avaliar as edificações de acordo com as Normas Técnicas Brasileiras atuais;\nEntregar os itens descritos nesta proposta no prazo combinado;\nFornecer à contratante o laudo em meio digital fechado para plotagem;\nRegistrar a ART (Anotação de Responsabilidade Técnica) do laudo.",
    ordem: 20,
  },
  {
    slug: "competencia-contratante-padrao",
    secao: "competencia_contratante",
    titulo: "Competências da contratante — padrão",
    // [144x / 102x / 78x / 61x / 44x]
    texto:
      "Seguir fielmente os projetos, atendendo às Normas referentes à execução na obra;\nFornecer o Projeto de Arquitetura em meio digital, contendo todos os detalhes importantes para o desenvolvimento dos projetos deste escopo, como pontos elétricos e iluminação;\nFornecer sondagem do terreno com quantidade de furos adequada conforme NBR;\nFornecer teste de absorção do terreno adequado conforme NBR, caso o projeto necessite de sumidouro;\nFazer os pagamentos nos prazos combinados.",
    ordem: 10,
  },

  // ── Alterações ──────────────────────────────────────────────────────────────────────
  {
    slug: "alteracoes-padrao",
    secao: "alteracoes",
    titulo: "Alterações posteriores à arquitetura",
    // [129x]
    texto:
      "Esta proposta não inclui eventuais alterações de projeto decorrentes de mudanças posteriores à entrega da arquitetura à contratante. Podem, entretanto, ser acordados honorários para a realização de tais modificações, que variarão de acordo com os serviços a serem feitos.",
    ordem: 10,
  },
  {
    slug: "alteracoes-pequenas-sem-custo",
    secao: "alteracoes",
    titulo: "Alterações — pequenas sem custo, grandes orçadas à parte",
    // [13x] — a redação mais nova do escritório.
    texto:
      "Pequenas alterações na arquitetura que não afetem de forma significativa a estrutura ou as instalações poderão ser analisadas e, a critério da contratada, ajustadas sem custo adicional. Modificações mais complexas, que impliquem redimensionamentos ou alterações de layout arquitetônico — como mudanças em paredes, vãos, escadas, piscina, reservatórios, pergolados ou elementos similares, especialmente após a entrega da pré-forma estrutural — serão consideradas retrabalho e orçadas à parte.",
    ordem: 20,
  },

  // ── Documentos necessários ──────────────────────────────────────────────────────────
  {
    slug: "documentos-aprovacao-pci",
    secao: "documentos",
    titulo: "Documentos para aprovação do PPCI",
    // [7x / 7x / 3x / 2x] das 8 propostas que têm a seção.
    texto:
      "Contrato social ou última alteração (cópia) e CNPJ;\nDocumentos do proprietário ou responsável legal: cópia do RG e CPF;\nProjeto de Arquitetura com layout, planta baixa, coberta, situação e cortes;\nProcuração ao responsável técnico para responder pelo processo, reconhecida em cartório;\nCaso seja necessária outra documentação, avisaremos com antecedência.",
    disciplina: "Incêndio (PPCI)",
    ordem: 10,
  },

  // ── Descrição ───────────────────────────────────────────────────────────────────────
  {
    slug: "descricao-abertura",
    secao: "descricao",
    titulo: "Abertura — objeto da proposta",
    // Não tem equivalente único no corpus (a descrição é escrita caso a caso); é um ponto de
    // partida com os tokens da obra, para a seção não nascer vazia.
    texto:
      "Apresentamos a proposta para elaboração dos projetos referentes à obra situada em [ObraEndereco], [Cidade]/[UF], conforme as disciplinas e valores descritos a seguir.",
    ordem: 10,
  },
];

export type SecaoDoModelo = {
  secao: SecaoProposta;
  /** Cláusula padrão desta seção. Ausente = seção nasce em branco para quem monta preencher. */
  clausulaSlug?: string;
  ordem: number;
};

export type ModeloSemente = {
  slug: string;
  nome: string;
  familia: string;
  descricao: string;
  secoes: SecaoDoModelo[];
  pagamento: { descricao: string; percentual: number; prazo?: string }[];
  validadeDias: number;
};

/**
 * Modelos por família. Os planos de pagamento são os mais usados no corpus (50/50, 40/30/30 e
 * 30/30/40, §2.3 da análise) — e agora somam 100% por construção: `calcularParcelas` recusa o que
 * não fecha, que é o erro que cobrou R$ 4.750 a mais de um cliente.
 */
export const MODELOS_INICIAIS: ModeloSemente[] = [
  {
    slug: "multidisciplinar",
    nome: "Projetos multidisciplinares",
    familia: "multidisciplinar",
    descricao: "Estrutural + instalações, o caso mais comum. Escopo por disciplina contratada.",
    secoes: [
      { secao: "descricao", clausulaSlug: "descricao-abertura", ordem: 10 },
      { secao: "escopo", clausulaSlug: "escopo-instalacoes", ordem: 20 },
      { secao: "valor_observacao", clausulaSlug: "valor-pacote-completo", ordem: 30 },
      { secao: "pagamento_observacao", clausulaSlug: "pagamento-sinal-e-boleto", ordem: 40 },
      { secao: "nao_incluso", clausulaSlug: "nao-incluso-padrao", ordem: 50 },
      { secao: "competencia_contratada", clausulaSlug: "competencia-contratada-padrao", ordem: 60 },
      { secao: "competencia_contratante", clausulaSlug: "competencia-contratante-padrao", ordem: 70 },
      { secao: "alteracoes", clausulaSlug: "alteracoes-padrao", ordem: 80 },
    ],
    pagamento: [
      { descricao: "Sinal, no aceite da proposta", percentual: 40, prazo: "à vista" },
      { descricao: "Entrega da pré-forma estrutural", percentual: 30 },
      { descricao: "Entrega dos projetos executivos", percentual: 30 },
    ],
    validadeDias: 30,
  },
  {
    slug: "estrutural",
    nome: "Projeto estrutural",
    familia: "estrutural",
    descricao: "Estrutural com fundação, disciplina única.",
    secoes: [
      { secao: "descricao", clausulaSlug: "descricao-abertura", ordem: 10 },
      { secao: "escopo", clausulaSlug: "escopo-estrutural", ordem: 20 },
      { secao: "pagamento_observacao", clausulaSlug: "pagamento-sinal-e-boleto", ordem: 30 },
      { secao: "nao_incluso", clausulaSlug: "nao-incluso-com-ensaios", ordem: 40 },
      { secao: "competencia_contratada", clausulaSlug: "competencia-contratada-padrao", ordem: 50 },
      { secao: "competencia_contratante", clausulaSlug: "competencia-contratante-padrao", ordem: 60 },
      { secao: "alteracoes", clausulaSlug: "alteracoes-pequenas-sem-custo", ordem: 70 },
    ],
    pagamento: [
      { descricao: "Sinal, no aceite da proposta", percentual: 50, prazo: "à vista" },
      { descricao: "Entrega do projeto", percentual: 50 },
    ],
    validadeDias: 30,
  },
  {
    slug: "pci-aprovacao",
    nome: "PCI e aprovação no Corpo de Bombeiros",
    familia: "pci",
    descricao: "Projeto de prevenção e combate a incêndio, com o processo de aprovação.",
    secoes: [
      { secao: "descricao", clausulaSlug: "descricao-abertura", ordem: 10 },
      { secao: "escopo", clausulaSlug: "escopo-pci", ordem: 20 },
      { secao: "pagamento_observacao", clausulaSlug: "pagamento-prazo-aprovacao-orgao", ordem: 30 },
      { secao: "documentos", clausulaSlug: "documentos-aprovacao-pci", ordem: 40 },
      { secao: "nao_incluso", clausulaSlug: "nao-incluso-padrao", ordem: 50 },
      { secao: "competencia_contratada", clausulaSlug: "competencia-contratada-padrao", ordem: 60 },
      { secao: "competencia_contratante", clausulaSlug: "competencia-contratante-padrao", ordem: 70 },
      { secao: "alteracoes", clausulaSlug: "alteracoes-padrao", ordem: 80 },
    ],
    pagamento: [
      { descricao: "Sinal, no aceite da proposta", percentual: 50, prazo: "à vista" },
      { descricao: "Entrada do processo no Corpo de Bombeiros", percentual: 50 },
    ],
    validadeDias: 30,
  },
  {
    slug: "laudo",
    nome: "Laudo técnico",
    familia: "laudo",
    descricao: "Laudo e vistoria — sem projeto executivo, ART do laudo.",
    secoes: [
      { secao: "descricao", clausulaSlug: "descricao-abertura", ordem: 10 },
      { secao: "pagamento_observacao", clausulaSlug: "pagamento-transferencia", ordem: 20 },
      { secao: "nao_incluso", clausulaSlug: "nao-incluso-com-ensaios", ordem: 30 },
      { secao: "competencia_contratada", clausulaSlug: "competencia-contratada-laudo", ordem: 40 },
      { secao: "competencia_contratante", clausulaSlug: "competencia-contratante-padrao", ordem: 50 },
    ],
    pagamento: [{ descricao: "Pagamento único, na entrega do laudo", percentual: 100 }],
    validadeDias: 20,
  },
];
