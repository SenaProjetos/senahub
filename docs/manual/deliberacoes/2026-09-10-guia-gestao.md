---
titulo: Deliberação — Guia de uso de Gestão (F4) e encerramento do plano
descricao: Ata sobre o guia de Gestão, a adaptação do template a um setor sem fluxo único, e o encerramento das 5 fases do plano.
resumo: Guia de Gestão publicado; template adaptado para seis áreas independentes. Plano de Guias de uso encerra com 5 dos 9 setores prontos.
tags: [deliberação, conselho, gestão, guia de uso, licitações, acessos, encerramento]
palavras-chave: [deliberação, ata, guia de uso, gestão, licitações, certidões, jurídico, qualidade, patrimônio, acessos, encerramento de fase]
sinonimos: [ata técnica]
---

# Deliberação — Guia de uso de Gestão (F4) e encerramento do plano

- **Data:** 2026-09-10
- **Funcionalidades:** `/guias/gestao`, botão "Guia de uso" em `/licitacoes`.
- **Plano:** [`2026-09-09-guias-de-uso-in-app.md`](../../superpowers/plans/2026-09-09-guias-de-uso-in-app.md) (F4, última fase)

## Participantes
Presidente, Iniciante, Treinamento, Gestão, Backend, Segurança, Revisor Técnico.

## Contexto

Quinta e última fase do plano de Guias de uso. Gestão foi deixada para o fim por ser o setor de
menor densidade de jargão entre os quatro planejados — mas revelou uma característica estrutural
que as fases anteriores não tinham: não é um processo com começo e fim, são seis áreas
independentes.

## Descobertas (inspeção de código)

- **Licitação segue máquina de estados só-avança.** `transicaoPermitida` não tem caminho de volta
  de `ganha`; a única transição de sistema é `ganha → em_execucao`, disparada só por
  `importarLicitacao`.
- **Habilitação se resolve por certidão, quando ligada a uma.** `itemAtendido` prioriza a marcação
  manual, mas na ausência dela lê a validade da certidão contra a data de referência — um item pode
  "desmarcar sozinho" quando a certidão vence.
- **Acessos tem dois gates por registro**, documentados na memória do módulo: `podeVerCadastro` e
  `podeVerCredencial` são permissões independentes, e `escopoCredencial` **não** usa `acessoGlobal()`
  — só `superUsuario` vê todas as credenciais, diferente do resto do sistema.
- **Jurídico mistura dois tipos de contrato** no mesmo modelo: contrato de cliente (via
  `propostaId`) e contrato de equipe (via `vinculoId`, com dado sensível de RH).
- **TI é permissão separada dentro de Patrimônio** (`patrimonio:ti`), não herdada de
  `patrimonio:ver`.
- **Medição prévia evitou o defeito de F1/F2.** Testadas as 6 rotas-âncora com sessão `cliente`
  antes de escrever o botão: todas respondem 307. O botão não precisou de `mostrarGuia`.

## Opiniões dos Especialistas

- **Gestão:** o setor não tem "caminho natural" — a regra do topo do guia precisa dizer isso
  explicitamente, ou o leitor vai procurar uma sequência que não existe.
- **Segurança:** os dois gates de Acessos são o ponto mais fácil de explicar errado. O guia precisa
  deixar claro que ver `•••` numa credencial compartilhada é o segundo gate funcionando, não falha.
- **Backend:** o botão só aparece para quem tem `licitacoes:ver` de fato — `supervisor` no seed de
  demo não tem essa permissão granular. Não é bug do botão; é o dado de teste.
- **Treinamento:** vale registrar, para as próximas ondas do backlog (Início/Portal, Comunicação,
  Sistema, Engenharia), que nem todo setor cabe no template de fluxo ponta a ponta.

## Discussão

Consenso em manter os componentes compartilhados (`GuiaShell`, marcos, índice) mesmo sem um fluxo
sequencial real: os 6 marcos passam a mapear as 6 rotas, não etapas de um processo, e as seções
`#antes`/`#rotina` do template — já opcionais desde a F1 — foram dispensadas de novo. A regra do
topo do guia ("são seis gavetas, não um fluxo") é o que evita o leitor achar que falta alguma etapa.

Sobre o teste do botão: a sessão `supervisor` não renderizou o botão em `/licitacoes` porque não
tem `licitacoes:ver` no seed de demo — confirmado testando com `paulo@demo.senahub`
(`administrativo`, que recebe essa permissão em `PERMISSOES_BASE`). Registrado para não induzir a
próxima fase a desconfiar do código por causa do dado de teste errado.

## Divergências

Nenhuma. O plano encerra com as 5 fases entregues.

## Decisão Final

- Publicado o guia em `/guias/gestao` (`components/gestao/guia-gestao-view.tsx`): 9 termos,
  6 marcos (um por rota, não por etapa), 6 armadilhas, 6 dúvidas.
- `lib/guias.ts`: setor `gestao` passa a `estado: "pronto"`; entrada no `VIEWS` de `[setor]`.
- Botão "Guia de uso" em `/licitacoes`, sem gate adicional (as 6 rotas-âncora não renderizam para
  `cliente` — medido antes de implementar).
- Stub `docs/manual/gestao/guia-iniciante.md` + entrada no `search-index.json`.
- Divergências F4-1 a F4-3 registradas na §12 do plano.
- **Plano `2026-09-09-guias-de-uso-in-app.md` encerrado**: 5 dos 9 guias publicados
  (Comercial, Projetos, Financeiro, RH e Ponto, Gestão). Início e Portal, Comunicação, Sistema e
  Engenharia seguem em backlog aberto (§10 do plano), não cancelados.

## Melhorias Sugeridas

- Ao retomar o backlog, decidir se o template de fluxo (marcos sequenciais) se aplica a Início e
  Portal e Comunicação, ou se seguem o padrão de "áreas independentes" que a F4 estabeleceu para
  Gestão.
- F0-1, F1-1 e F2-1 abertas como issues em 2026-09-10, após `gh auth login`:
  [#2](https://github.com/SenaProjetos/senahub/issues/2),
  [#3](https://github.com/SenaProjetos/senahub/issues/3),
  [#4](https://github.com/SenaProjetos/senahub/issues/4).

## Pendências

- F2-1, F3-2, F3-3 seguem abertas como decisões de produto (ver §12 do plano; F0-1, F1-1, F2-1
  agora rastreadas como issues #2, #3, #4).
- Backlog dos 4 setores restantes (§10 do plano), sem data.
