---
titulo: Recursos (capacidade × carga da equipe)
descricao: Tela de leitura da capacidade e da carga de cada pessoa, calculada das EAPs dos projetos, com filtros e sobrecarga em vermelho.
resumo: Veja quanto cada pessoa tem de carga nas EAPs aprovadas contra a capacidade dela, semana a semana, e quem está acima da capacidade. A tela só lê — a carga muda na EAP do projeto.
tags: [recursos, carga, carga planejada, sobrecarga, equipe, capacidade, heatmap, filtros]
palavras-chave: [recursos, férias, ausência, aviso de impacto, carga semanal, carga real, carga planejada, capacidade, sobrecarga, heatmap, equipe, demanda sem pessoa, perfil, sem cronograma, disciplina, só sobrecarregados]
sinonimos: [capacity, planejamento de recursos, histograma de recursos, superalocação, carga da equipe]
---

# Recursos (capacidade × carga da equipe)

## Objetivo

Enxergar, num lugar só, a **capacidade** e a **carga** de cada pessoa — a **planejada** (as horas
das atividades nas EAPs dos projetos com cronograma aprovado) e a **real** (as horas do ponto) — e
achar quem está **acima da capacidade**.

A tela é **somente leitura**. Quem atribui pessoas e horas é a **EAP do projeto**; aqui só se vê o resultado.

## Quando utilizar

- Para equilibrar a carga do time antes que vire atraso.
- Para achar **semanas acima da capacidade** e saber em qual projeto mexer.

## Como acessar

- Menu → **Gestão** → **Recursos** (`/recursos`). Exige `recursos:ver`.
- Nos perfis padrão, disponível ao Coordenador e ao Administrativo.

## Filtros

Acima das visões ficam os filtros, que valem para as quatro:

- **Pessoa:** busca pelo nome (sem diferenciar acento ou maiúscula).
- **Projeto:** quem tem carga naquele projeto (inclusive em cronograma ainda em rascunho).
- **Disciplina:** quem tem atividade atribuída naquela disciplina nas EAPs aprovadas.
- **Só sobrecarregados:** esconde quem está dentro da capacidade. Na Matriz, no Heatmap e na Carga
  planejada vale a **janela de análise** (alguma semana dela acima da capacidade); na Carga real vale
  qualquer uma das 12 semanas exibidas.
- **Janela:** o período de análise (padrão: de hoje a 90 dias).

Na **Carga real**, Projeto e Disciplina escolhem **quem** aparece (pelo que está planejado); as horas
registradas de cada pessoa não são filtradas, porque o ponto não separa por projeto aqui.

## As quatro visões

| Visão | O que mostra |
| --- | --- |
| **Matriz** | Linhas = pessoas, com a carga calculada em cada projeto, o total contra a capacidade e o quanto está ocupado **hoje** |
| **Heatmap** | A ocupação por período (o pior dia de cada coluna), pintada conforme a intensidade em relação à capacidade. Escolha o **período**: **1 semana** (um dia por coluna), **4 semanas**, **12 semanas** (uma semana por coluna, a partir da semana de hoje) ou **Meses** (o padrão, quatro meses a partir do atual). Só entram as **horas dos cronogramas aprovados**, nas próximas 12 semanas; depois disso não há dado. O ícone de **calendário riscado** marca a coluna em que a pessoa tem **férias ou abono** aprovados (feriado não conta: é de todo mundo); em **vermelho**, há carga num desses dias |
| **Carga real** | Nas últimas 12 semanas, `horas registradas / horas disponíveis` por semana, usando escala, fator de capacidade, feriados, férias e abonos aprovados |
| **Carga planejada** | As **horas previstas nas linhas dos cronogramas aprovados**, por pessoa e semana, contra a capacidade — veja abaixo |

## A matriz

Cada pessoa mostra o aviso **ausente** (férias ou abono hoje), a **capacidade** (multiplicador; 1,00 =
jornada cheia, 0,50 = meio período) e a **carga por projeto**, em chips. O **%** é sempre **da
capacidade da própria pessoa**: 100% é tudo o que ela dedica a projetos, então quem trabalha meio
período fica cheio com 100% (e 50% é metade do meio período dela).

- **Chip azul, marcado calc:** carga calculada das **horas das linhas** de um projeto com cronograma
  aprovado. Para mudar, edite a EAP do projeto.
- **Chip tracejado, marcado rasc:** o que uma EAP em **rascunho** já prevê. Aparece à parte e **não
  soma** na carga até o cronograma ser aprovado.

### Projeto sem cronograma aprovado

Quem está num projeto ativo **sem cronograma aprovado** (como membro, responsável de disciplina ou
com atividade aberta) ganha o selo **sem cronograma**, com um link para a EAP do projeto. O selo é só
um **aviso**: não soma horas e não pinta sobrecarga — essa carga ainda não existe em lugar nenhum. Ele
aparece nas quatro visões. Aprove o cronograma do projeto para a carga entrar.

### Sobrecarga

A barra de cada pessoa mostra a carga contra a capacidade (100%) e o quanto está ocupado **hoje**.
Pessoa **acima da capacidade** fica destacada; **acima da capacidade na janela** avisa quando alguma
semana da janela passa do que ela tem disponível. Férias e abono reduzem a capacidade dos dias deles;
**feriado** reduz a de todo mundo.

## Aviso de férias ou ausência que afeta alocação

Quando o RH **aprova** férias ou um abono — ou lança férias direto, ou uma nova data de férias entra em
vigor — e a pessoa está **alocada** em algum projeto nesse período, quem pode gerir Recursos recebe um
aviso no sino com os projetos e o quanto de cada um. O link do aviso abre o **Heatmap** já com a
**janela** da ausência.

- Só vale o pedaço **de hoje em diante**: férias lançadas no passado, para acertar o ponto, não avisam.
- Abono aparece como **"ausência"**, sem o motivo.
- **Nada é alterado automaticamente**.
- Para deixar de receber: **Preferências → Notificações → Ausência que afeta alocação**.
- Esse aviso ainda considera também alocações antigas digitadas à mão, que a tela não mostra mais.

## Carga planejada

Soma, por pessoa e semana, as **horas previstas** das atividades dos projetos **aprovados**, contra a
capacidade **disponível** (jornada, feriados, férias, abonos). A célula mostra `planejadas/disponíveis`,
pintada conforme a intensidade.

- **Semanas acima da capacidade** viram uma lista no topo, com o quanto excede, a maior parcela (a
  atividade e o projeto que mais pesam) e o motivo de a capacidade estar menor (feriado, férias…).
- **Ver sugestões** calcula, para a semana escolhida:
  - **Atrasar** uma atividade em alguns dias úteis, quando isso **não muda o término do projeto**;
  - **Passar** a atividade inteira para outra pessoa livre.
  Cada sugestão vem **verificada** (o sistema refaz o cálculo para saber se **resolve** ou só
  **alivia**). As sugestões são **só leitura**: o link **Abrir a EAP** leva ao projeto, onde quem
  tem permissão de planejamento faz a mudança. Quando nenhuma correção cabe sem mexer no prazo ou
  sobrecarregar outra pessoa, a decisão é da coordenação.
- **Demanda ainda sem pessoa (perfis):** horas atribuídas a um **perfil** ("Projetista" numa linha da
  Elétrica). Ninguém está escalado, então **não entra na carga de ninguém**.

Ver [Cronograma: equipe, horas e custo](cronograma-equipe-e-custo.md).

## Cadastro do recurso

- **Adicionar recurso** (só quem gere Recursos) transforma um usuário em recurso, com **capacidade**
  (multiplicador), **cor** e **custo por hora**. **Editar** altera esses dados.
- O **custo por hora** alimenta o **custo previsto** do cronograma e o
  [Valor Agregado](valor-agregado.md) em R$. Ele é dado do **financeiro**: só aparece em Recursos para quem
  tem acesso ao financeiro, e só quem **gere o financeiro** o altera. Quem não o vê edita capacidade e cor
  normalmente, sem apagar a taxa que já está gravada.
- **Usuários sem recurso** (ainda não mapeados) são oferecidos no **Adicionar recurso**.
- As **habilidades** das pessoas ficam no RH (ficha da pessoa), não mais nesta tela.

## Permissões

| Ação | Permissão |
| --- | --- |
| Ver as visões, os filtros e pedir **sugestões** | `recursos:ver` |
| Adicionar e editar o recurso (capacidade, cor) | `recursos:gerir` |
| Custo por hora | `financeiro:ver` para ver, `financeiro:gerir` para editar |
| Mudar a carga (atribuir pessoas e horas, atrasar, passar) | `planejamento:gerir`, na EAP do projeto |

## Funcionalidades relacionadas

- [Planejamento](planejamento.md) · [Cronograma: equipe, horas e custo](cronograma-equipe-e-custo.md) ·
  [Projetos](projetos.md) · [RH — Produtividade](../rh-ponto/README.md)

## FAQ

**O que é a carga real?** Ela compara, por pessoa e semana, as horas realmente registradas no ponto com
a capacidade que estava disponível. Uma semana sem horas também aparece; férias, abonos e feriados
reduzem a capacidade exibida.

**E a carga planejada?** É a mesma comparação, mas com as **horas previstas no cronograma** no lugar
das horas registradas — o que **vai** acontecer, e não o que já aconteceu.

**Onde aloco uma pessoa num projeto?** Na **EAP** do projeto: atribua a pessoa e as horas à atividade. A
tela de Recursos só mostra o resultado.

**Uma pessoa aparece livre, mas sei que ela está num projeto.** Veja se ela tem o selo **sem cronograma**:
o projeto ainda não tem cronograma aprovado, então a carga dele não entra. Aprove o cronograma.

**Para onde foram as alocações que eu digitava?** Continuam gravadas, mas esta tela não as mostra nem
as soma. A carga agora vem só das EAPs.
