# Lote 5c — Destino final do esgoto: percolação e sondagem

Parte do [Lote 5](2026-11-02-lote5-calculadoras-instalacoes-design.md). O dono pulou as perguntas em
02/11/2026; as decisões são do agente. O que depende do engenheiro está marcado **[validar]**.
Mesma trava do 5a: `exigeValidacao: true`, só `ferramentas:gerir` vê.

## Descoberta que muda o desenho

O roteiro original citava NBR 7229 e 13969. Pesquisa (IFSC, UDESC) mostra que **ambas foram substituídas pela
NBR 17076:2024**, que traz exigências novas (afastamentos, uso alternado obrigatório das unidades de disposição
final). O texto da NBR 17076 não está acessível ao agente. Decisão: construir só o que a física e a prática
sustentam, **não inventar tabelas**, e tudo que depende do texto novo vira entrada editável ou alerta, com ficha
pedindo a conferência. Registro na ficha e no registry: norma "NBR 17076:2024".

## Escopo

Uma calculadora, `esgoto-infiltracao`, em Hidrossanitário: **sumidouro cilíndrico** dimensionado pelo teste de
percolação, com verificação do nível d'água da sondagem.

- Contribuição: pessoas × L/pessoa·dia **sem padrão** (tabela da norma não conferida) ou volume diário informado.
- Ci por furo: `Ci = 490/(t + 2,5)`, t em min/cm (curva da NBR 7229, a conferir) **[validar]**; adota o menor Ci
  (sumidouro). Alternativa: Ci informado de um laudo (dispensa os furos).
- `A = V/Ci`; profundidade por unidade `H = (A/n − fundo)/(π·D)`; o fundo só conta se o projetista marcar **[validar]**.
- Sondagem: o projetista lê o nível d'água e informa; `H_max = NA − distância mínima − topo`, distância padrão
  1,50 m editável **[validar]**; avisa quando não cabe e diz quantas unidades iguais resolvem.
- Alertas: um furo só; uma unidade só (uso alternado); sem sondagem informada.

**Não-objetivos:** vala de infiltração, filtro anaeróbio, tanque séptico, camada impenetrável, afastamentos de poço,
divisa e edificação, limite de aptidão do solo (o motor não recusa solo pouco permeável), tabela de Ci por tipo de
solo, perfil de camadas da sondagem (o dado usado é só o nível d'água).
**Anti-objetivo:** um Ci ou uma distância "plausível" de norma revogada ir a projeto sem o engenheiro conferir.

## Tela

Lista de furos com menu de contexto e `...` (ADR-0002, descritor puro `acoes-furo.ts`, duplicar e remover com
confirmação). Orientação nomeia os campos que faltam. Ids de DOM por posição.

## Fora do 5c

Guia ilustrado e manual: só depois da validação. Sem migração, sem seed, sem permissão nova.

## Verificação

Motor com teste de valores conferidos à mão, `service`/`savefile`/`registry`/`acoes-furo` cobertos, tela verificada
pelo agente, auditoria nível 3.
