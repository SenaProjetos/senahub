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
