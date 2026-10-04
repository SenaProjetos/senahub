---
titulo: Clientes
descricao: Cadastro de clientes (PF/PJ), importação por CNPJ, contatos, filtros e ativação/desativação.
resumo: Liste e filtre clientes, cadastre PF ou PJ, importe dados cadastrais por CNPJ, adicione contatos e ative/desative cadastros sem apagar o histórico.
tags: [clientes, cadastro, contatos, pf, pj, cnpj, porte, desativar, reativar, excluir, inativos, categoria, uf]
palavras-chave: [cliente, cadastro, pessoa física, pessoa jurídica, cnpj, importar dados, porte, contato, desativar, reativar, excluir, inativos, categoria, cidade, uf]
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
  (**ativos / só inativos / ativos e inativos**). Por padrão a lista mostra **só os ativos** —
  para ver os desativados, escolha **Só inativos** ou **Ativos e inativos** no filtro de situação.
  A exportação CSV segue o mesmo filtro.
- **Ordenação** por nome, cidade ou data de cadastro (padrão: nome, crescente).
- **Paginação** padrão (12/24/48).

## Criar / editar cliente (exige `clientes:gerir`)

1. Clique em **Novo cliente**.
2. Informe os dados (nome, tipo PF/PJ, documento, endereço, categoria, e-mail etc.).
   Para pessoa jurídica, após preencher um CNPJ válido, use **Importar dados** para sugerir
   razão social, nome fantasia, contato, endereço e porte. Revise os dados antes de salvar.
   Se a consulta não encontrar o CNPJ, preencha os campos manualmente.
3. Na aba **Comercial**, escolha o **Porte** da empresa na lista disponível.
4. **Salvar**.

## Contatos

- No detalhe do cliente é possível **adicionar contatos** (nome, função, e-mail,
  telefone). Exige `clientes:gerir`.

## Ativar / desativar

- Em vez de excluir, o cliente é **desativado** (preserva o histórico) e pode ser
  **reativado** depois. Ambas exigem `clientes:gerir`.

## Excluir cliente sem dados

- Um cadastro **vazio** (feito por engano, duplicado sem uso) pode ser **excluído** pelo menu da
  lista (botão direito ou **⋯** → **Excluir**). Exige `clientes:gerir`.
- Só sai cliente **sem nenhum dado**: nenhum contato, projeto, proposta, negociação, prospecção,
  lançamento ou documento financeiro, documento, documento jurídico, orçamento de custo, interação
  registrada na timeline, usuário do portal, regra de preenchimento nem fusão com outro cliente.
  Quando há algum dado, o item **Excluir** aparece desabilitado dizendo o que existe — nesse caso,
  **desative**.
- O CPF/CNPJ do cliente excluído fica livre para um novo cadastro.

## Menu de ações e seleção em lote

Na lista, o botão direito numa empresa (ou o botão **⋯**) oferece **Abrir cliente**, **Abrir em nova
aba**, **Editar**, **Desativar/Reativar**, copiar **nome**, **documento** e **e-mail** e **Excluir** (só cadastro vazio).
Marque várias empresas na caixa de seleção para **desativar, reativar ou excluir todas de uma vez**
(na exclusão em lote, quem tem dados fica e aparece no relatório com o motivo) — a seleção continua
valendo ao trocar de página e de filtro, e o botão **Selecionados (N)** mostra só as empresas marcadas,
de qualquer página ou filtro.

## Permissões

| Ação | Permissão |
| --- | --- |
| Ver lista/detalhe | `clientes:ver` |
| Criar/editar, contatos, ativar/desativar, excluir cadastro vazio | `clientes:gerir` |

## Regras de negócio

- **Desativar não apaga**: o cliente some das listas de seleção (ex.: ao criar projeto),
  mas o histórico permanece.
- E-mail vazio é gravado como "sem e-mail" (não força valor).

## Funcionalidades relacionadas

- [Comercial](comercial.md) · [Projetos](../projetos/projetos.md) · [Portal do cliente](../inicio/portal-cliente.md)

## FAQ

**Posso excluir um cliente?** Só se ele ainda não tiver nenhum dado (cadastro vazio). Com qualquer
dado, a ação é **desativar** (reversível) — o histórico fica.

**Onde estão os clientes desativados?** Fora da lista padrão. Use o filtro de situação
(**Só inativos** ou **Ativos e inativos**).

**Por que um cliente não aparece ao criar um projeto?** Ele deve estar **ativo**.
