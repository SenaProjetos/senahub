---
titulo: Glossário
descricao: Termos do SenaHub explicados em linguagem simples.
resumo: Significado dos termos, perfis, módulos e conceitos usados no sistema e neste manual.
tags: [glossário, termos, definições, conceitos, perfis, módulos, eap, cronograma, linha de base, valor agregado]
palavras-chave: [glossário, significado, o que é, definição, termo, sigla, eap, marco, dependência, folga, caminho crítico, linha de base, data de status, valor agregado, etapa, contrato por entrega]
sinonimos: [dicionário, vocabulário, terminologia]
---

# Glossário

> Termos confirmados no sistema. Itens marcados 🚧 serão detalhados quando o módulo
> correspondente for documentado.

## Conceitos gerais

**SenaHub** — Plataforma de gestão integrada (ERP) do escritório de engenharia BIM.

**Perfil (papel / role)** — Categoria de usuário que define o que cada pessoa pode ver
e fazer. São 9: Administrador, Coordenador, Administrativo, CLT, Estagiário, Projetista
PJ, Freelancer, Cliente e TI.

**Permissão (`recurso:ação`)** — Controle fino do que um perfil pode fazer em cada área
(ex.: criar, editar, ver). Se você não tem a permissão, o botão/menu não aparece.

**Auditoria** — Registro automático de quem fez o quê e quando, em cada alteração do
sistema. Não é possível burlar: toda ação fica gravada.

**Busca global (Ctrl K / ⌘ K)** — Caixa de busca rápida que encontra projetos,
clientes, tarefas, documentos, lançamentos, licitações e propostas a partir de 2
caracteres.

**Portal** — Visão externa, somente leitura, para o **Cliente** acompanhar os próprios
projetos.

**Breadcrumb (trilha de navegação)** — A sequência de links no topo que mostra onde
você está e permite voltar.

## Perfis (papéis)

| Termo | Significado |
| --- | --- |
| **Administrador** | Acesso total; ignora restrições de permissão. |
| **Coordenador** | Visão global de projetos e dados. |
| **Administrativo** | Rotinas administrativas, RH, financeiro, comercial. |
| **CLT** | Colaborador com vínculo trabalhista (ponto, holerite, banco de horas). |
| **Estagiário** | Colaborador em estágio. |
| **Projetista PJ** | Prestador pessoa jurídica; recebe por nota fiscal. |
| **Freelancer** | Prestador pontual. |
| **Cliente** | Visão externa: seus projetos e seu extrato. |
| **TI** | Acesso a Patrimônio/TI. |

## Módulos (áreas do sistema)

| Termo | O que é | Detalhe |
| --- | --- | --- |
| **Início / Dashboard** | Página inicial com indicadores e atalhos | 🚧 |
| **Projetos** | Acompanhamento de projetos e disciplinas | 🚧 |
| **Meu trabalho** | As tarefas/projetos atribuídos a você | 🚧 |
| **Tarefas** | Quadro de tarefas (kanban) | 🚧 |
| **Agenda** | Compromissos e prazos | 🚧 |
| **Comercial** | Propostas e funil de vendas | 🚧 |
| **Financeiro** | Lançamentos, contas a pagar/receber, extrato | 🚧 |
| **Documentos (Estúdio)** | Geração de documentos com campos dinâmicos | 🚧 |
| **Ponto** | Registro de jornada (batidas) | 🚧 |
| **RH / Folha CLT** | Recursos humanos e folha de pagamento | 🚧 |
| **Ferramentas** | Calculadoras de engenharia (normas NBR) | 🚧 |
| **Planejamento** | Cronograma do projeto (EAP): durações, dependências, caminho crítico, linha de base e Valor Agregado | [Planejamento](projetos/planejamento.md) |
| **Licitações** | Acompanhamento de licitações | 🚧 |
| **Qualidade** | Controle de qualidade | 🚧 |
| **Patrimônio / TI** | Bens e ativos de TI | 🚧 |
| **Chat** | Comunicação interna em tempo real | 🚧 |
| **Suporte** | Abertura de chamados | 🚧 |
| **Auditoria** | Consulta ao registro de ações | 🚧 |

## Termos de engenharia/negócio

**Entrada comercial** — Registro inicial de uma indicação, demanda espontânea, cliente recorrente,
prospecção ativa ou outro contato que possa se tornar um trabalho. A entrada guarda a origem e pode
ser acompanhada como lead ou abrir uma negociação imediatamente.

**Lead** — Demanda ou interesse comercial ainda em acompanhamento. Uma mesma empresa pode ter
leads diferentes para obras ou escopos diferentes.

**Disciplina** — Subárea técnica de um projeto (ex.: estrutural, hidráulica). Pode ser dividida em
**etapas** por fase. Veja [Projetos](projetos/projetos.md).

**Prazo de contrato** — A data combinada com o cliente. É o compromisso externo: aparece no
portal do cliente e nos contratos, e só muda por decisão de quem gerencia o projeto.

**Prazo planejado** — A data que a equipe persegue internamente. Nasce igual ao prazo de
contrato e é ela que manda na saúde do projeto, no atraso, nos alertas e na EAP. Quando uma
disciplina é reaberta para uma data mais distante, o prazo planejado desloca junto.

**EAP (Estrutura Analítica do Projeto)** — A lista em árvore das tarefas de um projeto (1, 1.1, 1.1.1…):
o **cronograma** do projeto, montado no [Planejamento](projetos/planejamento.md). No MS Project seria a
lista de tarefas com a numeração WBS.

**Atividade, agrupamento e marco** — Os três tipos de linha da EAP. A **atividade** tem duração; o
**agrupamento** reúne outras linhas e tem as datas delas (o menor início e o maior término); o **marco**
é uma data pontual, sem duração — uma entrega, por exemplo.

**Dependência (predecessora)** — "Esta tarefa só pode começar (ou terminar) depois daquela." Há quatro
tipos — **FS**, **SS**, **FF** e **SF** —, com um **atraso** opcional em dias úteis. É o que faz as datas
se recalcularem em cadeia quando uma tarefa muda.

**Folga** — Quantos dias úteis uma tarefa pode atrasar sem empurrar o término do projeto.

**Caminho crítico (CPM)** — A sequência de atividades com **folga zero**: se uma delas atrasa, o projeto
inteiro atrasa. CPM é o nome do método de cálculo.

**Linha de base (baseline, BL-00)** — A "foto" do cronograma no momento em que ele é aprovado: o
**combinado**. Replanejar cria a BL-01, BL-02… com um motivo, e as anteriores **nunca mudam** — é contra
elas que o sistema mede o desvio.

**Restrição de data (alfinete)** — Trava que prende uma tarefa a uma data, do jeito das restrições do MS
Project. A tarefa com restrição aparece marcada com um alfinete.

**Data de Status** — A data "até quando" o andamento está informado. Saúde do cronograma e Valor
Agregado olham para ela, e ao apurá-la o trabalho ainda não feito vai para depois dela (o "Reprogramar
trabalho não concluído" do MS Project).

**Valor Agregado (VP, VA, CR)** — Compara o **planejado** com o **realizado**: o **VP** é quanto deveria
estar feito até a Data de Status, o **VA** é quanto está feito (pelo percentual informado) e o **CR** é
o custo real das horas apontadas. Em **horas** para quem vê o planejamento; em **R$** só para quem tem
acesso ao financeiro. Veja [Valor Agregado](projetos/valor-agregado.md).

**Etapa (fase) da disciplina** — Divisão da disciplina em fases do catálogo (Básico, Executivo…), cada uma
com prazo, situação e **percentual do valor**. Aprovar uma fase **libera o pagamento dela**. Veja
[Etapas e pagamento por fase](projetos/etapas-e-pagamento-por-fase.md).

**Contrato por entrega** — Contrato de cliente cobrado por **marcos do cronograma**, e não por datas fixas.
Veja [Contrato por entrega](financeiro/contrato-por-entrega.md).

**Previsão de recebimento** — O dinheiro que deve entrar quando o marco de um contrato por entrega
acontece. Aparece no **fluxo de caixa**, mas **não é conta a receber** enquanto a parcela não é
**faturada**.

**Carga planejada** — As horas previstas no cronograma por pessoa e semana, contra a capacidade
disponível. Veja [Recursos](projetos/recursos.md).

**OFX** — Formato de extrato bancário usado na conciliação financeira. 🚧

**Holerite** — Demonstrativo de pagamento do colaborador CLT. 🚧

---

## Veja também

- [Guia de Início Rápido](quick-start.md)
- [FAQ](faq.md)
