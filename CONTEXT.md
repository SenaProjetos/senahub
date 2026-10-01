# SenaHub

ERP próprio de um escritório de engenharia BIM. Este arquivo é **só glossário**: o vocabulário
canônico do domínio. Sem decisões (essas ficam em `docs/adr/`), sem detalhe de implementação.

Criado em 2026-09-09 com o cluster de documentação; outros clusters entram conforme os termos
forem resolvidos.

## Documentação

**Seção da documentação**:
Um dos 9 agrupamentos de alto nível do sistema pelos quais a documentação é organizada —
Início e Portal, Projetos, Clientes e Comercial, Financeiro, RH e Ponto, Engenharia, Gestão,
Comunicação, Sistema. Uma seção reúne várias rotas e vários módulos; não corresponde a uma tela nem
a uma pasta de código. Até 2026-09-15 se chamava "setor"; o nome passou para o sentido
organizacional (ver **Setor**). A rota `/guias/[setor]` e o parâmetro de código mantêm o nome antigo
de propósito — renomear quebraria links, e o glossário não obriga a isso.
_Avoid_: setor (neste sentido), área, módulo

**Módulo**:
Uma pasta de domínio em `src/modules/`. Unidade de **código**, não de documentação — vários módulos
cabem numa seção da documentação.
_Avoid_: feature, domínio

**Manual de referência**:
A documentação de consulta pontual, em markdown sob `docs/manual/`, exibida em `/ajuda`. Responde
"o que este campo faz", "qual permissão preciso", "o que significa esta mensagem de erro". Aberta a
todos os perfis, cliente incluso.
_Avoid_: docs, ajuda, help, manual do usuário

**Guia de uso**:
A camada de **formação** de uma seção da documentação, para quem ainda não domina o vocabulário
dela: o que os termos significam, por que o processo existe e como as telas se encadeiam. Uma
página React por seção em `/guias/[setor]`, visível só a colaborador interno.
_Avoid_: guia para iniciantes, guia prático, tutorial, onboarding, treinamento

**Fronteira editorial**:
A regra que separa guia de uso e manual de referência: significado, porquê e encadeamento ficam no
guia; permissões, regras de negócio, definição campo a campo e tabela de erros ficam no manual. O
guia **liga** para o manual, nunca repete.
_Avoid_: escopo da doc, divisão de conteúdo

**Stub**:
O arquivo curto em `docs/manual/<secao>/guia-iniciante.md` que só aponta para o guia de uso. Existe
para o guia continuar achável na busca do `/ajuda`; não cresce, não carrega conteúdo.
_Avoid_: resumo, índice, placeholder

**Deliberação**:
A ata de uma decisão do Conselho Permanente de Documentação, em `docs/manual/deliberacoes/`:
participantes, descobertas, divergências e decisão final. Registra **como** se chegou à decisão.
_Avoid_: ata, reunião, RFC

**ADR**:
O registro de uma decisão arquitetural em `docs/adr/`. Registra **o que** foi decidido e por quê,
não o processo. Numeração `0001-slug.md`. Os arquivos `ADR-00N` sob `docs/manual/decisions/` são a
série legada, anterior a esta convenção, e continuam válidos.
_Avoid_: decisão, RFC, design doc

## Pessoas e acesso

Uma mesma pessoa carrega fatos independentes: como foi contratada, qual papel legado ocupa, que
perfil de acesso recebeu e que cargo exerce. Nenhum deles implica os outros.

**Setor**:
A área da empresa em que a pessoa trabalha — Diretoria, Administrativo, Jurídico, Engenharia, TI.
Vem do vínculo ativo. É endereço, não crachá: não decide telas, jornada nem escopo.
_Avoid_: departamento, área, seção da documentação

**Contratação**:
A forma jurídica pela qual a pessoa trabalha para o escritório — CLT, estágio, PJ, autônomo (RPA)
ou pró-labore. Vem do vínculo ativo e decide a jornada; não decide telas.
_Avoid_: tipo de contrato, regime (quando se quer dizer contratação), papel

**Vínculo**:
Um período de contratação da pessoa com o escritório, com data de início e de fim. A pessoa acumula
vínculos ao longo do tempo; no máximo um está ativo.
_Avoid_: contrato, admissão

**Jornada controlada**:
A condição de quem bate ponto e, pelo mesmo fato, tem espelho, banco de horas, lembrete de ponto,
férias e holerite CLT. Tem jornada controlada quem é contratado CLT ou estágio, qualquer que seja o
cargo.
_Avoid_: "é CLT" (quando se quer dizer jornada controlada), celetista

**Batida**:
O registro de entrada, pausa ou saída de quem tem jornada controlada. É prova de vínculo
empregatício, por isso nunca é aceita de quem não tem jornada controlada.
_Avoid_: ponto (quando se quer dizer um registro só), marcação

**Apontamento de horas**:
O registro de horas por projeto de quem não tem jornada controlada (PJ, freelancer), sem batida,
sem espelho e sem banco de horas. Alimenta o rateio de custo do projeto.
_Avoid_: ponto do PJ, timesheet

**Papel**:
O campo legado que classificava a pessoa numa lista fixa (Administrador, Coordenador,
Administrativo, CLT, Estagiário, Projetista PJ, Freelancer, Cliente, TI). Está sendo esvaziado:
ainda decide o apontamento de horas, mais nada.
_Avoid_: perfil (sem qualificar), role, função

**Perfil de acesso**:
O conjunto configurável de permissões atribuído pessoa a pessoa, que decide quais telas e ações ela
alcança. "Coordenador" é ao mesmo tempo um papel e um perfil de acesso: uma coordenadora contratada
CLT tem papel CLT e perfil de acesso Coordenador.
_Avoid_: perfil (sem qualificar), permissão (quando se quer dizer o conjunto), nível de acesso

**Override de permissão**:
Uma permissão concedida ou negada a uma pessoa específica, por cima do perfil de acesso dela, com
motivo obrigatório. Vence o perfil nos dois sentidos.
_Avoid_: exceção, permissão extra

**Escopo global**:
A permissão de enxergar todos os projetos da empresa, e não só aqueles em que a pessoa é membro ou
responsável. Vem do perfil de acesso ou de um override; não vem do papel. Só enxergar: não autoriza
mexer em nada — isso é **Atuar em disciplina alheia**.
_Avoid_: acesso total (isso é superusuário), ver tudo

**Atuar em disciplina alheia**:
Escrever na disciplina de outra pessoa — enviar e renomear arquivo, editar pendência, diário e
apontamento de coordenação, mudar status. Por padrão só o responsável da disciplina escreve nela;
esta permissão, do perfil de acesso, estende isso a todas.
_Avoid_: perfil global, acesso global (isso é escopo)

**Aprovação da entrega**:
O ato que encerra a disciplina e libera a demanda para o financeiro, que cria o pagamento do
projetista. É distinto de pagar: quem aprova não precisa ver o valor, e só quem enxerga financeiro
o vê ou altera na aprovação. Distinto também de revisar, que é validar arquivo a arquivo.
_Avoid_: validação (quando se quer dizer aprovação da entrega), liberar pagamento

**Superusuário**:
A pessoa que ignora perfil de acesso e overrides e alcança tudo. É uma marca por pessoa, não um
papel nem um perfil.
_Avoid_: admin (quando se quer dizer o bypass), acesso total

**Piso de sócio**:
O acesso de leitura que o sócio recebe além do próprio perfil de acesso, equivalente ao que o
Coordenador lê. É leitura por definição.
_Avoid_: acesso de sócio, perfil sócio

## Financeiro

Três perguntas diferentes não se misturam: se o dinheiro **já se moveu** (realizado ou pendente), o
quanto se **acredita** que uma entrada pendente vai acontecer (confiança) e se o movimento **conta no
resultado** da empresa (natureza). Nenhuma resposta implica as outras.

### Lançamentos

**Lançamento realizado**:
Conta já paga ou recebida. É o único lançamento que compõe o caixa atual e a DRE. Na tela aparece
como "Pago" ou "Recebido".
_Avoid_: confirmado (na tela, colide com a confiança), baixado

**Lançamento pendente**:
Conta a pagar ou a receber que ainda não se realizou, inclusive a que aguarda aprovação e a previsão
de recebimento do cronograma. É o que o planejador projeta.
_Avoid_: previsto (quando se quer dizer todos os pendentes), em aberto

**Confiança do recebimento**:
O quanto se acredita que uma entrada pendente acontece na data: confirmada pelo cliente, provável,
estimada ou incerta. Não diz nada sobre ter sido recebida; entrada realizada não tem confiança.
_Avoid_: status, certeza, "confirmada" sem "pelo cliente"

**Prioridade do pagamento**:
A ordem de proteção de uma saída pendente: P1 não pode atrasar, P2 importante, P3 negociável, P4
adiável. Só saída tem prioridade.
_Avoid_: urgência, importância

**Fora do resultado**:
Movimento de caixa que não é receita nem despesa da empresa, como distribuição e adiantamento de
lucros. Sai do caixa e entra no fluxo de caixa; não entra na DRE.
_Avoid_: não operacional, extraordinário

**Transferência entre contas**:
Dinheiro que passa de uma conta da empresa para outra, inclusive aplicação e resgate. Não muda o
caixa atual nem o resultado; muda só em que conta o dinheiro está.
_Avoid_: entrada/saída (para as duas pernas), movimentação interna

### Caixa e reservas

**Caixa atual**:
O dinheiro que está hoje nas contas da empresa: saldos de abertura mais tudo o que já foi realizado.
_Avoid_: saldo (sem qualificar), disponível, saldo em caixa

**Caixinha**:
Uma separação gerencial de parte do caixa atual para uma finalidade (salários, impostos, 13º). Não é
conta bancária e não move dinheiro entre bancos.
_Avoid_: reserva (sem qualificar), fundo, subconta

**Reservado**:
O que está nas caixinhas e ainda não foi usado. Um pagamento feito por uma caixinha diminui o
reservado e o caixa atual juntos, e por isso não diminui o dinheiro livre.
_Avoid_: provisionado, bloqueado

**Dinheiro livre**:
O caixa atual menos o reservado, quando o caixa cobre as caixinhas. Nunca é negativo: a falta aparece
como reserva descoberta.
_Avoid_: disponível, sobra, saldo livre

**Reserva descoberta**:
Quanto o reservado passa do caixa atual. Existe para a falta aparecer com nome e valor, em vez de
sumir num dinheiro livre zerado.
_Avoid_: livre negativo, déficit (isso é saldo projetado abaixo de zero)

**Reserva mínima**:
O piso que o planejador compara com o saldo projetado das contas para alertar. Não é caixinha e
nunca se soma à reserva de emergência, que é caixinha e continua dentro do caixa atual.
_Avoid_: reserva de emergência, caixa mínimo

**Comprometido**:
As saídas pendentes dentro do horizonte. Divide-se em coberto, a parte que sai de caixinhas, e sem
cobertura, a parte que ainda vai sair do dinheiro livre.
_Avoid_: a pagar (quando se quer dizer só o horizonte), gasto

**Déficit**:
Saldo projetado das contas abaixo de zero em algum dia do horizonte.
_Avoid_: rombo, negativo (sem data)

**Dias de caixa**:
Quantos dias o caixa atual paga as saídas no ritmo médio dos últimos 90 dias, contando só despesas
que entram no resultado.
_Avoid_: fôlego, runway

### Planejamento

**Horizonte**:
O período à frente, a partir de hoje, que o planejador projeta. O planejador não olha para trás.
_Avoid_: período (sem qualificar), janela

**Ajuste**:
Uma mudança simulada sobre o financeiro real: nova data, prioridade, confiança, caixinha ou valor de
um lançamento, ou um movimento incluído ou tirado. Sozinho, não altera nada real.
_Avoid_: alteração, simulação (para um item)

**Cenário**:
Um conjunto salvo de ajustes. Guarda a intenção, não o resultado: ao abrir, é recalculado sobre os
dados de hoje.
_Avoid_: simulação salva, plano, lote

**Aplicar cenário**:
Levar ao financeiro real os ajustes aplicáveis de um cenário, todos ou nenhum. Se o real mudou desde
a simulação, nada é aplicado.
_Avoid_: executar, efetivar

**Lote de pagamentos**:
A seleção de contas a pagar que cabem num saldo, paga de uma vez. Até 2026-09 se chamava
"planejamento de pagamentos".
_Avoid_: cenário, planejamento

### Sócios

**Pró-labore**:
A remuneração mensal do sócio pelo trabalho. É despesa e entra no resultado.
_Avoid_: retirada (ambíguo), salário do sócio

**Distribuição de lucros**:
Dinheiro do lucro entregue aos sócios. Sai do caixa e fica fora do resultado. O adiantamento de
lucros é a mesma coisa antes de o lucro estar apurado.
_Avoid_: retirada (ambíguo), dividendos

**Compromisso recorrente**:
O cadastro de uma saída que se repete, como o pró-labore de cada sócio. Os meses futuros aparecem no
planejador como programados; o lançamento só nasce perto do vencimento.
_Avoid_: recorrência (quando se quer dizer o cadastro), agendamento

**Programado**:
Um mês futuro de compromisso recorrente que ainda não virou lançamento. Conta na projeção e não
aparece em contas a pagar.
_Avoid_: previsto, agendado
