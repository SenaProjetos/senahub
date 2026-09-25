---
titulo: Recursos (alocação da equipe)
descricao: Matriz de alocação de pessoas em projetos, com carga real e planejada por semana, sobrecarga e habilidades.
resumo: Veja quem está alocado em quais projetos, a carga de trabalho por semana (a real, do ponto, e a planejada, das horas do cronograma), as semanas acima da capacidade com sugestões de correção e as habilidades de cada pessoa.
tags: [recursos, alocação, carga, carga planejada, sobrecarga, equipe, habilidades, capacidade, heatmap]
palavras-chave: [recursos, alocação, carga semanal, carga real, carga planejada, capacidade, superalocado, sobrecarga, rebalancear, heatmap, equipe, habilidade, competência, alocação calculada, demanda sem pessoa, perfil]
sinonimos: [alocação de equipe, capacity, planejamento de recursos, histograma de recursos, superalocação]
---

# Recursos (alocação da equipe)

## Objetivo

Visualizar e gerenciar a **alocação das pessoas nos projetos**, a **carga de trabalho** por semana —
a **real** (do ponto) e a **planejada** (das horas do cronograma) — e as **habilidades** de cada um.

## Quando utilizar

- Para equilibrar a carga do time e decidir alocações.
- Para achar **semanas acima da capacidade** antes que virem atraso.

## Como acessar

- Menu → **Gestão** → **Recursos** (`/recursos`). Exige `recursos:ver`.
- Nos perfis padrão, disponível ao Coordenador e ao Administrativo.

## As quatro visões

No canto direito, o seletor troca a visão. **Projeto** e **Habilidade** filtram as pessoas; **Janela**
define o período de análise (padrão: de hoje a 90 dias).

| Visão | O que mostra |
| --- | --- |
| **Matriz** | Linhas = pessoas, colunas = projetos, com a alocação de cada uma |
| **Heatmap** | A alocação **digitada** mês a mês (o pico do mês), pintada conforme a intensidade em relação à capacidade |
| **Carga real** | Nas últimas 12 semanas, `horas registradas / horas disponíveis` por semana, usando escala, fator de capacidade, feriados, férias e abonos aprovados |
| **Carga planejada** | As **horas previstas nas linhas dos cronogramas aprovados**, por pessoa e semana, contra a capacidade — veja abaixo |

## A matriz

Cada pessoa mostra: **habilidades**, o aviso **ausente** (quando está de férias ou abono hoje), a
**capacidade** (multiplicador; 1,00 = jornada cheia) e as **alocações** por projeto, em chips.

### Alocação digitada × calculada

- **Alocação digitada** (chip cinza, com o %): a que você cadastra a mão. **Faixas de alocação** por
  projeto permitem encerrar uma participação e voltar ao mesmo projeto depois, preservando o
  histórico; faixas que se sobrepõem para a mesma pessoa e projeto são bloqueadas.
- **Alocação calculada** (chip azul, marcado **calc**): a que vem das **horas das linhas** de um
  projeto com **cronograma aprovado**. Não se edita aqui — ajuste na EAP do projeto.
- **Substituída** (chip tracejado e riscado): projeto que **ganhou cronograma aprovado** — a alocação
  digitada dele **deixou de contar**, e a carga passa a vir das horas. Pode remover.
- Projeto **sem** cronograma aprovado continua valendo pela alocação **digitada**, convertida em
  horas, enquanto ele não é aprovado. **Criar alocação digitada para projeto com cronograma aprovado é
  recusado.**

### Superalocação

A barra de cada pessoa mostra o total alocado contra a capacidade, e o quanto está alocado **hoje**.
Pessoa **acima da capacidade** fica destacada com **Rebalancear**; **superalocado na janela** avisa
quando algum mês da janela passa da capacidade (nesses dois casos, considera só a alocação
**digitada**).

## Carga planejada

Soma, por pessoa e semana, as **horas previstas** das atividades dos projetos **aprovados**, contra a
capacidade **disponível** (jornada, feriados, férias, abonos). A célula mostra `planejadas/disponíveis`,
pintada conforme a intensidade.

- **Semanas acima da capacidade** viram uma lista no topo, com o quanto excede, a maior parcela (a
  atividade e o projeto que mais pesam) e o motivo de a capacidade estar menor (feriado, férias…).
- **Ver sugestões** (para quem edita o cronograma) calcula, para a semana escolhida:
  - **Atrasar** uma atividade em alguns dias úteis, quando isso **não muda o término do projeto** —
    a atividade pode ganhar a **data fixada** (alfinete);
  - **Passar** a atividade inteira para outra pessoa livre.
  Cada sugestão vem **verificada**: o sistema refaz o cálculo para saber se **resolve** ou só
  **alivia**. Só é aplicada depois de você **confirmar**. Nunca há nivelamento automático — quando
  nenhuma correção cabe sem mexer no prazo ou sobrecarregar outra pessoa, a decisão é da coordenação.
- **Demanda ainda sem pessoa (perfis):** horas atribuídas a um **perfil** ("Projetista" numa linha da
  Elétrica). Ninguém está escalado, então **não entra na carga de ninguém**.

A visão diz de onde vêm as horas: projetos com cronograma aprovado, ou a alocação digitada convertida.
Ver [Cronograma: equipe, horas e custo](cronograma-equipe-e-custo.md).

## Cadastro do recurso e habilidades

- **Adicionar recurso** transforma um usuário em recurso, com **capacidade** (multiplicador), **cor**
  e **custo por hora**. **Editar** altera esses dados.
- O **custo por hora** alimenta o **custo previsto** do cronograma e o
  [Valor Agregado](valor-agregado.md) em R$.
- **Habilidades**: o catálogo de competências e o vínculo com cada pessoa (**+ habilidade**), com
  filtro por habilidade.
- **Usuários sem recurso** (ainda não mapeados) são destacados.

## Permissões

| Ação | Permissão |
| --- | --- |
| Ver as visões e pedir **sugestões** | `recursos:ver` |
| Editar alocações digitadas, recursos e habilidades | `recursos:gerir` |
| **Aplicar** uma sugestão (atrasar/passar) | `planejamento:gerir` |

## Funcionalidades relacionadas

- [Planejamento](planejamento.md) · [Cronograma: equipe, horas e custo](cronograma-equipe-e-custo.md) ·
  [Projetos](projetos.md) · [RH — Produtividade](../rh-ponto/README.md)

## FAQ

**O que é a carga real?** Ela compara, por pessoa e semana, as horas realmente registradas no ponto com
a capacidade que estava disponível. Uma semana sem horas também aparece; férias, abonos e feriados
reduzem a capacidade exibida.

**E a carga planejada?** É a mesma comparação, mas com as **horas previstas no cronograma** no lugar
das horas registradas — o que **vai** acontecer, e não o que já aconteceu.

**Posso alocar a mesma pessoa no mesmo projeto mais de uma vez?** Sim, desde que as faixas de datas
não coincidam. Por exemplo, uma faixa pode terminar em junho e outra começar em setembro, sem apagar
a participação anterior.

**Aprovei o cronograma e a alocação da pessoa mudou.** É o esperado: a partir da aprovação, a carga do
projeto vem das **horas das linhas**, e a alocação digitada aparece riscada. Se o projeto não tinha
horas estimadas, ele **some da carga** — estime as horas na EAP.

**A pessoa aparece livre no Heatmap e sobrecarregada na Carga planejada.** O heatmap e o "superalocado
na janela" enxergam só a alocação **digitada**; a carga de quem está só em projeto aprovado aparece na
**Carga planejada**.
