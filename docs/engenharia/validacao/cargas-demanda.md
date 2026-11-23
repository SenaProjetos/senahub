# Ficha de validação — Cargas e demanda (estudo por concessionária)

Chave: `cargas-demanda` · motor `src/modules/ferramentas/calc/cargas-demanda/` + `src/modules/estudos/cargas-demanda/` · versão do motor: **1**
Situação: **validada** em 23/11/2026 (a aba Estudos e o tipo "Cargas e demanda por concessionária" ficam liberados a quem usa ferramentas).

Engenheiro responsável pela validação: Tadrio, Sena Projetos  CREA/CAU: não informado (anotar aqui)  Data: 23/11/2026

## Escopo validado

- Fórmulas, tabelas e métodos das concessionárias Neoenergia, Equatorial, Cemig, Celesc, Copel, Enel e Energisa, conforme o pacote
  `docs/calculadora-eletrica/` (especificação, anexos A a G e planilha de casos de teste).
- Levantamento (habitação NBR 5410 9.5.2 e lux NBR ISO/CIE 8995-1), demandas por carga instalada e por área útil, CMD, CPG e entrada.
- Relatório em Word, Excel e PDF.

## Observações

- A validação foi comunicada pelo responsável do sistema; esta ficha registra a data e o escopo. Preencher o CREA acima quando disponível.
- Qualquer mudança de fórmula, tabela ou hipótese exige incrementar `versaoCalc` no registro: a ferramenta volta a "em validação".
- Normas futuras (Equatorial Nota Técnica 004/2026, Energisa NDU-042) não são usadas pelo motor e aparecem só como aviso no relatório.
