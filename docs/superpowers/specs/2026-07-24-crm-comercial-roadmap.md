# Spec / Roadmap — Evolução do CRM comercial (funil de vendas)

**Data:** 2026-07-24 · **Status:** 📋 planejamento (acompanhamento) · **Branch alvo:** `dev`

Origem: pedido do dono — dois ajustes no card do funil (caixa de observação maior + anexar
arquivo) que abriram uma rodada de **34 sugestões** de evolução do módulo comercial. Este
documento consolida essas 34 + 10 sugestões da análise inicial, dá veredito de viabilidade,
ordena por fundação/dependência e define **qual modelo de IA usar em cada etapa**.

> **Achado que orienta tudo:** boa parte do "fim de funil" **já existe** — `aceitarProposta`
> vira projeto+disciplinas+chat+notificação; `PropostaVisualizacao` (pixel) já registra abertura
> do link; `TabelaPreco` já faz área×valorM2; `AuditLog` já grava toda mutação. As lacunas reais
> estão no **começo/meio do funil** (gestão do lead) e na **camada de métrica**. Várias ideias são
> "expor/estender o que já tem", não "construir do zero".

---

## 1. Contexto técnico (estado atual)

- **`Lead`**: nome, contato, email, telefone, `origem` (string livre), `valorEstimado`, `etapaId`,
  `clienteId` (setado na conversão), `observacoes`, `motivoPerda` (texto livre), `arquivado`,
  `atividades[]` (só notas manuais), `propostas[]`, **`anexos[]` (entregue nesta sessão)**.
- **`FunilEtapa`**: nome, ordem, cor, ativo. **Sem `probabilidade`.**
- **`AtividadeLead`**: só nota manual (mover etapa NÃO gera atividade).
- **`Proposta`**: ciclo completo (link público, PDF, `PropostaVisualizacao`/pixel, versões,
  `validade`, `aceitarProposta` → Projeto + disciplinas + canais de chat + notifica gestores).
- **`Cliente`**: já é a "conta"; leads convertem nele; projetos/propostas ancoram nele.
- **Infra**: `pg-boss` (cron/jobs, só sob `dev:server`/prod), `notificar()`/categorias,
  `lib/aging.ts` (buckets), heurísticas puras testadas (`caminho-critico.ts`, `health.ts`,
  `encargos.ts`) como padrão para score/forecast. **SMTP outbound apenas** (sem IMAP).

---

## 2. Já pronto / quase pronto — NÃO reconstruir

| # | Ideia | Estado real |
|---|---|---|
| 29 | Arquivos do lead | ✅ **Feito** (`AnexoLead` + rota multipart + download + UI no card) |
| 27 | "Proposta enviada / visualizada" | Parcial: `enviadaEm` + `PropostaVisualizacao` (pixel do link já registra abertura) |
| 33 | Conversão p/ projeto | ~80%: aceite cria Projeto+disciplinas+chat+notif; `PastaProjeto` já existe |
| 32 | Estimativa de honorários | Base pronta: `TabelaPreco` (área × valorM2 por disciplina) |
| 26 | Timeline (auditoria) | `AuditLog` já grava toda mutação; falta view consolidada + eventos de negócio no `AtividadeLead` |

---

## 3. Matriz de viabilidade (todas as ideias)

Esforço: **P**equeno · **M**édio · **G**rande. Modelo IA: **H**=Haiku 4.5 · **S**=Sonnet 5 · **O**=Opus 4.8
(ver §5 para justificativa por tarefa).

| # | Tema | Veredito | Esf. | IA | Nota |
|---|---|---|---|---|---|
| 15 | Motivos de perda estruturados | ✅ barato/alto | P | S | enum+obs no lugar do texto; **migração+backfill** do `motivoPerda` atual |
| 30 | Tipo de empreendimento | ✅ barato | P | H | campo de catálogo (residencial/galpão/hospital…) |
| 31 | Disciplinas de interesse | ✅ barato | P/M | S | multi-select do catálogo `Disciplina` (join novo no lead) |
| 22 | Modelos de follow-up | ✅ barato | P | H | notas prontas (canned) |
| 28 | Registro WhatsApp manual | ✅ barato | P | H | interação `canal=whatsapp` (sem API) |
| m6 | Botão WhatsApp/e-mail no card | ✅ barato | P | H | `wa.me/55…` + `mailto:` |
| m8 | Busca + filtros no board | ✅ barato | P | H | hoje só filtra origem |
| m9 | Alerta de validade da proposta | ✅ barato | P | H | `Proposta.validade` existe, ninguém avisa (job) |
| m7 | Temperatura do lead | ✅ barato | P | H | quente/morno/frio → cor no card; alimenta o score (17) |
| m1 | **Responsável pelo lead** | ✅ fundação | M | S | não estava na lista original; base do "ranking de vendedores" (34) |
| m2 | **Próximo contato / lead parado** | ✅ fundação | M | S | = ideia 21; `proximoContato` + badge "atrasado" no card |
| 13 | Parceiros / indicações | ✅ alto | M | S | `Parceiro` + `lead.parceiroId`; substitui origem-texto |
| 26 | **Timeline completa** | ✅ fundação-chave | M | O | destrava 17/19/20/34; decidir eventos + hook + dedupe c/ AuditLog |
| 12 | Histórico consolidado do cliente | ✅ alto | M | S | dados já ancoram no `Cliente`; é query + painel |
| 24 | Dedup de clientes | ✅ viável | P/M | S | match normalizado nome/email/tel/CNPJ |
| 25 | Reativação de oportunidade | ✅ viável | P | S | flag quando cliente já tem histórico; depende de 12 |
| 17 | Score do lead | ✅ alto | M | O | função **pura testada** tipo `health.ts` (regras, não ML) |
| 16 | Probabilidade dinâmica | ⚠️ só heurística | M | O | **rejeitar framing de ML**; fundir com o score (17) |
| 18 | Pipeline ponderado | ✅ viável | P | S | precisa `FunilEtapa.probabilidade`; depois é soma |
| 19 | Forecast de faturamento | ✅ viável | M | O | precisa prob + data prevista de fechamento; math de correção |
| 20 | Tempo médio até fechamento/origem | ✅ viável | M | O | depende da timeline (26) |
| 21 | Sequências automáticas de follow-up | ✅ viável | M | S | pg-boss cron sobre `proximoContato` (infra já existe) |
| 23 | Checklist por etapa | ⚠️ c/ ressalva | M | S | fazer **opcional/soft**, não travar avanço duro (atrito) |
| 11 | Empresa + múltiplos contatos (B2B) | ⚠️ viável, grande | G | O | `Cliente` já é a conta; falta `ContatoCliente[]`; cruza com pessoa-360 |
| 32 | Estimativa de honorários | ⚠️ parcial | M | O | versão lookup R$/m² por tipo (sim); "aprende com histórico" (prematuro) |
| 33 | Conversão completa | ⚠️ incremento | P/M | S | fechar lacunas equipe/cronograma/financeiro no aceite |
| 14 | Concorrentes | 🔸 baixo-ROI agora | M | S | campo barato; estatística só serve com volume |
| 34 | Dashboard executivo | 🔸 por último | G | O | depende de ~8 campos acima; muitos joins, correção de métrica |
| 27 | Integração e-mail **inbound** | ❌ inviável agora | G | — | sem IMAP/webhook; nativo Windows sem infra de mail. Outbound+abertura-de-link já dão 80% |

---

## 4. Fundações e dependências

Três fundações destravam quase todo o resto. Construir inteligência (17/18/19/34) **antes** delas = retrabalho.

1. **Campos estruturados** (15, 30, 31, 13, m1, m7) — sem eles, todo dashboard vira texto-livre inanalisável. Baratos.
2. **Timeline automática (26)** — sem ela, tempo-por-etapa/forecast/win-rate (19, 20, 34) são impossíveis. `moverLead` precisa gravar `AtividadeLead` automático.
3. **Cliente como conta (11/12)** — base do B2B e do histórico consolidado.

Redundâncias a fundir: 16↔17 (mesmo motor de score) · m2↔21 (mesmo `proximoContato`) · m4/origem↔13↔15 · m5↔18↔34 (uma única camada de métrica).

---

## 5. Roadmap por Onda + modelo de IA por etapa

> **Regra (feedback do dono):** se a etapa recomenda modelo ≠ do atual, **PARAR e trocar** via `/model`
> antes de começar — não só avisar. Cada Onda fecha com um passo de **review** (`/code-review` ou
> `cavecrew-reviewer`) e `Verificar tudo` (lint+test+build) no `dev.bat`.

### Onda A — campos + wins baratos (~2 dias) · sem dependência
Itens: 30, 22, 28, m6, m8, m9, m7 · **15**, **31**.
- **Modelo: Haiku 4.5** para os mecânicos (30, 22, 28, m6, m8, m9, m7) — 1–2 arquivos, campo/UI, zero lógica.
- **Modelo: Sonnet 5** para **15** e **31** — tocam schema+migração (15 precisa **backfill** do `motivoPerda`
  texto→enum; 31 cria join com `Disciplina`).
- *Racional:* Haiku resolve mecânico barato; Sonnet para o que tem migração/múltiplas camadas.

### Onda B — fundação CRM
Itens: m1 (responsável), m2/21 (próximo contato + job de lead parado), 13 (parceiros), **26 (timeline auto)**.
- **Modelo: Sonnet 5** para m1, m2, 13 — feature padrão (schema+action+query+UI seguindo o padrão do módulo).
- **Modelo: Opus 4.8** para **26** e **21**:
  - 26 = decisão transversal (quais eventos, onde dar hook, **dedupe com `AuditLog`**, forma da timeline reusável).
  - 21 = cron pg-boss + fan-out de `notificar()` por categoria; lógica de "parado" com risco de spam.
- *Racional:* Opus onde há decisão de arquitetura/efeito colateral cruzado; Sonnet no CRUD de padrão conhecido.

### Onda C — cliente 360
Itens: 12 (histórico), 24 (dedup), 25 (reativação) · **11 (contatos B2B)**.
- **Modelo: Sonnet 5** para 12, 24, 25 — query+view+match normalizado.
- **Modelo: Opus 4.8** para **11** — decisão de modelo de dados (conta↔contatos), **migração de dados
  existentes** (lead/cliente → `ContatoCliente`), interseção com o projeto pessoa-360.

### Onda D — inteligência comercial
Itens: 18 (ponderado), 17/16 (score/prob), 19 (forecast), 20 (tempo médio).
- **Modelo: Opus 4.8** em toda a Onda — são **heurísticas puras testadas** (tier `caminho-critico.ts`/
  `health.ts`/`encargos.ts`), barra alta de correção matemática e de teste. 18 sozinho poderia ser Sonnet,
  mas mantê-lo no mesmo motor de métrica (com 19/20) evita divergência de fórmula.
- *Racional:* correção > custo aqui; erro silencioso de forecast corrói confiança do gestor.

### Onda E — automação / conversão
Itens: 23 (checklist soft), m10 (pré-preencher proposta), 33 (fechar lacunas), **32 (honorários)**.
- **Modelo: Sonnet 5** para 23, m10, 33 — extensão de feature existente.
- **Modelo: Opus 4.8** para **32** — lógica de precificação (lookup R$/m² por tipo + faixas), testável,
  com risco de número errado ir pra proposta do cliente.

### Onda F — visão gerencial
Itens: 34 (dashboard executivo), 14 (concorrentes).
- **Modelo: Opus 4.8** para **34** — muitos joins/agregações, correção de métricas (win-rate, receita
  prevista, rankings); depende de todos os campos anteriores.
- **Modelo: Sonnet 5** para 14 — schema+campo+estatística simples.

### Resumo de alocação
| Modelo | Onde | Perfil de tarefa |
|---|---|---|
| **Haiku 4.5** | Onda A (mecânicos) | 1–2 arquivos, campo/UI/botão, zero lógica |
| **Sonnet 5** | A(15/31), B(m1/m2/13), C(12/24/25), E(23/m10/33), F(14) | feature CRUD de padrão conhecido (schema+action+query+UI) |
| **Opus 4.8** | B(26/21), C(11), **toda D**, E(32), F(34) | arquitetura, migração de dados, heurística pura testada, agregação de métrica, precificação |

*(Fable 5 fora da alocação por ora — sem posicionamento claro para estas tarefas; reavaliar se surgir caso de escrita longa/criativa.)*

---

## 6. Rejeitados / inviáveis agora (com porquê)

- **27 — inbound de e-mail** (resposta/abertura de e-mail): ❌ sem IMAP/webhook; deploy nativo Windows sem
  infra de mail. Outbound (`enviarEmailTemplate`) + abertura do **link** (`PropostaVisualizacao`) já entregam ~80%.
- **16 como ML / "probabilidade automática que aprende"**: rejeitar o framing. Só entra como **heurística
  transparente** fundida ao score (17). Volume de dados do escritório é baixo — regra explícita > modelo aprendido.
- **32 "que aprende com histórico"**: idem — só a versão **lookup** (R$/m² por tipo). Regressão é prematura.
- **14 — dashboards de concorrentes**: campo é barato, mas "% vitória vs concorrente X" só tem sentido com
  muito volume de disputas. Criar o campo cedo (Onda F), adiar a estatística.
- **23 — checklist que trava avanço de etapa (hard gate)**: rejeitar o travamento duro (atrito). Fazer
  **soft** (aviso/percentual), não bloquear o `moverLead`.
- **WhatsApp API oficial**: fora (custo — já mapeado na memória do app de chat). Só registro **manual** (28).

---

## 7. Regras de execução

- **Branch `dev`** (master é estável/deploy). Commits Conventional pt-BR.
- **Migrações**: dev tem drift conhecido — `prisma migrate dev` pede reset. Preferir **migração à mão +
  `migrate deploy`** (foi o que funcionou para `AnexoLead` nesta sessão). 15 e 11 exigem **backfill de dados**.
- **Permissão**: reusar `comercial:gerir` onde couber; recurso novo → `db:seed` no deploy.
- **Jobs (21, m9)**: só rodam sob `dev:server`/prod (pg-boss).
- **Cada Onda**: fecha com review + `Verificar tudo` (lint+test+build) no `dev.bat`.
- **Troca de modelo**: parar e trocar via `/model` quando a etapa pedir modelo ≠ do atual.

---

## 8. Checklist de acompanhamento

Onda A — [ ] 30 · [ ] 22 · [ ] 28 · [ ] m6 · [ ] m8 · [ ] m9 · [ ] m7 · [ ] 15 · [ ] 31
Onda B — [ ] m1 · [ ] m2/21(job) · [ ] 13 · [ ] 26
Onda C — [ ] 12 · [ ] 24 · [ ] 25 · [ ] 11
Onda D — [ ] 18 · [ ] 17/16 · [ ] 19 · [ ] 20
Onda E — [ ] 23(soft) · [ ] m10 · [ ] 33 · [ ] 32
Onda F — [ ] 34 · [ ] 14
Concluído — [x] **29 (anexos do lead)** · [x] observação maior no card

Legenda ideias: `m1..m10` = análise inicial; `11..34` = sugestões do dono (2026-07-24).
