# Reunião de análise do Hub (26/10/2026) — roadmap em 5 lotes

Origem: transcrição da reunião de 26/10/2026 com a SENA Engenharia (primeira remessa de
observações; haverá uma segunda). Este documento só **ordena e delimita**; cada lote ganha o
seu desenho completo quando chegar a vez, com a investigação feita na hora.

Ordem decidida pelo dono em 26/10/2026: valor para a equipe contra esforço.

## Decisões já tomadas

- Problemas por projeto: a marcação na prancha (`Pendencia`) e o apontamento 3D da Coordenação
  (`ApontamentoCoordenacao`) continuam **listas separadas**.
- A página geral `/pendencias` (menu "Apontamentos") **permanece**, para quem trabalha em
  vários projetos.
- Papéis novos (Analista, Gerente) são só rótulo; não herdam poderes de Coordenador.

## Lote 1 — Papéis, Avisos no topo, Problemas por projeto

Desenho pronto: [2026-10-26-lote1-papeis-avisos-problemas-design.md](2026-10-26-lote1-papeis-avisos-problemas-design.md).

## Lote 6 — Refinos da EAP (feedback complementar, 26/10/2026)

Desenho pronto: [2026-10-29-lote6-refinos-eap-design.md](2026-10-29-lote6-refinos-eap-design.md)
(6a: as filhas acompanham o agrupamento; 6b: calendário nativo + máscara + colar; 6c: opção B, duas barras de 9 px).

Feedback de quem fez a reunião: a criação da EAP dentro do projeto (árvore, arrastar, copiar) "ficou
show". Dois pedidos pequenos, na mesma tela. Pelo tamanho, sugiro fazê-lo logo depois do Lote 1.

- **6a. Disciplina do agrupamento vale para as linhas de dentro.** Ao definir a disciplina de uma
  tarefa-mãe (agrupamento), as subtarefas e as sub-subtarefas assumem a mesma, sem repetir linha a linha.
  - **O que já existe:** linha NOVA já nasce com a disciplina do agrupamento-pai
    (`planejamento/disciplina-linha.ts`, regra A1), e há o achado "disciplina diferente do agrupamento"
    com correção. O que falta é **propagar para as linhas que já existem** quando a mãe muda.
  - **Atrito com regra existente:** hoje mover/recuar não trocam a disciplina (A2), porque trocar mexe em
    responsável, card e pagamento por fase (`herdarResponsaveisNoProjeto`). A propagação precisa decidir
    o que fazer com linhas que já têm outra disciplina de propósito e com as que têm responsável/pagamento.
  - **Perguntas em aberto:** sobrescreve só as linhas sem disciplina ou também as que têm outra?;
    avisa antes de aplicar (contagem de linhas afetadas, com desfazer — a EAP já tem Ctrl+Z)?;
    vale também ao mover/recuar um bloco para dentro de outro agrupamento?
- **6b. Datas da EAP escolhidas num calendário.** Hoje, nas colunas Início/Término da grade
  (`plano-gantt.tsx`), a data é digitada em `dd/mm/aaaa`; o painel da linha já usa o seletor de data do
  navegador. O pedido é abrir o calendário ao clicar na célula, "igual no projeto".
  - **Perguntas em aberto:** qual calendário é o "do projeto" (o nativo do navegador, como em
    `faixa-cronograma.tsx`, ou um componente nosso); o calendário deve marcar dias não úteis/feriados
    (o motor usa o calendário de trabalho); manter a digitação como alternativa (colar várias datas).
  - **Cuidado:** as regras de data digitada (término → duração, início → restrição "não iniciar antes
    de") não mudam; só muda a forma de escolher.
- **6c. Barras do Gantt de controle: linha de base e execução com a mesma espessura, visual melhor.**
  Pedido do dono em 26/10/2026. Hoje a barra da linha de base é fina (4 px, `top: 22`) e fica
  **sob** a barra grossa da tarefa (14 px, `top: 7`), em cinza escuro (`gantt-barra.tsx`, modo
  `controle`).
  - **Atrito com decisão anterior:** o comentário no código registra que a base ficar "fininha sob a
    barra grossa" foi decisão da reunião de 29/09/2026. Este pedido a reverte; a linha da altura
    (`ROW_H`) vai precisar acomodar duas barras de espessura igual.
  - **Perguntas em aberto:** as duas barras ficam empilhadas (base embaixo, execução em cima) com a
    mesma altura?; o que significa "melhorar o visual" (cantos, cores da base × execução × crítica ×
    atraso, preenchimento do % concluído, rótulo)? Vale mostrar um mock antes de mexer.
  - **Tamanho:** pequeno (só `gantt-barra.tsx` e a legenda em `plano-gantt.tsx`); o mock é o que decide.
- **Tamanho do lote:** pequeno cada um; 6a tem mais risco (dados já existentes).

## Lote 7 — Execução real no Gantt de controle (datas reais, colunas e variação)

Feedback do dia 26/10/2026, com duas capturas do MS Project como referência (colunas de
execução e colunas de variação).

- **Pedidos:**
  1. Com o cronograma aprovado, deixar **preencher datas reais (início/término) e percentual**,
     principalmente em projetos antigos já em andamento e em tarefas gerais e de terceiros, que não
     têm horas apontadas automaticamente. Marco: registrar a data (ou o percentual) em que foi realizado.
  2. Marcar 100% numa tarefa de terceiro hoje **não significa** que começou e terminou como
     planejado: as datas reais precisam poder ser informadas à parte.
  3. O Gantt de controle ganha as colunas de execução da referência: **Iníc. real, Térm. real,
     % concl., % física concluída, Dur. real, Dur. rest., Custo real, Trab. real**.
  4. Uma **visão de variação** separada, com **Início, Término, Início da linha de base, Término da
     linha de base, Var. do início, Var. do término** (dias), em vez de misturar tudo na grade.
- **O que já existe** (a investigar antes do desenho: o relato é "ainda não permite editar datas
  reais", mas o código já grava):
  - "Atualizar tarefa" (`execucao-dialog.tsx`, action `registrarExecucao`, regras puras em
    `planejamento/execucao.ts`, permissão `cronograma:executado`): início/término reais, marco com uma
    data só. Hoje exige início antes do término, recusa data futura, e **término real conclui a linha
    (status `con`, 100%)**.
  - O plano aprovado já deixa editar nome e %; a grade tem Início/Término (previstos), Início base,
    Término base e Desvio. Faltam as colunas de real e a visão de variação.
- **Decidido pela equipe (28/10/2026):**
  - **Um percentual só** (`progresso`), na coluna "% concl."; "% física concluída" era cópia da
    referência e não entra.
  - **Custo real** = horas apontadas × custo da hora (só para quem vê custo) **+ valor digitado**
    nas tarefas de terceiro.
  - **Visão de variação = um modo do Gantt** (ao lado de Planejamento/Controle), não aba nem tela própria.
- **Perguntas em aberto:** onde a edição de data real é invisível hoje (permissão, só no menu da
  linha, só no painel)?; informar **só o %** (sem datas) em tarefa de terceiro e manter o status
  coerente; onde se digita o valor do terceiro (campo na linha? parcela do contrato?); o que muda no
  desvio atual (que compara base com o término previsto); Dur. real/rest. e Trab. real: calculados
  (datas reais, horas apontadas) ou digitáveis?
- **Tamanho:** médio. Tem ligação com o 6c (barras do Gantt de controle) e com a EAP em projetos
  antigos (preenchimento retroativo); o desenho deve tratar os três juntos na ordem 7 → 6c.

## Lote 2 — Recursos como pool geral (visão estilo MS Project)

- **Pedido:** a aba `/recursos` deixa de alocar pessoa por projeto. Vira um resumo geral de
  capacidade × carga por pessoa (sobrecarregado em vermelho), alimentado só pelas EAPs dos
  projetos. A atribuição continua sendo feita na EAP (cronograma), como já é.
- **O que já existe:** `/recursos` (`recursos:ver`/`gerir`) com `matrizRecursos` e
  `cargaSemanalPorRecurso` em `modules/planejamento/`; habilidades e necessidades em
  `rh/habilidades`; aba EAP só de consulta dentro do projeto (v1.25.2).
- **Perguntas em aberto:** o que sai da tela (alocar por projeto, necessidades de habilidade?);
  rascunho da EAP entra no resumo (hoje aparece à parte, sem somar); filtros por setor/disciplina.
- **Tamanho:** médio, mais subtração do que construção.

## Lote 3 — E-mail de acompanhamento do projeto

- **Pedido:** botão manual, por projeto, que monta e envia ao cliente um e-mail padrão listando
  o que foi enviado/compartilhado, mantendo a sequência de e-mails (histórico na caixa do cliente).
- **O que já existe:** modelos de e-mail em Configurações → E-mails (`modules/configuracoes/emails`),
  envio SMTP (`lib/mail`), ciclo documental com o estado "Em análise"/enviado ao cliente.
- **Perguntas em aberto:** destinatários (contatos do cliente do projeto?); lista automática =
  o que mudou desde o último e-mail?; com cópia oculta para uma caixa do escritório (envio por
  SMTP não aparece na pasta "Enviados" de quem clicou); encadeamento por `Message-ID`/`In-Reply-To`
  basta, sem integração com o Google?; registro do que foi enviado (tabela nova).
- **Tamanho:** médio.

## Lote 4 — Inputs estilo Google Forms

- **Pedido:** editor de modelos de inputs com tipos de campo (sim/não, caixa de marcação,
  múltipla escolha, escolha única), arrastar para reordenar e vários modelos (um por perfil de cliente).
- **O que já existe:** `modules/inputs` (briefing com schema, perguntas padrão, perguntas extras
  removíveis/restauráveis e briefing ocultável por projeto, v1.28.0), link público por token.
- **Perguntas em aberto:** o modelo é por cliente ou escolhido ao criar o projeto?; como os
  projetos já em andamento migram; limite de tipos na primeira versão.
- **Tamanho:** médio a grande.

## Lote 5 — Calculadoras de instalações e aba Estudos

- **Calculadoras (pedido):** pré-dimensionamento de reservatórios inferior e superior (com reserva
  de incêndio); destino final de esgoto (sumidouro/filtro, a partir do teste de percolação e da
  sondagem); corrente, corrente corrigida e carga demandada; bomba de recalque; bomba de piscina.
- **Aba Estudos (pedido):** levantamento de cargas dinâmico por projeto (ambientes, pontos de luz
  e tomada, potências, fatores de demanda e de potência, demanda prévia), no lugar de planilhas.
- **O que já existe:** `modules/ferramentas/calc/` (motores puros com teste) e `registry.ts`
  (chaves estáveis); memória de cálculo em docx/html/xlsx.
- **Dependência:** um engenheiro da casa valida fórmulas e normas de cada calculadora antes de
  ela ir ao ar (candidatas, a confirmar: NBR 5626, NBR 7229, NBR 13969, NBR 5410, NBR 13714).
  Estudos faz mais sentido depois de corrente/demanda.
- **Perguntas em aberto:** ordem das calculadoras; Estudos vive no projeto ou em Ferramentas;
  quem valida as fórmulas.
- **Tamanho:** uma calculadora é pequena; o conjunto e a aba Estudos são grandes. Provavelmente
  vira mais de um lote.
