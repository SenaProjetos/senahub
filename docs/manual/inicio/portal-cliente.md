---
titulo: Portal do cliente (Meus projetos)
descricao: Visão externa, somente leitura, onde o cliente acompanha seus projetos.
resumo: O cliente vê os projetos do seu cadastro em cartões com situação, prazo e progresso, e abre cada um para detalhes.
tags: [portal, cliente, meus projetos, acompanhamento, externo, somente leitura]
palavras-chave: [portal, cliente, meus projetos, acompanhar projeto, progresso, prazo, situação]
sinonimos: [área do cliente, portal externo, acompanhamento de projeto]
---

# Portal do cliente (Meus projetos)

## Objetivo

Permitir que o **cliente** acompanhe, de forma simples e somente leitura, o andamento
dos projetos contratados com o escritório.

## Quando utilizar

- Quando o cliente quer ver status, prazo e progresso dos seus projetos.

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
3. Clicar em um cartão abre o **detalhe do projeto** (`/portal/{projeto}`).

## Casos especiais

- Cliente sem projetos → "Nenhum projeto ainda.".
- Conta sem vínculo de cliente → mensagem orientando contatar o escritório.

## Regras de negócio e escopo

- Mostra **apenas** os projetos do cliente vinculado à conta (`clienteId`). Nenhum dado
  de outros clientes é exibido.
- Tela **somente leitura**.

## Erros possíveis e soluções

| Situação | Causa | Solução |
| --- | --- | --- |
| "Sua conta ainda não está vinculada…" | Conta sem `clienteId` | O escritório vincula a conta ao cadastro do cliente |
| "Nenhum projeto ainda." | Cliente sem projetos cadastrados | Aguardar o cadastro do projeto |

## Funcionalidades relacionadas

- [Início (Dashboard)](dashboard.md) — equivalente interno
- [Clientes](../clientes-comercial/README.md) — onde o vínculo é configurado

## FAQ

**O cliente edita algo no portal?** Não. É só acompanhamento.

**Por que o cliente não vê projeto de outra empresa?** O portal é limitado ao cadastro
de cliente vinculado à conta.
