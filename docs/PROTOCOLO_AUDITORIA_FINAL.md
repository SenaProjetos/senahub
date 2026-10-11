# PROMPT PADRÃO — AUDITORIA FINAL DE ETAPA

## Dimensionamento da auditoria conforme o risco

Antes de iniciar a auditoria, classifique a alteração realizada conforme seu escopo, complexidade e risco.

Escolha automaticamente a profundidade adequada:

**Nível 1 — Alteração simples**
Para ajustes de texto, estilos, espaçamento, pequenos refinamentos visuais ou correções triviais sem impacto na lógica de negócio.
- Inspecione o diff completo.
- Confirme que o ajuste foi aplicado corretamente.
- Verifique responsividade e interações diretamente afetadas, quando aplicável.
- Execute as verificações rápidas pertinentes.
- Confira se não houve efeitos colaterais evidentes.

**Nível 2 — Bugfix ou alteração localizada**
Para correções de comportamento, validações, formulários, componentes, funções ou regras de baixa abrangência.
- Execute os testes relacionados à correção.
- Reproduza o cenário que apresentava o defeito, quando possível.
- Teste o cenário corrigido, casos de borda relevantes e comportamentos adjacentes.
- Verifique regressões nos fluxos diretamente afetados.
- Execute as verificações estáticas pertinentes.

**Nível 3 — Alteração funcional ou integração**
Para mudanças em regras de negócio, cálculos, APIs, persistência, permissões, contratos entre módulos ou fluxos compartilhados.
- Aplique integralmente as verificações pertinentes das seções de implementação, testes, casos de borda, integração, regressão e persistência.
- Teste os fluxos de ponta a ponta afetados.
- Avalie os impactos indiretos sobre outros módulos.

**Nível 4 — Etapa completa ou alteração de alto risco**
Para funcionalidades novas abrangentes, alterações arquiteturais, migrações, mudanças financeiras críticas ou modificações com potencial de afetar vários módulos.
- Execute a auditoria completa definida neste protocolo.
- Verifique os critérios de aceitação individualmente.
- Avalie integrações, regressões, segurança e persistência conforme aplicável.
- Apresente o relatório completo de encerramento.

### Regras de dimensionamento

1. Escolha o nível com base no impacto real da alteração, não apenas na quantidade de arquivos modificados.
2. Uma alteração pequena em código compartilhado, permissões, cálculos financeiros ou persistência pode exigir auditoria de nível superior.
3. Não execute testes irrelevantes apenas para cumprir uma lista genérica. Selecione os testes pertinentes ao risco identificado.
4. Não omita verificações essenciais por classificar a alteração como simples.
5. Se durante a auditoria descobrir impactos maiores do que os inicialmente previstos, eleve o nível de verificação.
6. Em todos os níveis, inspecione o diff, execute as verificações pertinentes, corrija defeitos encontrados dentro do escopo e informe os resultados reais.
7. A profundidade do relatório pode variar conforme o nível, mas nunca esconda falhas, testes não executados ou limitações relevantes.

## 1. Objetivo

Faça uma auditoria técnica completa da etapa que acabou de ser implementada neste projeto.

Sua missão é verificar se **tudo o que foi solicitado para esta etapa foi realmente concluído, implementado corretamente, testado e integrado ao restante do sistema**.

Não considere a tarefa concluída apenas porque o código foi escrito, a tela funciona visualmente ou os testes existentes passaram.

Atue como um revisor técnico rigoroso, procurando deliberadamente falhas, requisitos esquecidos, comportamentos incorretos, regressões, casos de borda e problemas de integração.

**Não presuma que sua implementação está correta. Verifique-a.**

## 2. Reconstrua o escopo da etapa

Antes de executar os testes:

1. Identifique qual etapa ou funcionalidade acabou de ser implementada.
2. Consulte o plano de implementação, os requisitos originais, as decisões registradas, os critérios de aceitação e as tarefas relacionadas disponíveis no projeto e no contexto da conversa.
3. Compare o escopo planejado com o código efetivamente implementado.
4. Identifique requisitos explícitos, requisitos implícitos necessários ao funcionamento correto e dependências com funcionalidades existentes.
5. Verifique se existem itens pendentes, decisões não implementadas, funcionalidades parcialmente concluídas ou simplificações que não foram autorizadas.

Não invente requisitos. Diferencie claramente:
- Requisitos obrigatórios definidos no escopo.
- Comportamentos necessários para garantir consistência e segurança.
- Melhorias desejáveis que não fazem parte da etapa atual.

Se não conseguir localizar o escopo original completo, informe essa limitação e utilize as evidências disponíveis. Não declare conformidade integral com requisitos que não conseguiu verificar.

## 3. Auditoria de implementação

Inspecione o código relevante, não apenas os arquivos criados ou modificados recentemente.

Verifique:

- Se todos os requisitos foram implementados.
- Se existem funções, componentes, rotas, serviços ou operações incompletas.
- Se há código provisório, mocks, dados fictícios, TODOs, stubs ou comportamentos simulados que deveriam ser definitivos.
- Se há lógica duplicada, condições contraditórias, tratamento de erros ausente ou estados impossíveis.
- Se as validações estão implementadas também no servidor quando necessário, e não apenas na interface.
- Se os tipos, contratos, interfaces e estruturas de dados estão consistentes.
- Se as mensagens de erro são adequadas e os erros não são silenciosamente ignorados.
- Se há problemas de concorrência, operações duplicadas, inconsistência de estado ou perda de dados.
- Se as permissões, autenticação, autorização e isolamento entre usuários ou registros são respeitados, quando aplicáveis.
- Se a implementação segue os padrões arquiteturais e as convenções existentes no projeto.

Não faça alterações cosméticas ou refatorações amplas sem necessidade. Priorize a correção e a conclusão da etapa auditada.

## 4. Auditoria dos testes

Descubra quais ferramentas, scripts e suítes de teste o projeto realmente utiliza. Consulte o package.json, a configuração de testes e a documentação pertinente antes de escolher os comandos.

Execute os testes relevantes, incluindo, conforme aplicável:

- Testes unitários.
- Testes de integração.
- Testes de componentes e interface.
- Testes de API e rotas.
- Testes de banco de dados e persistência.
- Testes end-to-end.
- Testes de build, compilação e verificação de tipos.
- Lint e verificações estáticas.
- Testes de autorização, permissões e segurança.

Não se limite aos testes já existentes. Verifique se eles cobrem os requisitos e os principais riscos da etapa.

Se houver lacunas importantes, crie ou complemente testes automatizados apropriados, respeitando os padrões do projeto.

Não altere testes apenas para fazê-los passar. Se algum teste estiver incorreto, explique o problema e justifique qualquer correção.

Não desative verificações, não reduza critérios de validação e não esconda falhas para produzir um resultado aparentemente positivo.

Quando um teste falhar:
1. Identifique a causa.
2. Determine se o problema está na implementação, no próprio teste, no ambiente ou em uma dependência externa.
3. Corrija os problemas que pertencem ao escopo da etapa.
4. Execute novamente os testes afetados e as verificações de regressão pertinentes.

Se algum teste não puder ser executado, registre exatamente o motivo. Não o marque como aprovado.

## 5. Análise de casos de borda

Identifique os casos de borda específicos da funcionalidade e teste os que forem relevantes.

Considere, conforme aplicável:

- Campos vazios, nulos, ausentes ou com valores inválidos.
- Valores mínimos, máximos, limites inclusivos e exclusivos.
- Valores negativos, zero, decimais, arredondamentos e grandes volumes.
- Registros duplicados ou inexistentes.
- Operações repetidas ou executadas fora da ordem esperada.
- Alterações e exclusões de registros relacionados.
- Falhas de rede, timeout, indisponibilidade de serviços e respostas inesperadas.
- Falhas durante gravação, atualização, exclusão ou transações.
- Usuários sem permissão e sessões expiradas.
- Estados intermediários, carregamento, ausência de dados e erros de processamento.
- Paginação, filtros, ordenação e pesquisa sem resultados.
- Datas, fusos horários, virada de mês e ano, quando pertinentes.
- Recarregamento da página, navegação para trás e para frente e atualização do navegador.
- Duplo clique, envio repetido e concorrência entre operações.
- Grandes quantidades de registros e entradas muito extensas.
- Recuperação após uma falha parcial.

Não aplique uma lista genérica indiscriminadamente. Selecione os cenários pertinentes à funcionalidade e acrescente os casos específicos do domínio do projeto.

## 6. Auditoria de interações com outros módulos

Mapeie as dependências da funcionalidade auditada e verifique se as interações entre módulos continuam corretas.

Inspecione, quando aplicável:

- Chamadas entre módulos, serviços, componentes e APIs.
- Contratos de entrada e saída.
- Dependências compartilhadas e alterações em interfaces.
- Modelos, entidades, relacionamentos e restrições do banco de dados.
- Criação, edição e exclusão de registros relacionados.
- Atualização de dados derivados, totais, indicadores, relatórios e dashboards.
- Reflexos em filtros, pesquisas, notificações, permissões e histórico.
- Fluxos que começam em outro módulo e terminam na funcionalidade auditada, ou vice-versa.
- Consistência de transações e integridade referencial.
- Efeitos colaterais inesperados em funcionalidades que já existiam.

Não conclua que a integração funciona apenas porque a aplicação compila.

Identifique os fluxos críticos de ponta a ponta e execute testes que comprovem seu funcionamento.

Se uma alteração afetar outro módulo, avalie e teste também esse módulo. Não amplie o escopo para refatorar funcionalidades independentes sem necessidade.

## 7. Auditoria de regressão

Verifique se a nova implementação prejudicou funcionalidades existentes.

1. Examine o diff completo das alterações da etapa.
2. Identifique os módulos e fluxos potencialmente afetados.
3. Execute os testes de regressão pertinentes.
4. Verifique alterações em contratos, componentes compartilhados, rotas, estilos globais, modelos, migrações e configurações.
5. Confira se funcionalidades anteriormente existentes continuam operando corretamente.
6. Verifique se arquivos ou alterações de outras tarefas foram modificados acidentalmente.

Não reverta, sobrescreva ou descarte alterações preexistentes do usuário. Não execute comandos destrutivos no Git nem faça reset, checkout ou limpeza indiscriminada de arquivos.

## 8. Persistência, migrações e dados

Quando a etapa envolver persistência de dados, verifique adicionalmente:

- Se as operações de criação, leitura, atualização e exclusão funcionam corretamente.
- Se os dados permanecem consistentes após recarregar a aplicação.
- Se as migrações são completas, reproduzíveis e compatíveis com a estrutura existente.
- Se os relacionamentos, índices, restrições e valores padrão estão corretos.
- Se registros antigos continuam compatíveis com as alterações.
- Se existem riscos de perda, duplicação ou corrupção de dados.
- Se operações parciais deixam o sistema em estado inconsistente.
- Se cálculos financeiros ou quantitativos utilizam precisão e regras de arredondamento adequadas, quando aplicável.
- Se backups, importações, exportações e integrações continuam compatíveis, quando pertinentes.

Não execute migrações destrutivas, exclusões reais ou testes que possam corromper dados de produção. Utilize um ambiente de teste apropriado e dados controlados.

## 9. Auditoria de interface e experiência de uso

Quando houver interface gráfica, teste o comportamento real da funcionalidade.

Verifique:

- Se todos os botões, links, formulários, menus, filtros e ações funcionam.
- Se os estados de carregamento, sucesso, erro e ausência de dados estão corretos.
- Se as validações e mensagens orientam o usuário adequadamente.
- Se ações que alteram dados apresentam o feedback esperado.
- Se a interface reflete corretamente as alterações persistidas.
- Se navegação, permissões, responsividade e acessibilidade básica estão adequadas.
- Se existem controles sem ação, dados fictícios ou interações que aparentam funcionar, mas não executam a operação real.

Sempre que houver infraestrutura de testes de navegador, utilize-a para validar os fluxos críticos. Não afirme que testou visualmente uma tela se não a abriu ou não verificou seu comportamento.

## 10. Correção dos problemas encontrados

A auditoria não deve ser apenas um relatório de problemas.

Para cada falha encontrada:

1. Avalie sua gravidade e sua relação com a etapa.
2. Corrija os defeitos que pertencem ao escopo e que possam ser resolvidos com segurança.
3. Adicione ou ajuste testes para evitar a reincidência.
4. Execute novamente os testes pertinentes.
5. Verifique se a correção não introduziu novas regressões.

Classifique os problemas como:
- **Crítico:** risco de perda ou corrupção de dados, violação de segurança ou indisponibilidade grave.
- **Alto:** requisito obrigatório não atendido, fluxo principal quebrado ou integração essencial incorreta.
- **Médio:** comportamento relevante incorreto, caso de borda importante sem tratamento ou regressão limitada.
- **Baixo:** problema de menor impacto que não compromete o fluxo principal.
- **Melhoria:** aprimoramento desejável fora dos critérios obrigatórios de conclusão.

Não esconda falhas conhecidas. Se uma correção exigir decisão de negócio, credenciais, serviço externo, mudança de arquitetura ou autorização que você não possui, documente o bloqueio em vez de improvisar.

## 11. Verificações finais

Antes de concluir:

- Execute novamente a suíte de testes relevante após as correções.
- Execute build, verificação de tipos e lint, quando disponíveis e aplicáveis.
- Confirme que os testes não dependem acidentalmente de dados locais, ordem de execução ou estado residual.
- Examine o diff final e confirme que todas as alterações são intencionais.
- Verifique se não foram introduzidos arquivos temporários, segredos, credenciais ou configurações locais indevidas.
- Atualize a documentação e os registros da etapa quando necessário.
- Confira se os critérios de aceitação foram atendidos individualmente.
- Liste os testes não executados e as limitações que ainda impedem uma conclusão definitiva.

Não declare que tudo passou se algum comando falhou ou não foi executado.

## 12. Relatório obrigatório de encerramento

Ao terminar, apresente um relatório objetivo com as seguintes seções:

### A. Resultado geral
Informe um dos seguintes estados:

- **APROVADA:** requisitos atendidos e verificações pertinentes aprovadas, sem pendências impeditivas.
- **APROVADA COM RESSALVAS:** requisitos obrigatórios atendidos, mas existem limitações ou pendências não impeditivas claramente documentadas.
- **REPROVADA:** existe requisito obrigatório não atendido, defeito relevante ou falha impeditiva.
- **INCONCLUSIVA:** não foi possível obter evidências suficientes para confirmar a conclusão, por exemplo, devido a ambiente indisponível ou testes essenciais não executados.

### B. Matriz de requisitos

Para cada requisito da etapa, informe:
- Requisito.
- Evidência da implementação.
- Teste ou verificação realizada.
- Resultado: aprovado, reprovado ou não verificado.

### C. Testes executados

Liste:
- Comando ou procedimento executado.
- Resultado obtido.
- Quantidade de testes aprovados, reprovados e ignorados, quando disponível.
- Falhas encontradas e como foram tratadas.

Diferencie testes automatizados, testes manuais e verificações estáticas.

### D. Casos de borda

Liste os cenários críticos avaliados, os resultados e os cenários relevantes que permaneceram sem verificação.

### E. Integrações e regressões

Informe quais módulos, fluxos e contratos foram inspecionados, quais testes foram executados e quais riscos permanecem.

### F. Correções realizadas

Descreva os defeitos encontrados, as correções aplicadas e os testes que comprovam as correções.

### G. Pendências e riscos

Liste cada pendência com:
- Descrição.
- Gravidade.
- Impacto.
- Motivo de não resolução.
- Próxima ação necessária.

Se não houver pendências identificadas, declare isso explicitamente, sem confundir ausência de problemas encontrados com prova absoluta de ausência de problemas.

### H. Alterações finais

Resuma os arquivos e componentes alterados durante a auditoria. Destaque qualquer alteração que ultrapasse o escopo original e justifique sua necessidade.

Não faça commit, push, deploy ou publicação sem solicitação expressa.

### I. Veredito final

Responda objetivamente:

1. Tudo o que foi solicitado para esta etapa foi implementado?
2. Os requisitos foram verificados individualmente?
3. Os testes pertinentes foram executados e passaram?
4. Os casos de borda relevantes foram avaliados?
5. As integrações com outros módulos foram verificadas?
6. Há regressões, pendências ou riscos conhecidos?
7. É seguro considerar a etapa encerrada?

Para cada resposta, apresente evidências ou identifique claramente a limitação.

## 13. Aplicação neste projeto (SenaHub)

Esta seção adapta o protocolo ao SenaHub. Em caso de conflito com as seções anteriores, ela prevalece, e o `CLAUDE.md` prevalece sobre ela.

Vale para os dois worktrees. Porta, branch e banco são os do worktree em que o agente está, conforme a tabela "Parallel worktrees" do `CLAUDE.md`: VS Code = porta 3001 e banco `senahub_remake_vscode`; Antigravity = porta 3000 e banco `senahub_remake`. Nunca usar a porta, o banco ou a pasta do outro worktree.

**Quando aplicar.** Ao final de toda tarefa que alterou código, schema, migração, script ou configuração. Não se aplica a perguntas, pesquisas ou alterações só de memória. Alteração só de documentação é Nível 1.

**Onde está o escopo (seção 2).** Plano e spec da tarefa em `docs/superpowers/specs/` e `docs/superpowers/plans/`, decisões em `docs/adr/` e `CONTEXT.md`, estado geral em `docs/HANDOFF.md`, além do que foi combinado na conversa.

**Comandos reais (seção 4).**
- Testes: `npm test` (inclui os testes-guarda que varrem `src/`: natureza nas consultas, campos formatados, menu de contexto, `Promise.all` em transação, `confirm` dentro de `startTransition`, pureza da liquidez). Arquivo único: `npx vitest run <arquivo>`. Nível 3 ou 4 roda a suíte inteira.
- Lint: `npm run lint`, **sem** `--quiet` (aviso de variável sem uso já denunciou UI faltando).
- Tipos do servidor: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc -p tsconfig.server.json --noEmit`.
- Build: `npm run build`, **só** se não houver `next dev` ativo nesta pasta (build com dev ativo corrompe `.next`). Se houver, registrar como não executado.
- Smokes: `npm run smoke:<nome>` do módulo afetado, sempre no banco de dev deste worktree (servidor da porta 5433). Nunca a porta 5432, o banco do outro worktree ou produção.

**Riscos que nenhum comando pega.** Conferir à mão:
- Export que não é função em arquivo `"use server"` (quebra só em runtime).
- Módulo "puro" usado no cliente que importa `node:` por tabela (só o webpack do `dev:server` acusa): seguir os imports até o fim.
- Toda mutação por `defineAction`, com recurso/permissão, schema Zod e `capturarAntes` dentro da config; escopo de dados com `acessoGlobal`, nunca nome de papel.
- Financeiro: centavos, datas de São Paulo (`lib/data.ts`), filtros `SO_RESULTADO`/`SEM_TRANSFERENCIA`, máquina de estados e `updateMany` condicionado ao estado lido.

**Revisores automáticos (níveis 3 e 4).** Com autorização permanente do dono, o agente aciona os subagentes revisores que correspondem às áreas do diff, em paralelo, e trata cada achado como os demais (verifica, corrige o que é do escopo, registra o resto):
- `src/modules/**/actions.ts` ou `service.ts`: `action-guardian`.
- `prisma/`: `prisma-migration-reviewer`.
- `src/components` ou `src/app`: `client-boundary-auditor`, `ui-state-linter`, `design-system-guardian`, `a11y-auditor` e `i18n-convention-reviewer`.
- Upload, arquivos, inputs, portal ou `lib/storage.ts`: `upload-storage-auditor`.
- `lib/socket.ts`, `lib/jobs*.ts`, `server.ts`, `scripts/converter-*.ts` ou `modules/chat`: `realtime-jobs-auditor`.
- Nível 4: também `test-coverage-scout` sobre os arquivos da etapa.

Os níveis 1 e 2 não acionam revisores.

**Interface (seção 9). Critério de pronto: em 390×844, `document.documentElement.scrollWidth` igual a 390; em 1366×768 com o menu aberto, o cabeçalho não sobrepõe a barra do topo; toda ação do menu de contexto também está no `...`.

A verificação em tela é do agente, com autorização permanente do dono:
- Servidor: `npm run dev -- -p <porta do worktree>` para telas; `npm run dev:server` quando a tarefa envolve chat, realtime ou jobs. Se já houver um servidor desta pasta na porta do worktree, o agente pode encerrá-lo. Nunca encerrar a porta do outro worktree nem processo de produção. Build e dev nunca ao mesmo tempo nesta pasta: rodar o build antes de subir o servidor, ou encerrar o servidor antes do build.
- Acesso: usuário de teste do banco deste worktree (no VS Code, `claude.admin@dev.senahub`) ou usuário de demo do perfil que a tarefa afeta (senha `Demo@2026`). Login pela API de dentro da página (`fetch('/api/auth/sign-in/email')`): digitar no formulário antes da hidratação falha. Navegador por puppeteer com `CHROME_PATH`; esperar a hidratação e a resposta da Server Action, nunca tempo fixo. Esconder o botão do Next (`nextjs-portal { display: none }`) nas capturas.
- Prints obrigatórios em `prints-auditoria/AAAA-MM-DD_HHMM_<tarefa>/` na raiz do worktree (pasta ignorada pelo git), nomeados `NN-<tela>-<largura>x<altura>[-<estado>].png`: cada tela afetada em 1366×768 com o menu aberto e em 390×844, mais os estados que a tarefa mudou (vazio, erro, menu de contexto aberto, depois da ação).
- Junto dos prints, um `LEIAME.md` com a tarefa, a branch e o commit, o usuário usado e, para cada print: tela, viewport, o que conferir, o `scrollWidth` medido e o resultado. O relatório final aponta essa pasta.
- Ao terminar, encerrar o servidor que o agente subiu.

Só vira "não verificada em tela" o que não pôde ser aberto (por exemplo, fluxo que depende de serviço externo), com o motivo e o roteiro para o dono conferir.

**Commit e publicação (seção 12.H).** Em trabalho faseado com plano aprovado, o commit da fase já está autorizado (arquivos específicos, nunca `git add -A`; conferir com `git show --stat`). Push, merge, deploy e qualquer passo em produção exigem ordem expressa.

**Tamanho do relatório (seção 12).** Níveis 1 e 2: relatório curto com resultado geral (A), testes executados (C), pendências (G) e veredito (I) resumido. Níveis 3 e 4: relatório completo de A a I. O relatório é sempre em português.

## Regra final

**Não confunda implementação com conclusão.**

A etapa só pode ser considerada encerrada quando houver evidências suficientes de que os requisitos foram atendidos e as verificações pertinentes foram aprovadas.

Se encontrar problemas corrigíveis, corrija-os e repita as verificações. Se encontrar impedimentos, não declare a etapa concluída.

Comece agora pela identificação do escopo da etapa recém-implementada e prossiga com a auditoria completa. Não interrompa o trabalho apenas para apresentar um plano: execute as verificações, corrija os problemas do escopo e entregue o relatório final com evidências.
