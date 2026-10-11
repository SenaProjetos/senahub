<!--
Reforma do rateio de horas por projeto. Começou com perguntas em 15/09/2026 (transcrição 8b720eca,
pasta principal). Este arquivo tem três partes: as decisões já tomadas (a regra vigente), as
perguntas ainda em aberto e, no fim, o histórico das rodadas com o texto original. Nada da reforma
foi implementado até 10/10/2026.
-->

# Rateio de horas por projeto: decisões

Atualizado em 10/10/2026. Todas as perguntas foram respondidas (rodadas 1 a 6); não há nada em aberto.

## Decisões tomadas

### Custo da hora

1. **Conta:** custo da hora = custo do mês da pessoa ÷ horas que ela marcou no mês. O custo do mês vem do **holerite real**. No mês sem holerite, vem do salário do **histórico contratual**, que está preenchido para todos.
2. **Encargos:** cada tipo de contrato tem uma tabela própria de encargos, **com data de validade**. Cada mês usa a versão que valia nele.
3. **INSS da empresa:** a empresa está no Simples, no Anexo III ou V, conforme o Fator R (folha ÷ faturamento). Nos dois anexos, o INSS da empresa já vem no DAS mensal, então **não entra no custo da hora**.
4. **CLT:**

   | Item | Conta | % do salário |
   |---|---|---|
   | FGTS sobre o salário | 8% | 8,00% |
   | Reserva de 13º | salário ÷ 12 | 8,33% |
   | Reserva de férias + 1/3 | (salário + 1/3) ÷ 12 | 11,11% |
   | FGTS sobre 13º e férias | 8% × (8,33% + 11,11%) | 1,56% |
   | Multa de 40% do FGTS, sobre todo o FGTS depositado | 40% × (8,00% + 1,56%) | 3,82% |
   | **Subtotal** | | **32,82%** |
   | Aviso prévio, reserva de 100% | salário ÷ 30 × (30 + 3 × anos completos), no máximo 90 dias; fração de ano não conta | 8,33% no 1º ano; depois, 0,83% (3 dias por ano), até chegar a 90 dias |

   A reserva do aviso prévio acompanha o que seria pago numa demissão. No 1º ano, reserva-se 1/12 do aviso por mês. Depois, só o acréscimo de 3 dias por ano completo, até o teto de 90 dias.

   Além da tabela: vale-transporte (R$ 200) e vale-refeição (R$ 550). São valores fixos por mês, sem desconto em folha, e não são pagos nas férias. Num mês com parte em férias, entram proporcionais aos dias fora das férias (*entendimento nosso — corrigir se não for assim*). O desconto por falta pode entrar no futuro.
5. **Estagiário:** a bolsa é paga fora do relatório do contador e entra na folha mensal do sistema. Ela já inclui transporte e alimentação. Além da bolsa: a reserva do recesso (1/12 da bolsa, sem 1/3) e a **taxa do IEL, de R$ 85 por mês**, que cobre o seguro. A taxa é um item da tabela de encargos do estágio e vale só para quem foi contratado pelo IEL. Quem foi contratado direto não tem esse custo, então o cadastro do estagiário precisa dizer por onde ele foi contratado. A taxa não aparece no holerite do estagiário, só nos custos.
6. **Sócio:** o custo é o pró-labore bruto cadastrado no vínculo, com o histórico de reajustes. Os 11% de INSS são descontados do próprio sócio e não são custo a mais. **Exceção à decisão 1:** a hora do sócio é o pró-labore dividido por uma **jornada de referência**, e não pelas horas apontadas. O que ele não apontar em projeto fica em "não alocado". A jornada de referência é a carga semanal do vínculo do sócio, convertida para os dias úteis do mês (*entendimento nosso — corrigir se não for assim*).
7. **PJ e freelancer:** entram só com horas. O custo deles é o pagamento feito na Produção.
8. **Início:** o cálculo novo vale a partir de **outubro de 2026**. Os meses fechados antes ficam com o cálculo antigo. Um botão "recalcular" permite refazer um mês antigo, com registro de quem fez e quando.

### Horas

9. As horas fora de projeto ficam numa linha própria, "não alocado".
10. Reunião interna ou externa pode ser ligada a um projeto. Nesse caso, entra no custo do projeto, separada, como "Reuniões", e **sem disciplina**.
11. Marca horas num projeto quem está na **equipe** ou é **responsável por alguma disciplina** dele. Quem tem um card atribuído no projeto também conta como parte dele. O ponto lista as demandas (tarefas) da pessoa. Quem está na equipe sem disciplina marca horas como "coordenação/apoio".
12. Ninguém marca horas numa disciplina que não é sua. A disciplina vem da tarefa escolhida no ponto. Com uma disciplina só no projeto, ela é escolhida automaticamente e a tarefa continua opcional. Com duas ou mais, **escolher a tarefa é obrigatório**.
13. Para corrigir o ponto numa data passada, vale o **histórico de responsáveis por disciplina, com datas**. O sistema ainda não guarda esse histórico.
14. A correção de ponto em mês fechado é permitida. O mês fica marcado como "alterado depois do fechamento", com a diferença visível.
15. A sessão de trabalho é cortada na virada do mês.
16. **Horas orçadas = horas da linha de base da EAP.** Fica cancelado o campo de horas previstas digitado na disciplina (decisão 6 da 2ª rodada). **Planejado** = horas da EAP atual, que mudam a cada replanejamento. **Realizado** (horas e custo) = ponto. **Avanço** = % concluído da EAP. A comparação entre gasto e avanço é o Valor Agregado, que o cronograma já calcula. Projeto sem EAP aprovada mostra só o realizado.

### Fechamento e acesso

17. O fechamento do mês não muda. Reabrir é uma ação separada, **com motivo obrigatório**, feita pelas mesmas pessoas que fecham. Ao reabrir, os funcionários dão ciência e assinam de novo, e o histórico dos holerites fica guardado.
    *Conferido no sistema:* reabrir a folha já cancela as assinaturas dos holerites. Faltam o motivo obrigatório e a cópia da versão assinada antes da reabertura.
18. O alerta de mês não fechado olha todos os meses em aberto. A margem mostra os meses não fechados em vez de zero.
19. **Ver horas** e **ver custo** são permissões separadas. O coordenador vê as horas de cada pessoa do projeto, tanto o coordenador pelo papel no projeto (que vira uma lista fixa) quanto o perfil de acesso Coordenador. Os demais veem só as próprias horas e o total por disciplina.
20. O fechamento da folha mostra o **custo total** ao admin e ao RH, e **nunca** aos projetistas.

### Financeiro

21. Hoje o financeiro não recebe as guias da folha. Daqui em diante, ao fechar a folha da competência, o sistema lança **quatro** contas a pagar:

    | Conta a pagar | Valor (do relatório do contador) | Vencimento |
    |---|---|---|
    | Salários líquidos (já é lançada hoje) | total líquido | 5º dia útil do mês seguinte |
    | INSS descontado dos funcionários | total de INSS | dia 20 do mês seguinte |
    | Imposto de renda descontado dos funcionários | total de IRRF | dia 20 do mês seguinte |
    | FGTS | total de FGTS | dia 20 do mês seguinte |

    O vale-transporte e o vale-refeição também são lançados junto com o salário. O 13º e as férias são lançados só quando pagos, porque a reserva mensal existe só no custo da hora. O DAS continua como é hoje.

22. **Categorias:** "Folha CLT" e "Estagiários" ganham subcategorias, espelhando o plano de contas do contador:

    | Categoria do SenaHub | O que entra | Conta do contador |
    |---|---|---|
    | Folha CLT → Salários | líquido + INSS e IR descontados (salário bruto) | Salário e Ordenados |
    | Folha CLT → FGTS | guia do FGTS | FGTS |
    | Folha CLT → 13º salário | quando pago | 13º Salário |
    | Folha CLT → Férias | quando pagas | Férias |
    | Folha CLT → Rescisões e aviso prévio | quando há demissão | Indenizações e Aviso Prévio |
    | Folha CLT → Vale-transporte | R$ 200 por pessoa | obrigação: Vale Transporte (3717); despesa: a definir se um dia for exportado |
    | Folha CLT → Vale-refeição | R$ 550 por pessoa | Vale Alimentação (3710) |
    | Estagiários → Bolsa | bolsa do mês | Bolsa Estágio |
    | Estagiários → Taxa do IEL | R$ 85 por estagiário | Seguros (2926) |

23. **Plano do contador:** a equipe de projeto (projetistas) vai em Despesas com Pessoal **operacionais** (3.1.1). A equipe administrativa (RH, financeiro, TI etc.) vai em Despesas com Pessoal **administrativas** (3.1.2). A conta depende do setor da pessoa.
24. **Exportação contábil:** nada da folha vai na exportação mensal para o contador: nem as guias, nem vale-transporte, vale-refeição, bolsa ou taxa do IEL. Ele já tem esses dados no sistema dele. As categorias acima ficam marcadas como "não exportar".

---

# Histórico

O texto abaixo é o original de cada rodada, mantido como referência. As decisões que valem estão no topo deste arquivo.

## 3ª rodada de perguntas (15/09/2026)

### O que foi decidido na rodada anterior

1. **Frentes A e B juntas:** a melhoria na forma de mostrar os números e a correção do cálculo saem na mesma entrega.
2. **Encargos:** cada tipo de contrato vai ter uma tabela própria de encargos, montada a partir do holerite real e do que a empresa de fato recolhe. A tabela pronta de obras não será usada.
3. **PJ e freelancer:** entram só com horas; o custo deles é o pagamento feito na Produção. O sócio com pró-labore entra com custo de hora. O sistema passa a olhar o **tipo de contrato** da pessoa, não o perfil de acesso.
4. **Ponto corrigido depois do fechamento:** a correção é permitida, e o mês fica marcado como "alterado depois do fechamento", com a diferença visível.
5. **Horas fora de projeto:** ficam fora dos projetos, numa linha própria. Reunião interna e reunião externa podem, **opcionalmente**, ser ligadas a um projeto.
6. **Horas previstas:** cada disciplina ganha um campo de horas previstas, já preparado para receber os dados da EAP completa que está sendo planejada.
7. **Quem vê horas:** o coordenador vê as horas de cada pessoa do projeto; os demais membros veem só as próprias horas e o total por disciplina.
8. **Escolha da disciplina:** quem é responsável por **uma** disciplina no projeto não escolhe nada, porque o sistema já sabe qual é. Quem é responsável por **duas ou mais** escolhe numa lista que só mostra as dela. **Ninguém pode marcar horas numa disciplina que não é sua.**

### ⚠️ Correção importante sobre a rodada anterior

Na pergunta sobre encargos, o texto dizia que a empresa paga "cerca de 20% de INSS patronal". **Isso pode não valer para este escritório.**

O relatório de folha do contador, que o sistema importa, traz em todos os meses a frase **"Empresa optante pelo Super Simples"**. Em empresas do Simples Nacional, a parte do INSS que cabe à empresa **normalmente já vem dentro da guia única mensal (DAS)** e não é paga separadamente. Isso depende do anexo do Simples em que a empresa está, e **só o contador pode confirmar**. Se estiver dentro do DAS, esses 20% não entram no custo da hora; se entrarem, o custo da equipe CLT fica exagerado.

Também estava errado dizer que o holerite não traz o FGTS:
- O relatório do contador **traz o FGTS de cada funcionário**. Hoje o sistema lê o total, não usa e descarta. Dá para passar a guardar esse valor pessoa por pessoa.
- O **INSS que aparece no holerite é o desconto do funcionário**: sai do salário dele, não é custo a mais para a empresa.

---

### Pergunta 9: O que entra na tabela de encargos de cada tipo de contrato?

Já foi decidido que cada tipo de contrato terá sua tabela. Falta definir **quais itens entram em cada uma**. Uma proposta inicial, para o contador validar ou corrigir:

**CLT**
- FGTS: 8% do salário, com o valor real de cada pessoa tirado do relatório do contador.
- Reserva mensal para o 13º: cerca de 1/12 do salário por mês.
- Reserva mensal para férias + 1/3: cerca de 1/9 do salário por mês.
- FGTS sobre o 13º e as férias.
- INSS da empresa: **só se não estiver dentro do DAS**.

**Estágio**
- Seguro obrigatório contra acidentes.
- Reserva para o recesso remunerado (as "férias" do estagiário).
- Não tem FGTS nem INSS da empresa.

**Pró-labore (sócio)**
- INSS sobre o pró-labore, se a empresa recolher à parte.

**Perguntas para o contador:**
- **(a)** A empresa está em qual anexo do Simples? O INSS da empresa (a "cota patronal") está dentro do DAS ou é pago à parte?
- **(b)** A lista acima está completa? Falta ou sobra algum item?
- **(c)** Algum benefício pago pela empresa deve entrar como custo da pessoa, como vale-refeição, plano de saúde ou vale-transporte (a parte que a empresa paga)?

**Sugestão:** esperar a resposta do contador antes de definir qualquer percentual. Colocar um número "de mercado" agora e trocar depois faria as margens mudarem duas vezes.

---

### Pergunta 10: A tabela de encargos muda com o tempo?

Encargos e regras mudam: reajuste de alíquota, mudança de anexo do Simples, inclusão de um benefício novo.

**Exemplo:** em janeiro de 2027 a empresa passa a pagar plano de saúde para os CLT. Com uma tabela única e fixa, ao atualizar a tabela, qualquer mês ainda aberto de 2026 também passaria a incluir o plano de saúde, que nem existia na época.

**Opções:**
- **(a) Tabela com data de validade.** Cada versão vale a partir de um mês, por exemplo "vale de 01/2027 em diante". Meses anteriores usam a versão da época.
- **(b) Tabela única.** Mudou, vale para tudo que ainda não foi fechado.

**Sugestão: (a).** É o mesmo princípio do fechamento travado: o custo de um mês deve refletir as regras daquele mês.

---

### Pergunta 11: Custo da hora com salário cadastrado ou holerite real? E dividido por quais horas?

São duas partes da mesma conta: **custo da hora = custo do mês da pessoa ÷ horas**.

**Parte 1: de onde vem o custo do mês?**
- **(a) Do salário cadastrado** na ficha da pessoa, mais a tabela de encargos. É estável e existe para todos os meses.
- **(b) Do holerite real do mês**, que inclui horas extras, bonificações e faltas descontadas, mais os encargos. É mais exato, mas o holerite só existe nos meses em que a folha foi importada. Para os meses anteriores seria preciso usar (a).

**Parte 2: dividir por quais horas?**
- **(x) Pelas horas previstas na jornada da pessoa** (a escala dela, já descontando feriados e férias). Exemplo: 160h no mês.
- **(y) Pelas horas que a pessoa de fato marcou no mês.**

**Exemplo que mostra a diferença:** salário mais encargos de R$ 8.000 num mês com jornada de 160h. A pessoa trabalhou 200h (40h a mais, que foram para o banco de horas, não pagas como extra).
- Com **(x)**, a hora custa R$ 50. As 200h marcadas somam R$ 10.000 de custo nos projetos, R$ 2.000 a mais do que a empresa realmente gastou.
- Com **(y)**, a hora custa R$ 40. As 200h somam exatamente os R$ 8.000 gastos. Em compensação, o valor da hora dessa pessoa muda de um mês para outro.

**Sugestão: (b) com (a) como reserva, e (y).** Com essa combinação, a soma do custo de horas de uma pessoa bate com o que ela realmente custou no mês, incluindo as horas fora de projeto, que aparecem na linha própria de "não alocado". Um detalhe técnico que muda o resultado: o salário de meses passados deve vir do **histórico de reajustes** da pessoa (quanto ela ganhava naquele mês), não do salário de hoje. **Pergunta ao RH:** o histórico de reajustes está preenchido no cadastro das pessoas?

---

### Pergunta 12: Estagiário e sócio: de onde vêm os valores?

- **Estagiário:** a bolsa aparece no relatório de folha do contador ou é paga por fora? Se for por fora, o sistema usa o valor da bolsa cadastrado no contrato do estagiário.
- **Sócio com pró-labore:** nas folhas analisadas, o relatório do contador não traz o pró-labore. Existe a categoria "Pró-labore / retiradas" no financeiro.

**Opções para o sócio:**
- **(a)** Usar o valor de pró-labore cadastrado no contrato do sócio.
- **(b)** Usar o que foi lançado no financeiro como pró-labore no mês.
- **(c)** Um valor de hora definido diretamente pelos sócios.

**Sugestão para o sócio: (a).** "Retiradas" costuma misturar pró-labore com distribuição de lucro, e lucro não é custo de hora. A opção (c) faz sentido se os sócios preferirem que a hora deles reflita o valor de mercado, e não o pró-labore.

---

### Pergunta 13: A despesa de folha no financeiro está menor que o custo real (achado lateral)

Isso não é do rateio, mas apareceu na análise e afeta a ideia de "aproveitar os lançamentos do financeiro".

Quando a folha CLT é fechada no sistema, a despesa lançada no financeiro é **só o valor líquido**, o que caiu na conta dos funcionários. **Ficam de fora:**
- o INSS e o Imposto de Renda descontados dos funcionários, que a empresa recolhe em guia;
- o FGTS.

**Perguntas ao financeiro:**
- **(a)** Hoje as guias de INSS, IRRF e FGTS são lançadas à mão no financeiro? Em qual categoria?
- **(b)** O fechamento da folha deve passar a lançar o custo completo (líquido + guias + FGTS)?

**Sugestão:** tratar como uma correção separada, mas antes de usar o financeiro como fonte de custo de pessoal. Até lá, o rateio usa o relatório do contador, que traz os valores completos por pessoa.

---

### Pergunta 14: Os meses que já foram fechados

Com a entrega única, as margens caem de uma vez quando o cálculo novo entrar. Os meses já fechados ficam com o cálculo antigo, que não tinha encargos.

**Opções:**
- **(a) Congelados para sempre.** A tela avisa "até MM/AAAA: cálculo antigo, sem encargos".
- **(b) Botão de recalcular.** A gestão pode refazer um mês antigo com o cálculo novo, com registro de quem fez e quando.
- **(c) Recalcular tudo automaticamente** na entrega.

**Sugestão: (b).** Congelar para sempre deixa a margem de projetos longos misturando dois cálculos. Recalcular tudo automaticamente muda números que alguém pode já ter usado numa decisão ou numa conversa com cliente. O botão resolve os dois lados: quem precisa refaz, com rastro.

**Pergunta complementar:** a partir de **qual mês** o cálculo novo passa a valer?

---

### Pergunta 15: Reunião ligada a um projeto conta como custo do projeto?

Ficou decidido que uma reunião (interna ou externa) pode ser ligada a um projeto. Falta dizer **o que acontece com o custo dela**.

**Exemplo:** duas pessoas passam 2h em reunião com o cliente do projeto X.

**Opções:**
- **(a) Entra no custo do projeto X** e aparece separada dentro dele, como "Reuniões: 4h, R$ X".
- **(b) Entra no custo do projeto X** misturada com as demais horas.
- **(c) Não entra no custo.** O projeto fica só como anotação, e o custo vai para "não alocado".

**Sugestão: (a).** Se a reunião foi sobre o projeto, é custo do projeto. Mostrar separado ajuda a responder "quanto esse cliente consome de reunião?".

**Pergunta complementar:** reunião ligada a projeto precisa de disciplina? **Sugestão:** não, porque reunião de projeto costuma envolver várias disciplinas ao mesmo tempo.

---

### Pergunta 16: Horas previstas na disciplina e na EAP: qual vale?

A EAP do sistema já permite ligar cada tarefa a uma disciplina. Quando a EAP completa existir, a mesma disciplina pode ter **dois números de previsão**: o que foi digitado na disciplina e a soma das tarefas da EAP.

**Exemplo:** a disciplina Estrutural tem "200h previstas" digitadas. As tarefas da EAP dessa disciplina somam 240h.

**Opções:**
- **(a) A EAP manda.** Se existe EAP com horas, o campo da disciplina fica travado e mostra a soma.
- **(b) São dois números diferentes, com nomes diferentes.** "Horas orçadas" é o que foi vendido e prometido na proposta, digitado na disciplina. "Horas planejadas" é a soma da EAP. A tela mostra **orçado × planejado × realizado**.
- **(c) O número digitado manda**, e a EAP serve só para o cronograma.

**Sugestão: (b).** Os dois números respondem perguntas diferentes: "vendemos barato?" (orçado × realizado) e "planejamos mal?" (planejado × realizado). Juntar os dois esconde qual foi o erro.

---

### Pergunta 17: Quem pode marcar horas num projeto?

**Hoje o sistema não confere nada.** Qualquer pessoa pode direcionar as horas dela para qualquer projeto, mesmo sem fazer parte da equipe. A decisão 8 trava as **disciplinas**, mas o **projeto** continua aberto.

**Situações a decidir:**
- Uma pessoa **fora da equipe** do projeto, pode marcar horas nele?
- O **coordenador** do projeto, que não é responsável por nenhuma disciplina, marca horas como?
- Um **estagiário de apoio**, que está na equipe mas não é responsável por nenhuma disciplina, marca horas como?

**Opções:**
- **(a)** Só marca horas quem está na **equipe do projeto** ou é **responsável por alguma disciplina** dele. Quem está na equipe sem disciplina marca horas no projeto sem disciplina, e essas horas aparecem como "coordenação/apoio".
- **(b)** Só responsáveis por disciplina. O coordenador sem disciplina não marca horas no projeto.
- **(c)** Continua aberto para qualquer pessoa.

**Sugestão: (a).** Fecha a porta de horas lançadas em projeto errado, sem impedir o trabalho de coordenação e apoio, que é real e tem custo.

---

### Pergunta 18: Quem é o "coordenador do projeto"?

A decisão 7 dá ao coordenador acesso às horas de cada pessoa. Hoje, "coordenador" pode significar duas coisas no sistema:
- **Na equipe do projeto:** cada membro tem um "papel" escrito à mão, como "coordenador" ou "projetista". Quando uma proposta é aceita, o responsável comercial entra automaticamente com o papel "coordenador".
- **No perfil de acesso:** existe o perfil "Coordenador", que enxerga todos os projetos.

**Opções:**
- **(a)** Só quem tem o papel "coordenador" **naquele projeto**. Nesse caso o papel deixa de ser texto livre e vira uma opção fixa, para não haver "coordenador", "Coord." e "coordenação" ao mesmo tempo.
- **(b)** Quem tem o perfil de acesso Coordenador, em todos os projetos.
- **(c)** Os dois.

**Sugestão: (c).** O coordenador do projeto precisa ver a própria equipe. O perfil Coordenador já enxerga todos os projetos, então faz sentido que veja as horas também.

---

### Pergunta 19: Quem fecha e quem reabre o mês?

**Hoje:** RH e gestão (administrador, supervisor e administrativo) podem fechar e refechar.

**Situações a decidir:**
- **(a)** Reabrir um mês fechado exige **motivo por escrito**?
- **(b)** Quem pode **reabrir**: as mesmas pessoas que fecham, ou só os sócios?
- **(c)** Quando um mês fechado fica "alterado depois do fechamento" (decisão 4), quem é **avisado**?

**Sugestões:** (a) sim, motivo obrigatório; (b) as mesmas pessoas que fecham, porque o motivo e o registro já garantem o controle; (c) quem fechou aquele mês, mais o RH.

---

### Pergunta 20: Correção de ponto e disciplina de quem já saiu dela

O sistema **não guarda o histórico** de quem foi responsável por qual disciplina e quando. Guarda só quem é responsável **hoje**.

**Situação:** em março, Ana era responsável pela disciplina Hidráulica e trabalhou nela. Em abril, Hidráulica passou para outra pessoa. Em maio, o RH precisa corrigir um dia de março da Ana. Pela regra "nunca em disciplina não atribuída", Hidráulica não aparece mais na lista dela.

**Opções:**
- **(a)** Na **correção feita pelo RH ou pela gestão**, aparecem todas as disciplinas do projeto. A regra rígida vale só para quem marca as próprias horas no dia a dia.
- **(b)** Passar a guardar o histórico de responsáveis, com datas, e mostrar as disciplinas em que a pessoa era responsável **naquela data**.
- **(c)** Não permitir. A hora corrigida fica sem disciplina.

**Sugestão: (b), com (a) como solução até o histórico existir.** O histórico com datas é o certo e serve para outras coisas (quem respondia pela disciplina quando algo aconteceu). Mas as atribuições antigas não têm data, então no começo a correção pelo RH precisa de liberdade.

---


---

## Respostas do contador (10/10/2026)

O dono reescreveu a Pergunta 9 em oito perguntas e enviou ao contador.

| # | Pergunta enviada | Resposta do contador |
|---|---|---|
| 1 | Em qual Anexo do Simples estamos? O INSS da empresa (cota patronal) está todo dentro do DAS ou parte é recolhida à parte? | "Anexo 3, eventualmente anexo 4" |
| 2 | Quais encargos e reservas considerar para um CLT, para chegar ao custo mensal real? | "FGTS, décimo, férias, aviso prévio, multa 40%" |
| 3 | Quais custos obrigatórios para estagiários, principalmente seguro e recesso? | "seguro e férias a cada um ano de estágio" |
| 4 | Quais encargos sobre o pró-labore dos sócios? | "INSS – 11% sobre o pró-labore" |
| 5 | Existem outros encargos, reservas ou obrigações que deveriam entrar? | "a priori, não" |
| 6 | Como calcular a reserva mensal de férias e 13º, e os encargos sobre elas? | "salário / 12 = décimo; salário / 12 + 1/3 do salário = férias" |
| 7 | Quais benefícios entram como custo da pessoa e quais como custo geral da empresa? | "custo direto da pessoa: INSS, vale-transporte (6%); custo geral da empresa: FGTS, décimo, férias" |
| 8 | Composição dos encargos de cada tipo de contrato, em percentual ou fórmula | sem resposta |

### Como lemos cada resposta

1. **Anexo III, às vezes Anexo IV.** No Anexo III, o INSS da empresa (os 20% sobre a folha, mais o seguro de acidente de trabalho e as contribuições a terceiros) já está dentro do DAS. **Consequência:** nos meses de Anexo III, esse INSS **não** entra no custo da hora. No Anexo IV, pela lei do Simples, o INSS da empresa é pago fora do DAS. Se isso acontecer em algum mês, o custo da equipe sobe naquele mês. Ver pergunta 21.
2. **CLT.** Confirma a lista da Pergunta 9 e acrescenta dois itens: **aviso prévio** e **multa de 40% do FGTS**. Os dois só são pagos quando há demissão sem justa causa. Ver perguntas 22 e 23.
3. **Estagiário.** Confirma seguro e recesso. O recesso é de 30 dias por ano de estágio, então a reserva é 1/12 da bolsa por mês. A lei do estágio não manda pagar 1/3 sobre o recesso, então o 1/3 não entra. Falta o valor do seguro. Ver pergunta 24.
4. **Pró-labore.** Os 11% são a contribuição **do próprio sócio**, descontada do pró-labore, como o INSS que aparece no holerite do funcionário. Não é um custo a mais para a empresa: o custo do sócio é o pró-labore bruto. A parte da empresa (20%) segue a regra do item 1: está dentro do DAS no Anexo III. Ver pergunta 21.
5. **Outros encargos.** Nenhum. A lista fica fechada com os itens acima.
6. **Reservas de 13º e férias.** Lemos assim: **13º = salário ÷ 12** e **férias = (salário + 1/3) ÷ 12**. Ao pé da letra, a frase do contador daria 41,7% do salário por mês só de férias, o que não faz sentido. Esta leitura confere com as contas da Pergunta 9 (1/12 e 1/9). Ele não respondeu se o FGTS também incide sobre essas reservas. Ver pergunta 22.
7. **Benefícios.** A resposta separou o que é **descontado da pessoa** (o INSS dela e os 6% do vale-transporte) do que **a empresa paga** (FGTS, 13º, férias). É uma divisão contábil e responde outra pergunta. Ela não muda a decisão da 1ª rodada: FGTS, 13º e férias entram no custo da hora de cada pessoa. Continua em aberto quais benefícios pagos pela empresa entram no custo da pessoa. Ver pergunta 25.
8. **Percentuais.** Sem resposta. A pergunta 22 traz uma tabela pronta para o contador só conferir.

### Situação das perguntas 9 a 20

| Pergunta | Situação | Continua em |
|---|---|---|
| 9 – Itens da tabela de encargos | Lista respondida. Faltam o Anexo IV, os percentuais, o seguro do estágio e os benefícios | 21 a 25 |
| 10 – Tabela com data de validade | Em aberto | 28 |
| 11 – Custo do mês e divisor de horas | Em aberto | 26 e 29 |
| 12 – Estagiário e sócio | Em parte: o sócio custa o pró-labore bruto. Falta de onde vêm os valores | 24 e 30 |
| 13 – Folha no financeiro | Em aberto | 27 |
| 14 – Meses já fechados | Em aberto | 31 |
| 15 – Reunião ligada a projeto | Em aberto | 32 |
| 16 – Horas orçadas e planejadas | Em aberto | 33 |
| 17 – Quem marca horas num projeto | Em aberto | 34 |
| 18 – Quem é o coordenador | Em aberto | 35 |
| 19 – Fechar e reabrir o mês | Em aberto | 36 |
| 20 – Correção em disciplina antiga | Em aberto | 37 |
| Nova – disciplina pela tarefa do ponto | Nova | 38 |

---

## 4ª rodada de perguntas (10/10/2026)

A numeração continua a partir da 21. As perguntas estão separadas por quem responde.

### Para o contador

#### Pergunta 21: Quando a empresa fica no Anexo IV?

A resposta foi "Anexo 3, eventualmente anexo 4". Isso importa porque, pelo que entendemos da lei do Simples, o Anexo IV é o único em que o INSS da empresa (20% sobre salários e pró-labore) é pago **fora** do DAS. Nos meses em que isso acontece, cada hora da equipe custa bem mais.

Também é comum que escritórios de engenharia e arquitetura alternem entre o **Anexo III e o Anexo V**, conforme o Fator R (a folha de pagamento dividida pelo faturamento). No Anexo V, o INSS da empresa continua dentro do DAS.

- **(a)** É mesmo o Anexo IV, ou o Anexo V pelo Fator R?
- **(b)** Se for o Anexo IV: em que situação acontece? Nesses meses, o INSS da empresa é recolhido à parte? Com qual percentual, incluindo o seguro de acidente de trabalho (RAT)?
- **(c)** Nesses meses, a regra vale também para o pró-labore dos sócios?

**Por que importa para o sistema:** se o anexo pode mudar de um mês para outro, a tabela de encargos precisa saber qual anexo valeu em cada mês (ver pergunta 28).

#### Pergunta 22: A tabela do CLT está certa?

Montamos a tabela abaixo a partir das respostas. Basta conferir.

| Item | Conta | % do salário |
|---|---|---|
| FGTS sobre o salário | 8% | 8,00% |
| Reserva de 13º | salário ÷ 12 | 8,33% |
| Reserva de férias + 1/3 | (salário + 1/3) ÷ 12 | 11,11% |
| FGTS sobre 13º e férias | 8% × (8,33% + 11,11%) | 1,56% |
| Multa de 40% do FGTS | 40% × (8,00% + 1,56%) | 3,82% |
| **Subtotal** | | **32,82%** |
| Aviso prévio | ver pergunta 23 | a definir |
| INSS da empresa | só no Anexo IV (pergunta 21) | 0% no Anexo III |

- **(a)** O FGTS incide sobre o 13º e sobre as férias + 1/3?
- **(b)** A multa de 40% é calculada sobre todo o FGTS depositado, incluindo o FGTS do 13º e das férias?
- **(c)** Falta ou sobra algum item?

#### Pergunta 23: Aviso prévio e multa de 40%: reservar quanto?

Os dois só são pagos quando alguém é demitido sem justa causa. Uma reserva mensal de 100% trata cada pessoa como se fosse ser demitida.

**Para o contador:** qual a fórmula da reserva de aviso prévio? O aviso cresce com o tempo de casa: 30 dias, mais 3 dias por ano trabalhado.

**Para a gestão, depois da resposta do contador:**
- **(a) Reservar 100%.** É o lado seguro: a margem nunca é surpreendida por uma demissão.
- **(b) Reservar pela rotatividade real.** Por exemplo: se nos últimos anos 1 em cada 5 saídas foi demissão sem justa causa, reservar 20% do valor cheio.
- **(c) Não reservar.** O custo entra como despesa geral no mês em que a demissão acontece e não passa pelo custo da hora.

**Sugestão: (a)** para começar. O contador incluiu os dois itens na lista, e uma reserva que sobra é melhor do que uma margem que encolhe sem aviso. Dá para trocar para (b) quando houver histórico de saídas no sistema.

### Para o RH

#### Pergunta 24: Estagiário: seguro, bolsa e transporte

- **(a)** Quanto custa o seguro de cada estagiário, por mês ou por ano?
- **(b)** A bolsa aparece no relatório de folha do contador, ou é paga por fora? Se for por fora, o sistema usa o valor cadastrado no vínculo do estagiário.
- **(c)** O escritório paga auxílio-transporte aos estagiários? Em estágio não obrigatório, a lei do estágio exige o auxílio. Se é pago, ele entra no custo da hora do estagiário.

#### Pergunta 25: Quais benefícios a empresa paga, e quanto?

O contador separou o que é descontado do funcionário (INSS e os 6% do vale-transporte). Falta saber o que **a empresa** paga além do salário. Para cada benefício que existir, informe o valor mensal por pessoa:

- vale-transporte (a parte que passa dos 6% descontados do funcionário);
- vale-refeição ou vale-alimentação;
- plano de saúde ou odontológico;
- seguro de vida;
- outros.

**Sugestão:** todo benefício pago **por pessoa** entra no custo da hora dessa pessoa. Despesas que não dependem de quem trabalha (aluguel, café, software) ficam como custo geral, fora do rateio.

#### Pergunta 26: O histórico de salários está preenchido?

A ficha de cada pessoa tem o **histórico contratual**: cada reajuste fica guardado com a data em que passou a valer. É dele que o sistema tira quanto a pessoa ganhava num mês passado.

- **(a)** O histórico está preenchido para todos os CLT, estagiários e sócios?
- **(b)** Desde qual data?

Se o histórico estiver incompleto, os meses antigos usariam o salário de hoje, e o custo deles ficaria errado.

### Para o financeiro

#### Pergunta 27: A despesa de folha no financeiro está menor que o custo real

(Continua a Pergunta 13.) Quando a folha CLT é fechada no sistema, a despesa lançada no financeiro é **só o valor líquido**, o que caiu na conta dos funcionários. Com a empresa no Anexo III não existe guia separada de INSS da empresa. Mesmo assim, ficam de fora:
- o INSS e o Imposto de Renda descontados dos funcionários, que a empresa recolhe em guia;
- o FGTS.

- **(a)** Hoje essas guias são lançadas à mão no financeiro? Em qual categoria?
- **(b)** O fechamento da folha deve passar a lançar o custo completo (líquido + guias + FGTS)?

**Sugestão:** tratar como uma correção separada do rateio. Até lá, o rateio usa o relatório do contador, que traz os valores completos por pessoa.

### Para a gestão (sócios)

#### Pergunta 28: A tabela de encargos muda com o tempo?

(Repete a Pergunta 10.) Exemplo: em janeiro de 2027 a empresa passa a pagar plano de saúde. Ou, num mês, a empresa fica no Anexo IV.

- **(a) Tabela com data de validade.** Cada versão vale a partir de um mês. Os meses anteriores usam a versão da época.
- **(b) Tabela única.** Mudou, vale para tudo que ainda não foi fechado.

**Sugestão: (a).** O custo de um mês deve refletir as regras daquele mês. A possibilidade de alternar de anexo reforça essa escolha.

#### Pergunta 29: Custo do mês: salário cadastrado ou holerite? Dividido por quais horas?

(Repete a Pergunta 11.) **Custo da hora = custo do mês da pessoa ÷ horas.**

**Parte 1: de onde vem o custo do mês?**
- **(a) Do salário no histórico contratual**, mais a tabela de encargos. É estável e existe para todos os meses.
- **(b) Do holerite real do mês**, que inclui horas extras e faltas descontadas, mais os encargos. É mais exato, mas só existe nos meses em que a folha foi importada. Nos outros, usa-se (a).

**Parte 2: dividido por quais horas?**
- **(x) Pelas horas da jornada** (a escala, já descontando feriados e férias). Exemplo: 160h.
- **(y) Pelas horas que a pessoa marcou no mês.**

**Exemplo:** salário mais encargos de R$ 8.000 num mês de jornada de 160h. A pessoa trabalhou 200h (40h foram para o banco de horas).
- Com **(x)**, a hora custa R$ 50. As 200h somam R$ 10.000 nos projetos, R$ 2.000 a mais do que a empresa gastou.
- Com **(y)**, a hora custa R$ 40. As 200h somam os R$ 8.000 gastos. Em compensação, o valor da hora muda de um mês para outro.

**Sugestão: (b) com (a) como reserva, e (y).** Assim a soma do custo de horas de uma pessoa bate com o que ela custou no mês, incluindo as horas fora de projeto, que aparecem na linha "não alocado".

#### Pergunta 30: Pró-labore do sócio: de onde vem o valor?

(Continua a Pergunta 12.) O contador confirmou que o custo do sócio é o pró-labore bruto. Falta escolher a fonte:

- **(a)** O pró-labore cadastrado no vínculo do sócio, com o histórico de reajustes.
- **(b)** O pró-labore pago no financeiro no mês. Na 3ª rodada isso era arriscado, porque "retiradas" misturava pró-labore com lucro. Hoje a distribuição de lucros tem categoria própria, então essa mistura acabou.
- **(c)** Um valor de hora definido pelos sócios (por exemplo, o valor de mercado).

**Sugestão: (a).** É a mesma base do CLT (cadastro + histórico) e não depende do dia em que o pagamento foi feito. A opção (c) faz sentido se os sócios quiserem que a margem reflita o valor de mercado da hora deles, e não o pró-labore.

#### Pergunta 31: Os meses que já foram fechados

(Repete a Pergunta 14.) Quando o cálculo novo entrar, as margens caem de uma vez. Os meses já fechados ficam com o cálculo antigo, sem encargos. Pela tabela da pergunta 22, o custo de cada CLT sobe cerca de 33%, antes do aviso prévio e dos benefícios.

- **(a) Congelados para sempre**, com o aviso "até MM/AAAA: cálculo antigo, sem encargos".
- **(b) Botão de recalcular.** A gestão refaz um mês antigo com o cálculo novo, com registro de quem fez e quando.
- **(c) Recalcular tudo automaticamente** na entrega.

**Sugestão: (b).** **Complemento:** a partir de qual mês o cálculo novo passa a valer?

#### Pergunta 32: Reunião ligada a um projeto conta como custo do projeto?

(Repete a Pergunta 15.) Hoje o ponto aceita **uma** destas opções por vez: projeto, reunião interna, reunião externa ou sem projeto. Ligar uma reunião a um projeto exige uma mudança no ponto.

Exemplo: duas pessoas passam 2h em reunião com o cliente do projeto X.

- **(a) Entra no custo do projeto X**, separada, como "Reuniões: 4h, R$ X".
- **(b) Entra no custo do projeto X**, misturada com as demais horas.
- **(c) Não entra.** O custo vai para "não alocado".

**Sugestão: (a).** Mostrar separado responde "quanto esse cliente consome de reunião?". Reunião de projeto não precisa de disciplina.

#### Pergunta 33: Horas orçadas na disciplina e horas planejadas na EAP

(Repete a Pergunta 16.) Desde a 3ª rodada, **a EAP já existe** e guarda as horas de cada pessoa em cada atividade. O campo de horas orçadas na disciplina ainda não existe.

Exemplo: a disciplina Estrutural foi vendida com 200h. As atividades dela na EAP somam 240h.

- **(a) A EAP manda.** A disciplina mostra a soma da EAP e não tem campo próprio.
- **(b) Dois números com nomes diferentes:** "horas orçadas" (o que foi vendido, digitado na disciplina) e "horas planejadas" (a soma da EAP). A tela mostra **orçado × planejado × realizado**.
- **(c) O número digitado manda**, e a EAP serve só para o cronograma.

**Sugestão: (b).** Orçado × realizado responde "vendemos barato?". Planejado × realizado responde "planejamos mal?".

#### Pergunta 34: Quem pode marcar horas num projeto?

(Repete a Pergunta 17.) **O sistema ainda não confere nada:** qualquer pessoa pode direcionar as horas para qualquer projeto.

- **(a)** Só quem está na **equipe do projeto** ou é **responsável por alguma disciplina** dele. Quem está na equipe sem disciplina marca horas como "coordenação/apoio".
- **(b)** Só responsáveis por disciplina.
- **(c)** Continua aberto para qualquer pessoa.

**Sugestão: (a).**

#### Pergunta 35: Quem é o "coordenador do projeto"?

(Repete a Pergunta 18.) O coordenador vê as horas de cada pessoa (decisão 7 da rodada 2). Hoje "coordenador" pode ser:
- o **papel na equipe do projeto**, escrito à mão (ainda é texto livre);
- o **perfil de acesso Coordenador**, que enxerga todos os projetos.

- **(a)** Só o papel no projeto. O papel deixa de ser texto livre e vira uma lista fixa.
- **(b)** Só o perfil de acesso, em todos os projetos.
- **(c)** Os dois.

**Sugestão: (c).**

#### Pergunta 36: Quem fecha e quem reabre o mês?

(Repete a Pergunta 19.)
- **(a)** Reabrir exige motivo por escrito?
- **(b)** Quem reabre: as mesmas pessoas que fecham, ou só os sócios?
- **(c)** Quando um mês fechado é alterado depois do fechamento, quem é avisado?

**Sugestões:** (a) sim; (b) as mesmas pessoas que fecham; (c) quem fechou o mês, mais o RH.

#### Pergunta 37: Correção de ponto numa disciplina que já passou para outra pessoa

(Repete a Pergunta 20.) O sistema ainda guarda só quem é responsável **hoje** por cada disciplina, sem datas.

Exemplo: em março, Ana era responsável por Hidráulica. Em abril, Hidráulica passou para outra pessoa. Em maio, o RH corrige um dia de março da Ana, e Hidráulica não aparece mais na lista dela.

- **(a)** Na correção feita pelo RH, aparecem todas as disciplinas do projeto.
- **(b)** Guardar o histórico de responsáveis, com datas.
- **(c)** Não permitir: a hora corrigida fica sem disciplina.

**Sugestão: (b), com (a) até o histórico existir.**

#### Pergunta 38 (nova): A disciplina pode vir da tarefa escolhida no ponto?

Depois da 3ª rodada, o ponto ganhou a escolha da **tarefa** (o card) em que a pessoa está trabalhando. A escolha é opcional, e cada card de projeto já pertence a uma disciplina. A decisão 8 previa uma lista separada de disciplinas. Com a tarefa, a pessoa faria duas escolhas para dizer quase a mesma coisa.

- **(a) A disciplina vem da tarefa escolhida.** Sem tarefa, vale a decisão 8: com uma disciplina, ela é automática; com duas ou mais, aparece a lista.
- **(b) Campos separados:** a pessoa escolhe a tarefa e a disciplina.
- **(c) Tarefa obrigatória**, e a disciplina vem só dela.

**Sugestão: (a).** Uma escolha só, e o ponto continua funcionando sem tarefa, como foi decidido para não virar burocracia.

---

## Respostas da gestão (10/10/2026), texto original

Numeração das rodadas 3 e 4. As respostas estão aplicadas nas decisões do topo.

- 9: de acordo. INSS vem pelo DAS mensal.
- 9a: Anexo IV ou V, depende da emissão das NFs (resposta do contador).
- 9b: ver a resposta do contador (FGTS, 13º, férias, aviso prévio, multa de 40%).
- 9c: sim. Hoje são pagos transporte (R$ 200) e vale-refeição (R$ 550) aos CLT. No estagiário, o valor já está incluído na bolsa.
- 10: (a).
- 11: (b) com (a) como reserva, e (y). O histórico de reajustes está preenchido no cadastro das pessoas.
- 12: estagiário: por fora da folha do contador, mas entra na folha mensal do sistema. Sócio: (a).
- 13a: o financeiro não está sendo atualizado com essas informações; sugerir como lançar daqui pra frente.
- 13b: o fechamento da folha deve exibir o custo total ao admin e ao RH, para uma visão do custo total, mas não aos projetistas.
- 14: (b), vale a partir de outubro.
- 15: (a). Reunião sem disciplina, porque reunião de projeto costuma envolver várias disciplinas ao mesmo tempo.
- 16: (a). As horas orçadas são as horas da linha de base, e as horas efetivamente trabalhadas vão em função das atualizações da EAP e do Gantt de controle.
- 17: o controle de EAP já foi alterado para que o ponto da pessoa liste a demanda em que está trabalhando. Marca horas quem está na equipe do projeto ou é responsável por alguma disciplina dele. Quem está na equipe sem disciplina marca horas no projeto sem disciplina, e essas horas aparecem como "coordenação/apoio".
- 18: (c).
- 19: (a) sim, motivo obrigatório; (b) as mesmas pessoas que fecham; (c) já decidido em outra frente, verificar. Quando reaberto, exige ciência e assinatura dos funcionários novamente, com controle de histórico dos holerites.
- 20: (b).
- 21: Anexo V pelo Fator R.
- 22a: sim, o FGTS incide sobre o 13º e sobre as férias + 1/3.
- 22b: sim, a multa de 40% é calculada sobre todo o FGTS depositado, incluindo o do 13º e das férias.
- 22c: tudo ok.
- 23 (contador): valor do aviso = (salário bruto ÷ 30) × total de dias; total de dias = 30 + 3 × anos completos de trabalho; teto de 90 dias; frações de ano não contam.
- 23 (gestão): (a).
- 24a: o estágio é feito pelo IEL, e o valor pago por mês já cobre o seguro. Usar esse custo como custo do estagiário.
- 24b: por fora.
- 24c: sim, mas já está incluído no valor cadastrado da bolsa.
- 25: só transporte (R$ 200) e alimentação (R$ 550).
- 26: (a).

---

## 5ª rodada de perguntas (10/10/2026)

A numeração continua a partir da 39.

### Pergunta 39 (RH): Quanto a empresa gasta de fato com vale-transporte e vale-refeição?

A lei permite descontar do funcionário até 6% do salário no vale-transporte, limitado ao valor do vale. **Exemplo:** com salário de R$ 4.000, 6% dá R$ 240. Como o vale é de R$ 200, o desconto fica em R$ 200 e o vale-transporte **não custa nada** à empresa.

- **(a)** O desconto de 6% do vale-transporte é feito no holerite?
- **(b)** O vale-refeição tem algum desconto do funcionário?
- **(c)** Os dois são um valor fixo por mês, ou por dia trabalhado (diminuem nas férias e nas faltas)?

**Sugestão:** o custo da hora usa o que a empresa paga de fato, ou seja, o valor do vale menos o desconto do holerite.

### Pergunta 40 (RH ou financeiro): Quanto é a taxa do IEL?

- **(a)** Qual o valor mensal por estagiário? É igual para todos?
- **(b)** De onde o sistema tira o valor: de um valor fixo na tabela de encargos do estágio, ou do lançamento do IEL no financeiro de cada mês?

**Sugestão:** valor fixo na tabela do estágio, que já tem data de validade (decisão 2). Quando o IEL reajustar, cria-se uma versão nova da tabela.

### Pergunta 41 (financeiro, com conferência do contador): Como lançar a folha daqui em diante

Proposta. Ao fechar a folha da competência (o mês trabalhado), o sistema passa a lançar **quatro** contas a pagar, e não só uma:

| Conta a pagar | Valor (do relatório do contador) | Vencimento |
|---|---|---|
| Salários líquidos (**já é lançada hoje**) | total líquido | 5º dia útil do mês seguinte |
| INSS descontado dos funcionários | total de INSS | dia 20 do mês seguinte |
| Imposto de renda descontado dos funcionários | total de IRRF | dia 20 do mês seguinte |
| FGTS | total de FGTS | dia 20 do mês seguinte |

- O INSS e o imposto de renda descontados fazem parte do salário bruto. Por isso vão na mesma categoria dos salários. O FGTS vai numa categoria de encargos.
- O sistema já lê esses três totais do relatório do contador. Hoje ele lê e descarta.
- **13º e férias não são reservados no financeiro.** São lançados quando pagos: o 13º já tem folha própria. A reserva mensal existe só no custo da hora. O financeiro mostra o dinheiro que sai, e o custo da hora mostra o custo que se acumula.
- O DAS continua como é hoje: é o imposto sobre o faturamento e não faz parte da folha.

Perguntas:
- **(a)** O financeiro concorda com a proposta?
- **(b)** O vale-transporte e o vale-refeição são lançados no financeiro hoje? Em qual categoria?
- **(c)** Para o contador: os vencimentos da tabela estão certos?

### Pergunta 42 (contador e gestão): Como transformar o aviso prévio em reserva mensal?

A gestão decidiu reservar 100% do aviso prévio. O contador passou a fórmula. Falta definir quanto reservar **por mês**, porque o aviso não cresce todo mês: são 30 dias desde a contratação, mais 3 dias a cada ano completo.

**Exemplo:** salário de R$ 4.000. O aviso é de R$ 4.000 no 1º ano (30 dias), R$ 4.400 com 1 ano completo (33 dias) e R$ 4.800 com 2 anos (36 dias).

- **(a) 1/12 do aviso todo mês, sempre.** A reserva é de R$ 333 por mês, para sempre. Depois de 3 anos, a reserva soma cerca de R$ 12.000 para um aviso de R$ 5.200: quase o triplo do necessário.
- **(b) Reservar até chegar ao aviso devido e, depois, só o acréscimo.** No 1º ano, R$ 333 por mês. Depois, cerca de R$ 33 por mês (3 dias por ano). A reserva acompanha o que seria pago numa demissão.
- **(c) Dividir o aviso esperado na saída pelo tempo médio de casa da equipe.** Exemplo: com tempo médio de 4 anos, o aviso na saída é de R$ 5.600 (42 dias). R$ 5.600 ÷ 48 meses dá cerca de R$ 117 por mês.

**Sugestão: (b).** É a leitura fiel de "reservar 100%": nem falta nem sobra. A multa de 40% não tem esse problema, porque ela já cresce mês a mês junto com o FGTS depositado.

### Pergunta 43 (gestão): Horas orçadas, planejadas e realizadas

Ficou decidido que as horas orçadas são as da linha de base da EAP, e que "as horas efetivamente trabalhadas vão em função das atualizações da EAP e do Gantt de controle". Entendemos assim, e precisamos confirmar:

| Número | De onde vem |
|---|---|
| **Orçado** | Horas da linha de base aprovada. Ficam congeladas e não mudam com replanejamento |
| **Planejado** | Horas da EAP hoje. Mudam com cada replanejamento |
| **Realizado** | Horas marcadas no ponto |
| **Avanço** | O % concluído atualizado na EAP e no Gantt |

- **(a)** As horas e o custo realizados vêm do **ponto**, e a EAP mede o **avanço**? Ou as horas realizadas devem sair do % concluído da EAP?
- **(b)** Num projeto sem EAP aprovada, não há horas orçadas. A tela mostra só o realizado?

**Sugestão:** (a) o custo vem do ponto, porque é o que a empresa realmente pagou. O avanço vem da EAP. A comparação entre os dois (gastou 60% das horas para entregar 40%) já é calculada pelo sistema no Valor Agregado do cronograma. (b) Sim.

### Pergunta 44 (gestão): Ponto sem tarefa escolhida e pessoa com card fora da equipe

O ponto lista as demandas da pessoa, e a disciplina vem da demanda escolhida. Mas a escolha da tarefa é opcional, para o ponto não virar burocracia. Sobram dois casos:

- **(a)** A pessoa é responsável por **duas ou mais** disciplinas do projeto e não escolhe tarefa. Em qual disciplina ficam as horas?
  - (i) A escolha da tarefa passa a ser obrigatória só nesse caso. A lista de tarefas já mostra as disciplinas dela.
  - (ii) As horas ficam "sem disciplina" no projeto.
  - (iii) As horas vão para "coordenação/apoio".
- **(b)** A pessoa tem um card atribuído num projeto, mas não está na equipe nem é responsável por disciplina. Hoje o ponto já mostra esse projeto para ela. Ela pode marcar horas nele?

**Sugestão:** (a) (i): é a decisão 8 da 2ª rodada aplicada pela tarefa. (b) Sim: ter um card atribuído conta como fazer parte do projeto, e a disciplina vem do card.

### Pergunta 45 (sócios): Por quais horas dividir o pró-labore?

O sócio não bate ponto. Ele **aponta horas**, sem jornada. Pela decisão 1, o custo da hora é o custo do mês dividido pelas horas marcadas. Se o sócio aponta só as horas de projeto, todo o pró-labore cai nos projetos. Se aponta poucas horas, a hora dele fica muito cara.

**Exemplo:** pró-labore de R$ 10.000. O sócio apontou 40h em projetos e não apontou as horas de gestão. A hora dele custa R$ 250, e os R$ 10.000 inteiros vão para os projetos.

- **(a)** O sócio aponta **todas** as horas, inclusive gestão e comercial (como "não alocado"). Vale a mesma conta do CLT.
- **(b)** Só para o sócio, divide-se por uma **jornada de referência** (por exemplo, 160h). O que ele não apontar em projeto fica em "não alocado". No exemplo, a hora custa R$ 62,50: R$ 2.500 vão para projetos e R$ 7.500 para "não alocado".
- **(c)** O sócio fica fora do custo dos projetos.

**Sugestão: (b).** Na prática, sócio raramente aponta tudo. Com a jornada de referência, apontar pouco não distorce o custo dos projetos.

---

## Respostas da gestão à 5ª rodada (10/10/2026), texto original

- 39: hoje não há desconto em folha, e são valores fixos, exceto nas férias, quando não são pagos. Podemos implementar no futuro o desconto em caso de faltas.
- 40a: R$ 85,00 por mês por estagiário. Pode haver estagiários contratados direto, que não têm esse custo, mas a princípio esse custo vale para todos.
- 40b: cadastrar como encargo. Não precisa aparecer no holerite do estagiário, só nos custos.
- 41a: de acordo.
- 41b: o financeiro ainda não está atualizado, então ainda não é lançado; seria lançado junto com o salário. Verificar o plano de contas fornecido pelo contador.
- 41c: ok.
- 42: (b).
- 43: (a) o custo vem do ponto, e o avanço vem da EAP; a comparação já é calculada no Valor Agregado do cronograma. (b) Sim.
- 44: (a) (i). (b) Sim: ter um card atribuído conta como fazer parte do projeto, e a disciplina vem do card.
- 45: (b).

---

## 6ª rodada de perguntas (10/10/2026)

Faltam só duas perguntas, as duas sobre o plano de contas. A numeração continua a partir da 46.

### Pergunta 46 (financeiro): Em quais categorias lançar a folha?

Hoje o financeiro do SenaHub tem uma categoria só para tudo isso: **Folha CLT**, mais a categoria **Estagiários**. O plano de contas do contador separa cada item. Proposta: criar subcategorias dentro dessas duas, espelhando as contas do contador.

| Categoria do SenaHub (proposta) | O que entra | Conta no plano do contador |
|---|---|---|
| Folha CLT → Salários | líquido + INSS e IR descontados dos funcionários (= salário bruto) | Salário e Ordenados |
| Folha CLT → FGTS | guia do FGTS | FGTS |
| Folha CLT → 13º salário | quando pago | 13º Salário |
| Folha CLT → Férias | quando pagas | Férias |
| Folha CLT → Rescisões e aviso prévio | quando há demissão | Indenizações e Aviso Prévio |
| Folha CLT → Vale-transporte | R$ 200 por pessoa | **não há conta de despesa** (ver pergunta 47) |
| Folha CLT → Vale-refeição | R$ 550 por pessoa | Vale Alimentação (fica em Despesas Gerais) |
| Estagiários → Bolsa | bolsa do mês | Bolsa Estágio |
| Estagiários → Taxa do IEL | R$ 85 por estagiário | **não há conta própria** (ver pergunta 47) |

O INSS e o IR descontados vão em Salários porque fazem parte do salário bruto. A conta "INSS" do contador é a do INSS da empresa, que no Simples já vem no DAS.

- **(a) Subcategorias**, como na tabela. Tudo continua lançado junto com o salário e somado em "Folha CLT", mas o relatório de resultado mostra quanto foi para salário, FGTS e benefícios.
- **(b) Uma categoria só**, "Folha CLT", com tudo junto.

**Sugestão: (a).** Mostra o custo de cada item sem trabalho extra e deixa pronta a ligação com o plano do contador quando o financeiro passar a ser exportado para ele.

### Pergunta 47 (contador): Quatro detalhes do plano de contas

- **(a)** O plano tem "Despesas com Pessoal" em dois lugares: em Despesas Operacionais e em Despesas Administrativas. Em qual delas entra a equipe de projeto (projetistas)? E a equipe administrativa?
- **(b)** Em qual conta de **despesa** entra o vale-transporte? O plano só tem "Vale Transporte" como obrigação a pagar.
- **(c)** Em qual conta entra a taxa mensal do IEL dos estagiários?
- **(d)** O contador processa a folha CLT e não quer recebê-la na exportação mensal. Mas vale-transporte, vale-refeição, bolsa de estágio e taxa do IEL são pagos por fora da folha dele. Ele quer receber esses lançamentos na exportação? E as guias de INSS, IRRF e FGTS?

---

## Respostas à 6ª rodada (10/10/2026), texto original

- 46: (a). Mostra o custo de cada item sem trabalho extra e deixa pronta a ligação com o plano do contador quando o financeiro passar a ser exportado para ele.
- 47a: projetistas em operacional; equipe administrativa (RH, financeiro, TI etc.) em despesas administrativas.
- 47b: 2.1.4.01.0004 Vale Transporte (3717). (Nota: essa é a conta da obrigação a pagar. A pergunta era sobre a conta de despesa, que é o outro lado do lançamento. Com a 47d, não é preciso definir agora.)
- 47c: 3.1.2.03.0005 Seguros (2926), porque o principal objetivo é o seguro dos estagiários.
- 47d: a princípio, não exportar nada disso, porque já vem direto do sistema do contador.
