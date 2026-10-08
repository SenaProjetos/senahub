# Horas dos projetistas em gráficos — período livre, por projeto, comparação e "Minhas horas"

Data: 2026-10-07 · Status: rascunho para revisão do dono

## Ponto de partida

Já existe em produção (v1.13.0, commit 25db95a5) o cartão **"Horas por dia"** em RH → Produtividade
(`components/rh/horas-diarias-chart.tsx` + `horasDiariasProjetistas()` em `modules/rh/produtividade/queries.ts`):
linha por pessoa, últimos 14 dias fixos, no máximo 3 pessoas, só para `HR_ADMIN_ROLES`.

O dono pediu (2026-10-07) as quatro lacunas: escolher período, ver horas por projeto, comparar mais
gente e abrir para outro público. Este spec cobre as quatro.

## Decisões do dono (2026-10-07)

| # | Pergunta | Resposta |
|---|---|---|
| D1 | O que falta | Período, horas por projeto, comparar mais gente, outro público |
| D2 | Quem mais vê | O próprio projetista (só as próprias horas) + permissão fina nova; cliente nunca |
| D3 | Forma da comparação | Ranking de todos + linhas diárias de quem for selecionado |
| D4 | Onde o projetista vê | Aba "Minhas horas" no Ponto **e** card no Início que serve de atalho para a aba |
| D5 | Período longo | Sem teto. Até 92 dias o gráfico é diário; acima agrupa por semana sozinho, com aviso |

## 1. Dados — uma regra só

Novo arquivo **puro** `modules/rh/produtividade/horas.ts` (sem Prisma/server-only, com teste
`horas.test.ts`). Ele recebe as sessões já lidas e devolve a série:

```ts
type SessaoHoras = {
  userId: string; inicio: Date; fim: Date | null;
  tipoAlocacao: TipoAlocacaoPonto; projeto: { id: string; codigo: string; nome: string } | null;
};

// chave do destino: "p:<projetoId>" | "reunioes" (interna + externa) | "sem_projeto"
agregarHoras(sessoes, { de, ate, agora, userIds }): {
  dias: string[];                      // YYYY-MM-DD, de..ate inclusive
  destinos: Record<chave, rótulo>;     // projeto = "código · nome"
  pessoas: {                           // uma por userId pedido, mesmo com 0h
    userId: string;
    totalHoras: number;
    diasComRegistro: number;
    mediaPorDiaComRegistro: number;    // total ÷ diasComRegistro (0 quando nenhum)
    porDia: number[];                  // alinhado a `dias`
    porDestino: Record<chave, number[]>;
  }[];
}
```

Arrays e objetos simples (não `Map`) porque o resultado atravessa a fronteira RSC → cliente. Tipo
`projeto` sem projeto (dado ruim) conta como "Sem projeto", nunca some.

- A divisão de uma sessão pelos dias continua sendo `minutosPorDiaSessao` (`modules/ponto/engine.ts`):
  sessão que cruza meia-noite reparte, sessão aberta conta até `agora`. Dia = dia local de Brasília.
- Destino vem de `SessaoTrabalho.tipoAlocacao` + `projetoId` (mesma leitura do ponto/rateio).
- Arredondamento só na borda (1 casa), nunca dentro da soma.
- Funções puras de apresentação no mesmo arquivo, também testadas:
  - `bucketsDoPeriodo(dias, granularidade)` (em `periodo.ts`) + `somarPorBucket(valores, buckets)` — semana quebra na segunda, 1º bucket começa no 1º dia do período; usados quando o período passa de 92 dias.
  - `empilharPorDestino(pessoa, destinos, n = 5)` — os 5 projetos com mais horas no período; o resto de projeto vira
    "Outros projetos"; reuniões (interna + externa) viram "Reuniões"; e "Sem projeto" fica separado.

`horasDiariasProjetistas()` passa a ser `horasProjetistas({ de, ate, userIds? })` em `queries.ts`:
lê as sessões (com `projeto { codigo, nome }`) e chama `agregarHoras`. Público continua
`whereAudiencia("projeto_membro")` quando `userIds` não é passado. As duas telas e o card do Início
usam esta mesma função, então nunca mostram dois números diferentes para a mesma pessoa e o mesmo dia.

## 2. Período

- Atalhos: **7 dias · 14 dias (padrão) · 30 dias · mês atual · mês anterior**, mais **intervalo livre**
  (de / até).
- Na URL: `?de=AAAA-MM-DD&ate=AAAA-MM-DD`. Sem parâmetro = últimos 14 dias. Data inválida ou
  `de > ate` cai no padrão. `ate` depois de hoje é cortado em hoje (não há horas no futuro).
- Data antes de 2000 é inválida (revisão 2026-10-07: `?de=1000-01-01` montaria centenas de milhares de
  dias por pessoa). Uma regra só, `motivoIntervaloInvalido`, serve ao servidor e ao seletor: no intervalo
  livre o seletor mostra o motivo e desabilita "Aplicar", em vez de o servidor voltar calado aos 14 dias.
- **Sem teto** (D5). Até 92 dias o gráfico é dia a dia; acima de 92 dias o gráfico e a tabela agrupam
  por semana e o título mostra "por semana — período longo". Ranking e totais sempre valem para o
  período inteiro.
- A tabela de produtividade semana/mês que já existe na tela (`?g=`) segue independente deste período.

## 3. Tela RH → Produtividade

Substitui o cartão "Horas por dia" atual por um bloco com três partes:

1. **Seletor de período** (item 2).
2. **Ranking** — barras horizontais com todos os projetistas que têm horas no período, maior total
   primeiro. Cada linha: nome, perfil, barra, total, média por dia com registro, dias com registro.
   Clicar no nome seleciona/deseleciona para o gráfico (**até 5**; o sexto fica desabilitado com o
   motivo "Compare no máximo 5 projetistas").
   Menu de contexto (ADR-0002) com descritor puro `itensDoRankingDeHoras()` testado, o mesmo array no
   ⋯ da linha: **Comparar / Tirar da comparação**, **Ver por projeto** (seleciona só ela) e
   **Abrir espelho de ponto** (`/ponto/espelho?u=<id>`, omitido para quem não tem
   `ponto:espelho_equipe`).
3. **Gráfico diário**:
   - 2 a 5 selecionados → uma linha por pessoa (cores de `--chart-1..5`).
   - 1 selecionado → **barras empilhadas por destino** (top 5 projetos + Outros + Reuniões + Sem projeto).
   - Cada dia é focável e anuncia os valores (mesmo padrão de `fluxo-diario-chart.tsx`); embaixo, uma
     tabela com os mesmos números, para a leitura nunca depender da cor.
   - Período > 92 dias → mesma coisa, por semana.

O componente do gráfico fica em `components/rh/horas/` e é reaproveitado na aba do projetista.
Estados: sem horas no período → `EmptyState` dizendo o período; nenhum selecionado → frase pedindo
para escolher no ranking.

## 4. Acesso

- Permissão nova **`rh:produtividade`** (leitura): "Ver horas e produtividade dos projetistas",
  `abre: "Produtividade"`. Entra em `PERMISSOES_CATALOGO`, em `PERMISSOES_BASE` e numa **migration
  de dados** (modelo: `20260902120000_perfis_tarefas_ver`), senão nasce negada para todo mundo.
- A migration reproduz o acesso REAL de hoje — a página é `requireRole(HR_ADMIN_ROLES)` —, então
  concede aos perfis `coordenador` e `administrativo` (admin é bypass). `ON CONFLICT DO NOTHING`.
- Quem tem papel supervisor/administrativo num perfil PERSONALIZADO também abria a tela pelo papel:
  recebe exceção individual (`permissao_usuario`), não o perfil inteiro — conceder ao perfil ampliaria o
  acesso de outros papéis que o usam (revisão 2026-10-07).
- A tabela legada `Permissao` também ganha a linha para `supervisor`, porque o piso de sócio de
  `requirePermission` consulta `canRole("supervisor", …)` nela.
- Passam a exigir `rh:produtividade`: a página (`requirePermission("rh", "produtividade")`), o item
  do menu (hoje `rh:cadastro` — que o coordenador não tem, por isso o item sumia para ele mesmo com
  a página abrindo) e o export CSV `/api/rh/produtividade/export`.
- O rótulo de `rh:cadastro` deixa de citar "Produtividade" em `abre`.
- **Cliente nunca vê**: o portal não ganha nada, e `/ponto` já barra o papel `cliente`.

## 5. Projetista — "Minhas horas"

- **Aba nova no Ponto**: `/ponto/horas`, rótulo "Minhas horas", terceira aba do `PontoSubnav`.
  Mesmos papéis do Espelho. Sempre os dados do usuário logado — não aceita `?u=`.
  Mostra: seletor de período, total / média por dia com registro / dias com registro, e o gráfico em
  **barras por destino** com a tabela. Sem ranking, sem colegas.
- **Card no Início**: "Minhas horas · 14 dias" com o total e um `Sparkline` dos 14 dias, link para
  `/ponto/horas`. Aparece para `PROJETO_MEMBRO_ROLES` (CLT, estagiário, PJ, freelancer), ao lado dos
  KPIs do projetista. Sem horas no período → mostra "0h" e o link (não some, é atalho).

## 6. Fora do escopo

- Horas por **tarefa** (só projeto). A sessão tem `tarefaId`, mas fica para depois se o dono pedir.
- Meta/capacidade diária desenhada no gráfico (o "esperado" do ponto). Não pedido.
- Export do novo gráfico. O CSV atual continua sendo o da tabela semana/mês.

## 7. Testes e conferência

- `horas.test.ts`: sessão que cruza meia-noite, sessão aberta até `agora`, dia sem horas aparece com 0,
  destino de reunião/sem projeto, `empilharPorDestino` com 7 projetos (5 + Outros), média por dia com
  registro (0 quando nada), `bucketsDoPeriodo` + `somarPorBucket`, período com `ate` no futuro cortado.
- Teste do descritor `itensDoRankingDeHoras` (limite de 5, item de espelho omitido sem permissão).
- Teste de período (parse de `de`/`ate`, atalhos, corte em hoje).
- `npm run lint`, `npm test`, `npm run build`.
- Em tela: 390×844 sem rolagem horizontal; 1366×768 com menu aberto e o cabeçalho sem sobrepor a barra
  do topo; login de projetista vê só as próprias horas e não abre `/rh/produtividade`.
