# Calculadora de cargas e demanda — plano de implementação e passagem de sessão

Branch `feat/calculadora-cargas-demanda` (a partir de `dev-vscode`). Spec: `docs/calculadora-eletrica/` (ler o
`pacote-implementacao-calculadora/LEIAME.md`). Decisões da Fase 0 em memória (`calculadora-cargas-demanda.md`).

## Regras que valem em toda sessão

- Valor de norma só pela extração dos PDFs (JSON em `docs/calculadora-eletrica/normas-e-catalogos/_extracao/json/`,
  fora do git) → TS gerado pelos scripts de `_extracao/gen/` (`node raw.cjs cfg-<x>.cjs <pasta json> <saida.ts>`).
  Nunca digitar valor à mão. Ilegível ou ambíguo: parar e perguntar.
- Esperado de teste só da planilha de casos (ou do §5 da spec, caso 29). Mensagens = spec §6, sem norma na tela.
- Não alterar `calc/electrical-demand.ts` nem a "Corrente e Demanda".
- Parar para revisão humana ao fim de cada fase.

## Fase 1 — biblioteca e motor (em andamento)

Pasta: `src/modules/ferramentas/calc/cargas-demanda/` (puro, roda no navegador).

Feito:
- `numeros.ts`, `arredondar.ts`, `mensagens.ts` (todas as mensagens da §6), `validacao.ts`, `habitacao.ts`, `lux.ts`,
  `corrente.ts` (Ib, Ib′, disjuntor), `fd.ts` (faixa, limite superior, progressivo, maior e demais),
  `concessionarias/tipos.ts` (contrato dos métodos de área útil).
- `biblioteca/`: `tipos.ts`, `fontes.ts` (NBR 5410), `nbr5410-habitacao.ts` (9.5.2, págs. 191–192),
  `disjuntores.ts` (série da §4.5), `energisa.ts`, `celesc.ts`, `nbr8995.ts`, `neoenergia.ts` (gerados).
- `casos-planilha.test.ts`: casos 9, 11, 12, 16, 17, 19, 22, 23, 24, 25 passando.

Extração: JSON prontos para NBR 5410, 8995-1, Neoenergia, Equatorial, Cemig, Celesc, Energisa e Copel NTC 900600.
**Falta extrair:** Copel NTC 841001 (anexo 7, Tabelas 02–12) e `copel-outras` (901110 5.1–5.3, 903100 4.1,
902210 Tabela 2, 901100 Tabela 3). O prompt está em `_extracao/INSTRUCOES.md` + o pedido da Copel (ver abaixo).

Próximos passos, um por sessão curta (modelo sugerido entre colchetes):
1. [Sonnet, subagente] Extrair Copel 841001 e outras → `_extracao/json/copel-ntc841001.json`, `copel-outras.json`.
2. [Sonnet] Gerar TS: `cfg-nbr5410.cjs` já escrito (rodar `raw.cjs`); escrever `cfg-equatorial`, `cfg-cemig`,
   `cfg-copel` no mesmo molde e rodar. Conferir por amostragem contra os valores conhecidos dos anexos.
3. [Opus] `entrada.ts`: FCT (Tabela 40, ambiente/solo), FCA (Tabela 42 por forma; 43–45), seção pela capacidade
   (36–39, sem interpolação), seção mínima (47), neutro (48) e proteção (58). Teste: Tabela 40 PVC e Tabela 42
   linha 1 iguais às do `electrical-demand.ts` (só comparar); casos 9, 10, 18.
4. [Opus] Métodos de área útil por concessionária (`concessionarias/<nome>.ts`) e carga instalada por linha de
   tipo de carga; casos 1, 2, 3–7, 13, 14, 15, 21, 26, 27, 28.
5. [Opus] Níveis CMD e CPG (CPG ≠ soma dos CMDs), avisos de atendimento, apart-hotel; casos 8, 29, 30, 31.
6. [Sonnet] Esquema do conteúdo do estudo (`modules/estudos/cargas-demanda/conteudo.ts`) e vínculos com o
   levantamento (trazer, "diferente do levantamento", "levantamento alterado"); caso 20.

## Perguntas para o dono (juntar no relatório da Fase 1)

1. Caso 13 (Cemig): a planilha dá D1 = 33,21 (= 1,4 × 17,44 × 1,36) com o fator digitado 1,00 e o aviso "mantido
   como digitado". O D1 da tela usa o fator digitado (23,72) ou o da norma? Implementar os dois (critério e adotado).
2. Cemig ND-5.2 Tabela 12 imprime "228" na linha que seria 217 (81,69); a ND-5.5 imprime 217. Usar o 217 da ND-5.5?
3. Faixas de área com inteiros ("41 a 45"): área fracionária cai na faixa seguinte e o limite compartilhado
   ("241–260"/"260–280", Energisa T7; "56 a 65"/"65 a 75", Equatorial T6) fica na primeira. Confirmar.
4. Tabelas que acabam em 300 apartamentos (Celesc, Equatorial, Energisa, Cemig): acima disso, sem sugestão + aviso?
5. Energisa acima de 1.000 m²: a spec §4.2 não diz; tratar como "consultar a concessionária"?
6. Cemig: o PDF da ND-5.2 (4.4.1.3) traz 304–1.500 kVA em câmara transformadora/pedestal e > 1.500 kVA projeto
   especial; o anexo C marca a passagem BT→MT como "a confirmar". Usar o texto do PDF no aviso?
7. Energisa NDU-003 6.7.3 (69–276 kW / 136–276 kW): o anexo G diz "não lida a fundo". Incluir no aviso?
8. Potência por tomada (habitação): o alerta compara o VA total do ambiente com o mínimo para a quantidade adotada.
9. Bifásica: k = 1 com a tensão fase-fase (como a calculadora existente trata "fase-fase").
10. Aviso de edição: canvas diz "Habitação baseada na NBR 5410:2004…"; vale o texto da spec §6.

## Divergências literais encontradas na extração (para o relatório e a nota ao engenheiro)

Além das já citadas na spec §11: Energisa T6 (78, 121, 172, 256); Celesc T01 (62, 85, 276) e T04 (15 cv × 4,
25 cv × 10, 10 cv × 7, ¾ cv × 3 e × 4); Cemig T12 (78, 121, 164, 172); 8995-1 com 31 categorias ("3.1"); Neoenergia
030 com referências internas trocadas (6.27.5 cita T9). Detalhes em `divergencias` de cada JSON.
