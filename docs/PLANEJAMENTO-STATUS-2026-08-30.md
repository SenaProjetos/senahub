# Estado do planejamento — auditoria de 2026-08-30

Varredura de **todos** os documentos de planejamento do repositório (≈70 arquivos fora de
`docs/manual`, `docs/legal` e `docs/agents`), classificados contra o **código**, não contra o
que o documento diz de si mesmo.

## Método

Checkbox (`- [x]`) foi descartado como métrica logo no início: ele mede quem foi diligente ao
marcar, não o que subiu. `acessos-credenciais-plan.md` marca 34/58 e está **fechado**;
`custos-c0-fundacao.md` marca 0/36 e está **implementado e commitado**. Usei três oráculos:

1. **CHANGELOG + `git log` por escopo** (`feat(acessos)`, `feat(custos)`, …) — v1.14.0, 39 escopos distintos;
2. **scripts do `package.json`** — a existência de `smoke:crm-fase5`, `smoke:acessos`, etc.;
3. **sonda de artefato nomeado** — o model Prisma, a rota ou o arquivo que o plano promete existe hoje?

O oráculo 3 é o desempate e derrubou vários cabeçalhos desatualizados (abaixo, "drift").

---

## 1. Concluídos — movidos para `docs/concluidos/`

24 documentos. Evidência arquivo a arquivo em [docs/concluidos/INDEX.md](concluidos/INDEX.md).

| Grupo | Arquivos |
|---|---|
| `concluidos/plans/` (19) | licitações estrutural · melhorias M0 · M1.0 primitivos · M1.1 moeda · ferramentas F0/F1/F2 · termo de aceite · gerenciador do servidor (GUI) · documentos fase 5a · ART/CREA · custos C0/C1/C2/C4 · custos busca-banco-insumo · recalque de fundação · banco de horas · compatibilização (9 ferramentas de coordenação) |
| `concluidos/specs/` (5) | Estúdio v2 · GUI design · **CRM roadmap (superseded)** · auditoria de licitações · design estrutural de licitações |
| `concluidos/financeiro/` (7) | todo o cluster do módulo financeiro |
| `concluidos/projectfiles/` (5) | prompts que geraram `docs/auditoria/**` |
| `concluidos/contas/` (1) | plano do cofre de Acessos (fases 1–8) |

### Drift documento × código encontrado na triagem

Casos em que o documento mentia sobre o próprio estado — vale corrigir o hábito, não só o arquivo:

- **`ferramentas-f2`** dizia "🟡 em andamento, falta F2b/F2c/F2d". No código: `concrete-beam-shear.ts`,
  `concrete-beam-deflection.ts`, `dxf/beam-section.ts` e `auto-store.ts` (264 linhas) existem e têm teste. **Fechado.**
- **`compatibilizacao-ferramentas`** dizia "proposto, aguarda aprovação". No código: as **9** ferramentas
  existem (`clash.ts`, `diff.ts`, `filtros.ts`, `medicao.ts`, `markup.ts`, `dashboard.ts`, `georref.ts`,
  `indice-elementos.ts`, `bcf/reader.ts` + `importar.ts`, model `VistaCoordenacao`). **Fechado.**
- **`auditoria-modulo-financeiro`** afirma "Planejamento de Pagamentos ❌ **INEXISTENTE**". Existem
  o model `PlanejamentoPagamento` e a rota `/financeiro/planejamento`. **Documento vencido.**
- **`custos-c3-quantitativos`** diz "implementação **bloqueada**". Existe
  `src/modules/custos/quantitativos/` completo (agregação, medição DXF/PDF, quantidades IFC, testes).
  Só o **aceite no navegador** não foi confirmado — ver §2.

---

## 2. Em andamento — o que falta, item a item

### 2.1 Fila curta (pendências pequenas, quase tudo é validação)

| Plano | Falta |
|---|---|
| `custos-c3-quantitativos` | **só o aceite no navegador**. Código, schema e testes estão de pé desde 2026-07-30 |
| `2026-08-26-correcao-erros-visuais-documentos` | F1–F5 implementados; **falta validação visual/manual** |
| `2026-06-19-melhorias-m1-2-data` | rollout **incompleto**: 20 arquivos ainda usam `toLocaleDateString` direto (financeiro, planejamento, agenda, chat, ponto, diário, recursos, ferramentas, dashboard…). M1.1 (moeda) fechou; M1.2 parou no meio |
| `2026-06-21-chat-auditoria` | ondas C1–C5 ✅ em código; **falta verificação manual com 2 usuários** (presença, recibos, digitando) — exige `npm run dev:server` |
| `2026-07-20-guias-iniciante-setores` | **1 de 9** guias existe (`clientes-comercial/guia-iniciante.md`). Faltam 8 setores |

### 2.2 Frentes abertas de verdade

| Plano | Estado | Falta |
|---|---|---|
| `specs/2026-08-27-contratos-no-estudio` | E1–E5, E7b, **E6 parte A** entregues | **E6 parte B** (é o que está na sua árvore suja agora: migração `e6_remove_modelo_contrato` + `juridico/actions.ts`), **E7a**, **M2** (rubrica por página — pendência de *produto*: de onde vem a rubrica do signatário) |
| `specs/2026-08-26-gerenciador-contratos` | Rodada 1 (A, H4, H5, I) implementada | Fases B+ **parcialmente superseded** pelo doc acima. Precisa de um corte explícito: o que sobrou de escopo próprio |
| `plans/2026-07-27-setor-contratacao-perfil-acesso` | P1, Fase 0, Ondas A–D em produção (v1.9.0); Onda E parcial (v1.10.0) | passo 4 da Onda E: **dropar `EscalaRole`** e migrar a tela — depende do *ciclo em sombra* pós-flip |
| `docs/auditoria/**` (refatoração de Documentos) | Fase 1 e Fase 2 (PR5, PR6a/b/c, PR7, PR9) implementadas | **Fase 3** (visualizador/tarefas/pins) e **Fase 4** (comparação avançada de revisões: overlay, zoom/pan sincronizado). Toda a Fase 2 continua com "validação manual pendente" |
| `plans/2026-08-26-rh-gestao-pessoas-recursos` | F0 (base) + faixas da F1 entregues em 2026-08-27 | F1 restante, **F2** (alocação por competência), **F3** (desenvolvimento/1:1), **F4** (lifecycle/onboarding-desligamento), **F5** (ausências), **F6** (painel). Corte recomendado pelo próprio plano: fechar F0+F1 |
| `plans/2026-07-08-pessoa-360-fase1` | ficha `/rh/pessoas` + `completude.ts` + prefill do cadastro entregues | histórico de **ausências por pessoa** (abonos + férias) — o buraco declarado no §2 do plano — e o "runtime nunca dirigido" |
| `plans/2026-07-05-recebidos-documentos-cliente` | Fases 1–4 ✅; Fase 5a ✅ | **Fase 5b** (consolidar contratos/jurídico no repositório `Documento`) — plano próprio, ainda em "📋 planejamento" |
| `plans/2026-08-27-inspetor-visual-desenvolvimento` | F0 + F1 entregues (`feat(dev)`, commit `fe452ed`) | F2+ (editor de Tailwind / gravação AST) — explicitamente adiado |
| `plans/2026-07-27-calculadoras-fundacoes-melhorias` | guarda-chuva: **1 de 4** filhos entregue (`recalque-fundacao`) | `sapata-associada` (E27), `sapata-prova-carga` (E25), `enriquecimentos-sapata-excentrica` (V/VI — sem `deslizamento` no engine) |
| `specs/2026-07-27-engenharia-custos-design` | C0–C4 entregues | **C5, C6** (alçada de aprovação — bloqueada por D3), **C7**; decisões D1/D4/D5/D6 pendentes do usuário |
| `docs/SECURITY/checklist_auditoria_seguranca_senahub.md` | 93 de 505 itens marcados | 412 itens; correções de 2026-08-24 registradas parcialmente |
| `docs/migracao-ssd-storage.md` | runbook pronto, **nada executado** | é operação de **produção** (downtime) — depende só de agendar |

---

## 3. Não iniciados

| Documento | Natureza | Observação |
|---|---|---|
| `plans/2026-07-19-espacos-gestao` | plano aprovado pelo conselho | `RegistroEmpresa` **não existe** no schema; nenhuma rota. Aguardava 3 pendências de processo |
| `plans/2026-07-05-documentos-fase5b-juridico` | plano | pré-requisito (5a) já rodou — está liberado |
| `plans/2026-07-27-sapata-associada` | plano | sem `calc/` e sem chave no `registry.ts` |
| `plans/2026-07-27-sapata-prova-carga` | plano | idem |
| `plans/2026-07-27-enriquecimentos-sapata-excentrica` | plano | `eccentric-footing.ts` existe, mas sem as situações V/VI |
| `plans/2026-08-05-custos-orcamento-busca-realtime-criacao-inline` | plano | "aguardando ok"; nenhuma criação inline no código |
| `specs/2026-08-27-formularios-boas-praticas` | diagnóstico | declara "nada implementado"; decisões §5 pendentes |
| `plans/2026-06-21-projetos-planejamento-auditoria` | auditoria + 6 ondas | **P0–P6 todas ⬜**. É a maior frente parada: custo real, receita/contrato, plano×execução, Visão Geral |
| `docs/visual_projetos/Redesign_Visão_Projetos.md` | briefing de redesign | overlap direto com a onda **P4** do plano acima |
| `docs/revisao-telas-por-perfil.md` | formulário para **você** preencher | todos os campos "**Apont.:**" continuam vazios |
| `docs/ANALISE_APONTAMENTOS.md` | análise de 39 itens + suas respostas | parte já entregue de carona (respostas de pendência, BCF, marcação, medição, similaridade). **Nunca virou plano** — precisa de triagem item a item |
| `docs/MELHORIAS_SENAHUB.md` (roadmap M2–M6) | backlog | M0 e M1.0/M1.1 fechados; M1.2 no meio; **M2–M6 nunca começaram** |

---

## 4. Planejamentos duplicados / sobrepostos

| # | Tema | Documentos | Veredito |
|---|---|---|---|
| D1 | **CRM comercial** | `superpowers/specs/2026-07-24-crm-comercial-roadmap` × `docs/crm/**` | Resolvido: o roadmap declara-se *superseded*. **Movido** para `concluidos/specs/`. `docs/crm/` fica como referência viva (fases F1–F7 concluídas, `smoke:crm-e2e` passou em 2026-08-23) |
| D2 | **Refatoração de Documentos** | `docs/spec-documentos-senahub` → `docs/auditoria/01..06` × `docs/projectfiles/00..04` (dois `03-plano-refatoracao.md` com o mesmo nome) | Não é duplicata real: `projectfiles` são os **prompts** que geraram `auditoria`. **Movidos**; a fonte única passa a ser `docs/auditoria/` |
| D3 | **Contratos** | `specs/2026-08-26-gerenciador-contratos` × `specs/2026-08-27-contratos-no-estudio` (1 dia de diferença) | **Sobreposição real e ativa.** O segundo substitui a Fase B do primeiro (pipeline de texto puro → Estúdio) mas o primeiro segue valendo para A/H4/H5/I. Precisa de um corte declarado — hoje o leitor não sabe qual manda |
| D4 | **Fundações** | `calculadoras-fundacoes-melhorias` (849 linhas) × 4 planos-filho de 2026-07-27 | Não é duplicata: é guarda-chuva + filhos. Mas o guarda-chuva **não registra** que 3 dos 4 filhos nunca rodaram |
| D5 | **Financeiro** | 7 documentos para um módulo só (2 specs + comparação + 2 auditorias + prompts + relatório) | Todos fechados pelo `relatorio-implementacao-financeiro`. **Movidos em bloco.** Mas resta a pendência aberta na sua memória: *"equiparar campos do financeiro com o DinheiroWeb"* — sem documento próprio |
| D6 | **Pessoas/RH** | `2026-07-08-pessoa-360-fase1` × `2026-08-26-rh-gestao-pessoas-recursos` | **Sobreposição real.** Os dois escrevem sobre a ficha da pessoa, ausências e capacidade. O de agosto trata o Pessoa 360 como dependência (F3), mas não absorve o backlog do de julho |
| D7 | **Visão Geral do projeto** | `visual_projetos/Redesign_Visão_Projetos` × onda **P4** de `projetos-planejamento-auditoria` | Mesmo alvo, dois documentos, nenhum executado |
| D8 | **UX/melhorias** | `MELHORIAS_SENAHUB` → `specs/melhorias-roadmap-design` → planos M0/M1 × `CONSELHO1.md` | Cadeia legítima, mas `CONSELHO1` reabre itens de UX já classificados no roadmap, sem cruzar com ele |
| D9 | **Coordenação/apontamentos** | `ANALISE_APONTAMENTOS` (pins em PDF 2D) × `compatibilizacao-ferramentas` (BIM 3D) | Adjacentes; o item 36 (exportar `Pendencia` em BCF) fica exatamente na fronteira e sua resposta foi "só exportar" |

---

## 5. Leitura de gerente de projeto

O repositório entrega muito e **fecha mal**: quase toda frente termina em "falta verificação
manual no navegador". Isso é dívida de aceite, não de código — e é o que faz um plano parecer
aberto por meses. Três itens da fila curta (C3, erros visuais, chat) são **só** isso.

A maior frente parada não é nova, é a mais antiga: `projetos-planejamento-auditoria` (P0–P6,
zero ondas executadas). Custo real, receita/contrato e plano×execução são justamente os números
que um ERP de escritório de projetos precisa acertar — e `Redesign_Visão_Projetos` está esperando
a mesma onda P4.
