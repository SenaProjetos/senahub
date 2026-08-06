---
titulo: Jurídico
descricao: Documentos jurídicos com versões e aceite assinado, pastas e modelos de contrato.
resumo: Organize documentos jurídicos em pastas (com versões e aceite/assinatura por hash) e use modelos de contrato.
tags: [jurídico, documentos, contrato, versão, aceite, assinatura, pasta]
palavras-chave: [jurídico, documento jurídico, contrato, versão, aceite, assinatura, hash, pasta, modelo de contrato]
sinonimos: [legal, contratos, documentação jurídica]
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
- **Modelos de contrato:** modelos por categoria, com conteúdo reutilizável.

## Permissões

| Ação | Permissão |
| --- | --- |
| Ver documentos | `juridico:ver` |
| Criar/editar, versões, aceites, modelos | `juridico:gerir` |

## Regras de negócio

- O **aceite** guarda o **hash** do arquivo aceito — garante integridade da prova.

## Funcionalidades relacionadas

- [Certidões](certidoes.md) · [Licitações](licitacoes.md) (habilitação/certidões) · [Clientes](../clientes-comercial/clientes.md) · [Termos de uso](../sistema/README.md)

## FAQ

**O aceite é uma assinatura?** É um registro de aceite com **hash** do arquivo, autor e
data, como prova de concordância.
