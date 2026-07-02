---
titulo: Ferramentas de Engenharia
descricao: Galeria de calculadoras de engenharia (normas NBR) com geração de memória de cálculo, desenho e exportação.
resumo: 16 ferramentas por disciplina (Universal, Estrutural, Fundações) para dimensionar e verificar elementos conforme NBR, com exportação em PDF/DOCX/XLSX/DXF.
tags: [ferramentas, engenharia, cálculo, nbr, viga, pilar, laje, sapata, estaca, vento, dxf, memória de cálculo]
palavras-chave: [ferramenta, cálculo, dimensionamento, nbr 6118, viga, pilar, laje, punção, escada, ancoragem, sapata, estaca spt, vento, conversor, exportar]
sinonimos: [calculadoras, dimensionamento estrutural, ferramentas técnicas]
---

# Ferramentas de Engenharia

## Objetivo

Oferecer calculadoras técnicas que **dimensionam e verificam** elementos de engenharia
seguindo as normas **NBR**, gerando **memória de cálculo**, **desenho** e arquivos para
exportação.

## Quando utilizar

- Para dimensionar/verificar elementos (vigas, pilares, lajes, fundações etc.) e gerar a
  memória de cálculo.

## Como acessar

- Menu → **Ferramentas** (`/ferramentas`). Exige a permissão **`ferramentas:usar`**.
- Disponível a todos os perfis internos (admin, supervisor, administrativo, clt,
  estagiário, projetista_pj, freelancer).

## Como usar

1. Na **galeria**, escolha a ferramenta (organizada por disciplina).
2. Preencha os **dados de entrada**.
3. Veja o **resultado** e a **memória de cálculo**.
4. **Exporte** nos formatos disponíveis para aquela ferramenta (PDF, DOCX, XLSX e/ou
   DXF de desenho).

> Os resultados podem ser salvos como "snapshots" (registro do cálculo), inclusive
> vinculados a um projeto.

## Catálogo de ferramentas

### Universal
| Ferramenta | O que faz | Exporta |
| --- | --- | --- |
| **Conversor de Unidades** | Converte comprimento, área, volume, massa, força, tensão, momento, vazão e ângulo | PDF |
| **Propriedades de Seção** | Área, centroide, inércia, módulos resistentes e raios de giração (retangular, circular, T, poligonal) | PDF, DOCX, XLSX, DXF |

### Estrutural (NBR 6118 e correlatas)
| Ferramenta | Norma | Exporta |
| --- | --- | --- |
| **Viga de Concreto à Flexão** | NBR 6118:2023 | PDF, DOCX, XLSX, DXF |
| **Pilar de Concreto** (flexo-compressão oblíqua) | NBR 6118:2023 | PDF, DOCX, XLSX, DXF |
| **Laje Maciça** (armada em cruz, Bares) | NBR 6118:2023 | PDF, DOCX, XLSX, DXF |
| **Punção em Laje Lisa** | NBR 6118:2023 | PDF, XLSX |
| **Escada (lance reto)** | NBR 6118:2023 | PDF, DOCX, XLSX, DXF |
| **Ancoragem e Traspasse** | NBR 6118:2023 | PDF |
| **Resumo de Aço** (corte e dobra) | NBR 7480 | XLSX, PDF |
| **Descida de Cargas** | NBR 6120:2019 | PDF, XLSX |
| **Ação do Vento** | NBR 6123:1988 | PDF |
| **Combinações de Ações** | NBR 8681:2003 | PDF, XLSX |

### Fundações
| Ferramenta | Norma | Exporta |
| --- | --- | --- |
| **Sapata Isolada** | NBR 6118/6122 | PDF, DOCX, XLSX, DXF |
| **Sapatas Excêntricas** (e de divisa) | NBR 6118/6122 | PDF, DOCX, XLSX, DXF |
| **Estaca por SPT** (Aoki-Velloso, Décourt-Quaresma) | NBR 6122 | PDF, XLSX |

## Tipos de ferramenta

- **Rápida:** cálculo direto e objetivo.
- **Completa:** dimensionamento detalhado com memória e, em geral, desenho (DXF).

## Limitações e boas práticas

- As ferramentas **auxiliam** o projeto; a **responsabilidade técnica** é do profissional.
  Revise as premissas e os resultados.
- Confira sempre a **norma** e a versão indicadas na ferramenta.

## Funcionalidades relacionadas

- [Projetos](../projetos/projetos.md) (vincular cálculos ao projeto) · [Estúdio de Documentos](../financeiro/estudio-documentos.md)

## FAQ

**Posso exportar o desenho?** As ferramentas "completas" exportam **DXF** (abre em
CAD), além de PDF/DOCX/XLSX.

**O cálculo substitui o projeto?** Não — é uma ferramenta de apoio; a decisão e a
responsabilidade são do engenheiro.
