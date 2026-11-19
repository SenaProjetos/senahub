---
titulo: Portal do cliente (Meus projetos)
descricao: Visão externa, somente leitura, onde o cliente acompanha seus projetos.
resumo: O cliente vê os projetos do seu cadastro em cartões com situação, prazo e progresso, abre cada um para detalhes, baixa as pranchas entregues e acompanha no Financeiro as parcelas em aberto e pagas.
tags: [portal, cliente, meus projetos, acompanhamento, externo, somente leitura, pranchas, entregas, financeiro, parcelas]
palavras-chave: [portal, cliente, meus projetos, acompanhar projeto, progresso, prazo, situação]
sinonimos: [área do cliente, portal externo, acompanhamento de projeto]
---

# Portal do cliente (Meus projetos)

## Objetivo

Permitir que o **cliente** acompanhe, de forma simples e somente leitura, o andamento
dos projetos contratados com o escritório.

## Quando utilizar

- Quando o cliente quer ver status, prazo e progresso dos seus projetos.
- Quando o cliente quer abrir ou baixar as pranchas que o escritório já entregou.

## Quando não utilizar

- Não é área de edição: o cliente **não** cria nem altera dados aqui.
- Perfis internos não usam o portal — eles têm o [Dashboard](dashboard.md) e o módulo
  de [Projetos](../projetos/README.md).

## Como acessar

- Exclusivo do perfil **cliente**: menu → **Meus projetos**, ou a rota `/portal`.
- Perfis internos que tentem abrir `/portal` são redirecionados para o Início.

## Pré-requisitos

- A conta do cliente precisa estar **vinculada a um cadastro de cliente**. Sem vínculo,
  a tela mostra: *"Sua conta ainda não está vinculada a um cliente. Contate o
  escritório."*

## Fluxo completo

1. O cliente entra no sistema e cai em **Meus projetos**.
2. Vê **um cartão por projeto** do seu cadastro, com:
   - **Código** e **nome** do projeto;
   - **Situação** (etiqueta);
   - **nº de disciplinas**;
   - **Prazo** final;
   - **barra de progresso (%)**.
3. Clicar em um cartão abre o **detalhe do projeto** (`/portal/{projeto}`), com as disciplinas,
   as **Entregas** e os **Documentos** que o cliente envia ao escritório.

## Pranchas e entregas

A seção **Entregas** do detalhe do projeto mostra o que o escritório já entregou, em duas pastas:

- **Compartilhado** — as pranchas enviadas ao cliente;
- **Liberado para obra** — as pranchas que a obra pode usar.

Dentro de cada pasta, as pranchas ficam por disciplina, fase (EP, BS, EX…) e formato (PDF, DWG…). Cada
arquivo mostra a **revisão** (R00, R01…) e, quando houver, **o que mudou** nela. Abaixo das pastas ficam as
**ARTs** do projeto, com o histórico de versões.

- O ícone de olho **abre o PDF no navegador**; o de seta **baixa** o arquivo.
- O ícone de pacote ao lado de uma pasta baixa **a pasta inteira em .zip**; **Baixar tudo (.zip)** baixa todas.
- **Em revisão** — o escritório está preparando uma revisão nova desta prancha (normalmente a pedido do
  cliente). A prancha atual continua valendo até a nova chegar.
- **Download bloqueado** — o escritório bloqueou temporariamente esta revisão. Ela aparece na lista, mas não
  abre nem baixa; fale com a equipe do projeto.

Só aparecem aqui as pranchas que o escritório colocou nas pastas do cliente. Revisões em andamento ou em
análise interna não aparecem. Os mesmos arquivos são os que um link de arquivos do projeto mostraria.

## Financeiro

No menu **Financeiro** o cliente vê as parcelas que paga ao escritório, **só valores e datas** — sem nota
fiscal, boleto, conta bancária ou descrição interna.

- No topo, três totais: **Vencido**, **A vencer** e **Pago**.
- **Em aberto** — parcelas ainda não pagas, da mais antiga para a mais nova, com projeto, vencimento, valor e
  situação (**Vencida** ou **A vencer**).
- **Pagas** — da mais recente para a mais antiga, com o vencimento e a data em que o pagamento foi registrado.

Regras:

- Entra a parcela ligada ao cliente, ou sem cliente num projeto dele. Parcela com outro pagador no mesmo projeto
  não aparece.
- O valor é o que o cliente paga: quando a nota tem imposto retido, aparece o líquido. Numa parcela paga em
  parte, a parte paga fica em **Pagas** e o resto em **Em aberto**.
- Não aparecem: previsão de recebimento do cronograma (ainda não faturada), parcela cancelada, juros e descontos
  da baixa e, como na cobrança por e-mail, parcelas de licitação (salvo se a cobrança de licitação estiver ligada
  em Configurações → Avisos de vencimento).
- Cliente desativado no cadastro vê o aviso de acesso suspenso, como no resto do portal.

## Casos especiais

- Cliente sem projetos → "Nenhum projeto ainda.".
- Conta sem vínculo de cliente → mensagem orientando contatar o escritório.
- Projeto sem prancha nas pastas do cliente → "Nenhuma prancha compartilhada ainda.".

## Regras de negócio e escopo

- Mostra **apenas** os projetos do cliente vinculado à conta (`clienteId`). Nenhum dado
  de outros clientes é exibido.
- Tela **somente leitura** (o único envio é o do bloco Documentos).
- Cada abertura ou download de prancha fica registrado no histórico do documento, com o nome de quem baixou
  e a marca "portal do cliente".

## Erros possíveis e soluções

| Situação | Causa | Solução |
| --- | --- | --- |
| "Sua conta ainda não está vinculada…" | Conta sem `clienteId` | O escritório vincula a conta ao cadastro do cliente |
| "Nenhum projeto ainda." | Cliente sem projetos cadastrados | Aguardar o cadastro do projeto |
| "Aceite o termo de uso para continuar." ao baixar | Há uma versão nova do termo de uso | Sair e entrar de novo e aceitar o termo |
| "Arquivo indisponível." ao baixar | A prancha saiu das pastas do cliente ou foi bloqueada | Recarregar a página; se continuar, falar com o escritório |

## Funcionalidades relacionadas

- [Início (Dashboard)](dashboard.md) — equivalente interno
- [Clientes](../clientes-comercial/README.md) — onde o vínculo é configurado

## FAQ

**O cliente edita algo no portal?** Não. É acompanhamento, download das entregas e envio de documentos.

**Por que o cliente não vê projeto de outra empresa?** O portal é limitado ao cadastro
de cliente vinculado à conta.
