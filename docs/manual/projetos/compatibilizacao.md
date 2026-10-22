---
titulo: Compatibilização (modelo federado)
descricao: Como juntar os modelos IFC das disciplinas num único arquivo federado, onde ele fica guardado e quem pode vê-lo.
resumo: Na aba Compatibilização do projeto, o painel Disciplinas exporta o IFC federado — um só arquivo IFC com os modelos escolhidos, na mesma unidade e no mesmo schema. Cada geração vira uma revisão (R00, R01…) na pasta Modelo federado, dentro do Desenvolvimento, na aba Arquivos.
tags: [compatibilização, modelo federado, ocultar modelo, ifc, bim, revit, exportar, revisão, coordenação]
palavras-chave: [compatibilização, ifc federado, modelo federado, exportar ifc, juntar modelos, ifc único, revit, navisworks, maquete, unidade, schema, revisão R00]
sinonimos: [maquete federada, federação de modelos, coordenação bim, juntar ifcs]
---

# Compatibilização (modelo federado)

## Tirar um modelo da compatibilização

Às vezes a lista do painel **Disciplinas** fica maior que o necessário — um IFC exportado duas vezes,
um modelo de estudo, um arquivo do cliente que já foi substituído. Quem gerencia a coordenação
(coordenador ou administrador) pode tirar esse modelo da compatibilização:

1. No painel **Disciplinas**, clique no **olho riscado** ao lado do modelo.
2. Ele sai da lista e vai para **Fora da compatibilização**, no fim do painel. Se estava ligado no
   visualizador, é desligado.

O modelo fora da compatibilização não aparece no painel, no realinhamento, na comparação de versões
nem no **Exportar IFC federado**. Nada é apagado: o arquivo continua na aba **Arquivos**, na lista
**Modelos e conversões** (marcado "Fora da compatibilização") e nos apontamentos já feitos nele. A
decisão vale para o arquivo, não só para a revisão: quando chegar uma revisão nova do mesmo arquivo,
ela continua fora. Para trazer de volta, abra **Fora da compatibilização** e clique em **Incluir**.

## Exportar o modelo federado

O **modelo federado** é um único arquivo IFC que reúne os modelos das disciplinas (Arquitetura,
Estrutura, Elétrica…) que você escolher. Serve para abrir tudo junto em outro programa, como o
Revit ou um visualizador de coordenação, sem precisar carregar um IFC por vez.

1. Abra o projeto e entre na aba **Compatibilização**.
2. No painel **Disciplinas**, clique em **Exportar IFC federado**. A lista já abre com os modelos
   que estão ligados no visualizador; marque ou desmarque os que quiser (mínimo de dois).
3. Clique em **Gerar**. A junção roda em segundo plano — pode sair da tela. Quando terminar, o
   sino avisa e o painel mostra o modelo pronto.

**O que o sistema exige.** Os modelos marcados precisam ter o **mesmo schema** (IFC2X3, IFC4 ou
IFC4X3) e a **mesma unidade de comprimento** (todos em milímetros, por exemplo). Um modelo que
não combina fica desabilitado, com o motivo escrito ao lado — por exemplo, "Em metros — os
marcados estão em milímetros. Exporte de novo na mesma unidade." Modelos que ainda não foram
convertidos para o visualizador também ficam de fora. A soma dos arquivos não pode passar de
2 GB.

**O que muda no arquivo.** Nada é recalculado nem reposicionado: os elementos de cada modelo são
copiados como estão, sob um único projeto. O primeiro modelo da lista (na ordem do painel) dá o
nome e a unidade ao projeto. Se dois modelos tiverem elementos com o mesmo identificador, o sistema
avisa na tabela do federado — alguns programas mostram só um deles.

## Onde fica

O federado é guardado como documento do projeto, na pasta **Modelo federado**, dentro de
**Desenvolvimento**, na aba **Arquivos**. Cada geração vira uma nova **revisão** do mesmo
documento (R00, R01, R02…), com o nome `CÓDIGO-FEDERADO-R00.ifc`.

- A tabela mostra, para cada revisão, **quem gerou, quando, o tamanho** e a **composição** — quais
  modelos (e em qual revisão) entraram.
- A numeração **nunca se repete**: se você excluir a R01, a próxima geração é a R02. Assim a
  composição de uma revisão continua dizendo, para sempre, o que ela continha.
- Pelo **⋯** (ou botão direito) de cada revisão você baixa o arquivo ou o exclui. Quando sobra só
  uma revisão, a exclusão passa a ser a do modelo federado inteiro (a pasta some até a próxima geração).
- O federado **não aparece** em Recebidos do cliente nem na lista de modelos da Compatibilização
  (ele repetiria a obra inteira).

## Quem vê e quem gera

- **Ver e baixar:** quem tem acesso à Compatibilização (**Ver maquete federada e apontamentos** no perfil de
  acesso) e participa do projeto. Não depende da disciplina: quem vê a maquete já vê todos os IFCs.
- **Gerar e excluir:** quem gerencia a Compatibilização.
- O federado **não pode ser editado nem substituído** pelas ações comuns de documento — ele só
  nasce de uma geração.

## Se algo der errado

- **"Já há uma geração em andamento"** — só uma geração por projeto de cada vez; espere terminar.
- **Geração presa** — se o servidor reiniciar no meio, a geração é liberada sozinha depois de
  45 minutos e dá para tentar de novo.
- **Arquivo sumiu** — se o IFC de um modelo foi apagado do servidor entre o pedido e a geração, a
  mensagem diz qual. Reenvie o arquivo ou desmarque o modelo.

[← Projetos](README.md)
