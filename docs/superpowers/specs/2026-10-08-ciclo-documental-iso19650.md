# Ciclo documental ISO 19650 — estado por revisão, versões, controles e eventos

Pedido do dono em 2026-10-08. Auditoria (Etapa 1) e decisões D1–D10, N1–N4 e V1–V3 tomadas na mesma
conversa. Este arquivo é o contrato: o código segue o que está aqui.

## Modelo

Três camadas independentes:

1. **Estado** — `DocumentoRevisao.estado`, um por revisão, sempre presente:
   `em_andamento` → `compartilhado` → `publicado` → `arquivado`. Na tela, `compartilhado` aparece como
   **"Em análise"**: no SenaHub "Compartilhado" sempre quis dizer "mandado ao cliente", e isso virou
   o controle *Enviado ao cliente* (D1-c).
2. **Controles** — `ControleRevisao` (nunca apagado; remover = `removidoEm`): `liberado_obra`,
   `enviado_cliente`, `bloqueio` (escopos `download | atualizacao | exclusao`), `restricao`.
   `aplicadoPorId` nulo = SISTEMA.
3. **Eventos** — `DocumentoEvento` com `revisaoId`. Tipos novos: `estado`, `controle_aplicado`,
   `controle_removido`, `arquivo_substituido`, `envio_sem_carimbo`. Os do ciclo são gravados DENTRO da
   transação (`gravarEventoNoTx`): sem evento, a transição desfaz.

**Versão × revisão (N2, V1–V3).** Versão = ajuste interno enquanto a revisão está em andamento
(`R01 · v3`, contador `DocumentoRevisao.ultimaVersao`, arquivo marca `Upload.versaoNaRevisao`). Revisão
= a etapa que vai ao cliente. O que vale numa revisão é o arquivo mais recente de cada extensão; o
anterior fica com `substituidoPorId/substituidoEm` (no disco e no histórico, fora de lista, link, .zip e
contagens). Revisões que já existiam ficam com uma versão só (V3).

## Escopo (N3)

Só documentos do **pacote A**, sem `.ifc` (`ciclo/escopo.ts`). Pacote B, OUTROS e pastas ficam fora:
sem selo, sem ações, serviço recusa.

## Transições

| De | Para | Quem | Condições |
|---|---|---|---|
| em andamento | em análise | quem envia na disciplina (`arquivos:enviar` + muralha) | verificações do envio (A4); sem bloqueio |
| em análise | em andamento (devolver) | `arquivos:publicar` | motivo obrigatório; notifica o autor (A8) |
| em análise | publicado | `arquivos:publicar` | todos os arquivos validados (D2-a); apontamentos (D3-c); sem bloqueio |
| publicado | arquivado | sistema (A1) ou `arquivos:publicar` com motivo | sem bloqueio |
| em andamento / em análise | arquivado | só sistema (A1, "Substituída pela revisão N") | — |

Publicado nunca volta (I2). Arquivado é terminal (I3). Uma publicada por documento (I4, também índice
parcial no banco). Uma revisão aberta (em andamento ou em análise) por documento: envio durante a
análise é recusado (V2-a). Bloqueio ativo impede transição (I7) — inclusive o arquivamento automático
da publicada anterior, que então recusa a publicação nova.

## Controles

- `liberado_obra` e `enviado_cliente`: só em revisão publicada (I5), um ativo de cada por revisão
  (índice parcial). Manual com `arquivos:alterar_status`. Na publicação: a anterior perde os dois (A1);
  `enviado_cliente` passa sozinho para a nova (N4-a); `liberado_obra` só volta pela A2 (config ligada e
  sem restrição) ou à mão.
- `bloqueio` e `restricao` manuais: `arquivos:bloquear`, com motivo; não em arquivada.
- Restrição automática da A3 (origem `pendencias`) sai sozinha quando os apontamentos são resolvidos.

## Regras do envio para análise (D9)

Lista fixa. Metadados vêm do nome (motor `uploads/nomenclatura/interpretar.ts`), do carimbo e da
detecção; o único campo digitado é a **descrição da revisão**, obrigatória da R01 (`numero >= 2`).
Bloqueiam: nome fora do padrão da versão de nomenclatura do projeto (N1-a: v1 tem `-Rnn` no nome,
retirado do código e conferido com a revisão esperada); disciplina/sub, etapa ou tipo fora do catálogo;
código do projeto ≠ projeto; revisão sem PDF; arquivo com hash igual ao do mesmo formato na revisão
anterior; descrição vazia; carimbo divergente (código ou revisão). Carimbo ilegível não bloqueia: pede
confirmação e grava `envio_sem_carimbo`. **A leitura de código/revisão do carimbo só é implementada
depois de mostrar exemplos reais ao dono.**

## Configuração por projeto (D8)

`ConfigDocumentosProjeto` (sem linha = padrões): `liberarObraAutomaticamente` (false),
`permitirPublicarComPendencias` (false), `diasAlertaCompartilhado` (7). Só admin.

## Permissões (D6, D7)

`arquivos:publicar`, `arquivos:bloquear` (nascem nos perfis que têm `alterar_status`) e
`arquivos:somente_liberado_obra` (restrição; admin nunca é restringido; sem `leitura`/`dados`). Sem
login, o link público já se limita à pasta Liberado para obra.

## Decisões de 2026-10-09

- **Validação de arquivo** passa a ser barrada só por apontamento **impeditivo** publicado (mesma regra da
  publicação, D3-c). Antes, qualquer apontamento em aberto travava a validação e anulava a opção de
  publicar com pendências.
- **IFC** entra no ciclo: é um documento próprio (código próprio, mesma nomenclatura), vai ao cliente e
  segue as mesmas revisões. Revisão de modelo (com `.ifc`) dispensa o PDF e o DWG.
- **DWG obrigatório para publicar**: `ConfigDocumentosProjeto.exigirDwgParaPublicar`, **padrão ligado**.
- **Pagamento do projetista** sai na **publicação** (mecânica ainda a definir — ver abaixo).
- Permissões `arquivos:publicar`/`bloquear` são dadas à mão em produção (ninguém tinha `alterar_status`).

## Em aberto (não implementar sem o dono)

- Leitura de código/revisão no carimbo — mostrar exemplos reais antes.
- Pagamento na publicação: por documento ou quando a disciplina inteira estiver publicada; automático ou
  pela aprovação de disciplina que já existe.
- DWG obrigatório × memoriais (documentos sem desenho): isentar por tipo de documento?

## Estado (2026-10-09)

Etapas 1–6 implementadas em `feat/ciclo-documental` (sem commit). Verificado: `tsc` (app e servidor), `eslint`,
6280 testes do vitest, `smoke:ciclo-documental` (33 checagens), `smoke:pastas-cliente`, `smoke:status-documento`
(agora no pacote B) e `smoke:historico-documento`. NÃO verificado em navegador: o `next dev` do :3001 respondia
500 depois do `prisma generate` e não foi reiniciado (o pedido proíbe reiniciar serviço em execução).

Pendências conhecidas:
- filtro "Status" da barra de filtros ainda é do catálogo antigo (não filtra por estado da revisão);
- o Prisma 7 emite um aviso do `pg` ("client.query() when the client is already executing") ao carregar
  relações aninhadas DENTRO de uma transação — vem do interpretador do Prisma, não de `Promise.all` nosso;
- diretório geral (/arquivos) mostra o ciclo, mas não passa `podePublicar`/`podeBloquear` (sem essas ações lá).

## Deploy

1. `npx prisma migrate deploy` (migração `20261009100000_ciclo_documental`, só acrescenta).
2. `npm run db:seed` (catálogo de permissões).
3. `npx tsx --tsconfig tsconfig.server.json scripts/migrar-ciclo-documental.ts` — conferir o relatório
   ("Casos para conferir") — e depois o mesmo com `--gravar`. Idempotente.
4. Reiniciar o serviço (cliente Prisma novo; o job `ciclo-documental-integridade` entra no pg-boss).
5. Admin configura cada projeto em Arquivos → ⋯ → Ciclo dos documentos (padrão: tudo desligado, 7 dias).
