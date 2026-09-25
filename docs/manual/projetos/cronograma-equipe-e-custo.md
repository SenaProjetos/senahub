---
titulo: Cronograma: equipe, horas e custo
descricao: Como atribuir pessoas e horas às linhas da EAP, como o cronograma aprovado gera os cards e a carga da equipe, e como o custo previsto é calculado.
resumo: Cada atividade do cronograma recebe pessoas (ou perfis) com papel e horas previstas. Ao aprovar, isso vira cards no quadro de tarefas, carga planejada por semana em Recursos e custo previsto por linha (só para quem vê o financeiro).
tags: [cronograma, recursos, equipe, horas previstas, papel, perfil, card, carga planejada, custo previsto, custo por hora, sobrecarga]
palavras-chave: [recursos da linha, atribuição, pessoa, perfil, papel, horas previstas, responsável principal, herdar responsáveis, card do cronograma, carga planejada, sobrecarga, sugestão, custo previsto, custo por hora, etapa de terceiro, sem gente, s/h]
sinonimos: [alocação por tarefa, atribuição de recursos, esforço, trabalho previsto, custo da tarefa, orçamento da linha]
---

# Cronograma: equipe, horas e custo

## Objetivo

Dizer **quem faz** cada atividade do [cronograma](planejamento.md) e **quantas horas** cada um deve
gastar — e deixar o sistema derivar disso os **cards** das pessoas, a **carga da equipe** e o **custo
previsto**. Na linguagem do MS Project: os *recursos* e o *trabalho* de cada tarefa.

## Recursos da linha: pessoa ou perfil

No editor de uma linha, a seção **Recursos** lista quem está nela. Cada linha da lista tem:

- **Pessoa** — ou **(perfil — sem pessoa)**, para dimensionar antes de escalar ("Projetista" numa
  linha da Elétrica). Perfil **não gera card** e não entra na carga de ninguém: aparece em
  **Demanda ainda sem pessoa**, em [Recursos](recursos.md).
- **Papel** — Diretor, Gerente de projetos, Coordenador, Engenheiro, Projetista, Modelador BIM,
  Revisor ou Aprovador. A mesma pessoa pode estar na linha em **dois papéis** (projeta e revisa);
  o mesmo papel duas vezes, não.
- **Horas previstas** — o esforço dessa pessoa na linha (**horas**, não percentual). Digite e saia do
  campo para gravar. Mais gente na linha **divide as horas**, não encurta o prazo: a duração é
  fixa.
- **Principal** — quem aparece no card e nos filtros. **Tornar principal** só vale para pessoa; se o
  principal sai, a próxima atribuição assume.

**Que linhas recebem gente:**

| Linha | Recebe pessoas? | Recebe horas? |
| --- | --- | --- |
| **Atividade** | sim | sim |
| **Marco** | sim (responsável) | **não** — marco não ocupa dia |
| **Agrupamento** (tem filhas) | **não** — as horas estão nas filhas; contar de novo dobraria a carga | — |

Linha que virou agrupamento e ainda tem gente mostra a lista em **somente leitura**, com a lixeira,
e o verificador avisa ("agrupamento com gente atribuída").

### De onde vêm os responsáveis

- O responsável da **disciplina** desce sozinho para as linhas novas dela e para a linha que **muda
  de disciplina** e está sem ninguém. Da linha em diante, vale o que estiver **na linha**.
- **Herdar responsáveis** (botão no topo do cronograma) faz o mesmo para todas as linhas **ainda sem
  ninguém**. O que já tem gente não é tocado. Como é um gesto explícito, uma linha que você esvaziou
  de propósito **também** é preenchida de novo — a herança automática, ao contrário, só age quando a
  linha nasce ou muda de disciplina.

### O que a coluna Recursos mostra

Avatares (até três, com **+N**); **P** para perfil; **sem gente** (aviso); **s/h** quando alguém na
linha ainda não tem horas estimadas; **terceiro** para etapa de terceiro. No editor, o resumo diz
quantas pessoas, quantas horas previstas e quantas **já foram apontadas** no ponto.

### Horas da linha

A **hora da linha** é a soma das pessoas; a do **agrupamento**, a soma das filhas. Enquanto alguma
linha não tem estimativa, o sistema **não a trata como zero**: o percentual do agrupamento continua
ponderado pela duração, e o custo fica "sem custo". O verificador acusa ("sem horas previstas") como
**informativo**, sem pesar na nota.

### Etapa de terceiro

É a linha cujo trabalho é **de fora da casa** — esperar o cliente, a arquitetura, a prefeitura, a
concessionária. Ela segura prazo no cronograma, mas **não gera card, não cobra horas e custa zero**.
O sistema reconhece pela **origem** da linha: **Cliente**, **Arquitetura**, **Projetista externo**,
**Fiscalização**, **Órgão aprovador**, **Concessionária** ou **Obra**. (Origem **Interna**,
**Compatibilização** e **Alteração de escopo** são trabalho da casa.)

> **Limitação atual:** o editor da linha ainda **não tem o campo Origem** — por isso, na prática,
> toda linha conta como trabalho da casa. Linha que espera o cliente hoje gera card e cobra horas.

## Cards no quadro de Tarefas

Ao **aprovar** o cronograma, cada **atividade da equipe com pessoa escalada** vira um **card** no
quadro de [Tarefas](tarefas.md) de cada uma. Não geram card: **marco**, **agrupamento**, **etapa de
terceiro**, linha **só com perfil** e linha já **concluída**, cancelada ou arquivada.

- O card **acompanha o cronograma**: quando a data ou a equipe da linha muda, o card muda junto.
  Vale também para o prazo que sai do **motor** (e não da data gravada), e para quem sai da linha,
  que sai do card. Linha concluída mantém o card (ele nunca é apagado).
- No card, **título, prazo, projeto, disciplina e responsáveis** ficam **travados** com o aviso "Este
  card vem do cronograma… mudam na EAP do projeto". **Coluna, prioridade, descrição, checklist e
  comentários** continuam livres — o projetista mexe no dia a dia sem alterar o combinado.
- O botão de lista na tabela (**Gerar tarefa no kanban**) força a sincronização de uma linha. Em
  **rascunho** ele fica desabilitado: card de cronograma que ninguém aprovou mostraria ao projetista
  um prazo que ninguém combinou.
- Aprovar **não notifica** cada card criado (um cronograma de 200 linhas não pode disparar 200
  avisos); o aviso da aprovação mostra quantos cards nasceram.

## Horas apontadas e percentual

No [Ponto](../rh-ponto/ponto.md), quem trabalha em um projeto pode escolher **em qual tarefa** está.
No editor da linha, a coordenação vê **Apontado no ponto: X h de Y previstas**. As horas apontadas
**não** viram sugestão de percentual — gastar hora não é avançar. O que sugere percentual é o
**checklist do card** e a **situação da disciplina** (a coordenação confirma com **usar**).

## Carga da equipe (Recursos → Carga planejada)

Em [Recursos](recursos.md), a visão **Carga planejada** soma as horas das linhas dos projetos com
cronograma **aprovado**, por pessoa e semana, contra a capacidade disponível (jornada, feriados,
férias e abonos). Semanas **acima da capacidade** viram um aviso, e quem edita o cronograma pode pedir
**Ver sugestões**:

- **Atrasar** a linha em alguns dias úteis, quando isso **não muda o término do projeto**;
- **Passar** a linha inteira para outra pessoa livre.

Cada sugestão vem **verificada** (o sistema refaz o cálculo para ter certeza de que resolve, ou diz
que apenas **alivia**) e só é aplicada com **confirmação**. Nunca há nivelamento automático: quando
nenhuma correção cabe sem mexer no prazo ou sobrecarregar outra pessoa, a decisão é da coordenação.

## Custo previsto (para quem vê o financeiro)

Quem tem acesso ao financeiro vê, na tabela do cronograma, a coluna **Custo**: as **horas previstas de
cada pessoa × o custo por hora dela**, cadastrado em [Recursos](recursos.md). O agrupamento **soma as
filhas**, e o topo da tela mostra o **custo previsto do projeto**.

- **Desconhecido nunca vira zero.** Linha sem horas, com **perfil** (vaga sem pessoa) ou com alguém
  **sem custo por hora cadastrado** fica **s/ custo** — passe o mouse para ver o que falta. O total
  do projeto aparece então como **incompleto**, com o número de linhas sem custo.
- **Marco** e **etapa de terceiro** custam zero (é o valor certo, não a falta dele).
- Ao **aprovar** ou **replanejar**, o custo de cada linha fica **guardado na linha de base**. Mudar o
  custo por hora de alguém depois não altera o que foi combinado.
- **Exportar Excel** traz a coluna de custo, com o desconhecido em branco.
- Quem **não** vê o financeiro não recebe a coluna, o total nem a coluna de R$ do
  [Valor Agregado](valor-agregado.md).
- Para quem recebe **por entrega** (PJ, freelancer), o que a empresa paga de verdade é o
  **pagamento** da disciplina ou da fase; o custo previsto é só a estimativa do cronograma. Ver
  [Etapas e pagamento por fase](etapas-e-pagamento-por-fase.md).

## Permissões

| Ação | Permissão |
| --- | --- |
| Adicionar/remover pessoas, editar horas, tornar principal, **Herdar responsáveis** | `planejamento:gerir` |
| Ver a **Carga planejada** e pedir **sugestões** | `recursos:ver` |
| **Aplicar** uma sugestão (atrasar/passar) | `planejamento:gerir` |
| Ver custo por linha, custo do projeto e coluna de custo no Excel | acesso ao financeiro (`financeiro:ver` ou sócio) |

## Regras de negócio

- **Horas por pessoa, não percentual.** A duração é fixa: mais gente divide o esforço, não encurta
  o prazo.
- **Só atividade tem horas.** Marco não ocupa dia; agrupamento não recebe gente.
- **O que não se sabe não é zero** — vale para horas e para custo.
- **O card é do cronograma**, não do projetista: as mudanças de data e de equipe vêm da EAP.
- **Custo é taxa de remuneração**: só aparece para quem vê o financeiro.

## Funcionalidades relacionadas

- [Planejamento (EAP e cronograma)](planejamento.md) · [Valor Agregado](valor-agregado.md) ·
  [Recursos](recursos.md) · [Tarefas](tarefas.md) · [Ponto](../rh-ponto/ponto.md)

## FAQ

**Por que uma atividade minha não gerou card?** Ela é marco, agrupamento ou etapa de terceiro; ou só
tem um perfil (sem pessoa); ou o cronograma ainda é rascunho; ou a linha já está concluída.

**Não consigo editar o prazo do meu card.** Ele vem do cronograma. Peça à coordenação para mudar na
EAP do projeto — o card acompanha.

**O custo do projeto aparece como "incompleto".** Falta horas em alguma atividade, uma vaga (perfil)
sem pessoa, ou alguém sem custo por hora em Recursos. Passe o mouse sobre "s/ custo" na linha.

**Atribuí horas a um perfil e o custo não fechou.** Perfil não tem custo por hora: escale uma
pessoa.
