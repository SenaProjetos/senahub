# Pool de recursos: fechamento das pendências

Texto do Ryan (planejamento), escrito com o Claude dele a partir de
`2026-11-25-pool-de-recursos-prompt-pendencias.md`, recebido em 25/11/2026. Registro sem edição. Ele complementa
`docs/melhoria-pool-de-recursos.md` (as decisões A–N). O que a equipe respondeu e o que ainda falta perguntar está em
`2026-11-25-pool-de-recursos-design.md`.

## 1. Decisões

| Pendência | Decisão | Motivo |
|---|---|---|
| **1. Arrastar em cronograma aprovado** | Arrastar a data só funciona em **rascunho**. Num aprovado a barra não se move, e a tela explica o motivo. Só se move com a **revisão aberta**. A revisão que muda datas planejadas ou o início do projeto fecha com **nova linha de base e motivo**. **Trocar a pessoa** por arrasto num aprovado continua livre, **com confirmação**, sem revisão. | Respeita a regra de 29/09/2026: depois de aprovado, não se mexe no planejado. |
| **2. Horas automáticas e herança de responsáveis** | As horas automáticas valem **só para atribuições novas**. Elas se **dividem entre os responsáveis na proporção da dedicação de cada um** (dois a 100% ficam meio a meio). Atribuições antigas sem horas ficam como estão, sem contar, até alguém digitar. | Evita carga dobrada pela herança e não mexe no que já existe. |
| **3. Marca de superalocação na EAP** | O **nome da pessoa fica em vermelho na coluna Recursos**, e o conflito aparece ao passar o mouse. A linha não é pintada. | O vermelho na linha já quer dizer "atrasada". |
| **4. Parceiro externo com nome** | Cadastro simples: **nome e disciplina**. Quem gere Recursos cadastra. Lista única para todos os projetos. Continua **sem horas e sem alerta de carga**. | A casa controla só prazo e entrega do parceiro. |
| **5. Dedicação por tarefa** | A dedicação é por **pessoa numa disciplina de um projeto** (não por tarefa). Preenche-se **na linha da disciplina na EAP**, e **Recursos mostra e também edita** o mesmo valor. O **padrão do cadastro de Recursos nunca muda** por isso. Na tabela das tarefas aparece só o responsável, sem porcentagem nem horas. As horas acompanham a duração. | Fica onde se escolhe o responsável e preserva o padrão. |
| **6. Cor por projeto** | **Automática**, com opção de trocar no cadastro do projeto, por quem tem permissão no projeto. Projetos que já existem recebem a cor automática na entrega. | Todo projeto nasce com cor, e dá para separar duas cores parecidas. |
| **7. Quem pode o quê** | **Ver** a tela por pessoa e o Planejamento geral: quem já vê Recursos. **Coordenador:** edita só o seu projeto. **Gerência (perfil novo):** faz o que o coordenador faz e toda a parte de planejamento (EAP, aprovação do cronograma, controle e datas reais, recursos), em todos os projetos. **Administrativo:** pode tudo, como já é. O que é restrito (custo por hora, RH, configurações) fica fora da Gerência. | Usa o que existe e dá apoio ao planejamento sem abrir o restrito. |
| **8. Data real que afeta um rascunho** | O aviso que o planejamento recebe ao salvar **lista também o rascunho afetado**. Ninguém mais é notificado. O vermelho aparece no rascunho quando alguém o abrir. | O rascunho é provisório e não vale incomodar a coordenação dele. |
| **9. O que dispara o aviso em cascata** | **Data real** e **Data de Status**. O % concluído e a revisão não disparam. | São os dois momentos em que o trabalho se move no tempo. A revisão já lista os conflitos ao aprovar. |
| **10. Planejamento geral** | **Só para ver e abrir** (clicar leva à faixa da pessoa em Recursos ou ao cronograma do projeto). **Nasce com os projetos recolhidos.** Filtros: projeto (aceita escolher vários), disciplina, pessoa, aprovado ou rascunho, e período. Mostra **quantos projetos** estão sendo vistos. | A edição fica na tela por pessoa e na EAP, sem duplicar regras. |
| **11. Entrega** | A equipe constrói e testa as partes na ordem dela (horas automáticas e conflito por dia, tela por pessoa só de leitura, aviso em cascata, arrasto, Planejamento geral, parceiro externo) e **publica tudo junto**. A dedicação por disciplina e a cor por projeto entram com a primeira parte. O perfil Gerência entra em qualquer ponto. **Sem data limite informada.** | Respeita "tudo de uma vez" e testa cada parte. |

## 2. Mudanças no documento original

**Seção 2 (Quem usa)**
- Troca "Planejamento" e "Coordenação" por: Coordenador (só o seu projeto), Gerência (perfil novo, todo o planejamento em todos os projetos) e Administrativo (tudo). Quem só vê: quem já vê Recursos.

**3.1 (Ao montar e aprovar)**
- Item 1: as horas automáticas valem só para atribuições novas e se dividem entre os responsáveis na proporção da dedicação. Sai "ajusta horas ou porcentagem na tarefa". A dedicação diferente do padrão é preenchida na linha da disciplina (decisão 5).

**3.2 (No acompanhamento)**
- Item 1: o aviso sai ao registrar a **data real** ou a **Data de Status**. O % concluído e a revisão não disparam.
- Item 2: acrescentar que o aviso do planejamento lista também os rascunhos afetados, sem notificar ninguém mais.

**3.3 (Tela por pessoa)**
- Item 3: cor por projeto automática, trocável no cadastro do projeto.
- Item 6: parceiro externo com nome (cadastro simples), sem horas e sem alerta.
- Item 8: trocar pessoa por arrasto num aprovado: livre, com confirmação.
- Item 9 (**reescrever**): "Em rascunho, o arrasto muda a data direto, com confirmação. Em cronograma aprovado, a barra não se move e a tela explica o motivo. Só se move com a revisão aberta. A revisão que muda datas planejadas ou o início do projeto fecha com nova linha de base e motivo. O sistema respeita as predecessoras e pergunta se move também as seguintes." Sai "vira desvio da linha de base".
- Acrescentar: coordenador vê as barras de outros projetos sem poder mexer, e a tela diz "Sem permissão neste projeto".

**3.4 (Planejamento geral)**
- Reescrever: só para ver e abrir, nasce recolhido, com os cinco filtros (projeto com seleção de vários), e mostra quantos projetos estão sendo vistos.

**3.5 (Ajustes no Gantt)**
- Item 1 (barra de ações): a equipe informa que já está feito, na linha de "Larguras padrão", e chega no próximo deploy.
- Item 2 (conflito na EAP): **reescrever** para "o nome da pessoa fica em vermelho na coluna Recursos, com o conflito ao passar o mouse. A linha não é pintada".
- Item 3 (marco): a equipe informa que o término digitável já foi feito em 25/11/2026 e vira a mesma data do início. A data real depois de aprovado já existe, na coluna "Data real" da visão Controle.

**Seção 4 (Regras)**
- Linha **B:** "atribuir já preenche as horas (duração × jornada)" vira "horas automáticas só em atribuições novas, divididas na proporção da dedicação".
- Linha **C:** o aviso sai com data real e Data de Status.
- Linha **D:** substituir "coordenação do cronograma aprovado afetado" por "coordenação do projeto afetado" (membros com papel de coordenador).
- Linha **H:** reescrever conforme a decisão 1 (arrastar só em rascunho ou com revisão aberta; trocar pessoa livre com confirmação).
- Linha **I:** acrescentar "cor por projeto automática, trocável no cadastro do projeto".
- Linha **K:** acrescentar "Planejamento geral só para ver".
- Linha **Extra (parceiro externo):** cadastro simples com nome e disciplina.
- Regras SE … ENTÃO: trocar "SE o arrasto muda data de cronograma aprovado ENTÃO confirma e vira desvio" por "SE o cronograma é aprovado e não há revisão aberta ENTÃO a barra não se move". Acrescentar a regra de permissões (decisão 7).

**Seção 5 (Exemplos)**
- Exemplo 3 (arrastar) **substituído** pelo Cenário A abaixo. Acrescentar o Cenário B.

**Seção 6 (O que não pode mudar)**
- Acrescentar: o padrão de dedicação do cadastro de Recursos não é alterado pelas dedicações por disciplina. O vermelho na linha da EAP continua significando "atrasada".

**Seção 7 (Fora do escopo)**
- Acrescentar: edição direta no Planejamento geral, aviso por mudança de % concluído ou de revisão, aviso a coordenação por rascunho afetado, perfil "assistente de planejamento" e "diretoria".

**Seção 8 (Pronto quando)**
- Trocar o item "Em cronograma aprovado, o arrasto vira desvio" por "Em cronograma aprovado sem revisão aberta, a barra não se move e a tela diz por quê".
- Trocar o item "tarefa em superalocação em vermelho na EAP" por "o nome da pessoa fica em vermelho na coluna Recursos".
- Acrescentar: horas automáticas só em atribuições novas e divididas pela dedicação; dedicação preenchida na disciplina e visível em Recursos, sem mudar o padrão; cor por projeto automática e trocável; perfil Gerência com permissões de planejamento em todos os projetos; Planejamento geral recolhido, com filtro de vários projetos e contador.

**Seção 9 (Prazo)**
- Substituir por: a equipe constrói e testa as partes na ordem dela e publica tudo junto. Data limite: a confirmar com o planejamento.

**Seção 10 (Dúvidas em aberto)**
- Remover: parceiro externo na EAP, dedicação por pessoa, campo de coordenação, permissões, botões de 24/11, cor do projeto, destaque no Gantt individual.
- Acrescentar os itens da parte 4 abaixo.

## 3. Cenários novos

**Cenário A: arrasto num cronograma aprovado**
- **Dado que** o X está aprovado, sem revisão aberta, e a "Modelagem" da Mireli vai de 23 a 25/11, e a Joice é a coordenadora do X,
- **quando** a Joice arrasta a "Modelagem" 2 dias para a frente na tela por pessoa,
- **então** a barra não se move, e a tela diz que o cronograma está aprovado e que é preciso abrir "Revisar planejamento".
- **E quando** a Joice abre a revisão e arrasta de novo, **então** o sistema respeita as predecessoras, pergunta "Mover também a Revisão interna e as seguintes?" e pede confirmação. A EAP do X mostra as novas datas. Ao fechar a revisão, o sistema cria uma nova linha de base e pede o motivo.
- **E se** a Joice arrasta a tarefa para a faixa do João Vitor, **então** troca o responsável com confirmação, sem precisar de revisão.
- **E se** o Ricardo, que coordena só o Y, tenta arrastar uma barra do X, **então** a barra não se move e a tela diz "Sem permissão neste projeto".

**Cenário B: horas automáticas com dois responsáveis**
- **Dado que** o "Detalhamento elétrico" do X tem 5 dias, jornada de 8 h, e dois responsáveis herdados, a Mireli e o João Vitor, ambos com dedicação de 100% nessa disciplina,
- **quando** a atribuição é criada,
- **então** as horas da tarefa se dividem **meio a meio**, e nenhum dos dois aparece ocupado o dia inteiro. Valor esperado por pessoa: **[o planejamento confere à mão]**.
- **E se** a dedicação da Mireli nessa disciplina do X passa para 50% (na linha da disciplina), **então** a divisão fica proporcional às dedicações e as horas acompanham a duração. Valores esperados: **[o planejamento calcula à mão]**. O padrão da Mireli no cadastro de Recursos continua o mesmo.
- **E se** a tarefa já existia antes da entrega, com pessoa atribuída e sem horas, **então** ela continua sem horas e sem contar na carga, até alguém digitar.

## 4. O que ficou em aberto

**A confirmar pela equipe**
- Como o perfil **Gerência** é criado e quais permissões ele recebe. A permissão de coordenação hoje é por projeto, e a Gerência precisa valer em todos.
- O manual cita um **"Cronograma geral"** só para leitura, com os projetos lado a lado. É a mesma tela do Planejamento geral, ou outra?
- O manual cita uma linha de **terceiro** (sem horas, sem card). Como ela se relaciona com o novo cadastro de parceiro externo?
- O cadastro do parceiro externo: onde fica (em Recursos?) e quem tem permissão além de quem gere Recursos.
- Como aplicar a cor automática aos projetos que já existem.

**Depende do planejamento**
- **Aviso à coordenação** quando o administrativo ou a Gerência mexe numa barra de um projeto que não é dele: não foi decidido.
- **Data limite** da entrega: não informada.
- **Aprovação visual:** só dois pontos dos mockups foram aprovados. A tela por pessoa, o Planejamento geral e o aviso ao salvar seguem em alinhamento.
- Validar na prática, depois da entrega, as regras de horas automáticas e de rascunho enxergando rascunho com cronogramas reais.
