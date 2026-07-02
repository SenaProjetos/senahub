---
titulo: Deliberação — Engenharia (Ferramentas)
descricao: Ata do Conselho sobre a galeria de ferramentas de engenharia.
resumo: Descobertas no registry (16 ferramentas, normas NBR, exportáveis) e decisão da documentação.
tags: [deliberação, conselho, ferramentas, engenharia, nbr]
palavras-chave: [deliberação, ata, ferramentas, cálculo, nbr, exportação]
sinonimos: [ata técnica]
---

# Deliberação — Engenharia (Ferramentas)

- **Data:** 2026-06-30
- **Funcionalidade:** `/ferramentas`.

## Participantes
Presidente, Iniciante, Experiente, UX, Backend, Frontend, QA, Negócios, Diretor,
Treinamento, Revisor Técnico, Arquiteto, Product Owner, Suporte.

## Descobertas (inspeção de código)
- `app/.../ferramentas/page.tsx`: exige `ferramentas:usar`; renderiza `GaleriaView`
  (registry importado no cliente).
- `modules/ferramentas/registry.ts`: **16 ferramentas** com `key` estável (= `entradasJson.ferramenta`,
  nunca renomear), `disciplina` (Universal/Estrutural/Fundações), `tipo` (rapida/completa),
  `norma` e `exportaveis` (pdf/docx/xlsx/dxf). Catálogo transcrito 1:1 na doc.
- CLAUDE.md: engines puros em `calc/`, desenhos em `dxf/`, memórias em `memoria/`, saves
  em `savefile.ts`/`auto-store.ts`.

## Questionamentos
- O cálculo é "oficial"? → é ferramenta de **apoio**; a doc inclui aviso de
  responsabilidade técnica (boa prática, não muda comportamento).
- Snapshots vinculam a projeto? → sim, via auto-store (CLAUDE.md); mencionado sem detalhar
  o fluxo de UI (não inspecionado a fundo).

## Opiniões dos Especialistas
- **Backend:** alertar que `key` é estável é interno; para o usuário, importa o **nome**
  e a **norma** — tabela por disciplina atende.
- **Diretor/Negócios:** o diferencial é a **norma de referência** por ferramenta —
  destacada em coluna.
- **QA:** incluir aviso de responsabilidade técnica e "confira a norma/versão".

## Discussão
Consenso: uma página única com o **catálogo completo** (por disciplina) + como usar +
exportação atende; aprofundar cada calculadora individualmente é fase futura.

## Divergências
Nenhuma.

## Decisão Final
- Publicada [ferramentas.md](../engenharia/ferramentas.md) com o catálogo das 16
  ferramentas.

## Melhorias Sugeridas
- **Documentação:** páginas por ferramenta (entradas, premissas, exemplos) e guia
  ilustrado (`guia-meta.ts`).

## Pendências
- Detalhar o fluxo de **salvar/anexar ao projeto** e o **guia ilustrado** ao documentar
  cada ferramenta.
