/**
 * Briefing de Start (Mód 3 do CONSELHO1) — porte do schema do sistema antigo
 * (`../SENAHub/lib/inputs/projeto-schema.ts`). PURO/cliente-safe: sem `server-only`,
 * Prisma ou React. As respostas são um objeto chave→valor salvo em `BriefingProjeto.respostasJson`.
 *
 * 7 seções: Dados Gerais e Declaração sempre aparecem; as demais são filtradas pelas
 * disciplinas ativas do projeto (ver `filtrarSecoes`).
 */
export type CampoTipo = "text" | "textarea" | "select" | "radio" | "checkbox" | "checkbox-single";

export interface CampoBriefing {
  chave: string;
  label: string;
  tipo: CampoTipo;
  obrigatorio: boolean;
  opcoes?: string[];
  placeholder?: string;
  hint?: string;
  /** Pré-popula a partir do cadastro do cliente. */
  importarDoCadastro?: "email" | "nome" | "telefone" | "endereco";
}

export interface SecaoBriefing {
  id: string;
  titulo: string;
  descricao?: string;
  campos: CampoBriefing[];
}

export const BRIEFING_SCHEMA: SecaoBriefing[] = [
  {
    id: "dados-gerais",
    titulo: "Dados Gerais",
    descricao: "Informações gerais sobre o responsável e o empreendimento.",
    campos: [
      { chave: "emailContato", label: "E-mail", tipo: "text", obrigatorio: true, importarDoCadastro: "email", placeholder: "email@exemplo.com" },
      { chave: "nomeCompleto", label: "Nome completo", tipo: "text", obrigatorio: true, importarDoCadastro: "nome" },
      { chave: "enderecoObra", label: "Endereço da obra", tipo: "text", obrigatorio: true, importarDoCadastro: "endereco", placeholder: "Rua, número, bairro, cidade – UF" },
      { chave: "telefoneContato", label: "Telefone para contato", tipo: "text", obrigatorio: true, importarDoCadastro: "telefone", placeholder: "(99) 99999-9999" },
      {
        chave: "tipoImovel",
        label: "Tipo do imóvel",
        tipo: "select",
        obrigatorio: true,
        hint: "Em caso de loja em centros comerciais, forneça o caderno técnico e planta técnica.",
        opcoes: ["Casa", "Prédio pequeno", "Prédio médio / grande, comercial ou hoteleiro", "Prédio médio / grande, multifamiliar", "Loja / Sala comercial", "Galpão"],
      },
      { chave: "areaConstruida", label: "Área construída aproximada (m²)", tipo: "text", obrigatorio: false, placeholder: "Ex: 250" },
      { chave: "quantidadePavimentos", label: "Quantidade de pavimentos", tipo: "text", obrigatorio: true, placeholder: "Ex: 2" },
      { chave: "possuiSubsolo", label: "Possui subsolo?", tipo: "radio", obrigatorio: true, opcoes: ["Sim", "Não"] },
      { chave: "coberturaUtilizada", label: "A cobertura será utilizada?", tipo: "radio", obrigatorio: true, opcoes: ["Sim", "Não"] },
      { chave: "usoImovel", label: "Uso do imóvel", tipo: "textarea", obrigatorio: false, placeholder: "Explique de forma simples o que funcionará no local. Ex: residência, academia, escritórios…" },
      {
        chave: "documentosFornecidos",
        label: "Documentos fornecidos",
        tipo: "checkbox",
        obrigatorio: true,
        opcoes: ["Planta do imóvel", "Projeto arquitetônico em 2D (sem modelo 3D)", "Projeto arquitetônico em 3D (com modelo 3D)", "Layout interno", "Pré-forma do estrutural com modelagem 3D", "Nenhum documento disponível"],
      },
      {
        chave: "equipamentosEspeciais",
        label: "Equipamentos e necessidades especiais",
        tipo: "checkbox",
        obrigatorio: false,
        hint: "Marque apenas o que estiver previsto ou decidido.",
        opcoes: ["Elevador", "Ar-condicionado", "Caixa d'água / reservatório", "Máquinas ou equipamentos pesados"],
      },
      { chave: "statusObra", label: "Qual o status da obra?", tipo: "radio", obrigatorio: true, opcoes: ["Obra não iniciada", "Obra em andamento"] },
    ],
  },
  {
    id: "estrutural",
    titulo: "Projeto Estrutural",
    descricao: "Preencher somente se o projeto estrutural foi contratado.",
    campos: [
      { chave: "tipoEstrutura", label: "Expectativa inicial para o tipo de estrutura", tipo: "select", obrigatorio: false, opcoes: ["Concreto armado", "Metálica", "Mista", "A definir"] },
      { chave: "equipamentosEstruturais", label: "Indicar na arquitetura a presença de (caso houver)", tipo: "checkbox", obrigatorio: false, opcoes: ["Reservatórios de água", "Casas de bombas / máquinas", "Geradores / transformadores", "Equipamentos de grande peso concentrado"] },
      { chave: "restricaoFuros", label: "Existe restrição para furos em lajes ou vigas?", tipo: "radio", obrigatorio: false, opcoes: ["Sim", "Não"] },
      { chave: "sondagemEnviada", label: "Foi enviada a sondagem?", tipo: "radio", obrigatorio: false, opcoes: ["Sim", "Não", "Em tramitação contratual"] },
      { chave: "infoAdicionaisEstrutura", label: "Alguma outra informação pertinente de impacto nas estruturas?", tipo: "textarea", obrigatorio: false },
    ],
  },
  {
    id: "eletrico",
    titulo: "Projeto Elétrico",
    descricao: "Preencher somente se o projeto elétrico foi contratado.",
    campos: [
      { chave: "concessionariaEnergia", label: "Concessionária de energia e tensão prevista", tipo: "text", obrigatorio: false, placeholder: "Ex: CEMIG — 127/220V trifásico" },
      { chave: "geradorNobreak", label: "Previsão de gerador ou nobreak", tipo: "radio", obrigatorio: false, opcoes: ["Sim", "Não"] },
      { chave: "infraCarroEletrico", label: "Deverá ser prevista infraestrutura para ponto de carro elétrico?", tipo: "radio", obrigatorio: false, opcoes: ["Sim", "Não", "Sim com mais de um ponto de carregamento"] },
      { chave: "energiaAuxiliar", label: "Existe alguma geração / fonte de energia auxiliar?", tipo: "select", obrigatorio: false, opcoes: ["Sim, fotovoltaico", "Sim, eólica", "Placas Solares (boiler)", "Não"] },
      { chave: "ambientesArCondicionado", label: "Em quais ambientes existe previsão de ar-condicionado?", tipo: "textarea", obrigatorio: false },
      { chave: "aparelhosCozinha", label: "Aparelhos previstos na cozinha", tipo: "checkbox", obrigatorio: false, opcoes: ["Cafeteira elétrica", "Cervejeira", "Adega", "Cooktop (indução, elétrico ou a gás)", "Forno (elétrico ou a gás)", "Micro-ondas", "Torre de tomadas", "Lava-louças", "Churrasqueira", "Coifa", "Geladeira", "Freezer", "Purificador de água", "Gela água"] },
      { chave: "banheiraHidromassagem", label: "Existe previsão de banheira de hidromassagem?", tipo: "radio", obrigatorio: false, opcoes: ["Sim", "Não"] },
      { chave: "espacoPadraoEntrada", label: "Existe espaço para o padrão de entrada de energia indicado na arquitetura?", tipo: "textarea", obrigatorio: false, placeholder: "Ex: Poste indicado na planta, medição na fachada lateral…" },
      { chave: "pontostelecomunicacoes", label: "Na planta de pontos constam as locações de telecomunicações (lógica)?", tipo: "radio", obrigatorio: false, opcoes: ["Sim", "Não"] },
    ],
  },
  {
    id: "hidrossanitario",
    titulo: "Projeto Hidrossanitário",
    descricao: "Preencher somente se o projeto hidrossanitário / drenagem foi contratado.",
    campos: [
      { chave: "abastecimentoAgua", label: "Tipo de abastecimento de água", tipo: "select", obrigatorio: false, opcoes: ["Rede pública", "Poço", "Outro"] },
      { chave: "sistemaEsgoto", label: "Sistema de esgoto", tipo: "select", obrigatorio: false, opcoes: ["Rede pública", "Fossa / filtro", "Elevatória"] },
      { chave: "reservatoriosArquitetura", label: "Reservatórios previstos e indicados na arquitetura?", tipo: "radio", obrigatorio: false, opcoes: ["Sim", "Não"] },
      { chave: "projetoDestinoFinalEsgoto", label: "Será necessário projeto de destino final de esgoto?", tipo: "radio", obrigatorio: false, opcoes: ["Sim", "Não"] },
      { chave: "previsaoEnvioPercolacao", label: "Previsão de envio do teste de percolação (se necessário)", tipo: "text", obrigatorio: false, placeholder: "Ex: Quinzena de junho" },
      { chave: "hidrometroArquitetura", label: "A arquitetura indica local para hidrômetro ou pena de entrega de água fria?", tipo: "radio", obrigatorio: false, opcoes: ["Sim", "Não"] },
      { chave: "projetoAguaQuente", label: "Será necessário projeto de água quente?", tipo: "radio", obrigatorio: false, opcoes: ["Sim", "Não"] },
      { chave: "piscinaAquecida", label: "Caso exista piscina, ela será aquecida?", tipo: "radio", obrigatorio: false, opcoes: ["Sim", "Não"] },
      { chave: "infoAdicionaisHidro", label: "Outras informações ou detalhes que podem interferir no projeto hidrossanitário", tipo: "textarea", obrigatorio: false },
    ],
  },
  {
    id: "incendio",
    titulo: "Prevenção e Combate a Incêndio",
    descricao: "Preencher somente se o projeto de combate a incêndio foi contratado.",
    campos: [
      { chave: "reservaTecnicaIncendio", label: "Reserva técnica de incêndio prevista?", tipo: "radio", obrigatorio: false, opcoes: ["Sim", "Não"] },
      { chave: "quadroAreasArquitetura", label: "Quadro de áreas está indicado na arquitetura?", tipo: "radio", obrigatorio: false, opcoes: ["Sim", "Não", "Irei passar a informação"] },
      { chave: "avcbPosObra", label: "Será necessário fazer o processo de AVCB pós-obra?", tipo: "radio", obrigatorio: false, opcoes: ["Sim", "Não"] },
      { chave: "cienteDocumentosAprovacao", label: "Ciente dos documentos necessários para aprovação do projeto", tipo: "checkbox-single", obrigatorio: false, opcoes: ["Ciente das informações a serem enviadas"] },
      { chave: "cienteDocumentosAvcb", label: "Ciente dos documentos necessários para AVCB", tipo: "checkbox-single", obrigatorio: false, opcoes: ["Ciente das informações a serem enviadas"] },
    ],
  },
  {
    id: "climatizacao",
    titulo: "Projeto de Climatização",
    descricao: "Preencher somente se o projeto de climatização foi contratado.",
    campos: [
      { chave: "sistemaClimatizacao", label: "Sistema já está definido?", tipo: "select", obrigatorio: false, opcoes: ["Sim, SPLIT", "Sim, VRF", "Sim, MULTISPLIT", "FANCOLETE", "FANCOIL", "Não definido"] },
      { chave: "premissasRestricoes", label: "Premissas, restrições e riscos", tipo: "textarea", obrigatorio: false, placeholder: "Informe qualquer condição que possa impactar prazo, custo ou solução técnica." },
    ],
  },
  {
    id: "declaracao",
    titulo: "Declaração de Start",
    descricao:
      "O início dos Projetos Complementares está condicionado ao recebimento das informações preenchidas e à validação dos levantamentos da edificação existente. " +
      "Alterações não mapeadas previamente poderão gerar revisões de prazo, escopo e custo.",
    campos: [
      {
        chave: "declaracaoStart",
        label: "Declaração",
        tipo: "checkbox-single",
        obrigatorio: true,
        opcoes: ["Declaro que as informações fornecidas neste formulário foram validadas para início dos projetos, estando ciente de que alterações posteriores poderão gerar revisões técnicas, impactos em prazo e ajustes de custo."],
      },
    ],
  },
];

/** Padrão de disciplina por seção (null = sempre visível). */
const DISCIPLINA_DA_SECAO: Record<string, RegExp | null> = {
  "dados-gerais": null,
  declaracao: null,
  estrutural: /estrutur/i,
  eletrico: /el[eé]tric/i,
  hidrossanitario: /hidro|sanit/i,
  incendio: /inc[eê]ndio|ppci|spda|combate/i,
  climatizacao: /climati|hvac|avac|ar.?condicionado/i,
};

/** Filtra as seções pelas disciplinas ativas do projeto (Dados Gerais e Declaração sempre entram). */
export function filtrarSecoes(disciplinasAtivas: string[] | undefined): SecaoBriefing[] {
  if (!disciplinasAtivas?.length) return BRIEFING_SCHEMA;
  return BRIEFING_SCHEMA.filter((s) => {
    const pattern = DISCIPLINA_DA_SECAO[s.id];
    if (!pattern) return true;
    return disciplinasAtivas.some((d) => pattern.test(d));
  });
}

export type ClientePrePopulavel = {
  email?: string | null;
  nome?: string;
  telefone?: string | null;
  endereco?: string | null;
};

/** Pré-popula campos marcados com `importarDoCadastro`, sem sobrescrever respostas existentes. */
export function prePopularRespostas(
  respostasExistentes: Record<string, unknown>,
  cliente: ClientePrePopulavel,
): Record<string, unknown> {
  const resultado = { ...respostasExistentes };
  for (const secao of BRIEFING_SCHEMA) {
    for (const campo of secao.campos) {
      if (!campo.importarDoCadastro) continue;
      if (resultado[campo.chave] !== undefined && resultado[campo.chave] !== "") continue;
      const valor = cliente[campo.importarDoCadastro];
      if (valor) resultado[campo.chave] = valor;
    }
  }
  return resultado;
}

export type StatusBriefing = "nao_iniciado" | "em_preenchimento" | "completo";

/** Status geral do briefing pelo preenchimento dos campos obrigatórios (de TODAS as seções). */
export function calcularStatusBriefing(respostas: Record<string, unknown>): StatusBriefing {
  const obrigatorios = BRIEFING_SCHEMA.flatMap((s) => s.campos).filter((c) => c.obrigatorio);
  const preenchidos = obrigatorios.filter((c) => {
    const v = respostas[c.chave];
    if (v === undefined || v === null || v === "") return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });
  if (preenchidos.length === 0) return "nao_iniciado";
  if (preenchidos.length === obrigatorios.length) return "completo";
  return "em_preenchimento";
}

/** Progresso de obrigatórios (preenchidos/total) considerando só as seções visíveis. */
export function progressoObrigatorios(
  respostas: Record<string, unknown>,
  secoes: SecaoBriefing[] = BRIEFING_SCHEMA,
): { preenchidos: number; total: number } {
  const obrigatorios = secoes.flatMap((s) => s.campos).filter((c) => c.obrigatorio);
  const preenchidos = obrigatorios.filter((c) => {
    const v = respostas[c.chave];
    if (v === undefined || v === null || v === "") return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });
  return { preenchidos: preenchidos.length, total: obrigatorios.length };
}
