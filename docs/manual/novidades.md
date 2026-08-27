---
titulo: Novidades e Notas de Versão
descricao: O que mudou em cada atualização do SenaHub, em linguagem para o dia a dia.
resumo: Histórico das novidades entregues a cada versão do sistema — funcionalidades novas e melhorias visíveis para quem usa.
tags: [novidades, notas de versão, changelog, atualizações, versão, o que mudou]
palavras-chave: [novidades, notas de versão, changelog, atualização, versão, lançamento, o que há de novo, release]
sinonimos: [release notes, changelog, o que mudou, atualizações do sistema]
---

# Novidades e Notas de Versão

Esta página reúne, em linguagem do dia a dia, o que mudou a cada atualização do
SenaHub. A versão mais recente fica no topo. Para detalhes de uso de cada
funcionalidade, veja a seção correspondente no [manual](README.md).

> Dúvida sobre alguma novidade? Abra um chamado em **Suporte** ou pergunte no **Chat**.

---

## Campos de valor padronizados (atenção: muda o jeito de digitar)

Todos os campos de dinheiro do sistema passaram a funcionar igual, **como a maquininha de
cartão**: o valor cresce dos centavos para os reais e já aparece formatado enquanto você
digita. O campo mostra **R$**, alinha o número à direita e abre o teclado numérico no
celular.

**O que muda na prática:** antes, digitar `1400` num campo de valor dava R$ 1.400,00. Agora
`1400` dá **R$ 14,00** — para R$ 1.400,00 digite `140000`. Sempre inclua os centavos.

Ponto e vírgula não precisam mais ser digitados (as teclas são ignoradas), e apagar desloca
o número de volta: `1.500,50` → `150,05`. Para recomeçar um valor, selecione tudo
(`Ctrl+A`) e digite de novo. → [Guia de Início Rápido](quick-start.md)

---

## Visão Geral de Projetos

A ficha de projeto agora abre com uma **Visão Geral** mais compacta: prazo, progresso,
entregas, pendências, riscos, cronograma e atividade recente ficam reunidos para uma leitura
rápida. O trabalho detalhado de cada disciplina — kanban, arquivos, revisões, validações,
tarefas e responsáveis — passou para a nova aba **Disciplinas**. →
[Projetos](projetos/projetos.md)

A Visão Geral também pode ser organizada por cada pessoa: em tela ampla, **Personalizar
painel** permite mover e redimensionar os blocos. A configuração é individual e fica salva
somente para o projeto aberto. Para trocar dois blocos, mantenha um sobre o outro até aparecer
**Solte para trocar**. → [Projetos](projetos/projetos.md)

Administradores, coordenadores e equipe administrativa agora têm o bloco **Horas registradas no
projeto**, com jornadas e apontamentos da equipe nos últimos 7 dias. →
[Projetos](projetos/projetos.md)

O bloco **Resultado financeiro** passou a mostrar sua composição confirmada em cards largos,
incluindo pagamentos, serviços, custos extras e rateio de horas. →
[Projetos](projetos/projetos.md)

---

## Comercial — reforma do CRM

O Comercial foi reorganizado em um fluxo claro de **prospecção → negociação → proposta → projeto**.
Agora é possível registrar interações e próximos passos, retomar empresas com histórico, consultar a
Empresa 360, acompanhar **Meu Dia**, analisar conversão por canal e baixar o recorte atual em CSV.
O botão **Nova entrada** também atende indicações, demandas espontâneas e clientes recorrentes:
registra o canal e o indicador corretos, separa demandas diferentes da mesma empresa e permite abrir
uma negociação imediatamente quando já existe um pedido concreto.
O novo botão **Guia de uso** explica o fluxo completo, com as telas e os botões de cada etapa. Os
lembretes comerciais também podem ser desligados individualmente em **Preferências**. →
[Comercial](clientes-comercial/comercial.md)

## v1.1.0 — 07/07/2026

Grande atualização que reúne meses de trabalho. Destaques por área:

### ⏱️ Ponto v2 — registro de jornada reformulado
Nova experiência de ponto: **batidas**, **escalas de trabalho**, **espelho do ponto**,
**ajustes** e **alertas/lembretes** de batida. Mais claro para o colaborador e para quem
acompanha as horas. → [Ponto](rh-ponto/ponto.md)

### 📁 Documentos do cliente
Repositório de documentos **ancorado na proposta** e **herdado pelo projeto**. O cliente
pode **enviar arquivos pelo link público da proposta**, e há uma aba **Documentos** na ficha
do cliente e no **portal do cliente**.

### 📐 Pranchas / Lista Mestre
Novo **visualizador de PDF** com **apontamentos** que viram **tarefas** e seguem para
**revisão**. O projeto ganhou **explorer de arquivos** e **histórico**. → [Projetos](projetos/projetos.md)

### 💬 Chat mais completo
**Múltiplos anexos** (dá para **colar** imagem direto), **lightbox** para ampliar,
**catálogo de emojis** por categoria, **indicador de mensagens não lidas** e vários
ajustes visuais. → [Chat](comunicacao/chat.md)

### 🗂️ Disciplinas configuráveis
O administrador agora **configura o catálogo de disciplinas** — criar, **reordenar** e
governar categorias. Incluídos o tipo **"Aprovação"** e a categoria **"Recebidos"**.

### 🔐 Acesso e login
Botão para **exibir a senha** (no login e na troca), **sessão de 16 horas** com renovação
automática e a **animação da marca** ao entrar.

### 📤 Uploads
**Validação parcial de entregas** — arquivo por arquivo, sem travar o envio inteiro por
causa de um item.

---

*As versões anteriores (base de produção) não têm notas publicadas aqui — esta página
passa a registrar as novidades a partir da v1.1.0.*
