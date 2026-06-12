import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { auth } from "../src/lib/auth";

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
  // Perfis internos: veem projetos (escopo filtra para os seus)
  { role: "clt", recurso: "projetos", acao: "ver" },
  { role: "estagiario", recurso: "projetos", acao: "ver" },
  { role: "projetista_pj", recurso: "projetos", acao: "ver" },
  { role: "freelancer", recurso: "projetos", acao: "ver" },
  // Extrato próprio (sem ver o financeiro completo)
  { role: "clt", recurso: "financeiro", acao: "extrato" },
  { role: "projetista_pj", recurso: "financeiro", acao: "extrato" },
  { role: "freelancer", recurso: "financeiro", acao: "extrato" },
  { role: "cliente", recurso: "financeiro", acao: "extrato" },
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

const DISCIPLINAS_CATALOGO = [
  "Arquitetura",
  "Estrutural",
  "Hidrossanitário",
  "Elétrico",
  "Incêndio (PPCI)",
  "Climatização (AVAC)",
  "Fundações",
  "Terraplenagem",
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
    await prisma.disciplinaCatalogo.upsert({
      where: { nome: DISCIPLINAS_CATALOGO[i] },
      create: { nome: DISCIPLINAS_CATALOGO[i], ordem: i },
      update: { ordem: i },
    });
  }
  console.log(`✔ ${DISCIPLINAS_CATALOGO.length} disciplinas no catálogo.`);

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
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
