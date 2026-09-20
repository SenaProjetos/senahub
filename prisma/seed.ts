import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { auth } from "../src/lib/auth";
import { docVazio, novoId, type DocSchema } from "../src/modules/documentos/schema";
import { modelosDeFabrica } from "../src/modules/documentos/modelos-fabrica-contrato";
import { MODALIDADES_PADRAO } from "../src/modules/licitacoes/modalidade";
import { semearEscalaRolePadrao, semearEscalaContratacao } from "./escalas-padrao";
import { feriadosNacionais } from "../src/modules/rh/feriados/queries";
import { seedPerfisAcesso } from "./seed-perfis-acesso";
import { semearCatalogoDisciplinas, semearListaMestre } from "./seed-catalogos";
import type { Prisma } from "../src/generated/prisma/client";
import type { EstagioNegociacao } from "../src/generated/prisma/enums";

const ADMIN_EMAIL = "tadrio@senaprojetos.com.br";
const ADMIN_NAME = "Tádrio";
const ADMIN_SENHA_INICIAL = "SenaHub@2026";

/**
 * Categorias do cofre de Acessos (§10 da spec).
 *
 * Vai no `db:seed`, não no seed de DEMO: sem nenhuma categoria o formulário de acesso não
 * consegue ser submetido — o campo é obrigatório —, então o módulo chega em produção travado.
 * Foi exatamente o que aconteceu no deploy de 2026-08-30.
 *
 * `update: {}` de propósito, como CERTIDAO_TIPOS: renomear ou desativar categoria é ato de quem
 * gere o cofre pela tela; o seed só garante que os itens-base existam. Rodar de novo não desfaz
 * o que o admin ajustou.
 *
 * Os nomes casam com `CATEGORIAS_PUBLICAS` e com `iconeDaCategoria`/`corDaCategoria`
 * (`modules/acessos/labels.ts`), que fazem match FROUXO por nome — renomear "CREA" para
 * "Conselhos" continua pegando o ícone certo, mas trocar por algo sem relação cai no genérico.
 */
const CREDENCIAL_CATEGORIAS = [
  { nome: "Corpo de Bombeiros", icone: "Flame" },
  { nome: "CREA", icone: "Landmark" },
  { nome: "Prefeitura", icone: "Building2" },
  { nome: "Governo", icone: "Globe" },
  { nome: "Software", icone: "Monitor" },
  { nome: "Plataforma", icone: "Globe" },
  { nome: "Cliente", icone: "Briefcase" },
  { nome: "Serviço", icone: "Briefcase" },
  { nome: "Outros", icone: "KeyRound" },
];

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
  // Quebra do chat por TipoCanal (F3, 2026-09-02). Reproduz o comportamento de hoje:
  //   `chat:geral` = quem entrava no #geral, que era a audiência `chat_participante` = CHAT_ROLES;
  //   `chat:dm`    = CHAT_ROLES menos `DM_ROLES_EXCLUIDAS` — que já não se cruzam, mesma lista;
  //   `chat:grupo` = gate NOVO onde não havia nenhum (`criarGrupo` só exigia sessão). Semeado
  //                  para CHAT_ROLES porque é quem alcança o chat — é reprodução do alcance
  //                  real, não espelho de uma regra que existisse.
  { role: "supervisor", recurso: "chat", acao: "geral" },
  { role: "administrativo", recurso: "chat", acao: "geral" },
  { role: "clt", recurso: "chat", acao: "geral" },
  { role: "estagiario", recurso: "chat", acao: "geral" },
  { role: "projetista_pj", recurso: "chat", acao: "geral" },
  { role: "supervisor", recurso: "chat", acao: "dm" },
  { role: "administrativo", recurso: "chat", acao: "dm" },
  { role: "clt", recurso: "chat", acao: "dm" },
  { role: "estagiario", recurso: "chat", acao: "dm" },
  { role: "projetista_pj", recurso: "chat", acao: "dm" },
  { role: "supervisor", recurso: "chat", acao: "grupo" },
  { role: "administrativo", recurso: "chat", acao: "grupo" },
  { role: "clt", recurso: "chat", acao: "grupo" },
  { role: "estagiario", recurso: "chat", acao: "grupo" },
  { role: "projetista_pj", recurso: "chat", acao: "grupo" },
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
  // 2026-09-15: gates que eram `GLOBAL_ROLES` viraram par. Bancos que já existiam recebem pela
  // migration `20260915160000_pares_disciplina_alheia_tarefas_aprovacoes`.
  { role: "supervisor", recurso: "aprovacoes", acao: "disciplina" },
  { role: "supervisor", recurso: "projetos", acao: "atuar_disciplina_alheia" },
  { role: "supervisor", recurso: "tarefas", acao: "gerir_todas" },
  { role: "supervisor", recurso: "arquivos", acao: "ver" },
  { role: "supervisor", recurso: "arquivos", acao: "baixar" },
  { role: "supervisor", recurso: "arquivos", acao: "ver_todas_disciplinas" },
  { role: "supervisor", recurso: "arquivos", acao: "enviar" },
  { role: "supervisor", recurso: "arquivos", acao: "ver_acessos" },
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
  // ── Acessos e Credenciais (cofre corporativo) ────────────────────────────────
  // Semente MÍNIMA e deliberada: só `administrativo`, que neste sistema já é o perfil de
  // confiança alta (tem `financeiro:gerir`, `rh:folha` = salários, `usuarios:gerir`).
  // Ninguém mais entra por padrão — §97 da spec pede "restrição rigorosa para quem não
  // possui autorização", e o cofre nasce vazio: liberar depois pela tela de Permissões é
  // barato, retirar acesso que já foi concedido não é. Confirmado pelo dono em 2026-08-28.
  //
  // ATENÇÃO: `acessos:ver` NÃO é o que faz alguém enxergar um cadastro — é só o gate de
  // TELA. Quais registros a pessoa vê sai de `CredencialCompartilhamento` (Fase 2), e
  // `acessos:credencial` é gate de tela para revelar, sempre somado ao compartilhamento
  // individual daquele registro (§27/§85). Uma coisa nunca substitui a outra.
  //
  // `acessos:credencial` está FORA da semente de propósito (decisão do dono, 2026-08-28):
  // §27/§29/§91 exigem que "vê o cadastro" e "vê a credencial" sejam independentes, e uma
  // separação que a semente já concede junto é separação só no papel. Quem gere o cofre
  // (`gerir`) não revela senha por consequência — revelar é concessão explícita, feita na
  // tela de Permissões, pessoa a pessoa. Enquanto ninguém a receber, só `admin` revela (por
  // `superUsuario`), que é o estado fail-closed correto para um cofre recém-criado.
  { role: "administrativo", recurso: "acessos", acao: "ver" },
  { role: "administrativo", recurso: "acessos", acao: "gerir" },
  { role: "administrativo", recurso: "acessos", acao: "permissoes" },
  { role: "administrativo", recurso: "acessos", acao: "auditoria" },
  { role: "administrativo", recurso: "acessos", acao: "categorias" },
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
  { role: "administrativo", recurso: "arquivos", acao: "ver_acessos" },
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
  // ADR-0006: a biblioteca de cláusulas e os modelos de proposta são mantidos SÓ pela gestão —
  // `comercial:gerir` (quem monta proposta) não basta, porque editar a biblioteca muda o texto
  // de toda proposta futura. Banco que já existe recebe pela migration de dados do par.
  { role: "administrativo", recurso: "comercial", acao: "modelos" },
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
  // Tarefas na busca global (Ctrl+K). Restaura a PARIDADE com a rota `/tarefas`, que é
  // `requireRole(...INTERNAL_ROLES)`: quem já podia abrir a página e ver estas mesmas tarefas
  // não as encontrava no Ctrl+K, porque `tarefas:ver` era consultado sem existir no catálogo
  // (par ausente = negado). Não expõe nada novo — a busca já recorta por `escopoTarefa(user)`.
  // `cliente` fica de fora: não é interno e não alcança `/tarefas`.
  { role: "supervisor", recurso: "tarefas", acao: "ver" },
  { role: "administrativo", recurso: "tarefas", acao: "ver" },
  { role: "clt", recurso: "tarefas", acao: "ver" },
  { role: "estagiario", recurso: "tarefas", acao: "ver" },
  { role: "projetista_pj", recurso: "tarefas", acao: "ver" },
  { role: "freelancer", recurso: "tarefas", acao: "ver" },
  { role: "ti", recurso: "tarefas", acao: "ver" },
  // NOTA — `financeiro:aprovar` entrou no catálogo mas NÃO é semeado aqui, de propósito.
  // A alçada padrão (`getNiveisAprovacao`) nomeia admin+supervisor como aprovadores, mas o
  // recorte do Coordenador (dono, 2026-07-27, ver o bloco do `supervisor` acima) deixou
  // financeiro DELIBERADAMENTE fora do perfil. Semear aqui reverteria essa decisão em silêncio.
  // Fica grantável pela tela de Permissões/Perfis; quem concede é o dono.
  // ── F4 (2026-09-02): recorte fino, reproduzindo o acesso de HOJE linha a linha. ──
  // Financeiro: `conciliar`, `fechar` e `folha_pj` saem de quem tinha `financeiro:gerir`;
  // `resultados` de quem tinha `financeiro:ver`. Hoje é `administrativo` nos dois casos.
  { role: "administrativo", recurso: "financeiro", acao: "conciliar" },
  { role: "administrativo", recurso: "financeiro", acao: "fechar" },
  { role: "administrativo", recurso: "financeiro", acao: "folha_pj" },
  // G2/D37 (2026-09-12): desfazer o que já foi pago (corrigir/estornar/excluir lote) saiu de
  // dentro de `folha_pj`. Banco novo nasce com os dois no mesmo lugar — quem paga hoje também
  // corrige, como era antes. Banco que já está no ar recebe pela migration
  // `20260912120000_perfis_folha_pj_corrigir`, derivando de quem tem `folha_pj`.
  { role: "administrativo", recurso: "financeiro", acao: "folha_pj_corrigir" },
  { role: "administrativo", recurso: "financeiro", acao: "resultados" },
  // Configurações: `/configuracoes/disciplinas` era `requireRole("admin","supervisor")`.
  // `configuracoes:licitacoes` era `requireRole("admin")` — ninguém além do bypass, logo
  // nenhuma linha aqui. Idem `projetos:pastas`, que era `roles: ["admin"]`.
  { role: "supervisor", recurso: "configuracoes", acao: "disciplinas" },
  // Abas do projeto: apareciam para QUALQUER um que abrisse o projeto, sem gate — logo a
  // reprodução fiel é "quem tem `projetos:ver`". `diario` era `INTERNAL_ROLES`, mas quem não
  // alcança o projeto nunca vê a aba — o conjunto real é `projetos:ver` menos o cliente. (`ti`
  // não tem `projetos:ver`, então não entra: a linha seria inerte e divergiria da migration.)
  { role: "supervisor", recurso: "projetos", acao: "servicos" },
  { role: "administrativo", recurso: "projetos", acao: "servicos" },
  { role: "clt", recurso: "projetos", acao: "servicos" },
  { role: "estagiario", recurso: "projetos", acao: "servicos" },
  { role: "projetista_pj", recurso: "projetos", acao: "servicos" },
  { role: "freelancer", recurso: "projetos", acao: "servicos" },
  { role: "cliente", recurso: "projetos", acao: "servicos" },
  { role: "supervisor", recurso: "projetos", acao: "arts" },
  { role: "administrativo", recurso: "projetos", acao: "arts" },
  { role: "clt", recurso: "projetos", acao: "arts" },
  { role: "estagiario", recurso: "projetos", acao: "arts" },
  { role: "projetista_pj", recurso: "projetos", acao: "arts" },
  { role: "freelancer", recurso: "projetos", acao: "arts" },
  { role: "cliente", recurso: "projetos", acao: "arts" },
  { role: "supervisor", recurso: "projetos", acao: "extras" },
  { role: "administrativo", recurso: "projetos", acao: "extras" },
  { role: "clt", recurso: "projetos", acao: "extras" },
  { role: "estagiario", recurso: "projetos", acao: "extras" },
  { role: "projetista_pj", recurso: "projetos", acao: "extras" },
  { role: "freelancer", recurso: "projetos", acao: "extras" },
  { role: "cliente", recurso: "projetos", acao: "extras" },
  { role: "supervisor", recurso: "projetos", acao: "diario" },
  { role: "administrativo", recurso: "projetos", acao: "diario" },
  { role: "clt", recurso: "projetos", acao: "diario" },
  { role: "estagiario", recurso: "projetos", acao: "diario" },
  { role: "projetista_pj", recurso: "projetos", acao: "diario" },
  { role: "freelancer", recurso: "projetos", acao: "diario" },
  // ── F5 (2026-09-02): quem RECEBE escalonamento vira permissão. ──────────────────────────
  // Semeado exatamente para os papéis das audiências de hoje, então nenhuma notificação muda
  // de destinatário: `notificacoes:gestao` = GLOBAL_ROLES, `rh`/`operacional` = HR_ADMIN_ROLES
  // (admin sai das duas listas porque passa pelo bypass de `superUsuario`).
  { role: "supervisor", recurso: "notificacoes", acao: "gestao" },
  { role: "supervisor", recurso: "notificacoes", acao: "rh" },
  { role: "administrativo", recurso: "notificacoes", acao: "rh" },
  { role: "supervisor", recurso: "notificacoes", acao: "operacional" },
  { role: "administrativo", recurso: "notificacoes", acao: "operacional" },
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
  // 2.09 também é criada pela migração 20260914120000_art_taxa_financeiro.
  { codigo: "2.09", nome: "Taxas de ART/RRT", tipo: "despesa", pai: "2" },
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

// ── CRM (Fase 1b, docs/crm/04-plano-fases.md F1.6) ────────────────────────────
// Listas iniciais aprovadas pelo dono em 2026-08-14, derivadas dos empreendimentos reais em
// produção (EDIF. ISA BEACH/MARMARES/BELA BEACH, RES. PLINIO PAIVA, CAPIBA MALL…).
// Todas são config-driven: editáveis na tela depois, e o seed NÃO desfaz edição do usuário
// (`update: {}` — mesmo padrão de MODALIDADES_PADRAO).

const TIPOS_EMPREENDIMENTO = [
  "Residencial multifamiliar",
  "Residencial unifamiliar",
  "Comercial / Corporativo",
  "Shopping / Varejo",
  "Industrial / Galpão",
  "Hotelaria",
  "Saúde",
  "Educacional",
  "Institucional",
  "Outro",
];

/// `exigeConcorrente` liga o campo de nome do concorrente na UI ao escolher o motivo.
const MOTIVOS_PERDA: { nome: string; exigeConcorrente: boolean }[] = [
  { nome: "Preço acima do orçamento", exigeConcorrente: false },
  { nome: "Prazo incompatível", exigeConcorrente: false },
  { nome: "Perdemos para concorrente", exigeConcorrente: true },
  { nome: "Sem verba / adiado", exigeConcorrente: false },
  { nome: "Escopo fora da atuação", exigeConcorrente: false },
  { nome: "Cliente não retornou", exigeConcorrente: false },
  { nome: "Cancelado pelo cliente", exigeConcorrente: false },
  { nome: "Outro", exigeConcorrente: false },
];

const CANAIS_AQUISICAO = [
  "Indicação",
  "Site",
  "LinkedIn / Sales Navigator",
  "Feira / Evento",
  "Anúncio",
  "Cliente recorrente",
  "Prospecção ativa",
  "Outro",
];

const SEGMENTOS = [
  "Incorporadora",
  "Construtora",
  "Indústria",
  "Varejo",
  "Saúde",
  "Educação",
  "Setor público",
  "Outro",
];

/// Probabilidade padrão por estágio (ADR-12 / 02-schema.md §2.14). Os estágios terminais
/// (PERDIDO/EM_ESPERA/CANCELADO) ficam de fora de propósito: não são ponto do funil, e a
/// probabilidade deles é resolvida no serviço.
const PROBABILIDADES_ESTAGIO: { estagio: EstagioNegociacao; probabilidade: number }[] = [
  { estagio: "LEVANTAMENTO", probabilidade: 20 },
  { estagio: "ORCAMENTO", probabilidade: 35 },
  { estagio: "PROPOSTA_ENVIADA", probabilidade: 55 },
  { estagio: "NEGOCIACAO", probabilidade: 75 },
  { estagio: "CONTRATADO", probabilidade: 100 },
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

/**
 * Catálogo que o usuário mantém pela tela só é semeado com a tabela vazia (instalação nova, ou
 * lista que alguém esvaziou por inteiro). Garantir item a item, pelo nome, trazia de volta a cada
 * deploy o que foi excluído e duplicava o que foi renomeado. Item padrão novo para bancos que já
 * estão no ar vai por migration. Mesma regra de `seed-catalogos.ts`.
 */
async function semearSeVazio(
  contar: () => Promise<number>,
  criar: () => Promise<{ count: number }>,
): Promise<string> {
  const existentes = await contar();
  if (existentes > 0) return `sem mudança (${existentes} já no banco)`;
  const { count } = await criar();
  return `semeado na instalação (${count} itens)`;
}

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

  // 3) Catálogos editáveis pela tela (disciplinas e Lista Mestre): semeados só em instalação
  // nova — ver `seed-catalogos.ts` pro porquê.
  const disciplinas = await semearCatalogoDisciplinas(prisma);
  console.log(
    disciplinas.criadas > 0
      ? `✔ Catálogo de disciplinas criado (${disciplinas.criadas}).`
      : `✔ Catálogo de disciplinas já existe (${disciplinas.existentes}) — mantido como está.`,
  );
  for (const lm of await semearListaMestre(prisma)) {
    console.log(
      lm.criadas > 0
        ? `✔ Lista Mestre (${lm.categoria}): ${lm.criadas} sigla(s) criada(s).`
        : `✔ Lista Mestre (${lm.categoria}): já existe (${lm.existentes}) — mantida como está.`,
    );
  }


  // 4) Plano de contas (cria pais antes das filhas — array já ordenado).
  // Continua garantido conta a conta, ao contrário dos outros catálogos: o código busca contas
  // pelo `codigo` (1.01, 1.02, 1.03, 2.01–2.05, 2.09) e falha sem elas, com uma mensagem que
  // manda rodar o seed. Mas `update` fica vazio: nome, ordem e conta-pai são do financeiro, e o
  // seed os sobrescrevia a cada deploy.
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
      update: {},
    });
    // Exceção: conta-filha SEM pai é resto de migration (a 2.09 nasce antes da conta "2" em
    // banco novo, porque migrations rodam antes do seed) — essa o seed religa.
    if (c.pai && cat.paiId === null) {
      await prisma.categoriaFinanceira.update({ where: { id: cat.id }, data: { paiId: idsPorCodigo.get(c.pai) } });
    }
    idsPorCodigo.set(c.codigo, cat.id);
  }
  console.log(`✔ ${PLANO_CONTAS.length} contas no plano de contas.`);

  // 5–6) Formas de pagamento e centros de custo (editáveis em Cadastros)
  const formas = await semearSeVazio(() => prisma.formaPagamento.count(), () =>
    prisma.formaPagamento.createMany({ data: FORMAS_PAGAMENTO.map((nome, ordem) => ({ nome, ordem })) }),
  );
  const centros = await semearSeVazio(() => prisma.centroCusto.count(), () =>
    prisma.centroCusto.createMany({ data: CENTROS_CUSTO.map((nome, ordem) => ({ nome, ordem })) }),
  );
  console.log(`✔ Formas de pagamento ${formas}, centros de custo ${centros}.`);

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
  // Tipos de certidão e categorias de acesso são mantidos pela tela (/certidoes → Gerenciar tipos,
  // /acessos): só semeados com a tabela vazia — ver `semearSeVazio`. As categorias de acesso
  // continuam garantidas na prática: sem nenhuma o formulário não submete (deploy de 2026-08-30),
  // e tabela vazia é justamente o caso em que o seed volta a criá-las.
  const tiposCertidao = await semearSeVazio(() => prisma.certidaoTipo.count(), () =>
    prisma.certidaoTipo.createMany({ data: CERTIDAO_TIPOS }),
  );
  const categoriasAcesso = await semearSeVazio(() => prisma.credencialCategoria.count(), () =>
    prisma.credencialCategoria.createMany({ data: CREDENCIAL_CATEGORIAS }),
  );
  console.log(
    `✔ ${TAREFA_STATUS.length} status de tarefa, tipos de certidão ${tiposCertidao}, ` +
      `categorias de acesso ${categoriasAcesso}.`,
  );

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

  // 8b) Catálogos de RH (cargo/departamento). Reordenar, renomear, arquivar e excluir são atos do
  // RH pela tela — só semeados com a tabela vazia, senão um cargo renomeado voltaria com o nome
  // antigo no deploy seguinte.
  const cargos = await semearSeVazio(() => prisma.cargo.count(), () =>
    prisma.cargo.createMany({ data: CARGOS_BASE.map((nome, ordem) => ({ nome, ordem })) }),
  );
  const departamentos = await semearSeVazio(() => prisma.departamento.count(), () =>
    prisma.departamento.createMany({
      data: DEPARTAMENTOS_BASE.map((d, ordem) => ({ nome: d.nome, setor: d.setor, ordem })),
    }),
  );
  console.log(`✔ Cargos ${cargos}, departamentos ${departamentos}.`);

  // 9) Etapas do funil comercial. Garantidas pelo nome, não semeadas uma vez só: o código
  // reconhece a etapa de perda PELO NOME (`etapaEhPerdido`) e `jornada.ts` mapeia estágio →
  // nome. `update` vazio para não desfazer a ordem que o comercial montou na tela.
  for (let i = 0; i < FUNIL_ETAPAS.length; i++) {
    await prisma.funilEtapa.upsert({
      where: { nome: FUNIL_ETAPAS[i].nome },
      create: { nome: FUNIL_ETAPAS[i].nome, cor: FUNIL_ETAPAS[i].cor, ordem: i },
      update: {},
    });
  }
  console.log(`✔ ${FUNIL_ETAPAS.length} etapas do funil comercial.`);

  // 9b) Modalidades de licitação (editável em Configurações, que também tem o botão
  // "restaurar padrões" — `semearModalidadesPadrao`, para quem quiser a lista de volta).
  const modalidades = await semearSeVazio(() => prisma.modalidade.count(), () =>
    prisma.modalidade.createMany({ data: MODALIDADES_PADRAO.map((nome, ordem) => ({ nome, ordem })) }),
  );
  console.log(`✔ Modalidades de licitação ${modalidades}.`);

  // 9c) Catálogos do CRM (F1.6). Editáveis na tela, então cada lista só é semeada vazia —
  // um item renomeado voltaria com o nome antigo se o seed garantisse item a item.
  const tipos = await semearSeVazio(() => prisma.tipoEmpreendimento.count(), () =>
    prisma.tipoEmpreendimento.createMany({ data: TIPOS_EMPREENDIMENTO.map((nome, ordem) => ({ nome, ordem })) }),
  );
  const motivos = await semearSeVazio(() => prisma.motivoPerda.count(), () =>
    prisma.motivoPerda.createMany({
      data: MOTIVOS_PERDA.map((m, ordem) => ({ nome: m.nome, ordem, exigeConcorrente: m.exigeConcorrente })),
    }),
  );
  const canais = await semearSeVazio(() => prisma.canalAquisicao.count(), () =>
    prisma.canalAquisicao.createMany({ data: CANAIS_AQUISICAO.map((nome, ordem) => ({ nome, ordem })) }),
  );
  const segmentos = await semearSeVazio(() => prisma.segmento.count(), () =>
    prisma.segmento.createMany({ data: SEGMENTOS.map((nome, ordem) => ({ nome, ordem })) }),
  );
  // Probabilidade por estágio: `estagio` é a PK (enum), então o upsert é por ela.
  for (const p of PROBABILIDADES_ESTAGIO) {
    await prisma.probabilidadeEstagio.upsert({
      where: { estagio: p.estagio },
      create: p,
      update: {},
    });
  }
  console.log(
    `✔ CRM: tipos de empreendimento ${tipos}, motivos de perda ${motivos}, canais ${canais}, ` +
      `segmentos ${segmentos}, ${PROBABILIDADES_ESTAGIO.length} probabilidades.`,
  );

  // 10) Modelos de documento exemplo (Estúdio de Documentos). Procura por FONTE, não pelo nome:
  // por nome, um exemplo renomeado ou excluído no Estúdio voltava no deploy seguinte. Quem já tem
  // qualquer modelo daquela fonte não precisa do exemplo.
  const existeModeloProjeto = await prisma.documentoModelo.findFirst({
    where: { fonte: "projeto" },
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
    where: { fonte: "licitacao" },
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

  // 10b) Modelos de fábrica de contrato (Fase E5) — CLT/estágio/PJ/cliente prontos no Estúdio.
  // Só entram enquanto não houver NENHUM modelo de contrato: o nome "[Fábrica] ..." é só a semente
  // inicial, e o jurídico renomeia/exclui à vontade sem o deploy trazer a cópia de volta.
  const temModeloContrato = await prisma.documentoModelo.findFirst({ where: { fonte: "contrato" } });
  for (const m of temModeloContrato ? [] : modelosDeFabrica()) {
    await prisma.documentoModelo.create({
      data: {
        nome: m.nome,
        tipo: "contrato",
        fonte: "contrato",
        schemaJson: m.schema as unknown as Prisma.InputJsonValue,
      },
    });
    console.log(`✔ Modelo de fábrica "${m.nome}" criado.`);
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
  // Ano a ano, e só se o ano ainda não tem nenhum feriado nacional: garantir data a data trazia
  // de volta, a cada deploy, o feriado que o admin excluiu de propósito.
  for (const ano of anosFeriado) {
    const jaTem = await prisma.feriado.count({
      where: { tipo: "nacional", data: { gte: new Date(Date.UTC(ano, 0, 1)), lt: new Date(Date.UTC(ano + 1, 0, 1)) } },
    });
    if (jaTem > 0) continue;
    const r = await prisma.feriado.createMany({
      data: feriadosNacionais(ano).map((f) => ({ data: f.data, nome: f.nome, tipo: "nacional" })),
      skipDuplicates: true,
    });
    datasFeriado += r.count;
  }
  console.log(`✔ ${datasFeriado} feriado(s) nacional(is) criado(s) (${anosFeriado.join(", ")}).`);
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
