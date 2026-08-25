# Checklist de Auditoria de SeguranÃ§a â€” SENAHub

> **Objetivo:** revisar sistematicamente o SENAHub para identificar falhas de autenticaÃ§Ã£o, autorizaÃ§Ã£o, isolamento de dados, exposiÃ§Ã£o de segredos, validaÃ§Ã£o de entrada, armazenamento, infraestrutura e lÃ³gica de negÃ³cio.
>
> **Uso recomendado:** executar primeiro os itens **P0**, depois **P1** e por fim **P2**.
> Para cada item, registrar evidÃªncia, arquivo/rota afetada, resultado do teste e correÃ§Ã£o aplicada.
>
> **Legenda de severidade**
> - ðŸ”´ **CrÃ­tica** â€” pode permitir tomada de conta, acesso cruzado entre empresas, execuÃ§Ã£o remota, vazamento massivo ou controle administrativo.
> - ðŸŸ  **Alta** â€” pode permitir acesso indevido relevante, abuso de recursos, fraude, persistÃªncia de sessÃ£o ou exposiÃ§Ã£o significativa.
> - ðŸŸ¡ **MÃ©dia** â€” aumenta superfÃ­cie de ataque, facilita exploraÃ§Ã£o ou reduz capacidade de detecÃ§Ã£o.
> - ðŸŸ¢ **Baixa** â€” hardening, reduÃ§Ã£o de exposiÃ§Ã£o e boas prÃ¡ticas complementares.
>
> **Legenda de estado (incluÃ­da em 24/08/2026)**
> - `[x] âœ… PRÃ‰` â€” a condiÃ§Ã£o jÃ¡ estava atendida no cÃ³digo **antes** desta auditoria; a evidÃªncia estÃ¡ registrada no relatÃ³rio.
> - `[ ] âŒ PRÃ‰` â€” a condiÃ§Ã£o falhava na linha de base; nÃ£o Ã© uma correÃ§Ã£o pendente marcada como concluÃ­da.
> - `[ ] â³` â€” ainda nÃ£o verificado de forma suficiente (ou exige teste dinÃ¢mico/infraestrutura).
> - `[x] ðŸ”Ž PRÃ‰` â€” atividade de revisÃ£o/inventÃ¡rio concluÃ­da; nÃ£o Ã©, por si sÃ³, uma aprovaÃ§Ã£o de seguranÃ§a.
> - `[x] âž– N/A` â€” nÃ£o se aplica Ã  arquitetura atual.
> - `[x] ðŸ› ï¸ PÃ“S` â€” reservado exclusivamente para correÃ§Ã£o feita **depois** desta auditoria, com commit/PR e teste pÃ³s-correÃ§Ã£o. NÃ£o hÃ¡ itens com este estado nesta versÃ£o.
> - Item ainda sem tag â€” permanece no backlog original e ainda nÃ£o foi classificado nesta etapa; nÃ£o deve ser interpretado como aprovado.
>
> **Regra de histÃ³rico:** um item `âœ… PRÃ‰` nÃ£o deve ser relabelado como `ðŸ› ï¸ PÃ“S`. Ao corrigir um item `âŒ PRÃ‰`, manter a falha como evidÃªncia e acrescentar uma linha `ðŸ› ï¸ PÃ“S` logo abaixo, com data, commit/PR e teste. Assim o checklist preserva o nÃ­vel de seguranÃ§a anterior Ã  auditoria.
>
> **EvidÃªncia-base:** [relatÃ³rio de auditoria estÃ¡tica de 24/08/2026](auditoria-estatica-2026-08-24.md), commit `c9e0b12`. A marcaÃ§Ã£o abaixo representa somente o que foi comprovado por revisÃ£o estÃ¡tica; nÃ£o substitui pentest nem validaÃ§Ã£o de produÃ§Ã£o.

---

# 0. Registro da auditoria

- [x] âœ… PRÃ‰ â€” ResponsÃ¡vel pela revisÃ£o estÃ¡tica: Codex.
- [x] âœ… PRÃ‰ â€” Branch/commit analisado: Ã¡rvore local no commit `c9e0b12`.
- [x] âœ… PRÃ‰ â€” Ambiente analisado: desenvolvimento local Windows; produÃ§Ã£o/homologaÃ§Ã£o permanecem `â³`.
- [ ] Registrar URL/base URL das APIs.
- [x] âœ… PRÃ‰ â€” VersÃ£o do frontend/aplicaÃ§Ã£o: `senahub@1.11.0`, Next `15.5.19`.
- [ ] Registrar versÃ£o do backend.
- [x] âœ… PRÃ‰ â€” Banco e provedor no ambiente revisado: PostgreSQL 17 local, acessado via Prisma 7.
- [ ] Registrar serviÃ§os externos/integradores.
- [x] âœ… PRÃ‰ â€” InventÃ¡rio de endpoints: 120 Route Handlers em `src/app/api/**`.
- [ ] Criar lista de tabelas e buckets existentes.
- [x] âœ… PRÃ‰ â€” Perfis registrados: 9 roles de aplicaÃ§Ã£o; a matriz fina Ã© resolvida no servidor.
- [ ] Criar lista de funcionalidades administrativas.
- [ ] Criar lista de operaÃ§Ãµes financeiras/sensÃ­veis.
- [ ] Criar lista de rotinas que processam arquivos.
- [ ] Criar lista de jobs, cron jobs e webhooks.
- [ ] Criar lista de ambientes e domÃ­nios publicados.

### 0.1 Retrato da linha de base â€” antes de correÃ§Ãµes

| DimensÃ£o | SituaÃ§Ã£o comprovada na prÃ©-auditoria |
|---|---|
| Controles jÃ¡ existentes | SessÃ£o Better Auth com expiraÃ§Ã£o/rate limit de login; permissÃµes server-side em `defineAction`/`can`; Prisma somente no servidor; proteÃ§Ã£o contra path traversal; SQL de runtime parametrizado/ordenado por allowlist; varredura estÃ¡tica sem segredo vÃ¡lido no bundle; `nosniff`, `X-Frame-Options`, `Referrer-Policy` e `Permissions-Policy`. |
| Falhas crÃ­ticas jÃ¡ presentes | 9 P0: autorizaÃ§Ã£o horizontal/por objeto em tarefas, suporte, chat, avisos, coordenaÃ§Ã£o, DWG, aceite e snapshots de documentos. |
| Riscos altos jÃ¡ presentes | 9 P1: conteÃºdo ativo em upload, validaÃ§Ã£o de arquivo incompleta, token/aceite sem ciclo de vida atÃ´mico, CSV injection, rate limit insuficiente, dependÃªncias vulnerÃ¡veis, backup sem proteÃ§Ã£o, numeraÃ§Ã£o concorrente e aÃ§Ã£o de template comercial sem gate. |
| Hardening ausente | 2 P2: healthcheck detalhado pÃºblico e ausÃªncia de CSP/HSTS no cÃ³digo. |
| NÃ£o concluÃ­do nesta etapa | Testes dinÃ¢micos de sessÃ£o/CSRF/cookies/TLS, infraestrutura/Cloudflare, logs, restore e perfis cruzados. Esses itens permanecem `â³`. |

**Estado de correÃ§Ãµes apÃ³s esta atualizaÃ§Ã£o:** a linha de base acima continua preservada. Em 24/08/2026 foram implementadas as correÃ§Ãµes de cÃ³digo para os nove achados P0 e o hardening parcial dos SEC-010/011/012; elas estÃ£o registradas como `ðŸ› ï¸ PÃ“S` abaixo, sem alterar os marcadores `âŒ PRÃ‰` que descrevem o estado anterior.

### 0.2 CorreÃ§Ãµes P0 pÃ³s-auditoria â€” 24/08/2026

> Estado: correÃ§Ã£o de cÃ³digo e testes focados concluÃ­dos na Ã¡rvore de trabalho; ainda sem commit/PR. A validaÃ§Ã£o de produÃ§Ã£o e os P1/P2 continuam pendentes.

- [x] ðŸ› ï¸ PÃ“S â€” **SEC-001 (tarefas):** leituras, busca global, comentÃ¡rios, itens, anexos, projeto, dependÃªncias e responsÃ¡veis passam por escopo/validaÃ§Ã£o no servidor. EvidÃªncia: `src/modules/tarefas/{queries,actions}.ts`, `src/modules/busca/actions.ts`, `src/app/api/tarefas/anexo/[comentarioId]/route.ts`.
- [x] ðŸ› ï¸ PÃ“S â€” **SEC-002 (suporte):** somente autor do ticket ou `HR_ADMIN_ROLES` responde a ticket. EvidÃªncia: `src/modules/suporte/acesso.ts` e `actions.ts`.
- [x] ðŸ› ï¸ PÃ“S â€” **SEC-003 (documentos gerados):** enquanto o modelo nÃ£o persiste escopo da fonte, snapshots sÃ³ podem ser reabertos pelo gerador ou por sujeito com escopo global. A mesma regra cobre listagem, tela e PDF. EvidÃªncia: `src/modules/documentos/queries.ts` e `src/app/api/documentos/gerados/[id]/pdf/route.ts`.
- [x] ðŸ› ï¸ PÃ“S â€” **SEC-004 (chat):** `respostaAId` precisa pertencer ao mesmo canal de destino antes da criaÃ§Ã£o da mensagem. EvidÃªncia: `src/modules/chat/actions.ts`.
- [x] ðŸ› ï¸ PÃ“S â€” **SEC-005 (avisos):** imagem exige destinatÃ¡rio, autor ou permissÃ£o formal `avisos:enviar`; objeto fora de escopo retorna 404. EvidÃªncia: `src/app/api/avisos/[id]/imagem/route.ts`.
- [x] ðŸ› ï¸ PÃ“S â€” **SEC-006 (capa de grupo):** imagem exige membro do canal, exceto moderadores `admin`/`supervisor`, em coerÃªncia com as demais rotas do chat. EvidÃªncia: `src/app/api/chat/grupo/[canalId]/capa/route.ts`.
- [x] ðŸ› ï¸ PÃ“S â€” **SEC-007 (diferenÃ§a IFC):** upload-base Ã© filtrado por `escopoProjeto(user)` antes de retornar versÃµes convertidas. EvidÃªncia: `src/modules/coordenacao/{actions,queries}.ts`.
- [x] ðŸ› ï¸ PÃ“S â€” **SEC-008 (conversÃ£o DWG):** a solicitaÃ§Ã£o testa o mesmo acesso a documento/upload que a leitura de status antes de enfileirar job. EvidÃªncia: `src/modules/dwg/{acesso,actions}.ts`.
- [x] ðŸ› ï¸ PÃ“S â€” **SEC-009 (aceite):** antes de criar ou devolver capability, aplica a muralha de projeto e responsabilidade de disciplina dos uploads. EvidÃªncia: `src/modules/uploads/actions.ts`.

**VerificaÃ§Ã£o pÃ³s-correÃ§Ã£o:** os quatro erros de typecheck foram corrigidos; `vitest` focado passou (**38 testes em 7 arquivos**), ESLint passou nos arquivos alterados, `npx tsc --noEmit` e `npm run build` concluÃ­ram com sucesso.

### 0.3 Hardening P1 pÃ³s-auditoria â€” 24/08/2026

- [x] 🛠️ PÓS — **SEC-013 (exportações):** endpoints recebem apenas IDs/filtros por schemas Zod estritos, reidratam e recalculam as linhas no servidor; CSV e XLSX tornam literais textos que começam por `=`, `+`, `-` ou `@`, inclusive depois de espaço/tab. Evidência: `src/app/api/financeiro/{contas,relatorios/rentabilidade}/export/route.ts`, `src/lib/export/csv.ts` e `csv.test.ts`.
- [x] ðŸ› ï¸ PÃ“S (parcial) â€” **SEC-012 (aceite pÃºblico):** novos links expiram em 30 dias, podem ser revogados no projeto e os legados sem `expiraEm` ficam bloqueados atÃ© regeneraÃ§Ã£o. A resposta exige nome declarado, armazena IP/user-agent, Ã© auditada e usa `updateMany` condicional para aceitar uma Ãºnica resposta concorrente. A capability recebe `no-store`/`no-referrer`. EvidÃªncia: `prisma/migrations/20260824123000_endurecer_aceite_cliente`, `src/modules/uploads/aceite.ts`, `actions.ts`, rota e pÃ¡gina pÃºblicas.
- [ ] â³ â€” **Limite residual do SEC-012:** o nome declarado nÃ£o autentica o destinatÃ¡rio; token ainda estÃ¡ em texto claro no banco, visualizaÃ§Ãµes nÃ£o sÃ£o auditadas e falta rate limit especÃ­fico. O achado P1 permanece parcialmente aberto.

---

# P0 â€” CRÃTICO / AUDITAR PRIMEIRO

## 1. AutenticaÃ§Ã£o

### 1.1 Rotas protegidas realmente exigem autenticaÃ§Ã£o
**Severidade:** ðŸ”´ CrÃ­tica

- [ ] Verificar se toda rota privada valida a sessÃ£o/token no servidor.
- [ ] Verificar se nÃ£o existe rota protegida apenas por redirecionamento do frontend.
- [ ] Verificar se chamadas diretas via HTTP funcionam sem autenticaÃ§Ã£o.
- [x] ðŸ”Ž PRÃ‰ â€” Inventariados 120 Route Handlers e 93 mÃ³dulos de Server Actions; a validaÃ§Ã£o completa por chamada segue `â³`/itens abaixo.
- [ ] Verificar endpoints antigos ou nÃ£o utilizados.

**Procurar no cÃ³digo**
- middleware
- `getSession`
- `getUser`
- `auth()`
- `cookies()`
- `Authorization`
- `Bearer`
- handlers sem checagem de usuÃ¡rio

**Teste**
- Chamar a rota sem cookie/token.
- Chamar com token invÃ¡lido.
- Chamar com token expirado.

**Aprovado quando**
- Todas as operaÃ§Ãµes privadas retornam `401` ou equivalente antes de processar a requisiÃ§Ã£o.

---

### 1.2 SessÃ£o e JWT
**Severidade:** ðŸ”´ CrÃ­tica

- [x] âœ… PRÃ‰ â€” SessÃµes Better Auth possuem expiraÃ§Ã£o de 7 dias e renovaÃ§Ã£o controlada no servidor.
- [ ] Refresh tokens sÃ£o tratados com seguranÃ§a.
- [ ] Logout invalida a sessÃ£o quando aplicÃ¡vel.
- [ ] Troca de senha invalida sessÃµes antigas quando necessÃ¡rio.
- [ ] Bloqueio/desativaÃ§Ã£o de usuÃ¡rio impede uso de sessÃµes existentes.
- [ ] JWT nÃ£o aceita algoritmo inesperado.
- [x] âœ… PRÃ‰ â€” Claims/perfis efetivos sÃ£o consultados no servidor antes de `can()`/`defineAction`.
- [ ] Tokens nÃ£o sÃ£o armazenados em `localStorage` quando cookies HttpOnly forem opÃ§Ã£o viÃ¡vel.
- [x] âœ… PRÃ‰ â€” Varredura estÃ¡tica nÃ£o encontrou token administrativo permanente no bundle nem em `NEXT_PUBLIC_*`.

---

### 1.3 RecuperaÃ§Ã£o de senha
**Severidade:** ðŸ”´ CrÃ­tica

- [ ] Token de recuperaÃ§Ã£o expira.
- [ ] Token Ã© de uso Ãºnico.
- [ ] Token Ã© invalidado apÃ³s troca de senha.
- [ ] AlteraÃ§Ã£o de senha invalida sessÃµes antigas quando aplicÃ¡vel.
- [ ] RecuperaÃ§Ã£o nÃ£o revela se um email existe.
- [ ] AlteraÃ§Ã£o de email exige confirmaÃ§Ã£o.
- [ ] AlteraÃ§Ã£o de email sensÃ­vel exige reautenticaÃ§Ã£o.

---

## 2. AutorizaÃ§Ã£o

### 2.1 AutorizaÃ§Ã£o decidida no backend
**Severidade:** ðŸ”´ CrÃ­tica

- [ ] Nenhuma permissÃ£o crÃ­tica depende exclusivamente de botÃ£o oculto no frontend.
- [ ] âŒ PRÃ‰ â€” Toda operaÃ§Ã£o sensÃ­vel valida a role/permissÃ£o no servidor. HÃ¡ exceÃ§Ãµes de aÃ§Ã£o/rota no relatÃ³rio, inclusive `SEC-002`, `SEC-008`, `SEC-009` e `SEC-018`.
- [x] âœ… PRÃ‰ â€” O servidor nÃ£o confia em `role`, `isAdmin`, `userId` ou similares enviados pelo cliente nas aÃ§Ãµes protegidas: o sujeito vem da sessÃ£o server-side.
- [x] âœ… PRÃ‰ â€” PermissÃµes sÃ£o recalculadas/consultadas no servidor por `can()`/`permissaoEfetiva` nas aÃ§Ãµes que usam o controle central.

**Teste**
- Executar requisiÃ§Ã£o manual de uma funÃ§Ã£o administrativa com usuÃ¡rio comum.

---

### 2.2 Broken Function Level Authorization
**Severidade:** ðŸ”´ CrÃ­tica

- [ ] âŒ PRÃ‰ â€” UsuÃ¡rio comum nÃ£o chama endpoints administrativos. `obterTemplatosNotas` nÃ£o exige sessÃ£o nem permissÃ£o (`SEC-018`).
- [ ] Coordenador nÃ£o executa aÃ§Ã£o exclusiva de administrador.
- [ ] UsuÃ¡rio financeiro nÃ£o acessa RH se nÃ£o tiver permissÃ£o.
- [ ] UsuÃ¡rio de projeto nÃ£o altera configuraÃ§Ãµes globais.
- [ ] Rotas `/admin`, `/settings`, `/users`, `/permissions`, `/financeiro` sÃ£o validadas individualmente.

---

### 2.3 IDOR / BOLA
**Severidade:** ðŸ”´ CrÃ­tica

- [ ] âŒ PRÃ‰ â€” Toda busca por `id` verifica se o usuÃ¡rio pode acessar aquele objeto. HÃ¡ falhas confirmadas em tarefas, suporte, avisos, chat, coordenaÃ§Ã£o, DWG, aceite e documentos gerados (`SEC-001` a `SEC-009`).
- [ ] Projeto por ID verifica empresa/tenant.
- [ ] Arquivo por ID verifica projeto e tenant.
- [ ] UsuÃ¡rio por ID verifica permissÃ£o.
- [ ] Proposta por ID verifica escopo.
- [ ] âŒ PRÃ‰ â€” Documento por ID verifica escopo. `DocumentoGerado` Ã© lido por `documentos:ver` sem revalidar a fonte/sujeito do snapshot (`SEC-003`).
- [ ] Pagamento por ID verifica escopo.
- [ ] âŒ PRÃ‰ â€” ComentÃ¡rio por ID verifica escopo. Download/comentÃ¡rio de tarefa nÃ£o chega Ã  tarefa escopada (`SEC-001`).
- [ ] âŒ PRÃ‰ â€” Endpoints de update/delete fazem a mesma validaÃ§Ã£o. `toggleItemTarefa` atualiza pelo ID sem ownership (`SEC-001`).
- [ ] IDs UUID nÃ£o sÃ£o tratados como mecanismo de seguranÃ§a.

**PadrÃµes para procurar**
- `findUnique({ where: { id`
- `.eq("id", id)`
- `/api/.../[id]`
- `params.id`
- `searchParams.get("id")`

---

### 2.4 Isolamento entre tenants/empresas

> **AdaptaÃ§Ã£o arquitetural:** o SENAHub nÃ£o possui `tenantId`/`organizationId` nem cliente Supabase/Firebase. Para esta aplicaÃ§Ã£o, os controles equivalentes sÃ£o escopo por projeto, cliente, canal e usuÃ¡rio. `âž– N/A` neste bloco nÃ£o equivale a aprovaÃ§Ã£o de isolamento; os desvios de escopo estÃ£o registrados como `âŒ PRÃ‰`.
**Severidade:** ðŸ”´ CrÃ­tica

- [x] âž– N/A â€” NÃ£o hÃ¡ modelo multiempresa com `tenantId`/`organizationId`; o isolamento aplicÃ¡vel Ã© por projeto/cliente/canal.
- [ ] âŒ PRÃ‰ â€” Toda query privada inclui o escopo equivalente correto. Consultas de tarefas, busca global, documentos gerados e coordenaÃ§Ã£o escapam desse escopo (`SEC-001`, `SEC-003`, `SEC-007`).
- [ ] RelaÃ§Ãµes indiretas tambÃ©m respeitam tenant.
- [ ] âŒ PRÃ‰ â€” UsuÃ¡rio de outro projeto/cliente nÃ£o acessa objeto alheio alterando ID. Falhas BOLA confirmadas em `SEC-001` a `SEC-009`.
- [ ] ExportaÃ§Ãµes respeitam tenant.
- [ ] âŒ PRÃ‰ â€” Busca global respeita escopo: a busca de tarefas nÃ£o aplica `escopoTarefa` (`SEC-001`).
- [ ] Dashboard e indicadores respeitam tenant.
- [ ] Jobs e relatÃ³rios respeitam tenant.
- [ ] WebSockets/realtime respeitam tenant.
- [ ] Cache Ã© segregado por tenant.

---

### 2.5 Escalada horizontal e vertical
**Severidade:** ðŸ”´ CrÃ­tica

- [ ] UsuÃ¡rio nÃ£o consegue trocar o prÃ³prio `role`.
- [ ] UsuÃ¡rio nÃ£o consegue alterar `organizationId`.
- [ ] UsuÃ¡rio nÃ£o consegue alterar `ownerId` para obter acesso.
- [ ] UsuÃ¡rio nÃ£o consegue se adicionar a projeto/equipe sem permissÃ£o.
- [ ] UsuÃ¡rio nÃ£o consegue elevar outro usuÃ¡rio.
- [ ] Admin de uma empresa nÃ£o vira admin global.

---

## 3. Banco de dados / Supabase / Firebase

### 3.1 RLS
**Severidade:** ðŸ”´ CrÃ­tica

- [x] âž– N/A â€” RLS/policies nÃ£o sÃ£o parte desta arquitetura: nÃ£o hÃ¡ Supabase/Firebase nem acesso direto do cliente ao PostgreSQL.
- [x] âž– N/A â€” `SELECT`/`INSERT`/`UPDATE`/`DELETE` policies, `USING`/`WITH CHECK` e views RLS nÃ£o existem nesta base.
- [x] âœ… PRÃ‰ â€” O Prisma Ã© usado apenas em cÃ³digo server-side; a autorizaÃ§Ã£o aplicÃ¡vel Ã© por sessÃ£o/permissÃ£o/escopo, cujas exceÃ§Ãµes estÃ£o registradas em `SEC-001` a `SEC-009`.

---

### 3.2 Service role / credenciais administrativas
**Severidade:** ðŸ”´ CrÃ­tica

- [x] âž– N/A â€” NÃ£o hÃ¡ `service_role`/SDK Supabase no repositÃ³rio revisado.
- [ ] â³ â€” Rotacionar chave caso se descubra exposiÃ§Ã£o em histÃ³rico remoto/CI; a varredura estÃ¡tica atual nÃ£o encontrou chave vÃ¡lida.

---

### 3.3 Firebase Rules
**Severidade:** ðŸ”´ CrÃ­tica

- [x] âž– N/A â€” Firebase/Firestore Rules nÃ£o sÃ£o usados pelo SENAHub nesta base.

---

## 4. Segredos e credenciais

### 4.1 Secrets expostos
**Severidade:** ðŸ”´ CrÃ­tica

- [x] âœ… PRÃ‰ â€” Varredura de padrÃµes de API keys/segredos no cÃ³digo rastreado nÃ£o encontrou segredo vÃ¡lido exposto.
- [x] ðŸ”Ž PRÃ‰ â€” HistÃ³rico/referÃªncias foi inspecionado superficialmente; varredura completa de histÃ³rico remoto com Gitleaks permanece `â³`.
- [x] âœ… PRÃ‰ â€” NÃ£o hÃ¡ `.env` real rastreado: somente `.env.example` e `.env.production.example` com placeholders.
- [x] âœ… PRÃ‰ â€” README, scripts, testes e configuraÃ§Ã£o revisados nÃ£o contÃªm credenciais vÃ¡lidas conhecidas.
- [ ] â³ â€” Logs de produÃ§Ã£o/CI nÃ£o foram acessados nesta revisÃ£o estÃ¡tica.
- [x] âœ… PRÃ‰ â€” Varredura estÃ¡tica do bundle/configuraÃ§Ã£o nÃ£o encontrou secrets em `NEXT_PUBLIC_*`; hÃ¡ apenas versÃ£o/SHA e chave VAPID pÃºblica.
- [ ] Rotacionar qualquer credencial previamente exposta.

**PadrÃµes**
- `sk_`
- `api_key`
- `apikey`
- `secret`
- `token`
- `password`
- `service_role`
- `private_key`
- `client_secret`
- `DATABASE_URL`

---

## 5. Upload e processamento de arquivos

### 5.1 ValidaÃ§Ã£o de upload
**Severidade:** ðŸ”´ CrÃ­tica / ðŸŸ  Alta

- [ ] Validar extensÃ£o.
- [ ] âŒ PRÃ‰ â€” Validar MIME type real. Fluxos de suporte, tarefa, chat, documentos e proposta confiam em MIME/extensÃ£o do cliente (`SEC-010`, `SEC-011`).
- [ ] âŒ PRÃ‰ â€” Validar assinatura/magic bytes quando possÃ­vel. NÃ£o hÃ¡ serviÃ§o central que faÃ§a essa validaÃ§Ã£o (`SEC-010`, `SEC-011`).
- [ ] Definir tamanho mÃ¡ximo.
- [ ] Definir quantidade mÃ¡xima.
- [ ] Renomear arquivo no servidor.
- [ ] NÃ£o confiar no filename enviado pelo usuÃ¡rio.
- [x] âœ… PRÃ‰ â€” Evitar path traversal: `resolverCaminho()` confina leitura/escrita ao `STORAGE_BASE_PATH`.
- [ ] âŒ PRÃ‰ â€” Bloquear executÃ¡veis em todos os fluxos: suporte/proposta aceitam conteÃºdo arbitrÃ¡rio (`SEC-011`).
- [ ] âŒ PRÃ‰ â€” Bloquear HTML/SVG quando nÃ£o necessÃ¡rios. SVG Ã© aceito e servido `inline` (`SEC-010`).
- [ ] Bloquear arquivos com dupla extensÃ£o suspeita.
- [ ] Armazenar fora da pasta executÃ¡vel.
- [ ] âŒ PRÃ‰ â€” Definir Content-Disposition adequado no download. Anexos controlados pelo cliente podem ser servidos `inline` (`SEC-010`).
- [ ] Definir Content-Type adequado no download.

- [x] ðŸ› ï¸ PÃ“S (parcial) â€” `src/lib/upload-policy.ts` centraliza allowlist, MIME canÃ´nico e conferÃªncia de assinatura onde hÃ¡ formato estÃ¡vel. Os fluxos de suporte, tarefas, chat (direto e em chunks) e proposta pÃºblica usam essa polÃ­tica; SVG/HTML/executÃ¡veis sÃ£o recusados.
- [x] ðŸ› ï¸ PÃ“S (parcial) â€” Imagens novas do EstÃºdio sÃ£o reencodadas para JPEG por `sharp`; SVG novo foi bloqueado e SVG legado deixou de ser servido.
- [x] ðŸ› ï¸ PÃ“S (parcial) â€” Anexos de suporte, tarefas e chat sÃ£o sempre entregues como `attachment` com `application/octet-stream` e `nosniff`, sem executar conteÃºdo controlado pelo usuÃ¡rio na origem do ERP.
- [ ] â³ â€” Migrar os demais 20+ pontos de upload, definir allowlist especÃ­fica de cada regra de negÃ³cio e acrescentar scanner/quarentena para Office/CAD/ZIP. Portanto `SEC-010` e `SEC-011` nÃ£o estÃ£o encerrados integralmente.

---

### 5.2 Path Traversal
**Severidade:** ðŸ”´ CrÃ­tica

- [x] âœ… PRÃ‰ â€” Nenhum caminho de storage revisado usa diretamente o nome fornecido pelo usuÃ¡rio como caminho; o nome Ã© limpo e o destino Ã© controlado.
- [x] âœ… PRÃ‰ â€” `resolverCaminho()` bloqueia `../`.
- [x] âœ… PRÃ‰ â€” `resolverCaminho()` bloqueia caminhos absolutos fora da base.
- [x] âœ… PRÃ‰ â€” Paths sÃ£o normalizados com `path.resolve`/`path.relative`.
- [x] âœ… PRÃ‰ â€” Leitura e escrita via `lib/storage` permanecem na pasta permitida.

**Procurar**
- `fs.readFile`
- `fs.writeFile`
- `path.join`
- `path.resolve`
- filename vindo de request

---

### 5.3 Command Injection
**Severidade:** ðŸ”´ CrÃ­tica

Especialmente relevante para:
- conversÃ£o DWG/DXF;
- PDFs;
- imagens;
- IFC/BIM;
- ZIP;
- ferramentas CLI;
- antivÃ­rus;
- OCR;
- FFmpeg;
- LibreOffice;
- scripts Python externos.

- [ ] Procurar `exec`.
- [ ] Procurar `execSync`.
- [ ] Procurar `spawn`.
- [ ] Procurar `shell: true`.
- [x] âœ… PRÃ‰ â€” Nos launches de runtime revisados, parÃ¢metros do usuÃ¡rio nÃ£o sÃ£o concatenados em comando.
- [x] âœ… PRÃ‰ â€” Conversores usam `spawn` com argumentos separados, sem `shell: true` no caminho de requisiÃ§Ã£o.
- [x] âœ… PRÃ‰ â€” ParÃ¢metros/formato de conversores revisados usam valores fixos/allowlists.
- [x] âœ… PRÃ‰ â€” Nomes/caminhos passam pela sanitizaÃ§Ã£o/confinamento de storage.
- [ ] Executar ferramenta com usuÃ¡rio sem privilÃ©gios.
- [ ] Definir timeout.
- [ ] Definir limites de memÃ³ria/CPU quando possÃ­vel.

---

### 5.4 ZIP Slip
**Severidade:** ðŸ”´ CrÃ­tica

- [x] âž– N/A â€” A base revisada gera ZIPs, mas nÃ£o possui fluxo de extraÃ§Ã£o de ZIP a ser protegido contra Zip Slip nesta superfÃ­cie.

---

## 6. Storage / Buckets

### 6.1 Arquivos privados
**Severidade:** ðŸ”´ CrÃ­tica

- [ ] Buckets privados sÃ£o realmente privados.
- [ ] URLs assinadas possuem expiraÃ§Ã£o.
- [ ] âŒ PRÃ‰ â€” Download verifica autorizaÃ§Ã£o. Downloads/recursos de tarefa, aviso e capa de canal tÃªm lacunas de escopo (`SEC-001`, `SEC-005`, `SEC-006`).
- [ ] âŒ PRÃ‰ â€” NÃ£o existe URL previsÃ­vel que ignore permissÃ£o. HÃ¡ rotas por ID que nÃ£o aplicam a polÃ­tica do objeto (`SEC-001` a `SEC-009`).
- [ ] Listagem do bucket nÃ£o Ã© pÃºblica.
- [ ] Upload respeita tenant.
- [ ] Delete respeita tenant.
- [ ] Nome do arquivo nÃ£o revela dado sensÃ­vel desnecessariamente.

---

## 7. SSRF

**Severidade:** ðŸ”´ CrÃ­tica

- [x] âœ… PRÃ‰ â€” RevisÃ£o estÃ¡tica nÃ£o identificou endpoint de runtime que aceite URL externa controlada pelo usuÃ¡rio; ViaCEP usa host fixo e CEP normalizado.
- [x] âœ… PRÃ‰ â€” NÃ£o foi identificado preview/importaÃ§Ã£o por URL ou webhook configurÃ¡vel nesta base.
- [ ] Bloquear localhost.
- [ ] Bloquear IPs privados.
- [ ] Bloquear metadata endpoints de cloud.
- [ ] Permitir apenas `http/https`.
- [ ] Considerar allowlist de domÃ­nios quando viÃ¡vel.
- [ ] Validar redirects.
- [ ] Limitar tamanho da resposta.
- [ ] Definir timeout.

---

## 8. Mass Assignment

**Severidade:** ðŸ”´ CrÃ­tica

- [ ] API nÃ£o salva diretamente `req.body`.
- [ ] DTO/schema define explicitamente campos permitidos.
- [ ] Bloquear alteraÃ§Ã£o de `role`.
- [ ] Bloquear alteraÃ§Ã£o de `isAdmin`.
- [ ] Bloquear alteraÃ§Ã£o de `tenantId`.
- [ ] Bloquear alteraÃ§Ã£o de `organizationId`.
- [ ] Bloquear alteraÃ§Ã£o de `ownerId` quando nÃ£o autorizado.
- [ ] Bloquear alteraÃ§Ã£o de campos de aprovaÃ§Ã£o.
- [ ] Bloquear alteraÃ§Ã£o direta de campos financeiros crÃ­ticos.

**Procurar**
- `data: body`
- `data: req.body`
- `...body`
- `...payload`
- `.update(payload)`

---

# P1 â€” ALTA PRIORIDADE

## 9. ValidaÃ§Ã£o de entrada

**Severidade:** ðŸŸ  Alta

- [ ] âŒ PRÃ‰ â€” Todas as APIs possuem schema. Server Actions centrais usam Zod, mas Route Handlers de exportaÃ§Ã£o/upload aceitam `FormData`/JSON sem schema de execuÃ§Ã£o uniforme (`SEC-011`, `SEC-013`).
- [x] 🛠️ PÓS — **SEC-013:** as duas rotas de exportação financeira usam Zod estrito, rejeitam campos inesperados e não aceitam mais linhas/títulos do navegador; permanece a auditoria dos demais Route Handlers (`SEC-011`).
- [ ] âŒ PRÃ‰ â€” Usar Zod/Joi/Valibot/equivalente em toda fronteira de API. Cobertura Ã© parcial.
- [ ] Validar tipo.
- [ ] Validar tamanho.
- [ ] Validar formato.
- [ ] Validar enums.
- [ ] Validar ranges numÃ©ricos.
- [ ] Rejeitar campos inesperados quando apropriado.
- [ ] Validar IDs.
- [ ] Validar datas.
- [ ] Validar URLs.
- [ ] Validar email.
- [ ] Validar campos monetÃ¡rios.
- [ ] NÃ£o confiar na validaÃ§Ã£o do frontend.

---

## 10. SQL / NoSQL Injection

**Severidade:** ðŸ”´ CrÃ­tica / ðŸŸ  Alta

- [x] âœ… PRÃ‰ â€” Nenhuma query SQL de runtime revisada concatena input do usuÃ¡rio.
- [x] âœ… PRÃ‰ â€” Queries de runtime revisadas usam parÃ¢metros; o raw SQL de documentos passa valores separadamente.
- [x] âœ… PRÃ‰ â€” `raw SQL`/`$queryRawUnsafe`, filtros e ordenaÃ§Ã£o dinÃ¢mica de runtime foram revisados; ordenaÃ§Ã£o usa whitelist.
- [x] âž– N/A â€” NÃ£o hÃ¡ operadores Mongo/Firebase enviados pelo cliente nesta arquitetura.

---

## 11. XSS

**Severidade:** ðŸŸ  Alta

- [ ] Revisar campos rich text.
- [ ] Revisar comentÃ¡rios.
- [ ] Revisar descriÃ§Ã£o de projeto.
- [ ] Revisar nomes de arquivo.
- [ ] Revisar observaÃ§Ãµes.
- [ ] Revisar mensagens.
- [ ] Revisar dashboards.
- [ ] Revisar HTML de email.
- [ ] Evitar `dangerouslySetInnerHTML`.
- [ ] Sanitizar HTML quando realmente necessÃ¡rio.
- [ ] Escapar conteÃºdo por padrÃ£o.
- [ ] âŒ PRÃ‰ â€” Definir CSP adequada. NÃ£o hÃ¡ `Content-Security-Policy` no cÃ³digo, e hÃ¡ risco de conteÃºdo ativo por upload (`SEC-010`, `SEC-020`).

---

## 12. CSRF

**Severidade:** ðŸŸ  Alta

AplicÃ¡vel principalmente se autenticaÃ§Ã£o usar cookies.

- [ ] Cookies usam `SameSite`.
- [ ] OperaÃ§Ãµes mutÃ¡veis nÃ£o aceitam GET.
- [ ] Validar Origin/Referer quando apropriado.
- [ ] Implementar token CSRF quando necessÃ¡rio.
- [ ] Testar POST/PUT/PATCH/DELETE a partir de outro domÃ­nio.

---

## 13. CORS

**Severidade:** ðŸŸ  Alta

- [x] âœ… PRÃ‰ â€” NÃ£o hÃ¡ header CORS permissivo (`*`) nem reflexÃ£o automÃ¡tica de `Origin` no cÃ³digo revisado; a ausÃªncia de CORS mantÃ©m o padrÃ£o restritivo do navegador.
- [ ] ProduÃ§Ã£o nÃ£o aceita localhost desnecessariamente.
- [ ] MÃ©todos permitidos sÃ£o mÃ­nimos.
- [ ] Headers permitidos sÃ£o mÃ­nimos.

---

## 14. Rate Limiting

**Severidade:** ðŸŸ  Alta

Aplicar especialmente em:
- login;
- reset de senha;
- convite;
- OTP;
- upload;
- download em massa;
- exportaÃ§Ã£o;
- geraÃ§Ã£o de PDF;
- IA;
- busca pesada;
- webhooks;
- endpoints pÃºblicos.

- [ ] âŒ PRÃ‰ â€” Rate limit por IP/usuÃ¡rio, limites por endpoint e logs de abuso nÃ£o sÃ£o gerais para capabilities pÃºblicas e rotas caras (`SEC-014`).
- [ ] âŒ PRÃ‰ â€” Resposta `429` existe pontualmente, mas nÃ£o decorre de limitador geral (`SEC-014`).

---

## 15. Brute force / credential stuffing

**Severidade:** ðŸŸ  Alta

- [x] âœ… PRÃ‰ â€” Better Auth aplica rate limit por IP ao login (10 tentativas/5 min para sign-in).
- [ ] Backoff progressivo.
- [ ] Alertar tentativas anormais.
- [ ] âŒ PRÃ‰ â€” MFA para usuÃ¡rios privilegiados nÃ£o foi identificado na base revisada.
- [ ] NÃ£o revelar usuÃ¡rio existente.
- [ ] Considerar bloqueio temporÃ¡rio inteligente.

---

## 16. MFA e aÃ§Ãµes crÃ­ticas

**Severidade:** ðŸŸ  Alta

- [ ] âŒ PRÃ‰ â€” MFA disponÃ­vel/exigido para administradores nÃ£o foi identificado na base revisada.
- [ ] ReautenticaÃ§Ã£o para troca de senha.
- [ ] ReautenticaÃ§Ã£o para troca de email.
- [ ] ReautenticaÃ§Ã£o para alterar MFA.
- [ ] ReautenticaÃ§Ã£o para aÃ§Ãµes financeiras de alto impacto.
- [ ] ReautenticaÃ§Ã£o para alterar permissÃµes crÃ­ticas.

---

## 17. Webhooks

**Severidade:** ðŸŸ  Alta

- [x] âž– N/A â€” NÃ£o foram identificados webhooks de entrada configurÃ¡veis nesta base.

---

## 18. Race Conditions

**Severidade:** ðŸŸ  Alta

- [ ] AprovaÃ§Ã£o nÃ£o pode ocorrer duas vezes.
- [ ] Pagamento nÃ£o pode ser processado duas vezes.
- [ ] âŒ PRÃ‰ â€” Aceite pÃºblico Ã© idempotente. O fluxo lÃª `pendente` e atualiza sem condiÃ§Ã£o atÃ´mica (`SEC-012`).
- [x] ðŸ› ï¸ PÃ“S (parcial) â€” A resposta usa `updateMany` com `situacao: "pendente"`, `revogadoEm: null` e `expiraEm > now`, recusando a segunda resposta concorrente (`SEC-012`).
- [ ] Convite nÃ£o gera duplicidades.
- [ ] Upload/versionamento nÃ£o gera estados inconsistentes.
- [ ] âŒ PRÃ‰ â€” Usar transaÃ§Ãµes/constraints quando necessÃ¡rio. NumeraÃ§Ã£o de `DocumentoGerado` Ã© calculada fora de transaÃ§Ã£o e nÃ£o possui unicidade `serie+numero` (`SEC-017`).
- [ ] Usar idempotency keys quando necessÃ¡rio.

---

## 19. LÃ³gica de negÃ³cio

**Severidade:** ðŸŸ  Alta

- [ ] NÃ£o alterar proposta apÃ³s aceite sem versionamento.
- [ ] NÃ£o alterar valor aprovado sem nova autorizaÃ§Ã£o.
- [ ] NÃ£o aprovar etapa fora de ordem.
- [ ] NÃ£o marcar pagamento sem permissÃ£o adequada.
- [ ] NÃ£o excluir evidÃªncia/auditoria indevidamente.
- [ ] NÃ£o transferir projeto para outro tenant.
- [ ] NÃ£o convidar usuÃ¡rios ilimitadamente.
- [ ] NÃ£o burlar limites alterando requests manualmente.
- [ ] Regras crÃ­ticas existem no servidor, nÃ£o apenas na UI.

---

## 20. ExposiÃ§Ã£o excessiva de dados

**Severidade:** ðŸŸ  Alta

- [ ] API retorna apenas campos necessÃ¡rios.
- [ ] NÃ£o retornar hashes.
- [ ] âŒ PRÃ‰ â€” NÃ£o retornar tokens. A aÃ§Ã£o de gerar aceite devolve a URL-capability, inclusive sem validar escopo do upload (`SEC-009`).
- [ ] NÃ£o retornar secrets.
- [ ] NÃ£o retornar CPF/documentos sem necessidade.
- [ ] NÃ£o retornar salÃ¡rio sem necessidade.
- [ ] NÃ£o retornar permissÃµes internas excessivas.
- [ ] âŒ PRÃ‰ â€” NÃ£o retornar dados de outro escopo. Snapshots de documentos e respostas de chat podem atravessar fonte/canal (`SEC-003`, `SEC-004`).
- [ ] Revisar `select *`.
- [ ] Revisar serializaÃ§Ã£o automÃ¡tica de objetos ORM.

---

## 21. Cache e Next.js

**Severidade:** ðŸŸ  Alta

- [ ] Dados privados nÃ£o sÃ£o cacheados globalmente.
- [ ] Cache considera usuÃ¡rio/tenant.
- [ ] Route caching nÃ£o mistura respostas entre usuÃ¡rios.
- [ ] `revalidate` Ã© utilizado conscientemente.
- [ ] CDN nÃ£o armazena resposta autenticada indevidamente.
- [ ] Headers `Cache-Control` estÃ£o corretos.
- [ ] Dados financeiros usam polÃ­tica adequada de cache.

---

## 22. DependÃªncias

**Severidade:** ðŸŸ  Alta

- [x] ðŸ”Ž PRÃ‰ â€” `npm audit --omit=dev` executado na linha de base: 24 vulnerabilidades de produÃ§Ã£o, 17 altas.
- [x] âœ… PRÃ‰ â€” CVEs altas foram identificadas e registradas em `SEC-015`.
- [ ] âŒ PRÃ‰ â€” Atualizar dependÃªncias vulnerÃ¡veis. A linha de base ainda possui vulnerabilidades altas em Better Auth, Next, PDF.js, Prisma, Puppeteer, Sharp e transitivas.
- [ ] Remover pacotes nÃ£o utilizados.
- [ ] Evitar pacotes abandonados.
- [ ] Revisar dependÃªncias transitivas crÃ­ticas.
- [x] âœ… PRÃ‰ â€” `package-lock.json` estÃ¡ versionado.
- [ ] InstalaÃ§Ã£o reproduzÃ­vel.

**Ferramentas sugeridas**
- `npm audit`
- `pnpm audit`
- GitHub Dependabot
- Snyk
- OSV Scanner

---

## 23. Supply Chain

**Severidade:** ðŸŸ  Alta

- [x] âœ… PRÃ‰ â€” `postinstall` foi revisado; executa geraÃ§Ã£o Prisma, sem download/script arbitrÃ¡rio adicional identificado.
- [x] âž– N/A â€” NÃ£o hÃ¡ GitHub Actions versionadas neste repositÃ³rio para revisar.
- [ ] Fixar versÃµes de actions crÃ­ticas.
- [ ] Proteger tokens de CI/CD.
- [ ] Branch principal protegida.
- [ ] Pull request obrigatÃ³rio para alteraÃ§Ãµes crÃ­ticas.
- [ ] NÃ£o permitir secrets em logs de CI.
- [ ] Dependabot habilitado quando possÃ­vel.

---

## 24. DoS / consumo de recursos

**Severidade:** ðŸŸ  Alta

- [ ] PaginaÃ§Ã£o obrigatÃ³ria.
- [ ] Limitar `limit/pageSize`.
- [ ] Limitar tamanho de filtros.
- [ ] Limitar uploads.
- [ ] Limitar quantidade de arquivos.
- [ ] Limitar exportaÃ§Ãµes.
- [ ] Timeout para jobs.
- [ ] Timeout para requests externas.
- [ ] Evitar regex vulnerÃ¡vel a ReDoS.
- [ ] Proteger geraÃ§Ã£o de PDF/ZIP.
- [ ] Proteger processamento BIM.
- [ ] Proteger IA contra uso ilimitado.

---

## 25. APIs antigas e shadow APIs

**Severidade:** ðŸŸ  Alta

- [x] âœ… PRÃ‰ â€” InventÃ¡rio estÃ¡tico de 120 Route Handlers concluÃ­do; o inventÃ¡rio nÃ£o implica aprovaÃ§Ã£o de cada controle.
- [ ] Identificar versÃµes antigas.
- [ ] Identificar endpoints nÃ£o documentados.
- [ ] Identificar endpoints de teste.
- [ ] Remover rotas obsoletas.
- [ ] Garantir controles iguais em todas as versÃµes.

---

## 26. PainÃ©is administrativos e debug

**Severidade:** ðŸ”´ CrÃ­tica / ðŸŸ  Alta

- [ ] Prisma Studio nÃ£o exposto.
- [ ] Swagger interno protegido.
- [ ] Devtools administrativas protegidas.
- [ ] PainÃ©is Supabase/Firebase nÃ£o tÃªm credenciais compartilhadas.
- [ ] `/debug` removido.
- [ ] `/dev` removido.
- [ ] Stack trace desligado em produÃ§Ã£o.
- [ ] âŒ PRÃ‰ â€” Healthcheck nÃ£o expÃµe informaÃ§Ã£o sensÃ­vel. `/api/health` revela versÃ£o, commit e estado de banco/storage/Chrome/SMTP (`SEC-019`).
- [ ] MÃ©tricas internas protegidas.

---

## 27. Logs com dados sensÃ­veis

**Severidade:** ðŸŸ  Alta

- [ ] NÃ£o logar senha.
- [ ] NÃ£o logar JWT completo.
- [ ] NÃ£o logar refresh token.
- [ ] NÃ£o logar cookies.
- [ ] NÃ£o logar API keys.
- [ ] NÃ£o logar dados bancÃ¡rios completos.
- [ ] Mascarar CPF/documentos quando apropriado.
- [ ] Revisar logs do servidor.
- [ ] Revisar logs de frontend.
- [ ] Revisar logs de CI/CD.

---

## 28. Backups

**Severidade:** ðŸŸ  Alta

- [ ] âŒ PRÃ‰ â€” Backup criptografado. O cÃ³digo grava dump/cÃ³pia de storage sem criptografia ou verificaÃ§Ã£o de ACL (`SEC-016`).
- [ ] Backup nÃ£o pÃºblico.
- [ ] Credencial de backup separada.
- [ ] Acesso restrito.
- [x] âœ… PRÃ‰ â€” RetenÃ§Ã£o de backup de 30 dias estÃ¡ definida no cÃ³digo.
- [ ] Teste de restauraÃ§Ã£o realizado.
- [ ] Dados antigos excluÃ­dos conforme polÃ­tica.
- [ ] Backups nÃ£o ficam em pasta pÃºblica da aplicaÃ§Ã£o.

---

## 29. HomologaÃ§Ã£o / desenvolvimento

**Severidade:** ðŸŸ  Alta

- [ ] HomologaÃ§Ã£o nÃ£o usa banco de produÃ§Ã£o desnecessariamente.
- [ ] Dados reais sÃ£o anonimizados.
- [ ] Credenciais sÃ£o diferentes de produÃ§Ã£o.
- [ ] Debug nÃ£o expÃµe secrets.
- [ ] Ambiente dev nÃ£o estÃ¡ publicamente aberto.
- [ ] UsuÃ¡rios de teste nÃ£o possuem senha padrÃ£o em produÃ§Ã£o.
- [ ] CORS e RLS tambÃ©m funcionam em staging.

---

# P2 â€” HARDENING / MÃ‰DIA PRIORIDADE

## 30. Cookies

**Severidade:** ðŸŸ¡ MÃ©dia / ðŸŸ  Alta

- [ ] `Secure`.
- [ ] `HttpOnly`.
- [ ] `SameSite=Lax` ou `Strict` quando possÃ­vel.
- [ ] `Domain` mÃ­nimo.
- [ ] `Path` mÃ­nimo.
- [ ] ExpiraÃ§Ã£o adequada.
- [ ] Cookies de sessÃ£o nÃ£o sÃ£o acessÃ­veis por JavaScript quando desnecessÃ¡rio.

---

## 31. Security Headers

**Severidade:** ðŸŸ¡ MÃ©dia

- [ ] âŒ PRÃ‰ â€” `Content-Security-Policy` nÃ£o estÃ¡ configurada no cÃ³digo (`SEC-020`).
- [ ] â³ â€” `Strict-Transport-Security` deve ser confirmado no proxy/Cloudflare; nÃ£o hÃ¡ configuraÃ§Ã£o na aplicaÃ§Ã£o.
- [x] âœ… PRÃ‰ â€” `X-Content-Type-Options: nosniff` estÃ¡ configurado globalmente.
- [x] âœ… PRÃ‰ â€” `Referrer-Policy: strict-origin-when-cross-origin` estÃ¡ configurada globalmente.
- [x] âœ… PRÃ‰ â€” `Permissions-Policy` restritiva estÃ¡ configurada globalmente.
- [ ] âŒ PRÃ‰ â€” `frame-ancestors` na CSP nÃ£o existe porque a CSP estÃ¡ ausente; `X-Frame-Options: DENY` fornece mitigaÃ§Ã£o legada complementar.
- [ ] Evitar headers que revelem stack desnecessariamente.

---

## 32. HTTPS / TLS

**Severidade:** ðŸŸ  Alta

- [ ] HTTP redireciona para HTTPS.
- [ ] Cookies seguros sÃ³ trafegam por HTTPS.
- [ ] Certificado vÃ¡lido.
- [ ] TLS antigo desabilitado.
- [ ] ComunicaÃ§Ã£o interna sensÃ­vel protegida quando necessÃ¡rio.
- [ ] Webhooks usam HTTPS.

---

## 33. Clickjacking

**Severidade:** ðŸŸ¡ MÃ©dia

- [ ] Definir `frame-ancestors`.
- [x] âœ… PRÃ‰ â€” A aplicaÃ§Ã£o nÃ£o permite iframe por `X-Frame-Options: DENY`.
- [ ] Testar pÃ¡ginas sensÃ­veis em iframe externo.

---

## 34. Open Redirect

**Severidade:** ðŸŸ¡ MÃ©dia

- [ ] Validar `redirect`.
- [ ] Validar `returnUrl`.
- [ ] Usar caminhos relativos quando possÃ­vel.
- [ ] Bloquear domÃ­nio externo arbitrÃ¡rio.

---

## 35. EnumeraÃ§Ã£o de usuÃ¡rios

**Severidade:** ðŸŸ¡ MÃ©dia

- [ ] Login nÃ£o revela conta existente.
- [ ] Reset nÃ£o revela conta existente.
- [ ] Convite nÃ£o revela informaÃ§Ã£o excessiva.
- [ ] API de usuÃ¡rios nÃ£o permite busca pÃºblica indevida.

---

## 36. Erros e stack traces

**Severidade:** ðŸŸ¡ MÃ©dia

- [ ] ProduÃ§Ã£o nÃ£o retorna stack trace.
- [ ] NÃ£o retornar SQL.
- [ ] NÃ£o retornar paths internos.
- [ ] NÃ£o retornar versÃµes.
- [ ] NÃ£o retornar secrets.
- [ ] Erro externo genÃ©rico; detalhe apenas no log seguro.

---

## 37. InformaÃ§Ã£o de versÃ£o

**Severidade:** ðŸŸ¢ Baixa / ðŸŸ¡ MÃ©dia

- [ ] Remover headers desnecessÃ¡rios.
- [ ] âŒ PRÃ‰ â€” NÃ£o expor versÃ£o/commit exato: `/api/health` os publica (`SEC-019`).
- [ ] NÃ£o expor versÃ£o do banco.
- [ ] NÃ£o publicar arquivos internos de diagnÃ³stico.

---

## 38. Dados sensÃ­veis em URL

**Severidade:** ðŸŸ¡ MÃ©dia

- [ ] NÃ£o colocar token em query string.
- [ ] NÃ£o colocar senha em URL.
- [ ] Evitar CPF/documentos em URL.
- [ ] Evitar dados financeiros em URL.
- [ ] âŒ PRÃ‰ â€” Tokens temporÃ¡rios possuem expiraÃ§Ã£o curta quando URL for inevitÃ¡vel. O aceite pÃºblico nÃ£o expira nem pode ser revogado (`SEC-012`).
- [x] ðŸ› ï¸ PÃ“S (parcial) â€” Novos links de aceite expiram em 30 dias e podem ser revogados; links legados sem validade sÃ£o recusados atÃ© regeneraÃ§Ã£o (`SEC-012`).

---

## 39. Metadados de arquivos

**Severidade:** ðŸŸ¡ MÃ©dia

- [ ] Avaliar remoÃ§Ã£o de EXIF de imagens.
- [ ] Avaliar GPS em fotos.
- [ ] Avaliar autor/empresa em documentos.
- [ ] Avaliar paths internos incorporados em PDFs.
- [ ] NÃ£o expor metadados desnecessÃ¡rios no frontend.

---

# AUDITORIA E MONITORAMENTO

## 40. Audit log

**Severidade:** ðŸŸ  Alta

Registrar no mÃ­nimo:

- [x] âœ… PRÃ‰ â€” Login Ã© registrado por hook do Better Auth.
- [ ] Falha de login.
- [ ] Logout.
- [ ] Reset de senha.
- [ ] AlteraÃ§Ã£o de email.
- [ ] AlteraÃ§Ã£o de MFA.
- [ ] CriaÃ§Ã£o de usuÃ¡rio.
- [ ] ExclusÃ£o de usuÃ¡rio.
- [ ] AlteraÃ§Ã£o de role.
- [ ] AlteraÃ§Ã£o de permissÃ£o.
- [ ] Acesso administrativo.
- [ ] CriaÃ§Ã£o de projeto.
- [ ] ExclusÃ£o de projeto.
- [ ] Download sensÃ­vel.
- [ ] Upload.
- [ ] ExclusÃ£o de arquivo.
- [ ] AlteraÃ§Ã£o financeira.
- [ ] AprovaÃ§Ã£o.
- [ ] âŒ PRÃ‰ â€” Aceite pÃºblico nÃ£o registra evento de auditoria de visualizaÃ§Ã£o/resposta (`SEC-012`).
- [x] ðŸ› ï¸ PÃ“S (parcial) â€” A resposta pÃºblica registra situaÃ§Ã£o, nome declarado, presenÃ§a de observaÃ§Ã£o e IP. A auditoria de visualizaÃ§Ã£o segue pendente (`SEC-012`).
- [ ] MudanÃ§a de proprietÃ¡rio.
- [ ] AlteraÃ§Ã£o de tenant.
- [ ] Tentativas de acesso negadas.

Cada registro deve conter, quando aplicÃ¡vel:

- [x] âœ… PRÃ‰ â€” `defineAction` registra usuÃ¡rio, aÃ§Ã£o/mÃ³dulo, entidade/ID, timestamp, IP e resultado para as aÃ§Ãµes que o utilizam.
- [x] âž– N/A â€” `tenant` nÃ£o existe como modelo da aplicaÃ§Ã£o; o equivalente deve ser projeto/cliente/canal quando aplicÃ¡vel.
- [ ] â³ â€” Cobertura uniforme de user-agent, correlation/request ID e de todas as rotas manuais exige revisÃ£o operacional adicional.

---

## 41. Alertas de seguranÃ§a

**Severidade:** ðŸŸ  Alta

- [ ] Muitas falhas de login.
- [ ] Login geograficamente improvÃ¡vel.
- [ ] MudanÃ§a de senha + email em sequÃªncia.
- [ ] ElevaÃ§Ã£o de privilÃ©gio.
- [ ] Grande volume de downloads.
- [ ] Grande volume de exclusÃµes.
- [ ] Muitas respostas `403`.
- [ ] Muitas respostas `401`.
- [ ] Muitas respostas `429`.
- [ ] Chamadas anormais a endpoints administrativos.
- [ ] AlteraÃ§Ã£o de credencial.
- [ ] Upload de arquivo bloqueado.
- [ ] Tentativa de path traversal.
- [ ] Tentativa de command injection.
- [ ] Tentativa de SSRF.

---

# TESTES POR PERFIL

Criar contas de teste:

- [ ] UsuÃ¡rio sem projeto.
- [ ] UsuÃ¡rio comum.
- [ ] Projetista.
- [ ] Coordenador.
- [ ] Financeiro.
- [ ] Comercial.
- [ ] Administrador da empresa.
- [ ] Administrador global, se existir.
- [ ] UsuÃ¡rio da Empresa A.
- [ ] UsuÃ¡rio da Empresa B.
- [ ] UsuÃ¡rio desativado.
- [ ] UsuÃ¡rio removido de projeto.

Executar para cada perfil:

- [ ] Listagem.
- [ ] Consulta por ID.
- [ ] CriaÃ§Ã£o.
- [ ] AlteraÃ§Ã£o.
- [ ] ExclusÃ£o.
- [ ] Download.
- [ ] Upload.
- [ ] ExportaÃ§Ã£o.
- [ ] AprovaÃ§Ã£o.
- [ ] FunÃ§Ã£o administrativa.
- [ ] Acesso direto Ã  API.

---

# BUSCAS ÃšTEIS NO REPOSITÃ“RIO

## AutorizaÃ§Ã£o

Pesquisar por:

```text
isAdmin
role
permission
permissions
organizationId
tenantId
ownerId
userId
createdBy
updatedBy
params.id
searchParams
findUnique
findFirst
findMany
update
delete
deleteMany
```

---

## APIs e autenticaÃ§Ã£o

```text
/api/
route.ts
middleware.ts
server action
"use server"
getSession
getUser
auth()
Authorization
Bearer
cookies()
```

---

## ExecuÃ§Ã£o de comandos

```text
exec(
execSync(
spawn(
spawnSync(
shell: true
child_process
```

---

## Arquivos

```text
fs.readFile
fs.writeFile
fs.unlink
fs.rm
fs.rename
path.join
path.resolve
multer
formData
arrayBuffer
File(
Blob(
```

---

## HTML / XSS

```text
dangerouslySetInnerHTML
innerHTML
html:
sanitize
DOMPurify
marked
markdown
```

---

## Queries perigosas

```text
$queryRaw
$queryRawUnsafe
$executeRaw
$executeRawUnsafe
raw(
SELECT
INSERT
UPDATE
DELETE
```

---

## Secrets

```text
NEXT_PUBLIC_
SUPABASE_SERVICE_ROLE
SERVICE_ROLE
DATABASE_URL
PRIVATE_KEY
SECRET
TOKEN
PASSWORD
API_KEY
CLIENT_SECRET
```

---

# MATRIZ DE RESULTADO

Para cada vulnerabilidade identificada, registrar:

```markdown
## SEC-XXX â€” Nome da vulnerabilidade

**Severidade:** CrÃ­tica / Alta / MÃ©dia / Baixa
**Status:** Aberta / Em correÃ§Ã£o / Corrigida / Aceita
**MÃ³dulo:**
**Rota/arquivo:**
**Endpoint:**
**Tabela/bucket:**

### DescriÃ§Ã£o
...

### EvidÃªncia
...

### Impacto
...

### Como reproduzir
1. ...
2. ...
3. ...

### Causa raiz
...

### CorreÃ§Ã£o recomendada
...

### CorreÃ§Ã£o aplicada
...

### Teste pÃ³s-correÃ§Ã£o
...

### Commit/PR
...

### ResponsÃ¡vel
...

### Data
...
```

---

# CRITÃ‰RIO DE PRIORIZAÃ‡ÃƒO

## P0 â€” Corrigir antes de considerar o sistema seguro para produÃ§Ã£o

- [ ] Falha de autenticaÃ§Ã£o.
- [ ] Escalada de privilÃ©gio.
- [ ] âŒ PRÃ‰ â€” BFLA. `SEC-002`, `SEC-008`, `SEC-009` e `SEC-018`.
- [ ] âŒ PRÃ‰ â€” IDOR/BOLA. `SEC-001`, `SEC-003` a `SEC-009`.
- [ ] âŒ PRÃ‰ â€” Falha de isolamento no escopo equivalente a tenant (projeto/cliente/canal). `SEC-001`, `SEC-003`, `SEC-004`, `SEC-007`.
- [ ] RLS ausente/incorreta.
- [ ] Service role exposta.
- [ ] Secret exposto.
- [ ] Bucket privado acessÃ­vel publicamente.
- [x] âœ… PRÃ‰ â€” Command injection nÃ£o confirmado nos fluxos de runtime revisados.
- [x] âœ… PRÃ‰ â€” Path traversal nÃ£o confirmado; storage usa resolvedor central com confinamento.
- [ ] SSRF explorÃ¡vel.
- [ ] SQL injection.
- [ ] RecuperaÃ§Ã£o de conta vulnerÃ¡vel.
- [ ] Endpoint administrativo pÃºblico.

---

## P1 â€” Corrigir em seguida

- [ ] Mass assignment.
- [ ] âŒ PRÃ‰ â€” XSS por conteÃºdo ativo armazenado em upload. `SEC-010`.
- [ ] CSRF.
- [x] âœ… PRÃ‰ â€” CORS inseguro nÃ£o confirmado no cÃ³digo; nÃ£o hÃ¡ CORS permissivo/reflexÃ£o de origem.
- [ ] âŒ PRÃ‰ â€” Rate limiting geral ausente em capabilities e rotas caras. `SEC-014`.
- [ ] Brute force.
- [ ] Webhook inseguro.
- [ ] âŒ PRÃ‰ â€” Race condition em aceite e numeraÃ§Ã£o de documento. `SEC-012`, `SEC-017`.
- [ ] Falha de lÃ³gica de negÃ³cio.
- [ ] âŒ PRÃ‰ â€” ExposiÃ§Ã£o excessiva de dados por snapshot e resposta entre canais. `SEC-003`, `SEC-004`.
- [ ] Cache inseguro.
- [ ] âŒ PRÃ‰ â€” DependÃªncias vulnerÃ¡veis altas. `SEC-015`.
- [ ] âŒ PRÃ‰ â€” Backup inseguro quanto a criptografia/ACL/restore. `SEC-016`.
- [ ] Logs contendo secrets.

---

## P2 â€” Hardening

- [ ] âŒ PRÃ‰ â€” Security headers incompletos: CSP ausente e HSTS nÃ£o comprovado. `SEC-020`.
- [ ] â³ â€” Cookies exigem validaÃ§Ã£o dinÃ¢mica/produÃ§Ã£o.
- [x] âœ… PRÃ‰ â€” Clickjacking mitigado por `X-Frame-Options: DENY`.
- [ ] Open redirect.
- [ ] EnumeraÃ§Ã£o.
- [ ] Stack trace.
- [ ] âŒ PRÃ‰ â€” Version disclosure no healthcheck. `SEC-019`.
- [ ] Metadados.
- [ ] Dados sensÃ­veis em URL.
- [ ] Melhorias adicionais de auditoria e monitoramento.

---

# DEFINITION OF DONE â€” AUDITORIA DE SEGURANÃ‡A

A auditoria pode ser considerada concluÃ­da quando:

- [x] âœ… PRÃ‰ â€” Rotas foram inventariadas (120 Route Handlers; 93 mÃ³dulos de aÃ§Ãµes).
- [ ] Todas as rotas privadas possuem autenticaÃ§Ã£o server-side.
- [ ] Todas as rotas sensÃ­veis possuem autorizaÃ§Ã£o server-side.
- [ ] Todos os recursos por ID possuem verificaÃ§Ã£o de ownership/tenant.
- [ ] Todas as tabelas privadas possuem proteÃ§Ã£o adequada.
- [x] âž– N/A â€” Policies RLS nÃ£o existem nesta arquitetura sem Supabase/Firebase/acesso direto do cliente ao banco.
- [ ] Todos os buckets foram revisados.
- [x] âœ… PRÃ‰ â€” Nenhum secret vÃ¡lido foi identificado no frontend/configuraÃ§Ã£o pÃºblica na varredura estÃ¡tica.
- [ ] Nenhum secret vÃ¡lido permanece no histÃ³rico sem rotaÃ§Ã£o.
- [ ] Uploads possuem validaÃ§Ã£o adequada.
- [x] âœ… PRÃ‰ â€” Processamento de arquivos foi revisado contra command injection; nÃ£o hÃ¡ achado confirmado.
- [x] âœ… PRÃ‰ â€” SSRF foi revisado estaticamente; nÃ£o hÃ¡ URL externa controlada pelo usuÃ¡rio identificada.
- [ ] Inputs possuem schemas.
- [ ] Rate limiting existe em endpoints crÃ­ticos.
- [ ] Logs nÃ£o armazenam secrets.
- [ ] Audit log cobre operaÃ§Ãµes crÃ­ticas.
- [x] âœ… PRÃ‰ â€” DependÃªncias crÃ­ticas foram auditadas; as vulnerabilidades pendentes constam em `SEC-015`.
- [ ] Backups foram revisados.
- [ ] Ambiente de homologaÃ§Ã£o foi revisado.
- [ ] Testes cruzados entre tenants foram executados.
- [ ] Testes cruzados entre roles foram executados.
- [ ] Todas as vulnerabilidades P0 estÃ£o corrigidas.
- [ ] Todas as vulnerabilidades P1 possuem correÃ§Ã£o ou plano formal.
- [ ] Teste pÃ³s-correÃ§Ã£o foi realizado.
- [x] âœ… PRÃ‰ â€” EvidÃªncias da auditoria estÃ£o arquivadas no relatÃ³rio estÃ¡tico de 24/08/2026.

---

# REFERÃŠNCIAS RECOMENDADAS

Usar como referÃªncia durante a auditoria:

- OWASP Top 10
- OWASP API Security Top 10
- OWASP ASVS
- OWASP Cheat Sheet Series
- CWE Top 25
- NIST Secure Software Development Framework â€” SSDF

---

**Documento:** Checklist de Auditoria de SeguranÃ§a do SENAHub
**Uso:** auditoria defensiva e hardening do sistema
**RevisÃ£o:** 1.0
