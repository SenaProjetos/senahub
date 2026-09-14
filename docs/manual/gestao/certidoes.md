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

- **Resumo operacional:** quatro cards no topo — Vencidas, Vencem em breve, Regulares e
  Sem documento. Clique num card para filtrar a lista por ele; clique de novo para soltar.
- **Ordem por prioridade:** a lista já chega ordenada pelo que precisa de ação primeiro
  (obrigatórias vencidas no topo, depois as demais vencidas, e assim por diante). O seletor
  **Ordenar** troca para validade ou nome quando você preferir.
- **Buscar e filtrar:** busca por tipo, descrição ou responsável, e o botão **Filtrar** combina
  situação, documento, obrigatoriedade, responsável e tipo. O número no botão mostra quantos
  filtros estão ativos.
- **Aviso no menu e no Início:** quando há certidão vencida ou vencendo em 30 dias,
  o item **Certidões** do menu ganha uma bolinha com o número (vermelha se alguma já
  venceu, âmbar se só há vencendo), e o Início mostra o card **Certidões a renovar**.
  Some sozinho quando tudo está em dia. Só aparece para quem tem `certidoes:ver`.
- **Quantos dias faltam:** cada linha mostra "vence em 12 dias" ou "vencida há 26 dias"
  abaixo da data — a data sozinha não diz se já é problema.
- **Tipos obrigatórios faltando:** aviso quando um tipo marcado como obrigatório não
  tem nenhuma certidão vigente.
- **Nova certidão:** botão no canto superior direito. Abre um formulário com tipo,
  responsável, validade, documento (PDF opcional) e observação. Se o PDF tiver a validade
  no texto, o sistema sugere a data — confira antes de salvar.
- **Conformidade:** um aviso no topo diz quantas certidões **obrigatórias** precisam de
  atenção e por quê (vencidas, sem documento, sem responsável, nunca cadastradas), com
  atalho **Ver pendências**. Quando está tudo certo, ele vira uma confirmação discreta.
- **Nova versão:** anexa o PDF renovado com a nova validade — a versão anterior fica
  guardada no histórico, nunca é perdida.
- **Detalhes da certidão:** clique no nome para abrir o painel lateral com informações,
  documento atual, histórico de versões (quem enviou e quando), licitações que exigem a
  certidão e a auditoria. As versões ficam aqui, e não numa coluna da lista.
- **Uma ação por linha:** certidão vencida ou vencendo mostra o botão **Atualizar** (que é o
  fluxo de nova versão de sempre — o arquivo anterior continua no histórico). As demais ações
  ficam no menu **⋮**: visualizar, baixar, editar, excluir.
- **Visualizar PDF na tela:** abre o PDF num visualizador embutido, com zoom e busca de
  texto, sem baixar. Pelo menu **⋮** da linha ou dentro do painel de detalhes.
- **Download individual ou em zip:** baixe o arquivo atual de uma certidão, ou
  selecione várias e baixe tudo num `.zip`.
- **Excluir e restaurar:** excluir uma certidão a tira da lista e dos alertas de
  vencimento, mas o histórico de versões e a auditoria continuam guardados — nada é
  apagado de fato. A aba **Excluídas** lista o que foi excluído, com botão para
  restaurar.
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

- Excluir é reversível (soft delete): a certidão some da lista ativa, do painel e dos
  alertas de vencimento, mas versões e auditoria continuam existindo — restaure em
  **Excluídas** quando precisar.
- Uma certidão excluída não pode receber nova versão nem continua exposta em link
  público já gerado — restaure antes.
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

**Excluí uma certidão por engano, perdi tudo?** Não — abra o filtro **Excluídas** e
clique em restaurar. Nada é apagado do banco.
