/**
 * Matriz base de permissões por PAPEL legado — a semente dos perfis de acesso.
 *
 * Até a Onda F esta lista vivia em `prisma/seed.ts` e era copiada para a tabela `Permissao` a cada
 * `db:seed`; `canRole()` (piso de sócio) e `seedPerfisAcesso()` liam a tabela. A tabela só repetia
 * a constante (o seed fazia upsert + poda de órfãos, e nenhuma tela escrevia nela desde a Onda C),
 * então a constante virou a fonte única e a tabela saiu (Onda F, bloco F1 do plano de Setor ×
 * Contratação × Perfil de acesso).
 *
 * Dados puros, sem `server-only` e sem Prisma: o seed (tsx) importa por caminho relativo.
 * O `role` é string de propósito — é a CHAVE da semente, não o enum `Role`, que a Onda F remove.
 * admin não precisa estar aqui: tem bypass (`superUsuario`).
 */
export type ParBase = { role: string; recurso: string; acao: string };

export const PERMISSOES_BASE: readonly ParBase[] = [
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
  // Horas e produtividade dos projetistas (2026-10-07): espelha o gate antigo `HR_ADMIN_ROLES`.
  { role: "supervisor", recurso: "rh", acao: "produtividade" },
  { role: "administrativo", recurso: "rh", acao: "produtividade" },
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

/** Pares `recurso:acao` que a semente concede a um papel. */
export function paresBaseDoPapel(role: string): Set<string> {
  return new Set(PERMISSOES_BASE.filter((p) => p.role === role).map((p) => `${p.recurso}:${p.acao}`));
}
