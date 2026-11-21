---
titulo: Jurídico
descricao: Documentos jurídicos com versões e aceite assinado, pastas, modelos de contrato e a condição de pagamento do contrato de cliente.
resumo: Organize documentos jurídicos em pastas (com versões e aceite/assinatura por hash), use modelos de contrato e defina como o contrato de cliente é cobrado — por data ou por entrega (marcos do cronograma).
tags: [jurídico, documentos, contrato, versão, aceite, assinatura, pasta, condição de pagamento, contrato por entrega, assinatura pelo portal]
palavras-chave: [jurídico, documento jurídico, contrato, versão, aceite, assinatura, hash, pasta, modelo de contrato, condição de pagamento, contrato por entrega, parcela por marco, faturar parcela]
sinonimos: [legal, contratos, documentação jurídica, assinatura online]
---

# Jurídico

## Objetivo

Centralizar a documentação jurídica do escritório: **documentos** (com versões e
aceite), **pastas** organizadoras e **modelos de contrato**. Certidões da empresa
têm tela própria — veja [Certidões](certidoes.md).

## Como acessar

- Menu → **Jurídico** (`/juridico`). Exige `juridico:ver`.
- Disponível a admin, supervisor e administrativo. **Gerir exige `juridico:gerir`**.

## O que a tela oferece

- **Documentos jurídicos:** organizados em **pastas**, vinculados opcionalmente a
  **projeto** e **cliente**, com **versões** (cada uma com autor e arquivo).
- **Aceite / assinatura:** cada versão pode registrar **aceites** com **hash do arquivo**
  e data — prova de quem aceitou o quê e quando.
- **Assinatura pelo portal (contrato de cliente e aditivo):** na versão **atual** de um contrato de cliente, o
  botão **Pedir assinatura no portal** manda o contrato para o cliente assinar online. Todas as contas ativas do
  cliente recebem um e-mail e um aviso no sino. Só dá para pedir quando:
  - a versão tem **PDF**;
  - o cliente está ativo e tem ao menos **uma conta ativa no portal**;
  - o contrato não está vencido nem rescindido;
  - não há outro pedido aguardando;
  - o cliente ainda não assinou esta versão pelo portal.

  Acima do limite de aprovação, quem pede precisa ser um sócio. Cada versão mostra
  **Portal: situação · pedido por … em …**, com uma destas situações: **Aguardando o cliente**,
  **Assinado pelo cliente**, **Cancelado**, **Versão substituída** ou **Contrato encerrado**. **Cancelar pedido**
  desfaz um pedido que ainda aguarda.
  - Se você enviar uma **versão nova** enquanto o pedido aguarda, o pedido antigo para de valer (**Versão
    substituída**) e some do portal. Peça de novo na versão nova — o pedido antigo é cancelado sozinho.
  - Quando o cliente assina, **quem pediu recebe um aviso no sino**. Os efeitos são os mesmos da assinatura feita
    aqui no Jurídico: o contrato passa a **assinado** (se ainda não estava), e o prazo do projeto e as parcelas
    são atualizados em nome de quem pediu.
  - Uma conta do portal não assina pela tela do Jurídico: só pelo pedido no portal. O **link público** continua
    valendo para quem não tem conta no portal.
- **Modelos de contrato:** modelos por categoria, com conteúdo reutilizável.
- **Condição de pagamento (contrato de cliente):** o botão **Pagamento** do contrato define como ele
  é cobrado — **por data** (parcelas mensais a partir do 1º vencimento) ou **por entrega** (parcelas em
  percentual ligadas a **marcos do cronograma** do projeto). No contrato por entrega, o financeiro
  também **fatura** cada parcela dali. Veja
  [Contrato por entrega e previsão de recebimento](../financeiro/contrato-por-entrega.md).

## Permissões

| Ação | Permissão |
| --- | --- |
| Ver documentos | `juridico:ver` |
| Criar/editar, versões, aceites, modelos, condição de pagamento, **pedir e cancelar assinatura no portal** | `juridico:gerir` |
| **Faturar** uma parcela de contrato por entrega | `financeiro:gerir` |

## Regras de negócio

- O **aceite** guarda o **hash** do arquivo aceito — garante integridade da prova.
- O pedido de assinatura pelo portal vale para **contratos de cliente e aditivos**, não para contratos da equipe.

## Funcionalidades relacionadas

- [Certidões](certidoes.md) · [Licitações](licitacoes.md) (habilitação/certidões) · [Clientes](../clientes-comercial/clientes.md) · [Termos de uso](../sistema/README.md) ·
  [Contrato por entrega](../financeiro/contrato-por-entrega.md)

## FAQ

**O aceite é uma assinatura?** É um registro de aceite com **hash** do arquivo, autor e
data, como prova de concordância.
