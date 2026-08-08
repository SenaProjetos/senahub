---
titulo: Certidões
descricao: Controle de certidões da empresa — versionamento, download individual ou em zip, link público e alertas de vencimento.
resumo: Registre as certidões da empresa, anexe e renove arquivos com histórico de versões, baixe individualmente ou em zip, compartilhe por link público e acompanhe vencimentos.
tags: [certidão, validade, vencimento, versão, zip, link público, compliance]
palavras-chave: [certidão, certidões, validade, vencimento, versão, histórico, zip, download, link público, compartilhar, responsável, compliance]
sinonimos: [documentos de regularidade, CND, regularidade fiscal]
---

# Certidões

## Objetivo

Controlar as certidões da empresa (regularidade fiscal, FGTS, trabalhista, inscrições,
balanço, etc.): manter o arquivo sempre atualizado, ver o histórico de versões
anteriores, baixar rapidamente (uma a uma ou todas em zip) e compartilhar com
terceiros (contador, advogado) sem precisar de login.

## Como acessar

- Menu → **Certidões** (`/certidoes`). Exige `certidoes:ver`.
- Disponível a admin, supervisor e administrativo. **Gerir exige `certidoes:gerir`**.

## O que a tela oferece

- **Painel de vencimentos:** contagem de certidões vencidas, vencendo em até 30 dias,
  em dia e sem arquivo anexado — clique num card para filtrar a lista.
- **Tipos obrigatórios faltando:** aviso quando um tipo marcado como obrigatório não
  tem nenhuma certidão vigente.
- **Registrar certidão:** escolha o tipo, uma descrição opcional e a validade.
- **Nova versão:** anexa o PDF renovado com a nova validade — a versão anterior fica
  guardada no histórico, nunca é perdida.
- **Histórico e detalhes:** por certidão, veja todas as versões (com download de cada
  uma), quais licitações exigem essa certidão no checklist de habilitação, e a
  auditoria de quem criou/editou/baixou.
- **Download individual ou em zip:** baixe o arquivo atual de uma certidão, ou
  selecione várias e baixe tudo num `.zip`.
- **Compartilhar (link público):** gera um link sem login para um conjunto de
  certidões — útil para mandar ao contador ou advogado. O link pode expirar numa
  data e ser revogado a qualquer momento.
- **Exportar:** baixa uma planilha `.xlsx` com o panorama completo (tipo, validade,
  status, responsável, versões).
- **Responsável:** cada certidão pode ter um responsável — ele também recebe os
  alertas de vencimento dessa certidão.

## Permissões

| Ação | Permissão |
| --- | --- |
| Ver certidões e histórico | `certidoes:ver` |
| Registrar, renovar, editar, excluir, compartilhar | `certidoes:gerir` |

## Regras de negócio

- Excluir uma certidão vinculada a um item de habilitação de licitação é bloqueado —
  desvincule antes.
- O link público só expõe as certidões marcadas na lista de compartilhamento; revogar
  ou deixar expirar desliga o acesso na hora.
- Alertas de vencimento disparam em 30/15/7 dias antes, para gestores e para o
  responsável da certidão (quando definido). Pode ser desativado em Preferências.

## Funcionalidades relacionadas

- [Jurídico](juridico.md) · [Licitações](licitacoes.md) (habilitação exige certidões em dia)

## FAQ

**Perco o arquivo antigo ao anexar uma renovação?** Não — cada envio vira uma versão
no histórico, sempre disponível para download.

**Dá para mandar as certidões pro contador sem ele ter login no sistema?**
Sim, use **Compartilhar** para gerar um link público somente-leitura.

**Quem recebe o aviso de certidão vencendo?** Gestores (admin/supervisor/
administrativo) e, se a certidão tiver um responsável definido, ele também.
