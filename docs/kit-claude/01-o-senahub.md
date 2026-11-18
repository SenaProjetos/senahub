# O SenaHub, para quem especifica

## O que é

O SenaHub é o sistema de gestão do escritório: projetos, comercial, financeiro, RH e ponto, arquivos,
coordenação BIM e ferramentas de engenharia, tudo num lugar só. Ele roda num servidor do escritório e é acessado
pelo navegador. A interface é toda em português.

O manual do usuário completo está nos arquivos `manual-*.md` deste Projeto (o mesmo que aparece em **Ajuda**
dentro do sistema). Use-o para saber como cada tela funciona e qual nome cada coisa tem.

## Áreas do sistema (menu)

- **Início**: painel com indicadores e atalhos. **Portal**: visão só de leitura para o cliente.
- **Projetos**: projetos, disciplinas, etapas (EP, BS, EX…), Meu trabalho, Tarefas, Agenda, Planejamento
  (cronograma/EAP), Recursos, Arquivos e revisões, Coordenação (modelo 3D/IFC, apontamentos), Estudos
  (levantamento de cargas), Inputs do cliente (briefing).
- **Comercial**: funil de vendas, fichas de negociação, propostas.
- **Financeiro**: lançamentos, contas a pagar e receber, conciliação bancária, fechamento do mês, relatórios.
- **RH e Ponto**: ponto, banco de horas, folha CLT, pessoas jurídicas, documentos, desenvolvimento.
- **Ferramentas**: calculadoras de engenharia (normas NBR) com memória de cálculo e desenho.
- **Engenharia**: Padrões e Normas técnicas.
- **Gestão**: jurídico, licitações, qualidade, patrimônio, TI, certidões.
- **Comunicação**: chat, notificações e **Suporte** (chamados).
- **Sistema**: preferências, configurações, auditoria.

## Coisas que valem em todo o sistema

- **Permissões**: cada pessoa tem um perfil de acesso. Quem não tem permissão não vê o botão nem o menu. Num erro,
  "não aparece para mim" pode ser permissão, não defeito. Diga sempre com qual usuário aconteceu.
- **Auditoria**: toda alteração fica registrada com quem fez e quando. Por isso a **data e a hora** de um erro
  ajudam muito: a equipe acha o registro exato.
- **Menu do botão direito**: listas e cartões têm menu no botão direito (ou toque longo no celular) e o mesmo menu
  no botão `⋯`.
- **Celular**: o sistema também é usado no celular. Diga se o erro foi no computador ou no celular.

## Como funciona uma ferramenta de engenharia no SenaHub

Toda ferramenta segue o mesmo formato, e a especificação precisa cobrir cada parte:

1. **Entradas** agrupadas em blocos, com unidade. Valores padrão só quando a norma fixa ou a casa definiu; o resto
   a pessoa digita, e a ferramenta mostra aviso até digitar.
2. **Cálculo**: um conjunto de fórmulas, sempre o mesmo para as mesmas entradas. Ele é testado automaticamente
   contra os casos de teste da especificação, a cada mudança no sistema.
3. **Resultado** na tela: grandezas com unidade, mais **alertas** ("não atende", "fora da faixa").
4. **Memória de cálculo** exportável (PDF, Word, Excel), com fórmulas, hipóteses e o aviso de responsabilidade
   técnica. Ferramentas "completas" também geram **desenho DXF** (abre no CAD).
5. **Salvar**: o cálculo fica guardado e pode ser ligado a um projeto.

Duas regras que afetam a especificação:

- **Versão do cálculo.** Quando uma fórmula ou hipótese muda numa ferramenta já publicada, a versão sobe. Os
  cálculos salvos antes continuam marcados com a versão antiga. Por isso, uma mudança precisa dizer exatamente o
  que muda e a partir de quando.
- **Validação.** Ferramenta marcada como "exige validação" só aparece para a equipe depois que um engenheiro da
  casa assina a **ficha de validação**. Enquanto isso, a memória sai com o selo "EM VALIDAÇÃO — não usar em
  projeto". Mudou a versão, volta a "em validação".

A lista das ferramentas que existem hoje está em `05-ferramentas-existentes.md`.

## O que a equipe de programação precisa receber

- **Erro**: onde, quando, com quem, passos para repetir, o esperado e o que aconteceu, print.
- **Melhoria**: o problema de hoje, quem usa, as regras com exemplo, o que não pode mudar e como saber que ficou
  pronto.
- **Ferramenta**: fórmulas com referência, unidades, faixas, valores padrão com origem, alertas, saídas e casos de
  teste calculados pelo engenheiro.

A equipe pode voltar com perguntas. Elas chegam pelo próprio chamado no Suporte ou por uma página de perguntas.
