---
titulo: Sobreposição 2D (plantas das disciplinas)
descricao: Como sobrepor as plantas PDF e DWG das disciplinas de um pavimento, alinhar cada uma sobre a arquitetura e transformar uma interferência em apontamento.
resumo: Na aba Coordenação do projeto, a Sobreposição 2D junta as plantas de várias disciplinas sobre uma base. Cada camada é alinhada uma vez (1 ponto, 2 pontos ou ajuste fino) e a revisão nova já chega no lugar. A interferência vira um apontamento em rascunho na prancha da disciplina que deve alterar.
tags: [sobreposição, compatibilização, coordenação, planta, pdf, dwg, alinhar, apontamento, interferência, estudo preliminar]
palavras-chave: [sobreposição 2d, sobrepor plantas, compatibilização 2d, alinhar planta, sena_arq, cortina, cruzamentos, apontar interferência, enviar apontamentos, pavimento]
sinonimos: [sobrepor disciplinas, compatibilizar plantas, overlay de plantas, conferir interferências]
---

# Sobreposição 2D (plantas das disciplinas)

No estudo preliminar ainda não há modelo IFC: cada disciplina entrega as plantas em **PDF e DWG**, um
arquivo por pavimento. A **Sobreposição 2D** coloca essas plantas umas sobre as outras dentro do
SenaHub, para achar interferências cedo e mandar o ajuste para quem deve alterar — sem abrir o
AutoCAD e sem a conclusão ficar só na conversa.

Ela fica na aba **Coordenação** do projeto, em **Sobreposição 2D** (ao lado de **Modelo 3D (IFC)**).
Projeto sem IFC abre direto nela.

- **Ver** a sobreposição: quem enxerga o projeto e tem a permissão de ver a coordenação.
- **Montar, alinhar e trocar arquivo**: quem gerencia a coordenação.
- **Apontar interferência**: quem gerencia a coordenação **e** pode fazer apontamentos nas pranchas.

## Montar o pavimento

1. Clique em **Nova sobreposição** e dê o nome do pavimento ("Térreo", "Tipo", "Cobertura").
2. Clique em **+ Adicionar disciplina** e escolha a planta. Comece pela **arquitetura**: a primeira
   camada vira a **base**, e é sobre ela que as outras se alinham.
3. Adicione as outras disciplinas. Cada uma ganha uma cor; troque no quadradinho de cor da camada.

No painel **Camadas**, cada linha tem o **olho** (liga e desliga), a **cor**, a **opacidade** e a
revisão em uso ("PDF · R01 · Em análise"). A camada mostra sempre o arquivo **mais novo** do formato,
mesmo em andamento. Pelo **⋯** (ou clique direito) da camada:
**Definir como base**, **Usar o PDF / Usar o DWG**, **Alinhar** e **Remover da sobreposição**.

> No celular, o painel de camadas abre pelo botão **Camadas**.

### PDF ou DWG?

Nas camadas que não são a base, prefira o **DWG**: o sistema esconde o layer **`SENA_ARQ`** (a
arquitetura de fundo que todo projetista recebe) e desenha só o que é da disciplina. No PDF a
arquitetura só some se o arquivo foi exportado com layers e tem um layer `SENA_ARQ`; se não tiver, a
camada avisa "Arquitetura de fundo não encontrada (layer SENA_ARQ)".

Se o DWG ainda está convertendo ou a conversão falhou, a camada mostra o estado e o botão **Usar o
PDF**.

## Alinhar uma camada

As plantas raramente chegam na mesma posição. Alinhe cada camada **uma vez**: o sistema guarda o
deslocamento e a **próxima revisão já abre no lugar**.

Clique em **Alinhar** (na barra, no **⋯** da camada ou no aviso "Não alinhada"). Enquanto você alinha,
a arquitetura de fundo da camada aparece em **cinza** — é nela que se clicam os pontos. Escolha o modo:

- **2 pontos** (padrão, como o ALIGN do CAD): clique num ponto da camada e no mesmo ponto na base;
  depois num segundo ponto, longe do primeiro, e no mesmo ponto na base. A camada é movida, girada e
  escalada de uma vez. Pontos no mesmo lugar são recusados.
- **1 ponto**: clique num ponto da camada e no mesmo ponto na base. Só move (giro e escala ficam).
- **Ajuste fino**: arraste a camada com o mouse; use as **setas** (1 px de tela; com **Shift**, 10 px)
  ou digite **X, Y, giro (°) e escala**. Para mover a vista neste modo, arraste com o botão do meio.

**Ctrl+Z** desfaz o último passo; **Esc** descarta os cliques do par em andamento. **Salvar
alinhamento** grava; **Cancelar** volta a camada para onde estava. Se outra pessoa salvou o
alinhamento da mesma camada enquanto você editava, o sistema avisa e não grava por cima — recarregue
a página para ver o alinhamento atual.

### Revisão nova

Quando chega uma revisão nova da prancha, a camada abre com o alinhamento salvo e o aviso
**"Alinhamento da revisão anterior (R00)"**. Se a planta continua no lugar, clique em **Está certo**;
se mudou de posição, clique em **Alinhar**.

Quando é a **base** que muda, alinhe só a base: clique num ponto dela e no mesmo ponto numa camada já
alinhada. As outras camadas continuam no lugar.

## Modos de ver

- **Sobrepor**: todas as camadas ligadas, cada uma com sua opacidade.
- **Cortina**: a base de um lado e uma camada do outro. Arraste a alça da divisória (ou use as setas
  com ela em foco; Home/End vão às pontas).
- **Cruzamentos**: escolha duas camadas; o sistema marca em vermelho tracejado onde as duas têm traço
  no mesmo lugar. É uma **ajuda visual** — tubo que atravessa parede de propósito também aparece — e
  nunca cria apontamento sozinho. A contagem fica na barra e é refeita quando você para de mover a
  vista.

## Apontar uma interferência

1. Clique em **Apontar interferência** e depois no ponto do desenho.
2. Escolha a **disciplina que deve alterar** (a base também pode receber), escreva o que precisa
   mudar e, se quiser, a severidade e o tipo.
3. Clique em **Apontar**.

O apontamento cai no **PDF vigente** da prancha dessa disciplina, como **rascunho** (só você vê), com
a **imagem da sobreposição** em volta do ponto anexada — assim o projetista vê o tubo e o pilar
juntos, mesmo abrindo só a prancha dele. Se a imagem não puder ser anexada, o apontamento fica criado
e o sistema avisa.

O sistema recusa, com a explicação:

- **Camada em DWG** — "Para apontar, use o PDF desta prancha." (botão **Usar o PDF** no próprio
  diálogo). O pino só cai no PDF.
- **PDF sem alinhamento** — "Alinhe o PDF desta prancha antes de apontar."
- **Prancha sem PDF** — "Esta prancha não tem PDF vigente para receber o apontamento."
- **Ponto fora da folha** — "O ponto fica fora da prancha de {disciplina}."

Os apontamentos abertos de cada camada aparecem como pinos numerados no desenho (rascunho com borda
tracejada). Clique no pino para abrir a prancha no apontamento.

### Enviar os apontamentos

Enquanto houver rascunhos seus, a faixa **"N apontamentos seus em rascunho"** mostra quais são. Clique
em **Enviar apontamentos**: cada prancha passa pela **rodada normal de envio** — vira uma tarefa para os
responsáveis da disciplina, com aviso, e a disciplina já aprovada volta para revisão. Entram também os
outros apontamentos abertos e ainda não enviados dessas pranchas. Se uma prancha falhar, as outras
seguem e o relatório diz qual falhou e por quê.

Excluir a sobreposição apaga só as camadas e os alinhamentos: os apontamentos ficam nas pranchas.

[← Projetos](README.md)
