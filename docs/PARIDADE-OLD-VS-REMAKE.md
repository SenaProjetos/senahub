# Paridade SenaHub (antigo) × SenaHub-remake — Checklist de Lacunas

> Comparação item-a-item entre `C:\SENA_ADM\SENAHUB\SENAHub` (sistema antigo, base do
> `docs/RELATORIO-SISTEMA.md`) e o projeto atual (`SENAHub-remake`).
> Baseado em leitura direta dos dois schemas Prisma, rotas, módulos e UI.
>
> Gerado em 2026-06-14.

## Como usar este documento

- Cada linha é uma **lacuna real** (algo que o usuário fazia no antigo e **não faz** no remake).
- **Decisão** começa em `Aplicar` (padrão). Para descartar um item, troque para `Pular`.
- Itens já confirmados na conversa estão marcados `✅ Confirmado: Aplicar`.
- O **Apêndice Z** lista o que *parece* faltar mas é só **dobra** (renome/fold) — não é lacuna.

### Legenda

| Campo | Valores |
|---|---|
| **Nec.** (necessidade) | 🔴 núcleo · 🟡 útil · ⚪ nicho/cosmético |
| **Viab.** (viabilidade no remake) | `fácil` (modelo + CRUD aditivo) · `média` · `difícil` (briga com design atual) |
| **Decisão** | `Aplicar` (padrão) · `Pular` · `✅ Confirmado: Aplicar` · `⏸ Aguardando spec` |

---

## A) Financeiro — profundidade ERP

> Remake = livro-razão único (`Lancamento`: previsto→confirmado, `valorEfetivo` parcial,
> `recorrenciaGrupo`). Páginas `contas-a-pagar`/`-receber` são **filtros sobre Lancamento**.
>
> **Spec do financeiro recebida** (`docs/senahub-financeiro-prompts.md`, Fases 2–5). Direção
> real ≠ "restaurar entidades AP/AR separadas": é **enhancement do `Lancamento`** (vínculo a
> documento, aging, aprovação por alçada). Reconciliação completa em **§G**. Isso reenquadra
> A1/A2/A3 abaixo.

| # | Item (modelo antigo) | O que faz / utilidade | Nec. | Viab. | Decisão |
|---|---|---|---|---|---|
| A1 | **ContaPagar / ContaReceber** (entidade + `aprovar` + anexos + `Retencao`) | Conta a pagar/receber como entidade própria, com etapa de aprovação antes de virar despesa e retenção de imposto na receita. | 🟡 | difícil | → §G Fase 4 (aprovação sobre Lancamento, sem entidade separada) |
| A2 | **Parcela** (parcelamento) | Dividir uma conta em N parcelas com vencimento/status individuais. | 🟡 | média | → §G Fase 2 (1 doc → N lançamentos) |
| A3 | **ContratoFinanceiro** | Contrato do cliente gera cronograma automático de recebíveis (ponte venda→financeiro). | 🟡 | média | → §G Fase 2 (`DocumentoFinanceiro` tipo CONTRATO) |
| A4 | **Orçamento editável** (`PlanejamentoItem/Rascunho/Gasto/PlanoAplicado/Visualizacao` + import/export xlsx) | Workspace de planejamento orçamentário: rascunhos, cenários, importar gastos, versões. Remake hoje só tem relatório previsto×realizado. | 🟡 | difícil | ✅ Confirmado: Aplicar |
| A5 | **RetiradaSocio** | Registro de pró-labore / distribuição de lucro por sócio. | 🟡 | fácil | Aplicar |
| A6 | **Lancamento: Anexo + Tag + Histórico de status** | Comprovante anexado ao lançamento, etiquetas livres, trilha de mudanças de status. | 🟡 | fácil | Aplicar |
| A7 | **FornecedorServico / ServicoFornecedor / AnexoServico** | Catálogo de serviços que um fornecedor presta (com anexos). Remake só tem `ServicoTerceirizado` por projeto. | ⚪ | fácil | Aplicar |
| A8 | **FolhaProjetista batch** (`FolhaProjetista` + `Item` agrupando pagamentos) | Agrupar pagamentos de projetistas numa folha com fluxo aprovar/pagar. Remake tem `PagamentoProjetista` individual. | ⚪ | média | Aplicar |

---

## B) Projetos / Entregas

| # | Item | O que faz / utilidade | Nec. | Viab. | Decisão |
|---|---|---|---|---|---|
| B1 | **ArquivoProjeto / ArquivoVersao** | Repositório geral de arquivos versionados do projeto + download-zip, **separado** dos pacotes A/B de validação. | 🟡 | média | ✅ Confirmado: Aplicar |
| B2 | **SolicitacaoRevisao (+Anexo)** | Workflow formal de pedido de revisão de disciplina (solicita → revisa, com anexo). Remake só tem `RevisaoDisciplina` = registro/log. | 🟡 | média | Aplicar |
| B3 | **ProjetoComposicaoPreco / ItemComposicaoPreco** | Composição detalhada de preço (memória de cálculo que forma o valor do projeto/proposta). | 🟡 | difícil | Aplicar |
| B4 | **LmConfig** | Configuração de lista de materiais BIM por projeto. | ⚪ | média | Aplicar |
| B5 | **LinhaBase** (snapshot separado) | Persistir uma linha de base do cronograma como registro próprio. *Obs: baseline já existe dobrado em `inicioBaseline/fimBaseline`; isto é só o snapshot histórico.* | ⚪ | fácil | Aplicar |

---

## C) Comercial / CRM

| # | Item | O que faz / utilidade | Nec. | Viab. | Decisão |
|---|---|---|---|---|---|
| C1 | **Oportunidade (+Historico / AtividadeComercial)** | CRM de 2 estágios: Lead → Oportunidade com funil, atividades e histórico próprios. Remake = Lead único + `AtividadeLead`. | 🟡 | média | Aplicar |
| C2 | **PropostaAnexo** | Anexar arquivos à proposta. | 🟡 | fácil | Aplicar |
| C3 | **Proposta — comparar versões** | Diff lado-a-lado entre versões da proposta. Versões já existem (snapshot); falta a tela de comparação. | ⚪ | fácil | Aplicar |

---

## D) RH

| # | Item | O que faz / utilidade | Nec. | Viab. | Decisão |
|---|---|---|---|---|---|
| D1 | **RateioHora persistido + custo→Financeiro** | Hoje o remake só **mostra** minutos/projeto; não persiste o rateio nem empurra o custo da hora CLT para o Lancamento/margem do projeto (Fluxo C metade feito). | 🔴 | média | ✅ Confirmado: Aplicar |
| D2 | **PeriodoAquisitivo (+Status)** | Ciclo aquisitivo de férias: acúmulo, 1/3 constitucional, vencimento — exigência CLT. | 🟡 | média | ✅ Confirmado: Aplicar |
| D3 | **BancoHorasMensal — fechamento** | Fechar/persistir o saldo mensal do banco de horas com carry-forward. Hoje o saldo é só calculado ao vivo. | 🟡 | média | ✅ Confirmado: Aplicar |
| D4 | **FuncionarioDocumento** | Repositório de documentos do funcionário (contrato, RG, ASO…) com download. | 🟡 | fácil | ✅ Confirmado: Aplicar (parte de "Repositórios de arquivo") |
| D5 | **FeedbackRH** | Feedback / 1:1 estruturado (distinto do clima emocional, que já existe). | ⚪ | fácil | Aplicar |
| D6 | **NotaFiscalPJHistorico** | Histórico de mudanças de status da NF de PJ. | ⚪ | fácil | Aplicar |
| D7 | **RegistroPonto granular** | Batidas individuais com tipo/correção e trilha. Remake usa só `SessaoTrabalho` (início/fim). | ⚪ | média | Aplicar |

---

## E) Jurídico / Licitações / Chat / Auth

| # | Item | O que faz / utilidade | Nec. | Viab. | Decisão |
|---|---|---|---|---|---|
| E1 | **PastaJuridica** | Organização de documentos jurídicos em pastas/árvore. | ⚪ | fácil | ✅ Confirmado: Aplicar (parte de "Repositórios de arquivo") |
| E2 | **ModeloContrato** | Biblioteca de modelos de contrato específica (remake usa o Estúdio genérico `DocumentoModelo`). | ⚪ | fácil | Aplicar |
| E3 | **CertidaoVersao** | Histórico de versões de uma certidão. | ⚪ | fácil | Aplicar |
| E4 | **LicitacaoHistorico** | Timeline/histórico do processo de licitação. | ⚪ | fácil | Aplicar |
| E5 | **DisciplinaValorLicitacao** | Valor por disciplina dentro de um edital/licitação. | ⚪ | fácil | Aplicar |
| E6 | **MensagemLeitura (read receipts)** | Confirmação de leitura por mensagem. Remake tem contagem de não-lidas simplificada. | ⚪ | média | Aplicar |
| E7 | **SolicitacaoCadastro** | Auto-cadastro público (pedir conta → admin aprova). Remake: admin cria usuários. | ⚪ | fácil | Aplicar |
| E8 | **UserPreference (store dedicado)** | Tabela de preferências do usuário. Remake dobra em campos do `User`. | ⚪ | fácil | Aplicar |

---

## F) Infraestrutura / Stack (mudança intencional — confirmar se é lacuna)

> Não são "features" de negócio, mas constam no RELATORIO. Você marcou **"decidir depois"**.

| # | Item | Diferença | Decisão |
|---|---|---|---|
| F1 | **Redis** | Cache de permissões/relatórios, fila de push, pub/sub do chat multi-instância, rate-limit. Remake faz tudo in-process (single-instance). | ⏸ Decidir depois |
| F2 | **Docker / Nginx / Cloudflare Tunnel** | Remake roda Windows nativo + serviço NSSM. | ⏸ Decidir depois |
| F3 | **Multi-instância / escala horizontal** | Consequência de não ter Redis: não escala além de 1 processo. | ⏸ Decidir depois |

---

## Apêndice Z — NÃO são lacunas (dobras / renomes verificados)

Itens que aparecem no diff de modelos mas têm capacidade equivalente no remake — **nenhuma ação**:

| Antigo | No remake |
|---|---|
| `Categoria`, `Centro`, `Conta`, `Contato` | `CategoriaFinanceira`, `CentroCusto`, `ContaBancaria`, `ContatoCliente` |
| `TarefaEAP`, `TarefaEAPPredecessora` | `EapTarefa`, `EapDependencia` |
| baseline EAP (`LinhaBase` campos) | `inicioBaseline` / `fimBaseline` em `EapTarefa` |
| `IndiceQualidadeSnapshot` | `QualidadeSnapshot` |
| `Funcionario`, `FuncionarioDependente` | `User` (+ `salarioBase`) e `Dependente` |
| `RegistroEmocao` / clima | `RegistroEmocao` (presente) |
| Onboarding (`*ChecklistTemplate`, `*ItemTemplate`, `*ProcessoItem`) | `OnboardingTemplate/TemplateItem/Processo/Item` |
| `LicitacaoDocumento(+Versao)` | `DocumentoLicitacao` / `DocLicitacaoVersao` |
| `TarefaAnexo` | dobrado em anexo de `TarefaComentario` |
| `UserPreference` (campos básicos) | campos em `User` (`chatStatus` etc.) — *store dedicado fica em E8* |
| Enums (`Tipo*`, `Status*`) | convertidos em campos string/enum no remake |
| `recorrência` de lançamento | `recorrenciaGrupo` em `Lancamento` |
| Conciliação OFX, DRE, DFC, Balanço, Indicadores, Fluxo de caixa | presentes |
| Ponto, Abono, Férias (base), Clima, Holerite, NF-PJ, e-mail holerite | presentes (consolidados em `/rh`, `/rh/admin`, `/ponto`) |
| Busca global, Auditoria, Notificações, Push, Agenda, SLA, Qualidade | presentes |

---

## Resumo de decisões (preencher)

- **Total de lacunas reais:** 31 (A:8, B:5, C:3, D:7, E:8) + 3 infra.
- **Já confirmadas para aplicar:** A4, B1, D1, D2, D3, D4, E1 (as 4 prioridades + seus sub-itens).
- **Aguardando spec do financeiro AP/AR:** A1, A2, A3.
- **A confirmar (Aplicar/Pular):** todos os demais.

> **Próximo passo:** você revisa esta lista, marca `Pular` no que não quiser. O financeiro
> já tem spec (§G). Roadmap de execução em §H.

---

## G) Financeiro AP/AR — spec recebida × realidade do remake

Fonte: `docs/senahub-financeiro-prompts.md` (Fases 2–5). **Os prompts foram escritos para o
stack ANTIGO** e precisam de adaptação antes de executar — os próprios prompts mandam pausar
para revisão humana quando o stack diverge, e diverge bastante:

### G.0 Divergências de stack a corrigir em TODAS as fases

| Prompt assume (antigo) | Remake real | Ação |
|---|---|---|
| Next 14 + NextAuth + REST `app/api/financeiro/*` | Next 15 + better-auth + **server actions** em `src/modules/financeiro/*/actions.ts` | Reescrever como server action `defineAction` (gate + Zod + audit), não rota REST |
| `components/financeiro/` | `src/components/financeiro/` | Ajustar caminho |
| `status` enum `PREVISTO \| CONFIRMADO` (maiúsc.) | `previsto \| confirmado \| cancelado` (minúsc.) | Usar valores reais |
| campos `valorPrevisto`, `dataVencimento` | `valor`, `vencimento`, `valorEfetivo`, `dataConfirmacao` | Mapear nomes |
| `Recharts` p/ gráficos | **sem Recharts** — SVG/CSS custom | Gráficos em SVG (padrão do projeto) |
| role aprovador `ADMIN \| SOCIO` | `Role` não tem `SOCIO`; Sócio é modelo à parte | Gatear por **permissão fina** `financeiro:aprovar` (admin sempre passa), não role hardcoded |
| Socket.io rooms (verificar) | **existe** (`dev:server`, `server.ts`) + `Notificacao` | Reusar socket + notificações já prontos |

### G.1 Fase a fase

| Fase | O que pede | Status no remake | Veredito |
|---|---|---|---|
| **Fase 2 — Vínculo a documento** (`DocumentoFinanceiro` tipo NF/Contrato/Proposta/Medição; 1 doc → N lançamentos) | Rastreabilidade de origem + base do parcelamento | **Parcial**: já há vínculos pontuais (`pagamentoProjetistaId`, e existem `NotaFiscalPJ`, `Proposta`, `MedicaoLicitacao`). Falta o modelo unificador + UI. | **Aplicar adaptado.** Decidir: modelo novo `DocumentoFinanceiro` unificador **ou** campos polimórficos. Cobre A2/A3. |
| **Fase 3 — Aging** (faixas a vencer/30/60/90/120+, widget, rota) | Visão de vencidos AR/AP | **Ausente** (contas-a-pagar/receber mostram lista, sem aging por faixa). | **Aplicar adaptado** (SVG, não Recharts; server action, não rota). |
| **Fase 4 — Aprovação por alçada** (status `AGUARDANDO_APROVACAO`, limite configurável, painel, badge, socket) | Despesa ≥ limite trava até aprovação | **Ausente**. Equivale ao A1 (aprovar conta a pagar). | **Aplicar adaptado**: enum minúsculo `aguardando_aprovacao`; gate por `financeiro:aprovar`; limite em `ConfigSistema`/tabela. |
| **Fase 5 — Conciliação OFX** | Importar OFX, match, conciliar | ✅ **JÁ EXISTE**: `src/lib/ofx.ts` (+teste), `ExtratoBancario`/`TransacaoBancaria` (`fitid`, `conciliado`), módulo `conciliacao`, sugestões. | **PULAR** (já entregue). No máx. revisar UX de upload `.ofx`. |

### G.2 Decisões pendentes do financeiro

1. **DocumentoFinanceiro**: modelo unificador novo **ou** campos polimórficos em `Lancamento`? (afeta como NF-PJ/Proposta/Medição existentes se conectam).
2. **Aprovação**: gatear por permissão `financeiro:aprovar` (recomendado) ou por roles fixos admin/supervisor?
3. **Limite de alçada**: guardar em `ConfigSistema` (chave-valor já existe) — confirmar.
4. **Fase 5**: confirmar que pulamos (OFX já pronto).

---

## H) Plano de execução por ondas

Sequência proposta. Padrão = 1 onda → verificação (tsc/lint/testes) → 1 commit.

| Onda | Conteúdo | Itens | Status |
|---|---|---|---|
| **H1 — Custo-hora → margem** 🔴 | `RateioHora` (snapshot mensal) + `margemProjeto` + card no projeto + custo/fechar no ponto | D1 | ✅ **Entregue** `a55f317` |
| **H2 — Repositórios de arquivo** | `ArquivoProjeto`+versões, `FuncionarioDocumento`, `PastaJuridica` | B1, D4, E1 | ✅ **Entregue** `0cf8cd7` |
| **H3 — Férias CLT + banco de horas** | `dataAdmissao` + períodos aquisitivos (lib + 6 testes) + `BancoHorasMensal` (fechamento/acumulado) | D2, D3 | ✅ **Entregue** `1dc09b8` |
| **H4 — Orçamento editável** | `OrcamentoItem` (planejado por categoria/ano) + edição inline + % do orçado | A4 (parcial) | ✅ **Entregue** `a9f0ce4` |
| **H5 — Financeiro: doc-link** | Fase 2 adaptada (`DocumentoFinanceiro`) | A2, A3, §G F2 | ⏸ Decisão G.2.1 |
| **H6 — Financeiro: aging** | Fase 3 adaptada (SVG) | §G F3 | ⏸ Após H5 |
| **H7 — Financeiro: aprovação** | Fase 4 adaptada (alçada) | A1, §G F4 | ⏸ Decisão G.2.2/3 |
| **H8 — Itens a confirmar** | Demais "Aplicar" não-prioritários (A5–A8, B2–B5, C1–C3, D5–D7, E2–E8) | — | Após você marcar `Pular` |
| — | Fase 5 OFX | — | **PULAR (já existe)** |

> **H1–H4 entregues** (suas 4 prioridades, 1 commit por onda, tsc 0 · 58 testes em cada
> checkpoint). H5–H7 (financeiro) dependem das decisões de §G.2. H8 espera suas marcações de
> `Pular`.
>
> **Notas de implementação:** H3 = períodos aquisitivos **computados** (sem tabela
> `PeriodoAquisitivo`, sempre derivados da admissão); banco de horas pessoal mostra acumulado
> via RH-admin (linha no espelho pessoal = melhoria futura). H4 = orçamento **planejado×realizado
> editável**; rascunhos/versões/importar-gastos do módulo antigo ficam como melhoria futura.
