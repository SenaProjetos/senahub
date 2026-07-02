---
titulo: Jurídico
descricao: Documentos jurídicos com versões e aceite assinado, certidões com validade, pastas e modelos de contrato.
resumo: Organize documentos jurídicos em pastas (com versões e aceite/assinatura por hash), controle certidões e seus vencimentos e use modelos de contrato.
tags: [jurídico, documentos, contrato, certidão, validade, versão, aceite, assinatura, pasta]
palavras-chave: [jurídico, documento jurídico, contrato, certidão, validade, vencimento, versão, aceite, assinatura, hash, pasta, modelo de contrato]
sinonimos: [legal, contratos, documentação jurídica]
---

# Jurídico

## Objetivo

Centralizar a documentação jurídica do escritório: **documentos** (com versões e
aceite), **certidões** (com validade), **pastas** organizadoras e **modelos de
contrato**.

## Como acessar

- Menu → **Jurídico** (`/juridico`). Exige `juridico:ver`.
- Disponível a admin, supervisor e administrativo. **Gerir exige `juridico:gerir`**.

## O que a tela oferece

- **Documentos jurídicos:** organizados em **pastas**, vinculados opcionalmente a
  **projeto** e **cliente**, com **versões** (cada uma com autor e arquivo).
- **Aceite / assinatura:** cada versão pode registrar **aceites** com **hash do arquivo**
  e data — prova de quem aceitou o quê e quando.
- **Certidões:** com **tipo** e **validade** (ordenadas por vencimento), e versões.
- **Modelos de contrato:** modelos por categoria, com conteúdo reutilizável.

## Permissões

| Ação | Permissão |
| --- | --- |
| Ver documentos/certidões | `juridico:ver` |
| Criar/editar, versões, aceites, certidões, modelos | `juridico:gerir` |

## Regras de negócio

- O **aceite** guarda o **hash** do arquivo aceito — garante integridade da prova.
- Certidões são acompanhadas por **validade** (apoia alertas de vencimento).

## Funcionalidades relacionadas

- [Licitações](licitacoes.md) (habilitação/certidões) · [Clientes](../clientes-comercial/clientes.md) · [Termos de uso](../sistema/README.md)

## FAQ

**O sistema avisa quando uma certidão vai vencer?** As certidões têm validade e
alimentam os alertas; acompanhe a lista ordenada por vencimento.

**O aceite é uma assinatura?** É um registro de aceite com **hash** do arquivo, autor e
data, como prova de concordância.
