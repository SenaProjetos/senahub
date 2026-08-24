# Auditoria de seguranÃ§a â€” SENAHub

**Data:** 24/08/2026
**Base analisada:** commit `c9e0b12`
**MÃ©todo:** revisÃ£o estÃ¡tica orientada por `docs/SECURITY/checklist_auditoria_seguranca_senahub.md`, inventÃ¡rio de superfÃ­cies e `npm audit --omit=dev --json`.
**Escopo tÃ©cnico:** 120 Route Handlers em `src/app/api/**` e 93 mÃ³dulos `src/modules/**/actions.ts`, com aprofundamento nos fluxos que recebem identificadores, tokens, arquivos, exportaÃ§Ãµes e dados de negÃ³cio.

> Este Ã© um relatÃ³rio de cÃ³digo, nÃ£o um pentest de produÃ§Ã£o. ConfiguraÃ§Ã£o de Cloudflare, TLS, banco, ACL/BitLocker, variÃ¡veis de ambiente, logs centralizados e comportamento em execuÃ§Ã£o precisam de validaÃ§Ã£o operacional. Nenhum valor de `.env` foi lido ou exposto durante a revisÃ£o.

## ConclusÃ£o

**Linha de base:** nÃ£o era recomendado promover para produÃ§Ã£o antes dos P0. Havia falhas confirmadas de autorizaÃ§Ã£o por objeto (BOLA/IDOR), incluindo alteraÃ§Ã£o de tarefas de terceiros, resposta a tickets alheios, vazamento entre canais de chat e acesso a snapshots de documentos com dados potencialmente restritos. HÃ¡ tambÃ©m uploads que confiam no MIME enviado pelo navegador e sÃ£o servidos `inline`.

**AtualizaÃ§Ã£o de 24/08/2026:** os nove P0 abaixo receberam correÃ§Ã£o de cÃ³digo. Os SEC-010/011 (uploads) e SEC-012 (aceite pÃºblico) receberam hardening parcial. A aplicaÃ§Ã£o **ainda nÃ£o estÃ¡ aprovada para promoÃ§Ã£o**: permanecem P1/P2 e validaÃ§Ãµes operacionais. O typecheck global, lint direcionado e build concluÃ­ram com sucesso apÃ³s a correÃ§Ã£o dos quatro erros inicialmente externos a esta leva.

| Prioridade | Achados | DecisÃ£o |
|---|---:|---|
| P0 â€” crÃ­tica | 9 | Corrigir e testar antes de liberar |
| P1 â€” alta | 9 | Planejar na prÃ³xima janela de seguranÃ§a |
| P2 â€” mÃ©dia | 2 | Endurecimento e verificaÃ§Ã£o de infraestrutura |

## CorreÃ§Ãµes P0 pÃ³s-auditoria â€” 24/08/2026

| Achado | Estado | CorreÃ§Ã£o aplicada | EvidÃªncia de verificaÃ§Ã£o |
|---|---|---|---|
| SEC-001 | ðŸ› ï¸ PÃ“S | Escopo de tarefa/projeto aplicado nas opÃ§Ãµes, busca, itens, comentÃ¡rios e anexo; criaÃ§Ã£o/ediÃ§Ã£o validam projeto, dependÃªncias e responsÃ¡veis internos. | `tarefas.test.ts` |
| SEC-002 | ðŸ› ï¸ PÃ“S | Resposta limitada ao autor ou a `HR_ADMIN_ROLES`. | `suporte/acesso.test.ts` |
| SEC-003 | ðŸ› ï¸ PÃ“S | Snapshot limitado ao gerador ou escopo global em lista, tela e PDF. | `documentos/queries.test.ts` |
| SEC-004 | ðŸ› ï¸ PÃ“S | Resposta de chat validada pelo par mensagem/canal. | revisÃ£o do handler + ESLint |
| SEC-005 | ðŸ› ï¸ PÃ“S | Imagem de aviso limitada a destinatÃ¡rio, autor ou gestor de avisos. | revisÃ£o da rota + ESLint |
| SEC-006 | ðŸ› ï¸ PÃ“S | Capa de grupo limitada a membro ou moderador do chat. | revisÃ£o da rota + ESLint |
| SEC-007 | ðŸ› ï¸ PÃ“S | Diff IFC filtra o upload-base por `escopoProjeto(user)`. | revisÃ£o da query + ESLint |
| SEC-008 | ðŸ› ï¸ PÃ“S | ConversÃ£o DWG exige a mesma autorizaÃ§Ã£o de leitura antes de enfileirar. | `arquivos/acesso.test.ts` + ESLint |
| SEC-009 | ðŸ› ï¸ PÃ“S | Capability de aceite reaproveita a muralha de projeto/disciplina de uploads. | `arquivos/acesso.test.ts` + ESLint |

ValidaÃ§Ã£o executada: `vitest` focado (**38 testes em 7 arquivos**), ESLint direcionado aos arquivos alterados, `npx tsc --noEmit` com heap de 8 GB e `npm run build` concluÃ­ram com sucesso.

## Hardening P1 pÃ³s-auditoria â€” 24/08/2026

| Achado | Estado | CorreÃ§Ã£o aplicada | Limite remanescente |
|---|---|---|---|
| SEC-010/011 | ðŸ› ï¸ PÃ“S (parcial) | PolÃ­tica compartilhada de assinaturas/allowlist e download forÃ§ado para os anexos cobertos; imagens do EstÃºdio sÃ£o reencodificadas. | Outros pontos de upload, allowlists por uso e anÃ¡lise/quarentena de Office/CAD/ZIP. |
| SEC-012 | ðŸ› ï¸ PÃ“S (parcial) | MigraÃ§Ã£o aditiva com validade/revogaÃ§Ã£o/evidÃªncias; validade de 30 dias, renovaÃ§Ã£o segura, revogaÃ§Ã£o interna, resposta condicional atÃ´mica, auditoria de resposta e `no-store`/`no-referrer`. | O token ainda Ã© armazenado em texto claro; nome Ã© declaraÃ§Ã£o, nÃ£o autenticaÃ§Ã£o do cliente; falta auditoria de visualizaÃ§Ã£o e rate limit especÃ­fico. |

## Achados P0 â€” bloquear a liberaÃ§Ã£o

### SEC-001 â€” Tarefas: escopo aplicado na leitura principal, mas ausente em mutaÃ§Ãµes, buscas e anexos

**Severidade:** P0 / crÃ­tica
**Checklist:** BOLA/IDOR, autorizaÃ§Ã£o no servidor, isolamento de dados, upload autenticado.

**EvidÃªncia**

- [queries.ts](../../src/modules/tarefas/queries.ts#L12) define corretamente `escopoTarefa`: para nÃ£o globais, sÃ³ criador ou responsÃ¡vel.
- [queries.ts](../../src/modules/tarefas/queries.ts#L107) `opcoesTarefa()` nÃ£o recebe o usuÃ¡rio e devolve todos os projetos em andamento, atÃ© 100 tarefas e todas as disciplinas (linhas 114â€“129).
- [actions.ts](../../src/modules/tarefas/actions.ts#L53) `criarTarefa` aceita `projetoId`, responsÃ¡veis e dependÃªncias sem verificar que o autor pode acessar esses objetos. [actions.ts](../../src/modules/tarefas/actions.ts#L211) altera qualquer `TarefaItem` por `id`; [actions.ts](../../src/modules/tarefas/actions.ts#L240) cria comentÃ¡rio em qualquer `tarefaId`, ambos sem `escopoTarefa`.
- [actions.ts](../../src/modules/busca/actions.ts#L74) busca global retorna tarefas por tÃ­tulo sem `escopoTarefa`.
- [route.ts](../../src/app/api/tarefas/anexo/[comentarioId]/route.ts#L6) sÃ³ exclui o papel `cliente`; nÃ£o relaciona o comentÃ¡rio/tarefa ao usuÃ¡rio antes de devolver o anexo.

**Impacto**

Um usuÃ¡rio interno com um ID conhecido â€” IDs tambÃ©m sÃ£o expostos pelas opÃ§Ãµes e pela busca global â€” pode marcar itens de outra tarefa como concluÃ­dos, comentar em uma tarefa fora de seu escopo e ler metadados/anexos de tarefas de terceiros. TambÃ©m pode vincular uma nova tarefa a projeto, responsÃ¡veis ou dependÃªncias que nÃ£o deveria manipular.

**CorreÃ§Ã£o**

Criar um helper Ãºnico, por exemplo `obterTarefaAutorizada(user, tarefaId)`, com `findFirst({ where: { id, ...escopoTarefa(user) } })`, e usÃ¡-lo em toda aÃ§Ã£o e rota que recebe `tarefaId`, `comentarioId` ou `TarefaItem.id`. Para item e comentÃ¡rio, fazer a consulta pelo relacionamento atÃ© `Tarefa` no mesmo filtro. Alterar `opcoesTarefa(viewer)` e `buscaGlobal` para aplicar o escopo; validar escopo de projeto, responsÃ¡veis e dependÃªncias antes de criar/editar. Cobrir com testes de duas contas internas nÃ£o globais.

### SEC-002 â€” Qualquer usuÃ¡rio autenticado responde a ticket de suporte de outro usuÃ¡rio

**Severidade:** P0 / crÃ­tica
**Checklist:** BFLA/BOLA, autorizaÃ§Ã£o no servidor.

**EvidÃªncia**

- [actions.ts](../../src/modules/suporte/actions.ts#L77) `responderTicket` exige apenas a sessÃ£o provida por `defineAction`.
- [actions.ts](../../src/modules/suporte/actions.ts#L80) busca o ticket por ID e cria a mensagem nas linhas 82â€“90 sem testar `t.autorId === user.id` nem papel gestor. A mudanÃ§a de status, em contraste, restringe gestores nas linhas 105â€“113.

**Impacto**

Qualquer conta autenticada que obtenha ou adivinhe um ID de ticket pode inserir mensagens, anexos e notificaÃ§Ãµes em um ticket alheio, comprometendo a integridade da central de suporte e a confianÃ§a no atendimento.

**CorreÃ§Ã£o**

Antes da criaÃ§Ã£o, permitir somente `t.autorId === user.id` ou papel administrativo explicitamente autorizado (hoje `HR_ADMIN_ROLES`, se essa for a polÃ­tica). Declarar tambÃ©m recurso/permissÃ£o no `defineAction` ou encapsular a regra num helper de acesso ao ticket. Testar autor, outro usuÃ¡rio, gestor e ticket inexistente.

### SEC-003 â€” HistÃ³rico de documentos gerados perde o escopo da fonte e expÃµe snapshots sensÃ­veis

**Severidade:** P0 / crÃ­tica
**Checklist:** controle de acesso por recurso/objeto, isolamento de dados, lÃ³gica de negÃ³cio.

**EvidÃªncia**

- [actions.ts](../../src/modules/documentos/actions.ts#L275) valida `podeVerFonte` no instante da geraÃ§Ã£o (linhas 287â€“293), mas persiste o `dadosSnapshot` completo nas linhas 338â€“350.
- [schema.prisma](../../prisma/schema.prisma#L4554) `DocumentoGerado` sÃ³ guarda modelo, fonte textual, parÃ¢metros, snapshot, autor e nÃºmero; nÃ£o hÃ¡ projeto, cliente, assunto do dado, regra de acesso ou relaÃ§Ã£o de visibilidade.
- [queries.ts](../../src/modules/documentos/queries.ts#L104) `obterDocumentoGerado(id)` devolve o snapshot integral apenas pelo ID. [page.tsx](../../src/app/(dashboard)/documentos/gerados/[id]/page.tsx#L25) e [route.ts](../../src/app/api/documentos/gerados/[id]/pdf/route.ts#L13) sÃ³ exigem `documentos:ver`.

**Impacto**

Uma pessoa autorizada a ver modelos de documentos, mas nÃ£o a fonte original (financeiro, RH, um projeto ou cliente especÃ­fico), pode abrir ou gerar PDF de um snapshot persistido por outra pessoa. O controle correto no momento de gerar deixa de valer no momento mais sensÃ­vel: a reabertura do histÃ³rico.

**CorreÃ§Ã£o**

Persistir um descritor de autorizaÃ§Ã£o imutÃ¡vel junto do documento: fonte, recurso/permissÃ£o necessÃ¡ria, projeto/cliente/funcionÃ¡rio sujeito e autor. Em toda leitura, download e PDF, revalidar tanto a permissÃ£o da fonte quanto o escopo do objeto. Como alternativa mais restritiva, limitar o histÃ³rico ao gerador e a gestores autorizados. NÃ£o tratar `documentos:ver` como substituto de acesso Ã  fonte. Adicionar testes para documento gerado com dados de RH/financeiro e usuÃ¡rio que sÃ³ possui `documentos:ver`.

### SEC-004 â€” Resposta de chat pode apontar para mensagem de outro canal

**Severidade:** P0 / crÃ­tica
**Checklist:** BOLA/IDOR, isolamento entre canais.

**EvidÃªncia**

- [actions.ts](../../src/modules/chat/actions.ts#L131) `enviarMensagem` confirma somente a participaÃ§Ã£o no `canalId` de destino (linha 134).
- A mesma aÃ§Ã£o persiste `respostaAId` recebido do cliente sem conferir o `canalId` da mensagem referenciada (linhas 136â€“155).
- [queries.ts](../../src/modules/chat/queries.ts#L240) inclui `respostaA.conteudo` e `respostaA.autor` ao listar mensagens (linhas 260â€“267).

**Impacto**

Um membro do canal A que saiba o ID de uma mensagem privada do canal B pode responder a ela no canal A. A listagem do canal A renderiza conteÃºdo e autor da mensagem de B, vazando informaÃ§Ã£o entre canais.

**CorreÃ§Ã£o**

Quando `respostaAId` estiver presente, buscar a mensagem de referÃªncia e exigir `mensagem.canalId === i.canalId` antes de criar a resposta. Preferir uma FK composta/validaÃ§Ã£o de domÃ­nio se o modelo permitir. Testar resposta vÃ¡lida no mesmo canal e rejeiÃ§Ã£o entre canais.

### SEC-005 â€” Imagem de aviso direcionado Ã© acessÃ­vel a qualquer sessÃ£o autenticada

**Severidade:** P0 / alta
**Checklist:** IDOR, isolamento de dados.

**EvidÃªncia**

- [route.ts](../../src/app/api/avisos/[id]/imagem/route.ts#L6) valida apenas que existe sessÃ£o.
- [route.ts](../../src/app/api/avisos/[id]/imagem/route.ts#L10) usa `findUnique({ id })` e nÃ£o consulta o destinatÃ¡rio, audiÃªncia ou papel do aviso.

**Impacto**

Uma pessoa autenticada que consiga o ID de um aviso consegue baixar a imagem associada, mesmo que o aviso tenha sido dirigido a outro usuÃ¡rio ou grupo.

**CorreÃ§Ã£o**

Buscar por `id` acrescido da condiÃ§Ã£o de audiÃªncia/destinatÃ¡rio para `session.user.id`; acrescentar exceÃ§Ã£o explÃ­cita e auditÃ¡vel apenas para autores/administradores. Retornar 404 para objeto fora de escopo, evitando confirmaÃ§Ã£o de existÃªncia.

### SEC-006 â€” Capa de grupo de chat nÃ£o verifica participaÃ§Ã£o no canal

**Severidade:** P0 / alta
**Checklist:** IDOR, isolamento de dados.

**EvidÃªncia**

- [route.ts](../../src/app/api/chat/grupo/[canalId]/capa/route.ts#L16) aceita qualquer sessÃ£o.
- [route.ts](../../src/app/api/chat/grupo/[canalId]/capa/route.ts#L20) busca o canal por ID e entrega a capa nas linhas 24â€“31 sem `CanalMembro` nem polÃ­tica de observador/global.

**Impacto**

Metadados visuais de grupos privados podem ser acessados por qualquer usuÃ¡rio autenticado com o ID do canal.

**CorreÃ§Ã£o**

Antes de ler o arquivo, exigir registro `CanalMembro` para o usuÃ¡rio ou uma permissÃ£o global formal. Reutilizar o helper de acesso jÃ¡ usado pelas rotas de mensagens, em vez de reimplementar uma regra divergente.

### SEC-007 â€” DiferenÃ§a de versÃµes IFC ignora o escopo do projeto

**Severidade:** P0 / alta
**Checklist:** IDOR, isolamento por projeto.

**EvidÃªncia**

- [actions.ts](../../src/modules/coordenacao/actions.ts#L597) sÃ³ verifica a permissÃ£o genÃ©rica `coordenacao:ver`.
- [queries.ts](../../src/modules/coordenacao/queries.ts#L296) busca o `Upload` por ID e lista todas as versÃµes equivalentes nas linhas 302â€“312, sem vincular o upload a um projeto visÃ­vel ao usuÃ¡rio.

**Impacto**

UsuÃ¡rio com a permissÃ£o funcional, mas sem acesso a outro projeto, obtÃ©m IDs, versÃµes e datas de modelos IFC desse projeto.

**CorreÃ§Ã£o**

Passar o usuÃ¡rio para a query e filtrar `Upload.disciplina.projeto` por `escopoProjeto(user)` antes da consulta de versÃµes. A aÃ§Ã£o deve negar explicitamente quando o upload-base nÃ£o estiver no escopo.

### SEC-008 â€” ConversÃ£o DWG pode ser solicitada para desenho fora do escopo

**Severidade:** P0 / alta
**Checklist:** BOLA/BFLA, disponibilidade de jobs.

**EvidÃªncia**

- [actions.ts](../../src/modules/dwg/actions.ts#L43) requer somente `arquivos:baixar`.
- O handler busca `DocumentoVersao`/`Upload` por `id` (linhas 58â€“72) e enfileira a conversÃ£o, mas nÃ£o chama o helper `resolverAcessoDesenho`, jÃ¡ usado corretamente por `buscarStatusConversaoDwg` nas linhas 21â€“26.

**Impacto**

UsuÃ¡rio com permissÃ£o genÃ©rica pode reprocessar documento de outro projeto, consumindo ODA/worker e alterando o estado de conversÃ£o de arquivo que nÃ£o pode acessar.

**CorreÃ§Ã£o**

Receber `user` no handler e executar `resolverAcessoDesenho(user, input.desenhoId)` antes de enfileirar. SÃ³ depois extrair o projeto e disparar o job. Registrar teste para desenho de projeto nÃ£o visÃ­vel.

### SEC-009 â€” GeraÃ§Ã£o de link de aceite nÃ£o valida acesso ao upload/projeto

**Severidade:** P0 / alta
**Checklist:** BOLA, tokens/capabilities.

**EvidÃªncia**

- [actions.ts](../../src/modules/uploads/actions.ts#L1094) protege por `uploads:validar`, uma permissÃ£o genÃ©rica.
- [actions.ts](../../src/modules/uploads/actions.ts#L1105) procura o upload por ID e emite/devolve token de 192 bits nas linhas 1112â€“1120, sem conferir projeto visÃ­vel, disciplina responsÃ¡vel ou outra regra de posse.

**Impacto**

Quem tenha a permissÃ£o funcional pode criar ou recuperar uma URL-capability para entrega validada de outro projeto. O token dÃ¡ acesso pÃºblico aos dados do aceite.

**CorreÃ§Ã£o**

Aplicar a mesma muralha de `projetoVisivel` + responsabilidade de disciplina usada nas demais aÃ§Ãµes de upload antes de consultar/criar o aceite. NÃ£o devolver token existente fora de escopo. Testar dois projetos e dois validadores com escopos distintos.

## Achados P1 â€” corrigir na prÃ³xima janela

### SEC-010 â€” Uploads confiando em MIME/extensÃ£o do cliente e servidos `inline` permitem conteÃºdo ativo armazenado

**Severidade:** P1 / alta
**Checklist:** validaÃ§Ã£o de upload, XSS armazenado, tipo real de arquivo.

**EvidÃªncia**

- [route.ts](../../src/app/api/suporte/anexo/route.ts#L19) aceita qualquer arquivo atÃ© 100 MB e grava `file.type` declarado pelo cliente (linha 28). [route.ts](../../src/app/api/suporte/anexo/[mensagemId]/route.ts#L21) devolve esse MIME e usa `inline` para qualquer `image/*` ou `video/*`.
- [route.ts](../../src/app/api/tarefas/anexo/route.ts#L14) tem somente limite de tamanho; [route.ts](../../src/app/api/tarefas/anexo/[comentarioId]/route.ts#L16) volta a confiar no MIME gravado e entrega imagens `inline`, sem checar escopo da tarefa.
- [route.ts](../../src/app/api/documentos/imagens/route.ts#L12) aceita SVG e autoriza por MIME **ou** extensÃ£o (linhas 48â€“62); [route.ts](../../src/app/api/documentos/imagens/[arquivo]/route.ts#L49) o serve `inline` como `image/svg+xml`.

**Impacto**

SVG/HTML poliglota ou bytes de outro formato podem ser declarados como imagem e abertos na mesma origem do ERP. `X-Content-Type-Options: nosniff` nÃ£o neutraliza SVG declarado corretamente como `image/svg+xml`. Isso cria uma via de XSS armazenado e, nos anexos de tarefa, combina com a falha de escopo do SEC-001.

**CorreÃ§Ã£o**

Bloquear SVG e HTML nos fluxos que nÃ£o precisam deles. Para imagens, detectar magic bytes e decodificar/reencodar no servidor (por exemplo com `sharp` para formatos raster), definindo MIME a partir do conteÃºdo processado. Para documentos gerais, usar allowlist por caso de uso, scanner/quarentena e `Content-Disposition: attachment`; hospedar conteÃºdo potencialmente ativo em domÃ­nio sem cookies, se a visualizaÃ§Ã£o for indispensÃ¡vel. Nunca persistir `file.type` como fonte de verdade.

**Status pÃ³s-auditoria (parcial, 24/08/2026):** o EstÃºdio passou a bloquear SVG novo e reencodar imagens para JPEG. Suporte e tarefas agora validam a polÃ­tica central de anexos e os seus downloads sÃ£o `attachment`/`nosniff`; o mesmo endurecimento de download foi aplicado ao chat. Esta correÃ§Ã£o fecha os vetores ativos dos fluxos citados, mas nÃ£o encerra SEC-010 atÃ© migrar os demais uploads e decidir/implementar polÃ­tica de visualizaÃ§Ã£o isolada.

### SEC-011 â€” Outros uploads aceitam bytes arbitrÃ¡rios sem validaÃ§Ã£o do conteÃºdo real

**Severidade:** P1 / alta
**Checklist:** allowlist por regra de negÃ³cio, magic bytes, limite/antimalware.

**EvidÃªncia**

- [route.ts](../../src/app/api/chat/anexo/route.ts#L10) usa somente uma allowlist de extensÃµes, incluindo `svg`, e aceita arquivos de atÃ© 500 MB (linhas 8â€“19 e 96â€“115); o modo em chunks tambÃ©m aceita MIME declarado pelo cliente (linha 68).
- [route.ts](../../src/app/api/t/proposta/[token]/documentos/route.ts#L32) Ã© pÃºblico, limita tamanho, mas grava qualquer extensÃ£o e MIME fornecido pelo navegador (linhas 39â€“59).
- A revisÃ£o encontrou o mesmo padrÃ£o `FormData`/MIME declarado em rotas de documentos, financeiro e normas. HÃ¡ limites de tamanho em vÃ¡rios fluxos, mas nÃ£o uma polÃ­tica central de tipo real, antimalware, quarentena ou reprovaÃ§Ã£o de conteÃºdo incompatÃ­vel.

**Impacto**

O armazenamento recebe conteÃºdo diferente do declarado, arquivos malformados e tipos que nÃ£o tÃªm motivo de negÃ³cio. Em links pÃºblicos e uploads grandes, isso aumenta risco de malware distribuÃ­do, exploraÃ§Ã£o do consumidor posterior e exaustÃ£o de armazenamento/CPU.

**CorreÃ§Ã£o**

Centralizar um serviÃ§o de upload com: allowlist por destino, inspeÃ§Ã£o de assinatura/magic bytes, tamanho real apÃ³s remontagem, nome aleatÃ³rio, hash, scanner assÃ­ncrono/quarentena e polÃ­tica explÃ­cita de download. Tratar CAD/Office/ZIP como formatos de maior risco e impor limites de quantidade, taxa e anÃ¡lise adequada ao formato. A rota pÃºblica de proposta deve ter tambÃ©m limite temporal/IP, nÃ£o somente mÃ¡ximo acumulado de 100 documentos.

**Status pÃ³s-auditoria (parcial, 24/08/2026):** `src/lib/upload-policy.ts` passou a validar allowlist, MIME canÃ´nico e assinaturas dos formatos com cabeÃ§alho estÃ¡vel. Chat (inclusive chunks) e proposta pÃºblica usam a polÃ­tica; proposta nÃ£o persiste mais `file.type`. O scanner/quarentena, a inspeÃ§Ã£o estrutural de Office/CAD/ZIP e a migraÃ§Ã£o dos demais fluxos ainda sÃ£o pendÃªncias P1.

### SEC-012 â€” Aceite pÃºblico Ã© capability sem expiraÃ§Ã£o/revogaÃ§Ã£o e tem condiÃ§Ã£o de corrida

**Severidade:** P1 / alta
**Checklist:** tokens pÃºblicos, corrida/atomicidade, trilha de auditoria.

**EvidÃªncia**

- [schema.prisma](../../prisma/schema.prisma#L5520) sÃ³ modela token, situaÃ§Ã£o, resposta e criador; nÃ£o hÃ¡ `expiraEm`, `revogadoEm`, destinatÃ¡rio/identidade ou registro da resposta.
- [route.ts](../../src/app/api/p/aceite/[token]/route.ts#L42) lÃª `situacao === "pendente"` e depois executa `update` incondicional nas linhas 53â€“56. Duas requisiÃ§Ãµes concorrentes podem ambas passar na leitura e a Ãºltima sobrescrever a primeira.
- A rota pÃºblica nÃ£o grava evento de auditoria nem limita tentativas. O token tem boa entropia (`randomBytes(24)`), mas permanece vÃ¡lido atÃ© ser usado e nÃ£o pode ser revogado.

**Impacto**

Um link vazado em histÃ³rico, encaminhamento ou referÃªncia pode ser usado sem prazo. Respostas simultÃ¢neas permitem resultado nÃ£o determinÃ­stico e ausÃªncia de evidÃªncia suficiente para disputa de aceite.

**CorreÃ§Ã£o**

Adicionar expiraÃ§Ã£o, revogaÃ§Ã£o, destinatÃ¡rio/contato e auditoria de emissÃ£o, visualizaÃ§Ã£o e resposta (incluindo IP/UA conforme polÃ­tica LGPD). Responder com atualizaÃ§Ã£o condicional/atÃ´mica, por exemplo `updateMany` com `id`, `situacao: "pendente"`, `revogadoEm: null` e `expiraEm >= now`; exigir exatamente uma linha alterada. Preferir token armazenado como hash e pÃ¡gina `no-store`/`Referrer-Policy: no-referrer` especÃ­fica para capability.

**Estado pÃ³s-correÃ§Ã£o (24/08/2026, parcial)**

- [schema.prisma](../../prisma/schema.prisma) e a migration [`20260824123000_endurecer_aceite_cliente`](../../prisma/migrations/20260824123000_endurecer_aceite_cliente/migration.sql) adicionam `expiraEm`, `revogadoEm`, IP, user-agent e nome declarado. O schema Ã© aditivo; links legados sem expiraÃ§Ã£o sÃ£o tratados como indisponÃ­veis.
- [aceite.ts](../../src/modules/uploads/aceite.ts) emite validade de 30 dias. [actions.ts](../../src/modules/uploads/actions.ts) reemite token para link expirado/revogado e permite a revogaÃ§Ã£o por usuÃ¡rio jÃ¡ autorizado no escopo do upload.
- A [rota pÃºblica](../../src/app/api/p/aceite/[token]/route.ts) usa atualizaÃ§Ã£o condicional `updateMany` com estado/expiraÃ§Ã£o/revogaÃ§Ã£o no prÃ³prio `UPDATE`, registra a resposta e envia `Cache-Control: private, no-store` e `Referrer-Policy: no-referrer`. A pÃ¡gina pÃºblica Ã© dinÃ¢mica e tambÃ©m aplica `no-referrer`.
- Permanece necessÃ¡rio decidir autenticaÃ§Ã£o do destinatÃ¡rio ou assinatura adequada ao efeito contratual, hashear token em repouso, auditar visualizaÃ§Ã£o e limitar tentativas por IP/token.

### SEC-013 â€” ExportaÃ§Ãµes CSV permitem injeÃ§Ã£o de fÃ³rmula e aceitam payload sem schema de execuÃ§Ã£o

**Severidade:** P1 / alta
**Checklist:** validaÃ§Ã£o de entrada, injeÃ§Ã£o em planilhas, integridade de relatÃ³rios.

**EvidÃªncia**

- [route.ts](../../src/app/api/financeiro/contas/export/route.ts#L31) sÃ³ escapa aspas, ponto e vÃ­rgula e quebra de linha; nÃ£o neutraliza valores iniciados por `=`, `+`, `-` ou `@`. A rota faz cast direto de `req.json()` nas linhas 50â€“53.
- [route.ts](../../src/app/api/financeiro/relatorios/rentabilidade/export/route.ts#L33) repete o mesmo padrÃ£o nas linhas 52â€“55.

**Impacto**

Um valor que chegue Ã  exportaÃ§Ã£o â€” ou uma chamada direta Ã  rota com `linhas` controladas pelo cliente â€” pode virar fÃ³rmula ao abrir o CSV no Excel/LibreOffice, com risco de exfiltraÃ§Ã£o, links maliciosos ou manipulaÃ§Ã£o da planilha do operador.

**CorreÃ§Ã£o**

NÃ£o aceitar as linhas de relatÃ³rio do cliente: receber somente filtros validados com Zod e recalcular os dados no servidor. Para CSV, prefixar valores textuais perigosos com apÃ³strofo antes do escape. Definir schemas com limites de quantidade/tamanho mesmo para payloads internos e testar `=1+1`, `+...`, `-...` e `@...`.

### SEC-014 â€” NÃ£o hÃ¡ limitador geral para capabilities pÃºblicas e rotas caras

**Severidade:** P1 / alta
**Checklist:** rate limiting, DoS, abuso de upload/PDF.

**EvidÃªncia**

- [auth.ts](../../src/lib/auth.ts#L49) limita tentativas de autenticaÃ§Ã£o (20/min e 10/5min para login), o que Ã© positivo.
- NÃ£o hÃ¡ rate limiter compartilhado nas rotas pÃºblicas de aceite e envio de documentos; a Ãºnica barreira de proposta Ã© contagem total de arquivos em [route.ts](../../src/app/api/t/proposta/[token]/documentos/route.ts#L21).
- PDFs de documentos iniciam Chrome/Puppeteer por requisiÃ§Ã£o em [route.ts](../../src/app/api/documentos/gerados/[id]/pdf/route.ts#L54), e uploads de chat chegam a 500 MB em [route.ts](../../src/app/api/chat/anexo/route.ts#L8), sem limite de frequÃªncia/concurrency da aplicaÃ§Ã£o.

**Impacto**

Mesmo usuÃ¡rios autenticados, links pÃºblicos ou automaÃ§Ã£o podem esgotar conexÃµes, memÃ³ria, disco e processos Chrome/worker antes que os limites de tamanho individuais sejam atingidos.

**CorreÃ§Ã£o**

Introduzir rate limiter persistente/compartilhado por IP + usuÃ¡rio + token conforme a rota, retornar `429` e registrar bloqueios. Criar limite de concorrÃªncia e fila para Puppeteer, conversÃµes e remontagem de chunks; aplicar quotas de armazenamento por usuÃ¡rio/projeto/link. Confirmar e documentar limites equivalentes no Cloudflare/WAF, sem depender somente deles.

### SEC-015 â€” DependÃªncias de produÃ§Ã£o com vulnerabilidades conhecidas

**Severidade:** P1 / alta
**Checklist:** supply chain, componentes atualizados.

**EvidÃªncia**

`npm audit --omit=dev --json` reportou **24 vulnerabilidades de produÃ§Ã£o**: 17 altas, 6 moderadas e 1 baixa. Pacotes diretos afetados:

| Pacote instalado | Severidade | SituaÃ§Ã£o apontada pelo audit |
|---|---|---|
| `better-auth@1.6.16` | alta | intervalo vulnerÃ¡vel atÃ© `1.6.21` |
| `next@15.5.19` | alta | atualizaÃ§Ã£o corretiva disponÃ­vel na linha 15.5 |
| `pdfjs-dist@6.1.200` | alta | vulnerÃ¡vel abaixo de `6.2.108` |
| `prisma@7.8.0` | alta | versÃ£o em intervalo vulnerÃ¡vel |
| `puppeteer-core@24.43.1` | alta | cadeia vulnerÃ¡vel via `extract-zip` |
| `sharp@0.34.5` | alta | vulnerÃ¡vel abaixo de `0.35.0` |
| `exceljs@4.4.0` | moderada | dependÃªncia `uuid` vulnerÃ¡vel |

TambÃ©m foi resolvido `socket.io-parser@4.2.6`, versÃ£o que o audit classifica como alta.

**Impacto**

As dependÃªncias afetam autenticaÃ§Ã£o, Route Handlers/Server Actions, visualizaÃ§Ã£o de PDFs fornecidos por usuÃ¡rios, processamento de imagem, planilhas e realtime. A aplicaÃ§Ã£o expÃµe justamente vÃ¡rias dessas superfÃ­cies.

**CorreÃ§Ã£o**

Abrir atualizaÃ§Ã£o dedicada: atualizar as versÃµes corrigidas indicadas pelo audit, revisar notas de breaking change, regenerar lockfile e executar `npm run lint`, `npm test`, build e smoke tests. Prioridade imediata para `better-auth`, `next`, `pdfjs-dist`, `sharp` e `socket.io-parser`; nÃ£o usar `npm audit fix --force` sem revisar o diff. Adicionar audit/SCA bloqueante ou com SLA no pipeline.

### SEC-016 â€” Backups de banco e storage nÃ£o possuem criptografia ou validaÃ§Ã£o de ACL no cÃ³digo

**Severidade:** P1 / alta operacional
**Checklist:** backup, retenÃ§Ã£o, proteÃ§Ã£o de armazenamento.

**EvidÃªncia**

- [backup.ts](../../src/lib/backup.ts#L43) grava `pg_dump -Fc` em `BACKUP_PATH`/`./backups` e apenas remove arquivos apÃ³s 30 dias; nÃ£o criptografa o dump (linhas 48â€“76).
- [backup-storage.ts](../../src/lib/backup-storage.ts#L92) copia o storage por `robocopy` para destino configurado (linhas 105â€“133), sem verificaÃ§Ã£o de ACL, criptografia, imutabilidade ou teste de restauraÃ§Ã£o.

**Impacto**

Quem conseguir ler a pasta de backup lÃª banco e documentos. A retenÃ§Ã£o existe, mas nÃ£o demonstra confidencialidade, cÃ³pia externa segura ou recuperabilidade.

**CorreÃ§Ã£o**

Definir destino fora do volume de produÃ§Ã£o, ACL de conta de serviÃ§o dedicada e criptografia em repouso verificÃ¡vel (BitLocker/servidor de backup com evidÃªncia, ou envelope encryption dos artefatos). Registrar checksum, Ãªxito/falha e realizar restore testado periodicamente em ambiente isolado. Documentar RPO/RTO e retenÃ§Ã£o aprovada.

### SEC-017 â€” NumeraÃ§Ã£o de documento gerado Ã© vulnerÃ¡vel a corrida

**Severidade:** P1 / alta de integridade
**Checklist:** concorrÃªncia, sequÃªncia financeira/documental.

**EvidÃªncia**

- [actions.ts](../../src/modules/documentos/actions.ts#L323) lÃª o maior nÃºmero da sÃ©rie, soma um em memÃ³ria e cria o registro depois (linhas 325â€“350).
- [schema.prisma](../../prisma/schema.prisma#L4554) nÃ£o declara unicidade para `serie + numero`.

**Impacto**

Duas geraÃ§Ãµes simultÃ¢neas podem receber o mesmo nÃºmero. Para relatÃ³rios, contratos, recibos e holerites, a duplicidade pode afetar rastreabilidade e validade operacional.

**CorreÃ§Ã£o**

Usar sequÃªncia/counter transacional por sÃ©rie, `SELECT ... FOR UPDATE`/advisory lock ou tabela de contadores; adicionar `@@unique([serie, numero])` e retry controlado para colisÃ£o. NÃ£o calcular sequÃªncias por `findFirst` fora de transaÃ§Ã£o.

### SEC-018 â€” Server Action de templates comerciais nÃ£o autentica nem autoriza

**Severidade:** P1 / mÃ©dia
**Checklist:** BFLA, aÃ§Ãµes expostas ao cliente.

**EvidÃªncia**

- [actions.ts](../../src/modules/comercial/actions.ts#L981) `obterTemplatosNotas` tem diretiva `"use server"` e retorna configuraÃ§Ã£o sem `requireUser`, `can` ou `defineAction` (linhas 985â€“988).
- A aÃ§Ã£o adjacente documenta e aplica corretamente sessÃ£o e `comercial:gerir` nas linhas 990â€“1005, evidenciando a inconsistÃªncia.

**Impacto**

Os templates podem ser invocados fora da interface prevista por qualquer chamador que conheÃ§a a action. Mesmo que o conteÃºdo atual seja pouco sensÃ­vel, a fronteira de seguranÃ§a fica aberta e pode se tornar crÃ­tica quando os templates ganharem dados internos.

**CorreÃ§Ã£o**

Exigir `requireUser()` e a permissÃ£o mÃ­nima de leitura/gestÃ£o de comercial, ou migrar para `defineAction` com schema vazio e `audit: false` se leitura nÃ£o precisar produzir audit log. Criar teste de chamada sem sessÃ£o e sem permissÃ£o.

## Achados P2 â€” endurecimento e validaÃ§Ã£o operacional

### SEC-019 â€” Health check pÃºblico expÃµe topologia e versÃ£o

**Severidade:** P2 / mÃ©dia
**Checklist:** enumeraÃ§Ã£o, informaÃ§Ãµes de debug/versÃ£o.

**EvidÃªncia**

- [middleware.ts](../../src/middleware.ts#L4) declara `/api/health` pÃºblico.
- [route.ts](../../src/app/api/health/route.ts#L31) retorna commit, versÃ£o, estado do banco, storage, Chrome, SMTP, latÃªncia e timestamp.

**Impacto**

Facilita reconhecimento de versÃ£o e da infraestrutura a um atacante externo; tambÃ©m revela indisponibilidades e componentes instalados.

**CorreÃ§Ã£o**

Manter endpoint pÃºblico mÃ­nimo (`{ status }`) para liveness e mover diagnÃ³sticos detalhados para rede privada, monitor autenticado ou token de monitoramento. Evitar expor commit e configuraÃ§Ã£o de dependÃªncias publicamente.

### SEC-020 â€” CSP e HSTS nÃ£o estÃ£o configurados no cÃ³digo da aplicaÃ§Ã£o

**Severidade:** P2 / mÃ©dia
**Checklist:** headers, HTTPS e defesa em profundidade contra XSS.

**EvidÃªncia**

- [next.config.ts](../../next.config.ts#L16) configura `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` e `Permissions-Policy`, controles positivos.
- NÃ£o hÃ¡ `Content-Security-Policy` nem `Strict-Transport-Security` em `next.config.ts`, `src` ou `server.ts` na revisÃ£o estÃ¡tica.

**Impacto**

As falhas de upload/XSS tÃªm menos contenÃ§Ã£o no navegador. HSTS pode existir no Cloudflare/proxy, mas isso nÃ£o Ã© demonstrÃ¡vel pelo repositÃ³rio.

**CorreÃ§Ã£o**

Adicionar CSP inicialmente em `Report-Only`, ajustando fontes de Next, imagens, workers e PDF; depois aplicar polÃ­tica restritiva com nonces quando necessÃ¡rio. Confirmar HSTS no edge com `max-age` adequado, `includeSubDomains` e `preload` somente apÃ³s validaÃ§Ã£o dos subdomÃ­nios. Validar headers reais em produÃ§Ã£o.

## Cobertura do checklist: controles observados e pendÃªncias

| Tema do checklist | Resultado da revisÃ£o estÃ¡tica | ObservaÃ§Ã£o |
|---|---|---|
| Supabase/Firebase e RLS | NÃ£o aplicÃ¡vel no repositÃ³rio | NÃ£o hÃ¡ SDK, tabela ou DDL de Supabase/Firebase/RLS. O app usa Prisma/PostgreSQL no servidor; a proteÃ§Ã£o equivalente Ã© escopo em queries, que falha nos SEC-001 a SEC-009. Confirmar que o banco nÃ£o Ã© exposto diretamente Ã  internet. |
| AutenticaÃ§Ã£o e sessÃ£o | Parcialmente positivo | Better Auth usa sessÃ£o de 7 dias, signup desabilitado, limite de login e `trustedOrigins` em produÃ§Ã£o ([auth.ts](../../src/lib/auth.ts#L7)). Fluxos de recuperaÃ§Ã£o, invalidaÃ§Ã£o global e cookies reais precisam de teste dinÃ¢mico. |
| Middleware/API | Risco estrutural controlado parcialmente | A API inteira Ã© excluÃ­da do middleware ([middleware.ts](../../src/middleware.ts#L37)); cada handler precisa se autenticar e autorizar. Isso explica a importÃ¢ncia dos achados de rota. |
| Server Actions | Base positiva, uso inconsistente | `defineAction` faz sessÃ£o, ativo, senha pendente, RBAC, Zod e auditoria ([with-action.ts](../../src/lib/with-action.ts#L46)). A proteÃ§Ã£o nÃ£o resolve ownership e nÃ£o cobre aÃ§Ãµes/rotas que o contornam. |
| Segredos e bundle | Sem achado estÃ¡tico confirmado | Arquivos rastreados contÃªm apenas `.env.example` e `.env.production.example`; `NEXT_PUBLIC_*` observados sÃ£o versÃ£o/SHA e chave pÃºblica VAPID. NÃ£o foram encontrados padrÃµes de chaves privadas, Supabase ou Firebase no cÃ³digo rastreado. RotaÃ§Ã£o, histÃ³rico remoto e secrets do CI exigem ferramenta prÃ³pria. |
| SQL injection | Sem achado confirmado no runtime revisado | O Ãºnico `queryRawUnsafe` de runtime, [documentos-agrupados.ts](../../src/modules/uploads/documentos-agrupados.ts#L177), usa parÃ¢metros para valores e whitelist para ordenaÃ§Ã£o ([linhas 25â€“45](../../src/modules/uploads/documentos-agrupados.ts#L25)). Scripts operacionais ainda usam raw SQL e devem ser executados apenas por operadores confiÃ¡veis. |
| Path traversal / comando / ZIP slip | Sem achado confirmado nesta revisÃ£o | Os fluxos de storage usam resolvedor central e launches observados usam argumentos separados, nÃ£o `shell: true`. Recomenda-se teste dinÃ¢mico com `..`, separadores Windows e arquivos/ZIP malformados. |
| SSRF | Sem SSRF de aplicaÃ§Ã£o confirmado | A consulta CEP usa URL fixa/CEP normalizado. A versÃ£o instalada do Next possui alertas de seguranÃ§a, tratados no SEC-015. |
| CSRF/CORS | Parcial / requer teste | Better Auth restringe origens em produÃ§Ã£o. NÃ£o hÃ¡ CORS permissivo no cÃ³digo. Route Handlers mutantes e tokens pÃºblicos precisam ser testados com navegador/cookies e origem externa; a revisÃ£o estÃ¡tica nÃ£o substitui esse teste. |
| MFA, webhooks e cache cross-user | NÃ£o identificado / requer decisÃ£o e teste | NÃ£o foram encontradas referÃªncias a TOTP/MFA ou webhooks. MFA para admin/supervisor deve ser uma decisÃ£o explÃ­cita de risco. NÃ£o houve evidÃªncia estÃ¡tica de cache compartilhado de dados privados, mas requer teste de headers e proxy. |
| Logs e auditoria | Parcial | `defineAction` audita mutaÃ§Ãµes por padrÃ£o; algumas rotas manuais fazem auditoria. A resposta pÃºblica de aceite agora registra evento, mas a visualizaÃ§Ã£o e a cobertura dos demais Route Handlers nÃ£o sÃ£o uniformes. |
| Backup/restore | Parcial | Existe backup e retenÃ§Ã£o, mas SEC-016 cobre criptografia/ACL/restore. |

## Plano de correÃ§Ã£o sugerido

1. **P0 de autorizaÃ§Ã£o:** implementar helpers de escopo por domÃ­nio e aplicÃ¡-los a tarefas, suporte, chat, avisos, coordenaÃ§Ã£o, DWG, uploads e documentos gerados. Criar testes negativos de usuÃ¡rio A contra objeto do usuÃ¡rio/projeto/canal B.
2. **P0 de conteÃºdo ativo:** desativar imediatamente SVG e entrega `inline` de anexos nÃ£o reprocessados; corrigir o download de tarefa junto com o SEC-001.
3. **P1 de tokens e concorrÃªncia:** adicionar ciclo de vida e update condicional ao aceite; tornar a numeraÃ§Ã£o transacional.
4. **P1 de disponibilidade e dependÃªncias:** atualizar a cadeia de produÃ§Ã£o, implementar rate limit/quotas e verificar o resultado em build, testes e smoke.
5. **P1/P2 operacional:** criptografar/validar backup, separar health pÃºblico, aplicar CSP/HSTS e executar o pentest dinÃ¢mico do checklist (sessÃµes, recuperaÃ§Ã£o, CSRF, CORS, IDOR e uploads).

## EvidÃªncias mÃ­nimas de aceite para encerrar os P0

- Teste automatizado para cada endpoint/action acima com dois usuÃ¡rios nÃ£o globais e dois projetos/canais/tickets distintos, esperando `403` ou `404` e sem efeito no banco.
- Teste de tentativa de SVG, HTML renomeado e MIME falsificado; confirmar rejeiÃ§Ã£o ou reencodificaÃ§Ã£o e `Content-Disposition: attachment` quando aplicÃ¡vel.
- Teste concorrente de duas respostas de aceite e de duas geraÃ§Ãµes de documento; uma Ãºnica atualizaÃ§Ã£o/nÃºmero deve prevalecer.
- ReexecuÃ§Ã£o de `npm audit --omit=dev`, `npm run lint`, `npm test`, build e smokes relevantes apÃ³s as atualizaÃ§Ãµes.
