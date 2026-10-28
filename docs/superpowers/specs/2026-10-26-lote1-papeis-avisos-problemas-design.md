# Lote 1 — Papéis, Avisos no topo, Problemas por projeto (desenho)

Origem: reunião de 26/10/2026 (ver [roadmap](2026-10-26-reuniao-hub-roadmap.md)). Três mudanças
independentes, entregues juntas porque são pequenas ou reaproveitam o que já existe.

## Intenção

Os projetistas não olham os avisos (passam batido), ninguém consegue cadastrar Analista ou Gerente
como membro de projeto, e quem corrige apontamentos precisa abrir o visualizador de pranchas
(ou a lista geral de todos os projetos) para saber o que está aberto no projeto em que trabalha.

## Metas

1. Analista e Gerente aparecem na lista de papéis do membro do projeto.
2. Um atalho de Avisos fica visível no topo, ao lado do sino.
3. Cada projeto tem uma aba **Problemas**: lista, por disciplina, dos apontamentos do projeto,
   com a prancha vinculada, resposta e mudança de estado sem abrir o visualizador.

## Não metas

- Analista/Gerente não ganham poderes de Coordenador (`ehCoordenador` não muda) e não são
  ligados automaticamente ao `Cargo` da pessoa.
- Nenhuma tabela nova de dados e nenhuma migração.
- A lista de apontamentos 3D da Coordenação não é tocada nem misturada (decisão do dono).
- A página geral `/pendencias` não muda de lugar nem de regra.
- Sem contador numérico de avisos, sem edição em lote de problemas (fica para depois).

## Anti-metas (seria falha mesmo funcionando)

- Quem hoje não pode fechar/descartar/adiar um apontamento passar a poder pela aba.
- O projetista ver rascunhos de análise de outra pessoa.
- A aba mostrar projeto que o usuário não enxerga.

## 1. Papéis Analista e Gerente

- `ProjetoMembro.papel` é `String?` (sem enum no banco): **sem migração**.
- Em [papeis.ts](../../../src/modules/projetos/papeis.ts): acrescentar `gerente` e `analista` a
  `PAPEIS_PROJETO` e a `ROTULO_PAPEL` ("Gerente", "Analista"). O select de
  [equipe-manager.tsx](../../../src/components/projetos/equipe-manager.tsx), o schema Zod
  (`projetos/schemas.ts`) e o rótulo da Visão Geral já leem a lista.
- Ordem na lista (minha escolha): coordenador, gerente, analista, projetista, apoio, estagiário,
  consultor externo. Os valores existentes não mudam de chave.
- Atualizar `papeis.test.ts` (hoje compara a lista inteira).
- Atenção: `planejamento/recursos.ts` tem o seu **próprio** `Papel`/`ROTULO_PAPEL` (papel na EAP);
  não é este e não muda.

## 2. Atalho de Avisos ao lado do sino

- Em [header.tsx](../../../src/components/shell/header.tsx), junto aos atalhos de Chat e sino
  (mesmo padrão de `temChat`): `temAvisos = itensDoMenu.some(i => i.href === "/avisos")`, ícone
  de megafone/aviso que leva a `/avisos`. Só computador, como o do Chat (`hidden md:grid`); no
  celular o item já está no menu.
- **Indicador:** um ponto (sem número) quando existe aviso recebido nos últimos 3 dias. Motivo:
  o modal de login força a leitura, então "não lidos" fica quase sempre em zero e um contador
  não chamaria ninguém. Os 3 dias e o ponto são escolha minha.
- "Recebido" = `AvisoDestinatario.criadoEm` (não `entregueEm`, que pode ser nulo, nem `enviadoEm`
  do aviso, que ignora o destinatário).
- O ponto **some quando a pessoa abre `/avisos`**: guarda-se no navegador o instante da última
  visita (`localStorage`, por pessoa, em try/catch) e o ponto só acende se houver aviso recebido
  depois dele e dentro dos 3 dias. É conveniência por aparelho: em outro computador o ponto pode
  reaparecer, e sem acesso ao armazenamento ele só obedece aos 3 dias. Nada de coluna ou migração.
- O ponto vem de uma action de leitura leve (`existeAvisoRecente`, devolve a data do aviso mais
  novo dentro dos 3 dias) chamada ao montar e ao mudar de rota, sem polling. Falhou → sem ponto,
  o ícone continua.
- `data-tour`/guia de uso: se o tour de notificações citar os atalhos, incluir o novo.

## 3. Aba Problemas por projeto

**Rota e acesso.** `projetos/[id]/problemas/page.tsx`, rótulo "Problemas". Entra em
[abas.ts](../../../src/modules/projetos/abas.ts) (`ABAS_CONFIGURAVEIS` e `ABA_LABEL`, logo após
"/arquivos") e em `abasVisiveis` do layout do projeto. Gate: `arquivos:ver` (o mesmo de
`/pendencias`) mais o escopo de projeto que o layout já aplica (`obterProjetoMinimo`). Entra em
`abasComConteudo` (aba "vazia" quando o projeto não tem nenhum apontamento publicado).

**O que lista.** Apontamentos (`Pendencia`) do projeto, **publicados e não excluídos** — o rascunho
da análise continua sendo só do autor, no visualizador (regra existente de `pendenciasDoUpload`).
Consequência a conferir com o dono: "o markup vira problema aberto" acontece ao **enviar/publicar**
os apontamentos, não a cada traço.

**Agrupamento e filtros.** Agrupado por disciplina (seção com contagem). Filtro de situação:
*Em aberto* (padrão: `aberta` + `em_correcao`), *Aguardando verificação* (`resolvida`),
*Encerrados* (`fechada`, `descartada`, `adiado`); mais severidade e tipo. O número de "aguardando
verificação" aparece no filtro, para o validador não perder o que o projetista marcou resolvido.

**Colunas.** Nº, texto, prancha (arquivo + página), severidade, tipo, prazo, situação, dias em
aberto (`calcularAging` a partir de `createdAt`; nos encerrados o contador para em `fechadoEm`).

**Link da prancha.** O código leva ao visualizador no ponto,
`/projetos/{id}/arquivos/{uploadId}/visualizar?pin={numero}`, mas com o `uploadId` da **versão
vigente do documento** (`documentoId` é a âncora estável; `uploadId` é onde o apontamento nasceu e
depois da R02 abriria a R01). Sem `documentoId` (linha legada) ou sem versão vigente, cai no
`uploadId` de origem. Se o arquivo está na lixeira, a linha continua na lista, mas o código vira
texto simples com a dica "Arquivo indisponível" (nada de 404).

**Detalhe e resposta.** Linha expansível (ou painel) com o texto completo, a conversa
(`PendenciaResposta`), campo de resposta e os botões do estado. Tudo chama as **actions
existentes** (`responderPendencia`, `assumirCorrecaoPendencia`, `resolverPendencia`,
`reabrirPendencia`, `fecharPendencia`, `descartarPendencia`, `adiarPendencia`). A aba não
cria regra nem permissão: o que cada pessoa pode fazer em cada linha vem de
`transicoesPossiveis(status, papeis)` ([helpers.ts](../../../src/modules/projetos/pendencias/helpers.ts)),
com os papéis calculados como `papeisSobre` (hoje privado em `actions.ts`) — extrair para um módulo
compartilhado. Estado proibido para a pessoa fica **desabilitado com o motivo** (mesma frase do
`ActionError`); o servidor continua recusando, a tela só reflete.

**Menu de contexto (ADR-0002).** Reaproveitar o descritor que já existe,
`itensDoApontamento(p, ctx)` em
[acoes-apontamento.ts](../../../src/modules/projetos/pendencias/acoes-apontamento.ts) (já testado),
alimentando o botão direito e o `⋯`; nada de descritor paralelo. Sem barra de seleção em lote
nesta versão.

**Quem vê e quem pode, linha a linha.**
- A aba é **só para usuário interno** (`tipo = interno`), como o item "Apontamentos" do menu:
  a conversa e as correções são discussão interna e não podem vazar para o portal do cliente,
  mesmo que um perfil de cliente venha a ganhar `arquivos:ver`. A checagem vai na página e em
  `abasVisiveis`.
- **Responder** segue a regra de `responderPendencia` (`exigirParticipante`: autor do apontamento,
  responsável da disciplina ou quem atua em disciplina alheia), que não é a mesma das transições.
  Extrair essa regra para função pura compartilhada; o DTO leva `autorId`. Quem não participa vê o
  campo desabilitado com a mesma frase de recusa do servidor.
- Os botões de estado também refletem as permissões de cada action (`projetos:ver` para assumir,
  resolver, reabrir e adiar; `uploads:validar` para fechar e não procede), não só a máquina de estados.
  Sem a permissão: omitido ou desabilitado com o motivo, conforme o ADR-0002.

**Leitura.** Uma query `problemasDoProjeto(projetoId, viewer)` em `pendencias/queries.ts`, que
resolve os papéis do usuário **uma vez por disciplina** (não por linha) e devolve DTO serializável
(datas em ISO). Não reaproveitar `visaoConsolidadaPendencias` (filtra só abertos, sem resposta
nem prancha).

**Revalidação.** As actions acima já revalidam `/pendencias` e o visualizador; acrescentar
`/projetos/{id}/problemas` (em `revalidarViewer` ou equivalente).

**Layout.** Aba de projeto sem `CabecalhoPagina` próprio (o layout do projeto já traz cabeçalho e
abas); lista que rola dentro da área, sem rolagem horizontal da página a 390×844.

## Fica para o construtor

Detalhes visuais da linha expandida; como extrair `papeisSobre`; nome exato dos arquivos de teste;
texto vazio da aba ("Nenhum problema aberto neste projeto").

## Escolhas minhas (conferir)

- Papéis: ordem da lista e Analista/Gerente sem poderes.
- Atalho de Avisos: ponto de "aviso nos últimos 3 dias", que some ao abrir `/avisos` (marca
  guardada no navegador), sem número, só no computador.
- Aba Problemas só para usuário interno; link da prancha na versão vigente; resposta e botões
  seguem a permissão de cada action; reaproveita `itensDoApontamento`.
- Aba Problemas: só apontamentos publicados; os três filtros de situação; `arquivos:ver` como gate;
  sem ação em lote; menu da página geral continua "Apontamentos" (o nome "Problemas" é só da aba
  do projeto — decidir depois se a página geral também muda de nome).

## Verificação

Testes unitários (papéis, descritor de menu, filtro/agrupamento puro); `npm run lint` e
`npm test`; tela a 390×844 e a 1366×768 com o menu aberto; checagem com três perfis (projetista
da disciplina, validador, usuário sem acesso ao projeto) de que cada um vê e pode só o que já podia.
