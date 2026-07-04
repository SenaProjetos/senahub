# Conselho Avaliativo — Arquitetura de Informação do Catálogo de Disciplinas

> Parecer de 3 profissionais de front-end sobre a melhor forma de organizar as informações
> da tela **Configurações → Disciplinas** (`src/components/configuracoes/disciplinas-catalogo-view.tsx`).
> Data: 2026-07-04.

## Estado avaliado (v1)

Tela em duas colunas lado a lado (Ativas agrupadas por categoria · Arquivadas em lista plana).
Cada linha: ícone pequeno + badge de sigla + nome + `Np` de uso + 3 botões (editar/arquivar/excluir).
Botão "Adicionar" no topo; diálogo com picker de ícone (galeria + upload SVG).

---

## Marina Alves — Líder de Design System / Arquitetura de Informação
*Lente: consistência com o resto do app, taxonomia governada, densidade tokenizada.*

1. **Duas colunas Ativas|Arquivadas desequilibram.** Arquivadas quase sempre serão poucas ou zero →
   metade da tela vazia enquanto as Ativas (o trabalho real) ficam em meia largura. As outras telas de
   config (`funil-etapas`, `modalidades`) usam painel único. Esta foge do padrão.
2. **Categoria é texto livre com `datalist`** → convida à divergência (`ELÉTRICA` vs `Elétrica` vs
   `Eletrica`) que cria grupos duplicados silenciosos. Taxonomia de agrupamento precisa ser governada.
3. **`ordem` existe no schema mas não há UI de reordenação.** Catálogo "configurável" que não reordena
   é meio-configurável.

**Recomenda:** painel único, seções de categoria, arquivadas atrás de toggle/disclosure.

## Rafael Nunes — Product Designer (UX)
*Lente: as tarefas reais do admin — achar, adicionar, aposentar, auditar uso.*

1. **`Np` é críptico.** Deve dizer `2 projetos` — e ser **clicável** → `/projetos?disciplina=…`.
   Quem vê "em uso em 2" quase sempre quer saber quais.
2. **Sem busca.** Ok para 11 itens; ruim quando crescer (o propósito da tela é deixar crescer).
3. **3 botões por linha = ruído.** Editar é a ação primária; arquivar/excluir são raras/perigosas.
   Ação primária visível, secundárias num menu "⋯".
4. **Falta sinal de qualidade do cadastro.** Disciplina sem sigla quebra a nomenclatura de arquivos
   silenciosamente — a tela deveria avisar "sem sigla".

**Recomenda:** barra com busca + filtro de categoria + toggle arquivadas; uso vira link; linha enxuta.

## Camila Torres — Engenheira Front-end sênior (perf + a11y)
*Lente: semântica, escala, teclado/leitores de tela, custo de implementação.*

1. **Botão excluir desabilitado dentro de `Tooltip` é frágil.** Melhor manter a ação acionável e
   explicar o bloqueio no diálogo de confirmação.
2. **Drag-and-drop é caro** (dnd-kit, sensores, persistência, a11y de teclado). Não pagar agora —
   começar com ordenação declarativa.
3. **Estrutura deveria ser tabela semântica**, não `<ul>` com flex: colunas alinhadas escaneiam e leem
   melhor. O projeto já tem `Table` e `sortable-head`.
4. **Escala:** busca client-side resolve antes de precisar virtualizar (~80+ itens).

**Recomenda:** `<Table>` com colunas fixas; ação primária + `DropdownMenu`; sem DnD na v1; bloqueio de
exclusão comunicado no confirm.

---

## Consenso

| # | Mudança | Por quê |
|---|---------|---------|
| 1 | **Painel único** (não 2 colunas); arquivadas atrás de toggle. | Ativas são o trabalho; arquivadas são exceção. |
| 2 | **Busca + filtro de categoria + toggle arquivadas.** | Catálogo foi feito pra crescer. |
| 3 | **Uso = `N projetos` clicável** → `/projetos?disciplina=…`. | "Quantos" vem com "quais". |
| 4 | **Linha enxuta:** ícone destacado · nome · sigla · categoria · uso-link · editar + menu ⋯. | Reduz ruído. |

**Divergência (tabela vs seções colapsáveis):** resolvida como tabela única com linhas de cabeçalho de
categoria — agrupamento sem perder alinhamento de colunas.

**Adiado (não fazer agora):** drag-and-drop de reordenação; categoria como entidade CRUD própria.

## Layout recomendado

```
┌─ Catálogo de Disciplinas ─────────────────────── [+ Adicionar] ┐
│ 🔎 Buscar…      Categoria ▾   ☐ Mostrar arquivadas            │
├───────────────────────────────────────────────────────────────┤
│  CIVIL                                                    (3)  │
│  ⛰  Terraplenagem        TER   CIVIL     2 proj.   ✎  ⋯        │
│  🛣  Pavimentação   ⚠sem sigla  CIVIL     —         ✎  ⋯        │
│  ELÉTRICA                                                 (5)  │
│  ⚡  Elétrico             ELE   ELÉTRICA  4 proj.   ✎  ⋯        │
└───────────────────────────────────────────────────────────────┘
```

## Faseamento

- **Fase A (implementada):** painel único + arquivadas em toggle; busca/filtro client-side; uso clicável
  (`N proj.`); ações em editar + `DropdownMenu`; badge "sem sigla"; tabela semântica.
- **Fase B (se pedirem):** reordenação (setas → depois DnD); categoria governada.
- **Fase C (escala):** virtualização só acima de ~80 itens.
