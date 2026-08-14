import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { auth } from "../src/lib/auth";
import { docVazio, novoId, type DocSchema } from "../src/modules/documentos/schema";
import { MODALIDADES_PADRAO } from "../src/modules/licitacoes/modalidade";
import { semearEscalaRolePadrao, semearEscalaContratacao } from "./escalas-padrao";
import { feriadosNacionais } from "../src/modules/rh/feriados/queries";
import { seedPerfisAcesso } from "./seed-perfis-acesso";
import type { Prisma } from "../src/generated/prisma/client";

const ADMIN_EMAIL = "tadrio@senaprojetos.com.br";
const ADMIN_NAME = "Tádrio";
const ADMIN_SENHA_INICIAL = "SenaHub@2026";

/**
 * Matriz base de permissões finas (recurso:ação) por perfil.
 * admin tem bypass total no código — não precisa estar aqui.
 */
const PERMISSOES_BASE: { role: string; recurso: string; acao: string }[] = [
  // Chat — espelha `CHAT_ROLES` (cliente, freelancer e ti ficam de fora, regra de negócio).
  // Virou permissão na Onda D para o menu deixar de depender de `roles[]`.
  { role: "admin", recurso: "chat", acao: "usar" },
  { role: "supervisor", recurso: "chat", acao: "usar" },
  { role: "administrativo", recurso: "chat", acao: "usar" },
  { role: "clt", recurso: "chat", acao: "usar" },
  { role: "estagiario", recurso: "chat", acao: "usar" },
  { role: "projetista_pj", recurso: "chat", acao: "usar" },
  // ── Coordenador (valor do enum: `supervisor`) ────────────────────────────────
  // Lista definida pelo dono em 2026-07-27, conferida contra Configurações → Permissões.
  // Recorte de COORDENAÇÃO TÉCNICA: projeto, arquivos, planejamento, coordenação BIM,
  // recursos, ferramentas e biblioteca. Deliberadamente FORA: clientes, financeiro,
  // comercial, jurídico, licitações, arquivos gerais, Estúdio de Documentos, usuários,
  // configurações, avisos, permissões, patrimônio, RH-pessoas, e a administração de
  // ponto (mantém só `rateio`, que é custo de projeto).
  // Estas 20 linhas viram a matriz semente do perfil `coordenador` na Onda B
  // (docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md).
  // ATENÇÃO: o escopo GLOBAL de dados não vem daqui — vem de `GLOBAL_ROLES`
  // (`lib/roles.ts`), que é código, não esta matriz.
  { role: "supervisor", recurso: "projetos", acao: "ver" },
  { role: "supervisor", recurso: "projetos", acao: "gerir" },
  { role: "supervisor", recurso: "projetos", acao: "historico" },
  { role: "supervisor", recurso: "uploads", acao: "validar" },
  { role: "supervisor", recurso: "arquivos", acao: "ver" },
  { role: "supervisor", recurso: "arquivos", acao: "baixar" },
  { role: "supervisor", recurso: "arquivos", acao: "ver_todas_disciplinas" },
  { role: "supervisor", recurso: "arquivos", acao: "enviar" },
  { role: "supervisor", recurso: "qualidade", acao: "ver" },
  { role: "supervisor", recurso: "planejamento", acao: "ver" },
  { role: "supervisor", recurso: "planejamento", acao: "gerir" },
  { role: "supervisor", recurso: "coordenacao", acao: "ver" },
  { role: "supervisor", recurso: "coordenacao", acao: "gerir" },
  { role: "supervisor", recurso: "recursos", acao: "ver" },
  { role: "supervisor", recurso: "recursos", acao: "gerir" },
  { role: "supervisor", recurso: "ferramentas", acao: "usar" },
  { role: "supervisor", recurso: "ferramentas", acao: "gerir" },
  { role: "supervisor", recurso: "biblioteca_tecnica", acao: "ver" },
  { role: "supervisor", recurso: "biblioteca_tecnica", acao: "incluir" },
  { role: "supervisor", recurso: "custos", acao: "ver" },
  { role: "supervisor", recurso: "custos", acao: "gerir" },
  { role: "supervisor", recurso: "ponto", acao: "rateio" },
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
  // Coordenador NÃO entra: ficha de pessoas e salário ficam com admin + administrativo.
  { role: "administrativo", recurso: "rh", acao: "cadastro" },
  { role: "administrativo", recurso: "rh", acao: "folha" },
  // Catálogos de cargo/departamento: quem cadastra pessoa precisa manter as listas.
  { role: "administrativo", recurso: "rh", acao: "catalogos" },
  // Arquivos gerais do projeto (pasta "Geral"): gestores administrativos por padrão.
  { role: "administrativo", recurso: "arquivos_gerais", acao: "ver" },
  { role: "administrativo", recurso: "arquivos_gerais", acao: "gerir" },
  // Arquivos do projeto (Diretório + muralha por disciplina). `ver_todas_disciplinas`
  // separa internos (veem tudo do projeto) de externos (só a própria disciplina):
  // projetista_pj/freelancer NÃO recebem essa ação → só disciplinas onde são responsáveis.
  { role: "administrativo", recurso: "arquivos", acao: "ver" },
  { role: "administrativo", recurso: "arquivos", acao: "baixar" },
  { role: "administrativo", recurso: "arquivos", acao: "ver_todas_disciplinas" },
  { role: "administrativo", recurso: "arquivos", acao: "enviar" },
  { role: "clt", recurso: "arquivos", acao: "ver" },
  { role: "clt", recurso: "arquivos", acao: "baixar" },
  { role: "clt", recurso: "arquivos", acao: "ver_todas_disciplinas" },
  { role: "clt", recurso: "arquivos", acao: "enviar" },
  { role: "estagiario", recurso: "arquivos", acao: "ver" },
  { role: "estagiario", recurso: "arquivos", acao: "baixar" },
  { role: "estagiario", recurso: "arquivos", acao: "ver_todas_disciplinas" },
  { role: "estagiario", recurso: "arquivos", acao: "enviar" },
  { role: "projetista_pj", recurso: "arquivos", acao: "ver" },
  { role: "projetista_pj", recurso: "arquivos", acao: "baixar" },
  { role: "projetista_pj", recurso: "arquivos", acao: "enviar" },
  { role: "freelancer", recurso: "arquivos", acao: "ver" },
  { role: "freelancer", recurso: "arquivos", acao: "baixar" },
  { role: "freelancer", recurso: "arquivos", acao: "enviar" },
  { role: "administrativo", recurso: "documentos", acao: "ver" },
  { role: "administrativo", recurso: "documentos", acao: "gerir" },
  { role: "administrativo", recurso: "comercial", acao: "ver" },
  { role: "administrativo", recurso: "comercial", acao: "gerir" },
  // O5: jurídico, licitações, qualidade
  { role: "administrativo", recurso: "juridico", acao: "ver" },
  { role: "administrativo", recurso: "juridico", acao: "gerir" },
  { role: "administrativo", recurso: "certidoes", acao: "ver" },
  { role: "administrativo", recurso: "certidoes", acao: "gerir" },
  { role: "administrativo", recurso: "licitacoes", acao: "ver" },
  { role: "administrativo", recurso: "licitacoes", acao: "gerir" },
  // O5: planejamento (ver p/ internos; gerir p/ gestores) e recursos (gestores)
  { role: "administrativo", recurso: "planejamento", acao: "ver" },
  { role: "administrativo", recurso: "planejamento", acao: "gerir" },
  { role: "clt", recurso: "planejamento", acao: "ver" },
  { role: "estagiario", recurso: "planejamento", acao: "ver" },
  { role: "projetista_pj", recurso: "planejamento", acao: "ver" },
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
  { role: "administrativo", recurso: "ferramentas", acao: "usar" },
  { role: "administrativo", recurso: "ferramentas", acao: "gerir" },
  { role: "clt", recurso: "ferramentas", acao: "usar" },
  { role: "estagiario", recurso: "ferramentas", acao: "usar" },
  { role: "projetista_pj", recurso: "ferramentas", acao: "usar" },
  { role: "freelancer", recurso: "ferramentas", acao: "usar" },
  // Engenharia de Custos: administrativo administra tudo (inclui bancos/cotações —
  // base de preço corrompida contamina todo orçamento, por isso `bancos` é separado);
  // demais internos só `ver`. `ti` e `cliente` ficam fora.
  { role: "administrativo", recurso: "custos", acao: "ver" },
  { role: "administrativo", recurso: "custos", acao: "gerir" },
  { role: "administrativo", recurso: "custos", acao: "bancos" },
  { role: "administrativo", recurso: "custos", acao: "cotacao" },
  { role: "clt", recurso: "custos", acao: "ver" },
  { role: "estagiario", recurso: "custos", acao: "ver" },
  { role: "projetista_pj", recurso: "custos", acao: "ver" },
  { role: "freelancer", recurso: "custos", acao: "ver" },
  // Patrimônio (Mód 16): inventário p/ gestão; TI p/ papel `ti` + gestores.
  // Coordenador fora: patrimônio é administrativo/TI, não coordenação técnica.
  { role: "administrativo", recurso: "patrimonio", acao: "ver" },
  { role: "administrativo", recurso: "patrimonio", acao: "gerir" },
  { role: "ti", recurso: "patrimonio", acao: "ver" },
  { role: "ti", recurso: "patrimonio", acao: "gerir" },
  { role: "ti", recurso: "patrimonio", acao: "ti" },
  // Ponto v2: coordenador fica só com `rateio` (custo de projeto), no bloco acima.
  // A administração do ponto (espelho de terceiros, escalas, ajuste de batida) é do
  // administrativo — que por sua vez não vê `rateio`, por ser dado de custo/margem.
  { role: "administrativo", recurso: "ponto", acao: "espelho_equipe" },
  { role: "administrativo", recurso: "ponto", acao: "gerir_escalas" },
  { role: "administrativo", recurso: "ponto", acao: "ajustar" },
  // Coordenação BIM: internos veem a maquete federada (escopo de projeto filtra);
  // gestores gerem (apontamentos, conversão, BCF). Cliente fora no v1 (portal é F7).
  { role: "administrativo", recurso: "coordenacao", acao: "ver" },
  { role: "administrativo", recurso: "coordenacao", acao: "gerir" },
  { role: "clt", recurso: "coordenacao", acao: "ver" },
  { role: "estagiario", recurso: "coordenacao", acao: "ver" },
  { role: "projetista_pj", recurso: "coordenacao", acao: "ver" },
  { role: "freelancer", recurso: "coordenacao", acao: "ver" },
  // Biblioteca técnica (Engenharia): todos internos veem e incluem padrões/normas;
  // editar/excluir de terceiros (`gerir`) fica só com admin (bypass) — nem o
  // coordenador mexe no conteúdo de outro autor.
  { role: "administrativo", recurso: "biblioteca_tecnica", acao: "ver" },
  { role: "administrativo", recurso: "biblioteca_tecnica", acao: "incluir" },
  { role: "clt", recurso: "biblioteca_tecnica", acao: "ver" },
  { role: "clt", recurso: "biblioteca_tecnica", acao: "incluir" },
  { role: "estagiario", recurso: "biblioteca_tecnica", acao: "ver" },
  { role: "estagiario", recurso: "biblioteca_tecnica", acao: "incluir" },
  { role: "projetista_pj", recurso: "biblioteca_tecnica", acao: "ver" },
  { role: "projetista_pj", recurso: "biblioteca_tecnica", acao: "incluir" },
  { role: "freelancer", recurso: "biblioteca_tecnica", acao: "ver" },
  { role: "freelancer", recurso: "biblioteca_tecnica", acao: "incluir" },
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

const CERTIDAO_TIPOS: { nome: string; obrigatoria: boolean }[] = [
  { nome: "Certidão Regularidade Fiscal Federal", obrigatoria: true },
  { nome: "Certidão Regularidade Fiscal Estadual", obrigatoria: true },
  { nome: "Certidão Regularidade Fiscal Municipal", obrigatoria: true },
  { nome: "Certidão de Regularidade do FGTS", obrigatoria: true },
  { nome: "Certidão Negativa de Débitos Trabalhistas", obrigatoria: true },
  { nome: "Certidão Improbidade Administrativa e Inelegibilidade", obrigatoria: false },
  { nome: "Inscrição Municipal (CIM)", obrigatoria: false },
  { nome: "Certidão Isenção Inscrição Estadual", obrigatoria: false },
  { nome: "Certidão Simplificada Jucepe", obrigatoria: false },
  { nome: "Certidão Falimentar", obrigatoria: false },
  { nome: "Balanço Patrimonial", obrigatoria: false },
  { nome: "Livro Digital", obrigatoria: false },
];

// Catálogo mínimo de cargos. "Sócio" é RÓTULO — não concede acesso nenhum (isso é `Socio`+perfil).
// O RH edita/arquiva/reordena pela tela; por isso o upsert abaixo nunca sobrescreve `ordem`.
const CARGOS_BASE = ["Sócio", "Diretor", "Coordenador", "Engenheiro", "Arquiteto", "Projetista", "Estagiário", "Analista Administrativo"];

// Departamentos-base, com o setor-pai sugerido. `setor` null = a definir pelo RH.
const DEPARTAMENTOS_BASE: { nome: string; setor: "diretoria" | "administrativo" | "juridico" | "engenharia" | "ti" | null }[] = [
  { nome: "Projetos", setor: "engenharia" },
  { nome: "Orçamento", setor: "engenharia" },
  { nome: "Financeiro", setor: "administrativo" },
  { nome: "Pessoal", setor: "administrativo" },
];

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
// Catálogo-base pré-criado. `categoria: null` cai no grupo "Outras" (ver schema/nota da view).
// O ícone deriva do nome (lib/disciplinas.ts) — não fixamos `icone` aqui.
//
// `numeracao` = bloco-base da folha na Lista Mestre: 1ª folha = bloco+1 (EST 4000 → 4001).
// Valores da tabela oficial do escritório, casados pela SIGLA (os nomes de tela do catálogo são
// mantidos de propósito — a tabela oficial usa descrições mais longas p/ as mesmas siglas).
// Duas exceções deliberadas, decididas com o escritório:
//   ACU 3100 — a tabela trazia 3000, igual a ARQ; dois blocos iguais colidem (as duas começariam
//              em 3001). 3100 segue o padrão de sub-bloco +100 da própria tabela (LOG/SEG/SPD/SUB
//              sob ELE, DRE sob HID, GAS sob CLI).
//   FUN null — Fundações não consta da tabela oficial; sem bloco, suas folhas começam em 1.
const DISCIPLINAS_CATALOGO: {
  nome: string;
  codigo: string;
  categoria: string | null;
  numeracao: number | null;
}[] = [
  // ARQUITETURA
  { nome: "Arquitetura", codigo: "ARQ", categoria: "ARQUITETURA", numeracao: 3000 },
  { nome: "Acústica", codigo: "ACU", categoria: "ARQUITETURA", numeracao: 3100 },
  // CIVIL
  { nome: "Estrutural", codigo: "EST", categoria: "CIVIL", numeracao: 4000 },
  { nome: "Hidrossanitário", codigo: "HID", categoria: "CIVIL", numeracao: 6000 },
  { nome: "Incêndio (PPCI)", codigo: "PCI", categoria: "CIVIL", numeracao: 7000 },
  { nome: "Fundações", codigo: "FUN", categoria: "CIVIL", numeracao: null },
  { nome: "Terraplenagem", codigo: "TER", categoria: "CIVIL", numeracao: 1000 },
  { nome: "Topografia", codigo: "TOP", categoria: "CIVIL", numeracao: 0 },
  { nome: "Pavimentação", codigo: "PAV", categoria: "CIVIL", numeracao: 2000 },
  { nome: "Drenagem", codigo: "DRE", categoria: "CIVIL", numeracao: 6100 },
  // ELÉTRICA
  { nome: "Elétrico", codigo: "ELE", categoria: "ELÉTRICA", numeracao: 5000 },
  { nome: "Cabeamento", codigo: "LOG", categoria: "ELÉTRICA", numeracao: 5100 },
  { nome: "CFTV", codigo: "SEG", categoria: "ELÉTRICA", numeracao: 5200 },
  { nome: "SPDA", codigo: "SPD", categoria: "ELÉTRICA", numeracao: 5300 },
  { nome: "Subestação", codigo: "SUB", categoria: "ELÉTRICA", numeracao: 5400 },
  // MECÂNICA
  { nome: "Climatização (AVAC)", codigo: "CLI", categoria: "MECÂNICA", numeracao: 8000 },
  { nome: "Gás", codigo: "GAS", categoria: "MECÂNICA", numeracao: 8200 },
  // OUTRAS
  { nome: "Orçamento", codigo: "ORC", categoria: null, numeracao: 9000 },
];

/**
 * Status documental (item 26 da spec). Nove estados sugeridos pela própria spec, ordenados
 * como o fluxo real de uma prancha. `final` marca o que não deve mais receber revisão.
 *
 * `update` preserva `cor` e `ativo` de propósito: renomear/recolorir é ato de quem gere o
 * catálogo pela tela — o seed só garante que os itens-base existam (mesma regra de
 * CERTIDAO_TIPOS e CARGOS_BASE).
 */
const DOCUMENTO_STATUS = [
  { nome: "Em elaboração", final: false },
  { nome: "Enviado", final: false },
  { nome: "Em análise", final: false },
  { nome: "Correção solicitada", final: false },
  { nome: "Aprovado", final: false },
  { nome: "Aprovado com ressalvas", final: false },
  { nome: "Liberado para obra", final: false },
  { nome: "Obsoleto", final: true },
  { nome: "Arquivado", final: true },
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
  // Poda: `upsert` só ADICIONA — se uma linha for removida de PERMISSOES_BASE (um role fica
  // com MENOS acesso), a linha antiga fica órfã no banco com `permitido: true` para sempre,
  // porque nada nunca a revoga. Achado real: a redução do coordenador (commit a55e9e9) editou
  // só o array e deixou 23 linhas órfãs (financeiro, usuarios:gerir, rh:folha, patrimonio:ti
  // etc.) ainda concedidas no banco de dev, apesar do commit dizer "matriz fechada em 20". Só
  // afeta roles presentes em PERMISSOES_BASE — não mexe em role sem entrada nenhuma na lista.
  const rolesComBase = new Set(PERMISSOES_BASE.map((p) => p.role));
  const chavesAtuais = new Set(PERMISSOES_BASE.map((p) => `${p.role}::${p.recurso}:${p.acao}`));
  const existentes = await prisma.permissao.findMany({
    where: { role: { in: [...rolesComBase] as never[] } },
    select: { id: true, role: true, recurso: true, acao: true },
  });
  const orfaos = existentes.filter((e) => !chavesAtuais.has(`${e.role}::${e.recurso}:${e.acao}`));
  if (orfaos.length > 0) {
    await prisma.permissao.deleteMany({ where: { id: { in: orfaos.map((o) => o.id) } } });
    console.log(`✔ ${orfaos.length} permissão(ões) órfã(s) podada(s) (removidas de PERMISSOES_BASE mas ainda no banco).`);
  }
  console.log(`✔ ${PERMISSOES_BASE.length} permissões base garantidas.`);

  // 3) Catálogo de disciplinas
  // Reconciliação de renomeações (mantém id/relações/`codigo` → evita colisão de `codigo` @unique
  // no upsert por `nome`). Só renomeia se o nome antigo existir e o novo ainda não.
  const RENOMES: { de: string; para: string }[] = [{ de: "Lógica", para: "Cabeamento" }];
  for (const r of RENOMES) {
    const antigo = await prisma.disciplinaCatalogo.findUnique({ where: { nome: r.de } });
    const novoExiste = await prisma.disciplinaCatalogo.findUnique({ where: { nome: r.para } });
    if (antigo && !novoExiste) {
      await prisma.disciplinaCatalogo.update({ where: { id: antigo.id }, data: { nome: r.para } });
      console.log(`  ↻ disciplina renomeada: "${r.de}" → "${r.para}"`);
    }
  }
  for (let i = 0; i < DISCIPLINAS_CATALOGO.length; i++) {
    const d = DISCIPLINAS_CATALOGO[i];
    await prisma.disciplinaCatalogo.upsert({
      where: { nome: d.nome },
      // `numeracao` NÃO entra no `update:` de propósito: o bloco é editável na tela de
      // configurações, e repeti-lo aqui faria todo `db:seed` (que roda em todo deploy) apagar
      // o ajuste do admin. O backfill logo abaixo cobre as linhas que ainda estão sem bloco.
      create: { nome: d.nome, codigo: d.codigo, categoria: d.categoria, ordem: i, numeracao: d.numeracao },
      update: { codigo: d.codigo, categoria: d.categoria, ordem: i },
    });
  }
  // Backfill do bloco-base nas linhas que já existiam antes desta versão (dev e produção).
  // `where: { numeracao: null }` torna a operação idempotente E não-destrutiva: só preenche vazio.
  let preenchidos = 0;
  for (const d of DISCIPLINAS_CATALOGO) {
    if (d.numeracao == null) continue;
    const r = await prisma.disciplinaCatalogo.updateMany({
      where: { nome: d.nome, numeracao: null },
      data: { numeracao: d.numeracao },
    });
    preenchidos += r.count;
  }
  if (preenchidos > 0) console.log(`  ↻ bloco-base preenchido em ${preenchidos} disciplina(s).`);
  console.log(`✔ ${DISCIPLINAS_CATALOGO.length} disciplinas no catálogo.`);

  // 3a) Reconciliação das disciplinas DOS PROJETOS (`Disciplina.nome`). Elas apontam para o
  // catálogo por TEXTO, sem FK, então um nome divergente vira disciplina órfã: perde a sigla
  // (que compõe a pasta e o prefixo do arquivo no storage) e o número-base da Lista Mestre.
  // NÃO move nada em disco — arquivos já gravados seguem no caminho persistido em `Upload.caminho`;
  // só uploads NOVOS passam a cair na pasta da sigla.
  const RENOMES_DISCIPLINA_PROJETO: { de: string; para: string }[] = [
    { de: "Arquitetônico", para: "Arquitetura" },
    { de: "Prevenção de Incêndio", para: "Incêndio (PPCI)" },
  ];
  for (const r of RENOMES_DISCIPLINA_PROJETO) {
    const candidatas = await prisma.disciplina.findMany({
      where: { nome: r.de },
      select: { id: true, projetoId: true },
    });
    if (candidatas.length === 0) continue;
    // Projeto que JÁ tem o nome de destino ficaria com duas disciplinas iguais — exige merge
    // manual (mover uploads/tarefas), então esse caso é pulado e reportado.
    const jaTemDestino = new Set(
      (
        await prisma.disciplina.findMany({
          where: { nome: r.para, projetoId: { in: candidatas.map((c) => c.projetoId) } },
          select: { projetoId: true },
        })
      ).map((d) => d.projetoId),
    );
    const renomear = candidatas.filter((c) => !jaTemDestino.has(c.projetoId));
    if (renomear.length > 0) {
      await prisma.disciplina.updateMany({
        where: { id: { in: renomear.map((c) => c.id) } },
        data: { nome: r.para },
      });
      console.log(`  ↻ ${renomear.length} disciplina(s) de projeto: "${r.de}" → "${r.para}"`);
    }
    const pulados = candidatas.length - renomear.length;
    if (pulados > 0) {
      console.log(`  ⚠ ${pulados} pulada(s) em "${r.de}": o projeto já tem "${r.para}" (merge manual).`);
    }
  }

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
  // update: {} de propósito — igual CARGOS_BASE: gerir "obrigatoria" é ato de quem gere
  // certidões pela tela (/certidoes → Gerenciar tipos), o seed só garante que os itens-base existam.
  for (const t of CERTIDAO_TIPOS) {
    await prisma.certidaoTipo.upsert({ where: { nome: t.nome }, create: t, update: {} });
  }
  console.log(`✔ ${TAREFA_STATUS.length} status de tarefa, ${CERTIDAO_TIPOS.length} tipos de certidão.`);

  // 8c) Status documental (Fase 2 de Documentos) — catálogo do status de cada documento,
  // distinto do status da disciplina (enum) e do status de tarefa (acima).
  for (let i = 0; i < DOCUMENTO_STATUS.length; i++) {
    await prisma.documentoStatus.upsert({
      where: { nome: DOCUMENTO_STATUS[i].nome },
      create: { ...DOCUMENTO_STATUS[i], ordem: i },
      update: { ordem: i, final: DOCUMENTO_STATUS[i].final },
    });
  }
  console.log(`✔ ${DOCUMENTO_STATUS.length} status documentais garantidos.`);

  // 8b) Catálogos de RH (cargo/departamento). `update: {}` de propósito: reordenar, renomear e
  // arquivar são atos do RH pela tela — o seed só garante que os itens-base existam. Rodar o
  // seed depois do backfill não pode reembaralhar a lista nem ressuscitar item arquivado.
  // `ordem` continua de onde a lista está (mesma regra de `criarCargo`), em vez de recomeçar do
  // zero — senão itens semeados colidiriam com os que o backfill já numerou.
  let ordemCargo = ((await prisma.cargo.findFirst({ orderBy: { ordem: "desc" }, select: { ordem: true } }))?.ordem ?? -1) + 1;
  for (const nome of CARGOS_BASE) {
    const r = await prisma.cargo.upsert({ where: { nome }, create: { nome, ordem: ordemCargo }, update: {} });
    if (r.ordem === ordemCargo) ordemCargo++;
  }
  let ordemDepto = ((await prisma.departamento.findFirst({ orderBy: { ordem: "desc" }, select: { ordem: true } }))?.ordem ?? -1) + 1;
  for (const d of DEPARTAMENTOS_BASE) {
    const r = await prisma.departamento.upsert({ where: { nome: d.nome }, create: { nome: d.nome, setor: d.setor, ordem: ordemDepto }, update: {} });
    if (r.ordem === ordemDepto) ordemDepto++;
  }
  console.log(`✔ ${CARGOS_BASE.length} cargos, ${DEPARTAMENTOS_BASE.length} departamentos no catálogo.`);

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

  // 11) Escala padrão por perfil (corrige a jornada legal do estagiário — 6h/dia)
  await semearEscalaRolePadrao();
  await semearEscalaContratacao();

  // 12) Perfis de acesso semente (Onda B) — espelha `Permissao` (acima) em PerfilAcesso.
  // Autorização real segue 100% em `role` até a Onda D; isto só prepara o dado.
  const { perfis } = await seedPerfisAcesso(prisma);
  console.log(`✔ ${perfis.length} perfil(is) de acesso semeado(s): ${perfis.map((p) => p.chave).join(", ")}.`);

  // 13) Feriados nacionais do ano corrente e do próximo.
  // Antes só existiam se um admin clicasse "Importar feriados nacionais". Sem eles
  // todo feriado vira dia útil e infla as horas ESPERADAS de todo colaborador no
  // banco de horas. Semear só o ano corrente reintroduziria o problema em 1º/jan.
  const anoAtual = new Date().getFullYear();
  const anosFeriado = [anoAtual, anoAtual + 1];
  let datasFeriado = 0;
  for (const ano of anosFeriado) {
    for (const f of feriadosNacionais(ano)) {
      // `update` vazio de propósito: feriado ajustado à mão pelo admin (nome,
      // esfera) não deve ser sobrescrito pelo seed a cada deploy.
      await prisma.feriado.upsert({
        where: { data: f.data },
        create: { data: f.data, nome: f.nome, tipo: "nacional" },
        update: {},
      });
      datasFeriado++;
    }
  }
  console.log(`✔ ${datasFeriado} feriados nacionais garantidos (${anosFeriado.join(", ")}).`);
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
