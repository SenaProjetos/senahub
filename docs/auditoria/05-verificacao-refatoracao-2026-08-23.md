# Verificação de execução — refatoração de arquivos e plantas

**Data:** 2026-08-23
**Escopo:** confronto entre `01-arquitetura-atual.md`, `02-matriz-gap.md`, `03-plano-refatoracao.md`, o código atual e o banco de desenvolvimento configurado neste repositório.
**Método:** a auditoria inicial usou somente leitura do código, Git, migrations e validações automatizadas. A continuação registrada neste arquivo implementa F2-PR6a no código, sem executar migration ou script de dados.

## Limites de evidência

- Na primeira leitura desta auditoria, `04-contexto-claude.md` tinha 0 bytes. Foi atualizado depois e agora registra uma transcrição de sessão do Claude Code. Os commits nela mencionados foram conferidos no Git; afirmações sobre produção, volumes de dados e testes manuais permanecem relato de sessão enquanto não houver evidência independente anexada.
- O banco configurado é `senahub_remake` em `localhost:5433`. `npx prisma migrate status` informou que o schema está atualizado, mas isso **não comprova** que os scripts manuais de reconciliação, backfill e merge foram executados, nem diz respeito a outro ambiente.
- A execução somente-leitura de `scripts/verificar-fase2-documentos.ts` não foi possível nesta máquina: o processo `tsx` falhou duas vezes com `ENOMEM` em `uv_os_get_passwd`. Por isso os contadores de dados da Fase 2 permanecem não verificados.

## Estado comprovado no repositório

| Fase/PR do plano | Estado | Evidência |
| --- | --- | --- |
| Fase 1, F1-PR1 a F1-PR11 | Componentes e commits presentes, mas não pronta para ativação | Commits `cd4bcba`, `c33e1b4`, `609f8cd`, `d68429e` e `cf637de`; componentes em `src/components/projetos/arquivos/`; paginação em `src/modules/uploads/queries.ts`. A-03 bloqueia o critério de aceite de upload. |
| Corte da Fase 1 | Não comprovado como ativado | A rota só usa a nova tela com `NEXT_PUBLIC_DOCUMENTOS_V2=1` ou `?docsv2=1` (`src/app/(dashboard)/projetos/[id]/arquivos/page.tsx`). O arquivo `.env` local não declara a flag. Isto é compatível com o plano de convivência; não permite concluir o estado de outro ambiente. |
| F2-PR1 — `DocumentoRevisao` + `Upload.revisaoId` | Código e migration presentes; execução do backfill não comprovada | Migration `20260814140000_documento_revisao`; script `scripts/backfill-documento-revisao.ts`. |
| F2-PR2 — reconciliação de órfãos | Script presente; execução não comprovada | `scripts/reconciliar-uploads-orfaos.ts`, com modo relatório e `--aplicar`. |
| F2-PR3 — merge por nome-base | Código, migration e script presentes; execução não comprovada | `chaveDocumento()` agrupa sem extensão; migration `20260814150000_documento_substituido_por`; `scripts/merge-documentos-por-base.ts`. |
| F2-PR4 — resolver canônico e gravação de revisão no upload | Implementada no código | `resolverDocumentoCanonico()` em `src/modules/uploads/queries.ts`; persistência de `revisaoId` em `src/app/api/uploads/route.ts`. |
| F2-PR5 — metadados e status | Schema, migration e seed presentes; UI/action ainda ausentes | Migration `20260814160000_documento_metadados_status`; seed em `prisma/seed.ts`. Não há ação/UI para `editar_metadados` ou `alterar_status`. |
| F2-PR6a — agrupamento da tabela | Implementado no código; validação visual/manual pendente | A rota V2 usa `listarDocumentosAgrupados()`; `TabelaDocumentos` mostra uma linha por `DocumentoDisciplina`, badges da revisão ativa e seleção que expande para os seus `Upload`s. O caso de revisão integralmente na lixeira tem teste unitário. |
| F2-PR6c, F2-PR6b do plano, F2-PR7 e F2-PR9 | Não implementados | Não existem `exigirFase`, modelos de listas, painel de metadados, painel de listas nem fluxo explícito de upload de revisão agrupada. |
| F2-PR8 — histórico de revisões | Implementada | Drawer em `historico-revisoes-dialog.tsx`, query e action com escopo de projeto/disciplina. |
| F2-PR10 — colunas configuráveis | Implementada | `src/modules/uploads/colunas-documento.ts`, `seletor-colunas.tsx` e testes associados. |
| F4-PR4 — comparador avançado | Implementada | Percentual de opacidade e zoom/scroll sincronizados em `comparador-revisoes.tsx`. |
| Restante das Fases 3 e 4 | Não implementado | Não há workspace de três painéis, relações `revisaoOrigemId`/`revisaoResolucaoId` nem UI de resolução entre revisões. |

## Integração da branch de refatoração

O contexto do Claude descreve trabalho posterior na branch local `refactor/documentos-cde`. Em 2026-08-23, os cinco commits abaixo foram integrados em `dev` pelo merge `e56c293`, sem conflitos. A validação após o merge passou: `npm run lint` e `npm test` (223 arquivos, 2.441 testes).

| Commit de origem | Conteúdo verificado | Situação para `dev` |
| --- | --- | --- |
| `c7813de` | F4-PR4: valor percentual da opacidade e sincronização de scroll/zoom no comparador | Integrado. |
| `84bbd4b` + `91a2c5c` | F2-PR6a, parte 1: query agrupada por `DocumentoDisciplina` em `documentos-agrupados.ts` | Integrada; a continuação deste trabalho passou a consumi-la na tela V2. |
| `85d9f0e` + `4ff6505` | F2-PR8: drawer de histórico de revisões, action com escopo por projeto/disciplina e correção para data/hora | Integrado. |

O relato da sessão informa que build, lint e testes passaram na branch de origem. Esta auditoria repetiu lint e testes depois do merge em `dev`; o build continua não executado porque há processos Node ativos no workspace.

### Referências locais duplicadas de agentes

Em verificação posterior, as branches locais `worktree-agent-aca730b53cb77bd3d` e `worktree-agent-a04b6fd11d28e4454` apontavam, respectivamente, para `3dedaa7` e `95cb25f`. Não há worktree ativo para elas (`git worktree list` contém somente `dev`) e elas não representam trabalho adicional:

| Referência encontrada | Patch já presente em `dev` | Evidência |
| --- | --- | --- |
| `3dedaa7` — comparador avançado | `c7813de` | Os dois commits têm o mesmo `patch-id` estável `7029b82b…`; `c7813de` está no histórico de `dev`. |
| `95cb25f` — drawer de histórico | `85d9f0e` | Os dois commits têm o mesmo `patch-id` estável `cb6d56b8…`; `4ff6505` acrescenta a correção posterior de hora e também está em `dev`. |

Portanto, essas referências **não devem ser mescladas novamente**. Elas podem ser removidas somente em uma limpeza de branches locais deliberada, sem impacto no conteúdo já integrado.

## Continuação — F2-PR6a (tabela agrupada)

Após o merge `e56c293`, a continuação em `dev` concluiu a parte de interface da F2-PR6a:

- [`page.tsx`](../../src/app/(dashboard)/projetos/[id]/arquivos/page.tsx) passou a usar `listarDocumentosAgrupados()` e a whitelist `CAMPOS_ORDENACAO_DOC`; filtros, paginação, ordenação e muralha de disciplinas continuam resolvidos no servidor.
- [`tabela-documentos.tsx`](../../src/components/projetos/arquivos/tabela-documentos.tsx) recebe `LinhaDoc`, apresenta os badges de todos os arquivos da revisão vigente e mantém a barra de ações em lote. Selecionar um documento envia apenas os IDs dos arquivos da revisão vigente para zip, validação ou lixeira; revisões históricas não são afetadas.
- Os totais do cabeçalho e do painel de disciplinas passaram a contar documentos lógicos. Um upload legado sem `documentoId` ainda conta como uma unidade no painel, para expor a inconsistência em vez de ocultar o dado.
- [`documentos-agrupados.ts`](../../src/modules/uploads/documentos-agrupados.ts) calcula a revisão atual pelos uploads ativos, não pelo histórico completo de revisões. A regra foi isolada e coberta por [`documentos-agrupados-utils.test.ts`](../../src/modules/uploads/documentos-agrupados-utils.test.ts).
- O renomear de um documento com múltiplas extensões agora preserva a extensão de cada `Upload` (PDF permanece PDF e DWG permanece DWG). A regra está coberta em [`documento.test.ts`](../../src/modules/uploads/documento.test.ts).

Esta entrega não inclui F2-PR6c (metadados/status/fases), F2-PR6b do plano (exigir fases), F2-PR7, F2-PR9 nem o uploader da superfície V2.

## Achados que exigem decisão antes de executar o merge de dados

### A-01 — crítico — o script de merge descarta registros, contrariando o plano

O plano estabelece que nenhum registro é descartado no merge de documentos. Entretanto, `scripts/merge-documentos-por-base.ts` faz `delete` de:

- revisões duplicadas após repontar seus uploads (linha 125);
- calibrações em colisões de `(documentoId, pagina)` (linhas 150 e 154);
- leituras em colisões de `(documentoId, userId)` (linhas 171 e 175).

Além da divergência funcional, o JSON de execução gravado no fim do script registra apenas o mapa canônico → absorvidos. Os ids e a quantidade de calibrações/leituras descartadas não entram nesse arquivo, embora o contador `descartadas` exista no código.

**Risco:** perda irreversível de histórico operacional ao rodar `--aplicar`, sem trilha suficiente para restaurar seletivamente.

**Decisão necessária:** definir se as relações colidentes devem ser preservadas em histórico/alias, se o plano deve ser revisado para autorizar descarte explícito, ou se o script deve ser corrigido antes de qualquer execução em dados relevantes.

### A-02 — resolvido no código — escrita de arquivos agora respeita o escopo de dados

Na versão inicialmente auditada, as ações de renomear e gerir a lixeira usavam `recurso: "projetos"` e `permissao: "ver"` em `defineAction`. A capacidade nova `arquivos:renomear`/`arquivos:excluir` era verificada dentro do handler, mas as ações de lixeira não verificavam se o usuário podia acessar o projeto/disciplina do `Upload` recebido.

`defineAction` verifica a permissão fina, mas não aplica escopo de projeto automaticamente (`src/lib/with-action.ts`). Naquele estado, uma pessoa que possuísse as duas capabilities globais poderia atuar sobre um `uploadId` fora de sua carteira, caso conseguisse informar o identificador.

**Correção aplicada:** `renomearUpload`, `excluirUpload`, `excluirUploadsLote`, `restaurarUpload` e `excluirUploadDefinitivo` agora declaram o recurso `arquivos` e exigem, no servidor, `projetos:ver`, `projetoVisivel()` e a muralha `responsável ou ver_todas_disciplinas`. A exclusão em lote reproduz a muralha no `where` Prisma, portanto IDs de disciplinas alheias são ignorados. As capabilities `arquivos:renomear` e `arquivos:excluir` continuam complementares aos gates históricos; não ampliam escopo de dados.

`responsavelOuVeTodas()` em `src/modules/arquivos/acesso.ts` tem cobertura unitária para os três ramos da decisão.

### A-03 — resolvido para envio — a nova tela agora reutiliza o fluxo de upload

Na versão inicialmente auditada, quando a flag da nova tela estava ligada a rota retornava apenas `DocumentosShell`; o `ArquivosExplorer` legado, que contém o uploader, deixava de ser renderizado. O CTA “Enviar documentos” não possuía ação.

**Correção aplicada:** o CTA abre `enviar-documentos-dialog.tsx`, que usa a mesma rota `POST /api/uploads` e o motor compartilhado `enviarArquivoComProgresso()`. A pessoa escolhe disciplina e pacote/pasta, pode arrastar arquivos ou uma pasta inteira, acompanha o progresso individual e recebe o aviso de nova revisão já existente no fluxo legado.

O fluxo explícito de múltiplas extensões sob uma revisão escolhida pela pessoa continua pendente em F2-PR9; a correção aqui não cria uma rota ou regra de versionamento paralela.

O bloqueio funcional de ativação da flag foi removido, sujeito à validação manual do envio e à comprovação de A-05.

### A-04 — resolvido no código — query agrupada podia deixar a linha sem arquivos

Este achado vale para `refactor/documentos-cde`, antes de integrar F2-PR6a parte 1. Em `src/modules/uploads/documentos-agrupados.ts`, a query base exclui uploads na lixeira, mas a hidratação calcula a revisão atual usando **todas** as revisões do documento. Se a R02 inteira estiver na lixeira e a R01 continuar ativa, a linha escolhe R02 como atual e filtra os uploads ativos por R02; o resultado é uma linha sem badges de arquivo, embora R01 ainda exista e possa ser baixada.

**Correção aplicada:** a revisão atual agora é calculada exclusivamente pelos uploads ativos hidratados pela query. Portanto, se R02 estiver inteiramente na lixeira e R01 continuar ativa, a linha mostra R01 e seus badges. O teste `documentos-agrupados-utils.test.ts` fixa esse comportamento.

### A-05 — alto — a ativação da V2 ainda depende de confirmar os uploads sem documento lógico

`listarDocumentosAgrupados()` usa `join upload u on u."documentoId" = d.id`; por definição, uploads ativos sem `documentoId` não aparecem na tabela agrupada. A F2-PR2 possui script para reconciliá-los, porém sua execução não foi comprovada nesta auditoria porque o diagnóstico de dados falhou com `ENOMEM`.

**Risco:** em um ambiente que ainda tenha órfãos, a tela V2 pode omitir arquivos enquanto o explorer legado continua a exibi-los.

**Decisão/validação necessária antes de ativar a flag:** executar e arquivar o resultado de `scripts/verificar-fase2-documentos.ts` no ambiente alvo, com contagem de uploads ativos sem `documentoId` igual a zero; ou alterar a consulta para representar explicitamente os órfãos.

## Verificações executadas

| Verificação | Resultado |
| --- | --- |
| `npm run lint` | Passou após A-03. |
| `npm test` | Passou após A-03: 225 arquivos, 2.449 testes. |
| Testes focados da continuação | Passaram: 9 testes em `acesso` e `lixeira`; a regra nova de acesso tem três cenários unitários. |
| Validação manual do envio V2 | Pendente: requer operar o diálogo com uma disciplina de teste e confirmar envio, aviso de revisão e atualização da tabela. |
| `npx prisma migrate status` | Passou: 190 migrations encontradas; schema do banco de desenvolvimento atualizado. |
| `npx tsc --noEmit` | Não concluído: esgotou o heap padrão do Node após 85,4 s. Não é evidência de erro de tipos. |
| `npm run build` | Não executado: havia processos Node ativos; o repositório proíbe build concorrente com `next dev` no mesmo `.next`. |

## Próximo passo seguro

Não executar `--aplicar` nos scripts da Fase 2 até haver decisão registrada para A-01. Antes de ativar `NEXT_PUBLIC_DOCUMENTOS_V2`, comprovar A-05 e validar manualmente o envio V2. Depois da correção/decisão, executar `scripts/verificar-fase2-documentos.ts` em cada ambiente relevante e anexar a saída datada a esta pasta, para transformar a execução de scripts manuais em evidência auditável.
