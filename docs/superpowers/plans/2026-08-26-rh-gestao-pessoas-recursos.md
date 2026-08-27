# Gestão de Pessoas e Recursos — integração das capacidades existentes

**Data:** 2026-08-26 · **Status:** em execução — base da F0 e faixas da F1 entregues em 2026-08-27; demais itens seguem planejados · **Branch alvo:** `dev`

## 1. Contexto e inventário verificado

O SenaHub já possui uma base de RH e gestão de recursos que deve ser **integrada e evoluída**, não substituída. O diagnóstico abaixo foi feito contra o código e o schema atuais.

| Domínio | Já existe | Fonte principal | Lacuna que importa agora |
|---|---|---|---|
| Ponto e horas | Batidas, espelho, ajustes, banco de horas, lembretes, sessões por projeto e categorias `sem projeto`, reunião interna e externa | `SessaoTrabalho` e `TipoAlocacaoPonto` em `prisma/schema.prisma:1982` e `:2044`; jobs em `src/lib/jobs.ts:205` | A mesma regra de intervalo não é compartilhada entre todos os relatórios; horas que cruzam meia-noite e capacidade esperada não são tratadas de modo uniforme. |
| Produtividade | Indicadores por semana/mês e gráfico diário comparativo de até três projetistas | `src/modules/rh/produtividade/queries.ts:98` e `:207`; `/rh/produtividade` | Mostra realizado, mas não o confronta com disponibilidade, alocação planejada ou ausência. Não deve virar ranking de pessoas. |
| Recursos | Matriz pessoa × projeto, alocação por período, alerta de superalocação, heatmap futuro, sugestão de rebalanceamento e carga real semanal | `Recurso`/`Alocacao` em `prisma/schema.prisma:3634` e `:3652`; `matrizRecursos()` em `src/modules/planejamento/queries.ts:267` | A disponibilidade é descontada apenas no dia atual; a janela futura ignora férias/abonos. Uma alocação por pessoa/projeto é limitada pelo `@@unique([recursoId, projetoId])`. |
| Competências | Catálogo de habilidades e vínculo pessoa × habilidade; filtro na matriz de recursos | `Habilidade`/`UserHabilidade` em `prisma/schema.prisma:4775` e `:4785`; `src/modules/rh/habilidades/` | É uma etiqueta binária: não há nível, evidência, validade, necessidade do projeto ou busca de substituto apto. |
| Pessoa 360 e estrutura | Ficha única, cadastro, vínculo datado, cargo, departamento, histórico contratual, documentos, escalas, folha e permissões | `User` em `prisma/schema.prisma:62`; `Vinculo` em `:303`; `/rh/pessoas/[id]` | Não existe relação de liderança direta nem uma linha do tempo única de desenvolvimento. |
| Ausências | Férias, abonos, aprovação, dupla confirmação de alteração de férias, direito aquisitivo e avisos | `Ferias`/`AbonoFalta` em `prisma/schema.prisma:2258` e `:2279`; `rotinasRhDiarias()` em `src/lib/jobs-handlers.ts:426` | A aprovação não abre uma análise de impacto na carteira de projetos nem sugere rebalanceamento antes de alterar o plano. |
| Onboarding | Templates, processos, itens e abertura opcional no cadastro da pessoa | `OnboardingProcesso` em `prisma/schema.prisma:4886`; `criarOnboarding` em `src/modules/rh/onboarding/actions.ts:16` | Checklist não possui dono, prazo, evidência, estado de conclusão ou ciclo de desligamento; `userId` único impede preservar recontratações. |
| Feedback, 1:1 e clima | Humor diário, canal de feedback anônimo e registros de feedback/1:1/reconhecimento/alerta | `RegistroEmocao`/`FeedbackHumor` em `prisma/schema.prisma:2308` e `:2325`; `FeedbackRH` em `:4957` | Não há cadência, metas de desenvolvimento, responsáveis, confidencialidade por audiência ou integração com a ficha 360. |
| Ativos e TI | Ativos e máquinas podem ter responsável | `Ativo` e `MaquinaTI` em `prisma/schema.prisma:6002` e `:6025` | Não participam do onboarding/desligamento; a conferência é manual e dispersa. |

### Achados que orientam o plano

1. A matriz de recursos já usa férias, abonos e feriado para zerar a capacidade **de hoje** (`src/modules/planejamento/queries.ts:291-318`). A primeira entrega deve ampliar essa mesma regra para qualquer data da janela, e não criar um segundo calendário de ausência.
2. `Vinculo.cargaSemanal`, as escalas e `Recurso.capacidade` já contêm os dados para capacidade contratada e fator de disponibilidade. O cálculo deve reaproveitá-los; não criar uma capacidade paralela em RH.
3. `Alocacao` suporta apenas uma faixa por pessoa/projeto porque o salvamento é um `upsert` pelo par (`src/modules/planejamento/actions.ts:399-457`). Isto bloqueia uma carteira com fases, pausas ou retorno ao mesmo projeto.
4. As métricas existentes usam dados objetivos (horas, entregas, tarefas e atrasos). O sistema deve manter esse princípio: produtividade serve para conversa e planejamento, nunca para pontuação automática de desempenho ou decisão trabalhista.
5. Dados de clima, feedback anônimo, saúde e folha têm sensibilidades diferentes. A agregação e o controle de audiência precisam vir antes de qualquer painel de “risco de pessoas”.

## 2. Problema a resolver

Hoje o escritório consegue registrar fatos importantes, mas ainda não os transforma em uma operação coordenada:

- Planejamento enxerga percentual alocado; RH conhece férias e vínculo; Ponto conhece horas reais. Não há uma visão diária/semanal única de **capacidade disponível × demanda planejada × realizado**.
- A busca por habilidade responde “quem declarou saber”, mas não “quem tem nível adequado, disponibilidade no período e experiência verificável”.
- Feedback e onboarding são registros isolados, não ciclos com responsável, prazo e acompanhamento na Pessoa 360.
- Uma ausência aprovada ou saída de pessoa não fecha o ciclo de impacto: projeto, equipamento, acesso, documentos e substituição continuam dependendo de conferência manual.

O objetivo é formar um sistema de gestão de pessoas centrado em decisões humanas e auditáveis: dar contexto para RH e coordenação, sugerir ações reversíveis e exigir confirmação para qualquer mudança que afete alocação, acesso ou vínculo.

## 3. Decisões de produto e arquitetura

### D1 — Uma fonte de cálculo de disponibilidade

Criar em `src/modules/planejamento/disponibilidade.ts` um motor puro, alimentado por adaptadores de query, que calcule por pessoa e dia:

```
capacidade disponível = jornada esperada da escala/vínculo
                         × multiplicador de Recurso
                         − indisponibilidades aprovadas
demanda planejada      = soma das alocações ativas
realizado              = minutos de SessaoTrabalho por categoria/projeto
```

Férias, abonos e feriados existentes são entradas desse motor. A tela `/recursos`, o plano versus real do projeto e os gráficos de RH consomem a mesma saída. O motor expõe também a origem do número (`escala`, `cargaSemanal`, `estimativa`) para não apresentar capacidade estimada como dado contratual.

**Alternativa rejeitada:** cada página calcular férias, escala e horas à sua maneira. Isso repetiria o desvio atual entre o “hoje” da matriz e a janela futura e produziria indicadores contraditórios.

### D2 — Alocação em faixas, com prevenção de conflito

Evoluir `Alocacao` para permitir várias faixas temporais para o mesmo recurso e projeto. Remover o `@@unique([recursoId, projetoId])`, adicionar índice de consulta por recurso/projeto/período e mover a verificação de conflito para um serviço puro de intervalo.

- Faixas existentes com início nulo conservam a semântica atual: alocação válida desde sempre até o fim informado.
- Criar uma faixa concorrente exige encerrar ou ajustar a faixa incompatível. A interface deve mostrar o conflito; nunca corrigir percentuais automaticamente.
- O limite é avaliado pela soma de todas as faixas ativas na data, comparada à capacidade disponível naquela data.

**Alternativa rejeitada:** criar uma tabela paralela de previsão e manter `Alocacao` como está. Isso duplicaria a fonte de planejamento e separaria a tela existente da nova previsão.

### D3 — Desenvolvimento separado de clima e de avaliação automática

Manter `RegistroEmocao` e `FeedbackHumor` como estão: humor só agregado e feedback anônimo sem tentar reidentificar o autor. Evoluir `FeedbackRH` para uma linha do tempo de gestão e criar objetivos de desenvolvimento e encontros 1:1 separados.

Não haverá nota, score de risco individual, ranking de projetistas ou inferência de saúde mental. Alertas usarão somente fatos explicáveis (por exemplo: sobrecarga planejada recorrente, 1:1 vencido ou documento obrigatório a vencer) e abrirão uma sugestão de conversa, não uma ação punitiva.

### D4 — Uma pessoa pode ter vários ciclos de entrada e saída

`OnboardingProcesso.userId @unique` deve virar histórico de ciclos. Um processo tem tipo (`onboarding` ou `offboarding`), estado, datas e itens com responsável/prazo. Recontratar alguém preserva o onboarding antigo e permite iniciar outro. O vínculo datado continua sendo a fonte de verdade para admissão/encerramento; o ciclo não “desliga” ninguém automaticamente.

### D5 — O sistema recomenda; o responsável confirma

As automações permitidas nesta iniciativa são: criar pendência, notificar, montar uma sugestão de rebalanceamento, abrir item de checklist e destacar impacto. Elas não podem alterar uma alocação, retirar acesso, encerrar vínculo, aprovar ausência ou baixar patrimônio sozinhas.

## 4. Delta de Prisma, migrations e seed

As migrations são entregues apenas na fase que usa o modelo. Todas devem ser criadas com a skill `nova-migracao`, revisadas com banco sombra e aplicadas sem reset.

| Fase | Alteração de dados | Migração / preservação |
|---|---|---|
| F1 | `Alocacao`: remover unicidade recurso/projeto, manter `id`, adicionar índice `[recursoId, projetoId, inicio]` | Migration remove somente o índice único. Linhas existentes permanecem válidas; o serviço interpreta início nulo como legado. |
| F2 | `UserHabilidade`: `nivel` (1–5), `validadoEm`, `validade`, `observacao`; requisitos por projeto/disciplina em novo modelo `NecessidadeHabilidade` | Campos novos nulos/default conservam vínculos atuais como “nível não informado”. Não inventar nível em backfill. |
| F3 | Novo `LiderancaPessoa` datado; `ObjetivoDesenvolvimento` e `EncontroUmAUm` | Sem converter `FeedbackRH`; registros antigos aparecem na linha do tempo como histórico não estruturado. |
| F4 | `OnboardingProcesso`: remover `@unique(userId)`, adicionar `tipo`, `status`, `iniciadoEm`, `concluidoEm`; itens ganham responsável lógico, prazo relativo e evidência opcional | Primeiro backfill marca processos existentes como `onboarding` e `em_andamento` ou `concluido`, de acordo com seus itens. A migration recebe índice por usuário/tipo/status. |
| F5 | `FuncionarioDocumento`: tipo controlado, `validadeEm` opcional e estado de conferência; sem armazenar conteúdo médico estruturado | Dados existentes continuam válidos e sem validade. RH preenche prazo somente quando o documento realmente vence. |

Seeds:

- habilidades iniciais devem vir apenas de um catálogo validado pela Engenharia/RH; não semear “níveis” nas pessoas;
- criar templates modelo de onboarding/offboarding apenas se o escritório aprovar seus donos e prazos;
- permissões novas de desenvolvimento e lifecycle entram no catálogo e no seed de perfis, sem conceder folha ou dados médicos por herança.

## 5. Entregas em ordem de execução

### F0 — Fundamento de medição e disponibilidade confiável

**Meta:** antes de criar novos painéis, fazer todas as leituras concordarem sobre horas e capacidade.

1. Extrair o cálculo puro de intervalos de trabalho para dividir corretamente uma sessão entre dias locais, inclusive sessão aberta e sessão que cruza meia-noite.
2. Alterar `horasDiariasProjetistas()` (`src/modules/rh/produtividade/queries.ts:207`), `cargaSemanalPorRecurso()` (`src/modules/planejamento/queries.ts:209`) e `planoVsRealProjeto()` (`src/modules/planejamento/queries.ts:150`) para consumir esse cálculo comum.
3. Criar o motor de disponibilidade diária, usando escala/`Vinculo.cargaSemanal`, `Recurso.capacidade`, feriados, férias e abonos já aprovados.
4. Corrigir o heatmap semanal: listar todas as semanas da janela e todos os recursos ativos, inclusive quem registrou zero horas, com capacidade esperada e motivo de indisponibilidade.
5. Na produtividade, incluir filtros de período, categoria de hora (projeto, sem projeto, reunião interna/externa) e sobreposição de capacidade/ausência. A comparação entre pessoas permanece limitada e contextualizada; a comparação de produção continua apenas contra a própria série histórica.

**Integrações reutilizadas:** `SessaoTrabalho`, `TipoAlocacaoPonto`, `EscalaContratacao`, `Vinculo`, `Ferias`, `AbonoFalta`, `Feriado`, `Recurso` e a página `/recursos`.

**Aceite verificável:** para uma pessoa em férias, outra com abono e outra disponível, a mesma semana apresenta capacidade zero/reduzida igual no painel de recursos, no plano versus real e no gráfico de horas; uma sessão 23:30–00:30 divide meia hora em cada dia.

### F1 — Carteira de capacidade e rebalanceamento por período

**Meta:** tornar a alocação atual útil para decisão futura, sem apagar o modelo que já funciona.

1. Executar a migration de faixas de `Alocacao` descrita na seção 4 e substituir o `upsert` de `salvarAlocacao` (`src/modules/planejamento/actions.ts:433`) por operações explícitas de criar, editar e encerrar faixa.
2. Implementar `sobreposicaoDeAlocacoes()` puro e testado. Ele deve bloquear faixas conflitantes do mesmo recurso/projeto e informar quais períodos/pessoas excedem a capacidade.
3. Trocar a detecção mensal simplificada por visão semanal de 13 semanas e mensal de 6 meses, descontando ausências aprovadas em toda a janela.
4. Reaproveitar o diálogo “Rebalancear” para exibir candidatos: pessoas com folga **no mesmo período** e, após F2, com habilidades compatíveis. A sugestão só preenche um rascunho de alteração.
5. Ao aprovar férias/abono futuro, gerar uma notificação de impacto para coordenação apenas se houver alocação conflitante; incluir link filtrado à janela de recursos e opções de revisão. Não alterar alocação automaticamente.

**Aceite verificável:** uma pessoa pode sair de um projeto e voltar em data posterior sem perder as faixas anteriores; férias em novembro reduzem a capacidade de novembro, não a de outubro; a sugestão nunca persiste mudança sem confirmação.

### F2 — Matriz de competências e cobertura de demanda

**Meta:** transformar “habilidades” em instrumento prático de alocação e desenvolvimento técnico.

1. Evoluir `UserHabilidade` sem perder os vínculos existentes: nível, data de validação, validade opcional e evidência/observação mínima.
2. Criar necessidades de habilidade por projeto e, quando aplicável, por disciplina/EAP. Elas indicam competência e nível mínimo, não uma pessoa obrigatória.
3. Na matriz `/recursos`, adicionar busca “cobrir necessidade”: disponibilidade da F1 + nível de habilidade + situação de validação. Mostrar claramente quando a sugestão se baseia em habilidade declarada ainda não validada.
4. Na Pessoa 360, exibir competências, vencimentos e lacunas de cobertura em aba não financeira. Na página do projeto, mostrar apenas a cobertura necessária para o trabalho daquele projeto.
5. Manter ações em `modules/rh/habilidades/` e queries server-only; o módulo Planejamento apenas consome uma interface de consulta, evitando escrever competências diretamente.

**Aceite verificável:** coordenador encontra duas pessoas aptas para uma necessidade e vê apenas as que têm folga no período; pessoa sem nível preenchido não é promovida silenciosamente a apta.

### F3 — Liderança, 1:1 e plano de desenvolvimento

**Meta:** estruturar desenvolvimento contínuo sem misturar dados confidenciais de RH com acompanhamento de projeto.

1. Criar relação de liderança datada. Um colaborador pode ter no máximo uma liderança direta ativa; o histórico de trocas é preservado.
2. Criar objetivos de desenvolvimento com resultado esperado, período, data-alvo, status e vínculo opcional a habilidade. Criar encontros 1:1 com pauta, decisões/ações, próximo encontro e visibilidade explícita.
3. Reutilizar `FeedbackRH` como histórico livre e permitir que reconhecimento, alerta e feedback apareçam na mesma linha do tempo, com rótulo e audiência corretos.
4. Adicionar aba **Desenvolvimento** à Pessoa 360, carregada sob demanda como a aba de ponto, para RH. Para liderança direta, criar uma visão limitada **Minha equipe**: ela entrega somente desenvolvimento dos liderados e não concede `rh:cadastro` nem acesso à ficha completa. A própria pessoa vê apenas objetivos e registros marcados como compartilhados.
5. Criar lembretes de cadência e itens de ação vencidos por job idempotente. A notificação não expõe conteúdo confidencial.

**Permissões:** acrescentar ações `rh:desenvolvimento` separadas de `rh:folha` e `rh:cadastro`; a visão de liderança é filtrada pela relação ativa em `LiderancaPessoa`, nunca por setor, cargo ou departamento.

**Aceite verificável:** uma liderança não acessa o 1:1 de quem não lidera; um objetivo ligado a habilidade atualiza a visualização de lacuna sem alterar o nível da pessoa; os registros antigos de feedback continuam legíveis.

### F4 — Lifecycle: onboarding, movimentação e offboarding

**Meta:** fazer o checklist acompanhar a pessoa durante o ciclo de vida e conectar RH, TI, patrimônio e acesso.

1. Executar a migration de processo descrita na seção 4 e criar templates com categoria, responsável lógico (RH, TI, liderança, pessoa), prazo relativo e evidência opcional.
2. No cadastro de pessoa, manter a abertura manual/confirmada de onboarding já existente; oferecer template sugerido por contratação/setor, sem disparar automaticamente sem revisão do RH.
3. Criar fluxo de offboarding iniciado a partir do encerramento de `Vinculo`, com checklist de transição de projetos, devolução de ativo/máquina, documentação, encerramento de acesso e comunicação. O término do vínculo continua sujeito ao processo trabalhista/DP.
4. Exibir na Pessoa 360 o ciclo ativo, itens bloqueados e histórico; integrar `/patrimonio` por referência de ativos sob responsabilidade, sem transferir ou dar baixa automaticamente.
5. Criar job de lembrete de itens vencidos e painel de pendências por responsável. A rotina é idempotente e usa categoria de notificação própria.

**Aceite verificável:** um colaborador recontratado mantém seu onboarding anterior concluído e recebe novo processo; um desligamento com máquina pendente aparece para TI, mas a máquina segue atribuída até a confirmação humana.

### F5 — Ausências, documentos e conformidade proativa

**Meta:** antecipar indisponibilidade e pendências de conformidade sem tratar informação médica como métrica de desempenho.

1. Disponibilizar calendário de ausências aprovado e futuras na Pessoa 360 e no painel de recursos, usando o motor da F0/F1.
2. Criar a análise de impacto da aprovação de férias/abono da F1, incluindo projetos, percentual planejado, período afetado e atalho ao rascunho de rebalanceamento.
3. Evoluir documentos de RH com validade e conferência quando necessário (por exemplo, ASO, registro profissional ou certificação). Não classificar diagnóstico, CID ou conteúdo de atestado.
4. Implementar alertas de prazo configuráveis, deduplicados e com destinatário mínimo: pessoa responsável e RH; coordenadores só recebem alerta se a validade bloquear responsabilidade técnica de projeto.
5. Reutilizar o cálculo aquisitivo de férias e a fila administrativa atual; não criar uma segunda fila de solicitações.

**Aceite verificável:** um documento sem validade não gera alerta; um documento vencendo é lembrado uma vez por faixa configurada; uma ausência aprovada dispara apenas para responsáveis afetados.

### F6 — Cockpit de pessoas e sinais responsáveis

**Meta:** consolidar decisão de RH e diretoria em indicadores explicáveis, sem vigilância excessiva.

1. Criar `/rh/gestao` como composição de dados existentes: headcount por vínculo/setor, capacidade versus demanda, vagas de habilidade, pendências de lifecycle, férias futuras, banco de horas e cadência de desenvolvimento.
2. Exibir clima somente de forma agregada com limiar mínimo de respostas definido pelo RH. Feedback anônimo continua sem ligação a pessoa, mesmo em auditoria.
3. Criar sinais objetivos de atenção: superalocação recorrente, alto volume de horas acima da escala, lacuna de cobertura em marco próximo, 1:1 vencido e onboarding bloqueado. Cada sinal mostra fonte, período e ação sugerida.
4. Não criar “risco de desligamento”, nota de humor individual ou score de desempenho. Acesso ao cockpit é separado de folha e de conteúdo de 1:1.

**Aceite verificável:** um gestor consegue explicar de onde veio cada alerta e navegar à fonte; com menos que o mínimo de respostas, clima não mostra recorte que permita inferir uma pessoa.

## 6. Ordem, dependências e critérios de corte

| Ordem | Entrega | Depende de | Valor entregue |
|---:|---|---|---|
| 1 | F0 | nada | Números coerentes de horas, capacidade e ausência. |
| 2 | F1 | F0 | Previsão de carteira e rebalanceamento seguro. |
| 3 | F2 | F1 | Alocação orientada por competência e disponibilidade. |
| 4 | F3 | Pessoa 360 e permissões atuais | Gestão de desenvolvimento com acesso correto. |
| 5 | F4 | Vínculo, patrimônio e permissões atuais | Entrada/saída controlada e rastreável. |
| 6 | F5 | F0/F1 e F4 parcial | Ausências e conformidade que geram ação contextual. |
| 7 | F6 | F0–F5 | Painel integrado sem criar score opaco. |

O corte recomendado para a primeira execução é **F0 + F1**. Ele melhora imediatamente a gestão de recursos e usa quase todos os dados já existentes, com o menor aumento de dados pessoais sensíveis. F2 e F3 podem seguir em paralelo depois que a regra de disponibilidade estiver estável. F4–F6 entram após validar os donos operacionais de cada checklist e alerta.

## 7. Segurança, permissões e privacidade

- Toda escrita usa `defineAction`, schema Zod, auditoria e `capturarAntes` para mudanças de faixa, liderança, objetivo, ciclo e documento.
- Dados de folha, conta bancária, atestado e conteúdo privado de 1:1 não entram em queries amplas de recursos ou produtividade. O `select` deve buscar o dado somente depois do gate, como a Pessoa 360 já faz.
- A liderança direta só cria escopo de acompanhamento; não concede acesso a folha, documentos médicos, feedback anônimo ou permissões administrativas.
- Notificações novas definem categoria em `lib/notificar.ts`, passam por `filtrarPorCategoria()` e têm tag determinística para deduplicação.
- Jobs devem ser idempotentes e rodar em `npm run dev:server`/produção, nunca depender apenas de `next dev`.

## 8. Testes e validação

### Testes unitários obrigatórios

- `disponibilidade.test.ts`: escala, carga semanal, capacidade parcial, feriado, férias, abono, faixa de datas e pessoa sem recurso.
- cálculo de intervalos: aberto, fechado, atravessando meia-noite, fuso local e sessão fora da janela.
- `alocacao-faixas.test.ts`: sobreposição, limites, encerramento, retorno ao projeto e preservação de faixa legada sem início.
- habilidades: nível mínimo, validade e candidato indisponível.
- liderança/desenvolvimento: escopo direto, audiência de registro compartilhado e cadência de 1:1.
- lifecycle: recontratação, processo ativo único por tipo, prazo relativo, item de ativo pendente e deduplicação de job.
- agregação de clima: limiar mínimo e nenhuma exposição de autor anônimo.

### Verificação integrada

1. Pessoa em férias com 80% de alocação: capacidade zero e alerta de impacto apenas na janela afetada.
2. Pessoa com faixa 50% até junho e 80% de setembro a dezembro: ambas aparecem no heatmap, sem apagar o histórico.
3. Projeto com necessidade de habilidade: candidatos só aparecem quando habilidade, nível, validade e folga satisfazem a regra.
4. Líder vê seu liderado, RH vê a linha do tempo autorizada e terceiro recebe “sem permissão” no servidor.
5. Entrada e saída: conferir item de máquina no patrimônio e permissão de acesso, sem automação destrutiva.
6. Rodar `npm run lint`, `npm test`, os testes focados de cada módulo e `npm run build` somente sem servidor de desenvolvimento usando a mesma `.next`.

## 9. Fora de escopo e decisões que exigem aprovação do dono

- Folha, rescisão, cálculo de verbas e obrigações legais completas não entram neste plano; o lifecycle apenas organiza pendências e não substitui DP/jurídico.
- Não integrar biometria, geolocalização adicional, vigilância de tela, capturas de atividade ou monitoramento invasivo.
- Não usar IA para decidir promoção, desligamento, remuneração ou para inferir estado emocional.
- Definir antes da F2 o catálogo oficial de competências e níveis; antes da F3 a política de confidencialidade de 1:1; antes da F4 os donos e SLAs de cada checklist; antes da F6 o limiar mínimo e a política de leitura de clima.
