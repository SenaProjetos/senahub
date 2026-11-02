# Lote 3 — E-mail de acompanhamento do projeto — Plano

> Escrito sem a rodada de perguntas (o dono pediu para pular). As decisões abaixo são **minhas** e o dono as confere na entrega.
> **For agentic workers:** execute inline com superpowers:executing-plans; TDD nas regras puras.

**Goal:** botão manual, por projeto, que monta e envia ao cliente um e-mail padrão com o que foi enviado a ele, mantendo a conversa encadeada na caixa do cliente e com cópia para quem enviou.

**Architecture:** regras puras (destinatários, itens novos × já enviados, lista em Markdown, cabeçalhos de encadeamento) em `modules/projetos/acompanhamento/`; um serviço que renderiza o modelo de e-mail `acompanhamento-projeto` e envia por `enviarEmail` (que ganha `messageId`, `inReplyTo`, `references`, `bcc`, `replyTo`); uma tabela `EmailAcompanhamento` guarda cada envio (é o que sustenta o "desde o último e-mail" e o encadeamento); um diálogo no ⋯ de Arquivos.

**Spec:** roadmap `docs/superpowers/specs/2026-10-26-reuniao-hub-roadmap.md` (Lote 3). Sem spec própria.

## Decisões minhas (para o dono conferir)

- **O que entra na lista:** as revisões do projeto com o controle **"Enviado ao cliente"** ativo (`ControleRevisao.tipo = enviado_cliente`, `removidoEm` nulo). "Novos" = marcadas depois do último e-mail enviado; "já enviados" vêm desmarcados. A pessoa escolhe o que vai.
- **Destinatários:** contatos do cliente do projeto com e-mail, sem `optOut` (regra única de `ContatoCliente`), mais um campo livre para outro e-mail. Pelo menos um.
- **Encadeamento:** assunto fixo `Acompanhamento — <código> <nome do projeto>` e cabeçalhos `Message-ID` próprio, `In-Reply-To` = último envio do projeto e `References` = todos os anteriores. Sem integração com o Google.
- **Cópia:** o e-mail de quem envia vai em **Cco** (opção ligada por padrão) e em **Reply-To**, para a resposta do cliente cair numa pessoa e o envio aparecer na caixa dela.
- **Permissão:** `projetos:gerir` (a mesma do link público), só interno. Sem permissão nova (não exige migração de permissões).
- **Corpo:** modelo editável em Configurações → E-mails (`acompanhamento-projeto`); a pessoa pode acrescentar uma observação. Nenhum anexo e nenhum link de arquivo (o cliente segue pelo link público/portal já existentes).
- **Fora do escopo:** envio automático, agendamento, anexos, caixa do escritório fixa (Cco só de quem envia).

## Global Constraints

- UI e commits em pt-BR; `defineAction` em toda mutação; `await confirm()` antes de `startTransition`; campos de e-mail com `campo.email()`/`InputFormatado tipo="email"`.
- `enviarEmail` continua devolvendo `boolean` e sem mudar o comportamento dos chamadores atuais.
- Funções puras sem Prisma/`server-only`.
- Migração escrita à mão (`prisma migrate dev` exige reset neste banco): pasta `prisma/migrations/20261102120000_email_acompanhamento/migration.sql`, aplicada com `npx prisma migrate deploy` e `npm run db:generate`. Servidor de dev parado durante isso.
- Commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; stage de arquivos específicos.

## Review Focus

1. Contato com `optOut` ou sem e-mail nunca vira destinatário; e-mail repetido (caixa diferente) entra uma vez.
2. Primeiro envio: sem `In-Reply-To`/`References`. Do segundo em diante: `In-Reply-To` = o último, `References` = todos, em ordem.
3. SMTP falhou → nada é gravado em `EmailAcompanhamento` (o "último e-mail" não avança) e a pessoa vê o erro.
4. Duas pessoas enviando ao mesmo tempo: `messageId` único; nada quebra.
5. Revisão que perdeu o controle "Enviado ao cliente" depois de listada não vai no e-mail (o servidor revalida os `revisaoId` recebidos).

---

### Task 1: Regras puras + cabeçalhos no `enviarEmail`

**Files:** Create `src/modules/projetos/acompanhamento/regras.ts`, `regras.test.ts`; Modify `src/lib/mail.ts`.

**Interfaces (Produces, `regras.ts`):**
- `type ContatoEnvio = { email: string | null; optOut: boolean }`
- `destinatariosValidos(contatos: readonly ContatoEnvio[], extras: readonly string[]): string[]` — minúsculas, aparado, sem repetição, sem `optOut`, só e-mail com formato válido.
- `type ItemEnviado = { revisaoId: string; rotulo: string; enviadoEm: Date }`
- `separarItens(itens: readonly ItemEnviado[], ultimoEnvioEm: Date | null): { novos: ItemEnviado[]; anteriores: ItemEnviado[] }` — sem último envio, tudo é novo.
- `listaEmMarkdown(itens: readonly { rotulo: string }[]): string` — uma linha `- rótulo` por item.
- `assuntoDoAcompanhamento(codigo: string, nome: string): string` — `Acompanhamento — <código> <nome>`.
- `novoMessageId(projetoId: string, sufixo: string, dominio: string): string` — `<acomp.<projetoId>.<sufixo>@<dominio>>`.
- `cabecalhosDeConversa(anteriores: readonly string[]): { inReplyTo?: string; references?: string }` — `anteriores` do mais antigo ao mais novo; vazio → `{}`.
- Produces (`mail.ts`): `enviarEmail` aceita `bcc?: string`, `replyTo?: string`, `messageId?: string`, `inReplyTo?: string`, `references?: string`.

- [ ] Testes que falham (`destinatariosValidos`: optOut, vazio, duplicado com caixa diferente, formato inválido; `separarItens` com e sem último envio; `cabecalhosDeConversa` com 0, 1 e 3 anteriores; `assuntoDoAcompanhamento`; `novoMessageId`) → rodar `npx vitest run src/modules/projetos/acompanhamento/regras.test.ts` (FAIL) → implementar → PASS.
- [ ] `mail.ts`: repassar os campos novos ao `sendMail` (`bcc`, `replyTo`, `messageId`, `inReplyTo`, `references`). `npx tsc --noEmit` limpo.
- [ ] Commit `feat(acompanhamento): regras puras e cabeçalhos de conversa no e-mail`.

### Task 2: Banco, modelo de e-mail, serviço e ação

**Files:** Modify `prisma/schema.prisma`, `src/lib/email-templates-meta.ts`; Create `prisma/migrations/20261102120000_email_acompanhamento/migration.sql`, `src/modules/projetos/acompanhamento/{queries,service,actions,schemas}.ts`, `scripts/smoke-acompanhamento.ts`; Modify `package.json` (script `smoke:acompanhamento`).

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `model EmailAcompanhamento` (`@@map("email_acompanhamento")`): `id`, `projetoId` (FK cascade), `enviadoPorId String?` (FK User, SetNull), `enviadoEm`, `assunto`, `messageId @unique`, `destinatarios String[]`, `copiaPara String?`, `observacao String?`, `itens Json` (`[{ revisaoId, rotulo }]`); `@@index([projetoId, enviadoEm])`.
  - Modelo de e-mail `acompanhamento-projeto` (grupo "Projetos"): variáveis `nomeCliente`, `projeto`, `lista`, `observacao`; assunto padrão `Acompanhamento — {{projeto}}` (o assunto real do envio vem de `assuntoDoAcompanhamento`, o do modelo só vale em prévia).
  - `dadosDoAcompanhamento(projetoId: string): Promise<{ smtp: boolean; cliente: string | null; contatos: { id: string; nome: string; email: string }[]; itens: ItemEnviado[]; ultimoEnvioEm: Date | null; historico: { id: string; enviadoEm: Date; enviadoPor: string | null; destinatarios: string[]; itens: number }[] }>` (itens com rótulo `R02 · <título ou nome do arquivo> (<disciplina>)`; contatos sem `optOut` e com e-mail).
  - `enviarAcompanhamento(args: { projetoId; usuario: { id: string; email: string; name: string }; destinatarios: string[]; revisaoIds: string[]; observacao?: string; copiaParaMim: boolean }): Promise<{ id: string; destinatarios: string[]; itens: number }>` — revalida `revisaoIds` contra os controles ativos, falha com `ActionError` pt-BR se não sobrar item, destinatário ou SMTP; monta cabeçalhos pelos envios anteriores (mais antigo → mais novo); só grava `EmailAcompanhamento` depois de `enviarEmail` devolver `true`.
  - `enviarAcompanhamentoProjeto` (`defineAction`: `modulo "projetos"`, `recurso "projetos"`, `permissao "gerir"`, `interno: true`, `entidade "EmailAcompanhamento"`; schema Zod com `projetoId`, `destinatarios` (e-mails via `campo.email`), `revisaoIds` (1–200), `observacao` opcional ≤ 1000, `copiaParaMim`).

- [ ] Smoke primeiro (`scripts/smoke-acompanhamento.ts`, banco de dev, projeto/cliente/contatos descartáveis, SMTP trocado por um envio falso injetável no serviço): contato com `optOut` fora; só revisão com controle ativo entra; envio 1 sem `inReplyTo`; envio 2 com `inReplyTo` = 1 e `references` = [1]; falha de envio não grava; revisão sem controle é recusada. Rodar (FAIL) → implementar → PASS.
- [ ] Migração + `npx prisma migrate deploy` + `npm run db:generate`; seed do modelo é create-only por slug (entrada no catálogo basta).
- [ ] `tsc`, lint, `npx vitest run src/lib/email-templates.test.ts`. Commit `feat(acompanhamento): envio do e-mail de acompanhamento, modelo e registro`.

### Task 3: Diálogo no ⋯ de Arquivos

**Files:** Create `src/components/projetos/arquivos/acompanhamento-dialog.tsx`; Modify `menu-arquivos.tsx` (evento + item), `documentos-shell.tsx`, `tela-documentos-projeto.tsx`.

**Interfaces:** `AcompanhamentoButton({ projetoId, semBotao?: boolean, dados }: …)` abre por evento `EVENTO_ARQUIVOS.acompanhamento` (`useAbrirPorEvento`); `MenuArquivos` ganha a prop `acompanhamento: boolean` (visível só com `projetos:gerir`).

- [ ] Diálogo (`DialogBody`, `CollapsibleSection` para o histórico): destinatários (contatos marcados + campo "outro e-mail"), lista "Novos desde o último e-mail" (marcados) e "Já enviados antes" (desmarcados), observação, "Receber cópia" ligado, histórico dos envios, botão **Enviar** desabilitado sem destinatário/itens e aviso quando o SMTP não está configurado. `await confirm()` antes do `start` (mostra quantos destinatários e itens). Textos pt-BR; erro do servidor em toast.
- [ ] Carregar `dadosDoAcompanhamento` em `TelaDocumentosProjeto` só para quem gere o projeto.
- [ ] `tsc`, lint, `npm test`. Commit `feat(acompanhamento): diálogo de e-mail de acompanhamento no menu de Arquivos`.

### Task 4: Manual

- [ ] `docs/manual/projetos/` (página de Arquivos/Documentos, a que descreve o ⋯ e o link público): seção "E-mail de acompanhamento"; entrada em `novidades.md`; atualizar `search-index.json` da página tocada. Commit `docs(manual): e-mail de acompanhamento`.

### Task 5: Auditoria (nível 3)

- [ ] Reler `docs/PROTOCOLO_AUDITORIA_FINAL.md`; `npm run lint`, `npm test`, `tsc` do servidor, `npm run build` (servidor de dev parado), smoke `acompanhamento`; revisores `action-guardian`, `prisma-migration-reviewer`, `ui-state-linter`, `a11y-auditor`; em tela (porta 3001): diálogo com contatos, itens novos/anteriores, sem SMTP, 390×844; prints em `prints-auditoria/2026-11-02_HHMM_lote3-acompanhamento/` com `LEIAME.md`. SMTP de dev não envia de verdade: o envio real fica como "não verificado" com roteiro para o dono.
