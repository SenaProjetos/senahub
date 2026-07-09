import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { auth } from "../src/lib/auth";
import { docVazio, novoId, type DocSchema } from "../src/modules/documentos/schema";
import { MODALIDADES_PADRAO } from "../src/modules/licitacoes/modalidade";
import type { Prisma } from "../src/generated/prisma/client";

const ADMIN_EMAIL = "tadrio@senaprojetos.com.br";
const ADMIN_NAME = "Tádrio";
const ADMIN_SENHA_INICIAL = "SenaHub@2026";

/**
 * Matriz base de permissões finas (recurso:ação) por perfil.
 * admin tem bypass total no código — não precisa estar aqui.
 */
const PERMISSOES_BASE: { role: string; recurso: string; acao: string }[] = [
  // Supervisor: gestão ampla
  { role: "supervisor", recurso: "usuarios", acao: "gerir" },
  { role: "supervisor", recurso: "configuracoes", acao: "gerir" },
  { role: "supervisor", recurso: "clientes", acao: "ver" },
  { role: "supervisor", recurso: "clientes", acao: "gerir" },
  { role: "supervisor", recurso: "projetos", acao: "ver" },
  { role: "supervisor", recurso: "projetos", acao: "gerir" },
  { role: "supervisor", recurso: "uploads", acao: "validar" },
  { role: "supervisor", recurso: "financeiro", acao: "ver" },
  { role: "supervisor", recurso: "financeiro", acao: "gerir" },
  // Administrativo: configurações, usuários e clientes
  { role: "administrativo", recurso: "usuarios", acao: "gerir" },
  { role: "administrativo", recurso: "configuracoes", acao: "gerir" },
  { role: "administrativo", recurso: "clientes", acao: "ver" },
  { role: "administrativo", recurso: "clientes", acao: "gerir" },
  { role: "administrativo", recurso: "projetos", acao: "ver" },
  { role: "administrativo", recurso: "projetos", acao: "gerir" },
  { role: "administrativo", recurso: "financeiro", acao: "ver" },
  { role: "administrativo", recurso: "financeiro", acao: "gerir" },
  // RH — Pessoas (ficha 360): cadastro p/ gestores de RH; folha (salário) idem.
  { role: "supervisor", recurso: "rh", acao: "cadastro" },
  { role: "supervisor", recurso: "rh", acao: "folha" },
  { role: "administrativo", recurso: "rh", acao: "cadastro" },
  { role: "administrativo", recurso: "rh", acao: "folha" },
  // Arquivos gerais do projeto (pasta "Geral"): gestores administrativos por padrão.
  { role: "supervisor", recurso: "arquivos_gerais", acao: "ver" },
  { role: "supervisor", recurso: "arquivos_gerais", acao: "gerir" },
  { role: "administrativo", recurso: "arquivos_gerais", acao: "ver" },
  { role: "administrativo", recurso: "arquivos_gerais", acao: "gerir" },
  { role: "supervisor", recurso: "documentos", acao: "ver" },
  { role: "supervisor", recurso: "documentos", acao: "gerir" },
  { role: "administrativo", recurso: "documentos", acao: "ver" },
  { role: "administrativo", recurso: "documentos", acao: "gerir" },
  { role: "administrativo", recurso: "comercial", acao: "ver" },
  { role: "administrativo", recurso: "comercial", acao: "gerir" },
  { role: "supervisor", recurso: "comercial", acao: "ver" },
  // O5: jurídico, licitações, qualidade
  { role: "supervisor", recurso: "juridico", acao: "ver" },
  { role: "supervisor", recurso: "juridico", acao: "gerir" },
  { role: "administrativo", recurso: "juridico", acao: "ver" },
  { role: "administrativo", recurso: "juridico", acao: "gerir" },
  { role: "administrativo", recurso: "licitacoes", acao: "ver" },
  { role: "administrativo", recurso: "licitacoes", acao: "gerir" },
  { role: "supervisor", recurso: "licitacoes", acao: "ver" },
  { role: "supervisor", recurso: "qualidade", acao: "ver" },
  // O5: planejamento (ver p/ internos; gerir p/ gestores) e recursos (gestores)
  { role: "supervisor", recurso: "planejamento", acao: "ver" },
  { role: "supervisor", recurso: "planejamento", acao: "gerir" },
  { role: "administrativo", recurso: "planejamento", acao: "ver" },
  { role: "administrativo", recurso: "planejamento", acao: "gerir" },
  { role: "clt", recurso: "planejamento", acao: "ver" },
  { role: "estagiario", recurso: "planejamento", acao: "ver" },
  { role: "projetista_pj", recurso: "planejamento", acao: "ver" },
  { role: "supervisor", recurso: "recursos", acao: "ver" },
  { role: "supervisor", recurso: "recursos", acao: "gerir" },
  { role: "administrativo", recurso: "recursos", acao: "ver" },
  { role: "administrativo", recurso: "recursos", acao: "gerir" },
  // Perfis internos: veem projetos (escopo filtra para os seus)
  { role: "clt", recurso: "projetos", acao: "ver" },
  { role: "estagiario", recurso: "projetos", acao: "ver" },
  { role: "projetista_pj", recurso: "projetos", acao: "ver" },
  { role: "freelancer", recurso: "projetos", acao: "ver" },
  // P-60: cliente vê os próprios projetos (escopo via clienteId no escopoProjeto).
  { role: "cliente", recurso: "projetos", acao: "ver" },
  // Extrato próprio (sem ver o financeiro completo)
  { role: "clt", recurso: "financeiro", acao: "extrato" },
  { role: "projetista_pj", recurso: "financeiro", acao: "extrato" },
  { role: "freelancer", recurso: "financeiro", acao: "extrato" },
  { role: "cliente", recurso: "financeiro", acao: "extrato" },
  // Ferramentas de engenharia: internos usam; gestores também administram
  { role: "supervisor", recurso: "ferramentas", acao: "usar" },
  { role: "supervisor", recurso: "ferramentas", acao: "gerir" },
  { role: "administrativo", recurso: "ferramentas", acao: "usar" },
  { role: "administrativo", recurso: "ferramentas", acao: "gerir" },
  { role: "clt", recurso: "ferramentas", acao: "usar" },
  { role: "estagiario", recurso: "ferramentas", acao: "usar" },
  { role: "projetista_pj", recurso: "ferramentas", acao: "usar" },
  { role: "freelancer", recurso: "ferramentas", acao: "usar" },
  // Patrimônio (Mód 16): inventário p/ gestão; TI p/ papel `ti` + gestores.
  { role: "supervisor", recurso: "patrimonio", acao: "ver" },
  { role: "supervisor", recurso: "patrimonio", acao: "gerir" },
  { role: "supervisor", recurso: "patrimonio", acao: "ti" },
  { role: "administrativo", recurso: "patrimonio", acao: "ver" },
  { role: "administrativo", recurso: "patrimonio", acao: "gerir" },
  { role: "ti", recurso: "patrimonio", acao: "ver" },
  { role: "ti", recurso: "patrimonio", acao: "gerir" },
  { role: "ti", recurso: "patrimonio", acao: "ti" },
  // Ponto v2: supervisor mantém visão completa (equipe + rateio de custo).
  // administrativo perde `rateio` por padrão (dado de custo/margem) — decisão do
  // usuário; segue com espelho/escalas/ajustes (tarefas de RH do dia a dia).
  { role: "supervisor", recurso: "ponto", acao: "rateio" },
  { role: "supervisor", recurso: "ponto", acao: "espelho_equipe" },
  { role: "supervisor", recurso: "ponto", acao: "gerir_escalas" },
  { role: "supervisor", recurso: "ponto", acao: "ajustar" },
  { role: "administrativo", recurso: "ponto", acao: "espelho_equipe" },
  { role: "administrativo", recurso: "ponto", acao: "gerir_escalas" },
  { role: "administrativo", recurso: "ponto", acao: "ajustar" },
];

/** Plano de contas inicial. Códigos usados na auto-categorização de pagamentos. */
const PLANO_CONTAS: { codigo: string; nome: string; tipo: "receita" | "despesa"; pai?: string }[] = [
  { codigo: "1", nome: "Receitas", tipo: "receita" },
  { codigo: "1.01", nome: "Projetos particulares", tipo: "receita", pai: "1" },
  { codigo: "1.02", nome: "Licitações", tipo: "receita", pai: "1" },
  { codigo: "1.03", nome: "Outras receitas", tipo: "receita", pai: "1" },
  { codigo: "2", nome: "Despesas", tipo: "despesa" },
  { codigo: "2.01", nome: "Projetistas PJ", tipo: "despesa", pai: "2" },
  { codigo: "2.02", nome: "Freelancers", tipo: "despesa", pai: "2" },
  { codigo: "2.03", nome: "Folha CLT", tipo: "despesa", pai: "2" },
  { codigo: "2.04", nome: "Estagiários", tipo: "despesa", pai: "2" },
  { codigo: "2.05", nome: "Fornecedores externos", tipo: "despesa", pai: "2" },
  { codigo: "2.06", nome: "Despesas administrativas", tipo: "despesa", pai: "2" },
  { codigo: "2.07", nome: "Impostos", tipo: "despesa", pai: "2" },
  { codigo: "2.08", nome: "Pró-labore / retiradas", tipo: "despesa", pai: "2" },
];

const FORMAS_PAGAMENTO = ["PIX", "Transferência", "Boleto", "Dinheiro", "Cartão"];
const CENTROS_CUSTO = ["Operacional", "Administrativo", "Comercial"];

const RUBRICAS: { nome: string; tipo: "provento" | "desconto" }[] = [
  { nome: "Salário base", tipo: "provento" },
  { nome: "Horas extras", tipo: "provento" },
  { nome: "Bonificação", tipo: "provento" },
  { nome: "INSS", tipo: "desconto" },
  { nome: "IRRF", tipo: "desconto" },
  { nome: "Vale-transporte", tipo: "desconto" },
  { nome: "Adiantamento", tipo: "desconto" },
  { nome: "Faltas", tipo: "desconto" },
];

const TAREFA_STATUS = [
  { nome: "A fazer", cor: "#8B7FC7", concluido: false },
  { nome: "Em andamento", cor: "#4E9BB0", concluido: false },
  { nome: "Em revisão", cor: "#B0507A", concluido: false },
  { nome: "Concluído", cor: "#5FA083", concluido: true },
  // Terminal, mas NÃO conta como concluída (não libera dependentes nem entra em métrica de conclusão).
  { nome: "Cancelada", cor: "#6E838B", concluido: false },
];

const CERTIDAO_TIPOS = ["CND Federal", "CND Estadual", "CND Municipal", "FGTS", "Trabalhista", "ART/RRT"];

const FUNIL_ETAPAS = [
  { nome: "Orçamento", cor: "#8B7FC7" },
  { nome: "Em negociação", cor: "#4E9BB0" },
  { nome: "Proposta enviada", cor: "#C29A4B" },
  { nome: "Contratado", cor: "#5FA083" },
  { nome: "Perdido", cor: "#6E838B" },
];

const ONBOARDING_PADRAO = {
  nome: "Admissão padrão",
  itens: [
    "Assinar contrato de trabalho",
    "Entregar documentos pessoais (RG, CPF, comprovante de residência)",
    "Criar acesso ao SenaHub",
    "Configurar e-mail corporativo",
    "Apresentar equipe e projetos ativos",
    "Treinamento nos padrões de projeto da empresa",
    "Configurar softwares (CAD/BIM)",
  ],
};

// Item 15: catálogo com sigla (nomenclatura de arquivos) + categoria (agrupamento na UI).
const DISCIPLINAS_CATALOGO: { nome: string; codigo: string; categoria: string }[] = [
  { nome: "Terraplenagem", codigo: "TER", categoria: "CIVIL" },
  { nome: "Arquitetura", codigo: "ARQ", categoria: "ARQUITETURA" },
  { nome: "Estrutural", codigo: "EST", categoria: "ESTRUTURAL" },
  { nome: "Fundações", codigo: "FUN", categoria: "ESTRUTURAL" },
  { nome: "Elétrico", codigo: "ELE", categoria: "ELÉTRICA" },
  { nome: "Lógica", codigo: "LOG", categoria: "ELÉTRICA" },
  { nome: "CFTV", codigo: "CFT", categoria: "ELÉTRICA" },
  { nome: "Hidrossanitário", codigo: "HID", categoria: "HIDRÁULICA" },
  { nome: "Drenagem", codigo: "DRE", categoria: "HIDRÁULICA" },
  { nome: "Incêndio (PPCI)", codigo: "PCI", categoria: "SEGURANÇA" },
  { nome: "Climatização (AVAC)", codigo: "CLI", categoria: "MECÂNICA" },
];

async function main() {
  // 1) Admin
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (!existing) {
    const ctx = await auth.$context;
    const hash = await ctx.password.hash(ADMIN_SENHA_INICIAL);

    const user = await prisma.user.create({
      data: {
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        emailVerified: true,
        role: "admin",
        ativo: true,
        mustChangePassword: true,
      },
    });

    await prisma.account.create({
      data: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: hash,
      },
    });

    console.log(`✔ Admin criado: ${ADMIN_EMAIL} (senha inicial: ${ADMIN_SENHA_INICIAL}, troca obrigatória)`);
  } else {
    console.log(`• Admin já existe: ${ADMIN_EMAIL}`);
  }

  // 2) Permissões base
  for (const p of PERMISSOES_BASE) {
    await prisma.permissao.upsert({
      where: { role_recurso_acao: { role: p.role as never, recurso: p.recurso, acao: p.acao } },
      create: { role: p.role as never, recurso: p.recurso, acao: p.acao, permitido: true },
      update: {},
    });
  }
  console.log(`✔ ${PERMISSOES_BASE.length} permissões base garantidas.`);

  // 3) Catálogo de disciplinas
  for (let i = 0; i < DISCIPLINAS_CATALOGO.length; i++) {
    const d = DISCIPLINAS_CATALOGO[i];
    await prisma.disciplinaCatalogo.upsert({
      where: { nome: d.nome },
      create: { nome: d.nome, codigo: d.codigo, categoria: d.categoria, ordem: i },
      update: { codigo: d.codigo, categoria: d.categoria, ordem: i },
    });
  }
  console.log(`✔ ${DISCIPLINAS_CATALOGO.length} disciplinas no catálogo.`);

  // 3b) Catálogo da Lista Mestre (folha/tipo/fase) — siglas globais padrão.
  const LM_CATALOGO: { categoria: "folha" | "tipo" | "fase"; sigla: string; nome: string }[] = [
    { categoria: "folha", sigla: "A0", nome: "A0 (841×1189)" },
    { categoria: "folha", sigla: "A1", nome: "A1 (594×841)" },
    { categoria: "folha", sigla: "A2", nome: "A2 (420×594)" },
    { categoria: "folha", sigla: "A3", nome: "A3 (297×420)" },
    { categoria: "folha", sigla: "A4", nome: "A4 (210×297)" },
    { categoria: "fase", sigla: "EP", nome: "Estudo Preliminar" },
    { categoria: "fase", sigla: "AP", nome: "Anteprojeto" },
    { categoria: "fase", sigla: "PB", nome: "Projeto Básico" },
    { categoria: "fase", sigla: "PE", nome: "Projeto Executivo" },
    { categoria: "fase", sigla: "PL", nome: "Projeto Legal" },
    { categoria: "fase", sigla: "AB", nome: "As Built" },
    { categoria: "tipo", sigla: "PL", nome: "Planta" },
    { categoria: "tipo", sigla: "CO", nome: "Corte" },
    { categoria: "tipo", sigla: "VI", nome: "Vista" },
    { categoria: "tipo", sigla: "DE", nome: "Detalhe" },
    { categoria: "tipo", sigla: "ES", nome: "Esquema" },
    { categoria: "tipo", sigla: "DI", nome: "Diagrama" },
    { categoria: "tipo", sigla: "LC", nome: "Locação" },
    { categoria: "tipo", sigla: "MC", nome: "Memorial de Cálculo" },
  ];
  let lmCriados = 0;
  for (let i = 0; i < LM_CATALOGO.length; i++) {
    const c = LM_CATALOGO[i];
    // Sem unique com projetoId null; guarda por findFirst para manter idempotência.
    const existe = await prisma.pranchaCatalogo.findFirst({
      where: { categoria: c.categoria, sigla: c.sigla, projetoId: null },
      select: { id: true },
    });
    if (!existe) {
      await prisma.pranchaCatalogo.create({
        data: { categoria: c.categoria, sigla: c.sigla, nome: c.nome, ordem: i },
      });
      lmCriados++;
    }
  }
  console.log(`✔ Catálogo Lista Mestre: ${lmCriados} sigla(s) global(is) criada(s).`);

  // 4) Plano de contas (cria pais antes das filhas — array já ordenado)
  const idsPorCodigo = new Map<string, string>();
  for (let i = 0; i < PLANO_CONTAS.length; i++) {
    const c = PLANO_CONTAS[i];
    const cat = await prisma.categoriaFinanceira.upsert({
      where: { codigo: c.codigo },
      create: {
        codigo: c.codigo,
        nome: c.nome,
        tipo: c.tipo,
        ordem: i,
        paiId: c.pai ? idsPorCodigo.get(c.pai) : null,
      },
      update: { nome: c.nome, ordem: i, paiId: c.pai ? idsPorCodigo.get(c.pai) : null },
    });
    idsPorCodigo.set(c.codigo, cat.id);
  }
  console.log(`✔ ${PLANO_CONTAS.length} contas no plano de contas.`);

  // 5) Formas de pagamento
  for (let i = 0; i < FORMAS_PAGAMENTO.length; i++) {
    await prisma.formaPagamento.upsert({
      where: { nome: FORMAS_PAGAMENTO[i] },
      create: { nome: FORMAS_PAGAMENTO[i], ordem: i },
      update: {},
    });
  }

  // 6) Centros de custo
  for (let i = 0; i < CENTROS_CUSTO.length; i++) {
    await prisma.centroCusto.upsert({
      where: { nome: CENTROS_CUSTO[i] },
      create: { nome: CENTROS_CUSTO[i], ordem: i },
      update: {},
    });
  }
  console.log(`✔ ${FORMAS_PAGAMENTO.length} formas de pagamento, ${CENTROS_CUSTO.length} centros de custo.`);

  // 7) Rubricas da folha
  for (let i = 0; i < RUBRICAS.length; i++) {
    await prisma.rubricaFolha.upsert({
      where: { nome: RUBRICAS[i].nome },
      create: { nome: RUBRICAS[i].nome, tipo: RUBRICAS[i].tipo, ordem: i },
      update: { ordem: i },
    });
  }

  // 8) Template de onboarding padrão
  const tpl = await prisma.onboardingTemplate.upsert({
    where: { nome: ONBOARDING_PADRAO.nome },
    create: { nome: ONBOARDING_PADRAO.nome },
    update: {},
  });
  const itensExistentes = await prisma.onboardingTemplateItem.count({ where: { templateId: tpl.id } });
  if (itensExistentes === 0) {
    await prisma.onboardingTemplateItem.createMany({
      data: ONBOARDING_PADRAO.itens.map((descricao, i) => ({
        templateId: tpl.id,
        descricao,
        ordem: i,
      })),
    });
  }
  console.log(`✔ ${RUBRICAS.length} rubricas, template de onboarding garantido.`);

  // 8b) Status de tarefas + tipos de certidão (O5)
  for (let i = 0; i < TAREFA_STATUS.length; i++) {
    await prisma.tarefaStatus.upsert({
      where: { nome: TAREFA_STATUS[i].nome },
      create: { ...TAREFA_STATUS[i], ordem: i },
      update: { ordem: i, concluido: TAREFA_STATUS[i].concluido },
    });
  }
  for (const nome of CERTIDAO_TIPOS) {
    await prisma.certidaoTipo.upsert({ where: { nome }, create: { nome }, update: {} });
  }
  console.log(`✔ ${TAREFA_STATUS.length} status de tarefa, ${CERTIDAO_TIPOS.length} tipos de certidão.`);

  // 9) Etapas do funil comercial
  for (let i = 0; i < FUNIL_ETAPAS.length; i++) {
    await prisma.funilEtapa.upsert({
      where: { nome: FUNIL_ETAPAS[i].nome },
      create: { nome: FUNIL_ETAPAS[i].nome, cor: FUNIL_ETAPAS[i].cor, ordem: i },
      update: { ordem: i },
    });
  }
  console.log(`✔ ${FUNIL_ETAPAS.length} etapas do funil comercial.`);

  // 9b) Modalidades de licitação (lista config-driven, editável em Configurações)
  for (let i = 0; i < MODALIDADES_PADRAO.length; i++) {
    await prisma.modalidade.upsert({
      where: { nome: MODALIDADES_PADRAO[i] },
      create: { nome: MODALIDADES_PADRAO[i], ordem: i },
      update: {},
    });
  }
  console.log(`✔ ${MODALIDADES_PADRAO.length} modalidades de licitação.`);

  // 10) Modelos de documento exemplo (Estúdio de Documentos)
  const existeModeloProjeto = await prisma.documentoModelo.findFirst({
    where: { nome: "Relatório do projeto (exemplo)" },
  });
  if (!existeModeloProjeto) {
    const schema = modeloExemploProjeto();
    await prisma.documentoModelo.create({
      data: {
        nome: "Relatório do projeto (exemplo)",
        tipo: "relatorio",
        fonte: "projeto",
        schemaJson: schema as unknown as Prisma.InputJsonValue,
      },
    });
    console.log("✔ Modelo de documento exemplo (projeto) criado.");
  }

  const existeModeloLicitacao = await prisma.documentoModelo.findFirst({
    where: { nome: "Relatório de licitação (exemplo)" },
  });
  if (!existeModeloLicitacao) {
    const schema = modeloExemploLicitacao();
    await prisma.documentoModelo.create({
      data: {
        nome: "Relatório de licitação (exemplo)",
        tipo: "relatorio",
        fonte: "licitacao",
        schemaJson: schema as unknown as Prisma.InputJsonValue,
      },
    });
    console.log("✔ Modelo de documento exemplo (licitação) criado.");
  }
}

/** Layout exemplo: timbrado + dados do projeto + tabela de disciplinas + total. */
function modeloExemploProjeto(): DocSchema {
  const doc = docVazio();
  const estilo = (extra: Partial<DocSchema["bandas"][0]["elementos"][0]["estilo"]> = {}) => ({
    fontSize: 12,
    bold: false,
    italic: false,
    align: "left" as const,
    color: "",
    bg: "",
    borderW: 0,
    borderColor: "#1C2D58",
    radius: 0,
    fontFamily: "",
    borderStyle: "solida" as const,
    ...extra,
  });
  const el = (
    tipo: "label" | "campo" | "linha" | "retangulo" | "imagem",
    x: number,
    y: number,
    w: number,
    h: number,
    texto: string,
    e: Partial<ReturnType<typeof estilo>> = {},
  ) => ({ id: novoId(), tipo, x, y, w, h, texto, estilo: estilo(e), visivel: true, travado: false });

  doc.bandas = [
    {
      id: novoId(),
      tipo: "cabecalho",
      altura: 168,
      elementos: [
        el("imagem", 0, 8, 180, 48, "/MARCA/logo_completa_light.svg"),
        el("label", 0, 72, 420, 34, "RELATÓRIO DO PROJETO", { fontSize: 24, bold: true, color: "#1C2D58" }),
        el("campo", 0, 110, 420, 20, "[Codigo] · [Nome]", { fontSize: 13, color: "#576980" }),
        el("campo", 478, 72, 220, 18, "Cliente: [ClienteNome]", { fontSize: 11, align: "right" }),
        el("campo", 478, 92, 220, 18, "[ClienteDocumento]", { fontSize: 11, align: "right", color: "#6E838B" }),
        el("campo", 478, 112, 220, 18, "Emitido em [Hoje]", { fontSize: 11, align: "right", color: "#6E838B" }),
        el("linha", 0, 152, 698, 2, "", { bg: "#1C2D58" }),
      ],
    },
    {
      id: novoId(),
      tipo: "cabecalhoPagina",
      altura: 28,
      elementos: [
        el("retangulo", 0, 0, 698, 26, "", { bg: "#1C2D58" }),
        el("label", 8, 4, 300, 18, "Disciplina", { bold: true, color: "#FFFFFF", fontSize: 11 }),
        el("label", 320, 4, 120, 18, "Status", { bold: true, color: "#FFFFFF", fontSize: 11 }),
        el("label", 460, 4, 110, 18, "Responsáveis", { bold: true, color: "#FFFFFF", fontSize: 11 }),
        el("label", 590, 4, 100, 18, "Valor", { bold: true, color: "#FFFFFF", fontSize: 11, align: "right" }),
      ],
    },
    {
      id: novoId(),
      tipo: "detalhe",
      altura: 26,
      elementos: [
        el("campo", 8, 4, 300, 18, "[Disciplina]", { fontSize: 11 }),
        el("campo", 320, 4, 120, 18, "[Status]", { fontSize: 11, color: "#576980" }),
        el("campo", 460, 4, 110, 18, "[Responsaveis]", { fontSize: 10, color: "#6E838B" }),
        el("campo", 590, 4, 100, 18, "[Valor:c2]", { fontSize: 11, align: "right" }),
        el("linha", 0, 24, 698, 1, "", { bg: "#CACAC8" }),
      ],
    },
    {
      id: novoId(),
      tipo: "rodape",
      altura: 120,
      elementos: [
        el("label", 380, 12, 200, 22, "Total das disciplinas", { bold: true, align: "right" }),
        el("campo", 590, 12, 100, 22, "[Sum(Valor):c2]", { bold: true, align: "right", fontSize: 13 }),
        el("linha", 0, 64, 240, 1, "", { bg: "#1C2D58" }),
        el("label", 0, 70, 240, 16, "Assinatura / Responsável técnico", { fontSize: 10, color: "#6E838B" }),
        el("campo", 478, 70, 220, 16, "Sena Projetos · [Hoje]", { fontSize: 10, align: "right", color: "#6E838B" }),
      ],
    },
  ];
  return doc;
}

/** Layout exemplo: timbrado + dados da licitação + tabela de medições + totais. */
function modeloExemploLicitacao(): DocSchema {
  const doc = docVazio();
  const estilo = (extra: Partial<DocSchema["bandas"][0]["elementos"][0]["estilo"]> = {}) => ({
    fontSize: 12,
    bold: false,
    italic: false,
    align: "left" as const,
    color: "",
    bg: "",
    borderW: 0,
    borderColor: "#1C2D58",
    radius: 0,
    fontFamily: "",
    borderStyle: "solida" as const,
    ...extra,
  });
  const el = (
    tipo: "label" | "campo" | "linha" | "retangulo",
    x: number,
    y: number,
    w: number,
    h: number,
    texto: string,
    e: Partial<ReturnType<typeof estilo>> = {},
  ) => ({ id: novoId(), tipo, x, y, w, h, texto, estilo: estilo(e), visivel: true, travado: false });

  doc.bandas = [
    {
      id: novoId(),
      tipo: "cabecalho",
      altura: 160,
      elementos: [
        el("label", 0, 8, 420, 32, "RELATÓRIO DE LICITAÇÃO", { fontSize: 22, bold: true, color: "#1C2D58" }),
        el("campo", 0, 44, 520, 18, "[Orgao]", { fontSize: 12, color: "#576980" }),
        el("campo", 0, 66, 520, 18, "Edital nº [NumeroEdital] · [Modalidade]", { fontSize: 11, color: "#6E838B" }),
        el("campo", 0, 88, 520, 18, "Prazo da proposta: [PrazoProposta]", { fontSize: 11, color: "#6E838B" }),
        el("campo", 0, 110, 300, 18, "Contrato: [NumeroContrato]", { fontSize: 11 }),
        el("campo", 320, 110, 260, 18, "Status: [Status]", { fontSize: 11, align: "right" }),
        el("campo", 480, 44, 120, 18, "Emitido em [Hoje]", { fontSize: 11, align: "right", color: "#6E838B" }),
        el("linha", 0, 144, 698, 2, "", { bg: "#1C2D58" }),
      ],
    },
    {
      id: novoId(),
      tipo: "cabecalhoPagina",
      altura: 28,
      elementos: [
        el("retangulo", 0, 0, 698, 26, "", { bg: "#1C2D58" }),
        el("label", 8, 4, 60, 18, "Nº", { bold: true, color: "#FFFFFF", fontSize: 11 }),
        el("label", 80, 4, 380, 18, "Descrição", { bold: true, color: "#FFFFFF", fontSize: 11 }),
        el("label", 472, 4, 110, 18, "Data", { bold: true, color: "#FFFFFF", fontSize: 11 }),
        el("label", 590, 4, 100, 18, "Valor", { bold: true, color: "#FFFFFF", fontSize: 11, align: "right" }),
      ],
    },
    {
      id: novoId(),
      tipo: "detalhe",
      altura: 26,
      elementos: [
        el("campo", 8, 4, 60, 18, "[Numero]", { fontSize: 11 }),
        el("campo", 80, 4, 380, 18, "[Descricao]", { fontSize: 11 }),
        el("campo", 472, 4, 110, 18, "[Data]", { fontSize: 11, color: "#576980" }),
        el("campo", 590, 4, 100, 18, "[Valor:c2]", { fontSize: 11, align: "right" }),
        el("linha", 0, 24, 698, 1, "", { bg: "#CACAC8" }),
      ],
    },
    {
      id: novoId(),
      tipo: "rodape",
      altura: 100,
      elementos: [
        el("label", 380, 8, 200, 22, "Total medido", { align: "right", color: "#6E838B" }),
        el("campo", 590, 8, 100, 22, "[TotalMedido:c2]", { align: "right" }),
        el("label", 380, 32, 200, 22, "Valor homologado", { bold: true, align: "right" }),
        el("campo", 590, 32, 100, 22, "[ValorHomologado:c2]", { bold: true, align: "right", fontSize: 13 }),
        el("linha", 0, 68, 698, 1, "", { bg: "#CACAC8" }),
        el("campo", 0, 76, 698, 16, "Saldo contratual: [SaldoContratual:c2] · Vigência: [VigenciaFim]", { fontSize: 10, color: "#6E838B" }),
      ],
    },
  ];
  return doc;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
