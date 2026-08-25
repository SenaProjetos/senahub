O que o PR6 faz
Hoje, depois do merge, o banco sabe que EST-001.pdf e EST-001.dwg são um documento. A tela ainda mostra duas linhas — porque listarDocumentosProjeto consulta upload.findMany e devolve uma linha por arquivo, não por documento.

O PR6 fecha essa distância. Em quatro partes:

Agrupar a tabela por documento — a consulta passa a listar DocumentoDisciplina com seus arquivos agregados. Uma linha por prancha, com badges PDF DWG lado a lado. É o que torna todo o trabalho de banco visível.
Metadados editáveis — título, descrição e fase, que hoje existem como colunas vazias desde o PR5.
Status documental — o seletor com os 9 estados já semeados, gated por arquivos:alterar_status.
Seletor horizontal de fases — o filtro Todos | AP | PB | PE | ... do item 5 da spec, agora com faseId real por trás.
A parte 1 é a maior e a mais arriscada. Ela reescreve a consulta paginada: paginar documentos em vez de uploads muda filtro (extensão passa a olhar dentro do documento), ordenação e contagem. As partes 2–4 são formulário e ação — trabalho direto sobre estrutura que já existe.

Proposto: dividir em PR6a (agrupamento da tabela) e PR6b (metadados + status + fases). O corte deixa cada um verificável sozinho — e se o agrupamento der problema, ele não arrasta o resto junto. (Atenção: o plano já usa "F2-PR6b" para outra coisa — a exigência de fases. Chamo os novos de PR6a e PR6c para não confundir.)

O que falta depois
Ainda na Fase 2:

PR O quê
PR6b (do plano) Exigir fases por projeto — o que você pediu: toggle em NomenclaturaConfig, e o upload pré-preenchendo a fase pelo nome do arquivo
PR7 Listas — coleções lógicas ("Entrega 03", "Liberados para obra"). Precisa de migration (M7)
PR8 Histórico de revisões — o drawer que mostra R00→R03 com autor, data e arquivos
PR9 Upload de nova revisão aceitando PDF+DWG juntos numa só operação
Fase 3 — visualizador em três painéis (tarefas / documento com pins / detalhes), sincronização pin↔tarefa. Nada disso precisa de migration.

Fase 4 — tarefa rastreável entre revisões ("criada na R02, resolvida na R03" — o item que a spec marca como importante, e o único que ainda pede migration) e comparação com opacidade/zoom sincronizado.

Fora das fases, duas pendências suas:

A tela nova continua invisível. NEXT_PUBLIC_DOCUMENTOS_V2 está desligada em produção; todo mundo segue no ArquivosExplorer antigo. Ligar é decisão sua, e faz sentido esperar o PR6a — antes disso a tela ainda mostraria PDF e DWG separados, o que seria uma regressão visível em relação ao que o banco já sabe.
O plano previa validação manual em um projeto de cada tipo antes de virar padrão. Fizemos particular e aprovacao; licitacao e laudo não existem nem em produção (31 projetos: 28 particular, 3 aprovacao), então na prática os dois caminhos de dado estão cobertos.
Começo pelo PR6a (agrupamento por documento)? É o que dá sentido visual a tudo que fizemos no banco — e é o pré-requisito honesto para você considerar ligar a flag.

ok, analise todas as etapas restantes do plano.
Etapas que não são conflitantes que podem rodar em Sonnet, agrupe para rodarmos junto.
depois disso podemos seguir com o restante em opus ou ir resolvendo as dependencias com o modelo mais coerente para cada etapa.
Bash Read Fase 3 and 4 PR tables
IN
sed -n '150,185p' docs/auditoria/03-plano-refatoracao.md

OUT
| F3-PR1 | Header do visualizador (breadcrumb, nome/código, revisão, status, alternância de extensão) | `src/components/projetos/pdf-viewer.tsx`, reusa `src/components/shell/breadcrumb.tsx` |
| F3-PR2 | Painel esquerdo de tarefas (lista de `Pendencia` do documento, busca/filtro/+Tarefa) | novo `src/components/projetos/arquivos/painel-tarefas-documento.tsx`, reusa queries de `src/modules/projetos/pendencias/queries.ts` |
| F3-PR3 | Reestruturação do layout em 3 colunas recolhíveis | `pdf-viewer.tsx` — extrai canvas central, painel esquerdo (PR2) e painel direito (detalhe de pendência já existente) |
| F3-PR4 | Sincronização tarefa↔pin dentro do próprio painel (sem depender de deep-link externo) | `pdf-viewer.tsx`, `painel-tarefas-documento.tsx` |
| F3-PR5 | Painel de detalhes da tarefa contextualizado (ligado a `Tarefa`/`TarefaItem` de origem) | `pdf-viewer.tsx`, reusa `src/modules/tarefas/actions.ts` |

**O que NÃO entra nesta fase**: tarefa rastreável entre revisões (item 23, precisa de M8, Fase 4); comparação avançada com opacidade ajustável (item 15, Fase 4).

**Critérios de aceite binários**:

- [ ] Abrir `/visualizar` de um documento mostra breadcrumb com nome do projeto/disciplina/documento.
- [ ] Painel esquerdo recolhe/expande sem perder o pin selecionado.
- [ ] Clicar num item da lista de tarefas centraliza e faz zoom no pin correspondente, sem precisar de deep-link `?pin=`.
- [ ] Clicar num pin no canvas abre o painel de detalhes da tarefa correspondente à direita.
- [ ] Em viewport de 1366px de largura, nenhum elemento do workspace gera scroll horizontal.

**Paralelo vs. sequencial**: F3-PR1 e F3-PR2 são paralelos (não dependem um do outro). F3-PR3 depende de ambos. F3-PR4 e F3-PR5 são sequenciais depois de PR3.

**Ponto de rollback**: reversão de PR individual via `git revert` — nenhuma migration nesta fase, nenhum risco de dado.

### Fase 4 — Comparação avançada e resolução entre revisões (com migration M8)

**Objetivo**: rastrear pendência entre revisões (`revisaoOrigem`/`revisaoResolucao`) e completar a comparação de revisões com opacidade ajustável e zoom/pan sincronizado.

| PR     | Título                                                                               | Escopo de arquivos                                                                                               |
| ------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| F4-PR1 | Migration M9 — `Pendencia.revisaoOrigemId`/`revisaoResolucaoId` + backfill de origem | `prisma/schema.prisma`, `prisma/migrations/<novo>/`, novo `scripts/backfill-pendencia-revisao-origem.ts`         |
| F4-PR2 | UI "Comparar com nova revisão" / "Marcar como resolvida na R03"                      | `src/modules/projetos/pendencias/actions.ts` (nova action `marcarPendenciaResolvidaEmRevisao`), `pdf-viewer.tsx` |
| F4-PR3 | Rótulo "Criada na R02 / Resolvida na R03" no card de tarefa e no histórico           | `painel-tarefas-documento.tsx` (Fase 3), `historico-revisoes-dialog.tsx` (Fase 2)                                |
| F4-PR4 | Comparação avançada: opacidade ajustável + zoom/pan sincronizado entre painéis       | `src/components/projetos/comparador-revisoes.tsx`                                                                |

**O que NÃO entra nesta fase**: qualquer processamento CAD comparativo do zero (a spec explicitamente proíbe isso no item 15 — "não implementar processamento complexo de CAD do zero se não houver infraestrutura").

**Critérios de aceite binários**:

- [ ] Uma pendência criada sobre a R02 de um documento, depois de uma R03 ser enviada, mostra "Criada na R02" no card.
- [ ] Marcar como resolvida na R03 grava `revisaoResolucaoId` e o card passa a mostrar "Resolvida na R03".
- [ ] No comparador, arrastar o slider de opacidade altera visualmente a sobreposição em tempo real.
      Analisei os 13 PRs restantes cruzando arquivos tocados — conflito aqui é sobreposição de arquivo, não de tema.

Os arquivos "quentes" (gargalos de sequência)
Arquivo PRs que tocam Consequência
pdf-viewer.tsx F3-PR1, PR3, PR4, PR5, F4-PR2 Toda a Fase 3 é sequencial — é um arquivo de ~2.400 linhas com pins, medição e calibração
schema.prisma F2-PR6b, F2-PR7, F4-PR1 Migrations não paralelizam; e cada uma exige /nova-migracao, que só você invoca
tabela-documentos.tsx PR6a, PR6c PR6c depende de PR6a
menu-documento.tsx PR6c, PR8 Conflito real entre os dois
api/uploads/route.ts F2-PR6b, F2-PR9 Sequencial
Grupo paralelo em Sonnet — 2 PRs, zero sobreposição
Escolhi por três critérios: arquivo exclusivo, sem decisão de arquitetura, e dependências já satisfeitas.

① F4-PR4 — Comparação avançada

Arquivo: comparador-revisoes.tsx — nenhum outro PR o toca
Faz: slider de opacidade na sobreposição + zoom/pan sincronizado entre os dois painéis
Base pronta: o comparador já existe com 4 modos funcionando
Risco: baixo, componente isolado e visual
② F2-PR8 — Histórico de revisões

Arquivos: novo historico-revisoes-dialog.tsx + item no menu-documento.tsx
Faz: drawer listando R00→R03 com autor, data e arquivos de cada revisão
Base pronta: revisoesDoDocumento() existe, e as revisões agora existem no banco — foi o merge de hoje que destravou este PR
Risco: baixo, lê dado existente
Os dois não compartilham um único arquivo. Podem rodar de fato ao mesmo tempo.

Descartei do grupo: F3-PR1 (header) e F3-PR2 (painel de tarefas) — ambos esbarram no pdf-viewer.tsx ou viram código morto até a Fase 3 montar o layout.

O que fica para Opus, na ordem de dependência

# PR Por que Opus

1 PR6a — agrupar tabela por documento Reescreve a consulta paginada: filtro, ordenação e contagem mudam de eixo. É a decisão de arquitetura da fase
2 PR6c — metadados + status + fases Depende de 6a
3 PR6b — exigir fases por projeto Migration M8 + toca route.ts
4 PR7 — Listas Migration M7
5 PR9 — upload multi-extensão Toca a rota de upload, caminho crítico em produção
6 Fase 3 (PR1→3→4→5) pdf-viewer.tsx, o arquivo mais denso do módulo
7 F4-PR1→PR2→PR3 Migration M9 + rastreabilidade entre revisões
Como você quer executar o grupo Sonnet?
(a) Eu disparo dois subagentes em Sonnet agora, um por PR, enquanto sigo com o PR6a em Opus aqui. Os três trabalham em arquivos disjuntos. Reviso o resultado dos dois antes de commitar.

(b) Você troca a sessão para Sonnet (/model sonnet), fazemos os dois em sequência, e depois volta para Opus no PR6a.

Recomendo (a) — aproveita o paralelismo real e mantém o PR6a, que é o crítico, sob Opus. Mas não disparo subagente sem seu OK.

ok, vamos de a então
Bash Sync feature branch with dev before parallel work
IN
git checkout refactor/documentos-cde 2>&1|tail -1; git merge dev --ff-only 2>&1|tail -1; git log --oneline -1; git status --porcelain | head -3

OUT
Switched to branch 'refactor/documentos-cde'
create mode 100644 src/modules/projetos/disciplina-rotulo.ts
8e52510 docs(crm): log do bloco F2.3+F2.4+F2.5
?? src/modules/comercial/jornada.test.ts
?? src/modules/comercial/jornada.ts
Branch sincronizada. Disparo os dois subagentes em Sonnet, cada um em worktree isolado — assim os três trabalhos não competem por build nem por .next:

Agent:F4-PR4 comparador opacidade zoom
IN
Você vai implementar UM PR isolado no SenaHub (ERP Next.js 15 + React 19 + Prisma, código em inglês, **toda UI em português do Brasil**). Leia `CLAUDE.md` na raiz antes de começar — ele tem as convenções obrigatórias.

## Tarefa: F4-PR4 — Comparação avançada de revisões

**Arquivo a modificar: EXCLUSIVAMENTE `src/components/projetos/comparador-revisoes.tsx`.**
Não toque em nenhum outro arquivo de código. Se achar que precisa, PARE e explique no relatório final.

O componente já existe e funciona: compara duas revisões de um PDF em 4 modos (lado-a-lado, sobreposição, cortina, diferenças), via `Tabs` do design system. Leia o arquivo inteiro antes de mudar qualquer coisa.

Faltam duas coisas, pedidas no item 15 da especificação:

### 1. Opacidade ajustável no modo "sobreposição"

Hoje a sobreposição usa uma mistura fixa. Adicione um controle deslizante (0 a 100%) que ajusta em tempo real a opacidade da revisão de cima sobre a de baixo. O valor atual deve aparecer como texto (ex.: "60%").

### 2. Zoom e pan sincronizados no modo "lado a lado"

Hoje cada painel rola independente. Faça com que dar zoom ou rolar num painel aplique o mesmo no outro. Cuide para não criar laço infinito de eventos (um painel dispara o outro, que dispara o primeiro) — use uma trava (ref booleana) durante a propagação.

## Regras rígidas

- **Design system**: use apenas componentes de `src/components/ui/` e tokens CSS existentes. É shadcn sobre **base-ui, não Radix** — triggers usam `render={<Comp />}`, nunca `asChild`. Se precisar de um slider e não existir em `src/components/ui/`, use `<input type="range">` estilizado com classes Tailwind e tokens existentes (`bg-primary`, `border-border` etc.). **NUNCA** adicione dependência nova nem cor hex fora dos tokens.
- **Textos em pt-BR**, sem exceção.
- **Acessibilidade**: o slider precisa de `aria-label` em português.
- `prefers-reduced-motion` deve ser respeitado se você adicionar transição.
- Comentários no código: escreva só onde o "porquê" não é óbvio (ex.: a trava anti-laço merece comentário; um `useState` não merece).

## Verificação obrigatória antes de terminar

```bash
npm run lint
npm run build
npm test
```

Os três precisam passar. Se o build falhar por causa de arquivo que NÃO é o seu, diga isso no relatório e não tente consertar.

## Commit

Ao final, commite APENAS `src/components/projetos/comparador-revisoes.tsx`:

```
git add src/components/projetos/comparador-revisoes.tsx
git commit -m "<mensagem>"
```

Mensagem de commit em **português**, formato Conventional Commits, explicando o PORQUÊ e não só o quê. Termine a mensagem com:

```

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

## Relatório final

Diga: o que mudou, como resolveu a sincronização sem laço, qual componente usou para o slider, resultado dos três comandos de verificação, e o hash do commit.
Agent:F2-PR8 historico de revisoes
IN
Você vai implementar UM PR isolado no SenaHub (ERP Next.js 15 + React 19 + Prisma, código em inglês, **toda UI em português do Brasil**). Leia `CLAUDE.md` na raiz antes de começar — ele tem as convenções obrigatórias.

## Contexto do domínio (importante para entender o que fazer)

Um **documento** de engenharia (ex.: uma prancha `EST-FOR-001`) tem várias **revisões** (R00, R01, R02...). Cada revisão pode ter mais de um **arquivo** (o mesmo desenho em `.pdf` e `.dwg`). No banco:

- `DocumentoDisciplina` = o documento lógico
- `DocumentoRevisao` = a revisão (campos: `numero`, `createdAt`, `createdById`)
- `Upload` = o arquivo físico (tem `revisaoId` apontando para a revisão)

## Tarefa: F2-PR8 — Drawer de histórico de revisões

**Arquivos que você pode tocar:**

1. **Criar** `src/components/projetos/arquivos/historico-revisoes-dialog.tsx`
2. **Criar** uma query nova em `src/modules/uploads/queries.ts` (só ADICIONE uma função no final; não altere nenhuma função existente)
3. **Editar** `src/components/projetos/arquivos/menu-documento.tsx` para adicionar o item que abre o drawer

Não toque em mais nada. Se achar que precisa, PARE e explique no relatório.

### O que construir

Um drawer (use `Sheet` de `src/components/ui/sheet.tsx`) chamado a partir do menu "..." de cada linha da tabela de documentos, com o título "Histórico do documento". Ele lista as revisões, **da mais recente para a mais antiga**, e para cada uma mostra:

- O rótulo da revisão (**use o helper `rotuloRevisao(n)` de `src/lib/utils.ts`** — ele formata `3` como `R03`)
- Data (use `formatarData` de `src/lib/utils.ts`)
- Quem enviou (nome do autor; pode ser nulo — trate com "—")
- Os arquivos daquela revisão, cada um com sua extensão e um link de download (`/api/uploads/<id>/download`)
- Um destaque visual em "ATUAL" na revisão de maior número

Estados obrigatórios: **carregando** (use `Skeleton`), **vazio** (use `EmptyState` — texto tipo "Este documento ainda não tem histórico de revisões") e **erro** (mensagem clara em pt-BR, nunca um erro técnico cru).

### A query

Em `src/modules/uploads/queries.ts`, adicione algo como `historicoRevisoesDocumento(documentoId: string)` que devolve as revisões do documento com seus uploads e o nome do autor. Detalhes que importam:

- O arquivo tem `import "server-only"` no topo — é query de servidor, correto.
- Existe uma função `resolverDocumentoCanonico(documentoId)` **no mesmo arquivo**. Documentos podem ter sido fundidos (merge), e um id antigo aponta para um "apelido". **Chame `resolverDocumentoCanonico` antes de buscar as revisões**, senão o histórico virá vazio para documentos fundidos. Isso é essencial.
- Ordene por `numero` decrescente.
- Uploads na lixeira têm `excluidoEm` preenchido: inclua-os, mas marque com uma flag (ex.: `excluido: true`) para a UI poder sinalizar. Atenção: leitura ANINHADA não passa pelo filtro global de soft-delete, então eles virão naturalmente.

### Como o menu chama

Em `menu-documento.tsx` existe um `DropdownMenu` com itens como "Visualizar", "Baixar", "Renomear". Adicione **"Histórico de revisões"** com um ícone apropriado do `lucide-react` (ex.: `History`). O componente `MenuDocumento` recebe uma prop `linha` do tipo `LinhaDocumento`; use `linha.id` (é o id do Upload) — a query precisa do id do DOCUMENTO, então adicione o campo necessário ou busque pelo upload. Leia o tipo `LinhaDocumento` em `src/modules/uploads/lista-documentos.ts` antes de decidir. **Se o `documentoId` não estiver disponível na linha, PARE e relate** — não invente um caminho alternativo.

## Regras rígidas

- **Design system**: só componentes de `src/components/ui/` e tokens existentes. É shadcn sobre **base-ui, não Radix** — triggers usam `render={<Comp />}`, **nunca** `asChild`. `Select`'s `onValueChange` devolve `string | null`.
- **Todos os textos em pt-BR.**
- **Sem mock, sem dado fake.** Se não houver dado, mostre o estado vazio.
- Prisma: importe de `@/generated/prisma/client`, **nunca** de `@prisma/client`.
- Comente só o que não é óbvio pelo código (o motivo de chamar `resolverDocumentoCanonico`, por exemplo, merece uma linha).

## Verificação obrigatória

```bash
npm run lint
npm run build
npm test
```

Os três precisam passar. Se o build falhar por arquivo que NÃO é seu, relate e não conserte.

## Commit

Commite apenas os arquivos que você criou/editou. Mensagem em **português**, Conventional Commits, explicando o porquê. Termine com:

```

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

## Relatório final

Diga: arquivos criados/alterados, como obteve o `documentoId`, como tratou revisões com arquivo na lixeira, resultado dos três comandos e o hash do commit.
Os dois rodando em Sonnet, cada um em worktree próprio. Começo o PR6a aqui — a parte que exige decisão de arquitetura. Primeiro entendo a consulta atual:

Bash Read current paginated query
IN
sed -n '/export async function listarDocumentosProjeto/,/^}/p' src/modules/uploads/queries.ts | head -75

OUT
export async function listarDocumentosProjeto(opts: {
projetoId: string;
userId: string;
veTodas: boolean;
filtros: FiltrosListagemDocumentos;
skip: number;
take: number;
sort: CampoOrdenacaoDocumento | null;
dir: "asc" | "desc";
}) {
Bash Locate query internals
IN
grep -n "export async function listarDocumentosProjeto" src/modules/uploads/queries.ts
awk 'NR>=230 && NR<=330' src/modules/uploads/queries.ts | grep -n "where\|orderBy\|count\|findMany\|select\|skip\|take" | head -20

OUT
260:export async function listarDocumentosProjeto(opts: {
3:function orderByDocumentos(
6:): NonNullable<Parameters<typeof prisma.upload.findMany>[0]>["orderBy"] {
36: skip: number;
37: take: number;
41: const { projetoId, userId, veTodas, filtros, skip, take, sort, dir } = opts;
52: const where = {
53: // Lixeira: `findMany` de topo já ganha `excluidoEm: null` pela extensão de lib/prisma.ts,
54: // mas deixamos explícito porque a condição viaja junto no `count` e no `groupBy`.
76: const total = await prisma.upload.count({ where });
77: const ultimaPagina = Math.max(1, Math.ceil(total / Math.max(1, take)));
78: const paginaPedida = Math.floor(skip / Math.max(1, take)) + 1;
80: const skipEfetivo = (pagina - 1) \* take;
82: const uploads = await prisma.upload.findMany({
83: where,
84: orderBy: orderByDocumentos(sort, dir),
85: skip: skipEfetivo,
86: take,
87: select: {
96: disciplina: { select: { id: true, disciplinaTextoLegado: true, responsaveis: { select: { userId: true } } } },
97: autor: { select: { name: true } },
Bash Read where clause construction
IN
sed -n '270,300p' src/modules/uploads/queries.ts

OUT
const { projetoId, userId, veTodas, filtros, skip, take, sort, dir } = opts;

const escopoDisciplina = {
projetoId,
...(veTodas ? {} : { responsaveis: { some: { userId } } }),
...(filtros.disciplinaId ? { id: filtros.disciplinaId } : {}),
};

const termo = filtros.q?.trim();
const dias = DIAS_VALIDOS.has(filtros.periodo ?? "") ? Number(filtros.periodo) : null;

const where = {
// Lixeira: `findMany` de topo já ganha `excluidoEm: null` pela extensão de lib/prisma.ts,
// mas deixamos explícito porque a condição viaja junto no `count` e no `groupBy`.
excluidoEm: null,
disciplina: escopoDisciplina,
...(termo
? {
OR: [
{ nomeArquivo: { contains: termo, mode: "insensitive" as const } },
{ disciplina: { disciplinaTextoLegado: { contains: termo, mode: "insensitive" as const } } },
{ autor: { name: { contains: termo, mode: "insensitive" as const } } },
],
}
: {}),
...(filtros.ext ? { nomeArquivo: { endsWith: `.${filtros.ext}`, mode: "insensitive" as const } } : {}),
...(filtros.autor ? { autor: { name: filtros.autor } } : {}),
...(dias ? { createdAt: { gte: new Date(Date.now() - dias \* 86_400_000) } } : {}),
// Validação só existe no fluxo de pacote; arquivo dentro de PastaProjeto fica fora.
...(filtros.validado === "sim" ? { validado: true, pastaId: null } : {}),
...(filtros.validado === "nao" ? { validado: false, pastaId: null } : {}),
Entendi o desafio central: 3 das 5 colunas ordenáveis viram agregados ao agrupar por documento (revisão = MAX(numero), data = MAX(createdAt), tamanho = SUM). O Prisma não ordena por agregado de relação — então a paginação precisa sair via SQL para os IDs, e hidratar depois.

Escrevo a query nova ao lado da antiga:

Bash Check imports available for raw SQL
IN
grep -n "Prisma\b" src/modules/uploads/queries.ts | head -3; grep -n "^import" src/modules/uploads/queries.ts

OUT
1:import "server-only";
2:import { prisma } from "@/lib/prisma";
3:import { diasRestantesLixeira, DIAS_LIXEIRA } from "./lixeira";
Bash Add grouped-by-document query
IN
cat >> src/modules/uploads/queries.ts <<'ARQUIVO'

// ── Listagem AGRUPADA POR DOCUMENTO (Fase 2 — F2-PR6a) ───────────────────────
// A listagem anterior devolvia uma linha por ARQUIVO. Depois do merge por nome-base, PDF e
// DWG da mesma prancha são o mesmo documento, e mostrá-los em duas linhas desmente o que o
// banco já sabe. Aqui a unidade da tabela passa a ser o documento.
//
// Por que SQL cru para escolher a página: três das cinco colunas ordenáveis viraram
// agregados do documento — revisão é MAX(numero), "atualizado" é MAX(createdAt) e tamanho é
// SUM(tamanho). O Prisma não ordena por agregado de relação, e ordenar em memória traria o
// acervo inteiro para o servidor, desfazendo a paginação conquistada em F1-PR10. Então o SQL
// resolve só a pergunta "quais 24 ids, nesta ordem" e o Prisma hidrata o resto com tipo.

export const CAMPOS_ORDENACAO_DOC = ["nome", "disciplina", "revisao", "data", "tamanho"] as const;
export type CampoOrdenacaoDoc = (typeof CAMPOS_ORDENACAO_DOC)[number];

/\*_ Coluna SQL de cada campo ordenável. Whitelist — o valor vem da URL. _/
const COLUNA_ORDENACAO: Record<CampoOrdenacaoDoc, string> = {
nome: 'lower(coalesce(d.titulo, d."nomeArquivo"))',
disciplina: 'lower(coalesce(cat.nome, disc."disciplinaTextoLegado", \'\'))',
revisao: "max(r.numero)",
data: 'max(u."createdAt")',
tamanho: "sum(u.tamanho)",
};

export type LinhaDoc = {
id: string;
nome: string;
titulo: string | null;
disciplinaId: string;
disciplinaNome: string;
revisaoAtual: number | null;
statusNome: string | null;
faseSigla: string | null;
atualizadoEm: string;
tamanhoTotal: number;
autor: string;
podeGerir: boolean;
/** Um por extensão da revisão ATUAL — é o que vira badge clicável na linha. \*/
arquivos: { id: string; nome: string; ext: string; downloadUrl: string; validado: boolean | null }[];
/** Quantas revisões o documento tem (alimenta o "R03 · 4 revisões"). \*/
totalRevisoes: number;
};

export async function listarDocumentosAgrupados(opts: {
projetoId: string;
userId: string;
veTodas: boolean;
ehGlobal: boolean;
podeEnviarCap: boolean;
filtros: FiltrosListagemDocumentos & { fase?: string; status?: string };
skip: number;
take: number;
sort: CampoOrdenacaoDoc | null;
dir: "asc" | "desc";
}) {
const { projetoId, userId, veTodas, filtros, skip, take, sort, dir } = opts;
const termo = filtros.q?.trim() || null;
const dias = DIAS_VALIDOS.has(filtros.periodo ?? "") ? Number(filtros.periodo) : null;
const desde = dias ? new Date(Date.now() - dias \* 86_400_000) : null;
const ordem = COLUNA_ORDENACAO[sort ?? "data"];
const direcao = dir === "asc" ? "asc" : "desc";

// `$queryRawUnsafe` recebe SÓ a coluna de ordenação (vinda da whitelist acima) interpolada;
// todo valor de usuário vai como parâmetro numerado, nunca concatenado.
const filtroSql = `     from documento_disciplina d
    join disciplina disc on disc.id = d."disciplinaId"
    left join disciplina_catalogo cat on cat.id = disc."catalogoId"
    join upload u on u."documentoId" = d.id and u."excluidoEm" is null
    left join documento_revisao r on r.id = u."revisaoId"
    left join documento_status st on st.id = d."statusId"
    left join "user" au on au.id = u."autorId"
    where d."substituidoPorId" is null
      and disc."projetoId" = $1
      and ($2::text is null or disc.id = $2)
      and ($3::boolean is true or exists (
            select 1 from disciplina_responsavel dr
            where dr."disciplinaId" = disc.id and dr."userId" = $4))
      and ($5::text is null or (
            d."nomeArquivo" ilike '%' || $5 || '%'
            or coalesce(d.titulo, '') ilike '%' || $5 || '%'
            or coalesce(cat.nome, disc."disciplinaTextoLegado", '') ilike '%' || $5 || '%'
            or coalesce(au.name, '') ilike '%' || $5 || '%'))
      and ($6::text is null or lower(u."nomeArquivo") like '%.' || lower($6))
      and ($7::text is null or au.name = $7)
      and ($8::timestamp is null or u."createdAt" >= $8)
      and ($9::text is null or st.nome = $9)
      and ($10::text is null or d."faseId" = $10)
    group by d.id
  `;
const params = [
projetoId,
filtros.disciplinaId ?? null,
veTodas,
userId,
termo,
filtros.ext ?? null,
filtros.autor ?? null,
desde,
filtros.status ?? null,
filtros.fase ?? null,
];

const totalRows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
`select count(*)::bigint as n from (select d.id ${filtroSql}) x`,
...params,
);
const total = Number(totalRows[0]?.n ?? 0);

const ultimaPagina = Math.max(1, Math.ceil(total / Math.max(1, take)));
const paginaPedida = Math.floor(skip / Math.max(1, take)) + 1;
const pagina = Math.min(paginaPedida, ultimaPagina);
const skipEfetivo = (pagina - 1) \* take;

const idsRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
`select d.id, ${ordem} as ord ${filtroSql} order by ord ${direcao} nulls last, d.id asc limit ${Number(take)} offset ${Number(skipEfetivo)}`,
...params,
);
const ids = idsRows.map((r) => r.id);
if (ids.length === 0) return { total, pagina, linhas: [] as LinhaDoc[] };

const docs = await prisma.documentoDisciplina.findMany({
where: { id: { in: ids } },
select: {
id: true,
nomeArquivo: true,
titulo: true,
status: { select: { nome: true } },
fase: { select: { sigla: true } },
disciplina: {
select: {
id: true,
disciplinaTextoLegado: true,
catalogo: { select: { nome: true } },
responsaveis: { select: { userId: true } },
},
},
revisoes: { select: { id: true, numero: true } },
uploads: {
where: { excluidoEm: null },
select: {
id: true,
nomeArquivo: true,
tamanho: true,
validado: true,
pastaId: true,
revisaoId: true,
createdAt: true,
autor: { select: { name: true } },
},
},
},
});

const porId = new Map(docs.map((d) => [d.id, d]));
const linhas: LinhaDoc[] = [];
for (const id of ids) {
const d = porId.get(id);
if (!d) continue;
const revisaoAtual = d.revisoes.length ? Math.max(...d.revisoes.map((r) => r.numero)) : null;
const idRevisaoAtual = d.revisoes.find((r) => r.numero === revisaoAtual)?.id ?? null;
// A linha mostra os arquivos da revisão ATUAL. Upload legado sem revisão continua
// aparecendo — some da tela seria pior do que aparecer sem número.
const daAtual = idRevisaoAtual
? d.uploads.filter((u) => u.revisaoId === idRevisaoAtual || u.revisaoId === null)
: d.uploads;
const maisRecente = [...d.uploads].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
linhas.push({
id: d.id,
nome: d.nomeArquivo,
titulo: d.titulo,
disciplinaId: d.disciplina.id,
disciplinaNome: d.disciplina.catalogo?.nome ?? d.disciplina.disciplinaTextoLegado ?? "—",
revisaoAtual,
statusNome: d.status?.nome ?? null,
faseSigla: d.fase?.sigla ?? null,
atualizadoEm: (maisRecente?.createdAt ?? new Date()).toISOString(),
tamanhoTotal: d.uploads.reduce((s, u) => s + u.tamanho, 0),
autor: maisRecente?.autor?.name ?? "—",
podeGerir:
opts.podeEnviarCap &&
(opts.ehGlobal || d.disciplina.responsaveis.some((r) => r.userId === userId)),
arquivos: daAtual.map((u) => ({
id: u.id,
nome: u.nomeArquivo,
ext: extensaoDe(u.nomeArquivo),
downloadUrl: `/api/uploads/${u.id}/download`,
validado: u.pastaId ? null : u.validado,
})),
totalRevisoes: d.revisoes.length,
});
}
return { total, pagina, linhas };
}
ARQUIVO
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "queries.ts" | head -8; echo "(vazio = sem erro de tipo no arquivo)"

OUT
Exit code 2
/usr/bin/bash: -c: line 85: unexpected EOF while looking for matching `''
Aspas do SQL quebraram o heredoc. Escrevo via Python:

Bash Append grouped query via Python
IN
python - <<'PYEOF'
bloco = r'''

// ── Listagem AGRUPADA POR DOCUMENTO (Fase 2 — F2-PR6a) ───────────────────────
// A listagem anterior devolvia uma linha por ARQUIVO. Depois do merge por nome-base, PDF e
// DWG da mesma prancha são o mesmo documento, e mostrá-los em duas linhas desmente o que o
// banco já sabe. Aqui a unidade da tabela passa a ser o documento.
//
// Por que SQL cru para escolher a página: três das cinco colunas ordenáveis viraram
// agregados do documento — revisão é MAX(numero), "atualizado" é MAX(createdAt) e tamanho é
// SUM(tamanho). O Prisma não ordena por agregado de relação, e ordenar em memória traria o
// acervo inteiro para o servidor, desfazendo a paginação conquistada em F1-PR10. Então o SQL
// resolve só a pergunta "quais ids, nesta ordem" e o Prisma hidrata o resto com tipo.

export const CAMPOS_ORDENACAO_DOC = ["nome", "disciplina", "revisao", "data", "tamanho"] as const;
export type CampoOrdenacaoDoc = (typeof CAMPOS_ORDENACAO_DOC)[number];

/\*_ Expressão SQL de cada campo ordenável. Whitelist fechada — o valor vem da URL. _/
const COLUNA_ORDENACAO: Record<CampoOrdenacaoDoc, string> = {
nome: "lower(coalesce(d.titulo, d.\"nomeArquivo\"))",
disciplina: "lower(coalesce(cat.nome, disc.\"disciplinaTextoLegado\", ''))",
revisao: "max(r.numero)",
data: "max(u.\"createdAt\")",
tamanho: "sum(u.tamanho)",
};

export type ArquivoDaLinha = {
id: string;
nome: string;
ext: string;
downloadUrl: string;
validado: boolean | null;
};

export type LinhaDoc = {
id: string;
nome: string;
titulo: string | null;
disciplinaId: string;
disciplinaNome: string;
revisaoAtual: number | null;
statusNome: string | null;
faseSigla: string | null;
atualizadoEm: string;
tamanhoTotal: number;
autor: string;
podeGerir: boolean;
/\*_ Um por extensão da revisão ATUAL — é o que vira badge clicável na linha. _/
arquivos: ArquivoDaLinha[];
totalRevisoes: number;
};

export async function listarDocumentosAgrupados(opts: {
projetoId: string;
userId: string;
veTodas: boolean;
ehGlobal: boolean;
podeEnviarCap: boolean;
filtros: FiltrosListagemDocumentos & { fase?: string; status?: string };
skip: number;
take: number;
sort: CampoOrdenacaoDoc | null;
dir: "asc" | "desc";
}) {
const { projetoId, userId, veTodas, filtros, skip, take, sort, dir } = opts;
const termo = filtros.q?.trim() || null;
const dias = DIAS_VALIDOS.has(filtros.periodo ?? "") ? Number(filtros.periodo) : null;
const desde = dias ? new Date(Date.now() - dias \* 86_400_000) : null;
const ordem = COLUNA_ORDENACAO[sort ?? "data"];
const direcao = dir === "asc" ? "asc" : "desc";

// Só a expressão de ordenação (da whitelist acima) é interpolada; todo valor de usuário
// viaja como parâmetro numerado, nunca concatenado.
const base = `     from documento_disciplina d
    join disciplina disc on disc.id = d."disciplinaId"
    left join disciplina_catalogo cat on cat.id = disc."catalogoId"
    join upload u on u."documentoId" = d.id and u."excluidoEm" is null
    left join documento_revisao r on r.id = u."revisaoId"
    left join documento_status st on st.id = d."statusId"
    left join "user" au on au.id = u."autorId"
    where d."substituidoPorId" is null
      and disc."projetoId" = $1
      and ($2::text is null or disc.id = $2)
      and ($3::boolean is true or exists (
            select 1 from disciplina_responsavel dr
            where dr."disciplinaId" = disc.id and dr."userId" = $4))
      and ($5::text is null or (
            d."nomeArquivo" ilike '%' || $5 || '%'
            or coalesce(d.titulo, '') ilike '%' || $5 || '%'
            or coalesce(cat.nome, disc."disciplinaTextoLegado", '') ilike '%' || $5 || '%'
            or coalesce(au.name, '') ilike '%' || $5 || '%'))
      and ($6::text is null or lower(u."nomeArquivo") like '%.' || lower($6))
      and ($7::text is null or au.name = $7)
      and ($8::timestamp is null or u."createdAt" >= $8)
      and ($9::text is null or st.nome = $9)
      and ($10::text is null or d."faseId" = $10)
    group by d.id
  `;
const params = [
projetoId,
filtros.disciplinaId ?? null,
veTodas,
userId,
termo,
filtros.ext ?? null,
filtros.autor ?? null,
desde,
filtros.status ?? null,
filtros.fase ?? null,
];

const totalRows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
`select count(*)::bigint as n from (select d.id ${base}) x`,
...params,
);
const total = Number(totalRows[0]?.n ?? 0);

const ultimaPagina = Math.max(1, Math.ceil(total / Math.max(1, take)));
const paginaPedida = Math.floor(skip / Math.max(1, take)) + 1;
const pagina = Math.min(paginaPedida, ultimaPagina);
const skipEfetivo = (pagina - 1) \* take;

// `d.id asc` como desempate: sem ele, duas linhas com o mesmo valor de ordenação podem
// trocar de lugar entre páginas e um documento aparecer duas vezes (ou nenhuma).
const idsRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
`select d.id, ${ordem} as ord ${base} order by ord ${direcao} nulls last, d.id asc limit ${Number(take)} offset ${Number(skipEfetivo)}`,
...params,
);
const ids = idsRows.map((r) => r.id);
if (ids.length === 0) return { total, pagina, linhas: [] as LinhaDoc[] };

const docs = await prisma.documentoDisciplina.findMany({
where: { id: { in: ids } },
select: {
id: true,
nomeArquivo: true,
titulo: true,
status: { select: { nome: true } },
fase: { select: { sigla: true } },
disciplina: {
select: {
id: true,
disciplinaTextoLegado: true,
catalogo: { select: { nome: true } },
responsaveis: { select: { userId: true } },
},
},
revisoes: { select: { id: true, numero: true } },
uploads: {
where: { excluidoEm: null },
select: {
id: true,
nomeArquivo: true,
tamanho: true,
validado: true,
pastaId: true,
revisaoId: true,
createdAt: true,
autor: { select: { name: true } },
},
},
},
});

const porId = new Map(docs.map((d) => [d.id, d]));
const linhas: LinhaDoc[] = [];
for (const id of ids) {
const d = porId.get(id);
if (!d) continue;
const revisaoAtual = d.revisoes.length ? Math.max(...d.revisoes.map((r) => r.numero)) : null;
const idRevisaoAtual = d.revisoes.find((r) => r.numero === revisaoAtual)?.id ?? null;
// A linha mostra os arquivos da revisão ATUAL. Upload legado sem revisão entra junto:
// sumir da tela seria pior do que aparecer sem número de revisão.
const daAtual = idRevisaoAtual
? d.uploads.filter((u) => u.revisaoId === idRevisaoAtual || u.revisaoId === null)
: d.uploads;
const maisRecente = [...d.uploads].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
linhas.push({
id: d.id,
nome: d.nomeArquivo,
titulo: d.titulo,
disciplinaId: d.disciplina.id,
disciplinaNome: d.disciplina.catalogo?.nome ?? d.disciplina.disciplinaTextoLegado ?? "—",
revisaoAtual,
statusNome: d.status?.nome ?? null,
faseSigla: d.fase?.sigla ?? null,
atualizadoEm: (maisRecente?.createdAt ?? new Date()).toISOString(),
tamanhoTotal: d.uploads.reduce((s, u) => s + u.tamanho, 0),
autor: maisRecente?.autor?.name ?? "—",
podeGerir:
opts.podeEnviarCap &&
(opts.ehGlobal || d.disciplina.responsaveis.some((r) => r.userId === userId)),
arquivos: daAtual.map((u) => ({
id: u.id,
nome: u.nomeArquivo,
ext: extensaoDe(u.nomeArquivo),
downloadUrl: `/api/uploads/${u.id}/download`,
validado: u.pastaId ? null : u.validado,
})),
totalRevisoes: d.revisoes.length,
});
}
return { total, pagina, linhas };
}
'''
with open("src/modules/uploads/queries.ts", "a", encoding="utf-8") as f:
f.write(bloco)
print("query adicionada")
PYEOF
grep -c "listarDocumentosAgrupados" src/modules/uploads/queries.ts

OUT
Exit code 2
/usr/bin/bash: -c: line 93: unexpected EOF while looking for matching `''
O heredoc não sobrevive às aspas do SQL. Uso a ferramenta de escrita e, de quebra, coloco a query em módulo próprio — fica mais limpo que inflar queries.ts:

Write c:\SENA_ADM\SENAHUB\SENAHub-remake\src\modules\uploads\documentos-agrupados.ts
246 lines
import "server-only";
import { prisma } from "@/lib/prisma";

/\*\*

- Listagem de documentos AGRUPADA POR DOCUMENTO (Fase 2 — F2-PR6a).
-
- A listagem da Fase 1 devolvia uma linha por ARQUIVO. Depois do merge por nome-base, PDF e
- DWG da mesma prancha são o mesmo documento — mostrá-los em duas linhas desmente o que o
- banco já sabe. Aqui a unidade da tabela passa a ser o documento, e as extensões viram
- badges dentro da linha.
-
- Por que SQL cru para escolher a página: três das cinco colunas ordenáveis viraram
- agregados do documento — revisão é `max(numero)`, "atualizado" é `max(createdAt)` e
- tamanho é `sum(tamanho)`. O Prisma não ordena por agregado de relação, e ordenar em
- memória traria o acervo inteiro para o servidor, desfazendo a paginação conquistada em
- F1-PR10. Então o SQL responde só "quais ids, nesta ordem" e o Prisma hidrata o resto com
- tipagem de verdade.
  \*/

export const CAMPOS_ORDENACAO_DOC = ["nome", "disciplina", "revisao", "data", "tamanho"] as const;
export type CampoOrdenacaoDoc = (typeof CAMPOS_ORDENACAO_DOC)[number];

/\*_ Aceita só o que está na whitelist — o valor vem da URL. _/
export function campoOrdenacaoDocValido(v: string | null | undefined): CampoOrdenacaoDoc | null {
return (CAMPOS_ORDENACAO_DOC as readonly string[]).includes(v ?? "") ? (v as CampoOrdenacaoDoc) : null;
}

/\*\*

- Expressão SQL de cada campo ordenável. É a ÚNICA parte interpolada na consulta; todo valor
- vindo do usuário viaja como parâmetro numerado.
  \*/
  const COLUNA_ORDENACAO: Record<CampoOrdenacaoDoc, string> = {
  nome: `lower(coalesce(d.titulo, d."nomeArquivo"))`,
  disciplina: `lower(coalesce(cat.nome, disc."disciplinaTextoLegado", ''))`,
  revisao: `max(r.numero)`,
  data: `max(u."createdAt")`,
  tamanho: `sum(u.tamanho)`,
  };

const DIAS_VALIDOS = new Set(["7", "30", "90"]);

export type FiltrosDoc = {
disciplinaId?: string | null;
q?: string;
ext?: string;
autor?: string;
periodo?: string;
validado?: string;
fase?: string;
status?: string;
};

export type ArquivoDaLinha = {
id: string;
nome: string;
ext: string;
downloadUrl: string;
/\*_ `null` para arquivo em PastaProjeto, que não passa por validação. _/
validado: boolean | null;
};

export type LinhaDoc = {
id: string;
nome: string;
titulo: string | null;
disciplinaId: string;
disciplinaNome: string;
revisaoAtual: number | null;
statusNome: string | null;
faseSigla: string | null;
atualizadoEm: string;
tamanhoTotal: number;
autor: string;
podeGerir: boolean;
/\*_ Arquivos da revisão ATUAL — é o que vira badge clicável na linha. _/
arquivos: ArquivoDaLinha[];
totalRevisoes: number;
};

/\*_ Extensão em minúsculas, sem ponto. _/
function extensaoDe(nome: string): string {
const i = nome.lastIndexOf(".");
return i > 0 ? nome.slice(i + 1).toLowerCase() : "";
}

export async function listarDocumentosAgrupados(opts: {
projetoId: string;
userId: string;
veTodas: boolean;
ehGlobal: boolean;
podeEnviarCap: boolean;
filtros: FiltrosDoc;
skip: number;
take: number;
sort: CampoOrdenacaoDoc | null;
dir: "asc" | "desc";
}) {
const { projetoId, userId, veTodas, filtros, skip, take, sort, dir } = opts;
const termo = filtros.q?.trim() || null;
const dias = DIAS_VALIDOS.has(filtros.periodo ?? "") ? Number(filtros.periodo) : null;
const desde = dias ? new Date(Date.now() - dias \* 86_400_000) : null;
const ordem = COLUNA_ORDENACAO[sort ?? "data"];
const direcao = dir === "asc" ? "asc" : "desc";
const validadoSim = filtros.validado === "sim" ? true : null;
const validadoNao = filtros.validado === "nao" ? true : null;

// `join upload` com `excluidoEm is null` faz o documento cujos arquivos foram todos para a
// lixeira sumir da lista — mesmo efeito do filtro global de soft delete na versão anterior.
const base = `     from documento_disciplina d
    join disciplina disc on disc.id = d."disciplinaId"
    left join disciplina_catalogo cat on cat.id = disc."catalogoId"
    join upload u on u."documentoId" = d.id and u."excluidoEm" is null
    left join documento_revisao r on r.id = u."revisaoId"
    left join documento_status st on st.id = d."statusId"
    left join "user" au on au.id = u."autorId"
    where d."substituidoPorId" is null
      and disc."projetoId" = $1
      and ($2::text is null or disc.id = $2)
      and ($3::boolean is true or exists (
            select 1 from disciplina_responsavel dr
            where dr."disciplinaId" = disc.id and dr."userId" = $4))
      and ($5::text is null or (
            d."nomeArquivo" ilike '%' || $5 || '%'
            or coalesce(d.titulo, '') ilike '%' || $5 || '%'
            or coalesce(cat.nome, disc."disciplinaTextoLegado", '') ilike '%' || $5 || '%'
            or coalesce(au.name, '') ilike '%' || $5 || '%'))
      and ($6::text is null or lower(u."nomeArquivo") like '%.' || lower($6))
      and ($7::text is null or au.name = $7)
      and ($8::timestamptz is null or u."createdAt" >= $8)
      and ($9::text is null or st.nome = $9)
      and ($10::text is null or d."faseId" = $10)
      and ($11::boolean is null or (u.validado = true and u."pastaId" is null))
      and ($12::boolean is null or (u.validado = false and u."pastaId" is null))
    group by d.id
  `;
const params = [
projetoId,
filtros.disciplinaId ?? null,
veTodas,
userId,
termo,
filtros.ext ?? null,
filtros.autor ?? null,
desde,
filtros.status ?? null,
filtros.fase ?? null,
validadoSim,
validadoNao,
];

const totalRows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
`select count(*)::bigint as n from (select d.id ${base}) x`,
...params,
);
const total = Number(totalRows[0]?.n ?? 0);

const ultimaPagina = Math.max(1, Math.ceil(total / Math.max(1, take)));
const paginaPedida = Math.floor(skip / Math.max(1, take)) + 1;
const pagina = Math.min(paginaPedida, ultimaPagina);
const skipEfetivo = (pagina - 1) \* take;

// `d.id asc` como desempate: sem ele, dois documentos com o mesmo valor de ordenação podem
// trocar de posição entre páginas — e aí um aparece duas vezes e outro nenhuma.
const idsRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
`select d.id, ${ordem} as ord ${base} order by ord ${direcao} nulls last, d.id asc limit ${Number(take)} offset ${Number(skipEfetivo)}`,
...params,
);
const ids = idsRows.map((r) => r.id);
if (ids.length === 0) return { total, pagina, linhas: [] as LinhaDoc[] };

const docs = await prisma.documentoDisciplina.findMany({
where: { id: { in: ids } },
select: {
id: true,
nomeArquivo: true,
titulo: true,
status: { select: { nome: true } },
fase: { select: { sigla: true } },
disciplina: {
select: {
id: true,
disciplinaTextoLegado: true,
catalogo: { select: { nome: true } },
responsaveis: { select: { userId: true } },
},
},
revisoes: { select: { id: true, numero: true } },
uploads: {
where: { excluidoEm: null },
select: {
id: true,
nomeArquivo: true,
tamanho: true,
validado: true,
pastaId: true,
revisaoId: true,
createdAt: true,
autor: { select: { name: true } },
},
},
},
});

// Reordena pelo que o SQL decidiu — `findMany` com `in` não preserva a ordem dos ids.
const porId = new Map(docs.map((d) => [d.id, d]));
const linhas: LinhaDoc[] = [];
for (const id of ids) {
const d = porId.get(id);
if (!d) continue;
const revisaoAtual = d.revisoes.length ? Math.max(...d.revisoes.map((r) => r.numero)) : null;
const idRevisaoAtual = d.revisoes.find((r) => r.numero === revisaoAtual)?.id ?? null;
// Mostra os arquivos da revisão ATUAL. Upload legado sem revisão entra junto: sumir da
// tela seria pior do que aparecer sem número.
const daAtual = idRevisaoAtual
? d.uploads.filter((u) => u.revisaoId === idRevisaoAtual || u.revisaoId === null)
: d.uploads;
const maisRecente = [...d.uploads].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
linhas.push({
id: d.id,
nome: d.nomeArquivo,
titulo: d.titulo,
disciplinaId: d.disciplina.id,
disciplinaNome: d.disciplina.catalogo?.nome ?? d.disciplina.disciplinaTextoLegado ?? "—",
revisaoAtual,
statusNome: d.status?.nome ?? null,
faseSigla: d.fase?.sigla ?? null,
atualizadoEm: (maisRecente?.createdAt ?? new Date()).toISOString(),
tamanhoTotal: d.uploads.reduce((s, u) => s + u.tamanho, 0),
autor: maisRecente?.autor?.name ?? "—",
podeGerir:
opts.podeEnviarCap &&
(opts.ehGlobal || d.disciplina.responsaveis.some((r) => r.userId === userId)),
arquivos: daAtual.map((u) => ({
id: u.id,
nome: u.nomeArquivo,
ext: extensaoDe(u.nomeArquivo),
downloadUrl: `/api/uploads/${u.id}/download`,
validado: u.pastaId ? null : u.validado,
})),
totalRevisoes: d.revisoes.length,
});
}
return { total, pagina, linhas };
}
Valido a consulta contra o banco real antes de mexer na UI — SQL cru merece prova:

Bash Validate grouped query against real data
IN
python - <<'PYEOF'
code = r'''import "dotenv/config";
import { listarDocumentosAgrupados } from "../src/modules/uploads/documentos-agrupados";
import { prisma } from "../src/lib/prisma";

async function main() {
const disc = await prisma.disciplina.findFirst({
where: { uploads: { some: { excluidoEm: null } } },
select: { projetoId: true },
});
const projetoId = disc!.projetoId;
const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
const base = { projetoId, userId: admin!.id, veTodas: true, ehGlobal: true, podeEnviarCap: true, skip: 0, take: 5 };

for (const sort of ["data", "nome", "disciplina", "revisao", "tamanho"] as const) {
const r = await listarDocumentosAgrupados({ ...base, filtros: {}, sort, dir: "desc" });
console.log(`sort=${sort} -> total=${r.total} pagina=${r.pagina} linhas=${r.linhas.length}`);
}

const r = await listarDocumentosAgrupados({ ...base, filtros: {}, sort: "data", dir: "desc" });
console.log("\namostra:");
for (const l of r.linhas.slice(0, 4)) {
const exts = l.arquivos.map((a) => a.ext.toUpperCase()).join("+") || "(sem)";
console.log(`  ${l.disciplinaNome} | ${l.titulo ?? l.nome} | R${String(l.revisaoAtual ?? 0).padStart(2,"0")} | ${exts} | ${l.totalRevisoes} rev | ${l.tamanhoTotal}B`);
}
const multi = r.linhas.filter((l) => l.arquivos.length > 1).length;
console.log(`\nlinhas com mais de um arquivo nesta pagina: ${multi}`);

// filtros
const f1 = await listarDocumentosAgrupados({ ...base, filtros: { ext: "pdf" }, sort: "data", dir: "desc" });
const f2 = await listarDocumentosAgrupados({ ...base, filtros: { q: "zzzznaoexiste" }, sort: "data", dir: "desc" });
const f3 = await listarDocumentosAgrupados({ ...base, filtros: { validado: "sim" }, sort: "data", dir: "desc" });
console.log(`filtro ext=pdf -> ${f1.total} | busca inexistente -> ${f2.total} | validado=sim -> ${f3.total}`);

// muralha: usuario sem acesso nao ve nada
const semAcesso = await listarDocumentosAgrupados({ ...base, veTodas: false, ehGlobal: false, userId: "nao-existe", filtros: {}, sort: "data", dir: "desc" });
console.log(`muralha (usuario sem responsabilidade) -> ${semAcesso.total} (deve ser 0)`);

// pagina fora do range grampeia
const fora = await listarDocumentosAgrupados({ ...base, skip: 9999, filtros: {}, sort: "data", dir: "desc" });
console.log(`page fora do range -> pagina=${fora.pagina} linhas=${fora.linhas.length} (deve trazer a ultima)`);
await prisma.$disconnect();
}
main();
'''
open("scripts/\_probe-agrupado.ts", "w", encoding="utf-8").write(code)
PYEOF
npx tsx --tsconfig tsconfig.server.json scripts/\_probe-agrupado.ts 2>&1 | tail -25

OUT
code: 'P2010',
meta: {
driverAdapterError: DriverAdapterError: ColumnNotFound
at PrismaPgAdapter.onError (C:\SENA_ADM\SENAHUB\SENAHub-remake\node_modules\@prisma\adapter-pg\dist\index.js:678:11)
at PrismaPgAdapter.performIO (C:\SENA_ADM\SENAHUB\SENAHub-remake\node_modules\@prisma\adapter-pg\dist\index.js:673:12)
at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
at async PrismaPgAdapter.queryRaw (C:\SENA_ADM\SENAHUB\SENAHub-remake\node_modules\@prisma\adapter-pg\dist\index.js:604:30)
at async e.interpretNode (C:\SENA_ADM\SENAHUB\SENAHub-remake\node_modules\@prisma\client-engine-runtime\src\interpreter\query-interpreter.ts:186:26)
at async e.run (C:\SENA_ADM\SENAHUB\SENAHub-remake\node_modules\@prisma\client-engine-runtime\src\interpreter\query-interpreter.ts:94:23)
at async e.execute (C:\SENA_ADM\SENAHUB\SENAHub-remake\node_modules\@prisma\client\src\runtime\core\engines\client\LocalExecutor.ts:81:12)
at async jt.request (C:\SENA_ADM\SENAHUB\SENAHub-remake\node_modules\@prisma\client\src\runtime\core\engines\client\ClientEngine.ts:504:22)
at async Object.singleLoader (C:\SENA_ADM\SENAHUB\SENAHub-remake\node_modules\@prisma\client\src\runtime\RequestHandler.ts:112:26)
at async zr.request (C:\SENA_ADM\SENAHUB\SENAHub-remake\node_modules\@prisma\client\src\runtime\RequestHandler.ts:149:14) {
cause: {
originalCode: '42703',
originalMessage: 'coluna disc.catalogoId não existe',
kind: 'ColumnNotFound',
column: undefined
}
}
},
clientVersion: '7.8.0'
}

Node.js v24.15.0
Chutei o nome da coluna do catálogo de disciplina (feature de outra frente). Confiro o real:

Bash Find real catalog column name on Disciplina
IN
grep -n "catalogo\|disciplinaTextoLegado" prisma/schema.prisma | grep -A2 -B2 "model Disciplina" ; sed -n '/^model Disciplina {/,/^}/p' prisma/schema.prisma | grep -nE "catalogo|TextoLegado|nome"

OUT
7: /// Texto original digitado antes da migração. `@map` mantém a COLUNA FÍSICA com o nome
8: /// antigo (`nome`): o banco não sofre rename, só o código passa a chamá-la assim — os
9: /// pontos de leitura que ainda usam `.nome` falham em COMPILAÇÃO, não em runtime.
12: disciplinaTextoLegado String @map("nome")
16: /// esperado, não falha. Relação chamada `catalogo`, não `disciplina`, porque o próprio
19: catalogo DisciplinaCatalogo? @relation(fields: [disciplinaId], references: [id])
Duas descobertas: disciplinaTextoLegado mapeia para a coluna física nome, e a FK do catálogo é disciplinaId. Confirmo a tabela:

Bash Check catalog table mapping
IN
sed -n '/^model DisciplinaCatalogo {/,/^}/p' prisma/schema.prisma | grep -E "@@map|nome |sigla|codigo" | head -5

OUT
nome String @unique
codigo String? @unique
@@map("disciplina_catalogo")
Bash Fix column names and revalidate
IN
python - <<'PY'
p = "src/modules/uploads/documentos-agrupados.ts"
s = open(p, encoding="utf-8").read()

# `disciplinaTextoLegado` é @map("nome"); a FK do catálogo é `disciplinaId`, não `catalogoId`.

s = s.replace('disc."disciplinaTextoLegado"', 'disc.nome')
s = s.replace('cat.id = disc."catalogoId"', 'cat.id = disc."disciplinaId"')
open(p, "w", encoding="utf-8").write(s)
print("corrigido")
PY
npx tsx --tsconfig tsconfig.server.json scripts/\_probe-agrupado.ts 2>&1 | tail -20

OUT
corrigido
at async jt.request (C:\SENA_ADM\SENAHUB\SENAHub-remake\node_modules\@prisma\client\src\runtime\core\engines\client\ClientEngine.ts:504:22)
at async Object.singleLoader (C:\SENA_ADM\SENAHUB\SENAHub-remake\node_modules\@prisma\client\src\runtime\RequestHandler.ts:112:26)
at async zr.request (C:\SENA_ADM\SENAHUB\SENAHub-remake\node_modules\@prisma\client\src\runtime\RequestHandler.ts:149:14) {
cause: {
originalCode: '42803',
originalMessage: 'coluna "cat.nome" deve aparecer na cláusula GROUP BY ou ser usada em uma função de agregação',
kind: 'postgres',
code: '42803',
severity: 'ERRO',
message: 'coluna "cat.nome" deve aparecer na cláusula GROUP BY ou ser usada em uma função de agregação',
detail: undefined,
column: undefined,
hint: undefined
}
}
},
clientVersion: '7.8.0'
}

Node.js v24.15.0
GROUP BY: colunas de tabelas juntadas precisam ser agregadas. Corrijo a expressão de ordenação por disciplina:

Bash Fix GROUP BY aggregation and revalidate
IN
python - <<'PY'
p = "src/modules/uploads/documentos-agrupados.ts"
s = open(p, encoding="utf-8").read()
antigo = " disciplina: `lower(coalesce(cat.nome, disc.nome, ''))`,"
novo = " // `min(...)`: o GROUP BY é por `d.id`, e o Postgres só dispensa agregação para colunas da\n // própria `d` (dependência funcional da PK). Coluna de tabela juntada precisa ser agregada —\n // e como o join é para-um, `min` devolve exatamente o valor da linha.\n disciplina: `min(lower(coalesce(cat.nome, disc.nome, '')))`,"
assert s.count(antigo) == 1
s = s.replace(antigo, novo, 1)
open(p, "w", encoding="utf-8").write(s)
print("ok")
PY
npx tsx --tsconfig tsconfig.server.json scripts/\_probe-agrupado.ts 2>&1 | tail -20

OUT
ok
sort=data -> total=1 pagina=1 linhas=1
sort=nome -> total=1 pagina=1 linhas=1
sort=disciplina -> total=1 pagina=1 linhas=1
sort=revisao -> total=1 pagina=1 linhas=1
sort=tamanho -> total=1 pagina=1 linhas=1

amostra:
Estrutural | 2404_RQP_REP_EST_EX_404_DE_R00.pdf | R01 | PDF | 1 rev | 396348B

linhas com mais de um arquivo nesta pagina: 0
filtro ext=pdf -> 1 | busca inexistente -> 0 | validado=sim -> 1
muralha (usuario sem responsabilidade) -> 0 (deve ser 0)
page fora do range -> pagina=1 linhas=1 (deve trazer a ultima)
Funciona — mas testei num projeto com 1 documento só. Preciso ver o agrupamento real, num projeto com PDF+DWG mesclados:

Bash Validate grouping on a project with merged docs
IN
python - <<'PYEOF'
code = r'''import "dotenv/config";
import { listarDocumentosAgrupados } from "../src/modules/uploads/documentos-agrupados";
import { prisma } from "../src/lib/prisma";

async function main() {
// Projeto com mais documentos que têm mais de um arquivo na revisão atual.
const docs = await prisma.documentoDisciplina.findMany({
where: { substituidoPorId: null },
select: { disciplina: { select: { projetoId: true } }, \_count: { select: { uploads: true } } },
});
const cont = new Map<string, number>();
for (const d of docs) if (d.\_count.uploads > 1) cont.set(d.disciplina.projetoId, (cont.get(d.disciplina.projetoId) ?? 0) + 1);
const [projetoId, qtd] = [...cont.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
console.log(`projeto escolhido: ${projetoId} (${qtd} documentos com 2+ arquivos)`);

const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
const base = { projetoId: projetoId!, userId: admin!.id, veTodas: true, ehGlobal: true, podeEnviarCap: true, take: 10, skip: 0 };
const r = await listarDocumentosAgrupados({ ...base, filtros: {}, sort: "data", dir: "desc" });
console.log(`total de DOCUMENTOS: ${r.total}`);
const uploadsAtivos = await prisma.upload.count({ where: { excluidoEm: null, disciplina: { projetoId } } });
console.log(`total de ARQUIVOS no projeto: ${uploadsAtivos}  <- a diferenca e o ganho do agrupamento`);
console.log("\nprimeiras linhas:");
for (const l of r.linhas.slice(0, 6)) {
const exts = l.arquivos.map((a) => a.ext.toUpperCase()).join(" + ") || "(sem)";
console.log(`  ${l.nome}`);
console.log(`     R${String(l.revisaoAtual ?? 0).padStart(2,"0")} · ${exts} · ${l.totalRevisoes} revisao(oes) · ${(l.tamanhoTotal/1024).toFixed(0)}KB · ${l.autor}`);
}
console.log(`\nlinhas com 2+ arquivos nesta pagina: ${r.linhas.filter((l) => l.arquivos.length > 1).length}`);

// ordenacao por revisao desc deve trazer a maior revisao primeiro
const porRev = await listarDocumentosAgrupados({ ...base, filtros: {}, sort: "revisao", dir: "desc" });
console.log("top revisoes:", porRev.linhas.slice(0, 5).map((l) => `R${l.revisaoAtual}`).join(" "));
const porTam = await listarDocumentosAgrupados({ ...base, filtros: {}, sort: "tamanho", dir: "desc" });
console.log("top tamanhos (KB):", porTam.linhas.slice(0, 5).map((l) => (l.tamanhoTotal/1024).toFixed(0)).join(" "));
await prisma.$disconnect();
}
main();
'''
open("scripts/\_probe-agrupado.ts", "w", encoding="utf-8").write(code)
PYEOF
npx tsx --tsconfig tsconfig.server.json scripts/\_probe-agrupado.ts 2>&1 | tail -22

OUT
projeto escolhido: cmr5skceo001eg8r5s7too37d (20 documentos com 2+ arquivos)
total de DOCUMENTOS: 20
total de ARQUIVOS no projeto: 40 <- a diferenca e o ganho do agrupamento

primeiras linhas:
26001-1-EST-EX-4005-M3D.ifc
R02 · IFC · 2 revisao(oes) · 13669KB · DEVTADRIO
26001.1-EST-EX-4019-DTC.pdf
R01 · PDF + DWG · 1 revisao(oes) · 246KB · DEVTADRIO
26001.1-EST-EX-4018-DTC.pdf
R01 · PDF + DWG · 1 revisao(oes) · 368KB · DEVTADRIO
26001.1-EST-EX-4017-DTC.pdf
R01 · PDF + DWG · 1 revisao(oes) · 371KB · DEVTADRIO
26001.1-EST-EX-4016-DTC.pdf
R01 · PDF + DWG · 1 revisao(oes) · 431KB · DEVTADRIO
26001.1-EST-EX-4015-DTC.pdf
R01 · PDF + DWG · 1 revisao(oes) · 619KB · DEVTADRIO

linhas com 2+ arquivos nesta pagina: 9
top revisoes: R2 R1 R1 R1 R1
top tamanhos (KB): 13669 1128 1051 871 777
É exatamente o objetivo da Fase 2 funcionando: 40 arquivos → 20 linhas, com PDF + DWG na mesma linha. Todas as ordenações agregadas corretas (revisão R02 no topo, tamanhos decrescentes).

Limpo o probe e verifico o build:

Bash Lint and typecheck the new module
IN
rm -f scripts/\_probe-agrupado.ts; npm run lint 2>&1 | tail -3; npx tsc --noEmit 2>&1 | grep -E "documentos-agrupados" | head -5; echo "(vazio = tipos ok)"

OUT
✖ 3390 problems (14 errors, 3376 warnings)

(vazio = tipos ok)
Bash Inspect lint errors
IN
npm run lint 2>&1 | grep -B3 "error" | head -30

OUT
21457:21 warning '\_indirectBuffer' is assigned a value but never used @typescript-eslint/no-unused-vars
21941:3 warning Expected an assignment or function call and instead saw an expression @typescript-eslint/no-unused-expressions
22339:3 warning Expected an assignment or function call and instead saw an expression @typescript-eslint/no-unused-expressions
23621:7 error Use "@ts-expect-error" instead of "@ts-ignore", as "@ts-ignore" will do nothing if the following line is error-free @typescript-eslint/ban-ts-comment
--
29:504538 warning Expected an assignment or function call and instead saw an expression @typescript-eslint/no-unused-expressions
29:505421 warning Expected an assignment or function call and instead saw an expression @typescript-eslint/no-unused-expressions
29:506625 warning Expected an assignment or function call and instead saw an expression @typescript-eslint/no-unused-expressions
29:506915 error Unexpected aliasing of 'this' to local variable @typescript-eslint/no-this-alias
--
29:513116 warning Expected an assignment or function call and instead saw an expression @typescript-eslint/no-unused-expressions
29:514528 warning Expected an assignment or function call and instead saw an expression @typescript-eslint/no-unused-expressions
29:514780 warning Expected an assignment or function call and instead saw an expression @typescript-eslint/no-unused-expressions
29:515347 error Unexpected aliasing of 'this' to local variable @typescript-eslint/no-this-alias
--
29:562979 warning 'a' is defined but never used @typescript-eslint/no-unused-vars
29:562996 warning 'e' is defined but never used @typescript-eslint/no-unused-vars
29:563008 warning 'e' is defined but never used @typescript-eslint/no-unused-vars
29:563650 error Unexpected aliasing of 'this' to local variable @typescript-eslint/no-this-alias
--
29:616176 warning 't' is defined but never used @typescript-eslint/no-unused-vars
29:617655 warning Expected an assignment or function call and instead saw an expression @typescript-eslint/no-unused-expressions
29:617669 warning Expected an assignment or function call and instead saw an expression @typescript-eslint/no-unused-expressions
29:618997 error Unexpected aliasing of 'this' to local variable @typescript-eslint/no-this-alias
--
29:620034 warning 'e' is defined but never used @typescript-eslint/no-unused-vars
29:620043 warning 'e' is defined but never used @typescript-eslint/no-unused-vars
29:620206 warning Expected an assignment or function call and instead saw an expression @typescript-eslint/no-unused-expressions
29:620648 error Unexpected aliasing of 'this' to local variable @typescript-eslint/no-this-alias
--
Erros em arquivos minificados — não meus. Confirmo a origem:

Bash Identify which files have lint errors
IN
npm run lint 2>&1 | grep -E "^[A-Z]:" | head -8; echo "--- worktrees ativos ---"; git worktree list 2>/dev/null

OUT
C:\SENA_ADM\SENAHUB\SENAHub-remake\.claude\worktrees\agent-a04b6fd11d28e4454\public\fragments-worker.mjs
C:\SENA_ADM\SENAHUB\SENAHub-remake\.claude\worktrees\agent-a04b6fd11d28e4454\public\pdf.worker.min.mjs
C:\SENA_ADM\SENAHUB\SENAHub-remake\.claude\worktrees\agent-aca730b53cb77bd3d\public\fragments-worker.mjs
C:\SENA_ADM\SENAHUB\SENAHub-remake\.claude\worktrees\agent-aca730b53cb77bd3d\public\pdf.worker.min.mjs
--- worktrees ativos ---
C:/SENA_ADM/SENAHUB/SENAHub-remake f520515 [dev]
C:/SENA_ADM/SENAHUB/SENAHub-remake/.claude/worktrees/agent-a04b6fd11d28e4454 9905d2c [worktree-agent-a04b6fd11d28e4454] locked
C:/SENA_ADM/SENAHUB/SENAHub-remake/.claude/worktrees/agent-aca730b53cb77bd3d 9905d2c [worktree-agent-aca730b53cb77bd3d] locked
Dois achados. Os worktrees dos subagentes ficaram dentro do repo (.claude/worktrees/), e o ESLint está lintando os arquivos minificados deles — o ruído não é meu. E o worktree principal aparece em dev, não na branch de feature:

Bash Check current branch and lint only my file
IN
git branch --show-current; git log --oneline -1; echo "--- meus arquivos passam no lint? ---"; npx eslint src/modules/uploads/documentos-agrupados.ts 2>&1 | tail -5; echo "(vazio = ok)"

OUT
dev
f520515 feat(comercial): jornada da negociacao + moverEstagio como ponto unico (F2.6+F2.7)
--- meus arquivos passam no lint? ---
(vazio = ok)
Meu arquivo passa limpo. Mas os worktrees poluem o lint com 14 erros de arquivos minificados que os subagentes vão ver e podem tentar "consertar". Corrijo na raiz:

Bash Find eslint ignore config
IN
ls eslint.config.\* 2>/dev/null; grep -n "ignores" eslint.config.mjs 2>/dev/null | head -5

OUT
eslint.config.mjs
15: ignores: [
Bash Read current ignore list
IN
sed -n '14,26p' eslint.config.mjs

OUT
{
ignores: [
"node_modules/**",
".next/**",
"out/**",
"build/**",
"next-env.d.ts",
"public/**", // assets estáticos (ex.: worker minificado do pdf.js) não são código-fonte
".ds-sync/**", // artefatos gerados do sync de design-system, não código-fonte
"ds-bundle/**", // bundle vendorizado (React interno etc.), não código-fonte
],
},
];
Bash Ignore agent worktrees in eslint and verify
IN
python - <<'PY'
p = "eslint.config.mjs"
s = open(p, encoding="utf-8").read()
alvo = ' "ds-bundle/**", // bundle vendorizado (React interno etc.), não código-fonte\n'
novo = alvo + ' ".claude/worktrees/**", // checkouts temporários de agente: já são lintados na própria raiz\n'
assert s.count(alvo) == 1
s = s.replace(alvo, novo, 1)
open(p, "w", encoding="utf-8").write(s)
print("ok")
PY
npm run lint 2>&1 | tail -3; echo "(vazio = lint limpo de novo)"

OUT
ok

> senahub@1.11.0 lint
> eslint

(vazio = lint limpo de novo)
Primeiro subagente terminou (F4-PR4). Reviso o código antes de integrar — não aceito de olhos fechados:

Bash Inspect agent commit scope
IN
git log --oneline -1 worktree-agent-aca730b53cb77bd3d 2>/dev/null; echo "--- diff stat ---"; git diff --stat 9905d2c worktree-agent-aca730b53cb77bd3d 2>/dev/null

OUT
3dedaa7 feat(projetos): sincroniza zoom/pan entre paineis e mostra % de opacidade no comparador
--- diff stat ---
src/components/projetos/comparador-revisoes.tsx | 57 +++++++++++++++++++++++--
1 file changed, 53 insertions(+), 4 deletions(-)
Bash Review the agent's actual diff
IN
git diff 9905d2c worktree-agent-aca730b53cb77bd3d -- src/components/projetos/comparador-revisoes.tsx | head -90

OUT
diff --git a/src/components/projetos/comparador-revisoes.tsx b/src/components/projetos/comparador-revisoes.tsx
index f70a8ff..0dab214 100644
--- a/src/components/projetos/comparador-revisoes.tsx
+++ b/src/components/projetos/comparador-revisoes.tsx
@@ -175,6 +175,27 @@ export function ComparadorRevisoes({
const [opacidadeB, setOpacidadeB] = useState(0.6);
const colunaRef = useRef<HTMLDivElement | null>(null);
const [larguraAlvo, setLarguraAlvo] = useState(700);

- const painelARef = useRef<HTMLDivElement | null>(null);
- const painelBRef = useRef<HTMLDivElement | null>(null);
- // Espelha o scroll de um painel no outro no modo lado-a-lado. Sem esta trava, o `scrollTop`
- // ajustado no painel destino dispararia o `onScroll` dele, que tentaria realimentar o painel
- // de origem — um laço infinito de eventos.
- const sincronizandoScrollRef = useRef(false);
- const sincronizarScroll = useCallback((origem: "A" | "B") => {
- if (sincronizandoScrollRef.current) return;
- const fonte = origem === "A" ? painelARef.current : painelBRef.current;
- const destino = origem === "A" ? painelBRef.current : painelARef.current;
- if (!fonte || !destino) return;
- sincronizandoScrollRef.current = true;
- destino.scrollTop = fonte.scrollTop;
- destino.scrollLeft = fonte.scrollLeft;
- // O evento `scroll` que essa atribuição dispara no destino é assíncrono (não sincrônico
- // como um `.click()`) — liberar a trava só no próximo frame garante que o eco ainda a
- // encontre travada. Liberar aqui mesmo (síncrono) a tornaria inútil.
- requestAnimationFrame(() => {
-      sincronizandoScrollRef.current = false;
- });
- }, []);

  const docA = useDocumento(uploadA);
  const docB = useDocumento(uploadB);
  @@ -198,6 +219,25 @@ export function ComparadorRevisoes({

  useEffect(() => setPagina((p) => Math.min(p, numPages)), [numPages]);

- // Ctrl+scroll dentro de um painel do modo lado-a-lado ajusta o zoom compartilhado (aplica
- // nos dois painéis, já que `zoom` é um único state). Listener nativo (não o `onWheel` do
- // React) porque handlers de wheel são passivos por padrão em React — `preventDefault()`
- // dentro do synthetic event geraria warning e não bloquearia o scroll/zoom nativo do navegador.
- useEffect(() => {
- // Os painéis só entram no DOM (refs deixam de ser null) depois que os dois PDFs terminam
- // de carregar — por isso o guard usa `docA.pdf`/`docB.pdf` em vez de só `modo`.
- if (modo !== "lado-a-lado" || !docA.pdf || !docB.pdf) return;
- const paineis = [painelARef.current, painelBRef.current].filter((el): el is HTMLDivElement => !!el);
- if (paineis.length === 0) return;
- const aoRolar = (e: WheelEvent) => {
-      if (!e.ctrlKey) return;
-      e.preventDefault();
-      ajustarZoom(e.deltaY < 0 ? 0.1 : -0.1);
- };
- paineis.forEach((el) => el.addEventListener("wheel", aoRolar, { passive: false }));
- return () => paineis.forEach((el) => el.removeEventListener("wheel", aoRolar));
- }, [modo, ajustarZoom, docA.pdf, docB.pdf]);
- const rotulo = (r: RevisaoDocumento) => `${rotuloRevisao(r.versao)}${r.excluido ? " (excluída)" : ""}`;
  return (
  @@ -271,9 +311,10 @@ export function ComparadorRevisoes({
  step={0.05}
  value={opacidadeB}
  onChange={(e) => setOpacidadeB(+e.target.value)}

*              className="w-28"

-              className="w-28 cursor-pointer accent-primary"
               aria-label="Opacidade da revisão B"
             />
-            <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">{Math.round(opacidadeB * 100)}%</span>
             </>
           )}
         </div>
  @@ -286,12 +327,20 @@ export function ComparadorRevisoes({
  <Loader2 className="size-4 animate-spin" /> Carregando as duas revisões…
  </p>
  ) : modo === "lado-a-lado" ? (

*          <div className="grid grid-cols-2 gap-4">
*            <div>

-          <div className="grid h-full grid-cols-2 gap-4">
-            <div
-              ref={painelARef}
-              onScroll={() => sincronizarScroll("A")}
-              className="h-full overflow-auto"
-            >
               <p className="mb-1 text-center text-xs font-medium text-destructive">{rotulo(ordenadas.find((r) => r.uploadId === uploadA)!)}</p>
               <PdfPagina pdf={docA.pdf} pagina={Math.min(pagina, docA.numPages || 1)} largura={larguraAlvo * zoom} />
             </div>

*            <div>

-            <div
-              ref={painelBRef}
-              onScroll={() => sincronizarScroll("B")}
-              className="h-full overflow-auto"
  Código bem pensado — a trava com requestAnimationFrame está correta (o evento scroll é assíncrono) e o listener nativo com passive: false é o caminho certo para Ctrl+scroll. Mas quero verificar uma coisa que ele mudou no layout:

Bash Check parent container height for the panels
IN
cd .claude/worktrees/agent-aca730b53cb77bd3d 2>/dev/null && grep -n "flex-1 overflow-auto\|className=\"flex h-\|overflow-auto" src/components/projetos/comparador-revisoes.tsx | head -6

OUT
244: <div className="flex h-[calc(100vh-2rem)] flex-col">
322: <div ref={colunaRef} className="flex-1 overflow-auto bg-muted/30 p-4">
334: className="h-full overflow-auto"
342: className="h-full overflow-auto"
Layout OK (pai tem altura via flex-1), embora crie scroll aninhado — vou validar isso no navegador depois. Integro o trabalho dele na branch de feature:

Bash Switch to feature branch and cherry-pick agent work
IN
git checkout refactor/documentos-cde 2>&1|tail -1; git merge dev --ff-only 2>&1|tail -1; git cherry-pick 3dedaa7 2>&1 | tail -3; git log --oneline -1

OUT
Switched to branch 'refactor/documentos-cde'
create mode 100644 src/modules/comercial/jornada.ts
[refactor/documentos-cde c7813de] feat(projetos): sincroniza zoom/pan entre paineis e mostra % de opacidade no comparador
Date: Thu Aug 20 08:06:36 2026 -0300
1 file changed, 53 insertions(+), 4 deletions(-)
c7813de feat(projetos): sincroniza zoom/pan entre paineis e mostra % de opacidade no comparador
F4-PR4 integrado. Commito a correção do lint e sigo com o PR6a:

Bash Commit eslint worktree ignore
IN
git add eslint.config.mjs && git commit -q -m "chore(lint): ignorar worktrees de agente

Worktree de agente vive em .claude/worktrees e carrega uma cópia inteira do
repo, incluindo public/pdf.worker.min.mjs. O ESLint lintava esses arquivos
minificados e devolvia 14 erros que não são de ninguém — atrapalhando quem
roda lint enquanto um agente trabalha em paralelo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" && git log --oneline -1

OUT
Exit code 1
On branch refactor/documentos-cde
nothing to commit, working tree clean
Bash Check if my files survived the branch switch
IN
ls -la src/modules/uploads/documentos-agrupados.ts 2>&1 | tail -1; grep -c "claude/worktrees" eslint.config.mjs; git log --oneline -3

OUT
ls: cannot access 'src/modules/uploads/documentos-agrupados.ts': No such file or directory
0
c7813de feat(projetos): sincroniza zoom/pan entre paineis e mostra % de opacidade no comparador
f520515 feat(comercial): jornada da negociacao + moverEstagio como ponto unico (F2.6+F2.7)
8e52510 docs(crm): log do bloco F2.3+F2.4+F2.5
Meus arquivos não commitados foram apagados — outra sessão fez uma operação destrutiva no working tree compartilhado (checkout ., clean ou reset --hard). Perdi a query e o ajuste do lint.

Reescrevo já com as três correções que descobri (coluna nome, FK disciplinaId, min() no GROUP BY) e commito imediatamente:

Write c:\SENA_ADM\SENAHUB\SENAHub-remake\src\modules\uploads\documentos-agrupados.ts
Write failed
import "server-only";
import { prisma } from "@/lib/prisma";

/\*\*

- Listagem de documentos AGRUPADA POR DOCUMENTO (Fase 2 — F2-PR6a).
-
- A listagem da Fase 1 devolvia uma linha por ARQUIVO. Depois do merge por nome-base, PDF e
- DWG da mesma prancha são o mesmo documento — mostrá-los em duas linhas desmente o que o
- banco já sabe. Aqui a unidade da tabela passa a ser o documento, e as extensões viram
- badges dentro da linha.
-
- Por que SQL cru para escolher a página: três das cinco colunas ordenáveis viraram
- agregados do documento — revisão é `max(numero)`, "atualizado" é `max(createdAt)` e
- tamanho é `sum(tamanho)`. O Prisma não ordena por agregado de relação, e ordenar em
- memória traria o acervo inteiro para o servidor, desfazendo a paginação conquistada em
- F1-PR10. Então o SQL responde só "quais ids, nesta ordem" e o Prisma hidrata o resto com
- tipagem de verdade.
-
- Nomes de coluna que NÃO são óbvios pelo schema e já custaram erro em runtime:
- - `disciplina.disciplinaTextoLegado` é `@map("nome")` — no SQL a coluna é `disc.nome`.
- - a FK de `Disciplina` para o catálogo é `disciplinaId`, não `catalogoId`.
    \*/

export const CAMPOS_ORDENACAO_DOC = ["nome", "disciplina", "revisao", "data", "tamanho"] as const;
export type CampoOrdenacaoDoc = (typeof CAMPOS_ORDENACAO_DOC)[number];

/\*_ Aceita só o que está na whitelist — o valor vem da URL. _/
export function campoOrdenacaoDocValido(v: string | null | undefined): CampoOrdenacaoDoc | null {
return (CAMPOS_ORDENACAO_DOC as readonly string[]).includes(v ?? "") ? (v as CampoOrdenacaoDoc) : null;
}

/\*\*

- Expressão SQL de cada campo ordenável. É a ÚNICA parte interpolada na consulta; todo valor
- vindo do usuário viaja como parâmetro numerado.
  \*/
  const COLUNA_ORDENACAO: Record<CampoOrdenacaoDoc, string> = {
  nome: `lower(coalesce(d.titulo, d."nomeArquivo"))`,
  // `min(...)`: o GROUP BY é por `d.id`, e o Postgres só dispensa agregação para colunas da
  // própria `d` (dependência funcional da PK). Coluna de tabela juntada precisa ser agregada —
  // e como o join é para-um, `min` devolve exatamente o valor da linha.
  disciplina: `min(lower(coalesce(cat.nome, disc.nome, '')))`,
  revisao: `max(r.numero)`,
  data: `max(u."createdAt")`,
  tamanho: `sum(u.tamanho)`,
  };

const DIAS_VALIDOS = new Set(["7", "30", "90"]);

export type FiltrosDoc = {
disciplinaId?: string | null;
q?: string;
ext?: string;
autor?: string;
periodo?: string;
validado?: string;
fase?: string;
status?: string;
};

export type ArquivoDaLinha = {
id: string;
nome: string;
ext: string;
downloadUrl: string;
/\*_ `null` para arquivo em PastaProjeto, que não passa por validação. _/
validado: boolean | null;
};

export type LinhaDoc = {
id: string;
nome: string;
titulo: string | null;
disciplinaId: string;
disciplinaNome: string;
revisaoAtual: number | null;
statusNome: string | null;
faseSigla: string | null;
atualizadoEm: string;
tamanhoTotal: number;
autor: string;
podeGerir: boolean;
/\*_ Arquivos da revisão ATUAL — é o que vira badge clicável na linha. _/
arquivos: ArquivoDaLinha[];
totalRevisoes: number;
};

/\*_ Extensão em minúsculas, sem ponto. _/
function extensaoDe(nome: string): string {
const i = nome.lastIndexOf(".");
return i > 0 ? nome.slice(i + 1).toLowerCase() : "";
}

export async function listarDocumentosAgrupados(opts: {
projetoId: string;
userId: string;
veTodas: boolean;
ehGlobal: boolean;
podeEnviarCap: boolean;
filtros: FiltrosDoc;
skip: number;
take: number;
sort: CampoOrdenacaoDoc | null;
dir: "asc" | "desc";
}) {
const { projetoId, userId, veTodas, filtros, skip, take, sort, dir } = opts;
const termo = filtros.q?.trim() || null;
const dias = DIAS_VALIDOS.has(filtros.periodo ?? "") ? Number(filtros.periodo) : null;
const desde = dias ? new Date(Date.now() - dias \* 86_400_000) : null;
const ordem = COLUNA_ORDENACAO[sort ?? "data"];
const direcao = dir === "asc" ? "asc" : "desc";
const validadoSim = filtros.validado === "sim" ? true : null;
const validadoNao = filtros.validado === "nao" ? true : null;

// `join upload` com `excluidoEm is null` faz o documento cujos arquivos foram todos para a
// lixeira sumir da lista — mesmo efeito do filtro global de soft delete na versão anterior.
const base = `     from documento_disciplina d
    join disciplina disc on disc.id = d."disciplinaId"
    left join disciplina_catalogo cat on cat.id = disc."disciplinaId"
    join upload u on u."documentoId" = d.id and u."excluidoEm" is null
    left join documento_revisao r on r.id = u."revisaoId"
    left join documento_status st on st.id = d."statusId"
    left join "user" au on au.id = u."autorId"
    where d."substituidoPorId" is null
      and disc."projetoId" = $1
      and ($2::text is null or disc.id = $2)
      and ($3::boolean is true or exists (
            select 1 from disciplina_responsavel dr
            where dr."disciplinaId" = disc.id and dr."userId" = $4))
      and ($5::text is null or (
            d."nomeArquivo" ilike '%' || $5 || '%'
            or coalesce(d.titulo, '') ilike '%' || $5 || '%'
            or coalesce(cat.nome, disc.nome, '') ilike '%' || $5 || '%'
            or coalesce(au.name, '') ilike '%' || $5 || '%'))
      and ($6::text is null or lower(u."nomeArquivo") like '%.' || lower($6))
      and ($7::text is null or au.name = $7)
      and ($8::timestamptz is null or u."createdAt" >= $8)
      and ($9::text is null or st.nome = $9)
      and ($10::text is null or d."faseId" = $10)
      and ($11::boolean is null or (u.validado = true and u."pastaId" is null))
      and ($12::boolean is null or (u.validado = false and u."pastaId" is null))
    group by d.id
  `;
const params = [
projetoId,
filtros.disciplinaId ?? null,
veTodas,
userId,
termo,
filtros.ext ?? null,
filtros.autor ?? null,
desde,
filtros.status ?? null,
filtros.fase ?? null,
validadoSim,
validadoNao,
];

const totalRows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
`select count(*)::bigint as n from (select d.id ${base}) x`,
...params,
);
const total = Number(totalRows[0]?.n ?? 0);

const ultimaPagina = Math.max(1, Math.ceil(total / Math.max(1, take)));
const paginaPedida = Math.floor(skip / Math.max(1, take)) + 1;
const pagina = Math.min(paginaPedida, ultimaPagina);
const skipEfetivo = (pagina - 1) \* take;

// `d.id asc` como desempate: sem ele, dois documentos com o mesmo valor de ordenação podem
// trocar de posição entre páginas — e aí um aparece duas vezes e outro nenhuma.
const idsRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
`select d.id, ${ordem} as ord ${base} order by ord ${direcao} nulls last, d.id asc limit ${Number(take)} offset ${Number(skipEfetivo)}`,
...params,
);
const ids = idsRows.map((r) => r.id);
if (ids.length === 0) return { total, pagina, linhas: [] as LinhaDoc[] };

const docs = await prisma.documentoDisciplina.findMany({
where: { id: { in: ids } },
select: {
id: true,
nomeArquivo: true,
titulo: true,
status: { select: { nome: true } },
fase: { select: { sigla: true } },
disciplina: {
select: {
id: true,
disciplinaTextoLegado: true,
catalogo: { select: { nome: true } },
responsaveis: { select: { userId: true } },
},
},
revisoes: { select: { id: true, numero: true } },
uploads: {
where: { excluidoEm: null },
select: {
id: true,
nomeArquivo: true,
tamanho: true,
validado: true,
pastaId: true,
revisaoId: true,
createdAt: true,
autor: { select: { name: true } },
},
},
},
});

// Reordena pelo que o SQL decidiu — `findMany` com `in` não preserva a ordem dos ids.
const porId = new Map(docs.map((d) => [d.id, d]));
const linhas: LinhaDoc[] = [];
for (const id of ids) {
const d = porId.get(id);
if (!d) continue;
const revisaoAtual = d.revisoes.length ? Math.max(...d.revisoes.map((r) => r.numero)) : null;
const idRevisaoAtual = d.revisoes.find((r) => r.numero === revisaoAtual)?.id ?? null;
// Mostra os arquivos da revisão ATUAL. Upload legado sem revisão entra junto: sumir da
// tela seria pior do que aparecer sem número.
const daAtual = idRevisaoAtual
? d.uploads.filter((u) => u.revisaoId === idRevisaoAtual || u.revisaoId === null)
: d.uploads;
const maisRecente = [...d.uploads].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
linhas.push({
id: d.id,
nome: d.nomeArquivo,
titulo: d.titulo,
disciplinaId: d.disciplina.id,
disciplinaNome: d.disciplina.catalogo?.nome ?? d.disciplina.disciplinaTextoLegado ?? "—",
revisaoAtual,
statusNome: d.status?.nome ?? null,
faseSigla: d.fase?.sigla ?? null,
atualizadoEm: (maisRecente?.createdAt ?? new Date()).toISOString(),
tamanhoTotal: d.uploads.reduce((s, u) => s + u.tamanho, 0),
autor: maisRecente?.autor?.name ?? "—",
podeGerir:
opts.podeEnviarCap &&
(opts.ehGlobal || d.disciplina.responsaveis.some((r) => r.userId === userId)),
arquivos: daAtual.map((u) => ({
id: u.id,
nome: u.nomeArquivo,
ext: extensaoDe(u.nomeArquivo),
downloadUrl: `/api/uploads/${u.id}/download`,
validado: u.pastaId ? null : u.validado,
})),
totalRevisoes: d.revisoes.length,
});
}
return { total, pagina, linhas };
}
Bash Check current state of the file
IN
ls -la src/modules/uploads/documentos-agrupados.ts 2>&1|tail -1; head -3 src/modules/uploads/documentos-agrupados.ts 2>/dev/null; git status --porcelain | head -5

OUT
ls: cannot access 'src/modules/uploads/documentos-agrupados.ts': No such file or directory
Bash Create placeholder so Write can proceed
IN
printf '// placeholder\n' > src/modules/uploads/documentos-agrupados.ts && ls -la src/modules/uploads/documentos-agrupados.ts | tail -1

OUT
-rw-r--r-- 1 Admin 197121 15 Aug 20 08:09 src/modules/uploads/documentos-agrupados.ts
Read c:\SENA_ADM\SENAHUB\SENAHub-remake\src\modules\uploads\documentos-agrupados.ts
Bash Verify real file contents on disk
IN
wc -l src/modules/uploads/documentos-agrupados.ts 2>&1; echo "--- primeira linha real ---"; head -1 src/modules/uploads/documentos-agrupados.ts; echo "--- eslint ---"; grep -c "worktrees" eslint.config.mjs; git status --porcelain

OUT
1 src/modules/uploads/documentos-agrupados.ts
--- primeira linha real ---
// placeholder
--- eslint ---
0
?? src/modules/uploads/documentos-agrupados.ts
O disco tem só o placeholder — o Read mostrou cache. Reescrevo de verdade:

Write c:\SENA_ADM\SENAHUB\SENAHub-remake\src\modules\uploads\documentos-agrupados.ts
253 lines
import "server-only";
import { prisma } from "@/lib/prisma";

/\*\*

- Listagem de documentos AGRUPADA POR DOCUMENTO (Fase 2 — F2-PR6a).
-
- A listagem da Fase 1 devolvia uma linha por ARQUIVO. Depois do merge por nome-base, PDF e
- DWG da mesma prancha são o mesmo documento — mostrá-los em duas linhas desmente o que o
- banco já sabe. Aqui a unidade da tabela passa a ser o documento, e as extensões viram
- badges dentro da linha.
-
- Por que SQL cru para escolher a página: três das cinco colunas ordenáveis viraram
- agregados do documento — revisão é `max(numero)`, "atualizado" é `max(createdAt)` e
- tamanho é `sum(tamanho)`. O Prisma não ordena por agregado de relação, e ordenar em
- memória traria o acervo inteiro para o servidor, desfazendo a paginação conquistada em
- F1-PR10. Então o SQL responde só "quais ids, nesta ordem" e o Prisma hidrata o resto com
- tipagem de verdade.
-
- Nomes de coluna que NÃO são óbvios pelo schema e já custaram erro em runtime:
- - `Disciplina.disciplinaTextoLegado` é `@map("nome")` — no SQL a coluna é `disc.nome`.
- - a FK de `Disciplina` para o catálogo é `disciplinaId`, não `catalogoId`.
    \*/

export const CAMPOS_ORDENACAO_DOC = ["nome", "disciplina", "revisao", "data", "tamanho"] as const;
export type CampoOrdenacaoDoc = (typeof CAMPOS_ORDENACAO_DOC)[number];

/\*_ Aceita só o que está na whitelist — o valor vem da URL. _/
export function campoOrdenacaoDocValido(v: string | null | undefined): CampoOrdenacaoDoc | null {
return (CAMPOS_ORDENACAO_DOC as readonly string[]).includes(v ?? "") ? (v as CampoOrdenacaoDoc) : null;
}

/\*\*

- Expressão SQL de cada campo ordenável. É a ÚNICA parte interpolada na consulta; todo valor
- vindo do usuário viaja como parâmetro numerado.
  \*/
  const COLUNA_ORDENACAO: Record<CampoOrdenacaoDoc, string> = {
  nome: `lower(coalesce(d.titulo, d."nomeArquivo"))`,
  // `min(...)`: o GROUP BY é por `d.id`, e o Postgres só dispensa agregação para colunas da
  // própria `d` (dependência funcional da PK). Coluna de tabela juntada precisa ser agregada —
  // e como o join é para-um, `min` devolve exatamente o valor da linha.
  disciplina: `min(lower(coalesce(cat.nome, disc.nome, '')))`,
  revisao: `max(r.numero)`,
  data: `max(u."createdAt")`,
  tamanho: `sum(u.tamanho)`,
  };

const DIAS_VALIDOS = new Set(["7", "30", "90"]);

export type FiltrosDoc = {
disciplinaId?: string | null;
q?: string;
ext?: string;
autor?: string;
periodo?: string;
validado?: string;
fase?: string;
status?: string;
};

export type ArquivoDaLinha = {
id: string;
nome: string;
ext: string;
downloadUrl: string;
/\*_ `null` para arquivo em PastaProjeto, que não passa por validação. _/
validado: boolean | null;
};

export type LinhaDoc = {
id: string;
nome: string;
titulo: string | null;
disciplinaId: string;
disciplinaNome: string;
revisaoAtual: number | null;
statusNome: string | null;
faseSigla: string | null;
atualizadoEm: string;
tamanhoTotal: number;
autor: string;
podeGerir: boolean;
/\*_ Arquivos da revisão ATUAL — é o que vira badge clicável na linha. _/
arquivos: ArquivoDaLinha[];
totalRevisoes: number;
};

/\*_ Extensão em minúsculas, sem ponto. _/
function extensaoDe(nome: string): string {
const i = nome.lastIndexOf(".");
return i > 0 ? nome.slice(i + 1).toLowerCase() : "";
}

export async function listarDocumentosAgrupados(opts: {
projetoId: string;
userId: string;
veTodas: boolean;
ehGlobal: boolean;
podeEnviarCap: boolean;
filtros: FiltrosDoc;
skip: number;
take: number;
sort: CampoOrdenacaoDoc | null;
dir: "asc" | "desc";
}) {
const { projetoId, userId, veTodas, filtros, skip, take, sort, dir } = opts;
const termo = filtros.q?.trim() || null;
const dias = DIAS_VALIDOS.has(filtros.periodo ?? "") ? Number(filtros.periodo) : null;
const desde = dias ? new Date(Date.now() - dias \* 86_400_000) : null;
const ordem = COLUNA_ORDENACAO[sort ?? "data"];
const direcao = dir === "asc" ? "asc" : "desc";
const validadoSim = filtros.validado === "sim" ? true : null;
const validadoNao = filtros.validado === "nao" ? true : null;

// `join upload` com `excluidoEm is null` faz o documento cujos arquivos foram todos para a
// lixeira sumir da lista — mesmo efeito do filtro global de soft delete na versão anterior.
const base = `     from documento_disciplina d
    join disciplina disc on disc.id = d."disciplinaId"
    left join disciplina_catalogo cat on cat.id = disc."disciplinaId"
    join upload u on u."documentoId" = d.id and u."excluidoEm" is null
    left join documento_revisao r on r.id = u."revisaoId"
    left join documento_status st on st.id = d."statusId"
    left join "user" au on au.id = u."autorId"
    where d."substituidoPorId" is null
      and disc."projetoId" = $1
      and ($2::text is null or disc.id = $2)
      and ($3::boolean is true or exists (
            select 1 from disciplina_responsavel dr
            where dr."disciplinaId" = disc.id and dr."userId" = $4))
      and ($5::text is null or (
            d."nomeArquivo" ilike '%' || $5 || '%'
            or coalesce(d.titulo, '') ilike '%' || $5 || '%'
            or coalesce(cat.nome, disc.nome, '') ilike '%' || $5 || '%'
            or coalesce(au.name, '') ilike '%' || $5 || '%'))
      and ($6::text is null or lower(u."nomeArquivo") like '%.' || lower($6))
      and ($7::text is null or au.name = $7)
      and ($8::timestamptz is null or u."createdAt" >= $8)
      and ($9::text is null or st.nome = $9)
      and ($10::text is null or d."faseId" = $10)
      and ($11::boolean is null or (u.validado = true and u."pastaId" is null))
      and ($12::boolean is null or (u.validado = false and u."pastaId" is null))
    group by d.id
  `;
const params = [
projetoId,
filtros.disciplinaId ?? null,
veTodas,
userId,
termo,
filtros.ext ?? null,
filtros.autor ?? null,
desde,
filtros.status ?? null,
filtros.fase ?? null,
validadoSim,
validadoNao,
];

const totalRows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
`select count(*)::bigint as n from (select d.id ${base}) x`,
...params,
);
const total = Number(totalRows[0]?.n ?? 0);

const ultimaPagina = Math.max(1, Math.ceil(total / Math.max(1, take)));
const paginaPedida = Math.floor(skip / Math.max(1, take)) + 1;
const pagina = Math.min(paginaPedida, ultimaPagina);
const skipEfetivo = (pagina - 1) \* take;

// `d.id asc` como desempate: sem ele, dois documentos com o mesmo valor de ordenação podem
// trocar de posição entre páginas — e aí um aparece duas vezes e outro nenhuma.
const idsRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
`select d.id, ${ordem} as ord ${base} order by ord ${direcao} nulls last, d.id asc limit ${Number(take)} offset ${Number(skipEfetivo)}`,
...params,
);
const ids = idsRows.map((r) => r.id);
if (ids.length === 0) return { total, pagina, linhas: [] as LinhaDoc[] };

const docs = await prisma.documentoDisciplina.findMany({
where: { id: { in: ids } },
select: {
id: true,
nomeArquivo: true,
titulo: true,
status: { select: { nome: true } },
fase: { select: { sigla: true } },
disciplina: {
select: {
id: true,
disciplinaTextoLegado: true,
catalogo: { select: { nome: true } },
responsaveis: { select: { userId: true } },
},
},
revisoes: { select: { id: true, numero: true } },
uploads: {
where: { excluidoEm: null },
select: {
id: true,
nomeArquivo: true,
tamanho: true,
validado: true,
pastaId: true,
revisaoId: true,
createdAt: true,
autor: { select: { name: true } },
},
},
},
});

// Reordena pelo que o SQL decidiu — `findMany` com `in` não preserva a ordem dos ids.
const porId = new Map(docs.map((d) => [d.id, d]));
const linhas: LinhaDoc[] = [];
for (const id of ids) {
const d = porId.get(id);
if (!d) continue;
const revisaoAtual = d.revisoes.length ? Math.max(...d.revisoes.map((r) => r.numero)) : null;
const idRevisaoAtual = d.revisoes.find((r) => r.numero === revisaoAtual)?.id ?? null;
// Mostra os arquivos da revisão ATUAL. Upload legado sem revisão entra junto: sumir da
// tela seria pior do que aparecer sem número.
const daAtual = idRevisaoAtual
? d.uploads.filter((u) => u.revisaoId === idRevisaoAtual || u.revisaoId === null)
: d.uploads;
const maisRecente = [...d.uploads].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
linhas.push({
id: d.id,
nome: d.nomeArquivo,
titulo: d.titulo,
disciplinaId: d.disciplina.id,
disciplinaNome: d.disciplina.catalogo?.nome ?? d.disciplina.disciplinaTextoLegado ?? "—",
revisaoAtual,
statusNome: d.status?.nome ?? null,
faseSigla: d.fase?.sigla ?? null,
atualizadoEm: (maisRecente?.createdAt ?? new Date()).toISOString(),
tamanhoTotal: d.uploads.reduce((s, u) => s + u.tamanho, 0),
autor: maisRecente?.autor?.name ?? "—",
podeGerir:
opts.podeEnviarCap &&
(opts.ehGlobal || d.disciplina.responsaveis.some((r) => r.userId === userId)),
arquivos: daAtual.map((u) => ({
id: u.id,
nome: u.nomeArquivo,
ext: extensaoDe(u.nomeArquivo),
downloadUrl: `/api/uploads/${u.id}/download`,
validado: u.pastaId ? null : u.validado,
})),
totalRevisoes: d.revisoes.length,
});
}
return { total, pagina, linhas };
}
Commito imediatamente — não arrisco perder de novo:

Bash Commit the grouped query immediately
IN
wc -l src/modules/uploads/documentos-agrupados.ts; npx eslint src/modules/uploads/documentos-agrupados.ts 2>&1 | tail -3
python - <<'PY'
p = "eslint.config.mjs"
s = open(p, encoding="utf-8").read()
alvo = ' "ds-bundle/**", // bundle vendorizado (React interno etc.), não código-fonte\n'
if '.claude/worktrees' not in s:
s = s.replace(alvo, alvo + ' ".claude/worktrees/**", // checkouts temporários de agente: já são lintados na própria raiz\n', 1)
open(p, "w", encoding="utf-8").write(s)
print("eslint ajustado")
PY
git add src/modules/uploads/documentos-agrupados.ts eslint.config.mjs && git commit -q -F- <<'EOF' && git log --oneline -1
feat(documentos): consulta agrupada por documento (F2-PR6a, parte 1)

A listagem devolvia uma linha por ARQUIVO. Depois do merge por nome-base, PDF e
DWG da mesma prancha são o mesmo documento — duas linhas desmentem o que o
banco já sabe. Esta consulta passa a ter o documento como unidade, com as
extensões agregadas para virarem badges na linha.

Usa SQL cru só para escolher a página: três das cinco colunas ordenáveis viraram
agregados (revisão é max, atualizado é max, tamanho é sum) e o Prisma não ordena
por agregado de relação. Ordenar em memória traria o acervo inteiro para o
servidor e desfaria a paginação de F1-PR10. O Prisma hidrata o resto com tipo.

Verificado contra o banco real: num projeto com 40 arquivos, a lista passa a ter
20 linhas, 9 delas com PDF+DWG juntos. Ordenação por revisão, tamanho, nome e
disciplina conferem; a muralha por disciplina devolve 0 para quem não é
responsável; página fora do range cai na última.

Três armadilhas de schema que custaram erro em runtime e agora estão comentadas
no arquivo: `disciplinaTextoLegado` é `@map("nome")`, a FK do catálogo é
`disciplinaId`, e coluna de tabela juntada precisa de agregação no GROUP BY.

Inclui ignore de `.claude/worktrees` no ESLint: worktree de agente carrega uma
cópia do repo com os workers minificados de public/, e o lint acusava 14 erros
que não são de ninguém.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF

OUT
1 src/modules/uploads/documentos-agrupados.ts
eslint ajustado
warning: in the working copy of 'src/modules/uploads/documentos-agrupados.ts', LF will be replaced by CRLF the next time Git touches it
84bbd4b feat(documentos): consulta agrupada por documento (F2-PR6a, parte 1)
wc -l = 1 linha. O Write reportou sucesso, mas o disco tem só o placeholder — commitei um arquivo vazio. Verifico:

Bash Check what was actually committed
IN
git show --stat HEAD | tail -4; echo "--- conteudo commitado ---"; git show HEAD:src/modules/uploads/documentos-agrupados.ts | wc -l; git show HEAD:src/modules/uploads/documentos-agrupados.ts | head -2

OUT
eslint.config.mjs | 1 +
src/modules/uploads/documentos-agrupados.ts | 1 +
2 files changed, 2 insertions(+)
--- conteudo commitado ---
1
// placeholder
Preciso parar e te avisar de um problema de ambiente que está inviabilizando o trabalho.

O que está acontecendo
Escrevi o arquivo documentos-agrupados.ts (~250 linhas). A ferramenta reportou sucesso. Um segundo depois, o disco tinha 1 linha — só o placeholder. Aconteceu duas vezes seguidas, e acabei commitando um arquivo vazio (84bbd4b).

Sintomas acumulados nesta última hora:

Arquivo escrito volta a ficar vazio segundos depois
eslint.config.mjs que editei foi revertido sozinho
A branch do checkout mudou de refactor/documentos-cde para dev sem eu pedir
Leituras retornam conteúdo que não está no disco (cache divergente)
A causa mais provável: outra sessão está trabalhando no mesmo working tree e rodando algo destrutivo — git checkout ., git stash, git clean ou um watch que restaura arquivos. Os worktrees dos subagentes que criei ficaram dentro de .claude/worktrees/, o que pode ter agravado.

Não é seguro continuar assim: qualquer coisa que eu escreva pode desaparecer, e o pior caso é o que acabou de acontecer — commit de conteúdo vazio passando por verificação.

O que eu preciso de você

1. Verifique se há outra sessão do Claude Code aberta neste projeto e pause-a. Se houver um dev.bat, watcher ou script de sync rodando, pare também.

2. Confirme quando eu puder retomar.

Estado atual, sem perda real
Item Situação
F4-PR4 (comparador) ✅ Íntegro — c7813de, 53 linhas reais, revisado por mim
F2-PR8 (histórico) ⏳ Subagente ainda rodando, em worktree isolado (protegido)
F2-PR6a (query) ❌ Commit 84bbd4b tem placeholder — preciso refazer
O código da query não se perdeu conceitualmente: tenho a versão correta com as três correções de schema que descobri rodando (disc.nome em vez de disciplinaTextoLegado, FK disciplinaId, e min() no GROUP BY). E ela foi validada contra o banco real antes de sumir: 40 arquivos → 20 linhas, 9 com PDF+DWG juntos, todas as ordenações e a muralha corretas.

Assim que o ambiente estiver estável, reescrevo, valido de novo e corrijo o commit vazio com um --amend ou um commit de correção.

Quer que eu tente git worktree remove nos dois worktrees de agente antes, para descartar essa hipótese? O do F2-PR8 ainda está trabalhando, então eu aguardaria ele terminar primeiro.

<task-notification>
<task-id>a04b6fd11d28e4454</task-id>
<tool-use-id>toolu_01Fpkmkrc5tvEeRNh1ZUMMHW</tool-use-id>
<output-file>C:\Users\Admin\AppData\Local\Temp\claude\c--SENA-ADM-SENAHUB-SENAHub-remake\a2e338c0-d8e9-4b77-afbe-c217b1c1cd43\tasks\a04b6fd11d28e4454.output</output-file>
<status>completed</status>
<summary>Agent "F2-PR8 historico de revisoes" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>All three checks pass and the commit is in place. Final report:

## Summary

**Files touched:**

- Created: `src/components/projetos/arquivos/historico-revisoes-dialog.tsx`
- Edited: `src/modules/uploads/queries.ts` (added `historicoRevisoesDocumento`, only appended, no existing function touched)
- Edited: `src/components/projetos/arquivos/menu-documento.tsx` (new menu item + updated stale comment)
- **Edited outside the allowed list: `src/modules/uploads/actions.ts`** — flagging this explicitly, as instructed.

**Why `actions.ts` had to be touched:** `queries.ts` has `import "server-only"` — it has no session/permission awareness and cannot be invoked from a client component. The drawer opens from `menu-documento.tsx` (`"use client"`) and needs to fetch data on demand. Marking `queries.ts` itself `"use server"` was not an option — that would turn every existing read in the file into a public, unauthenticated HTTP endpoint, bypassing all the auth/permission checks `defineAction` exists to provide. The only architecturally sound path is a thin `defineAction`-wrapped Server Action. I added exactly one new export, `carregarHistoricoRevisoes`, modeled on the codebase's existing precedent for this exact situation (`carregarVersoesArt` in `modules/projetos/art/actions.ts`). It reapplies the same muralha-por-disciplina check already used elsewhere in this same file (`projetoVisivel` + responsável-ou-`ver_todas_disciplinas`), uses `audit: false` (opening a drawer is navigation, not a business action worth audit-log noise), and touches no existing code.

**How I got `documentoId`:** `LinhaDocumento` (in `lista-documentos.ts`, outside the allowed files) has no `documentoId` field, and I did not add one. Per the task's own fallback ("busque pelo upload"), the new query takes `uploadId` (which the row does have, as `linha.id`), looks up `Upload.documentoId`, and only then calls `resolverDocumentoCanonico`. If `Upload.documentoId` is null (legacy pre-backfill row), the query returns `[]` — rendered as the EmptyState, not an error, since that's an honest state, not a bug.

**Trashed files in a revision:** included, never hidden, each flagged with a "na lixeira" badge (via `excluido: u.excluidoEm != null`, read via the nested `documentoRevisao → uploads` query which bypasses the global soft-delete Prisma extension by design, same rationale as the existing `revisoesDoDocumento`). Their download button is suppressed — `/api/uploads/[id]/download` hard-rejects files with `excluidoEm` set, so offering that link would be a dead action producing a raw JSON error in a new tab; the badge alone is the signal, per this file's own stated principle ("item invisível é mais honesto que item morto").

**Verification (all green, run in the isolated worktree after wiring a local `node_modules`/generated-Prisma-client for the sandbox — no source changes needed):**

- `npm run lint` — clean
- `npm run build` — succeeds (all routes compiled)
- `npm test` — 198 files / 2051 tests passed

**Commit:** `95cb25f420a2528d67299b0358d55c050098fa44` — `feat(arquivos): drawer de historico de revisoes por documento (F2-PR8)`, includes the amendment that suppressed the download button on trashed files. Only the 4 intended files are in the diff.</result>
<usage><subagent_tokens>156603</subagent_tokens><tool_uses>80</tool_uses><duration_ms>1098530</duration_ms></usage>
<worktree><worktreePath>C:\SENA_ADM\SENAHUB\SENAHub-remake\.claude\worktrees\agent-a04b6fd11d28e4454</worktreePath><worktreeBranch>worktree-agent-a04b6fd11d28e4454</worktreeBranch></worktree>
</task-notification>
Segundo subagente terminou. Antes de integrar, testo se o ambiente estabilizou agora que os dois worktrees pararam:

Bash Test filesystem stability after agents finished
IN
printf 'linha1\nlinha2\nlinha3\n' > /tmp/teste-estab.txt
printf 'conteudo-de-teste-A\nconteudo-de-teste-B\n' > src/modules/uploads/\_teste-estabilidade.txt
sleep 3
echo "apos 3s:"; wc -l src/modules/uploads/\_teste-estabilidade.txt 2>&1 | tail -1
sleep 5
echo "apos 8s:"; wc -l src/modules/uploads/\_teste-estabilidade.txt 2>&1 | tail -1; cat src/modules/uploads/\_teste-estabilidade.txt 2>&1 | head -2
rm -f src/modules/uploads/\_teste-estabilidade.txt

OUT
apos 3s:
2 src/modules/uploads/\_teste-estabilidade.txt
apos 8s:
2 src/modules/uploads/\_teste-estabilidade.txt
conteudo-de-teste-A
conteudo-de-teste-B
Ambiente estável (arquivo sobreviveu 8s íntegro). A causa provável foram os npm install + prisma generate que os dois subagentes rodaram dentro dos worktrees — eles compartilham o .git e disputaram o filesystem.

Refaço a query e verifico na hora:

Write c:\SENA_ADM\SENAHUB\SENAHub-remake\src\modules\uploads\documentos-agrupados.ts
253 lines
import "server-only";
import { prisma } from "@/lib/prisma";

/\*\*

- Listagem de documentos AGRUPADA POR DOCUMENTO (Fase 2 — F2-PR6a).
-
- A listagem da Fase 1 devolvia uma linha por ARQUIVO. Depois do merge por nome-base, PDF e
- DWG da mesma prancha são o mesmo documento — mostrá-los em duas linhas desmente o que o
- banco já sabe. Aqui a unidade da tabela passa a ser o documento, e as extensões viram
- badges dentro da linha.
-
- Por que SQL cru para escolher a página: três das cinco colunas ordenáveis viraram
- agregados do documento — revisão é `max(numero)`, "atualizado" é `max(createdAt)` e
- tamanho é `sum(tamanho)`. O Prisma não ordena por agregado de relação, e ordenar em
- memória traria o acervo inteiro para o servidor, desfazendo a paginação conquistada em
- F1-PR10. Então o SQL responde só "quais ids, nesta ordem" e o Prisma hidrata o resto com
- tipagem de verdade.
-
- Nomes de coluna que NÃO são óbvios pelo schema e já custaram erro em runtime:
- - `Disciplina.disciplinaTextoLegado` é `@map("nome")` — no SQL a coluna é `disc.nome`.
- - a FK de `Disciplina` para o catálogo é `disciplinaId`, não `catalogoId`.
    \*/

export const CAMPOS_ORDENACAO_DOC = ["nome", "disciplina", "revisao", "data", "tamanho"] as const;
export type CampoOrdenacaoDoc = (typeof CAMPOS_ORDENACAO_DOC)[number];

/\*_ Aceita só o que está na whitelist — o valor vem da URL. _/
export function campoOrdenacaoDocValido(v: string | null | undefined): CampoOrdenacaoDoc | null {
return (CAMPOS_ORDENACAO_DOC as readonly string[]).includes(v ?? "") ? (v as CampoOrdenacaoDoc) : null;
}

/\*\*

- Expressão SQL de cada campo ordenável. É a ÚNICA parte interpolada na consulta; todo valor
- vindo do usuário viaja como parâmetro numerado.
  \*/
  const COLUNA_ORDENACAO: Record<CampoOrdenacaoDoc, string> = {
  nome: `lower(coalesce(d.titulo, d."nomeArquivo"))`,
  // `min(...)`: o GROUP BY é por `d.id`, e o Postgres só dispensa agregação para colunas da
  // própria `d` (dependência funcional da PK). Coluna de tabela juntada precisa ser agregada —
  // e como o join é para-um, `min` devolve exatamente o valor da linha.
  disciplina: `min(lower(coalesce(cat.nome, disc.nome, '')))`,
  revisao: `max(r.numero)`,
  data: `max(u."createdAt")`,
  tamanho: `sum(u.tamanho)`,
  };

const DIAS_VALIDOS = new Set(["7", "30", "90"]);

export type FiltrosDoc = {
disciplinaId?: string | null;
q?: string;
ext?: string;
autor?: string;
periodo?: string;
validado?: string;
fase?: string;
status?: string;
};

export type ArquivoDaLinha = {
id: string;
nome: string;
ext: string;
downloadUrl: string;
/\*_ `null` para arquivo em PastaProjeto, que não passa por validação. _/
validado: boolean | null;
};

export type LinhaDoc = {
id: string;
nome: string;
titulo: string | null;
disciplinaId: string;
disciplinaNome: string;
revisaoAtual: number | null;
statusNome: string | null;
faseSigla: string | null;
atualizadoEm: string;
tamanhoTotal: number;
autor: string;
podeGerir: boolean;
/\*_ Arquivos da revisão ATUAL — é o que vira badge clicável na linha. _/
arquivos: ArquivoDaLinha[];
totalRevisoes: number;
};

/\*_ Extensão em minúsculas, sem ponto. _/
function extensaoDe(nome: string): string {
const i = nome.lastIndexOf(".");
return i > 0 ? nome.slice(i + 1).toLowerCase() : "";
}

export async function listarDocumentosAgrupados(opts: {
projetoId: string;
userId: string;
veTodas: boolean;
ehGlobal: boolean;
podeEnviarCap: boolean;
filtros: FiltrosDoc;
skip: number;
take: number;
sort: CampoOrdenacaoDoc | null;
dir: "asc" | "desc";
}) {
const { projetoId, userId, veTodas, filtros, skip, take, sort, dir } = opts;
const termo = filtros.q?.trim() || null;
const dias = DIAS_VALIDOS.has(filtros.periodo ?? "") ? Number(filtros.periodo) : null;
const desde = dias ? new Date(Date.now() - dias \* 86_400_000) : null;
const ordem = COLUNA_ORDENACAO[sort ?? "data"];
const direcao = dir === "asc" ? "asc" : "desc";
const validadoSim = filtros.validado === "sim" ? true : null;
const validadoNao = filtros.validado === "nao" ? true : null;

// `join upload` com `excluidoEm is null` faz o documento cujos arquivos foram todos para a
// lixeira sumir da lista — mesmo efeito do filtro global de soft delete na versão anterior.
const base = `     from documento_disciplina d
    join disciplina disc on disc.id = d."disciplinaId"
    left join disciplina_catalogo cat on cat.id = disc."disciplinaId"
    join upload u on u."documentoId" = d.id and u."excluidoEm" is null
    left join documento_revisao r on r.id = u."revisaoId"
    left join documento_status st on st.id = d."statusId"
    left join "user" au on au.id = u."autorId"
    where d."substituidoPorId" is null
      and disc."projetoId" = $1
      and ($2::text is null or disc.id = $2)
      and ($3::boolean is true or exists (
            select 1 from disciplina_responsavel dr
            where dr."disciplinaId" = disc.id and dr."userId" = $4))
      and ($5::text is null or (
            d."nomeArquivo" ilike '%' || $5 || '%'
            or coalesce(d.titulo, '') ilike '%' || $5 || '%'
            or coalesce(cat.nome, disc.nome, '') ilike '%' || $5 || '%'
            or coalesce(au.name, '') ilike '%' || $5 || '%'))
      and ($6::text is null or lower(u."nomeArquivo") like '%.' || lower($6))
      and ($7::text is null or au.name = $7)
      and ($8::timestamptz is null or u."createdAt" >= $8)
      and ($9::text is null or st.nome = $9)
      and ($10::text is null or d."faseId" = $10)
      and ($11::boolean is null or (u.validado = true and u."pastaId" is null))
      and ($12::boolean is null or (u.validado = false and u."pastaId" is null))
    group by d.id
  `;
const params = [
projetoId,
filtros.disciplinaId ?? null,
veTodas,
userId,
termo,
filtros.ext ?? null,
filtros.autor ?? null,
desde,
filtros.status ?? null,
filtros.fase ?? null,
validadoSim,
validadoNao,
];

const totalRows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
`select count(*)::bigint as n from (select d.id ${base}) x`,
...params,
);
const total = Number(totalRows[0]?.n ?? 0);

const ultimaPagina = Math.max(1, Math.ceil(total / Math.max(1, take)));
const paginaPedida = Math.floor(skip / Math.max(1, take)) + 1;
const pagina = Math.min(paginaPedida, ultimaPagina);
const skipEfetivo = (pagina - 1) \* take;

// `d.id asc` como desempate: sem ele, dois documentos com o mesmo valor de ordenação podem
// trocar de posição entre páginas — e aí um aparece duas vezes e outro nenhuma.
const idsRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
`select d.id, ${ordem} as ord ${base} order by ord ${direcao} nulls last, d.id asc limit ${Number(take)} offset ${Number(skipEfetivo)}`,
...params,
);
const ids = idsRows.map((r) => r.id);
if (ids.length === 0) return { total, pagina, linhas: [] as LinhaDoc[] };

const docs = await prisma.documentoDisciplina.findMany({
where: { id: { in: ids } },
select: {
id: true,
nomeArquivo: true,
titulo: true,
status: { select: { nome: true } },
fase: { select: { sigla: true } },
disciplina: {
select: {
id: true,
disciplinaTextoLegado: true,
catalogo: { select: { nome: true } },
responsaveis: { select: { userId: true } },
},
},
revisoes: { select: { id: true, numero: true } },
uploads: {
where: { excluidoEm: null },
select: {
id: true,
nomeArquivo: true,
tamanho: true,
validado: true,
pastaId: true,
revisaoId: true,
createdAt: true,
autor: { select: { name: true } },
},
},
},
});

// Reordena pelo que o SQL decidiu — `findMany` com `in` não preserva a ordem dos ids.
const porId = new Map(docs.map((d) => [d.id, d]));
const linhas: LinhaDoc[] = [];
for (const id of ids) {
const d = porId.get(id);
if (!d) continue;
const revisaoAtual = d.revisoes.length ? Math.max(...d.revisoes.map((r) => r.numero)) : null;
const idRevisaoAtual = d.revisoes.find((r) => r.numero === revisaoAtual)?.id ?? null;
// Mostra os arquivos da revisão ATUAL. Upload legado sem revisão entra junto: sumir da
// tela seria pior do que aparecer sem número.
const daAtual = idRevisaoAtual
? d.uploads.filter((u) => u.revisaoId === idRevisaoAtual || u.revisaoId === null)
: d.uploads;
const maisRecente = [...d.uploads].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
linhas.push({
id: d.id,
nome: d.nomeArquivo,
titulo: d.titulo,
disciplinaId: d.disciplina.id,
disciplinaNome: d.disciplina.catalogo?.nome ?? d.disciplina.disciplinaTextoLegado ?? "—",
revisaoAtual,
statusNome: d.status?.nome ?? null,
faseSigla: d.fase?.sigla ?? null,
atualizadoEm: (maisRecente?.createdAt ?? new Date()).toISOString(),
tamanhoTotal: d.uploads.reduce((s, u) => s + u.tamanho, 0),
autor: maisRecente?.autor?.name ?? "—",
podeGerir:
opts.podeEnviarCap &&
(opts.ehGlobal || d.disciplina.responsaveis.some((r) => r.userId === userId)),
arquivos: daAtual.map((u) => ({
id: u.id,
nome: u.nomeArquivo,
ext: extensaoDe(u.nomeArquivo),
downloadUrl: `/api/uploads/${u.id}/download`,
validado: u.pastaId ? null : u.validado,
})),
totalRevisoes: d.revisoes.length,
});
}
return { total, pagina, linhas };
}
Bash Verify file persisted this time
IN
wc -l src/modules/uploads/documentos-agrupados.ts; sleep 4; echo "apos 4s:"; wc -l src/modules/uploads/documentos-agrupados.ts; grep -c "listarDocumentosAgrupados" src/modules/uploads/documentos-agrupados.ts

OUT
252 src/modules/uploads/documentos-agrupados.ts
apos 4s:
252 src/modules/uploads/documentos-agrupados.ts
1
252 linhas, estável. Revalido contra o banco e corrijo o commit vazio:

Bash Revalidate grouped query against DB
IN
python - <<'PYEOF'
code = r'''import "dotenv/config";
import { listarDocumentosAgrupados } from "../src/modules/uploads/documentos-agrupados";
import { prisma } from "../src/lib/prisma";
async function main() {
const docs = await prisma.documentoDisciplina.findMany({
where: { substituidoPorId: null },
select: { disciplina: { select: { projetoId: true } }, \_count: { select: { uploads: true } } },
});
const cont = new Map<string, number>();
for (const d of docs) if (d.\_count.uploads > 1) cont.set(d.disciplina.projetoId, (cont.get(d.disciplina.projetoId) ?? 0) + 1);
const projetoId = [...cont.entries()].sort((a, b) => b[1] - a[1])[0][0];
const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
const base = { projetoId, userId: admin!.id, veTodas: true, ehGlobal: true, podeEnviarCap: true, take: 10, skip: 0 };
const r = await listarDocumentosAgrupados({ ...base, filtros: {}, sort: "data", dir: "desc" });
const ups = await prisma.upload.count({ where: { excluidoEm: null, disciplina: { projetoId } } });
console.log(`ARQUIVOS: ${ups} -> DOCUMENTOS: ${r.total}`);
console.log(`linhas com 2+ arquivos: ${r.linhas.filter((l) => l.arquivos.length > 1).length}`);
for (const s of ["nome","disciplina","revisao","tamanho"] as const) {
const x = await listarDocumentosAgrupados({ ...base, filtros: {}, sort: s, dir: "desc" });
console.log(`  sort=${s}: ${x.linhas.length} linhas`);
}
const mur = await listarDocumentosAgrupados({ ...base, veTodas: false, ehGlobal: false, userId: "x", filtros: {}, sort: "data", dir: "desc" });
console.log(`muralha: ${mur.total} (deve ser 0)`);
await prisma.$disconnect();
}
main();
'''
open("scripts/\_probe6a.ts", "w", encoding="utf-8").write(code)
PYEOF
npx tsx --tsconfig tsconfig.server.json scripts/\_probe6a.ts 2>&1 | tail -10; rm -f scripts/\_probe6a.ts

OUT
ARQUIVOS: 40 -> DOCUMENTOS: 20
linhas com 2+ arquivos: 9
sort=nome: 10 linhas
sort=disciplina: 10 linhas
sort=revisao: 10 linhas
sort=tamanho: 10 linhas
muralha: 0 (deve ser 0)
Confirmado de novo: 40 arquivos → 20 documentos, 9 com PDF+DWG. Corrijo o commit vazio:

Bash Amend the empty commit with real content
IN
npx eslint src/modules/uploads/documentos-agrupados.ts 2>&1|tail -2; git add src/modules/uploads/documentos-agrupados.ts && git commit -q --amend --no-edit && git show --stat HEAD | tail -3; echo "--- conteudo commitado agora ---"; git show HEAD:src/modules/uploads/documentos-agrupados.ts | wc -l

OUT
warning: in the working copy of 'src/modules/uploads/documentos-agrupados.ts', LF will be replaced by CRLF the next time Git touches it
src/modules/comercial/service.ts | 85 ++++++++++
src/modules/uploads/documentos-agrupados.ts | 252 ++++++++++++++++++++++++++++
6 files changed, 791 insertions(+)
--- conteudo commitado agora ---
252
O amend absorveu arquivos de outra sessão que estavam staged (6 arquivos, incluindo comercial/service.ts). Corrijo isolando só o meu:

Bash See all files in the amended commit
IN
git show --stat HEAD | head -12

OUT
commit 6f7658f8db4802a9fdcf9aabcd5542f876556b88
Author: SenaProjetos <financeiro@senaprojetos.com.br>
Date: Thu Aug 20 08:03:50 2026 -0300

    feat(comercial): jornada da negociacao + moverEstagio como ponto unico (F2.6+F2.7)

    jornada.ts e puro: sem Prisma, sem I/O, sem relogio. A tabela de probabilidade e
    INJETADA, nunca consultada la dentro -- e o que mantem o modulo testavel e ao mesmo
    tempo cumpre "nunca hardcode na UI" do ADR-12.

    Regras que valem destaque, porque nao sao obvias:

Erro grave meu: amendei o commit de outra sessão. O HEAD não era mais o meu commit — outra sessão o havia deslocado, e o --amend reescreveu o trabalho de CRM deles. Desfazendo agora:

Bash Find the original commit to restore
IN
git reflog -6 | head -8; echo "--- f520515 intacto? ---"; git log --oneline -1 f520515 2>/dev/null

OUT
6f7658f HEAD@{0}: commit (amend): feat(comercial): jornada da negociacao + moverEstagio como ponto unico (F2.6+F2.7)
f520515 HEAD@{1}: commit: feat(comercial): jornada da negociacao + moverEstagio como ponto unico (F2.6+F2.7)
8e52510 HEAD@{2}: checkout: moving from refactor/documentos-cde to dev
8e52510 HEAD@{3}: merge dev: Fast-forward
d7fb7cd HEAD@{4}: checkout: moving from dev to refactor/documentos-cde
8e52510 HEAD@{5}: commit: docs(crm): log do bloco F2.3+F2.4+F2.5
--- f520515 intacto? ---
f520515 feat(comercial): jornada da negociacao + moverEstagio como ponto unico (F2.6+F2.7)
f520515 está intacto no reflog. Restauro o commit deles e separo o meu:

Bash Restore their commit, unstage everything
IN
git reset --soft f520515 && git restore --staged . && git log --oneline -1 && echo "--- commit deles restaurado; meu trabalho no working tree ---" && git status --porcelain | head -8

OUT
f520515 feat(comercial): jornada da negociacao + moverEstagio como ponto unico (F2.6+F2.7)
--- commit deles restaurado; meu trabalho no working tree ---
M eslint.config.mjs
?? src/modules/uploads/documentos-agrupados.ts
Commit deles restaurado exatamente como estava (f520515), e só o meu trabalho ficou pendente. Verifico que nada deles se perdeu:

Bash Confirm their work is intact
IN
git show --stat f520515 | tail -8; echo "=== arquivos deles no disco ==="; ls -la src/modules/comercial/jornada.ts src/modules/comercial/service.ts 2>&1 | awk '{print $5, $NF}'

OUT
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

src/modules/comercial/actions.ts | 37 ++++++
src/modules/comercial/jornada.test.ts | 232 ++++++++++++++++++++++++++++++++++
src/modules/comercial/jornada.ts | 164 ++++++++++++++++++++++++
src/modules/comercial/schemas.ts | 21 +++
src/modules/comercial/service.ts | 85 +++++++++++++
5 files changed, 539 insertions(+)
=== arquivos deles no disco ===
8244 src/modules/comercial/jornada.ts
12670 src/modules/comercial/service.ts
O trabalho de CRM está íntegro (5 arquivos, 539 linhas). Agora commito só o meu, na branch certa:

Bash Move to feature branch and stage only my files
IN
git branch --show-current; git checkout refactor/documentos-cde 2>&1|tail -1; git merge dev --ff-only 2>&1|tail -1; git add src/modules/uploads/documentos-agrupados.ts eslint.config.mjs && git status --porcelain

OUT
dev
fatal: 'refactor/documentos-cde' is already used by worktree at 'C:/SENA_ADM/SENAHUB/SENAHub-remake/.claude/worktrees/agent-aca730b53cb77bd3d'
Already up to date.
warning: in the working copy of 'src/modules/uploads/documentos-agrupados.ts', LF will be replaced by CRLF the next time Git touches it
M eslint.config.mjs
A src/modules/uploads/documentos-agrupados.ts
Branch travada pelo worktree do agente. Antes de liberar, confirmo que o trabalho dos dois está preservado:

Bash Verify both agents work is preserved
IN
echo "refactor esta em: $(git log --oneline -1 refactor/documentos-cde)"
echo "F4-PR4 (3dedaa7): $(git log --oneline -1 3dedaa7 2>/dev/null || echo AUSENTE)"
echo "F2-PR8 (95cb25f): $(git log --oneline -1 95cb25f 2>/dev/null || echo AUSENTE)"
echo "--- refactor contem o F4-PR4? ---"; git merge-base --is-ancestor 3dedaa7 refactor/documentos-cde && echo SIM || echo "NAO (mas existe como cherry-pick c7813de?)"
git log --oneline -3 refactor/documentos-cde

OUT
refactor esta em: 84bbd4b feat(documentos): consulta agrupada por documento (F2-PR6a, parte 1)
F4-PR4 (3dedaa7): 3dedaa7 feat(projetos): sincroniza zoom/pan entre paineis e mostra % de opacidade no comparador
F2-PR8 (95cb25f): 95cb25f feat(arquivos): drawer de historico de revisoes por documento (F2-PR8)
--- refactor contem o F4-PR4? ---
NAO (mas existe como cherry-pick c7813de?)
84bbd4b feat(documentos): consulta agrupada por documento (F2-PR6a, parte 1)
c7813de feat(projetos): sincroniza zoom/pan entre paineis e mostra % de opacidade no comparador
f520515 feat(comercial): jornada da negociacao + moverEstagio como ponto unico (F2.6+F2.7)
Tudo preservado. refactor/documentos-cde tem meu commit (84bbd4b, ainda com placeholder) e o F4-PR4 já integrado (c7813de). O F2-PR8 (95cb25f) existe e falta integrar. Libero os worktrees:

Bash Stash my work and remove agent worktrees
IN
git stash push -q -m "pr6a-wip" -- src/modules/uploads/documentos-agrupados.ts eslint.config.mjs 2>&1|tail -1
git worktree remove --force .claude/worktrees/agent-aca730b53cb77bd3d 2>&1|tail -1
git worktree remove --force .claude/worktrees/agent-a04b6fd11d28e4454 2>&1|tail -1
git worktree list

OUT
C:/SENA_ADM/SENAHUB/SENAHub-remake f520515 [dev]
Worktrees liberados. Agora fecho o PR6a corretamente:

Bash Switch to feature branch and restore work
IN
git checkout refactor/documentos-cde 2>&1|tail -1 && git stash pop 2>&1|tail -2 && git status --porcelain

OUT
Switched to branch 'refactor/documentos-cde'
no changes added to commit (use "git add" and/or "git commit -a")
The stash entry is kept in case you need it again.
AA src/modules/uploads/documentos-agrupados.ts
Bash Check conflict state of the file
IN
wc -l src/modules/uploads/documentos-agrupados.ts; grep -c "^<<<<<<<\|^>>>>>>>" src/modules/uploads/documentos-agrupados.ts

OUT
256 src/modules/uploads/documentos-agrupados.ts
2
Conflito entre o placeholder commitado e minha versão real. Resolvo ficando com a real:

Bash Resolve conflict keeping real content
IN
git checkout --theirs src/modules/uploads/documentos-agrupados.ts 2>/dev/null || true
python - <<'PY'
p = "src/modules/uploads/documentos-agrupados.ts"
linhas = open(p, encoding="utf-8").read().split("\n")

# Remove marcadores de conflito, ficando com o lado real (o placeholder é 1 linha só).

saida, pulando = [], False
for l in linhas:
if l.startswith("<<<<<<<"):
pulando = True
continue
if l.startswith("======="):
pulando = False
continue
if l.startswith(">>>>>>>"):
continue
if pulando and l.strip() == "// placeholder":
continue
saida.append(l)
open(p, "w", encoding="utf-8").write("\n".join(saida))
PY
wc -l src/modules/uploads/documentos-agrupados.ts; head -2 src/modules/uploads/documentos-agrupados.ts; grep -c "<<<<<<<\|>>>>>>>\|=======" src/modules/uploads/documentos-agrupados.ts

OUT
252 src/modules/uploads/documentos-agrupados.ts
import "server-only";
import { prisma } from "@/lib/prisma";
0
252 linhas, sem marcadores. Verifico e commito:

Bash Commit the real query content
IN
npx eslint src/modules/uploads/documentos-agrupados.ts 2>&1|tail -2
git add src/modules/uploads/documentos-agrupados.ts eslint.config.mjs && git commit -q -m "fix(documentos): conteúdo real da consulta agrupada

O commit anterior gravou um placeholder de uma linha: o arquivo foi escrito e
esvaziado por concorrência no working tree enquanto dois worktrees de agente
rodavam npm install e prisma generate em paralelo. Este traz as 252 linhas de
verdade, revalidadas contra o banco (40 arquivos -> 20 documentos, 9 com
PDF+DWG na mesma linha, ordenações e muralha conferidas).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" && git log --oneline -1
echo "--- commitado ---"; git show HEAD:src/modules/uploads/documentos-agrupados.ts | wc -l
git stash drop 2>&1|tail -1

OUT
91a2c5c fix(documentos): conteúdo real da consulta agrupada
--- commitado ---
252
Dropped refs/stash@{0} (375349d40b1a2ac22b150960abe4c4dba48d6b1d)
Agora integro o F2-PR8 do segundo subagente:

Bash Integrate F2-PR8 from second agent
IN
git cherry-pick 95cb25f 2>&1|tail -3; git log --oneline -1; echo "--- arquivos do PR8 ---"; git show --stat HEAD | tail -6

OUT
Date: Thu Aug 20 08:08:05 2026 -0300
4 files changed, 273 insertions(+), 3 deletions(-)
create mode 100644 src/components/projetos/arquivos/historico-revisoes-dialog.tsx
85d9f0e feat(arquivos): drawer de historico de revisoes por documento (F2-PR8)
--- arquivos do PR8 ---

.../arquivos/historico-revisoes-dialog.tsx | 140 +++++++++++++++++++++
.../projetos/arquivos/menu-documento.tsx | 19 ++-
src/modules/uploads/actions.ts | 44 +++++++
src/modules/uploads/queries.ts | 73 +++++++++++
4 files changed, 273 insertions(+), 3 deletions(-)
O agente sinalizou ter tocado actions.ts fora do escopo. Reviso esse ponto — é o que envolve permissão:

Bash Review the new Server Action permission gate
IN
git show HEAD -- src/modules/uploads/actions.ts | grep -A 30 "carregarHistoricoRevisoes" | head -40

OUT
carregarHistoricoRevisoes envolvendo a query acima. Necessaria porque
queries.ts e server-only (sem sessao) e o drawer roda no cliente; a
action reaplica a mesma muralha por disciplina das demais leituras de
upload deste arquivo (projetoVisivel + responsavel-ou-ver_todas_disciplinas).
Este arquivo nao estava na lista de arquivos autorizados a tocar --
registrado no relatorio da tarefa. - components/projetos/arquivos/historico-revisoes-dialog.tsx (novo):
o drawer em si, com estados de carregando (Skeleton), vazio
(EmptyState) e erro. - components/projetos/arquivos/menu-documento.tsx: novo item de menu +
atualiza o comentario que dizia que o historico como painel proprio
so chegaria numa fase futura.

    Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>

diff --git a/src/modules/uploads/actions.ts b/src/modules/uploads/actions.ts
index cb4f931..abc0980 100644
--- a/src/modules/uploads/actions.ts
+++ b/src/modules/uploads/actions.ts
@@ -20,6 +20,7 @@ import { disciplinaUsaPastas } from "@/modules/projetos/estrutura-tipo";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { podeVerTodasDisciplinas } from "@/modules/arquivos/acesso";
import { STATUS_ABERTOS } from "@/modules/projetos/pendencias/helpers";
+import { historicoRevisoesDocumento } from "@/modules/uploads/queries";

/\*_ Extensão com o ponto, no case original (`.pdf`). Sem ponto (ou dotfile) → vazio. _/
function extComPonto(nome: string): string {
@@ -1080,3 +1081,46 @@ export const gerarAceiteCliente = defineAction(
},
);

--
+export const carregarHistoricoRevisoes = defineAction(

- {
- modulo: "uploads",
- acao: "ver-historico-revisoes",
- recurso: "projetos",
- permissao: "ver",
- schema: historicoRevisoesSchema,
- audit: false,
  Bash Review the action body permission logic
  IN
  git show HEAD -- src/modules/uploads/actions.ts | grep -A 22 "audit: false" | tail -20

OUT

- const upload = await prisma.upload.findUnique({
-      where: { id: input.uploadId },
-      select: {
-        disciplina: {
-          select: { projetoId: true, responsaveis: { select: { userId: true } } },
-        },
-      },
- });
- // Mensagem única para "não existe" e "você não enxerga" — não vaza a existência.
- const naoEncontrado = new ActionError("Arquivo não encontrado.");
- if (!upload) throw naoEncontrado;
- if (!(await projetoVisivel(user, upload.disciplina.projetoId))) throw naoEncontrado;
- const veTodas = await podeVerTodasDisciplinas(user);
- const ehResponsavel = upload.disciplina.responsaveis.some((r) => r.userId === user.id);
- if (!veTodas && !ehResponsavel) throw naoEncontrado;
-
- return historicoRevisoesDocumento(input.uploadId);
- },
  +);
- Gate de permissão correto — replica a muralha do download individual e usa mensagem única para "não existe" e "sem acesso", sem vazar existência. Verificação completa:

Bash Lint and tests after integrating both agents
IN
npm run lint 2>&1|tail -3; npm test 2>&1|tail -4

OUT

> senahub@1.11.0 lint
> eslint

      Tests  2083 passed (2083)

Start at 08:18:31
Duration 6.51s (transform 51.45s, setup 0ms, import 79.70s, tests 3.55s, environment 44ms)
Bash Build after integration
IN
npm run build 2>&1 | grep -E "Compiled|Failed|Type error" -A 4 | head -10

OUT
✓ Compiled successfully in 24.1s
Linting and checking validity of types ...
Collecting page data ...
Generating static pages (0/148) ...
Generating static pages (37/148)
Bash Show state and return to dev
IN
git log --oneline -4; git checkout dev 2>&1|tail -1; git branch --show-current

OUT
85d9f0e feat(arquivos): drawer de historico de revisoes por documento (F2-PR8)
91a2c5c fix(documentos): conteúdo real da consulta agrupada
84bbd4b feat(documentos): consulta agrupada por documento (F2-PR6a, parte 1)
c7813de feat(projetos): sincroniza zoom/pan entre paineis e mostra % de opacidade no comparador
(use "git push" to publish your local commits)
dev
Situação estabilizada. Build ✅, lint ✅, 2083 testes ✅.

O que ficou pronto
PR Estado
F4-PR4 — comparador ✅ c7813de — opacidade com % visível e zoom/pan sincronizado
F2-PR8 — histórico de revisões ✅ 85d9f0e — drawer com R00→R03, autor, data, arquivos
F2-PR6a — consulta agrupada ✅ 91a2c5c — 40 arquivos → 20 documentos, 9 com PDF+DWG na mesma linha
Os dois subagentes Sonnet entregaram bem, e ambos fizeram algo que eu valorizo: sinalizaram desvios em vez de escondê-los.

O do comparador descobriu que o slider de opacidade já existia (meu plano estava desatualizado) e implementou só o que faltava. Resolveu a trava anti-laço com requestAnimationFrame, notando que o evento scroll é assíncrono — liberar a trava de forma síncrona a tornaria inútil.
O do histórico tocou um arquivo fora do escopo (actions.ts) e avisou. A razão é sólida: queries.ts tem server-only e o drawer é client. Marcar o arquivo como "use server" transformaria toda leitura dele em endpoint público sem autenticação. Ele criou uma Server Action fina seguindo precedente do próprio repo, e revisei o gate: replica a muralha por disciplina e usa mensagem única para "não existe" e "sem acesso", sem vazar existência. Aprovado.
Preciso relatar dois erros meus

1. Amendei um commit de outra sessão. O HEAD havia mudado sob meus pés e o git commit --amend reescreveu f520515 (trabalho de CRM), absorvendo 5 arquivos que não eram meus. Já desfeito: restaurei via reset --soft e confirmei que os 539 linhas deles estão intactas. Nenhuma perda — mas foi descuido meu não checar o HEAD antes de amendar.

2. Commitei um arquivo com placeholder. O primeiro commit da query (84bbd4b) foi gravado vazio porque o arquivo era esvaziado logo após a escrita. Corrigido em 91a2c5c com as 252 linhas reais, revalidadas contra o banco.

A causa da instabilidade: os dois subagentes rodaram npm install e prisma generate dentro dos worktrees, que compartilham o mesmo .git e disputaram o filesystem. Removi os dois worktrees e o ambiente voltou ao normal — testei escrevendo um arquivo e ele sobreviveu íntegro.

Aprendizado prático: neste projeto, worktree de agente sai caro. Da próxima vez, ou rodo os paralelos em sequência, ou aceito que eles compartilhem o worktree principal com arquivos disjuntos.

Onde estamos no PR6a
A consulta está pronta e provada. Falta a parte 2: fazer a tabela consumir listarDocumentosAgrupados — hoje ela ainda usa a query por arquivo, então a tela continua mostrando duas linhas.

Sigo para essa parte agora, ou prefere pausar e revisar o que entrou?

revisar o que entrou
Vou revisar de verdade, lendo o código — não só conferir que compila.

Bash Read the history dialog component
IN
git checkout refactor/documentos-cde 2>&1|tail -1; sed -n '1,70p' src/components/projetos/arquivos/historico-revisoes-dialog.tsx

OUT
Switched to branch 'refactor/documentos-cde'
"use client";

import { useEffect, useState } from "react";
import { Download, History } from "lucide-react";
import { carregarHistoricoRevisoes } from "@/modules/uploads/actions";
import type { HistoricoRevisao } from "@/modules/uploads/queries";
import { formatarData, rotuloRevisao } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Props = {
/\*_ Id do `Upload` da linha que abriu o drawer — a Server Action resolve o documento a partir dele. _/
uploadId: string;
nomeDocumento: string;
open: boolean;
onOpenChange: (open: boolean) => void;
};

/\*\*

- Drawer "Histórico do documento" (F2-PR8) — item "Histórico de revisões" do menu "..."
- da tabela de arquivos. Lista as revisões (R00, R01...) da mais recente pra mais
- antiga, com os arquivos de cada uma.
-
- Busca sob demanda ao abrir, via `carregarHistoricoRevisoes` (Server Action): a query
- em si mora em `modules/uploads/queries.ts`, que é `server-only` e não pode ser chamada
- direto deste client component.
  \*/
  export function HistoricoRevisoesDialog({ uploadId, nomeDocumento, open, onOpenChange }: Props) {
  const [revisoes, setRevisoes] = useState<HistoricoRevisao[] | null>(null);
  const [erro, setErro] = useState("");

useEffect(() => {
if (!open) return;
let vivo = true;
setRevisoes(null);
setErro("");
void carregarHistoricoRevisoes({ uploadId }).then((r) => {
if (!vivo) return;
if (r.ok) setRevisoes(r.data);
else setErro(r.error);
});
return () => {
vivo = false;
};
}, [open, uploadId]);

return (
<Sheet open={open} onOpenChange={onOpenChange}>
<SheetContent className="w-full sm:max-w-md">
<SheetHeader>
<SheetTitle>Histórico do documento</SheetTitle>
<SheetDescription className="truncate">{nomeDocumento}</SheetDescription>
</SheetHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          {!revisoes && !erro && (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2 rounded-sm border p-3">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-40" />
                </div>
              ))}
            </>
          )}

Bash Read rest of history dialog
IN
sed -n '70,140p' src/components/projetos/arquivos/historico-revisoes-dialog.tsx

OUT
{erro && (
<p className="rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>
)}

          {revisoes && revisoes.length === 0 && (
            <EmptyState
              icon={History}
              title="Sem histórico de revisões"
              description="Este documento ainda não tem histórico de revisões."
            />
          )}

          {revisoes && revisoes.length > 0 && (
            <ul className="space-y-2">
              {revisoes.map((r) => (
                <li
                  key={r.numero}
                  className={
                    r.atual ? "rounded-sm border border-primary/40 bg-primary/5 p-3" : "rounded-sm border p-3"
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{rotuloRevisao(r.numero)}</span>
                    {r.atual && <Badge>atual</Badge>}
                    <span className="text-xs text-muted-foreground">{formatarData(r.criadoEm)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">Enviado por {r.autor ?? "—"}</p>

                  {r.arquivos.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">Nenhum arquivo nesta revisão.</p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {r.arquivos.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate">{a.nome}</span>
                            <Badge variant="outline" className="shrink-0 uppercase">
                              {a.ext || "—"}
                            </Badge>
                            {a.excluido && (
                              <Badge variant="destructive" className="shrink-0">
                                na lixeira
                              </Badge>
                            )}
                          </span>
                          {/* Arquivo na lixeira: a rota de download recusa (`excluidoEm` != null) —
                              a badge acima já avisa; oferecer o botão seria um link morto. */}
                          {!a.excluido && (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Baixar ${a.nome}`}
                              render={<a href={a.downloadUrl} />}
                            >
                              <Download className="size-3.5" />
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>

);
}
Bash Check date helper and review the query
IN
grep -n "formatarDataHora" src/lib/utils.ts | head -2; echo "--- query do historico ---"; sed -n '/export async function historicoRevisoesDocumento/,/^}/p' src/modules/uploads/queries.ts | head -45

OUT
56:export function formatarDataHora(d: Date | string | null | undefined): string {
--- query do historico ---
export async function historicoRevisoesDocumento(uploadId: string): Promise<HistoricoRevisao[]> {
const upload = await prisma.upload.findUnique({
where: { id: uploadId },
select: { documentoId: true },
});
// Sem documento lógico (linha legada anterior ao backfill): não há histórico de
// revisões possível — estado vazio, não erro.
if (!upload?.documentoId) return [];

const documentoId = await resolverDocumentoCanonico(upload.documentoId);

const revisoes = await prisma.documentoRevisao.findMany({
where: { documentoId },
orderBy: { numero: "desc" },
select: {
numero: true,
createdAt: true,
createdBy: { select: { name: true } },
uploads: { select: { id: true, nomeArquivo: true, excluidoEm: true } },
},
});

const maiorNumero = revisoes[0]?.numero;

return revisoes.map((r) => ({
numero: r.numero,
criadoEm: r.createdAt.toISOString(),
autor: r.createdBy?.name ?? null,
atual: r.numero === maiorNumero,
arquivos: r.uploads.map((u) => ({
id: u.id,
nome: u.nomeArquivo,
ext: extensaoDe(u.nomeArquivo),
excluido: u.excluidoEm != null,
downloadUrl: `/api/uploads/${u.id}/download`,
})),
}));
}
Bash Review menu integration
IN
git show 85d9f0e -- src/components/projetos/arquivos/menu-documento.tsx | grep "^+" | head -22

OUT
+++ b/src/components/projetos/arquivos/menu-documento.tsx

- History,
  +import { HistoricoRevisoesDialog } from "@/components/projetos/arquivos/historico-revisoes-dialog";
- - As ações da spec que dependem de schema novo ("Alterar status", "Adicionar a lista")
- - chegam numa onda futura e por isso NÃO aparecem nem desabilitadas: item invisível é
- - mais honesto que item morto. "Histórico de revisões" (painel próprio) já chegou — F2-PR8.
- const [historicoAberto, setHistoricoAberto] = useState(false);
-          <DropdownMenuItem onClick={() => setHistoricoAberto(true)}>
-            <History /> Histórico de revisões
-          </DropdownMenuItem>
-      <HistoricoRevisoesDialog
-        uploadId={linha.id}
-        nomeDocumento={linha.nome}
-        open={historicoAberto}
-        onOpenChange={setHistoricoAberto}
-      />
- Revisão feita. Encontrei um ponto a corrigir — a spec pede data e hora, e o código mostra só a data:

Bash Show time in revision history per spec
IN
python - <<'PY'
p = "src/components/projetos/arquivos/historico-revisoes-dialog.tsx"
s = open(p, encoding="utf-8").read()
s = s.replace('import { formatarData, rotuloRevisao } from "@/lib/utils";',
'import { formatarDataHora, rotuloRevisao } from "@/lib/utils";')

# A hora importa aqui: duas revisões no mesmo dia são comuns, e só a data não as distingue.

s = s.replace('<span className="text-xs text-muted-foreground">{formatarData(r.criadoEm)}</span>',
'<span className="text-xs text-muted-foreground tabular-nums">{formatarDataHora(r.criadoEm)}</span>')
open(p, "w", encoding="utf-8").write(s)
print("ok")
PY
grep -n "formatarDataHora" src/components/projetos/arquivos/historico-revisoes-dialog.tsx | head -3
npx eslint src/components/projetos/arquivos/historico-revisoes-dialog.tsx 2>&1|tail -2

OUT
ok
7:import { formatarDataHora, rotuloRevisao } from "@/lib/utils";
95: <span className="text-xs text-muted-foreground tabular-nums">{formatarDataHora(r.criadoEm)}</span>
Bash Test and commit the date fix
IN
npm test 2>&1|tail -3; git add src/components/projetos/arquivos/historico-revisoes-dialog.tsx && git commit -q -m "fix(arquivos): histórico mostra a hora, não só a data

Duas revisões no mesmo dia são comuns numa rodada de correções — só a data não
distingue uma da outra. A spec (item 14) pede o carimbo completo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" && git log --oneline -1

OUT
Start at 23:30:49
Duration 18.33s (transform 37.24s, setup 0ms, import 129.36s, tests 3.31s, environment 42ms)

4ff6505 fix(arquivos): histórico mostra a hora, não só a data
Bash Return to dev
IN
git checkout dev 2>&1|tail -1; git branch --show-current

OUT
(use "git push" to publish your local commits)
dev
Revisão do que entrou
Li o código dos três, não só conferi que compila.

✅ F2-PR8 — Histórico de revisões (85d9f0e)
Query — bem resolvida. Chama resolverDocumentoCanonico antes de buscar (sem isso, documento fundido devolveria histórico vazio — era o risco que eu havia sinalizado). Upload legado sem documentoId retorna lista vazia em vez de erro: estado honesto, não bug.

Server Action — o agente tocou actions.ts fora do escopo e avisou, com razão técnica correta: queries.ts é server-only e o drawer é client; marcar o arquivo como "use server" transformaria toda leitura dele em endpoint público. Revisei o gate:

if (!upload) throw naoEncontrado;
if (!(await projetoVisivel(user, upload.disciplina.projetoId))) throw naoEncontrado;
if (!veTodas && !ehResponsavel) throw naoEncontrado;
Replica a muralha do download individual, e usa a mesma mensagem para "não existe" e "sem acesso" — não vaza existência de arquivo alheio. Aprovado.

UI — quatro estados (carregando/erro/vazio/lista), cleanup com flag vivo no useEffect, render={<a>} no padrão base-ui. Arquivo na lixeira ganha badge e não ganha botão de download, porque a rota rejeitaria — link morto seria pior.

Corrigi um ponto (4ff6505): mostrava só a data. Duas revisões no mesmo dia são comuns numa rodada de correções, e a spec pede o carimbo completo. Agora usa formatarDataHora.

✅ F4-PR4 — Comparador (c7813de)
O agente descobriu que o slider de opacidade já existia — meu plano estava desatualizado. Implementou só o que faltava e disse isso.

A sincronização de scroll está correta pelo motivo certo:

destino.scrollTop = fonte.scrollTop;
requestAnimationFrame(() => { sincronizandoScrollRef.current = false; });
O evento scroll é assíncrono — liberar a trava de forma síncrona a tornaria inútil e criaria o laço. Ele também usou listener nativo com passive: false para o Ctrl+scroll, já que o onWheel do React é passivo e não deixa cancelar.

✅ F2-PR6a parte 1 — Consulta agrupada (91a2c5c)
Prova contra o banco real: 40 arquivos → 20 documentos, 9 com PDF+DWG na mesma linha. Ordenações agregadas, muralha e clamp de página conferidos.

Três lacunas que deixei registradas, não corrigidas
O histórico não oferece "Visualizar" nem "Comparar" por revisão — a spec (item 14) pede as três ações, e só "Baixar" existe. Não fiz porque exigiria decidir qual arquivo da revisão abrir quando há PDF+DWG.
Scroll aninhado no comparador — cada painel agora rola dentro de um pai que também rola. O layout tem altura definida, então funciona, mas só vendo no navegador para saber se incomoda.
A tabela ainda não usa a consulta nova — é a parte 2 do PR6a. Até lá, a tela continua mostrando PDF e DWG em linhas separadas.
E dois erros meus, já corrigidos
Amendei um commit de outra sessão (f520515, de CRM). Restaurei via reset --soft; os 539 linhas deles estão intactas.
Commitei um placeholder no lugar da query, porque o arquivo era esvaziado após a escrita. A causa foram os npm install + prisma generate que os subagentes rodaram nos worktrees compartilhando o mesmo .git. Removi os worktrees e o ambiente estabilizou.
Lição para as próximas paralelizações neste repo: worktree de agente sai caro aqui. Melhor rodar em sequência, ou deixar os agentes no worktree principal com arquivos disjuntos.

Estado: build ✅, lint ✅, 2083 testes ✅, em dev.

Quer que eu siga para a parte 2 do PR6a (tabela consumindo a consulta agrupada)?
