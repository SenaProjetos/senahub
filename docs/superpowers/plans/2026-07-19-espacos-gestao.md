# Plano técnico — Espaços de gestão: aux de projeto (Espaço 1) + registros da empresa (Espaço 2)

**Data:** 2026-07-19 · **Status:** 📋 planejamento (nada implementado) · **Branch alvo:** `dev`

Origem: pedido do dono em duas sugestões —
1. "Criar uma pasta como repositório para ir colocando arquivos auxiliares para **gestão de projetos**
   (cronogramas, metas, observações, recursos, solicitações, atas etc.)."
2. "Colocar um espaço para registrar **limitações técnicas da empresa, limitações de equipe, feedbacks,
   metas de desenvolvimento, mapas de processos, pontos a serem implementados**."

Analisado por um **conselho de 5 conselheiros** (Gerente de Projetos, Arquiteto/Dev líder, Usuário interno,
Sócio-gestor/melhoria contínua, Product cético). Veredito unânime abaixo. **Nada será implementado antes de
fechar as 3 pendências de processo da §8.**

> **Achado que orienta tudo:** o sistema **já tem casa** para quase todo item do Espaço 1 (`Upload`/`arquivos_gerais`,
> `DiarioEntrada`, `Tarefa`, `Compromisso`, `/planejamento`, `/recursos`). O único **gap real de modelo** é o Espaço 2
> (registros de gestão da empresa) — e os 5 tipos dele têm **a mesma forma**, logo colapsam em **1 tabela com `tipo`**,
> não em 5 features. O maior risco (técnico E de adoção) é criar um **34º módulo redundante** com `arquivos`/`suporte`/
> `qualidade`/`tarefas` → **cemitério de dados**. Design abaixo evita isso reusando o que existe.

---

## 1. Decisões travadas (dono, 2026-07-19)

Escopo:
- **Espaço 1** ancoragem = **central + por projeto**; formato = **misto** (arquivo + registro estruturado); visibilidade = **só interno**.
- **Espaço 2** = **gestão da empresa** (processos, capacidade, melhoria contínua — **não** é backlog do produto SenaHub); visibilidade = **só interno**.

Perguntas de desenho:
- **D1 — solicitações/pontos de projeto = "captura + promove".** Entrada crua de 1 campo (sem atrito) que **depois** vira `Tarefa` por um botão "promover" quando alguém assume.
- **D2 — Espaço 2 acesso = só gestão** (`admin` + `supervisor` + sócio `ehSocio`). Conteúdo sensível (capacidade/limitações de pessoas) não vaza para `clt`/`estagiario`/`freelancer`/`cliente`.
- **D3 — "recursos" no Espaço 1 = os dois:** material de referência (arquivo na pasta Geral) **+** atalho para a matriz de alocação já existente (`/recursos`).
- **D4 — arquivos auxiliares moram DENTRO de `/arquivos`**, numa categoria **"Gestão/Geral"** (reusa storage/permissão/auditoria). "Um arquivo, um lar" — sem racha de acervo.

---

## 2. Objetivo

1. **Espaço 1 — Central de gestão do projeto:** uma superfície que **agrega** (não duplica) o contexto de gestão de um
   projeto hoje espalhado por 6 lugares, com **espelho global** (rollup, não silo). Praticamente **zero modelo novo**.
2. **Espaço 2 — Registros da empresa:** o backlog de melhoria contínua do escritório, hoje sem casa. **1 tabela nova**
   com ciclo de vida (não um bloco de notas), gateada à gestão.

**Fora de escopo (fases seguintes / não construir agora):**
- Anexo polimórfico genérico (`Anexo(entidadeTipo, entidadeId)`) — **rejeitado**: contra o padrão de storage por-entidade
  (`storage.ts` anti-traversal) e cascade por FK. Seguir o padrão inline `anexoPath/anexoNome/anexoMime` já usado em
  `TicketMensagem`/`SolicitacaoRevisao`.
- Terceiro canal de feedback — **rejeitado**: feedback interno fica em `/suporte` (`TicketSuporte`, categoria sugestão/melhoria, já tem SLA).
- Digitar capacidade de equipe à mão — **rejeitado**: lê-se de `matrizRecursos()`/`cargaSemanalPorRecurso()`.
- Mapa de processo como desenho estruturado no app — fica como **anexo + metadado**.
- Dashboards, OKR completo, ligação `/qualidade`→meta = Fase 3.

---

## 3. Espaço 1 — Central de gestão do projeto (≈zero schema)

Entrega = **aba "Central de gestão"** em `/projetos/[id]/...` que agrega o que já existe + espelho global (rollup).

| Item do pedido | Casa técnica (reuso) | Schema? |
|---|---|---|
| **arquivos** (atas soltas, cronograma externo recebido, material de "recursos") | `Upload` pacote **"Gestão/Geral"** sob recurso `arquivos_gerais` (já existe: `arquivos_gerais:ver/gerir`). Arrastar-e-soltar, 0 campo obrigatório | não |
| **cronograma estruturado** | `/planejamento` (EAP/CPM) permanece a fonte da verdade; a aba mostra **atalho + baseline**. **Nunca** cronograma-arquivo competindo com Planejamento | não |
| **recursos (D3, os dois)** | material de referência → pasta Geral; alocação de equipe → **atalho** para `/recursos` (`Recurso`/`Alocacao`) | não |
| **observações** | `DiarioEntrada` (diário do projeto) | **sim** (ver §5) |
| **atas formais** | nascem do `Compromisso` (agenda) → geração via Doc Studio (`DocumentoGerado`); cada encaminhamento vira `Tarefa`. Upload livre só p/ ata de terceiro | não (F2 p/ geração) |
| **solicitações / pontos (D1, captura+promove)** | **quick-capture de 1 campo** num board `Tarefa` dedicado (status "Captura/Ideia", responsável opcional) → botão **"promover"** = atribui responsável+prazo = Tarefa normal. `Tarefa.projetoId` já é nullable (serve global e por-projeto) | não (usa `Tarefa`) |
| **metas de projeto** | marcos = `ChecklistItemProjeto` + `Projeto.prazoFinal` + `LinhaBase`. **Não** é `MetaComercial` (vendas). Ver pendência §8.3 | depende |

**Conclusão:** nenhum módulo/tabela novos. É uma **view agregadora** + o quick-capture reusando `Tarefa`.

---

## 4. Espaço 2 — Registros da empresa (1 tabela nova)

Os 5 tipos têm a mesma forma → **uma tabela `RegistroEmpresa` com discriminador `tipo`** (resistir à tentação de 5 tabelas).

Esboço (só nomes — não é schema final):
```
RegistroEmpresa
  id
  tipo         enum: limitacao_tecnica | limitacao_equipe |
                     meta_desenvolvimento | mapa_processo | ponto_melhoria
  titulo, descricao
  status       enum: aberto | em_andamento | resolvido | arquivado
  prioridade?  (impacto/esforço p/ priorizar)
  autorId, responsavelId?          // dono do item
  proximaRevisao?  DateTime        // anti-cemitério (§6)
  anexoPath / anexoNome / anexoMime?   // padrão inline, NÃO polimórfico
  tarefaId?                        // link opcional: um ponto de melhoria vira Tarefa (F2)
  createdAt / updatedAt
```

Regras:
- **Acesso (D2):** recurso novo `registros_empresa` (`ver`/`gerir`), gate `admin` + `supervisor` + sócio (`ehSocio`). Segue `defineAction` → **auditoria de graça**.
- **Nav:** item novo no grupo **"Gestão"** do `nav-config.ts` (mesmo grupo de Planejamento/Recursos/Qualidade/Suporte).
- **Capacidade/limitação de equipe = painel SÓ-LEITURA:** embute `matrizRecursos()` + `cargaSemanalPorRecurso()` (dado real do ponto) + **nota interpretativa**. Botão "gerar ponto de melhoria" quando um gargalo persiste. **Nunca** digitar capacidade (2º número que diverge do real).
- **Feedback:** permanece em `/suporte`; botão "promover ticket recorrente → ponto de melhoria" fecha o loop.
- **Mapa de processo:** anexo (BPMN/PDF/imagem) + metadado (processo, dono, última revisão). Não estruturar o desenho.

### Fronteira Registro × Ticket × Tarefa (regra de roteamento na UI)
| | `TicketSuporte` (/suporte) | `Tarefa` (/tarefas) | `RegistroEmpresa` (novo) |
|---|---|---|---|
| Sobre o quê | algo quebrou / dúvida | entregável de cliente | **como *nós* trabalhamos** |
| Gatilho | reativo (SLA) | contrato/escopo | melhoria interna |
| Fecha e some? | sim | sim (entrega) | **não — vira processo/meta** |
| Já existe? | sim | sim | **não (é o gap)** |

---

## 5. Mudanças no "como fazemos hoje" (o dono pediu p/ avaliar)

- **`DiarioEntrada.disciplinaId` → nullable** (hoje NOT NULL, ~linha 1690 do schema). Permite observação **de nível projeto**, sem disciplina. Migração pequena.
- **`arquivos_gerais`** ganha categoria/rótulo "Gestão/Geral" (config, não schema).
- **Capacidade de equipe** passa a ser **lida** (não digitada) — reaproveita queries de `/recursos`.
- **Feedback interno** consolidado em `/suporte` (decisão consciente de não abrir canal novo).

**Não usar `Documento`/`DocumentoVersao` para o aux interno:** exige `clienteId` (NOT NULL) e é *client-facing* por design (portal). Armadilha de reuso.

---

## 6. Anti-cemitério (obrigatório desde o MVP)

O conselho foi unânime: sem isso, o Espaço 2 é write-only e morre em ~3 semanas.
- Todo `RegistroEmpresa` nasce com **`status` + `responsavelId` + `proximaRevisao`**.
- **Job pg-boss** (`lib/jobs.ts`/`jobs-handlers.ts`) notifica o dono quando a revisão vence — nova categoria de notificação `gestao_interna` em `lib/notificar.ts`.
- **Captura sem atrito, triagem depois:** entrada crua de 1 campo; classificar (tipo/prioridade/responsável) é ato separado, feito por quem cuida da pauta.

---

## 7. Faseamento

**Fase 1 (MVP — P/M):**
- Espaço 1: aba "Central de gestão" (agregação por reuso) + espelho global. Único schema-touch: `DiarioEntrada.disciplinaId` nullable.
- Espaço 2: tabela `RegistroEmpresa` + recurso `registros_empresa` + nav "Gestão" + ciclo de vida (§6) + painel de capacidade só-leitura.
- **Sem** dashboards, gráficos, roll-up complexo.

**Fase 2 (se a F1 for usada — métrica na §9):**
- Botão promover: captura→`Tarefa` (projeto) e ticket/feedback→`RegistroEmpresa` (empresa); reserva `RegistroEmpresa.tarefaId`.
- Geração de ata a partir do `Compromisso` via Doc Studio; encaminhamento→Tarefa.
- Metas/OKR leve (só se §8.3 pedir estrutura).
- Ritual de revisão trimestral (tela de "retro" que força reclassificar itens vencidos — fecha o P-D-**C**-A).

**Fase 3:** dashboards de metas; visualizador de mapa de processo; `/qualidade` (índice de retrabalho) como gatilho de meta.

---

## 8. Pendências de PROCESSO (bloqueiam iniciar o Espaço 2 — não assumir)

O conselho: **sem dono nomeado da pauta, o Espaço 2 não deve ser construído** (cemitério garantido).
1. **Dono da pauta de melhoria contínua** — quem revisa periodicamente? Se "ninguém fixo" → Espaço 2 nasce como doc de texto, não CRUD.
2. **Cadência de revisão que será cumprida** — mensal ou trimestral? Define o job de notificação.
3. **"Metas" (projeto e empresa)** — numéricas/rastreadas (alvo+progresso, tipo OKR) ou só anotação? Decide tabela própria vs. nota em `DiarioEntrada`/`RegistroEmpresa`.

Secundárias (não bloqueiam o desenho):
- Meta de desenvolvimento é do dono/sócio só, ou por equipe/disciplina? (adiciona `disciplina`/`responsavel`).
- Feedback: só "promover" do Suporte, ou também caixa própria de sugestões? (recomendação: só promover).
- Quantos mapas de processo existem hoje e em que formato? Se ainda não existem → MVP é só o *slot* de anexo.

---

## 9. Custo de deploy & métrica de sucesso

**Deploy:**
- Espaço 1: ~zero schema (só `DiarioEntrada.disciplinaId` nullable = 1 migração pequena). Reuso = seed zero.
- Espaço 2: 1 migração (`RegistroEmpresa`) + **`npm run db:seed` obrigatório no deploy** (novo recurso `registros_empresa` no `permissions-catalog.ts` — mesmo padrão de `arquivos`/`biblioteca_tecnica`).

**Métrica (como saber em 1 mês se pegou):**
- **Espaço 2 vivo:** ≥3 usuários de gestão distintos criam registro **e** ≥50% dos registros mudam de status/comentário em ≤2 semanas. Criado-e-nunca-tocado >70% = cemitério → reverter.
- **Espaço 1 útil:** a Central é usada em ≥30% dos projetos ativos **com arquivos que não estão no Diretório por disciplina** (se forem os mesmos, é redundante → matar).
- **Sinal de morte precoce:** 4 semanas sem ninguém "promover" nem mudar status → não expandir para F2.

---

## 10. Conselho — resumo por lente

- **Gerente de Projetos:** valor está em encadear reunião→decisão→tarefa, não em guardar arquivo. Cronograma-arquivo forka a fonte da verdade — bloquear. Aba "Gestão" agregadora, atas nascem do Compromisso.
- **Arquiteto/Dev:** Espaço 1 = agregação por reuso, zero módulo novo. Espaço 2 = 1 tabela genérica. **Não** criar anexo polimórfico. `Documento` não serve (exige `clienteId`). Maior perigo = 34º módulo redundante.
- **Usuário interno:** inimigo nº1 = fricção de decidir onde salvar + preencher. Arquivo = arrastar (0 campo); registro = 1 campo + auto-tag. Metade do Espaço 2 ninguém mantém sem gatilho de revisão.
- **Sócio-gestor:** os 6 itens são fases de um ciclo (PDCA). Capacidade se LÊ, não se digita. Sem dono da pauta + revisão obrigatória = cemitério. Permissão fechada à gestão.
- **Product cético:** de ~11 artefatos → **1 build novo** (`RegistroEmpresa`) + **1 atalho** (pasta = view do Arquivos). O resto já existe. Dizer "não" a 8 dos 11 com elegância.
