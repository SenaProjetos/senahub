/**
 * Briefing de Start (Mód 3 do CONSELHO1) — porte do schema do sistema antigo
 * (`../SENAHub/lib/inputs/projeto-schema.ts`). PURO/cliente-safe: sem `server-only`,
 * Prisma ou React. As respostas são um objeto chave→valor salvo em `BriefingProjeto.respostasJson`.
 *
 * `BRIEFING_SCHEMA` é o modelo PADRÃO EMBUTIDO (7 seções: Dados Gerais e Declaração sempre aparecem;
 * as demais são filtradas pelas disciplinas ativas do projeto — ver `filtrarSecoes`). Desde o Lote 4
 * o formulário vem de um `ModeloBriefing` no banco; esta constante semeia o modelo padrão e é o
 * último recurso enquanto o seed não rodou. Todas as funções recebem as `secoes` do modelo do projeto.
 */
import { CAMPOS, type NomeCampo } from "@/lib/campos";

export type CampoTipo = "text" | "textarea" | "select" | "radio" | "checkbox" | "checkbox-single" | "sim-nao";

/** Opções fixas do tipo `sim-nao` (a resposta é gravada como esse texto, igual aos radios Sim/Não antigos). */
export const OPCOES_SIM_NAO = ["Sim", "Não"] as const;

/**
 * Condição de uma pergunta: ela só aparece quando a pergunta `campo` (que vem ANTES no formulário e é de escolha)
 * tem como resposta alguma das opções de `igual` (em caixas de marcação, basta uma das marcadas estar em `igual`).
 */
export interface CondicaoCampo {
  campo: string;
  igual: string[];
}

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
  /** Campo do catálogo `lib/campos/` (só `tipo: "text"`): máscara na tela e validação ao gravar. */
  formato?: NomeCampo;
  /** Pergunta condicional (ver `CondicaoCampo`). Ausente = sempre aparece. */
  condicao?: CondicaoCampo;
  /**
   * SÓ DO EDITOR (nunca gravado): de qual opção SALVA veio cada opção de hoje (`null` = opção nova). É o que
   * permite migrar as respostas quando uma opção é renomeada. Acompanha `opcoes` posição a posição.
   */
  opcoesOrigem?: (string | null)[];
}

/** Tipos de pergunta que podem controlar outra (resposta de escolha). */
export const TIPOS_CONTROLADORES: readonly CampoTipo[] = ["radio", "select", "sim-nao", "checkbox"];

/** A resposta dada atende a condição? (resposta vazia nunca atende.) */
export function condicaoAtendida(condicao: CondicaoCampo, resposta: unknown): boolean {
  if (typeof resposta === "string") return resposta !== "" && condicao.igual.includes(resposta);
  if (Array.isArray(resposta)) return resposta.some((r) => typeof r === "string" && condicao.igual.includes(r));
  return false;
}

export interface SecaoBriefing {
  id: string;
  titulo: string;
  descricao?: string;
  /**
   * Termos que condicionam a seção: ela só aparece se o nome de alguma disciplina do projeto contém
   * algum termo (sem acento nem caixa). Ausente/vazio = sempre aparece.
   */
  disciplinas?: string[];
  campos: CampoBriefing[];
}

export const BRIEFING_SCHEMA: SecaoBriefing[] = [
  {
    id: "dados-gerais",
    titulo: "Dados Gerais",
    descricao: "Informações gerais sobre o responsável e o empreendimento.",
    campos: [
      { chave: "emailContato", label: "E-mail", tipo: "text", obrigatorio: true, importarDoCadastro: "email", formato: "email", placeholder: "email@exemplo.com" },
      { chave: "nomeCompleto", label: "Nome completo", tipo: "text", obrigatorio: true, importarDoCadastro: "nome" },
      { chave: "enderecoObra", label: "Endereço da obra", tipo: "text", obrigatorio: true, importarDoCadastro: "endereco", placeholder: "Rua, número, bairro, cidade – UF" },
      { chave: "telefoneContato", label: "Telefone para contato", tipo: "text", obrigatorio: true, importarDoCadastro: "telefone", formato: "telefone", placeholder: "(99) 99999-9999" },
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
    disciplinas: ["estrutur"],
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
    disciplinas: ["eletric"],
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
    disciplinas: ["hidro", "sanit"],
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
    disciplinas: ["incendio", "ppci", "spda", "combate"],
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
    disciplinas: ["climati", "hvac", "avac", "ar condicionado", "ar-condicionado", "arcondicionado"],
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

/** Minúsculas e sem acento — a comparação dos termos de disciplina não depende de como o nome foi digitado. */
export function normalizarTermo(t: string): string {
  return t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/**
 * Filtra as seções pelas disciplinas ativas do projeto: a seção sem `disciplinas` sempre entra; a
 * condicionada entra se alguma disciplina do projeto contém algum dos termos. Projeto sem
 * disciplina vê todas as seções.
 */
export function filtrarSecoes(
  disciplinasAtivas: string[] | undefined,
  secoes: readonly SecaoBriefing[] = BRIEFING_SCHEMA,
): SecaoBriefing[] {
  if (!disciplinasAtivas?.length) return [...secoes];
  const nomes = disciplinasAtivas.map(normalizarTermo);
  return secoes.filter((s) => {
    const termos = (s.disciplinas ?? []).map(normalizarTermo).filter(Boolean);
    if (termos.length === 0) return true;
    return nomes.some((n) => termos.some((t) => n.includes(t)));
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
  secoes: readonly SecaoBriefing[] = BRIEFING_SCHEMA,
): Record<string, unknown> {
  const resultado = { ...respostasExistentes };
  for (const secao of secoes) {
    for (const campo of secao.campos) {
      if (!campo.importarDoCadastro) continue;
      if (resultado[campo.chave] !== undefined && resultado[campo.chave] !== "") continue;
      const valor = cliente[campo.importarDoCadastro];
      if (!valor) continue;
      if (campo.formato) {
        // Cadastro antigo com e-mail/telefone fora do formato: o campo abre vazio, em vez de entrar como
        // resposta "alterada" (o servidor só aceita inválido que já estava gravado).
        if (!CAMPOS[campo.formato].validar(valor)) continue;
        resultado[campo.chave] = CAMPOS[campo.formato].normalizar(valor);
        continue;
      }
      resultado[campo.chave] = valor;
    }
  }
  return resultado;
}

export type StatusBriefing = "nao_iniciado" | "em_preenchimento" | "completo";

/** Seções e campos ocultos em UM projeto (`BriefingProjeto.secoesOcultas/camposOcultos`). */
export type OcultosBriefing = { secoes: readonly string[]; campos: readonly string[] };

export const SEM_OCULTOS: OcultosBriefing = { secoes: [], campos: [] };

/**
 * Aplica as condições das perguntas às respostas dadas: a pergunta condicional só fica se a controladora está
 * visível (antes dela, na ordem do formulário) e a resposta atende a condição — então a cadeia de condições funciona e uma
 * controladora oculta (por condição, disciplina ou ocultação do projeto) esconde quem depende dela. Seção que ficou sem
 * pergunta sai. É a regra única da tela, do envio, do status e do link público.
 */
export function aplicarCondicoes(secoes: readonly SecaoBriefing[], respostas: Record<string, unknown>): SecaoBriefing[] {
  const visiveis = new Set<string>();
  const saida: SecaoBriefing[] = [];
  for (const s of secoes) {
    const campos = s.campos.filter((c) => {
      const ok = !c.condicao || (visiveis.has(c.condicao.campo) && condicaoAtendida(c.condicao, respostas[c.condicao.campo]));
      if (ok) visiveis.add(c.chave);
      return ok;
    });
    if (campos.length > 0 || s.campos.length === 0) saida.push(campos.length === s.campos.length ? s : { ...s, campos });
  }
  return saida;
}

/**
 * Tira das seções o que o projeto ocultou: a seção oculta sai inteira, o campo oculto sai da
 * sua seção, e a seção que ficou sem campo nenhum sai também. É a regra única do que o cliente
 * vê, do que a equipe preenche e do que conta no status.
 */
export function aplicarOcultos(secoes: readonly SecaoBriefing[], ocultos: OcultosBriefing): SecaoBriefing[] {
  const secoesOcultas = new Set(ocultos.secoes);
  const camposOcultos = new Set(ocultos.campos);
  return secoes
    .filter((s) => !secoesOcultas.has(s.id))
    .map((s) => ({ ...s, campos: s.campos.filter((c) => !camposOcultos.has(c.chave)) }))
    .filter((s) => s.campos.length > 0);
}

/**
 * O que UM projeto mostra do formulário do modelo: filtra pelas disciplinas ativas e tira as ocultações. É a regra
 * única da tela, do link público, do envio e do status gravado — quem decide "obrigatória que conta" não pode ver
 * mais perguntas que o cliente.
 */
export function secoesDoProjeto(
  secoesDoModelo: readonly SecaoBriefing[],
  disciplinasAtivas: string[] | undefined,
  ocultos: OcultosBriefing,
): SecaoBriefing[] {
  return aplicarOcultos(filtrarSecoes(disciplinasAtivas, secoesDoModelo), ocultos);
}

/**
 * Respostas a gravar: as já gravadas, com o que veio no envio APENAS para os campos visíveis.
 * Campo oculto (ou chave desconhecida) no envio é ignorado, e campo ausente do envio fica como
 * estava — o envio nunca apaga a resposta guardada de um campo que a tela não mostra.
 */
export function mesclarRespostasVisiveis(
  anteriores: Record<string, unknown>,
  enviadas: Record<string, unknown>,
  visiveis: readonly SecaoBriefing[],
): Record<string, unknown> {
  const resultado = { ...anteriores };
  // Pergunta condicional oculta não grava: a condição é avaliada NA ORDEM, com o que o próprio envio já mudou.
  const naTela = new Set<string>();
  for (const campo of visiveis.flatMap((s) => s.campos)) {
    const aparece = !campo.condicao || (naTela.has(campo.condicao.campo) && condicaoAtendida(campo.condicao, resultado[campo.condicao.campo]));
    if (!aparece) continue;
    naTela.add(campo.chave);
    if (!Object.hasOwn(enviadas, campo.chave)) continue;
    const v = respostaValida(campo, enviadas[campo.chave]);
    if (v.ok) resultado[campo.chave] = v.valor;
  }
  return resultado;
}

/**
 * Campos que o envio trouxe e `mesclarRespostasVisiveis` NÃO gravou, para a tela avisar em vez de mostrar "salvo":
 * campo que o projeto deixou de mostrar (a equipe ocultou enquanto o formulário estava aberto) ou valor que o tipo do
 * campo não aceita (opção que mudou). Pergunta condicional escondida não conta — a tela do cliente também a esconde.
 * Valor vazio ou igual ao já gravado não perde nada e não entra. Devolve os rótulos, sem repetir.
 */
export function camposDescartadosNoEnvio(
  anteriores: Record<string, unknown>,
  enviadas: Record<string, unknown>,
  doModelo: readonly SecaoBriefing[],
  visiveis: readonly SecaoBriefing[],
): string[] {
  const chavesVisiveis = new Set(visiveis.flatMap((s) => s.campos.map((c) => c.chave)));
  const vazio = (v: unknown) => v == null || v === "" || v === false || (Array.isArray(v) && v.length === 0);
  const rotulos = new Set<string>();
  for (const campo of doModelo.flatMap((s) => s.campos)) {
    if (!Object.hasOwn(enviadas, campo.chave)) continue;
    const v = enviadas[campo.chave];
    if (vazio(v) || JSON.stringify(v) === JSON.stringify(anteriores[campo.chave])) continue;
    if (!chavesVisiveis.has(campo.chave) || !respostaValida(campo, v).ok) rotulos.add(campo.label);
  }
  return [...rotulos];
}

/** Limite de tamanho de uma resposta de texto (o link público é aberto ao mundo). */
export const LIMITE_TEXTO_RESPOSTA = 5000;

/**
 * Confere a resposta enviada com o TIPO do campo: texto é string curta, escolha única é uma das
 * opções (ou vazio), caixas é lista de opções, caixa de ciência é boolean. O que não bate é
 * descartado (a resposta guardada fica como estava) — o link público não aceita objeto, lista em
 * campo de texto nem opção inventada.
 */
export function respostaValida(campo: CampoBriefing, v: unknown): { ok: true; valor: unknown } | { ok: false } {
  const opcoes: readonly string[] = campo.tipo === "sim-nao" ? OPCOES_SIM_NAO : (campo.opcoes ?? []);
  switch (campo.tipo) {
    case "text":
    case "textarea":
      return typeof v === "string" && v.length <= LIMITE_TEXTO_RESPOSTA ? { ok: true, valor: v } : { ok: false };
    case "radio":
    case "select":
    case "sim-nao":
      return typeof v === "string" && (v === "" || opcoes.includes(v)) ? { ok: true, valor: v } : { ok: false };
    case "checkbox":
      return Array.isArray(v) && v.length <= opcoes.length && v.every((x) => typeof x === "string" && opcoes.includes(x))
        ? { ok: true, valor: [...new Set(v as string[])] }
        : { ok: false };
    case "checkbox-single":
      return typeof v === "boolean" ? { ok: true, valor: v } : { ok: false };
    default:
      return { ok: false };
  }
}

/**
 * Só as respostas dos campos que o projeto mostra — o que vai ao navegador do cliente no link. Campo oculto pela equipe
 * ou de outra disciplina não sai; pergunta condicional escondida SAI (a resposta é do próprio cliente): sem ela, a tela
 * avaliaria as condições sobre menos respostas que o servidor, e mostraria vazia, ao reaparecer, a pergunta que o
 * status já conta como respondida.
 */
export function respostasVisiveis(
  respostas: Record<string, unknown>,
  visiveis: readonly SecaoBriefing[],
): Record<string, unknown> {
  const chaves = new Set(visiveis.flatMap((s) => s.campos.map((c) => c.chave)));
  return Object.fromEntries(Object.entries(respostas).filter(([k]) => chaves.has(k)));
}

/** A chave existe no briefing (seção pelo `id`, campo pela `chave`)? */
export function existeNoBriefing(
  alvo: "secao" | "campo",
  chave: string,
  secoes: readonly SecaoBriefing[] = BRIEFING_SCHEMA,
): boolean {
  return alvo === "secao"
    ? secoes.some((s) => s.id === chave)
    : secoes.some((s) => s.campos.some((c) => c.chave === chave));
}

function respondido(v: unknown): boolean {
  if (v === undefined || v === null || v === "" || v === false) return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * A pergunta conta como respondida? Escolha só com uma opção que ainda existe (opção removida ou tipo trocado a tela
 * mostra vazio, e o status não pode dizer "completo"). Texto e caixa de ciência seguem o que a tela mostra.
 */
function respondidaNoCampo(c: CampoBriefing, v: unknown): boolean {
  if (!respondido(v)) return false;
  const opcoes: readonly string[] = c.tipo === "sim-nao" ? OPCOES_SIM_NAO : (c.opcoes ?? []);
  switch (c.tipo) {
    case "radio":
    case "select":
    case "sim-nao":
      return typeof v === "string" && opcoes.includes(v);
    case "checkbox":
      return Array.isArray(v) && v.some((x) => typeof x === "string" && opcoes.includes(x));
    default:
      return true;
  }
}

/**
 * Status geral do briefing pelo preenchimento dos campos obrigatórios das `secoes` (padrão: TODAS;
 * com campos ocultos, passe `aplicarOcultos(BRIEFING_SCHEMA, ocultos)`). Sem obrigatório visível,
 * completo = alguma resposta nos campos visíveis.
 */
export function calcularStatusBriefing(
  respostas: Record<string, unknown>,
  secoes: readonly SecaoBriefing[] = BRIEFING_SCHEMA,
): StatusBriefing {
  const campos = aplicarCondicoes(secoes, respostas).flatMap((s) => s.campos);
  const obrigatorios = campos.filter((c) => c.obrigatorio);
  if (obrigatorios.length === 0) {
    return campos.some((c) => respondidaNoCampo(c, respostas[c.chave])) ? "completo" : "nao_iniciado";
  }
  const preenchidos = obrigatorios.filter((c) => respondidaNoCampo(c, respostas[c.chave]));
  if (preenchidos.length === 0) return "nao_iniciado";
  if (preenchidos.length === obrigatorios.length) return "completo";
  return "em_preenchimento";
}

/** Progresso de obrigatórios (preenchidos/total) considerando só as seções visíveis. */
export function progressoObrigatorios(
  respostas: Record<string, unknown>,
  secoes: SecaoBriefing[] = BRIEFING_SCHEMA,
): { preenchidos: number; total: number } {
  const obrigatorios = aplicarCondicoes(secoes, respostas).flatMap((s) => s.campos).filter((c) => c.obrigatorio);
  const preenchidos = obrigatorios.filter((c) => respondidaNoCampo(c, respostas[c.chave]));
  return { preenchidos: preenchidos.length, total: obrigatorios.length };
}
