# Auditoria — Módulo de Licitações

> Data: 2026-06-18 · Objetivo: levantar o que o módulo faz, o que deveria fazer e o que faz mal, como base para um prompt de melhoria.

## 1. Mapa do módulo

| Camada | Arquivo |
|---|---|
| Página (server) | `src/app/(dashboard)/licitacoes/page.tsx` |
| UI (client) | `src/components/licitacoes/licitacoes-view.tsx` |
| Actions core | `src/modules/licitacoes/actions.ts` |
| Actions extras | `src/modules/licitacoes/extras/actions.ts` |
| Upload doc | `src/app/api/licitacoes/[id]/doc/route.ts` |
| Download doc | `src/app/api/licitacoes/versoes/[id]/download/route.ts` |
| Job de prazo | `src/lib/jobs-handlers.ts:99` (`alertaLicitacoes`) |
| Modelo de dados | `prisma/schema.prisma:1510` |

**Tabelas (6):** `Licitacao`, `DocumentoLicitacao` + `DocLicitacaoVersao`, `MedicaoLicitacao`, `LicitacaoHistorico`, `DisciplinaValorLicitacao`.

## 2. O que o módulo FAZ hoje

- **CRUD de licitação**: título, órgão, modalidade, nº edital, prazo da proposta, valor estimado, observações.
- **Status (5)**: `em_andamento → ganha / perdida → em_execucao → concluida`. Troca livre via dropdown.
- **Documentos versionados**: upload por título (mesmo título = nova versão), download. Operação auditada (`logAudit`).
- **Importar ganha → projeto**: cria `Projeto` tipo licitação + canais de chat + copia documentos para o Jurídico. Status passa a `em_execucao`.
- **Medições**: registra valor/data → cria `Lançamento` de **receita PREVISTA** na categoria financeira **1.02**. Numeração sequencial automática.
- **Extras**: timeline de eventos (texto livre) + valores por disciplina.
- **Alerta de prazo**: job notifica gestores (admin/administrativo) 15/7/1 dias antes do prazo — apenas status `em_andamento`.
- **Permissões**: `licitacoes:ver` / `licitacoes:gerir`.

## 3. O que faz MAL — bugs e fragilidades

### Bugs reais
- **Medição com projeto nulo.** `registrarMedicao` usa `lic.projetoId` direto (`actions.ts:100`). A UI mostra o botão "Medir" para qualquer status `em_execucao` (`view:374`). Como o status é editável à mão sem passar por importar, é possível ter `em_execucao` SEM projeto → lançamento financeiro órfão (`projetoId` nulo).
- **Transição de status sem guarda.** O dropdown permite qualquer→qualquer. Dá para pular `ganha`, voltar de `concluida` para `em_andamento`, ou marcar `em_execucao` sem importar. Só `importarLicitacao` valida (`status == ganha`). A máquina de estados existe no enum mas não é imposta.
- **Excluir não limpa arquivos.** `excluirLicitacao` faz cascade nas versões (no banco) mas deixa os arquivos físicos órfãos no storage. Não existe remover documento/versão individual.
- **Medição não tem cancelar/editar.** Valor errado fica gravado. Não há `excluirMedicao`; o lançamento criado no financeiro não é revertível pela UI; e a licitação importada não pode ser excluída.
- **Import duplica documento por path, não por cópia.** O doc enviado ao Jurídico reaproveita `arquivoPath` (`actions.ts:160`). Se um lado apagar o arquivo, o outro quebra (acoplamento silencioso).

### Gaps de UX / dados
- **Form de criação pobre.** Coleta só título/órgão/prazo. Modalidade, nº edital e valor estimado existem no schema e na action, mas a UI nunca os coleta na criação e não há dialog de edição (só troca de status).
- **`valorEstimado` × disciplinas × medições não conversam.** Soma de disciplinas e total medido não se comparam ao estimado. Sem % de avanço, sem saldo a medir.
- **Alerta só para `em_andamento`.** Prazos de execução / entrega de medição não geram alerta.
- **Histórico manual.** Mudança de status, upload, medição e import NÃO geram evento automático na timeline — só texto digitado à mão. Na prática a timeline fica vazia.
- **Sem busca / filtro / paginação.** `findMany` sem `take`, sem filtro por status/órgão. A lista cresce sem limite e tudo é renderizado client-side.
- **Download com `application/octet-stream` fixo.** Força o download; sem preview e sem content-type real.

## 4. O que DEVERIA fazer (domínio licitação pública BR)

Hoje o módulo é essencialmente "pasta de oportunidades + medição". Uma gestão de licitação pública (Lei 14.133/2021) pede:

- **Modalidade como enum** (pregão, concorrência, dispensa, inexigibilidade, tomada de preço…), não string livre.
- **Máquina de estados real**: planejada → proposta enviada → habilitação → julgamento → ganha/perdida → contrato/empenho → execução → concluída, com datas de cada fase.
- **Datas-chave** além do prazo da proposta: abertura, sessão, resultado, assinatura, vigência do contrato — cada uma alertável.
- **Proposta estruturada** = composição de preço. Já existe `ProjetoComposicaoPreco` no remake (item B3 do paridade) — reutilizar, em vez de "valor por disciplina" solto.
- **Contrato / empenho pós-ganha**: nº contrato, vigência, valor homologado (≠ estimado), reajuste, garantia.
- **Medição vinculada a cronograma físico-financeiro**: % de avanço, retenção/glosa, saldo contratual, ISS/retenções (o módulo financeiro já tem retenções — integrar).
- **Documentação por exigência do edital**: checklist de habilitação. As certidões já existem no Jurídico (`Certidao`) — conectar vencimento × edital.
- **Concorrentes / resultado**: quem ganhou, valor, classificação — inteligência comercial.
- **Dashboard / funil**: taxa de vitória, valor em disputa, ganho/perdido por período, próximos prazos. Hoje não há nenhum indicador.

## 5. Prioridades para o prompt de melhoria

### Quick wins (baixo risco)
1. Guardar transição de status (validar fluxo permitido) + bloquear medição sem projeto.
2. Dialog de edição completo (modalidade como enum, nº edital, valor estimado).
3. Eventos automáticos na timeline (status, upload, medição, import).
4. `excluirMedicao` + reversão do lançamento; remover documento/versão + limpar storage.
5. Filtro por status/órgão + paginação.

### Estrutural (alto valor)
6. Datas-chave + alertas por fase.
7. Ligar proposta à composição de preço (B3) e a medição ao saldo contratual + retenções.
8. Modelo de contrato/empenho pós-ganha (valor homologado ≠ estimado).
9. Checklist de habilitação ligado a `Certidao` / vencimentos.
10. Dashboard / funil (taxa de vitória, valor em disputa).
