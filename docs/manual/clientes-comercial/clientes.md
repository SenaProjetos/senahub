---
titulo: Clientes
descricao: Cadastro de clientes (PF/PJ), contatos, filtros e ativação/desativação.
resumo: Liste e filtre clientes, cadastre PF ou PJ, adicione contatos e ative/desative cadastros sem apagar o histórico.
tags: [clientes, cadastro, contatos, pf, pj, desativar, reativar, categoria, uf]
palavras-chave: [cliente, cadastro, pessoa física, pessoa jurídica, contato, desativar, reativar, categoria, cidade, uf]
sinonimos: [clientela, contatos, cadastro de clientes]
---

# Clientes

## Objetivo

Manter o cadastro dos clientes do escritório — dados, classificação e contatos — base
para projetos, propostas e financeiro.

## Quando utilizar

- Para cadastrar um novo cliente, atualizar dados ou registrar contatos.

## Como acessar

- Menu → **Clientes** (`/clientes`). Exige `clientes:ver`.
- Disponível a admin, supervisor e administrativo.

## A lista de clientes

- **Busca** por texto e **filtros**: tipo (**PF/PJ**), UF, cidade, categoria e situação
  (**ativo/inativo**). Por padrão mostra ativos e inativos.
- **Ordenação** por nome, cidade ou data de cadastro (padrão: nome, crescente).
- **Paginação** padrão (12/24/48).

## Criar / editar cliente (exige `clientes:gerir`)

1. Clique em **Novo cliente**.
2. Informe os dados (nome, tipo PF/PJ, documento, endereço, categoria, e-mail etc.).
3. **Salvar**.

## Contatos

- No detalhe do cliente é possível **adicionar contatos** (nome, função, e-mail,
  telefone). Exige `clientes:gerir`.

## Ativar / desativar

- Em vez de excluir, o cliente é **desativado** (preserva o histórico) e pode ser
  **reativado** depois. Ambas exigem `clientes:gerir`.

## Permissões

| Ação | Permissão |
| --- | --- |
| Ver lista/detalhe | `clientes:ver` |
| Criar/editar, contatos, ativar/desativar | `clientes:gerir` |

## Regras de negócio

- **Desativar não apaga**: o cliente some das listas de seleção (ex.: ao criar projeto),
  mas o histórico permanece.
- E-mail vazio é gravado como "sem e-mail" (não força valor).

## Funcionalidades relacionadas

- [Comercial](comercial.md) · [Projetos](../projetos/projetos.md) · [Portal do cliente](../inicio/portal-cliente.md)

## FAQ

**Posso excluir um cliente?** A ação padrão é **desativar** (reversível), não apagar.

**Por que um cliente não aparece ao criar um projeto?** Ele deve estar **ativo**.
