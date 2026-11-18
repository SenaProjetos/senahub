# Calculadora de cargas e demanda

Especificação para implementação no SenaHub. Versão definitiva, 10/11/2026.

## 1. Identificação

- Nome da ferramenta: Calculadora de cargas e demanda (nome de trabalho; final a confirmar com o dono do sistema).
- Nova ou mudança: **nova**. Novo tipo de estudo na aba Estudos de cada projeto. Reaproveita o comportamento da calculadora "Corrente e Demanda" (corrente de projeto, corrente corrigida, FCT e FCA).
- O que fica igual: aba Estudos, botão Salvar, situação "em validação" (só a gestão de ferramentas vê até a validação) e a exportação de relatório.
- Disciplina: Elétrico.
- Tipo: Completa (tem memória de cálculo, não tem desenho DXF). Enquadramento a confirmar com a equipe.
- Engenheiro responsável pelo conteúdo: Tadrio, Sena Projetos.
- Pacote que a equipe recebe:
  1. este documento;
  2. anexos A a G, um por concessionária;
  3. planilha de casos de teste (`casos-de-teste-demanda-preliminar.xlsx`);
  4. exemplo de relatório em Word e em Excel (`relatorio-exemplo-calculadora`);
  5. desenho das telas (canvas com 11 telas: fluxo em 4 etapas, demanda por concessionária e apart-hotel);
  6. PDFs das normas e dos catálogos.
- Normas, com edição (detalhes nos anexos):

| Fonte | Edição | Anexo |
|---|---|---|
| ABNT NBR 5410 | 2004 (existe edição mais recente, com poucas mudanças; a 2004 é a adotada, com aviso na tela); item 9.5.2 (habitação); Tabelas 33, 35 a 45, 47, 48 e 58 | neste documento |
| ABNT NBR ISO/CIE 8995-1 | 2013, 1ª edição (21/03/2013); seção 5 (atividades e Em); anexo D (Fm, informativo) | neste documento |
| Disjuntores (série de correntes nominais) | Schneider Acti9 (12/2025), WEG DWB e DWA (06/2025) e Schneider Easy9 (via distribuidoras) | neste documento |
| Neoenergia (Coelba, Pernambuco, Cosern, Elektro, Brasília) | DIS-NOR-053 Rev. 06 (09/09/2025); DIS-NOR-030 Rev. 07 (17/04/2026); DIS-NOR-066 Rev. 01 (16/12/2025) | A |
| Equatorial | NT.00004 Rev. 08 (30/12/2025); NT.00001 Rev. 09 com Nota Técnica 004/2026 (integral em 24/02/2027); NT.00042 Rev. 04 (26/12/2025) | B |
| Cemig | ND-5.2 e ND-5.1 (03/2026); ND-5.3 (09/2023); ND-5.5 (edição enviada, sem versão mais recente localizada) | C |
| Celesc | N-321.0003 (12/2023); I-321.0043 (31/10/2025); N-321.0002 (05/2016, sem versão mais recente localizada) | D |
| Copel | NTC 900600 (edição não identificada); NTC 841001 (3ª edição, 12/1999, anexo 7, fatores de demanda); NTC 901110 (07/2026); NTC 901100 (07/2020); NTC 903100 (04/2018); NTC 902210 (13/12/2025) | E |
| Enel (Ceará, Rio de Janeiro, São Paulo) | 0018 v02 (08/09/2025); 0017 v02 (06/03/2025); 0004 v05 (20/12/2024); 0280 v02 (26/05/2023) | F |
| Energisa | NDU-003 v8.1 (02/2025); NDU-001 v7.0 (11/2024); NDU-042 v2.1 (vigência a partir de jan/2027) | G |

As edições enviadas são as mais recentes que o usuário encontrou. Algumas normas ainda não foram compradas; a biblioteca mantém as edições enviadas e a tela avisa quando uma edição está "a confirmar".

## 2. Para que serve

- **O que resolve:** num estudo preliminar, sem planta de pontos, a calculadora percorre todas as etapas: levantamento de iluminação e de tomadas por ambiente, carga instalada, demandas pelo critério da concessionária escolhida e entrada (flat individual, centros de medição e CPG), com corrente, disjuntor e seção do cabo sugeridos. Avisa o tipo de atendimento esperado (baixa ou média tensão, subestação aérea ou abrigada, espaço para transformador). No fim, o engenheiro confere os dados, informa o CREA e gera um Word e uma planilha Excel para anexar ao memorial de cálculo ou descritivo do projeto.
- **Fase do projeto:** estudo preliminar. O projeto luminotécnico e a planta de pontos recebidos depois prevalecem.
- **O que não faz / quando não usar:**
  - não substitui o projeto;
  - não verifica queda de tensão (verificar no projeto básico);
  - não escolhe transformador nem calcula correção de fator de potência;
  - não verifica coordenação com a proteção nem a divisão de circuitos (NBR 5410, 9.5.3);
  - não calcula tomadas fora de habitação (o projetista digita);
  - não compara concessionárias: cada estudo usa só o método e os valores da concessionária escolhida;
  - não decide a concessionária nem a edição da norma;
  - não oferece valor de demanda para a Enel (as normas vigentes não trazem método);
  - não vale para atendimento a partir de 69 kV;
  - todo valor de norma fica "a conferir" até a validação de um engenheiro.

## 3. Estrutura, vínculos, interface e entradas

### 3.1 Estrutura da calculadora e vínculos entre etapas

A calculadora é dinâmica: o **conjunto de informações é o mesmo para todas as concessionárias**, e as colunas e campos do método de demanda mudam conforme a concessionária escolhida no início do estudo.

**Etapa 1, Levantamento.** Um ou mais levantamentos (ex.: Flat tipo A, Condomínio, Escola). Cada um tem pavimentos e ambientes, com iluminação (1A) e tomadas (1B, várias linhas de TUG e TUE por ambiente).

**Etapa 2, Cálculos de demanda.** Cada cálculo é um bloco reutilizável, com:
- nome;
- método: carga instalada, área útil (conforme a concessionária) ou composição;
- **escopo**: de quais levantamentos vêm as cargas e a **quantidade (× N)**;
- linhas de carga por tipo, com quantidade, potência, FP e FD;
- fatores do método;
- resultado em kVA.

A mesma tabela de carga instalada se repete quantas vezes for preciso (flat tipo, condomínio, incêndio, lojas, unidade individual, e o conjunto do CMD ou do CPG quando a norma pedir carga instalada sobre o conjunto). Cada uso tem resultado próprio. Linhas com **FD por faixa de carga** (por exemplo, 100% nos 10 kW iniciais e 20% nos seguintes) mostram a divisão da carga em faixas, com o FD e a demanda de cada uma.

**Etapa 3, Centros de medição e entradas.**
- Cada **CMD** tem uma **capacidade de medidores** (digitada pelo projetista) e uma **lista de medidores**: residencial (tipo de apartamento e quantidade), condomínio, incêndio e outros. Qualquer combinação é permitida, inclusive CMDs só de incêndio ou só de condomínio.
- **Demanda do CMD:** soma do que há nele. Os apartamentos do CMD são calculados pelo método da área útil **com a quantidade de apartamentos daquele CMD**, e os fatores (coincidência, segurança) são refeitos para essa quantidade. Condomínio e incêndio entram por carga instalada, se o medidor deles estiver no CMD.
- **Demanda do CPG:** soma de tudo. Os apartamentos de todos os CMDs são calculados pelo método da área útil com o **total de apartamentos do prédio**, mais condomínio, incêndio e cargas especiais por carga instalada. Não é a soma das demandas dos CMDs.
- **Apart-hotel na Equatorial:** tudo por carga instalada, em todos os níveis.
- Em cada flat, CMD e CPG: corrente, disjuntor e seção do cabo sugeridos e editáveis, e avisos de atendimento.

**Regras de vínculo**
1. **Trazer do levantamento.** As linhas do cálculo recebem os totais do levantamento do escopo: iluminação total (W, VA e FP), tomadas de uso geral total (quantidade, VA e W) e cada tipo de TUE (descrição, quantidade, VA e W). A linha mostra "do levantamento".
2. **O projetista completa o que não vem:** tipo de carga, FD e FP, e as cargas que não estão no levantamento (aquecimento, motores, ar-condicionado, recarga).
3. O valor trazido é **editável**. Se for editado, a linha mostra "diferente do levantamento". Se o levantamento mudar depois, a calculadora avisa e oferece atualizar. Ela **nunca sobrescreve sozinha**.
4. A quantidade (× N) multiplica o escopo. O FD por nº de aparelhos **conta os aparelhos do escopo**, e não a soma dos cálculos individuais.
5. A etapa 3 puxa as definições dos cálculos de apartamentos (tipos, áreas e kVA por apartamento) e recalcula os fatores por CMD e para o CPG. Alterar um fator no cálculo geral **não** altera os CMDs: cada nível tem a sua sugestão, editável.
6. O resultado de um flat individual **não entra** no CMD nem no CPG, a menos que o projetista o inclua.

### 3.2 Interface e comportamento (layout validado)

- **Formato:** aplicativo dentro do SenaHub, em tela única, com as etapas 1, 2 e 3 navegáveis por botões no topo. Painel de resumo e avisos ao lado nas etapas 2 e 3. Botões Salvar e Exportar. Telas desenhadas: levantamento de habitação, levantamento por lux, demandas (Neoenergia), centros e entradas, demanda de Equatorial, Cemig, Celesc, Copel, Enel e Energisa, e apart-hotel da Equatorial.
- **Cores dos campos:** branco = o projetista preenche; azul = valor sugerido, pode alterar; cinza = calculado; âmbar = alerta ou campo obrigatório sem valor padrão (borda âmbar e a palavra "digite").
- **A tela não mostra a fonte.** Norma, tabela e item **não aparecem na tela**; aparecem só no relatório. As mensagens de aviso não citam norma. **Exceção:** o aviso de edição da norma (item 6) cita a norma e a edição, para o projetista verificar.
- **Colunas ao conteúdo:** colunas de valor curto (quantidade, FP, FD, unidade, área, perímetro, VA, W) são estreitas; colunas de texto (ambiente, tipo, descrição, atividade, tipo de carga) ocupam o espaço restante. Os textos das tabelas são centralizados e os títulos de coluna podem quebrar em duas linhas.
- **Linhas reordenáveis:** cada linha tem uma alça discreta no canto esquerdo da primeira célula, para arrastar e mudar a ordem (ambientes, tipos de apartamento, cargas, tomadas de uso específico, medidores). Uma linha nova entra no fim e pode ser movida para qualquer posição. A ordem da tela é a ordem do relatório. A alça deve ter alternativa de teclado (mover para cima e para baixo).
- **Linha de total:** as tabelas de cálculo têm uma linha de total no fim. Enquanto o FP de alguma linha estiver em branco, o total mostra "—" e a tela avisa.
- **Layout por concessionária:** os campos do método mudam (item 3.4); o conjunto de informações é comum.
- **Apart-hotel:** com o tipo "MUC com uso hoteleiro", a Equatorial usa **carga instalada** nos apartamentos (escopo: levantamento do apartamento × número de unidades) e a calculadora avisa se o projetista escolher área útil. Nas demais concessionárias as normas lidas não trocam o método; o projetista escolhe.
- **Responsável técnico:** na etapa 3, antes do relatório, campos "Nome do engenheiro", "CREA (número)" e "UF" e a caixa "Conferi os dados e os valores sugeridos e assumo a responsabilidade por este estudo". A calculadora não valida o CREA. Sem a declaração ou sem o CREA, o relatório sai, marcado como "Dados não conferidos por responsável técnico".
- **Exportação:** botões "Baixar Word" e "Baixar Excel" na etapa 3. PDF conforme o padrão das demais ferramentas.

### 3.3 Entradas

Convenção: "sem padrão" = o projetista sempre digita, e a calculadora avisa até ele digitar. Faixas marcadas [palpite] são propostas, para o engenheiro aprovar.

| Bloco | Campo | Símbolo | Unidade | Obrig. | Valor padrão | Origem do padrão | Faixa válida | Fora da faixa |
|---|---|---|---|---|---|---|---|---|
| Estudo | Concessionária (e distribuidora) | — | lista | Sim | — | sem padrão | lista dos anexos A a G | recusar |
| Estudo | Tipo de empreendimento | — | lista (individual; MUC residencial; MUC com uso hoteleiro; misto; coletivo não residencial) | Sim | — | sem padrão | lista | recusar |
| Estudo | Tensão e ligação | V | 127, 220 ou 380; mono, bi ou trifásica | Sim | — | sem padrão | lista | recusar |
| Estudo | Critério de iluminação (habitação ou lux) | — | lista | Sim | habitação em residência e flat; lux nos demais | prática da casa | lista | — |
| Levantamento | Nome do levantamento; pavimentos | — | texto | Sim | — | sem padrão | — | recusar |
| Ambiente | Nome; atividade (lux) | — | texto; lista da 8995-1 | Sim | — | sem padrão | — | recusar |
| Ambiente | Tipo (habitação): banheiro; cozinha, copa, copa-cozinha, área de serviço, lavanderia e análogos; varanda; sala; dormitório; demais cômodos | — | lista | Sim (habitação) | — | sem padrão | lista | recusar |
| Ambiente | Área | A | m² | Sim | — | sem padrão | maior que 0 | recusar |
| Ambiente | Perímetro | P | m | Sim | — | sem padrão | P ≥ 4·√A [palpite] | avisar |
| Ambiente | Pé-direito (único no estudo, editável) | — | m | Sim | — | sem padrão | maior que 0 | recusar |
| Ambiente | Altura do plano de trabalho (por ambiente) | — | m | Sim (lux) | — | sem padrão | maior que 0 e menor que o pé-direito | recusar |
| Lux | Iluminância mantida mínima da atividade | Em | lux | Sim | sugerida pela tabela de atividades (editável) | NBR ISO/CIE 8995-1:2013, seção 5 | maior que 0 | recusar |
| Lux | Fator de utilização | Fu | — | Sim | — | sem padrão | maior que 0 e até 1 | recusar |
| Lux | Fator de manutenção | Fm | — | Sim | — | sem padrão (ajuda: exemplos do anexo D da 8995-1) | maior que 0 e até 1 | recusar |
| Lux | Luminária: fluxo; potência; FP | Φ; P; FP | lm; W; — | Sim | — | sem padrão (catálogo do fabricante) | maiores que 0; FP até 1 | recusar |
| Lux | Quantidade de luminárias escolhida | N | un | Sim | quantidade sugerida | cálculo | inteiro maior ou igual a 0 | recusar |
| Tomadas | Tipo de ponto (TUG, TUE ou outro); quantidade | — | texto; un | Sim | habitação: mínimo da NBR 5410 9.5.2.2.1; fora: sem padrão | norma; sem padrão | inteiro maior ou igual a 0 | recusar; avisar se abaixo do mínimo (habitação) |
| Tomadas | Potência por ponto; FP | — | VA; — | Sim | habitação: NBR 5410 9.5.2.2.2; fora: sem padrão | norma; sem padrão | maior que 0; FP até 1 | recusar; avisar se abaixo do mínimo (habitação) |
| Cálculo | Nome do cálculo | — | texto | Sim | — | sem padrão | — | recusar |
| Cálculo | Método (carga instalada; área útil; composição) | — | lista (conforme a concessionária) | Sim | — | sem padrão | lista | recusar |
| Cálculo | Escopo: levantamentos que alimentam e quantidade | × N | texto; inteiro | Sim | × 1 | prática da casa | N inteiro maior ou igual a 1 | recusar |
| Cálculo | Linhas de carga: tipo, quantidade, potência, FP, FD; vinculada ao levantamento (sim ou não) | — | — | Sim | trazidas do levantamento quando existirem | levantamento | maiores que 0; FP até 1 | recusar |
| Cargas especiais | Aquecimento: potência; quantidade | — | kW; un | Não | — | sem padrão | maiores que 0 | recusar |
| Cargas especiais | Motores: cv; quantidade; ligação; reservas | — | cv; un | Não | — | sem padrão | maiores que 0 | recusar |
| Cargas especiais | Ar-condicionado: potência; quantidade | — | kW ou BTU/h; un | Não | tabela da concessionária, quando houver | norma da concessionária | maiores que 0 | recusar |
| Cargas especiais | Recarga: quantidade; potência por ponto; individual ou coletiva; com ou sem gerenciamento | — | un; kW | Não | potência típica da concessionária, quando houver | norma da concessionária | maiores que 0 | recusar |
| Demanda | Apartamentos: quantidade e área útil por tipo | — | un; m² | Sim (MUC) | — | sem padrão | área maior que 0 | recusar |
| Demanda | FD por carga e fatores do método (diversidade, segurança, multiplicadores), por cálculo e por nível (CMD e CPG) | — | — | Sim | sugerido pela norma da concessionária; Enel: em branco | norma; sem padrão (Enel e onde a norma não traz) | maior que 0 | recusar; avisar se abaixo do valor da norma |
| Demanda | FP por tipo de carga | — | — | Sim | pela norma da concessionária | norma | maior que 0 e até 1 | recusar |
| Centros | Capacidade do CMD | — | medidores | Sim | — | sem padrão | inteiro maior que 0 | recusar |
| Centros | Medidores do CMD: tipo (residencial, condomínio, incêndio, outros), descrição, quantidade | — | texto; un | Sim | — | sem padrão | inteiro maior ou igual a 0 | recusar; avisar se passar da capacidade |
| Entrada | Método de instalação | — | lista (Tabela 33) | Sim | — | sem padrão | lista | recusar |
| Entrada | Isolação (PVC 70 °C ou EPR/XLPE 90 °C); material (cobre ou alumínio); nº de condutores carregados (2 ou 3) | — | lista | Sim | — | sem padrão | lista | recusar |
| Entrada | Temperatura (ambiente; do solo no método D) | — | °C | Sim | 30 (ar) e 20 (solo), referências da tabela | NBR 5410, Tabela 40 | valores da tabela | recusar, ou o projetista digita o FCT |
| Entrada | Fator de agrupamento | FCA | — | Sim | sugestão da Tabela 42 (linha do método) | NBR 5410 | maior que 0 e até 1 | avisar |
| Entrada | Resistividade térmica do solo (opcional) | — | K·m/W | Não | 2,5 | NBR 5410, Tabela 41 | 1 a 3 | avisar |
| Entrada | Disjuntor adotado | In | A | Não | menor valor da série (item 4.5) maior ou igual a Ib | catálogos Schneider e WEG | maior que 0 | avisar |
| Responsável | Nome do engenheiro; CREA (número) e UF | — | texto; lista | Não (obrigatório só para o relatório "conferido") | — | sem padrão | — | avisar |
| Responsável | Declaração de conferência | — | caixa de marcar | Não | desmarcada | — | — | — |

Campos de escolha em lista: cada opção muda a tabela consultada (concessionária: fórmula, tabelas e limites; método de instalação: Tabelas 36 e 37 para A1 a D, 38 e 39 para E a G; nº de condutores carregados: coluna da tabela).

### 3.4 Campos próprios do método por concessionária (telas desenhadas)

| Concessionária | Campos que o método expõe na tela |
|---|---|
| Neoenergia | kVA por apartamento, fator de coincidência, fator de segurança; condomínio por carga instalada |
| Equatorial | kVA por apartamento, fator de diversificação, multiplicador 1,2; condomínio por carga instalada; cartão de recarga; apart-hotel por carga instalada (FD de iluminação e tomadas por faixa de carga, FD de aparelhos por quantidade) |
| Cemig | kVA por apartamento, fator de multiplicação (acima de 3 apartamentos), fator de segurança 1,4; áreas comuns com FD por faixa |
| Celesc | kVA por unidade, diversidade; condomínio (iluminação por faixa, tomadas 20%) dentro do fator k 1,20; cargas especiais e comerciais fora do k |
| Copel | área média ponderada, kVA por unidade, diversidade; condomínio com tabela de motores (potência × quantidade); fator multiplicador do projetista; FD sugeridos pelo anexo 7 da NTC 841001 |
| Enel | campos em branco: cômodos com módulo, divisor, fator de localização; medição agrupada com demanda por unidade, serviço e fator do ramal |
| Energisa | kW por unidade (não kVA), fator de multiplicação, constantes 1,3 (1,52 em duplex) e 1,1 (lojas); cargas especiais fora da constante |

## 4. Tabelas usadas

Os valores integrais estão nos PDFs das normas e dos catálogos, que seguem junto com este documento. A planilha de casos de teste traz os valores usados nos testes.

**4.1 NBR 5410:2004, correntes e fatores**

| Tabela | Chave | Resultado |
|---|---|---|
| 33 | tipo de linha | método de instalação e de referência (A1, A2, B1, B2, C, D, E, F, G) |
| 35 | tipo de isolação | temperaturas características |
| 36 e 37 | seção, método A1 a D, material, 2 ou 3 condutores carregados | capacidade de condução (A), PVC e EPR/XLPE |
| 38 e 39 | seção, método E, F ou G, material | capacidade de condução (A) |
| 40 | temperatura do ambiente ou do solo, isolação | FCT |
| 41 | resistividade do solo | fator |
| 42 a 45 | forma de agrupamento e nº de circuitos | FCA |
| 47, 48, 58 | uso do circuito; seção da fase | seção mínima; neutro; proteção |

- Entre dois valores: não interpola. A seção sugerida é a menor com capacidade maior ou igual à corrente corrigida; o FCT usa só valores da tabela (ou o projetista digita).
- Valor fora da tabela: recusa (temperatura) ou o projetista digita o fator. Na linha enterrada (método D) vale a coluna do solo da Tabela 40.

**4.2 Concessionárias.** Estrutura de cada tabela nos anexos A a G. Entre faixas: valor da faixa, sem interpolação. Área acima da tabela: usar a fórmula da norma onde existe (Equatorial, Celesc, Copel); onde não (Neoenergia, Cemig), avisar "consultar a concessionária".

**4.3 Habitação, NBR 5410:2004, item 9.5.2** (texto lido na cópia da ABNT; o engenheiro valida). Vale para habitação, incluindo flats e apart-hotéis (acomodações) (9.5.1).
- **Iluminação (9.5.2.1.2):** área até 6 m², 100 VA; acima de 6 m², 100 VA nos 6 m² iniciais mais 60 VA a cada 4 m² inteiros acrescidos. É critério alternativo à antiga NBR 5413 e vale para dimensionar circuitos, não é a potência nominal das lâmpadas.
- **Ponto de luz (9.5.2.1.1):** pelo menos 1 ponto fixo no teto por cômodo, comandado por interruptor (informativo).
- **Nº de tomadas (9.5.2.2.1):**
  - banheiro: 1, junto ao lavatório;
  - cozinha, copa, copa-cozinha, área de serviço, cozinha-área de serviço, lavanderia e análogos: 1 a cada 3,5 m ou fração de perímetro, com pelo menos 2 acima da bancada da pia;
  - varanda: 1 (pode ficar fora se a área for menor que 2 m² ou a profundidade menor que 0,80 m);
  - sala e dormitório: 1 a cada 5 m ou fração de perímetro;
  - demais cômodos: até 6 m², 1 (até 2,25 m² pode ser fora, a até 0,80 m da porta); acima de 6 m², 1 a cada 5 m ou fração de perímetro.
- **Potência por ponto (9.5.2.2.2):** banheiro, cozinha e ambientes análogos: 600 VA por ponto até 3 pontos e 100 VA nos excedentes, por ambiente. Se o conjunto desses ambientes passar de 6 pontos, admite-se 600 VA até 2 pontos e 100 VA nos demais. Demais ambientes: 100 VA por ponto.
- **Aquecimento elétrico de água (9.5.2.3):** ligação direta, sem tomada.

**4.4 Iluminação, NBR ISO/CIE 8995-1:2013, seção 5.**
- Estrutura: tipo de ambiente, tarefa ou atividade; **Em (lux, iluminância mantida)**; UGRL; Ra; observações. 29 categorias numeradas (1 áreas gerais da edificação; 22 escritórios; 23 varejo; 24 restaurantes e hotéis; 28 construções educacionais; 29 locais de assistência médica etc.).
- A calculadora usa só o Em. Atividade não listada: a norma manda adotar o valor de situação similar; o projetista escolhe uma similar ou digita o Em.
- Anexo D (informativo): exemplos de Fm para lâmpadas fluorescentes e fluorescentes compactas (0,80; 0,67; 0,57; 0,50, conforme ambiente e ciclo de manutenção), como texto de ajuda. O Fm continua digitado.

**4.5 Série de correntes nominais de disjuntores (A):** 0,5; 1; 2; 3; 4; 6; 10; 16; 20; 25; 32; 40; 50; 63; 70; 80; 90; 100; 110; 125; 150; 160; 200; 250; 320; 400; 500; 630; 650; 800; 1.000; 1.250 e 1.600.
- Fontes: Schneider Acti9 (catálogo de 12/2025), WEG DWB e DWA (catálogo de 06/2025, só disjuntores de distribuição) e Schneider Easy9 (via distribuidoras). Valores de gerador e de motor não entram.
- Nos disjuntores de disparo ajustável, o valor In do catálogo é o máximo de ajuste; a regulagem fica com o projetista.
- O disjuntor adotado é digitado; a série só alimenta a sugestão.

## 5. Cálculo passo a passo

| Passo | Grandeza | Fórmula | Unidade | Referência | Observação |
|---|---|---|---|---|---|
| 1 | Altura útil | h = pé-direito − altura do plano | m | — | |
| 2 | Índice do recinto | K = 2·A ÷ (h·P) | — | prática da casa (ambiente retangular) | só para consultar o Fu no catálogo |
| 3 | Fluxo necessário | Φ = Em·A ÷ (Fu·Fm) | lm | NBR ISO/CIE 8995-1 (Em mantido); método do fluxo total | Em sugerido pela atividade |
| 4 | Quantidade sugerida | N = arredondar para cima (Φ ÷ Φ da luminária) | un | — | |
| 5 | Iluminância final | E = N escolhido · Φ · Fu · Fm ÷ A | lux | — | |
| 6 | Potência de iluminação | P = N · P da luminária; S = P ÷ FP | W; VA | — | colunas W e VA separadas |
| 7 | Habitação: iluminação | A ≤ 6 m²: 100 VA. A > 6 m², sugerido: 100 + 60 · arredondar para cima ((A − 6) ÷ 4). Mínimo da norma: 100 + 60 · parte inteira de ((A − 6) ÷ 4) | VA | NBR 5410, 9.5.2.1.2 | o alerta compara com o mínimo da norma; a folga é decisão do usuário |
| 8 | Habitação: nº mínimo de tomadas | banheiro: 1; cozinha e análogos: maior entre arredondar para cima (P ÷ 3,5) e 2; varanda: 1; sala e dormitório: arredondar para cima (P ÷ 5); demais cômodos: A ≤ 6 m², 1, e A > 6 m², arredondar para cima (P ÷ 5) | un | NBR 5410, 9.5.2.2.1 | o piso de 2 da cozinha conta dentro do total (decisão do usuário) |
| 9 | Habitação: potência mínima por ambiente | grupo banheiro, cozinha e análogos, n pontos: 600 · mín(n; 3) + 100 · máx(n − 3; 0); demais: 100 · n | VA | NBR 5410, 9.5.2.2.2 | alternativa admitida quando o conjunto passa de 6 pontos: 600 · mín(n; 2) + 100 · máx(n − 2; 0), escolhida pelo projetista |
| 10 | Potência de tomadas | W = VA × FP | W | — | |
| 11 | Totais do levantamento | soma por tipo (iluminação, TUG, cada TUE) | W; VA | — | disponíveis para trazer |
| 12 | Trazer do levantamento | linhas do cálculo = totais do escopo (passo 11) | W; VA | — | vínculo editável, sem sobrescrever |
| 13 | Carga instalada do escopo | soma das linhas × N | kW; kVA | — | |
| 14 | Demanda por carga instalada | D = Σ (P · FD ÷ FP) | kVA | norma da concessionária | FD escolhido pela contagem e pelas faixas do **escopo**; formas: fixo, faixa inteira, progressivo por faixa de carga (kW ou kVA), nº de aparelhos, maior e demais, duas chaves, motores por potência e quantidade |
| 15 | Demanda dos apartamentos (MUC) | pelo método da concessionária, com os fatores para a quantidade de apartamentos do nível (CMD ou CPG) | kVA | anexos A a G | apart-hotel na Equatorial: apartamentos pela carga instalada |
| 16 | Demanda do condomínio, incêndio, comercial, cargas especiais e recarga | carga instalada | kVA | anexos | recarga: FD da norma |
| 17 | Demanda de cada CMD | apartamentos do CMD (área útil, quantidade do CMD) + cálculos de carga instalada dos medidores que estão no CMD | kVA | anexos | |
| 18 | Demanda do CPG | apartamentos de todos os CMDs (área útil, total de apartamentos) + condomínio + incêndio + cargas especiais | kVA | anexos | não é a soma das demandas dos CMDs |
| 19 | Corrente | Ib = P_abs ÷ (k·V·fp) no circuito; I = S ÷ (k·V) no CMD e CPG; k = 1 (mono) ou √3 | A | calculadora existente | |
| 20 | Corrente corrigida | Ib′ = Ib ÷ (FCT × FCA) | A | NBR 5410, Tabelas 40 a 45 | |
| 21 | Disjuntor | menor valor da série (item 4.5) maior ou igual a Ib | A | catálogos Schneider e WEG | adotado digitado pelo projetista |
| 22 | Seção | menor seção com capacidade maior ou igual a Ib′, no método, isolação, material e nº de condutores escolhidos | mm² | NBR 5410, Tabelas 36 a 39 | sem interpolação |
| 23 | Seção mínima | maior entre a seção do passo 22 e a mínima do uso | mm² | NBR 5410, Tabela 47 | |
| 24 | Neutro e proteção (opcional) | Tabelas 48 e 58 | mm² | NBR 5410 | sugestão |
| 25 | Avisos de atendimento | comparar demanda e carga instalada com os limites da concessionária | — | anexos | |

- Arredondamento: cálculo em precisão total, exibição com 2 casas decimais em todo valor, tolerância de ±0,01 nos testes. Diferenças de arredondamento das normas (por exemplo Neoenergia, 2,18 para 2,20) são registradas.
- Escolhas: disjuntor e seção são sugestões "calculado", editáveis. Regra de escolha nos passos 21 a 23.
- Exemplo de conferência (Neoenergia, 52 apartamentos de 40 m² em 3 CMDs de 18 medidores): CMD 1 = 29,21 kVA, CMD 2 e 3 = 23,82 kVA, CPG = 55,16 kVA.

## 6. Verificações e alertas

O texto da coluna "Mensagem na tela" é o que aparece na tela, sem norma, edição ou item (exceto o alerta de edição da norma). A coluna "Referência" vai só para o relatório.

| Condição | Tipo | Mensagem na tela | Referência (só no relatório) |
|---|---|---|---|
| Campo obrigatório vazio ou sem padrão | recusa | Informe o valor de {campo}. Não há valor padrão para esta concessionária. | regra da casa |
| Área menor ou igual a zero | recusa | Área inválida. Informe um valor maior que zero (m²). | — |
| FP fora de 0 a 1 | recusa | Fator de potência inválido. Informe um valor maior que 0 e até 1. | — |
| Nº de apartamentos inválido | recusa | Número de apartamentos inválido. Informe um número inteiro maior que zero. | — |
| Quantidade (× N) do escopo inválida | recusa | Quantidade inválida. Informe um número inteiro maior ou igual a 1. | — |
| Temperatura fora da Tabela 40 | recusa | Temperatura fora da tabela para esta isolação. Informe um FCT manualmente ou escolha outra isolação. | NBR 5410, Tabela 40 |
| Cálculo sem escopo | alerta | Este cálculo não tem escopo. Escolha o levantamento ou digite as cargas. | — |
| CMD sem medidores | alerta | Este CMD não tem medidores. Adicione ao menos um. | — |
| CMD acima da capacidade | alerta | O CMD tem {x} medidores; a capacidade informada é {y}. | — |
| Apartamentos sem CMD ou a mais | alerta | Há {n} apartamentos sem CMD. (ou: Há {n} apartamentos a mais nos CMDs do que no cálculo.) | — |
| Cálculo em mais de um CMD [palpite] | alerta | O cálculo {nome} está em mais de um CMD. | — |
| Levantamento alterado depois de trazer | alerta | O levantamento foi alterado depois de trazer os valores. Atualize o cálculo. | — |
| Valor trazido editado | informativo | Valor diferente do levantamento. | — |
| FP em branco impede o total | informativo | A soma aparece quando os FP de todas as linhas estiverem preenchidos. | — |
| Perímetro menor que 4·√A [palpite] | alerta | Perímetro incompatível com a área informada. Confira os valores. | — |
| Atividade não listada na 8995-1 | informativo | Atividade não listada. Adote o valor de situação similar ou digite o Em. | NBR ISO/CIE 8995-1 |
| Iluminância final abaixo de Em | alerta | Iluminância final inferior ao mínimo da atividade. | NBR ISO/CIE 8995-1 |
| Iluminação abaixo do mínimo (habitação) | alerta | Carga de iluminação inferior ao mínimo ({mínimo} VA). | NBR 5410, 9.5.2.1.2 |
| TUG abaixo do mínimo (habitação) | alerta | Quantidade de tomadas inferior ao mínimo ({mínimo}). | NBR 5410, 9.5.2.2.1 |
| Potência por tomada abaixo do mínimo (habitação) | alerta | Potência por tomada inferior ao mínimo ({mínimo} VA). | NBR 5410, 9.5.2.2.2 |
| Valor digitado abaixo do valor da norma | alerta | O valor digitado ({x}) é inferior ao critério da {concessionária} ({y}). Mantido como digitado. | anexos |
| Apart-hotel com área útil (Equatorial) | alerta | Para apart-hotel, esta concessionária usa carga instalada, e não área útil. | NT.00004, 6.11.8 |
| FCT × FCA menor que 0,5 | alerta | Fator de correção combinado abaixo de 0,5. Verifique as condições de instalação. | calculadora existente |
| Linha enterrada (método D) | alerta | Linha enterrada: use a coluna do solo da tabela de fator de temperatura (referência 20 °C). | NBR 5410, Tabela 40 |
| Corrente acima da série de disjuntores | alerta | Corrente acima da série cadastrada (1.600 A). Informe o disjuntor adotado. | item 4.5 |
| Seção digitada menor que a calculada | alerta | A seção digitada é menor que a calculada para a corrente corrigida. | NBR 5410, Tabelas 36 a 39 |
| Seção abaixo da mínima | alerta | Seção inferior ao mínimo ({mínimo} mm²). | NBR 5410, Tabela 47 |
| Norma com vigência futura | alerta | Esta norma vale a partir de {data}. Confirme os valores. | anexos B e G |
| **Edição da norma a confirmar** | alerta (cita a norma) | Esta calculadora usa a {norma}, edição {ano}. Confira se é a edição vigente. | todas as normas marcadas "edição a confirmar" (hoje: NBR 5410:2004, NBR ISO/CIE 8995-1:2013, ND-5.5, N-321.0002, NTC 900600) |
| Método de outra concessionária | alerta | Método de referência de outra concessionária; não exigido por {concessionária}. | anexo F e Copel |
| Tipo de atendimento | informativo | Pela demanda calculada ({x} kVA), o atendimento esperado é em {baixa ou média tensão}. Confira com a concessionária. | anexos |
| Subestação e espaço | informativo | Pela demanda calculada, o atendimento esperado é {subestação aérea ou abrigada}, com previsão de espaço para transformador. Confira com a concessionária. | anexos |
| Recarga acima do gatilho | alerta | Potência de recarga acima de {x} kW: a concessionária exige {projeto ou estudo}. | anexos |
| Seletividade da entrada (Copel) | informativo | Considere corrente de dimensionamento não inferior à de 26 kVA mais a demanda do condomínio. | anexo E |
| Escopo da seção do cabo | informativo | Seção sugerida pela capacidade de condução, sem queda de tensão. Verificar no projeto básico. | decisão do usuário |
| Responsável técnico não preenchido | alerta | Responsável técnico e CREA não preenchidos. O relatório sai marcado como não conferido. | — |

## 7. Saídas

- **Na tela:** todas as grandezas com 2 casas decimais: potência (W e VA), carga instalada (kW), demanda (kVA), corrente (A), FCT, FCA, seção (mm²), disjuntor (A). Painel de resumo e avisos. A tela não mostra a fonte dos valores.
- **Relatório (memória de cálculo):** dados de entrada, hipóteses, fórmulas, tabelas consultadas, **fonte de cada valor (norma, edição e item)**, origem de cada fator (norma, prática da casa ou digitado), avisos com a referência, nota de escopo da seção do cabo e o bloco do responsável técnico (nome, CREA e UF, data da conferência e declaração). Marca "método de referência de outra concessionária" e "prática informada pelo usuário" quando aplicável. A ordem das linhas segue a da tela.
- **Formato do Word (.docx):** página A4, margens estreitas (1,5 cm), fonte de 8 a 9 pt, sem espaço entre parágrafos, tabelas compactas com cabeçalho cinza e valores centralizados, linhas de uma tabela na mesma página, cabeçalho de tabela repetido se a tabela passar de página, rodapé "Página X de Y". Seções: 1 identificação e responsável técnico; 2 premissas, normas e edições; 3 levantamento; 4 cálculos de demanda; 5 centros de medição e entradas (comparativo CMD 1, 2, 3 e CPG; corrente, disjuntor e cabo); 6 avisos e observações; 7 fontes dos valores. A fonte de cada valor fica na seção 7 e na tabela de normas, e não repetida nas tabelas de cálculo.
- **Formato do Excel (.xlsx):** uma aba por etapa: Resumo, Levantamento, Demandas, Centros e entradas e Fontes. Mesmas tabelas, números formatados, impressão em paisagem.
- **Modelo visual:** `relatorio-exemplo-calculadora.docx` e `.xlsx`, com os dados do exemplo dos 3 CMDs.
- **Padrões de relatório por concessionária:** fora desta fase; o layout é um só por enquanto.
- **Desenho DXF:** não se aplica.
- **Exportações:** Word e Excel. PDF conforme o padrão das demais ferramentas.

## 8. Hipóteses e simplificações

- É um estudo preliminar; o projeto luminotécnico e a planta de pontos recebidos depois prevalecem.
- O método de cada concessionária é mínimo; o projetista pode usar outro, e a calculadora só avisa quando o valor digitado fica abaixo do da norma.
- Valores de norma são literais e "a conferir". A calculadora não compara concessionárias: cada estudo usa só os valores da escolhida.
- A fonte dos valores aparece só no relatório (decisão do usuário, com o dono do sistema). Exceção: aviso de edição da norma.
- Habitação: tomadas e iluminação pelo 9.5.2. A iluminação sugerida tem folga (a fração de 4 m² acima de 6 m² conta como acréscimo completo); o alerta usa o mínimo da norma. A cozinha e os ambientes análogos têm piso de 2 pontos dentro do total por perímetro. A alternativa de mais de 6 pontos (600 VA até 2 pontos) é admitida pela norma e fica a critério do projetista; o padrão é a regra geral.
- A iluminação de habitação do 9.5.2 é carga para dimensionar circuitos, não a potência das lâmpadas.
- K = 2·A ÷ (h·P) vale para ambiente retangular. Fu e Fm são digitados; o Em é sugerido pela atividade.
- Fora de habitação não há cálculo automático de tomadas.
- FP vem da norma da concessionária por tipo de carga; onde não há, é digitado.
- Soma de kVA aritmética, a favor da segurança (como na calculadora existente).
- Aparelhos de reserva não entram na carga instalada.
- Seção sugerida só pela capacidade de condução, sem queda de tensão. O disjuntor adotado é digitado; a série é de três linhas de catálogo.
- Valores trazidos do levantamento são atualizados só quando o projetista pede, e nunca sobrescrevem edição manual.
- CMD: qualquer combinação de medidores; capacidade digitada. A demanda de incêndio entra no CMD em que está o medidor de incêndio e no CPG. O CPG usa o total de apartamentos do prédio.
- Apart-hotel: só a Equatorial troca o método nas normas lidas. Na tela, o FD da iluminação e tomadas por faixa de carga (Tabela 5 da NT.00004, linha de prédios residenciais) aplica-se à soma de iluminação e tomadas; é uma leitura a confirmar com a prática da Equatorial.
- Copel: FD da carga instalada pela NTC 841001, 3ª edição (12/1999), considerada vigente pelo usuário.
- O responsável técnico confere os valores sugeridos e assume a responsabilidade ao marcar a declaração; a calculadora não valida o CREA.
- Nas normas com edição futura (NDU-042; Nota Técnica da Equatorial), usa-se a mais nova, com aviso.
- Normas canceladas por outra presente nos lotes não são usadas. Exceção por decisão do usuário: a **estrutura** da IT 263 (Enel, cancelada em 29/01/2024) com todos os valores em branco.

## 9. Casos de teste

Planilha **casos-de-teste-demanda-preliminar.xlsx** (31 casos): típicos (Copel, Neoenergia, lux, Equatorial, Energisa, vínculo com o levantamento, habitação, Em por atividade, 3 CMDs de 18 medidores), limites (bordas de tabela, bordas da habitação, 2.500 kW, escolha de seção, série de disjuntores, escopo × quantidade, FD de ar-condicionado da Copel), alertas (FCT × FCA, iluminância, abaixo do valor da norma, corrente acima da série, apart-hotel na Equatorial, capacidade do CMD, apartamentos sem CMD) e entradas inválidas (4).
- Os resultados esperados vêm de exemplos das próprias normas, do esboço da equipe, da ficha de validação existente e de cálculos conferidos pelo engenheiro.
- **Pendentes:** 4 células amarelas do caso 29 (demanda do CMD 1, CMD 2, CMD 3 e CPG), para o engenheiro calcular e conferir antes da implementação.
- Tolerância de ±0,01 (±1 em lm e lux).

## 10. Fora do escopo

- Verificação de queda de tensão, coordenação com a proteção e divisão de circuitos.
- Transformador recomendado e correção de fator de potência.
- Desenho DXF e projeto luminotécnico.
- Busca automática de catálogos de luminárias.
- Atendimento a partir de 69 kV.
- Método de demanda da Enel (as normas vigentes não trazem).
- Comparação entre concessionárias e escolha automática da concessionária.
- Padrões de relatório próprios de cada concessionária.

## 11. Dúvidas em aberto

- Melhorias de aparência, formatação, informação e função: em espera, para depois da implementação e dos primeiros testes de uso. O layout está validado.
- Limite de medidores por CMD por concessionária: não achado de forma única nas normas; hoje é digitado.
- Caso 29 da planilha: 4 células a calcular pelo engenheiro.
- Edições: as normas enviadas são as mais recentes que o usuário encontrou. NBR 5410 tem edição mais nova, com pouca mudança; a de 2004 é adotada, com aviso na tela. N-321.0001, NDU-001 e DIS-NOR-036 identificadas, não lidas a fundo.
- 8995-1: Tabela D.4 do anexo D não lida; colunas UGRL e Ra da extração com ruído (o Em foi conferido nas linhas de interesse; carregar a tabela do PDF original).
- Série de disjuntores: disponibilidade comercial e polos de cada valor não verificados.
- Método de demanda do apart-hotel na Cemig; limite de baixa para média tensão em coletivas da Cemig.
- Fator de localização da IT 263 (Enel): em branco.
- Equatorial, apart-hotel: confirmar a linha da Tabela 5 (faixas de FD) e a contagem de aparelhos por grupo na Tabela 6.
- Nota ao engenheiro que validar a biblioteca: células de tabela que destoam das demais normas: 3,06 (Neoenergia), 3,84 (Equatorial), 31,90 (Cemig), 80,89 (Celesc), e a diversidade da Neoenergia em 38, 39 e 52 apartamentos. Os valores ficam literais.
