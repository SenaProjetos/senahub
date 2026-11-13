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

## Fase 1 — biblioteca e motor (concluída em 2026-11-10; aguarda a revisão humana)

Pasta: `src/modules/ferramentas/calc/cargas-demanda/` (puro, roda no navegador).

Feito:
- `numeros.ts`, `arredondar.ts`, `mensagens.ts` (todas as mensagens da §6), `validacao.ts`, `habitacao.ts`, `lux.ts`,
  `corrente.ts` (Ib, Ib′, disjuntor), `fd.ts` (faixa, limite superior, progressivo, maior e demais),
  `concessionarias/tipos.ts` (contrato dos métodos de área útil).
- `biblioteca/`: `tipos.ts`, `fontes.ts` (NBR 5410), `nbr5410-habitacao.ts` (9.5.2, págs. 191–192),
  `disjuntores.ts` (série da §4.5), `energisa.ts`, `celesc.ts`, `nbr8995.ts`, `neoenergia.ts` (gerados).
- 2026-11-10 (passos 1 e 2): `nbr5410.ts` (Tabelas 33–58), `equatorial.ts` (NT.00004 T4–T10, T13, T25, T26; NT.00042
  T2; trechos da NT.00001 e da Nota Técnica 004/2026), `cemig.ts` (ND-5.2 T1, T12, T13; ND-5.1 T1, T2, T10–T15; trechos
  da ND-5.1/5.2/5.3/5.5), `copel.ts` (NTC 900600 T1, T2, T3a/b; NTC 841001 T02–T12 + fórmula do anexo 3; NTC 902210 T2,
  NTC 901100 T3; trechos de 901110, 903100, 902210, 901100), `celesc-outras.ts` (N-321.0002, I-321.0043, só trechos),
  `energisa-ndu042.ts` (só trechos). Todos gerados por `raw.cjs` (agora com `tipo: "auto"`, que infere o tipo da
  linha, e `trechosDoc`, que exporta todos os trechos de um JSON como `TrechoNorma[]`, tipo novo em `tipos.ts`).
  Situação: `a_confirmar` = NBR 5410, 8995-1, ND-5.5, N-321.0002, NTC 900600; `futura` = Nota Técnica 004/2026
  (24/02/2027) e NDU-042 (09/01/2027). Amostragem conferida (Equatorial T25/T26, Cemig T12/T13, Copel T2, NBR T36/T40,
  Copel 841001 T04). `tsc -p tsconfig.json` sem erro, vitest 24/24, eslint limpo.
- `casos-planilha.test.ts`: casos 9, 10, 11, 12, 16, 17, 18, 19, 22, 23, 24, 25 passando.
- 2026-11-10 (passo 3): `entrada.ts` — Tabela 33 (métodos de referência), FCT (Tabela 40; nas temperaturas de
  referência, lidas das condições impressas nas Tabelas 36/37, FCT = 1), fator da Tabela 41 (referência 2,5 lida do
  título), FCA (Tabela 42 pela linha cuja coluna de métodos inclui o método — a primeira é a sugestão; 43 para C/E/F;
  44 e 45 para D), seção pela capacidade (Tabelas 36–39, escolhidas pela isolação das condições de referência; F com 3
  condutores e G com mais de uma disposição: a coluna é escolha do projetista), seção mínima (47), passo 23 com os
  alertas de seção, neutro (48) e proteção (58, "S/2" arredondado para a seção da série acima). Para isso o `raw.cjs`
  ganhou `condicoes: true` (exporta `condicoes_de_referencia` do JSON como `condicoesDeReferencia`, tipo novo em
  `tipos.ts`) e o `nbr5410.ts` foi regerado (só linhas acrescentadas). `entrada.test.ts`: Tabela 40 PVC e EPR e
  Tabela 42 linha 1 iguais às do `electrical-demand.ts` (só comparação).
- 2026-11-10 (passo 4): `concessionarias/` — `neoenergia.ts`, `equatorial.ts`, `cemig.ts`, `celesc.ts`, `copel.ts`,
  `energisa.ts` (método da área útil de cada uma), `area.ts` (faixas de área, fórmula, fator por tipo), `texto.ts`
  (constantes que só existem em texto — 1,4 da Cemig, 1,2 da Equatorial e da Copel, 1,3 da Energisa, fórmula
  Y = c·X^e, degraus 100%/25% e 20% da Copel, notas 1 e 2 da Tabela 04 — são LIDAS do trecho literal; trecho que
  não casa = erro de carregamento). Contrato (`tipos.ts`): `demandaCriterioKVA` (só valores sugeridos — pergunta 1),
  `fatorDoConjunto` (Celesc k, Energisa 1,3, Copel multiplicador: já em `demandaKVA`, a composição aplica também ao
  condomínio), `avisosAbaixoDaNorma`, `produto`. Novo `biblioteca/energisa-ndu003-trechos.ts` (gerado por
  `cfg-energisa-ndu003-trechos.cjs`). `carga-instalada.ts` (carga do escopo × N, demanda por linha com FD único e
  progressiva). `atividades.ts` (Em pela atividade da 8995-1). FD sugerido por tipo de carga só onde os casos pedem:
  Neoenergia Tabela 7 (`fdAquecimento`), Copel condomínio 3.2 (iluminação, tomadas, Tabela 3 com reservas fora) e
  Tabela 04 (`fdArCondicionado`). `casos-planilha-metodos.test.ts`: casos 1, 2, 3–7, 13, 14, 15, 21, 26, 27, 28
  passando, nenhum esperado ajustado. Enel não implementada (pergunta 23). vitest 89/89, tsc sem erro, eslint limpo.
- 2026-11-10 (passo 5): `composicao.ts` (`demandaDoNivel`: apartamentos do nível pelo método da concessionária com a
  quantidade do nível + cálculos de carga instalada por papel — condomínio, incêndio, especial, comercial, recarga,
  duplex, apartamentos —, fórmula de cada norma conferida contra o trecho ao carregar; Energisa 1,3/1,52/1,1 em kW,
  Equatorial 1,2/1,4 e misto, Celesc k·(D1+D2)+De+Ds, Copel (D1+D2)×fator + especiais fora, Cemig D1+D2, Neoenergia
  Ded = Drf+Ds+Dc+Dve; apart-hotel na Equatorial pela carga instalada; critério × adotado), `niveis.ts`
  (`demandaDoPredio`: CMD com a quantidade do CMD, CPG com o total do prédio e os cálculos de todos os CMDs +
  `calculosSoNoCpg`; ajustes por nível; avisos de CMD sem medidores, acima da capacidade, apartamentos sem CMD ou a mais
  tipo a tipo, cálculo em mais de um CMD), `atendimento.ts` (`avisosDeAtendimento`: Neoenergia, Equatorial, Celesc,
  Copel e Energisa 276–2.500 kW, limites lidos dos trechos). `fatorDoConjunto(ajustes)` exportado em
  `concessionarias/{celesc,copel,energisa}.ts` (CMD só de condomínio ainda leva o fator). Novo
  `biblioteca/celesc-n3210003-trechos.ts` (gerado por `cfg-celesc-n3210003-trechos.cjs`). `casos-planilha-niveis.test.ts`:
  casos 8 (Equatorial e Neoenergia; Enel `todo`), 29 (29,21 / 23,82 / 23,82 / 55,16, esperados do §5), 30, 31, e o total
  dos casos 1 e 2 pela composição — todos passando, nenhum esperado ajustado. vitest 106 + 1 todo, tsc sem erro, eslint limpo.
- 2026-11-10 (passo 4b): FD sugerido por tabela, no padrão de `fdAquecimento`/`fdArCondicionado` (`{ fd, referencia }`;
  em degraus de kW/kVA `{ degraus, literal, referencia }`; maior e demais `{ primeiros, fdPrimeiros, fdDemais, referencia }`;
  motores `kW/kVA`), tudo lido da biblioteca, nada digitado; peças comuns em `concessionarias/fd-sugerido.ts`.
  Neoenergia T6, 8–13, 14, 15, 16, 22 (+ potência T11, T18, T19); Equatorial T4, T5 (prédios), T6–T10, T13; Cemig ND-5.1
  T11–T15; Celesc 5.6.2 (condomínio), T04–T07; Copel NTC 841001 T05–T12. Leitor novo não ligado ainda à tela nem à
  composição (a carga instalada por linha continua recebendo o FD pronto). `fd-sugerido-tipos.test.ts` (44 testes): uma
  célula por tabela conferida no JSON, mais varredura de cobertura das faixas. vitest 150 + 1 todo, tsc sem erro, eslint limpo.
- 2026-11-10 (passo 6): `modules/estudos/cargas-demanda/` (puro, sem I/O, sem migração, sem telas). `conteudo.ts` = esquema Zod do
  documento de `EstudoProjeto.tipo = "cargas_demanda"` (`TIPO_ESTUDO_CARGAS_DEMANDA`, `versaoEsquema` 1): estudo (concessionária
  — as 7, com Enel —, tipo de empreendimento, tensão, ligação, critério de iluminação, pé-direito único) → levantamentos →
  pavimentos → ambientes (habitação: tipo, VA adotado, FP; lux: atividade, Em, Fu, Fm, luminária, quantidade; pontos TUG/TUE/outro
  com quantidade, VA por ponto e FP) → cálculos (método, papel, escopo = levantamentos + × N, linhas com tipo de carga,
  quantidade, potência por aparelho, FP, FD e `vinculo`, tipos de apartamento, ajustes por nível) → centros (CMDs com
  capacidade e medidores, `calculosSoNoCpg`, ajustes do CPG, opções, uso) → entradas (cabo e proteção por flat, CMD ou CPG) →
  responsável técnico. Só entradas (nenhum resultado gravado); nada vem preenchido por padrão (`null`); campo novo entra com
  `.default` (documento antigo abre); faixas com o texto da §6; ids únicos e referências conferidas. Os tipos encaixam nos do
  motor (`Ajustes`, `AjustesDoNivel`, `OpcoesDoNivel`, `PapelCalculo`, `LinhaCarga`…) — conferido pelo `tsc` em `conteudo.test.ts`.
  `levantamento.ts` = passo 11 (`totaisDoEscopo`: iluminação, TUG, cada TUE/outro por descrição normalizada, soma dos
  levantamentos do escopo, sem o × N; total `null` enquanto faltar dado) e passo 12 (`trazerLinha(s)`, `valoresVivos`,
  `estadoDoVinculo` → "do levantamento" / "diferente do levantamento" + avisos da §6, `atualizarDoLevantamento`, `avisosDoEscopo`).
  `vinculo = { origem, trazido }`: "diferente" = linha ≠ `trazido`; "levantamento alterado" = total de agora ≠ `trazido`.
  Nada grava sozinho. Caso 20 passando (iluminação 380 W; TUG 800 W; texto do alerta). vitest 267 + 1 todo (estudos +
  cargas-demanda), tsc sem erro, eslint limpo.

Extração: todos os JSON prontos (inclusive `copel-ntc841001.json` e `copel-outras.json`, 2026-11-10). Página de PDF em
imagem: `_extracao/gen/render-pdf.mjs <pdf> <pág> <saída.png> [escala]` (pdfjs-dist + @napi-rs/canvas do repositório,
com `standardFontDataUrl`, sem o qual alguns PDFs da Copel saem sem texto).

Próximos passos, um por sessão curta (modelo sugerido entre colchetes):
1. ~~[Sonnet, subagente] Extrair Copel 841001 e outras~~ — feito 2026-11-10.
2. ~~[Sonnet] Gerar TS (nbr5410, equatorial, cemig, copel, celesc-outras, energisa-ndu042)~~ — feito 2026-11-10.
   Os TS gerados com `tipo: "auto"` usam as chaves do JSON como estão (ex.: `"Nº Aptos"`, `"F. Div"` na NTC 900600);
   o motor dos passos 3–5 lê essas chaves, nunca renomeia no TS gerado.
3. ~~[Opus] `entrada.ts`~~ — feito 2026-11-10 (casos 9, 10, 18).
4. ~~[Opus] Métodos de área útil e carga instalada por linha~~ — feito 2026-11-10 (casos 1, 2, 3–7, 13, 14, 15, 21,
   26, 27, 28).
4b. ~~[Sonnet] FD sugerido para os demais tipos de carga~~ — feito 2026-11-10 (ver "Feito", passo 4b).
5. ~~[Opus] Níveis CMD e CPG (CPG ≠ soma dos CMDs), composição por concessionária (apartamentos + condomínio ×
   `fatorDoConjunto` + especiais/comercial fora dele; Energisa duplex 1,52 e lojas 1,1; Equatorial duplex e misto),
   avisos de atendimento, apart-hotel; casos 8, 29, 30, 31.~~ — feito 2026-11-10 (Enel do caso 8 pendente, pergunta 23).
6. ~~[Sonnet] Esquema do conteúdo do estudo (`modules/estudos/cargas-demanda/conteudo.ts`) e vínculos com o
   levantamento (trazer, "diferente do levantamento", "levantamento alterado"); caso 20.~~ — feito 2026-11-10 (ver "Feito",
   passo 6). Fase 1 concluída: falta só o relatório de revisão humana (perguntas abaixo) antes da Fase 2 (telas; despachar o
   módulo Estudos por tipo e o gate por tipo entram lá).

## Perguntas para o dono (juntar no relatório da Fase 1)

Documento para o engenheiro, com contexto, opções e sugestão de cada uma (mesma numeração):
https://claude.ai/artifact/RHK1rZpXdjgCMHypbdZ4FP (privado; compartilhar pelo menu Share).

1. Caso 13 (Cemig): a planilha dá D1 = 33,21 (= 1,4 × 17,44 × 1,36) com o fator digitado 1,00 e o aviso "mantido
   como digitado". O D1 da tela usa o fator digitado (23,72) ou o da norma? Implementar os dois (critério e adotado).
2. Cemig ND-5.2 Tabela 12 imprime "228" na linha que seria 217 (81,69); a ND-5.5 imprime 217. Usar o 217 da ND-5.5?
   (Hoje: a linha com o rótulo errado fica fora — 228 lê 82,17 e 217 sai sem sugestão; antes a busca pegava a
   linha errada para 228, corrigido em b8b53888.)
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
11. Copel NTC 900600, células literais que o motor NÃO deve usar sem decisão: Tabela 1 332 m² = "631" (a fórmula do
    3.1.1 dá 6,31), Tabela 1 linha com área em branco e kVA 1,00 (alinhada à 69 m²), Tabela 3b 1/3 CV coluna 1 = "0377"
    (0,77 pela NTC 841001 T06). Usar a fórmula do 3.1.1 para área, ou tratar como "consultar a concessionária"?
12. Copel NTC 841001 T07: 125 cv a 127 V = 117,3 A destoa (100 cv = 144,8; 150 cv = 214,0). A corrente entra no motor?

Novas (passos 3 e 4, 2026-11-10) — o código segue a leitura indicada até a resposta:
13. Copel, área "a considerar": o 5.2 mostra 111,4 m² → 111 m². Adotado: arredondar ao m² mais próximo (111,5 → 112).
    Ou é truncar?
14. Tabela 42, linha 1, coluna de métodos "36 a 39 (métodos A a F)" inclui o D ao pé da letra: no método D a sugestão
    de FCA é a linha 1 e as Tabelas 44/45 ficam como opção. No D a sugestão deveria ser a 44 ou a 45?
15. Tabelas 44 e 45 começam em 2 circuitos: com 1 circuito enterrado o FCA fica sem sugestão (o projetista digita).
    Usar 1,00?
16. Resistividade do solo fora das linhas da Tabela 41 (ex.: 1,2 K·m/W): fator sem sugestão. A spec §3.3 diz
    "1 a 3, avisar", mas a §6 não tem o texto. Qual mensagem?
17. Corrente corrigida acima da capacidade da maior seção da coluna: seção sem sugestão; a §6 não tem mensagem.
18. Tabela 47, alumínio em sinalização e controle ("–"): sem seção mínima (nenhum alerta).
19. Condutor de proteção "S/2" (Tabela 58): arredondado para a seção da série da Tabela 36 acima (95 mm² → 50 mm²).
20. Cemig nota 8 (áreas diferentes): sem escolha do projetista, "por conjunto" quando há mais de um tipo e todos
    têm 4 ou mais apartamentos; senão, média ponderada. Confirmar o padrão.
21. Energisa, metragens distintas ("calcular por conjunto de mesma área"): d1 = Σ f(nᵢ) × aᵢ, cada conjunto com o f
    da SUA quantidade. Confirmar.
22. Fator sem sugestão (área acima da tabela sem fórmula — Neoenergia, Cemig, Energisa; nº de apartamentos acima de
    300; célula pendente): hoje sai a recusa "Informe o valor de {campo}. Não há valor padrão para esta
    concessionária.". A spec §4.2 fala em avisar "consultar a concessionária", sem texto na §6. Manter?
23. Enel: a norma não traz método; a spec §3.4 lista os campos (cômodos com módulo, divisor, fator de localização;
    medição agrupada com demanda por unidade, serviço e fator do ramal), mas não a conta. Qual é a fórmula da tela?

Novas (passo 5, 2026-11-10) — o código segue a leitura indicada até a resposta:
24. Copel: a 4.2 aplica o fator multiplicador à "demanda total calculada"; o 5.4 soma só apartamentos + condomínio.
    Adotado: fator sobre apartamentos e condomínio (incêndio junto); especiais, comercial e recarga fora dele. Confirmar.
25. Incêndio: tratado como motor do condomínio (dentro do k da Celesc, do fator da Copel, do D2 da Equatorial), exceto
    na Energisa, onde motor é dce (Tabelas 15 a 17), fora do 1,3/1,52. Confirmar.
26. Energisa: a recarga entra como dce (kVA, fora do 1,3); as lojas usam a demanda em kW do cálculo comercial já com
    × nL (D2 = demanda do escopo × 1,1). Confirmar.
27. Duplex com lojas no mesmo prédio: nenhuma norma traz a fórmula junta. Adotado: somar (Equatorial D1×1,2 + D3×1,4 + D2
    + lojas + D4; Energisa (d1+d2+d3)×1,52 + nL×d3×1,1 + dce). Duplex nas demais concessionárias = tipo comum.
28. Equatorial, baixa tensão depende da carga instalada (≤ 75 kW). Sem a carga instalada do nível, o aviso só sai quando a
    demanda passa de 75 (então a carga também passa): "média tensão" já a partir de 75 kVA, sem considerar o condomínio
    Grupo B até 300 kVA do anexo B. Ou o nível pede a carga instalada?
29. Celesc e Copel acima de 2.500 kW continuam "média tensão" (as normas não citam alta tensão). Energisa acima de 2.500 kW
    ("projeto especial", 6.7.5) não cabe no texto da §6 — sem aviso. Cemig sem aviso até a pergunta 6.
30. Seletividade da entrada (Copel, §6): o trecho da NTC 901100 5.5.2 na biblioteca não traz o "26 kVA"; aviso não
    implementado. De onde vem?
31. CPG usa a quantidade de apartamentos do cálculo (o prédio), não a soma dos CMDs — se houver apartamento sem CMD, o
    CPG conta com ele e o aviso "sem CMD" aparece. Confirmar.

Novas (passo 4b, 2026-11-10) — o código segue a leitura indicada até a resposta:
32. Cemig ND-5.1 T10 e Equatorial T5 (linha "Unidades Consumidoras Residenciais"): FD por faixa da carga instalada, mas a norma
    não diz se vale para a carga inteira ou por degrau (a Neoenergia T6 diz "faixa inteira", anexo A). NÃO carregadas até a resposta.
33. Equatorial: o texto da NT.00004 6.11.4.1 manda a Tabela 7 para os grupos b1–b5 e o anexo B da spec manda a Tabela 6.
    As duas estão carregadas (`fdEquipamentoEspecifico` e `fdAquecimentoEletrodomesticos`); qual a tela usa?
34. Equatorial T6 (56 a 65 × 65 a 75 aparelhos) e T7 ("Acima de 61" depois de "51 a 60"): 65 aparelhos (só a coluna torneira,
    0,33 × 0,32) e 61 aparelhos ficam SEM sugestão. Confirmar ou indicar a linha.
35. Celesc Tabela 04 (motores, kVA por quantidade 1 a 10): 5 células que o gerador marcou como destoantes ficam sem sugestão
    (trifásico 15 cv × 4, 25 cv × 10, 10 cv × 7; monofásico ¾ cv × 3 e × 4); mais de 10 motores também sem sugestão.
36. Neoenergia T22 "Administração de edifícios de uso coletivo": regra em texto (1,00 da iluminação mais 0,50 das tomadas),
    sem degraus de kW — `degraus` nulo, FD só pelo `literal`. Como a tela separa iluminação e tomadas dessa linha?
37. Copel T10 (elevadores): "até dois = 1,00; restantes = 0,60" lido como os 2 primeiros com 1,00. Confirmar (as notas 1 e 2
    das T08–T11 — equipamentos iguais contam um como o maior; partida simultânea soma como um — são da tela, não do FD).
38. Cemig T14/T15: kVA INDIVIDUAL por motor pelo nº TOTAL de motores do consumidor (nota 3: monofásicos e trifásicos juntos);
    o motor soma `quantidade × kVA da coluna`, como o exemplo da nota 2. Confirmar.
39. Neoenergia T11/T18/T19 e Copel T06/T07: só a potência (kW, kVA) é lida; as correntes ficam fora (pergunta 12 da Copel).
    A Neoenergia 6.27.7 manda a "conversão para kW ou kVA, conforme Tabela 18" (só monofásicos) — usamos a 19 para trifásicos.
40. Celesc 5.6.2 (condomínio) e T06 nota 3 (hotel: o projetista define, "próximo a 100%"): `fdCondominio()` e `fdAquecimento()` só
    expõem a norma; hotel/motel/apart-hotel segue sem sugestão.

Novas (passo 6, 2026-11-10) — o código segue a leitura indicada até a resposta:
41. Escopo = lista de levantamentos com UM × N para o cálculo todo (como `cargaInstalada(linhas, escopoN)`). A spec §3.1 diz "de
    quais levantamentos vêm as cargas e a quantidade (× N)" sem dizer se o N é por levantamento. Confirmar (o contrário muda o motor).
42. Levantamento → pavimentos → ambientes (a §3.1 diz "cada um tem pavimentos e ambientes"; a §3.3 trata "pavimentos" como texto).
    Adotado: pavimento é um grupo com nome que contém os ambientes (a ordem da tela é a do relatório).
43. "Potência trazida" (caso 20) = total da linha em W: a linha guarda quantidade e potência POR aparelho (como `LinhaCarga`):
    iluminação = quantidade 1 × total; TUG/TUE = Σ quantidade e (ΣW ÷ Σ quantidade) por aparelho; FP do conjunto = ΣW ÷ ΣVA.
    Confirmar (principalmente a iluminação como "1 aparelho").
44. Ponto "outro" (§3.3: "TUG, TUE ou outro"): a §5 passo 11 só fala em iluminação, TUG e "cada TUE". Adotado: "outro" agrupa por
    descrição como a TUE, em linha própria (tipo de carga "outro").
45. Atualizar uma linha EDITADA: a §3.1 regra 3 oferece "atualizar" e o §8 diz que o valor trazido "nunca sobrescreve edição
    manual". Adotado: "Atualizar" não toca linha editada; para refazer, o projetista descarta a edição de propósito
    (`descartarEdicao`). Confirmar o texto/fluxo da tela.
46. "Cálculo sem escopo" (§6): sai quando não há levantamento no escopo E nenhuma linha (a mensagem fala em "escolha o levantamento ou
    digite as cargas"); com linhas digitadas sem escopo, nenhum aviso. Total incompleto que impede trazer usa o informativo do FP
    em branco, mesmo quando a falta é de quantidade ou VA (a §6 não tem texto para isso).
47. Estudo com Enel é aceito no esquema (a spec §3.3 lista a Enel), mas o motor não a calcula (pergunta 23). Os tipos de
    carga da linha (iluminação, TUG, TUE, aquecimento, motores, ar-condicionado, recarga, outro) saíram dos nomes da spec §3.1/§3.3 —
    a spec não traz uma lista fechada. Campos próprios de motor/ar-condicionado/recarga (cv, reservas, BTU/h, gerenciamento) ainda
    não existem no esquema: entram como campo opcional na Fase 2, sem migração.
## Respostas do engenheiro (2026-11-12) — Q1 a Q47

Respondidas todas. As que batem com o que o código já faz ("Hoje" do artifact) não pedem mudança: Q1, Q3, Q4, Q5, Q8, Q9, Q10,
Q12, Q19–Q21, Q25, Q31, Q35, Q37–Q47 (A), mais Q7 (B = esperar a leitura dele; segue sem aviso abaixo de 276 kW).

Mudaram o código (passo 7, feito em 2026-11-12; "hoje" entre parênteses = como estava):
- Q2 A: usar 217 = 81,69 na Cemig T12 (a linha rotulada "228" sai como 217, com nota no relatório). (hoje: sem sugestão)
- Q6 A: aviso de atendimento da Cemig com as faixas do texto da ND-5.2 (95 / 304 / 1.500 kVA). (hoje: sem aviso)
- Q11 A e Q13 A: ficam sem efeito pela Q24 (NTC 900600 deixa de ser usada).
- Q14 C: método D sem sugestão de FCA; o projetista escolhe a Tabela 44 ou 45. (hoje: linha 1 da Tabela 42)
- Q15 A: um circuito enterrado, FCA = 1,00. (hoje: sem sugestão)
- Q16 A: resistividade fora da Tabela 41, fator digitado + alerta "Resistividade fora da tabela. Informe o fator manualmente."
- Q17 A: alerta "Corrente acima da capacidade da maior seção da tabela. Use condutores em paralelo ou outra forma de instalação."
- Q18 A: alumínio em sinalização/controle (Tabela 47 "–") = "Alumínio não é admitido para este uso."
- Q22 B: alerta novo "Valor fora da tabela da concessionária. Consulte a concessionária e informe o valor." no lugar da recusa
  "Informe o valor de …" quando a tabela existe e não cobre o caso.
- Q23 B: Enel só por carga instalada, FD digitado (resolve a parte Enel do caso 8 e tira o `todo`).
- Q29 B: acima de 2.500 kW, aviso de alta tensão para todas (REN 1000/2021, art. 23), com nota no relatório.
- Q32 A: Cemig ND-5.1 T10 e Equatorial T5 (residencial) carregadas com FD pela faixa INTEIRA da carga instalada.
- Q33 A: Equatorial b1–b5 pela Tabela 7. Q36 A: Neoenergia T22 como duas linhas (iluminação 1,00; tomadas 0,50).

Respostas às perguntas 48 a 50 (2026-11-12):
- **48 / Q24 — Copel:** "sai": a NTC 900600 é ignorada (caso 1 da planilha removido dos testes; sem fator multiplicador, sem FD do
  condomínio do 3.2, sem tabelas de motores da 900600). Copel só por carga instalada; o atendimento fica a cargo do projetista (sem aviso).
- **49 / Q27 — duplex e lojas:** "manter o critério da Energisa e da Equatorial; o projetista confirma na norma". O duplex (1,52 da
  Energisa, 1,4 da Equatorial) e as lojas (Q26 A) ficam como estão. A leitura "duplex sem regra própria" que eu tinha adotado foi desfeita.
- **50 / Q28 — carga instalada:** a tabela do condomínio mostra o total de carga instalada (sem FD) e o total da demanda; a bomba de
  incêndio entra na carga do condomínio; lojas entram nas cargas comerciais pelo método da carga instalada, e é útil ter a tabela do
  levantamento quando o empreendimento é misto e tem lojas. A carga instalada do nível = flats do levantamento (quantidade × kW) +
  cálculos; a Equatorial usa isso para a baixa tensão (≤ 75 kW).

## Passo 7 — aplicar as respostas (feito em 2026-11-12, sem commit)

- Copel e Enel só por carga instalada (`composicao.ts`: `soCargaInstalada`, `demandaSoCargaInstalada`; `IdConcessionaria` ganhou
  `"enel"`); `concessionarias/copel.ts` ficou só com os FD da NTC 841001; `atendimento.ts` sem aviso para Copel e Enel; caso 1 removido
  de `casos-planilha-metodos.test.ts` e `casos-planilha-niveis.test.ts`.
- Carga instalada (Q28): `CalculoNoNivel.cargaInstaladaKW`, `TipoNoNivel.cargaInstaladaKW` (por unidade, do levantamento),
  `ParcelaDoNivel.cargaInstaladaKW` e `ResultadoDoNivel.cargaInstaladaKW`; `niveis.ts` a passa ao aviso da Equatorial.
- Q2: Cemig T12, a linha impressa "228" vale 217 (número lido da `obs` da biblioteca) + `NOTA_T12_RELATORIO`.
- Q6: Cemig com aviso de atendimento (ND-5.2 4.4.1.1 a 4.4.1.4, limites lidos dos trechos).
- Q14 C / Q15 A / Q16 A / Q17 A / Q18 A em `entrada.ts` (`formaSugerida`, FCA 1,00 com um circuito enterrado,
  `resistividadeDoSolo`, `ResultadoSecao.avisos`, `avisoDeAluminio`) e 4 mensagens novas em `mensagens.ts` (a `seletividadeCopel` saiu).
- Q22 B: `valorForaDaTabela` no lugar da recusa quando a tabela da concessionária não cobre (`area.ts`, `avisosDeFaltantes`).
- Q32 A: `equatorial.fdIluminacaoTomadasUnidadeResidencial` e `cemig.fdIluminacaoTomadasResidencial` (faixa inteira).
  Q36 A: `neoenergia.fdAdministracaoEdificios` (iluminação 1,00; tomadas 0,50, lidos do texto da T22).
- `decisoes-engenheiro.test.ts` (novo) cobre Q2, Q6, Q14–Q18, Q22, Q23/Q24, Q28, Q32 e Q36. vitest (estudos + cargas-demanda) 278 + 1 todo,
  tsc sem erro, eslint limpo.

Ainda em aberto:
- **Q29 B — fechada (2026-11-12, dono):** a REN 1000/2021 não está na biblioteca, então o sistema NÃO sugere o limite de 2.500 kW
  nem emite aviso com número; a conferência fica com o projetista, na norma. Para o relatório (Fase 3): nota fixa "Confira na norma
  da concessionária se a demanda exige atendimento em alta tensão", sem valor. Se o PDF vier, o aviso numérico entra depois.
- **Q7 — aplicada (2026-11-12):** "considerar apenas o item da NDU 003". Energisa de 69 a 276 kW (não inclui 276) ganha o aviso do ramal
  de entrada subterrâneo (6.7.3, mensagem nova `ramal_entrada`, lida do trecho); de 276 a 2.500 kW segue a 6.7.4. A 6.7.3 tem 69 kW em
  220/127 V e 136 kW em 380/220 V: `EntradaAtendimento.sistema` (o sistema de tensão do estudo, `conteudo.sistema`: "220/127" | "380/220", como o campo
  Tensão do protótipo, que mostra "380/220 V") escolhe — 380/220 = 136 kW; 220/127 = 69 kW; sem sistema, o menor. O campo antigo `tensaoV`
  (127/220/380) foi trocado por `sistema` (o motor de corrente já usava `SISTEMAS`). `niveis.ts` repassa `sistema`; a tela (Fase 2) deve preencher. Abaixo do limite, sem aviso.
- **Q34 B — aplicada (2026-11-12):** Tabela 6, 65 aparelhos = linha "56 a 65" (torneira 0,33); Tabela 7, 61 aparelhos = "Acima de 61".
  Saíram `sobreposicaoAmbigua` e `APARELHOS_PENDENTES_T7` do uso da Equatorial (as opções genéricas de `fd-sugerido.ts` ficam).
- **Q30 A:** sem objeto (o aviso de seletividade era da Copel e foi removido com a NTC 900600).
- **Q33 A:** Tabela 7 para b1–b5: as duas tabelas seguem carregadas; a escolha é da tela (Fase 2).
- **Caso 8, Enel — feito (2026-11-12):** o engenheiro mandou ver "limites de fornecimento" na norma Enel. Trechos da 0280 v02, item 7.1.3
  (páginas 13 e 14), entraram na biblioteca (`biblioteca/enel-0280-trechos.ts`, gerado por `cfg-enel-0280-trechos.cjs` a partir de
  `_extracao/json/enel-0280.json`). `avisosDeAtendimento("enel")`: carga instalada acima de 75 kW e demanda até 2.500 kW = média tensão;
  demanda acima de 2.500 kW = tensão de 69 kV ou mais; até 75 kW de carga instalada, sem aviso. O `it.todo` virou teste.
  Divergência para o relatório: a 0018 (7.8.2) escreve "menor que 2500" e a 0280 "menor ou igual a 2.500 kW"; vale a 0280, como o caso 8.
  A 0018 e a 0017 ainda não estão na biblioteca. O PDF CNC-OMBR-MAT-18-0126-EDCE (Enel Ceará, v03, 2022) foi colocado em
  `pacote-implementacao-calculadora/`, mas o anexo F o lista como cancelado e fora da especificação, e o item 7.2/7.3 dele só fala em
  75 kW de carga instalada (sem limite de média tensão): não foi usado. Perguntar ao dono se ele entra.
- **Relatório de revisão humana da Fase 1 — entregue ao dono em 2026-11-12** (no chat): cobertura, fora de propósito, divergências
  (Enel 0018 × 0280, kW × kVA, Cemig 217, Equatorial T6 × T7) e pendências. Verificação no dia: vitest (cargas-demanda + estudos)
  282/282, tsc sem erro, eslint limpo. Dono (2026-11-12): OK para a Fase 2; Enel Ceará 0126 fica FORA (o PDF fica na pasta, sem uso).
- Cálculos que a tela vai precisar na Fase 2 (não feitos aqui): montar `CalculoNoNivel.cargaInstaladaKW` e `TipoNoNivel.cargaInstaladaKW`
  a partir do levantamento; aplicar a Tabela 22 da Neoenergia como duas linhas; Q36/Q33 na tela.

Diferenças de redação da planilha (sem ajuste de esperado): caso 2 chama de "Dr" a demanda já com o Fc (a Dtr do
Anexo I); casos 13 e 18 citam a norma no texto da mensagem (vale a spec §6).

## Divergências literais encontradas na extração (para o relatório e a nota ao engenheiro)

Além das já citadas na spec §11: Energisa T6 (78, 121, 172, 256); Celesc T01 (62, 85, 276) e T04 (15 cv × 4,
25 cv × 10, 10 cv × 7, ¾ cv × 3 e × 4); Cemig T12 (78, 121, 164, 172); 8995-1 com 31 categorias ("3.1"); Neoenergia
030 com referências internas trocadas (6.27.5 cita T9). Detalhes em `divergencias` de cada JSON.

Novas (passo 1, Copel): NTC 841001 T07 125 cv a 127 V = 117,3 A (100 cv = 144,8; 150 cv = 214,0); T08–T11 com cabeçalho
"FATOR DE DEMANDA (%)" e valores em fração; T03 12.000 e 14.000 BTU/h a 220 V com o mesmo VA (2100) e W diferentes
(1600/1900); T02 com "Enceradeira" e "Torneira elétrica" repetidas; T06 127 V de 5 a 15 cv = "-" (null). NTC 902210:
cabeçalho "Revisão 13/12/2025" × rodapé "FEVEREIRO/2026". NTC 901110 5.1 b cita a Tabela 7 e 5.2.2 a a Tabela 4 (não
extraídas). NTC 900600 (já registradas): T2 13 aptos = 11,93; T1 298 m² = 5,57 e 332 m² = "631"; T3a/T3b com várias
células que não batem com coluna 1 × fator do cabeçalho; T3b 1/3 CV = "0377".

## Fase 2 — telas (em andamento, 2026-11-12; sem commit até o OK do dono)

Mock aprovado: https://claude.ai/artifact/WiT6biG2T4tPvirD3SnUwC (dono: "carga instalada em kW **e** kVA em colunas separadas"; escolha T6 × T7 por
cálculo). Decisão de desenho: critério de lux com catálogo "Luminárias deste estudo" (L1, L2…) como no protótipo (campo novo `luminarias` +
`iluminacao.luminariaId`, sem migração).

Feito:
1. **Despacho por tipo** (`EstudoProjeto.tipo`): `registry.ts` ganhou `soEstudo` + entrada `cargas-demanda` (fora da galeria, 404 em
   `/ferramentas/cargas-demanda`, cálculo avulso recusado); `estudos/acesso.ts` (`TIPOS_DE_ESTUDO`, `FERRAMENTA_POR_TIPO`, `liberacaoDaAba`),
   `estudos/tipos.ts` (vazio e validação por tipo), `service/actions/queries/memoria` por tipo (memória só do legado; `salvarEstudo` valida o
   documento contra o esquema do tipo lido da linha). Lista: pill do tipo, criar escolhendo o tipo (só os liberados). Página do estudo despacha.
2. **Casca do editor** (`components/estudos/cargas-demanda/editor.tsx` + `estudo-card.tsx` + `campos.tsx`): salvar com trava de versão, Ctrl+S,
   conflito, sair sem salvar, etapas 1–3, campo `sistema` ("380/220 V"), `CampoNumero` pt-BR (`numero-br.ts`).
3. **Etapa 1 — levantamento** (habitação e lux, validada no navegador): `ambiente.ts` (campo em branco adota o sugerido da NBR 5410; totais do
   levantamento passam a usar o sugerido), `edicao.ts` (puro: fábricas, cópias com ids novos, mover, FP do levantamento, luminárias),
   `acoes-levantamento.ts` (ADR-0002: menu de contexto + `⋯` em levantamento, pavimento, ambiente, tomada), `etapa-levantamento.tsx`,
   `pavimento-card.tsx`, `linha-ambiente.tsx`, `celulas-tomadas.tsx`, `seletor-atividade.tsx`. Arrastar a alça reordena ambientes (teclado = ⋯).
4. **Resultado do estudo** (`resultado.ts`, puro): linha, cálculo de carga instalada (kW, kVA, demanda, × N), tipos de apartamento com carga
   instalada do levantamento (campo novo `tipoApartamento.levantamentoId`), resumo do empreendimento e prédio (CMD/CPG). Teste: o documento do
   caso 29 dá 29,21 / 23,82 / 23,82 / 55,16.

5. **Etapa 2 — demandas** (`etapa-demandas.tsx`, `calculo-carga-instalada.tsx`, `calculo-area-util.tsx`, `fatores.tsx`, `escolha-fd-aquecimento.tsx`):
   cálculo por carga instalada (escopo + × N, trazer/atualizar do levantamento com "diferente do levantamento", tabela com carga instalada em
   **kW e kVA** sem FD, FD, demanda, total) e por área útil (tipos, fatores sugeridos/adotados do método de cada concessionária, duplex,
   levantamento da unidade); resumo e avisos (inclui nível de tensão esperado) ao lado. `fd-linha.ts`: FD sugerido por regra (campo em branco
   adota o sugerido) — Neoenergia T22 em **duas linhas** (botão "Administração de edifícios") e Equatorial aquecimento **T7 × T6 por cálculo**
   (`CalculoEstudo.fdAquecimento`, `LinhaCargaEstudo.regraFd/subtipo`). Resto das tabelas de FD continua digitado.
6. **Etapa 3 — centros e entradas** (`etapa-centros.tsx`, `form-entrada.tsx`): CMDs (capacidade, medidores, fatores por CMD, entrada),
   CPG (total do prédio, fatores do CPG, "não é a soma dos CMDs"), entrada pelo `entrada-estudo.ts` (corrente, FCT/FCA, disjuntor, seção, neutro,
   proteção; CMD herda as condições do CPG), uso da edificação e opções do método, responsável técnico; relatório = botões desabilitados (Fase 3).
7. **Resumo dos levantamentos** (misto com lojas): `resumoDosLevantamentos`. Aparece com 2+ levantamentos ou tipo "Misto".

Verificação (2026-11-12/13): vitest 676 arquivos / 7897 testes, `tsc` e `eslint src` limpos, `smoke:estudos` ok; telas conferidas no Chrome a
1680 px no worktree vscode (:3001): habitação (280/280, 4/400/320, 4/1.900/1.520, 1/600/480; totais 540/2.900/2.320), lux, etapa 2
(26,16 kVA, 21,12 × 19,14, T22), etapa 3 (21,48 / 23,82 / 23,82; CPG 47,43; 72,07 A, 80 A, 25 mm²), salvar e reabrir.

Pendências da Fase 2: FD sugerido das demais tabelas (Cemig, Celesc, Copel 841001, motores, ar-condicionado) não ligado às linhas; unidade "cv"
dos motores (a tabela dá kVA) não modelada; entrada por flat individual (cálculo sem papel) ainda sem tela própria; relatório e exportação = Fase 3;
celular (390 px) e tema claro ainda não conferidos; desvios do mock a confirmar com o dono: coluna **Qtd** na tomada de uso específico e a escolha
do critério de lux por catálogo de luminárias (como no protótipo).

### Fase 2 — fechamento do passo 1 (2026-11-13, sem commit)

- **Desvios do mock confirmados pelo dono:** coluna Qtd na tomada de uso específico MANTIDA; catálogo de luminárias L1/L2 no critério de lux MANTIDO.
- **Entrada do flat individual** (`components/estudos/cargas-demanda/entradas-individuais.tsx`, `unidadesIndividuais` em `edicao-centros.ts`): cálculo por
  carga instalada SEM papel ganha o cartão "Entrada do …" na etapa 3 (corrente, disjuntor, cabo pelo mesmo `FormEntrada`, `alvo.nivel = "calculo"`);
  sem dados mostra "Faltam dados" + "Completar o cálculo" (volta à etapa 2). Não entra no CMD nem no CPG (spec §3.1, regra 6).
- **FD sugerido por tabela** (`fd-linha.ts`, catálogo `REGRAS_FD`): ligadas as tabelas POR Nº DE APARELHOS / POTÊNCIA: Celesc T06/T07, Copel T04/T05/T11, Cemig T12/T13,
  Equatorial T6/T7 (já), T8/T9/T10, Neoenergia T7/T8/T9/T10/T12/T13/T16. A linha escolhe a tabela no seletor "Tabela do FD" (`regraFd`); única opção do tipo
  (Celesc/Copel aquecimento, Neo recarga, Copel motores) vale sozinha. Contagem = quantidade × N da linha, exceto Neoenergia T7 e Copel T11 (soma das linhas do
  cálculo com a mesma regra). Valor sempre da biblioteca. Trocar o tipo da linha solta a regra que não cabe (`regraCabeNoTipo`).
- **Ainda digitado (decisão pendente):** (1) FD por faixa da CARGA — Neo T6, Cemig T10, Equatorial T5 unidade residencial: falta decidir se a faixa usa a carga do
  cálculo × N ou a por unidade; (2) iluminação/tomadas por USO em degraus — Neo T22, Cemig T11, Celesc T05, Copel T12, Equatorial T4/T5 prédio: a linha não divide em faixas;
  (3) motores/equipamentos "o maior e os demais" — Neo T14/T15, Copel T08–T10, Equatorial T13 — e a unidade cv (Cemig T14/T15, Celesc T04, Copel T06/T07, Neo T18/T19: a
  tabela dá kVA). Energisa e Enel não têm tabelas de FD carregadas.
- **Celular/tema claro:** corrigidos dois estouros em 390 px (linha de papel/escopo do cálculo; tabela de composição do CPG). 390×844 = 390 nas três etapas; 1366×768 com o
  menu aberto sem sobreposição; tema claro e escuro conferidos.
- **Auditoria:** nível 3. vitest 676 arquivos / 7907 testes, tsc e eslint (estudos) limpos, `smoke:estudos` ok. Prints e LEIAME em
  `prints-auditoria/2026-11-13_1135_cargas-demanda/` (ignorada pelo git). Subagentes revisores não acionados (limite de um subagente da sessão).

## Fase 3 — relatório (2026-11-13, sem commit até o OK do dono)

- **Modelo neutro** (`modules/estudos/cargas-demanda/relatorio/`): `tipos.ts` (células `{n, c}`: número e casas), `montar.ts` (`montarRelatorio`: 7 seções da spec §7),
  `secao-levantamento.ts` (3), `secao-demandas.ts` (4), `secao-centros.ts` (5), `fontes.ts` (normas e edições, lidas dos `FonteNorma` da biblioteca; só as CITADAS),
  `formato.ts` (texto pt-BR, `paraMemoriaDoc`, nome do arquivo). A fonte (norma, edição, tabela, item) aparece só nas seções 2 e 7; a tela não mudou.
- **Saídas:** PDF = `paraMemoriaDoc` → `renderMemoriaHtml` + `htmlParaPdf` existentes; Word = `render-docx.ts` (compacto: A4, 1,5 cm, 8–9 pt, tabelas cinza, `cantSplit`, cabeçalho
  repetido, rodapé "Página X de Y"); Excel = `render-xlsx.ts` (uma aba por etapa: Resumo, Levantamento, Demandas, Centros e entradas, Fontes; números numéricos; paisagem).
- **Rota** `/api/estudos/[id]/memoria?formato=pdf|docx|xlsx` despacha por tipo (`memoriaDoEstudo` devolve `ExportacaoDoEstudo`); etapa 3 tem os três botões (desabilitados com
  alterações não salvas).
- **Notas fixas:** Q29 (confira na norma se exige alta tensão, sem valor), limite em kW comparado direto com kVA, divergências por concessionária (Enel 0018 × 0280; Cemig T12
  linha 217 via `NOTA_T12_RELATORIO`; Equatorial T6 × T7), marca "Dados não conferidos por responsável técnico" sem declaração ou CREA.
- **FD com fonte:** `fd-linha.ts` agora devolve `{fd, referencia}` (`fdSugeridoComFonte`), para a seção 7 citar a tabela de cada FD sugerido.
- **Verificação:** vitest 678 arquivos / 7922 testes, tsc e eslint limpos, `smoke:estudos` ok (inclui o relatório de um estudo vazio). Prints e arquivos gerados em
  `prints-auditoria/2026-11-13_1135_cargas-demanda/`. Word e Excel só lidos por código (não abertos no Office).
- **Fora desta rodada / a decidir:** o Word usa `Calibri`; a coluna "Un." (cv) do exemplo não existe (a potência é em kW); hipóteses da seção 2 são as de §8 resumidas; o relatório
  não traz memória de fórmulas passo a passo do levantamento (K, Φ do critério de lux) além das colunas da tabela.

## Fase 4 — conferência (2026-11-13, sem commit até o OK do dono)

- **Casos da planilha pelo DOCUMENTO** (`casos-planilha-documento.test.ts`): os casos 2–28, 30 e 31 passam por conteudo → resultado → relatório,
  esperados só da planilha (o 29 já estava em `montar.test.ts`; o 1 saiu na Q24). K, fluxo e iluminância final do lux (casos 11 e 12) são
  conferidos no resultado do ambiente: o relatório não tem essas colunas (decisão da Fase 3).
- **Relatório por concessionária** (`relatorio/concessionarias.test.ts`): as 7, com seções, norma principal com edição (seção 2) e na seção 7,
  nenhuma norma de outra concessionária, NBR 5410 "a confirmar" com o aviso, notas fixas só na dona (Enel, Cemig T12, Equatorial T6 × T7), FD de
  aquecimento pela tabela onde existe, e o critério de lux (catálogo, 15 colunas por pavimento, 8995-1 a confirmar).
- **Defeitos achados e corrigidos:**
  1. `comNomes` (relatório e `fatores.tsx`) trocava o id do tipo em QUALQUER trecho do rótulo; agora só "(id)".
  2. Tipo de apartamento com 0 unidades não dava a recusa do caso 19 (`tiposDoEstudo`); agora dá, e o tipo fica na lista.
  3. O relatório não mostrava o D1 pelo critério da norma quando o fator é digitado (caso 13, Pergunta 1): linha "Demanda pelo critério da norma"
     nos passos.
  4. O alerta "O levantamento foi alterado depois de trazer…" (caso 20) não chegava ao relatório; agora vai para a seção 6.
  5. Referência curta das mensagens ("NBR 5410, Tabela 40", "NT.00004, 6.11.8") não achava a norma: não entrava na seção 2 e o item sumia.
     `fonteDaReferencia` aceita o nome curto, e os avisos com referência de norma entram na seção 7 ("Aviso: …") — caso 27.
  6. `validarConteudoDoTipo` aceitava o documento do legado (`{ambientes, condicoes}`) num estudo de cargas e demanda como um estudo VAZIO
     (apagava o gravado). Agora chave de nível de cima desconhecida é recusada (`MOTIVO_CONTEUDO_DE_OUTRO_TIPO`).
- **Smoke** (`smoke:estudos`, bloco `smokeCargasDemanda`): criar, salvar, reabrir igual, nada calculado no banco, recusa do outro tipo e do FP
  1,2, versão velha, corrida, duplicar, relatório do caso 29 a partir do banco e exportação nos 3 formatos (arquivos em `SMOKE_ESTUDOS_SAIDA`).
- **Office:** o Word por COM travou invisível e foi encerrado; Excel não tentado (planilha do usuário aberta). Roteiro para o dono no
  `LEIAME.md` de `prints-auditoria/2026-11-13_fase4_cargas-demanda/`. PDF do lux renderizado e conferido (15 colunas cabem).
- **Manual:** `docs/manual/projetos/estudo-cargas-e-demanda.md` (+ README da seção e `search-index.json`).
- **Normas futuras não citadas (decisão do dono, 2026-11-13, "conforme recomendado"):** NDU-042 (Energisa) e Nota Técnica 004/2026
  (Equatorial) não dão valor à calculadora, então NÃO entram na lista da seção 2; a seção 6 ("Edição das normas") avisa, só na concessionária
  dona: "<título> (<edição>) vale a partir de <data>. A calculadora não usa valores desta norma; confira se o estudo é afetado." Depois da
  data: "está em vigor desde <data>". Tudo do `FonteNorma` (`avisosDeNormasFuturas`, `relatorio/fontes.ts`); nada resume o conteúdo da norma.
- **Cosmético:** no PDF (renderizador comum) um subtítulo pode ficar sozinho no pé da página ("Total do levantamento").
