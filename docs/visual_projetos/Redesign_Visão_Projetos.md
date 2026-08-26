# Redesign da tela “Visão Geral” de Projeto — SenaHub

## 1. Objetivo

Refatorar a tela de **detalhe/Visão Geral de um projeto do SenaHub**, utilizando como referência visual a proposta apresentada nos screenshots fornecidos.

A nova tela deve transformar a atual página de projeto em um **dashboard executivo e operacional**, oferecendo em uma única visão:

- situação geral do projeto;
- percentual de conclusão;
- prazo;
- área;
- entregas;
- pendências;
- indicadores críticos;
- cronograma resumido;
- situação das disciplinas;
- riscos relevantes;
- últimas atualizações.

O objetivo não é apenas “deixar mais bonito”.

A tela precisa permitir que um gestor responda rapidamente:

1. Como está o projeto?
2. Está atrasado?
3. Quanto já foi concluído?
4. Quais disciplinas estão causando problema?
5. Quais entregas estão atrasadas?
6. Existem revisões pendentes?
7. Existem aprovações aguardando cliente ou órgão externo?
8. Qual é o próximo prazo importante?
9. Quais riscos podem impactar o projeto?
10. O que mudou recentemente?

A nova interface deve possuir **alta densidade informacional, boa hierarquia visual e pouca necessidade de rolagem**.

---

# 2. REGRA FUNDAMENTAL: ANALISAR O SISTEMA EXISTENTE ANTES DE ALTERAR

Antes de implementar qualquer alteração:

1. localizar os componentes responsáveis pela página atual do projeto;
2. identificar a rota utilizada;
3. identificar componentes filhos;
4. identificar hooks, services, queries e APIs utilizadas;
5. identificar os modelos/types/interfaces relacionados ao projeto;
6. identificar como são calculados atualmente:
   - progresso;
   - prazo;
   - disciplinas;
   - entregas;
   - revisões;
   - aprovações;
   - responsáveis;
   - arquivos;
   - tarefas;
   - apontamentos;
   - diário;
   - custos;
   - status;
7. verificar permissões e visibilidade de informações;
8. verificar se existem componentes reutilizáveis no design system do SenaHub;
9. verificar quais informações da nova interface já existem no banco;
10. identificar quais indicadores ainda não possuem fonte de dados confiável.

**Não assumir a existência de nenhum campo, tabela, endpoint ou regra de negócio.**

Sempre confirmar no código.

Quando um indicador desejado não puder ser calculado com os dados existentes:

- não inventar valores;
- não inserir números mockados em produção;
- não criar regras arbitrárias;
- registrar claramente a ausência da informação;
- utilizar estado vazio apropriado;
- sugerir separadamente a estrutura necessária para suportá-lo.

---

# 3. ESCOPO DA ALTERAÇÃO

A prioridade desta implementação é a **área interna da página de projeto**.

Manter, salvo necessidade técnica comprovada:

- sidebar global atual do SenaHub;
- topbar global;
- identidade visual global;
- estrutura geral de navegação;
- permissões existentes.

A sidebar azul presente no mockup de referência **não precisa ser reproduzida nesta etapa**.

O objetivo é incorporar à interface atual do SenaHub:

- arquitetura da informação;
- cards;
- indicadores;
- cronograma;
- tabela de disciplinas;
- riscos;
- hierarquia visual;

presentes na nova proposta.

Não realizar uma reformulação global da aplicação sem necessidade.

---

# 4. CABEÇALHO DO PROJETO

Refatorar a região superior da página.

## Estrutura sugerida

### Linha 1

Breadcrumb:

`Início > Projetos > Detalhe`

### Linha 2

Exibir:

**Código do projeto**

seguido de:

**Nome do projeto**

Exemplo:

`260029 HOTEL MARMARES - TAMANDARÉ`

Ao lado do nome poderão existir badges como:

- Particular
- Público
- Em andamento
- Aguardando
- Em revisão
- Entregue
- Concluído
- Suspenso

Usar exclusivamente status que existam efetivamente no sistema.

### Linha 3

Exibir cliente/contratante.

Exemplo:

`RBarros Engenharia e Incorporação LTDA`

---

# 5. AÇÕES PRINCIPAIS

Manter as ações relevantes atualmente existentes.

Por exemplo:

- Chat
- Editar
- Duplicar
- Gerar documento
- outras ações

Entretanto, organizar essas ações visualmente.

Sugestão:

### ações primárias

- Chat
- Editar
- Gerar relatório/documento

### ações secundárias

Agrupar ações menos frequentes em menu:

`...`

Evitar excesso de botões competindo visualmente com os dados do projeto.

Antes de modificar qualquer botão, verificar:

- função atual;
- permissão;
- handler;
- dependências;
- fluxo.

---

# 6. ABAS DO PROJETO

Manter a navegação horizontal existente por abas.

Atualmente existem itens semelhantes a:

- Visão Geral
- Inputs
- Financeiro
- Lista Mestre
- Serviços
- Arquivos
- ARTs
- Compatibilização
- Custos
- Diário
- Extras
- Histórico

Não remover módulos existentes.

Melhorar apenas:

- espaçamento;
- hierarquia;
- estado ativo;
- overflow;
- responsividade.

A aba ativa deve ser evidente através de:

- texto mais forte;
- linha inferior azul;
- contraste adequado.

Não exibir textos como:

`(vazio)`

diretamente no nome das abas.

Se necessário, utilizar:

- badge discreto;
- tooltip;
- estado vazio ao abrir a seção.

---

# 7. PRIMEIRA LINHA — CARDS EXECUTIVOS

Criar uma linha de cards compactos logo no início da Visão Geral.

A referência possui aproximadamente seis cards.

## 7.1 Progresso geral

Card com:

### título

`PROGRESSO GERAL`

### elemento principal

Gráfico circular/donut.

Exemplo:

`68%`

Texto:

`Conclusão do projeto`

Opcionalmente apresentar tendência:

`▲ 12% vs. mês anterior`

Somente calcular tendência se existir histórico confiável.

Caso contrário, não exibir.

### comportamento

O percentual deve utilizar a regra oficial já adotada pelo SenaHub.

Não alterar o cálculo sem identificar sua origem.

---

# 7.2 Prazo final

Título:

`PRAZO FINAL`

Informações:

- data final;
- dias restantes;
- indicador visual de consumo do prazo.

Exemplo:

`21/07/2026`

`233 dias restantes`

Abaixo:

barra horizontal indicando prazo utilizado.

Adicionar ação discreta:

`Ver linha do tempo`

### Estados

Prazo confortável → neutro/azul.

Próximo do vencimento → amarelo/laranja.

Vencido → vermelho.

Não utilizar apenas cor para transmitir o estado.

---

# 7.3 Área total

Título:

`ÁREA TOTAL`

Valor principal:

`2.323,77 m²`

Texto secundário:

`Área construída`

Utilizar formatação brasileira.

Caso área não esteja cadastrada:

`—`

ou estado equivalente.

Não exibir `0 m²` caso o dado simplesmente não exista.

---

# 7.4 Entregas

Título:

`ENTREGAS`

Valor:

`4 / 5`

Texto:

`Entregas concluídas`

Ação:

`Ver entregas`

Esse card deve derivar das entregas reais cadastradas no sistema.

Se o SenaHub trabalhar atualmente com disciplina entregue em vez de entidade formal "entrega", verificar a modelagem antes de decidir o cálculo.

---

# 7.5 Pendências críticas

Título:

`PENDÊNCIAS CRÍTICAS`

Valor principal em destaque:

`3`

Texto:

`Requer atenção`

Ícone de alerta.

Ação:

`Ver pendências`

### Importante

Confirmar quais entidades do SenaHub podem ser consideradas pendência:

- apontamentos;
- tarefas;
- revisões;
- aprovações;
- problemas;
- pendências cadastradas explicitamente.

Não somar entidades diferentes arbitrariamente.

Criar uma definição clara antes de implementar o contador.

---

# 7.6 Última atualização

Título:

`ÚLTIMA ATUALIZAÇÃO`

Exemplo:

`Hoje, 09:15`

Texto:

`Por Ryan Victor`

Determinar a origem da atualização.

Preferencialmente utilizar:

- audit log;
- histórico;
- updated_at confiável;
- evento recente relevante.

Não utilizar apenas `project.updated_at` caso pequenas ações automáticas atualizem esse campo e tornem a informação enganosa.

---

# 8. SEGUNDA LINHA — INDICADORES CRÍTICOS

Criar um card maior:

`INDICADORES CRÍTICOS`

Dentro dele, utilizar pequenos cards lado a lado.

Objetivo: revelar imediatamente problemas do projeto.

Indicadores sugeridos:

## 8.1 Atraso no prazo

Exemplo:

`32d`

`Prazo vencido`

Somente aparecer como crítico se realmente aplicável.

---

## 8.2 Desvios de entregas

Exemplo:

`4 / 5`

`Com prazo vencido`

Calcular utilizando datas efetivamente cadastradas.

---

## 8.3 Revisões em atraso

Exemplo:

`2`

`Documentos pendentes`

Confirmar conceito de revisão existente no SenaHub.

---

## 8.4 Aprovações pendentes

Exemplo:

`3`

`Aguardando retorno`

Se existir informação sobre responsável pela aprovação, apresentar de forma resumida.

Exemplo:

`SMOBI`

---

## 8.5 Apontamentos abertos

Exemplo:

`0`

`Nenhum aberto`

A origem deve ser o módulo de apontamentos/compatibilização existente.

---

# 9. USO DE CORES DOS INDICADORES

Não transformar o dashboard em uma interface excessivamente colorida.

Utilizar predominantemente:

- branco;
- cinzas claros;
- azul institucional;
- texto azul-marinho.

Reservar cores semânticas para estados.

### Verde

- concluído;
- aprovado;
- dentro do esperado.

### Azul

- informação;
- em andamento;
- estado neutro.

### Amarelo/Laranja

- atenção;
- prazo próximo;
- revisão;
- aprovação pendente.

### Vermelho

- atraso;
- risco crítico;
- pendência crítica;
- prazo vencido.

Evitar preencher grandes áreas com essas cores.

Preferir:

- badges;
- ícones;
- textos;
- bordas;
- pequenos indicadores.

---

# 10. LINHA DO TEMPO — VISÃO GERAL

Criar um componente de cronograma resumido semelhante a um pequeno Gantt.

Título:

`LINHA DO TEMPO (VISÃO GERAL)`

Exibir uma linha para cada disciplina.

Exemplo:

- Hidrossanitário
- Elétrico
- Estrutural
- Lógica/Ativo

Escala horizontal:

- meses;
- eventualmente semanas dependendo da duração.

Representar:

### planejado

barra em cinza claro.

### realizado/em andamento

barra azul.

### concluído

verde, se fizer sentido no design final.

### prazo limite

linha vertical tracejada vermelha.

### hoje

linha vertical pontilhada ou marcada.

Adicionar legenda discreta.

---

# 11. NÃO INVENTAR UM GANTT

Antes de implementar o componente, verificar se existem:

- data de início;
- data final;
- prazo de disciplina;
- datas de entregas;
- histórico;
- progresso.

Se os dados forem insuficientes para uma linha temporal real:

1. implementar o componente preparado para receber os dados;
2. apresentar apenas os dados existentes;
3. não criar datas fictícias.

---

# 12. DISCIPLINAS DO PROJETO

A tela atual possui um Kanban grande seguido de vários cards individuais das disciplinas.

Na nova Visão Geral, substituir essa representação extensa por uma **tabela executiva compacta**.

O Kanban completo poderá continuar disponível em uma tela/aba específica de disciplinas caso já exista ou seja mantido como visualização detalhada.

Título:

`DISCIPLINAS DO PROJETO`

---

# 13. COLUNAS DA TABELA

Sugestão:

| Disciplina | Status | Progresso | Entregas | Revisões | Aprovação | Responsável | Próxima entrega |

---

# 14. DISCIPLINA

Exibir:

ícone + nome principal.

Exemplo:

`💧 Hidrossanitário`

Abaixo, opcionalmente:

`Projetos de instalações`

O ícone deverá utilizar biblioteca já existente no projeto.

Não utilizar emojis na implementação real.

---

# 15. STATUS

Badge/dropdown compacto.

Possíveis estados deverão vir exclusivamente da modelagem existente.

Exemplo:

`Em andamento`

Não criar novos status simplesmente para coincidir com o mockup.

---

# 16. PROGRESSO DA DISCIPLINA

Exemplo:

`75%`

Barra horizontal abaixo.

Visual:

- número acima;
- barra fina;
- fundo cinza;
- preenchimento azul.

A origem do percentual deve ser identificada no sistema.

Caso a disciplina não possua percentual calculável:

`—`

Não assumir progresso a partir apenas do status.

---

# 17. ENTREGAS

Exemplo:

`2 / 3`

Abaixo:

`1 atraso`

ou:

`Concluída`

Utilizar vermelho apenas para atraso.

Verde somente para conclusão real.

---

# 18. REVISÕES

Exemplo:

`1`

Abaixo:

`Em aberto`

Ou:

`0`

Não confundir revisão com apontamento, tarefa ou arquivo.

---

# 19. APROVAÇÃO

Badge:

`Pendente`

ou:

`Aprovado`

Abaixo, quando existir:

nome do cliente, órgão ou responsável.

Exemplo:

`SMOBI`

---

# 20. RESPONSÁVEL

Nome:

`João Pedro`

Abaixo:

`Eng. Hidráulico`

Se houver avatar cadastrado, poderá ser utilizado.

Evitar excesso de avatares nessa tabela.

---

# 21. PRÓXIMA ENTREGA

Exemplo:

`30/08/2026`

Abaixo:

`Isométricos`

Caso não exista:

`—`

ou:

`Concluída`

A próxima entrega deve ser encontrada através da próxima entrega futura ainda não concluída.

Não criar essa lógica sem analisar a estrutura real das entregas.

---

# 22. RISCOS EM DESTAQUE

Criar card lateral:

`RISCOS EM DESTAQUE`

Exibir aproximadamente os três riscos mais relevantes.

Cada risco:

### título

`Atraso na aprovação de projetos`

### severidade

Badge:

`Alto`

### informações

`Probabilidade: Alta • Impacto: Alto`

### descrição curta

`Pode impactar o prazo final do projeto.`

Separar riscos visualmente usando uma pequena borda lateral semântica.

Exemplo:

- vermelho → alto;
- amarelo/laranja → médio;
- neutro/verde → baixo.

Ação:

`Ver matriz de riscos`

---

# 23. CASO O MÓDULO DE RISCOS NÃO EXISTA COMPLETAMENTE

Não fabricar riscos automaticamente.

Verificar:

- tabela;
- entidade;
- probabilidade;
- impacto;
- responsável;
- status;
- relacionamento com projeto.

Caso não exista suporte adequado:

mostrar estado vazio:

`Nenhum risco cadastrado`

e registrar como melhoria futura.

---

# 24. REMOÇÃO DA REDUNDÂNCIA DA VISÃO GERAL

Na tela atual existem:

- progresso geral;
- saúde do projeto;
- cards;
- linha do tempo;
- Kanban de disciplinas;
- cards individuais de cada disciplina;
- equipe;
- histórico.

Existe repetição significativa.

Na nova Visão Geral:

### manter

- resumo executivo;
- indicadores;
- cronograma resumido;
- tabela resumida de disciplinas;
- riscos.

### mover ou reduzir

Informações operacionais detalhadas.

Os cards gigantes individuais das disciplinas **não devem permanecer na Visão Geral**, pois repetem grande parte das informações.

Essas informações devem continuar acessíveis:

- clicando na disciplina;
- através da aba de disciplinas;
- através de drawer/modal;
- ou tela específica já existente.

Não remover funcionalidade.

Apenas reorganizar.

---

# 25. EQUIPE DO PROJETO

A seção atual de equipe ocupa uma área relativamente grande.

Na nova interface poderá:

### opção preferencial

ser apresentada como componente compacto abaixo da tabela ou através de drawer/modal.

Exemplo:

`Equipe do projeto — 5 membros`

seguido de avatares pequenos.

Ao clicar:

abrir lista completa.

Não remover as funções de:

- visualizar membros;
- adicionar membro;
- editar equipe;

caso existam atualmente.

---

# 26. HISTÓRICO DE STATUS

A lista atual ocupa bastante espaço vertical.

Na Visão Geral, mostrar apenas algo como:

`ATIVIDADE RECENTE`

com os últimos 3–5 eventos.

Exemplo:

`Cabeamento → Em andamento`

`Yasmin Raquel • 18/08/2026 08:58`

Adicionar:

`Ver histórico completo`

A aba Histórico continua sendo a fonte detalhada.

---

# 27. SAÚDE DO PROJETO

Atualmente existe indicação semelhante a:

`Saúde do projeto: Atenção`

Manter o conceito se existir uma regra real por trás dele.

Entretanto, não ocupar uma grande faixa exclusiva da interface.

Apresentar próximo ao cabeçalho ou aos indicadores.

Exemplo:

badge:

`Saúde: Atenção`

Pode possuir tooltip explicando os fatores.

Idealmente, a saúde deve derivar de critérios objetivos, por exemplo:

- prazo;
- entregas atrasadas;
- pendências críticas;
- revisões;
- riscos.

Mas **não alterar a regra existente sem investigar o código**.

---

# 28. VISUAL GERAL

Seguir a linguagem apresentada no mockup de referência.

Características:

- interface clara;
- fundo cinza extremamente claro;
- cards brancos;
- bordas finas;
- sombras muito sutis;
- cantos discretamente arredondados;
- azul-marinho para textos principais;
- azul institucional para ações;
- alta densidade informacional;
- pouco desperdício vertical;
- espaços consistentes.

Evitar:

- cards excessivamente altos;
- sombras fortes;
- gradientes desnecessários;
- excesso de cores;
- componentes gigantes;
- bordas muito arredondadas;
- aspecto de dashboard genérico de template.

A aparência precisa continuar sendo reconhecida como **SenaHub**.

---

# 29. TIPOGRAFIA E HIERARQUIA

Utilizar a fonte já definida no projeto.

Não adicionar nova fonte sem necessidade.

Hierarquia sugerida:

### Nome do projeto

20–24 px, peso 600–700.

### títulos de grandes seções

14–16 px, peso 600–700.

### títulos de cards

11–12 px, uppercase ou semibold.

### métricas

22–30 px, peso 600–700.

### textos auxiliares

11–13 px.

### tabela

12–14 px.

Não seguir esses valores cegamente.

Adaptar às variáveis/tokens existentes no design system.

---

# 30. ESPAÇAMENTO

Adotar uma escala consistente.

Exemplo conceitual:

- 4 px
- 8 px
- 12 px
- 16 px
- 24 px
- 32 px

Não criar dezenas de valores arbitrários.

Reduzir significativamente os grandes espaços vazios atualmente existentes.

---

# 31. CARDS

Padronizar cards.

Características:

- background branco;
- border 1px;
- border-radius discreto;
- padding aproximadamente 16–20px;
- sombra mínima ou nenhuma;
- hover apenas quando o card for interativo.

Não utilizar efeito elevado em todos os elementos.

---

# 32. ÍCONES

Utilizar a biblioteca que o SenaHub já utiliza.

Não misturar bibliotecas sem necessidade.

Padronizar:

- tamanho;
- stroke;
- alinhamento;
- cor.

Ícones devem auxiliar leitura, não funcionar como decoração.

---

# 33. RESPONSIVIDADE

A página deve funcionar nos principais breakpoints.

## Desktop grande

Cards executivos podem ocupar 5–6 colunas.

Indicadores + timeline lado a lado.

Tabela + riscos lado a lado.

## Desktop/notebook

Permitir redução de colunas.

Exemplo:

3 cards por linha.

## Tablet

2 cards por linha.

Timeline pode ocupar largura completa.

Riscos abaixo.

Tabela com scroll horizontal controlado.

## Mobile

1 card por linha.

Transformar tabela em cards ou visualização adaptada.

Não simplesmente comprimir a tabela até ficar ilegível.

---

# 34. ESTADOS DE CARREGAMENTO

Todos os principais componentes devem possuir loading adequado.

Preferir skeletons.

Criar skeletons para:

- cards;
- indicadores;
- timeline;
- tabela;
- riscos.

Evitar layout shift excessivo.

---

# 35. ESTADOS VAZIOS

Não mostrar campos quebrados.

Exemplos:

`Nenhuma entrega cadastrada`

`Nenhum risco cadastrado`

`Nenhuma revisão em aberto`

`Nenhum responsável definido`

Utilizar `—` para métricas simples quando adequado.

---

# 36. ERROS

Quando uma query falhar:

não tratar o projeto inteiro como indisponível se apenas um widget falhou.

Quando possível, permitir que widgets independentes falhem isoladamente.

Exemplo:

dashboard continua disponível mesmo que o endpoint de riscos apresente erro.

---

# 37. PERFORMANCE

Evitar criar uma query independente desnecessária para cada card.

Analisar possibilidade de:

- reutilizar dados já carregados;
- agregações;
- queries paralelas;
- cache;
- React Query/SWR ou solução já existente;
- memoização quando fizer sentido.

Não introduzir uma nova biblioteca apenas por preferência.

---

# 38. NÃO DUPLICAR LÓGICA DE NEGÓCIO

Se já existir cálculo de:

- progresso;
- status;
- atrasos;
- entregas;
- permissões;

utilizar a implementação existente.

Caso a lógica esteja espalhada ou duplicada, considerar centralizar em:

- service;
- helper;
- selector;
- hook;

sem alterar o comportamento funcional.

---

# 39. COMPONENTIZAÇÃO

Evitar construir toda a página em um componente monolítico.

Estrutura conceitual possível:

```text
ProjectOverview
 ├─ ProjectOverviewHeader
 ├─ ProjectSummaryCards
 │   ├─ ProjectProgressCard
 │   ├─ ProjectDeadlineCard
 │   ├─ ProjectAreaCard
 │   ├─ ProjectDeliveriesCard
 │   ├─ ProjectCriticalIssuesCard
 │   └─ ProjectLastUpdateCard
 │
 ├─ ProjectCriticalIndicators
 ├─ ProjectTimelineOverview
 ├─ ProjectDisciplinesTable
 ├─ ProjectRiskHighlights
 ├─ ProjectTeamSummary
 └─ ProjectRecentActivity
```

Esses nomes são apenas referência.

Antes de criar componentes novos, procurar equivalentes existentes.

---

# 40. INTERAÇÃO

Os cards não devem ser apenas decorativos.

Quando existir tela relacionada:

### Entregas

clicar → abrir entregas.

### Pendências

clicar → abrir pendências.

### Prazo

clicar → cronograma.

### Disciplina

clicar → abrir detalhes da disciplina.

### Risco

clicar → abrir risco ou matriz de riscos.

### Atividade

clicar → histórico.

Utilizar navegação já existente no sistema.

---

# 41. TOOLTIP E EXPLICAÇÃO DOS INDICADORES

Indicadores potencialmente ambíguos devem possuir tooltip.

Exemplo:

`Progresso geral ⓘ`

Tooltip:

`Percentual calculado com base em...`

Entretanto, o conteúdo desse tooltip deve refletir a regra de negócio realmente identificada no código.

Nunca explicar uma fórmula inexistente.

---

# 42. ACESSIBILIDADE

Garantir:

- contraste adequado;
- navegação por teclado;
- foco visível;
- aria-label em botões somente com ícone;
- tooltips acessíveis;
- não depender exclusivamente de cor;
- tabelas semanticamente corretas.

---

# 43. INFORMAÇÕES FINANCEIRAS

A tela atual possui card de:

`Margem`

respeitando restrição financeira.

Manter rigorosamente as permissões existentes.

Se determinado usuário não puder visualizar dados financeiros:

- não retornar esses dados pelo frontend;
- não apenas ocultar via CSS;
- utilizar autorização já existente no backend/serviço.

Se a margem continuar no dashboard, ela poderá ser:

- card adicional;
- informação condicional;
- bloco específico para usuários autorizados.

Não incluir a margem entre os seis cards principais se isso comprometer a consistência do dashboard para usuários sem acesso financeiro.

---

# 44. PRESERVAR FUNCIONALIDADES DA TELA ATUAL

Antes de remover visualmente qualquer elemento, mapear suas funcionalidades.

Na tela atual existem recursos como:

- alteração do status da disciplina;
- arquivos;
- revisões;
- responsáveis;
- diário;
- tarefas;
- comentários;
- edição;
- exclusão;
- valores;
- equipe;
- histórico.

Nenhuma dessas funções deverá desaparecer como consequência da refatoração.

A Visão Geral poderá ficar mais enxuta, mas os recursos devem continuar acessíveis através de:

- detalhe da disciplina;
- drawer;
- modal;
- abas;
- menu contextual;
- telas existentes.

---

# 45. EVITAR DUPLICIDADE ENTRE VISÃO GERAL E DISCIPLINAS

A Visão Geral deve responder:

> “Como está o projeto?”

A área de disciplina deve responder:

> “O que está acontecendo nesta disciplina?”

Não reproduzir todo o conteúdo operacional de cada disciplina na Visão Geral.

---

# 46. ORDEM VISUAL FINAL SUGERIDA

## BLOCO 1

Cabeçalho do projeto + ações.

## BLOCO 2

Abas.

## BLOCO 3

Cards executivos:

1. Progresso geral
2. Prazo final
3. Área
4. Entregas
5. Pendências críticas
6. Última atualização

## BLOCO 4

Grid:

**esquerda — aproximadamente 55%**

Indicadores críticos.

**direita — aproximadamente 45%**

Linha do tempo.

## BLOCO 5

Grid:

**esquerda — aproximadamente 75%**

Tabela de disciplinas.

**direita — aproximadamente 25%**

Riscos em destaque.

## BLOCO 6

Opcional:

Equipe + atividade recente.

---

# 47. DENSIDADE DE INFORMAÇÃO

Na resolução desktop de aproximadamente 1920×1080, tentar apresentar sem rolagem excessiva:

- cabeçalho;
- abas;
- cards principais;
- indicadores;
- timeline;
- início ou maior parte da tabela.

O objetivo é que o gestor consiga compreender a condição do projeto em aproximadamente **5–10 segundos**.

---

# 48. NÃO COPIAR PIXEL A PIXEL

A imagem fornecida é uma referência conceitual.

Não reproduzir cegamente:

- dimensões;
- textos;
- números;
- status;
- pessoas;
- clientes;
- datas.

Adaptar ao:

- design system existente;
- dados reais;
- componentes existentes;
- arquitetura atual;
- identidade SenaHub.

---

# 49. PRIMEIRA ETAPA DA EXECUÇÃO

Antes de escrever código, produzir um diagnóstico curto contendo:

## Componentes localizados

Arquivos responsáveis pela tela.

## Dados disponíveis

Quais informações do dashboard já podem ser calculadas.

## Dados parcialmente disponíveis

Quais exigem alguma adaptação.

## Dados inexistentes

Quais dependeriam de mudanças de modelagem.

## Funcionalidades atuais

Lista das funcionalidades da página que precisam ser preservadas.

## Componentes reutilizáveis

Design system/components existentes que podem ser aproveitados.

## Plano de alteração

Arquivos que pretende:

- modificar;
- criar;
- remover.

Somente depois iniciar a implementação.

---

# 50. NÃO FAZER

Não:

- criar dados mockados como solução definitiva;
- alterar banco sem necessidade;
- mudar modelos sem análise;
- criar novos status arbitrários;
- modificar regras de cálculo silenciosamente;
- remover funcionalidades;
- duplicar componentes existentes;
- trocar bibliotecas sem justificativa;
- mudar a sidebar global apenas para imitar o mockup;
- implementar autorização somente no frontend;
- criar dependências fortes entre widgets independentes;
- fazer uma grande refatoração fora do escopo.

---

# 51. FASEAMENTO RECOMENDADO

Implementar preferencialmente em etapas.

## Fase 1 — Estrutura

- layout;
- grid;
- cards;
- tabela;
- containers;
- responsividade.

Utilizando apenas dados já existentes.

## Fase 2 — Indicadores

Integrar:

- progresso;
- prazo;
- entregas;
- revisões;
- aprovações;
- pendências.

## Fase 3 — Timeline

Criar cronograma resumido baseado nos dados reais.

## Fase 4 — Riscos

Integrar matriz de riscos caso a estrutura exista.

## Fase 5 — Interações

- links;
- drawers;
- tooltips;
- navegação;
- ações.

## Fase 6 — Refinamento

- responsividade;
- estados vazios;
- loading;
- erros;
- acessibilidade;
- performance.

---

# 52. CRITÉRIOS DE ACEITAÇÃO

Considerar a implementação concluída quando:

- [ ] a Visão Geral apresentar uma leitura executiva clara do projeto;
- [ ] os principais indicadores aparecerem no início da tela;
- [ ] houver redução significativa de rolagem;
- [ ] não houver repetição excessiva das disciplinas;
- [ ] nenhuma funcionalidade existente tiver sido perdida;
- [ ] os dados exibidos forem originados de fontes reais do sistema;
- [ ] não houver números fictícios;
- [ ] indicadores indisponíveis apresentarem estado vazio;
- [ ] permissões financeiras forem respeitadas;
- [ ] a timeline utilizar dados reais;
- [ ] a tabela de disciplinas estiver funcional;
- [ ] riscos utilizarem dados reais quando disponíveis;
- [ ] a página funcionar em desktop, notebook, tablet e mobile;
- [ ] existirem loading states;
- [ ] existirem empty states;
- [ ] existirem error states;
- [ ] componentes seguirem o design system;
- [ ] não houver regressões nas demais abas;
- [ ] não houver regressões nas ações do projeto;
- [ ] a build passar sem erros;
- [ ] lint e typecheck passarem;
- [ ] os testes existentes continuarem passando.

---

# 53. RESULTADO ESPERADO

A Visão Geral deve deixar de parecer uma coleção vertical de módulos operacionais e passar a funcionar como um **painel de controle do projeto**.

Um usuário deve conseguir abrir um projeto e imediatamente identificar:

**Situação → Prazo → Progresso → Problemas → Disciplinas → Riscos → Próximos passos.**

A interface deve seguir o conceito visual do mockup fornecido, mas permanecer integrada à arquitetura, identidade e regras de negócio reais do SenaHub.