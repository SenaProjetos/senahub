Vamos fechar as pendências do documento "Planejamento e Recursos: alerta de sobreposição por dia, tela por pessoa e cronograma geral (pool de recursos)" que montei antes. A equipe que desenvolve o SenaHub leu, respondeu as dúvidas técnicas e encontrou pontos que batem com regras que já existem no sistema. Você vai me ajudar a decidir cada um.

## Como conduzir

- Faça UMA pergunta por vez e espere minha resposta.
- Em cada pergunta, me dê 2 a 4 opções concretas, com um exemplo do nosso dia a dia (Mireli, João Vitor, projetos X e Y), e diga qual você recomenda e por quê. Eu posso escolher, misturar ou responder do meu jeito.
- Se minha resposta for vaga ou contradizer outra decisão, pergunte de novo com um exemplo.
- Não reabra o que já está decidido no documento, a não ser que uma resposta minha agora contradiga algo dele. Nesse caso, me avise e pergunte qual vale.
- Escreva em português, frases curtas, sem jargão de programação.

## O que a equipe já respondeu (só para você saber, não precisa perguntar)

- Botões do Gantt no topo: já feito, na mesma linha do "Larguras padrão". Ainda não chegou à versão que eu uso porque não foi publicado; chega no próximo deploy.
- Marco no rascunho: já feito em 25/11/2026. O término do marco agora pode ser digitado e vira a mesma data do início.
- Data real do marco depois de aprovado: já existe, na coluna "Data real" da visão Controle, sem "Revisar planejamento".
- Coordenação do projeto: já existe (membros do projeto com papel de coordenador). O aviso usa isso.
- Dedicação por pessoa (as "Unid. máximas" do Project): já existe no cadastro de Recursos. Por tarefa não existe.
- Parceiro externo: hoje o sistema só tem um "Externo" genérico, sem nome. Não dá para atribuir "Eqp. Climatização" com nome.
- Cor por projeto: não existe.
- Tarefa vermelha na EAP: hoje o vermelho na linha já quer dizer ATRASADA (o término previsto passou e a tarefa não está em 100%).
- Regra que já existe: com o cronograma aprovado, as datas planejadas ficam travadas. Para mudar, abre-se "Revisar planejamento", e a revisão fecha com uma NOVA linha de base, com motivo. Foi decidido na reunião de 29/09/2026 ("depois de aprovado, não dá para ficar mexendo no planejado"). Datas reais, % e pessoas continuam livres.
- Regra que já existe: hoje, ao criar a EAP, todos os responsáveis da disciplina entram em cada tarefa da disciplina (a "herança de responsáveis"), e um deles é o principal.

## Pendências (nesta ordem)

1. Arrastar em cronograma aprovado. Eu decidi que o arrasto num aprovado "vira desvio da linha de base". Mas, pela regra acima, mudar data planejada de um aprovado exige "Revisar planejamento", e a revisão fecha com uma linha de base nova (o desvio deixa de existir). Opções que a equipe vê:
   - (a) Arrastar num aprovado abre a revisão sozinho; ao terminar, fecha com nova linha de base e motivo.
   - (b) Arrastar só funciona em rascunho ou com a revisão já aberta; num aprovado travado, a barra não se move e a tela diz por quê.
   - (c) O arrasto vira exceção à trava: muda a data planejada sem revisão e a linha de base fica como está (o desvio aparece). Isso desfaz a decisão de 29/09 para o arrasto.
   E o "trocar a pessoa" por arrasto num aprovado: tudo bem continuar livre, como já é hoje?

2. Horas automáticas e a herança de responsáveis. Com "atribuir já preenche as horas (duração × jornada)", uma tarefa de 5 dias com 2 responsáveis herdados daria 40 h para CADA um, e os dois apareceriam ocupados o dia inteiro. Opções:
   - (a) Só o responsável principal recebe as horas; os outros entram com zero até alguém digitar.
   - (b) As horas se dividem entre os responsáveis (2 pessoas = metade da jornada cada).
   - (c) Todos recebem a jornada inteira (mais avisos de conflito).
   - (d) A herança deixa de colocar todos: só o principal entra na tarefa.
   E as atribuições que já existem hoje sem horas: recebem as horas automáticas uma vez, na entrega, ou só as novas?

3. Marca de superalocação na EAP do cronograma individual. O vermelho na linha já quer dizer "atrasada". Como marcar "a pessoa está superalocada nesta tarefa"? Exemplos: um ícone de pessoa em vermelho na coluna Recursos, o nome da pessoa em vermelho, outra cor na linha.

4. Parceiro externo com nome. Precisa de um cadastro novo. Quais dados ele tem (nome, disciplina, contato?), quem cadastra, e ele aparece em todos os projetos ou só nos que o usam? Continua sem horas e sem alerta, como já decidi?

5. Dedicação por tarefa. "Ajustar a porcentagem se a pessoa não está 100% na tarefa": basta poder digitar a porcentagem e o sistema converter em horas (50% de 5 dias de 8 h = 20 h)? Ou a porcentagem precisa ficar guardada e aparecer na tela?

6. Cor por projeto. Automática (o sistema escolhe uma cor fixa para cada projeto) ou escolhida por alguém no cadastro do projeto?

7. Quem pode o quê. Sugestão da equipe: ver a tela por pessoa e o Planejamento geral = quem já vê Recursos; arrastar datas e trocar pessoa = quem já monta a EAP. Serve?

8. Data real que afeta um cronograma em RASCUNHO. Hoje o aviso foi decidido só contra cronograma aprovado. Se a Mireli atrasa no X (aprovado) e passa a chocar com o Z (rascunho), quem monta o Z deve ser avisado, ou basta o vermelho aparecer no Z quando alguém abrir?

9. O que dispara o aviso em cascata. No SenaHub, o andamento muda por vários caminhos: data real de cada tarefa, % concluído, Data de Status (que empurra o trabalho não feito para depois dela) e mudanças na revisão. O aviso sai em qualquer um deles que crie conflito novo? Ou só em algum?

10. Planejamento geral. É só para ver (e clicar para abrir a pessoa ou o projeto), ou também se edita ali? Começa com os projetos recolhidos? Quais filtros precisa (projeto, disciplina, pessoa, aprovado/rascunho, período)?

11. Entrega. Decidi "tudo de uma vez". A equipe sugere construir em partes, cada uma testada, e publicar todas juntas no fim. Ordem sugerida: horas automáticas e conflito por dia → tela por pessoa só de leitura → aviso em cascata → arrasto → Planejamento geral → parceiro externo. Concordo com essa forma e essa ordem? Tem alguma data limite?

## Resultado final

Quando todas as pendências estiverem respondidas, gere UM texto em markdown, pronto para eu copiar, com:

1. Uma tabela: pendência (1 a 11) · decisão · motivo em uma linha.
2. As mudanças que essas decisões fazem no documento original: quais seções e linhas mudam e como ficam (por exemplo, a regra H, os itens 3.3.8 e 3.3.9, a seção 10).
3. Dois cenários novos "Dado… quando… então…": um para o arrasto num aprovado e um para as horas automáticas com dois responsáveis.
4. O que ainda ficou em aberto.

Comece pela pendência 1.
