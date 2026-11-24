Você vai me entrevistar para definir como o "pool de recursos" deve funcionar no SenaHub, o sistema de gestão do nosso escritório de projetos BIM. Eu sou do planejamento e uso o MS Project hoje. No fim, você vai gerar um resumo das decisões que eu levo para a equipe que desenvolve o sistema.

## Como conduzir

- Faça UMA pergunta por vez e espere minha resposta.
- Em cada pergunta, me dê 2 a 4 opções concretas, com um exemplo do nosso dia a dia, e diga qual você recomenda e por quê. Eu posso escolher uma opção, misturar ou responder do meu jeito.
- Se minha resposta for vaga ou contradizer algo que eu já disse, pergunte de novo com um exemplo ("então, se a Mireli atrasar 2 dias no projeto X, o que acontece no projeto Y?").
- Se eu mandar print do MS Project, use para entender o que eu quero.
- Não invente funcionalidade além do que eu pedir. Se achar que falta algo importante, pergunte.
- Escreva em português, frases curtas, sem jargão de programação.

## O que eu pedi

1. Alerta ao montar e aprovar o cronograma: se eu planejo o João Vitor no dia 15 e ele já está em outro projeto no dia 15, o sistema me avisa e eu já planejo para ele começar dia 17.
2. Alerta durante o controle: a Mireli está no projeto X de 12 a 14 e no Y de 15 a 16. O X atrasou e ela precisou do dia 15, o que empurra o Y. O sistema deve sinalizar esse efeito em cascata.
3. Uma tela por pessoa, como o "Planejador de Equipe" do MS Project: uma faixa por projetista com tudo o que ela faz em todos os projetos, para enxergar e empurrar as tarefas com facilidade.

## O que o SenaHub já tem (não precisa decidir de novo)

- Cada tarefa da EAP tem pessoas atribuídas com HORAS PREVISTAS. O sistema espalha essas horas pelos dias úteis da tarefa. Pessoa atribuída sem horas não conta na carga.
- A tela Recursos mostra, por pessoa, horas planejadas × horas disponíveis, somando todos os projetos com cronograma aprovado. Desconta férias, abono e feriado. Tem mapa de calor por dia, semana ou mês.
- Cada sobrecarga tem sugestão de um clique: "Atrasar a tarefa N dias úteis" ou "Passar para Fulano" (alguém da mesma disciplina que está livre).
- Regra da casa: o sistema NUNCA muda data sozinho. Ele avisa e sugere; uma pessoa decide.
- Cronograma em rascunho aparece à parte e não soma na carga dos outros projetos. Cronograma aprovado congela a linha de base (o combinado com o cliente); mudar data depois vira desvio.
- Item 1 já existe desde 24/11/2026: a faixa do cronograma mostra "N conflitos de recurso" (pessoa, semana, horas aqui e em cada outro projeto), com "Ver na tabela". Ao aprovar, a confirmação lista os conflitos e pergunta "Aprovar assim mesmo?". A conta é POR SEMANA. Num projeto aprovado, o mesmo indicador aparece quando um atraso cria conflito, mas só para quem abre o projeto.

## O que precisa ser decidido (nesta ordem)

Bloco 1 — a régua (decide primeiro, porque muda todo o resto)
- A. O alerta por semana basta, ou precisa ser por dia? Por dia avisa muito mais, inclusive casos que a pessoa resolve sozinha mudando a ordem do que faz na semana.
- B. Vamos combinar que toda atividade da casa recebe horas? Ou a equipe prefere "pessoa a 100% na tarefa", como no MS Project? (Um atalho possível: atribuir a pessoa já preenche horas = duração × jornada do dia.)

Bloco 2 — aviso ativo do efeito em cascata (item 2)
- C. Quando o aviso dispara: na hora da mudança (atraso, Data de Status, replanejamento), numa rotina diária, ou nos dois?
- D. Quem recebe: coordenação do projeto atrasado, do projeto empurrado, a própria pessoa, quem gere recursos?
- E. O aviso só informa, ou já traz a sugestão de um clique ("Atrasar o Y em 1 dia" / "Passar para Fulano")?
- F. Avisar só quando o conflito é novo (não existia ontem), para não repetir todo dia?

Bloco 3 — tela por pessoa (item 3)
- G. Escala: dias (como no MS Project), semanas, ou as duas com zoom?
- H. Só ver, ou também mexer? Arrastar uma barra muda a data da tarefa no cronograma do projeto (num projeto aprovado, vira desvio da linha de base); arrastar para outra pessoa troca o responsável.
- I. O que cada barra mostra: código do projeto + nome da tarefa? Cor por projeto ou por disciplina? Sobrecarga em vermelho?
- J. Quem aparece: todos com recurso ativo, com filtro por disciplina e projeto? Rascunhos em cinza?
- K. Onde fica: aba nova "Por pessoa" dentro de Recursos, ou dentro do Planejamento?
- L. As tarefas sem ninguém atribuído entram numa faixa no fim, como no MS Project?

Bloco 4 — fechamento
- M. Em que ordem entregar as partes? (Sugestão da equipe: régua → tela por pessoa só de leitura → aviso em cascata → arrastar na tela por pessoa.)
- N. Dois pontos que ficaram em aberto da conversa anterior:
  - Marco: o que exatamente eu quero editar? Hoje, no rascunho, o início do marco já é editável; o término é recusado ("marco é uma data só"); depois de aprovado, as datas ficam travadas até "Revisar planejamento".
  - Botões de recuar/avançar: em 24/11/2026 eles foram para a barra no topo, logo depois dos filtros, sempre visíveis. Isso resolve o que eu pedi?

## Resultado final

Quando todas as perguntas estiverem respondidas, gere UM resumo em markdown, pronto para eu copiar, com:

1. Uma tabela: pergunta (A a N) · decisão · motivo em uma linha.
2. Três cenários de teste do dia a dia, escritos como "Dado… quando… então…" (ex.: "Dado que a Mireli está no X de 12 a 14 e no Y de 15 a 16, quando o X atrasa 1 dia, então…").
3. O que ficou em aberto ou dependente de outra pessoa.

Comece pela pergunta A.
