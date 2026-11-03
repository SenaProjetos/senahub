/**
 * Metadados do "guia de entrada" de cada ferramenta — texto didático que
 * alimenta o cabeçalho, a legenda numerada, a caixa de unidades e a dica.
 *
 * Client-safe (sem server-only/Prisma/Node). Os desenhos esquemáticos são
 * componentes SVG (em components/ferramentas/guia/schematics), supridos pelo
 * próprio formulário; aqui ficam apenas os DADOS textuais, para o layout ser
 * consistente entre todas as ferramentas.
 */

/** Um grupo numerado de campos (ex.: "1. Geometria"). */
export type GuiaGrupoMeta = {
  /** Número de ordem exibido no badge e na legenda. */
  n: number;
  titulo: string;
  /** Explicação curta exibida na legenda lateral. */
  descricao: string;
};

export type GuiaMeta = {
  /** Linha de subtítulo abaixo do nome (o que o guia ajuda a fazer). */
  subtitulo: string;
  grupos: GuiaGrupoMeta[];
  /** Convenções de unidades (uma por linha). */
  unidades: string[];
  /** Texto da caixa de dica do rodapé. */
  dica: string;
};

/** Guia por slug de ferramenta. Vai sendo preenchido conforme cada form migra. */
export const GUIAS: Record<string, GuiaMeta> = {
  "viga-concreto": {
    subtitulo: "Guia dos dados de entrada para o predimensionamento da viga.",
    grupos: [
      { n: 1, titulo: "Geometria da viga", descricao: "Defina o formato da seção transversal e sua largura." },
      { n: 2, titulo: "Altura da viga", descricao: "Informe a altura total (h) e a altura útil (d) até o centro da armadura de tração." },
      { n: 3, titulo: "Materiais", descricao: "Selecione o tipo de aço da armadura e a resistência característica do concreto (fck)." },
      { n: 4, titulo: "Resistências (dimensionamento)", descricao: "Momento fletor de cálculo (Mk) e esforço cortante de cálculo (Vk)." },
      { n: 5, titulo: "Cargas e solicitações", descricao: "Comprimento do vão da viga e momento fletor de serviço (verificação de flecha)." },
    ],
    unidades: [
      "Comprimentos: cm (geometria) / m (vão)",
      "Resistências: MPa",
      "Momentos: kN·m",
      "Forças: kN",
    ],
    dica: "Forneça valores coerentes com seu projeto. Esses dados são usados para estimar as armaduras de tração e compressão, verificar os domínios e gerar os resultados.",
  },
  "pilar-concreto": {
    subtitulo: "Guia dos dados de entrada para o dimensionamento do pilar à flexo-compressão.",
    grupos: [
      { n: 1, titulo: "Geometria da seção", descricao: "Dimensões da seção retangular do pilar: largura (b) e altura (h)." },
      { n: 2, titulo: "Materiais e armadura", descricao: "Resistência do concreto (fck), tipo de aço, cobrimento até o eixo da barra (d') e bitola do arranjo." },
      { n: 3, titulo: "Esforços de cálculo", descricao: "Força normal (Nd) e momentos fletores nas duas direções (Mdx, Mdy), já majorados." },
      { n: 4, titulo: "Esbeltez e 2ª ordem", descricao: "Comprimentos de flambagem (ℓe,x, ℓe,y) e coeficientes αb e de interação para os efeitos de 2ª ordem." },
    ],
    unidades: [
      "Comprimentos: cm",
      "Resistências: MPa",
      "Forças: kN",
      "Momentos: kN·m",
    ],
    dica: "Nd e os momentos são valores de cálculo (já majorados). Mdx atua em torno de x (profundidade h) e Mdy em torno de y (profundidade b). α = 1 é conservador; a NBR admite de 1 a 2.",
  },
  "laje-macica": {
    subtitulo: "Guia dos dados de entrada para o cálculo da laje maciça armada em cruz.",
    grupos: [
      { n: 1, titulo: "Vinculação", descricao: "Caso de apoio das bordas (engastadas, apoiadas ou livres) segundo as tabelas de Bares–Pinheiro." },
      { n: 2, titulo: "Geometria", descricao: "Menor vão (lx), maior vão (ly) e espessura da laje (h)." },
      { n: 3, titulo: "Carregamento", descricao: "Carga total característica distribuída (p) sobre a laje." },
      { n: 4, titulo: "Materiais", descricao: "Resistência característica do concreto (fck) e tipo de aço da armadura." },
    ],
    unidades: [
      "Comprimentos: cm",
      "Carga distribuída: kN/m²",
      "Resistências: MPa",
    ],
    dica: "lx é sempre o menor vão (o cálculo usa o mínimo). p é a carga total já somada (permanente + acidental); a flecha é estimada com a seção bruta.",
  },
  "puncao": {
    subtitulo: "Guia dos dados de entrada para a verificação à punção em laje lisa.",
    grupos: [
      { n: 1, titulo: "Posição do pilar", descricao: "Pilar interno, de borda ou de canto — define o perímetro crítico e o coeficiente β." },
      { n: 2, titulo: "Geometria", descricao: "Lados do pilar (c1 na direção do momento, c2) e altura útil da laje (d)." },
      { n: 3, titulo: "Solicitações", descricao: "Força de punção (FSd) e momento desbalanceado (MSd) no contorno do pilar." },
      { n: 4, titulo: "Materiais e flexão", descricao: "Resistência do concreto (fck) e taxas de armadura de flexão da laje (ρx, ρy)." },
    ],
    unidades: [
      "Comprimentos: cm",
      "Força: kN · Momento: kN·m",
      "Resistências: MPa · Taxas: %",
    ],
    dica: "c1 é a dimensão na direção do momento (perpendicular à borda, para pilar de borda/canto). ρ é a taxa de armadura de flexão já existente na laje.",
  },
  "escada": {
    subtitulo: "Guia dos dados de entrada para o dimensionamento da escada de lance reto.",
    grupos: [
      { n: 1, titulo: "Vinculação", descricao: "Condição de apoio do lance (biapoiado ou engastado), que define os momentos." },
      { n: 2, titulo: "Geometria", descricao: "Piso (g) e espelho (e) do degrau, projeção horizontal do lance, patamar e espessura da laje (hl)." },
      { n: 3, titulo: "Cargas", descricao: "Carga de revestimento e sobrecarga de uso (q) sobre a escada." },
      { n: 4, titulo: "Materiais", descricao: "Resistência característica do concreto (fck) e tipo de aço da armadura." },
    ],
    unidades: [
      "Comprimentos: cm",
      "Cargas distribuídas: kN/m²",
      "Resistências: MPa",
    ],
    dica: "O lance horizontal é a projeção em planta (não a medida inclinada). Deixe o patamar em 0 quando não houver. A sobrecarga q segue a NBR 6120.",
  },
  "sapata-isolada": {
    subtitulo: "Guia dos dados de entrada para o dimensionamento da sapata isolada centrada.",
    grupos: [
      { n: 1, titulo: "Carga", descricao: "Carga vertical característica do pilar (Nk) que chega à fundação." },
      { n: 2, titulo: "Solo", descricao: "Tensão admissível do solo (σadm) e acréscimo estimado de peso próprio da sapata." },
      { n: 3, titulo: "Pilar", descricao: "Dimensões da seção do pilar (ap, bp) apoiado sobre a sapata." },
      { n: 4, titulo: "Sapata e materiais", descricao: "Altura da sapata (h), resistência do concreto (fck) e tipo de aço." },
    ],
    unidades: [
      "Comprimentos: cm",
      "Carga: kN · Tensão do solo: kPa",
      "Resistências: MPa · Peso próprio: %",
    ],
    dica: "Nk é a carga característica (sem majorar). A área em planta é dimensionada pela σadm; o % de peso próprio cobre o peso da própria sapata. A altura h define se a sapata é rígida ou flexível.",
  },
  "sapata-excentrica": {
    subtitulo: "Guia dos dados de entrada para sapata excêntrica isolada ou de divisa com viga de equilíbrio.",
    grupos: [
      { n: 1, titulo: "Tipo de cálculo", descricao: "Sapata excêntrica isolada (tensões no solo) ou de divisa com viga de equilíbrio (alavanca)." },
      { n: 2, titulo: "Cargas", descricao: "Isolada: carga (Nk) e momento (Mk). Divisa: cargas dos pilares (P1, P2) e distância entre eixos (ℓ)." },
      { n: 3, titulo: "Geometria", descricao: "Dimensões da sapata e dos pilares; na divisa, também a seção da viga de equilíbrio." },
      { n: 4, titulo: "Solo e materiais", descricao: "Tensão admissível do solo (σadm), resistência do concreto (fck) e tipo de aço." },
    ],
    unidades: [
      "Comprimentos: cm",
      "Cargas: kN · Momento: kN·m",
      "Tensão do solo: kPa · Resistências: MPa",
    ],
    dica: "Na sapata isolada, a excentricidade e = Mk/Nk define o diagrama de tensões (trapezoidal ou triangular). Na divisa, a viga de equilíbrio transfere a excentricidade ao pilar interno.",
  },
  "ancoragem": {
    subtitulo: "Guia dos dados de entrada para o comprimento de ancoragem e de traspasse de barras.",
    grupos: [
      { n: 1, titulo: "Barra", descricao: "Bitola (ø) e categoria do aço da barra a ancorar." },
      { n: 2, titulo: "Concreto e aderência", descricao: "Resistência do concreto (fck) e zona de aderência (boa ou má) da barra." },
      { n: 3, titulo: "Ancoragem", descricao: "Presença de gancho na extremidade e percentual de barras emendadas na mesma seção." },
    ],
    unidades: [
      "Bitola: mm",
      "Resistências: MPa",
      "Barras emendadas: %",
    ],
    dica: "A zona de aderência ruim (topo de peças altas concretadas de uma vez) reduz a aderência e aumenta lb. O gancho reduz o comprimento necessário de ancoragem.",
  },
  "recalque-fundacao": {
    subtitulo: "Guia dos dados de entrada para a estimativa de recalque de sapata (ELS).",
    grupos: [
      { n: 1, titulo: "Modo de cálculo", descricao: "Imediato elástico, imediato por fatias (Holl), adensamento primário ou compressão secundária + total." },
      { n: 2, titulo: "Carga e geometria / parâmetros da argila", descricao: "Nos modos imediatos: carga e lados da sapata. No adensamento: acréscimo de tensão, σ' inicial, H, Cc, e₀, μ, cv e drenagem. Na secundária: Cα, tempos e as parcelas já calculadas." },
      { n: 3, titulo: "Solo", descricao: "No elástico: altura da sapata, pilar, Eu e ν. Nas fatias: perfil de sondagem abaixo da base, até pelo menos 6·B." },
    ],
    unidades: [
      "Carga: kN · Comprimentos: m · Pilar: cm",
      "Tensões e Eu: kPa · cv: cm²/s",
      "ρ imediato: mm · ρ adensamento/secundário: cm",
    ],
    dica: "O recalque total é a soma imediato + adensamento + secundário: calcule cada parcela no modo próprio e reúna no modo 'compressão secundária'. Es e μ estimados são de anteprojeto — com ensaio oedométrico, use os parâmetros medidos.",
  },
  "sapata-spt": {
    subtitulo: "Guia dos dados de entrada para o pré-dimensionamento de sapata a partir do SPT.",
    grupos: [
      { n: 1, titulo: "Carga e cota", descricao: "Carga vertical do pilar, fator de majoração (peso próprio + reaterro) e profundidade da cota de apoio." },
      { n: 2, titulo: "Perfil de sondagem (SPT)", descricao: "Camadas a partir da cota de apoio, do topo para baixo: solo, NSPT e espessura. A primeira é a camada de apoio." },
    ],
    unidades: [
      "Carga: kN · Cota e espessura: m",
      "NSPT: número de golpes",
      "σadm: kPa · Lado B: cm",
    ],
    dica: "σadm ≈ N/5 (kgf/cm²) é estimativa de anteprojeto, válida só para N ≤ 20. Informe camadas até pelo menos 2B abaixo do apoio: uma camada mole dentro do bulbo governa o dimensionamento mesmo com crosta resistente na superfície.",
  },
  "estaca-spt": {
    subtitulo: "Guia dos dados de entrada para a capacidade de carga de estaca a partir do SPT.",
    grupos: [
      { n: 1, titulo: "Estaca", descricao: "Tipo de estaca (pré-moldada, hélice, escavada…) e diâmetro." },
      { n: 2, titulo: "Perfil de sondagem (SPT)", descricao: "Camadas do topo à ponta: tipo de solo, NSPT e espessura de cada camada." },
    ],
    unidades: [
      "Diâmetro: cm · Espessura: m",
      "NSPT: número de golpes",
      "Capacidade: kN",
    ],
    dica: "Liste as camadas na ordem real, do topo à ponta. A capacidade é estimada por Aoki-Velloso e Décourt-Quaresma; compare os dois métodos.",
  },
  "descida-cargas": {
    subtitulo: "Guia dos dados de entrada para o acúmulo de cargas verticais em um pilar.",
    grupos: [
      { n: 1, titulo: "Pavimentos", descricao: "Um por linha (do topo à base): nome, área de influência, carga permanente (g), sobrecarga (q) e carga extra concentrada." },
      { n: 2, titulo: "Redução da sobrecarga", descricao: "Fator de redução da carga acidental acumulada conforme o número de pavimentos." },
    ],
    unidades: [
      "Área: m² · Cargas distribuídas: kN/m²",
      "Carga extra: kN",
      "Fator de redução: 0 a 1",
    ],
    dica: "A carga extra é uma carga permanente concentrada (peso próprio de pilar, vigas, alvenaria). Fator 1,00 = sem redução da sobrecarga (NBR 6120, 6.2.2).",
  },
  "conversor-unidades": {
    subtitulo: "Guia dos dados de entrada para a conversão entre unidades técnicas.",
    grupos: [
      { n: 1, titulo: "Grandeza", descricao: "Tipo de grandeza física a converter (força, tensão, momento, vazão, ângulo…)." },
      { n: 2, titulo: "Unidades", descricao: "Unidade de origem (De) e unidade de destino (Para) da conversão." },
      { n: 3, titulo: "Valor", descricao: "Valor numérico, na unidade de origem, a ser convertido." },
    ],
    unidades: [
      "Depende da grandeza escolhida",
      "Conversão exata por fator",
    ],
    dica: "Selecione primeiro a grandeza; as listas De/Para se ajustam às unidades compatíveis. O fator de conversão aparece junto ao resultado.",
  },
  "propriedades-secao": {
    subtitulo: "Guia dos dados de entrada para as propriedades geométricas da seção.",
    grupos: [
      { n: 1, titulo: "Tipo de seção", descricao: "Forma da seção: retangular, circular, T ou poligonal (por coordenadas)." },
      { n: 2, titulo: "Dimensões", descricao: "Dimensões da forma escolhida; na poligonal, os vértices (x, y) um por linha." },
    ],
    unidades: [
      "Comprimentos: cm",
      "Áreas: cm² · Inércias: cm⁴ · Módulos: cm³",
    ],
    dica: "Calcula área, centroide, momentos de inércia, módulos resistentes e raios de giração. Na poligonal, informe os vértices em ordem (horário ou anti-horário).",
  },
  "resumo-aco": {
    subtitulo: "Guia dos dados de entrada para o quantitativo de aço (corte e dobra).",
    grupos: [
      { n: 1, titulo: "Barras", descricao: "Uma linha por bitola: diâmetro, quantidade de barras e comprimento unitário." },
      { n: 2, titulo: "Perdas", descricao: "Percentual de perda aplicado ao peso total (corte, dobra e sobras)." },
    ],
    unidades: [
      "Bitola: mm · Comprimento: m",
      "Peso: kg · Perda: %",
    ],
    dica: "O peso por metro de cada bitola segue a NBR 7480. O total com perda inclui o acréscimo informado.",
  },
  "acao-vento": {
    subtitulo: "Guia dos dados de entrada para a velocidade, pressão e força do vento.",
    grupos: [
      { n: 1, titulo: "Velocidade básica", descricao: "Velocidade básica do vento (V0) da isopleta e fator topográfico S1." },
      { n: 2, titulo: "Terreno e edificação", descricao: "Categoria de rugosidade do terreno, classe (dimensões da edificação) e cota z considerada." },
      { n: 3, titulo: "Fator estatístico", descricao: "Grupo S3 conforme a importância e a vida útil da edificação." },
      { n: 4, titulo: "Força de arrasto (opcional)", descricao: "Dimensões em planta (l1, l2), altura (h) e coeficiente de arrasto (Ca) para a força global." },
    ],
    unidades: [
      "Velocidade: m/s · Comprimentos: m",
      "Pressão: kN/m² · Força: kN",
    ],
    dica: "S2 é calculado a partir de categoria, classe e cota z. A força de arrasto é opcional: preencha l1, l2, h e Ca apenas se quiser a força global.",
  },
  "combinacoes-acoes": {
    subtitulo: "Guia dos dados de entrada para as combinações de ações (ELU e ELS).",
    grupos: [
      { n: 1, titulo: "Ações permanentes (G)", descricao: "Uma por linha: nome, valor característico (Gk) e se o efeito é favorável." },
      { n: 2, titulo: "Ações variáveis (Q)", descricao: "Uma por linha: nome, valor característico (Qk) e tipo de utilização (define ψ0/ψ1/ψ2)." },
    ],
    unidades: [
      "Valores na mesma unidade (kN, kN/m, kN·m…)",
      "Coeficientes γ e ψ: adimensionais",
    ],
    dica: "Os coeficientes γ e ψ seguem a NBR 8681 / NBR 6118 conforme o tipo de cada ação variável. Marque uma permanente como favorável só quando ela alivia o efeito.",
  },
  "reservatorios": {
    subtitulo: "Guia dos dados de entrada para o pré-dimensionamento dos reservatórios inferior e superior.",
    grupos: [
      { n: 1, titulo: "Consumo", descricao: "Ocupação, quantidade de unidades (pessoas, leitos, alunos…) e o consumo por unidade. Escolhida a ocupação, o consumo vem da tabela de valores usuais (a NBR 5626 não os fixa); digitar um valor substitui o da tabela. CD = unidades × consumo." },
      { n: 2, titulo: "Reserva e reservatórios", descricao: "Dias de reserva (padrão 2), sistema (inferior + superior, só um deles) e a parcela do consumo no inferior (padrão 60 %). V_res = CD × dias. Com as alturas úteis, a área em planta sai de V ÷ h." },
      { n: 3, titulo: "Reserva técnica de incêndio", descricao: "Não há valor padrão: vem da instrução técnica do Corpo de Bombeiros do estado. Informe o volume pronto ou hidrantes × vazão × tempo, e em qual reservatório ela fica." },
    ],
    unidades: [
      "Consumo: L/dia por unidade",
      "Volumes: L (m³ na tabela de reservatórios)",
      "Alturas úteis: m · Área em planta: m²",
      "RTI: vazão em L/min, tempo em min",
    ],
    dica: "O engenheiro confere a tabela de consumo, os 2 dias de reserva e a divisão 60/40: são prática de projeto, não valores da norma. A reserva de incêndio nunca vem preenchida.",
  },
  "corrente-demanda": {
    subtitulo: "Guia dos dados de entrada para corrente de projeto, corrente corrigida e carga demandada (NBR 5410).",
    grupos: [
      { n: 1, titulo: "Cargas", descricao: "Uma linha por carga: quantidade, potência unitária (W), tensão, ligação, fator de potência, rendimento e fator de demanda. P_abs = qtd × P ÷ η; Ib = P_abs ÷ (k·V·fp), com k = 1 (monofásica) ou √3 (trifásica)." },
      { n: 2, titulo: "Condições de instalação", descricao: "Isolação, temperatura ambiente e circuitos agrupados definem FCT (Tabela 40) e FCA (Tabela 42). Ib′ = Ib ÷ (FCT × FCA). Outro método de instalação: informe os fatores à mão." },
      { n: 3, titulo: "Alimentação geral", descricao: "Tensão e ligação da alimentação, para a corrente total a partir da demanda em kVA." },
    ],
    unidades: [
      "Potência: W (de saída, no caso de motores)",
      "Tensão: V · Corrente: A",
      "Fatores de potência e rendimento: 0 a 1",
      "Fator de demanda: % (da concessionária)",
    ],
    dica: "Fator de demanda não é da NBR 5410: use o da concessionária (100 % se tudo funciona junto). A demanda em kVA soma as potências aparentes aritmeticamente, a favor da segurança. Nenhuma potência vem preenchida.",
  },
  "bomba-recalque": {
    subtitulo: "Guia dos dados de entrada para o dimensionamento da bomba de recalque (NBR 5626).",
    grupos: [
      { n: 1, titulo: "Vazão", descricao: "Consumo diário (informado ou por ocupação) e horas de funcionamento da bomba (padrão 6 h). Q = CD ÷ horas." },
      { n: 2, titulo: "Desníveis e tubulações", descricao: "Altura de sucção (negativa se afogada), altura de recalque, comprimentos reais e equivalentes (Leq das conexões, digitado) e o coeficiente C de Hazen-Williams (padrão 140). O DN pode ser automático (Forchheimer)." },
      { n: 3, titulo: "Conjunto motor-bomba", descricao: "Rendimento do conjunto (padrão 60 %). A potência sai de γ·Q·Hm ÷ (η·735,5), com margem por faixa e o motor comercial seguinte." },
    ],
    unidades: [
      "Consumo: L/dia · Vazão: m³/h e L/s",
      "Alturas e comprimentos: m",
      "Perda de carga: mca · Altura manométrica: mca",
      "Potência: cv",
    ],
    dica: "Hm = Hg + hf do recalque + hf da sucção. O NPSH disponível não é calculado: confira com a curva da bomba. Os padrões (6 h, C = 140, η = 60 %, margens e limites de velocidade) são prática de projeto.",
  },
  "bomba-piscina": {
    subtitulo: "Guia dos dados de entrada para o dimensionamento da bomba de recirculação da piscina (NBR 10339).",
    grupos: [
      { n: 1, titulo: "Piscina", descricao: "Forma e dimensões (ou o volume pronto), profundidade média e uso, que sugere o tempo de recirculação (residencial 6 h, coletivo 4 h, infantil 2 h). Q = V ÷ tempo." },
      { n: 2, titulo: "Tubulações", descricao: "Comprimentos reais e equivalentes de sucção e retorno, coeficiente C (padrão 140) e DN automático por velocidade (sucção até 1,8 m/s, retorno até 3,0 m/s)." },
      { n: 3, titulo: "Equipamentos e bomba", descricao: "Perda no filtro e equipamentos e pressão nos retornos (do fabricante, sem padrão), rendimento (padrão 50 %) e, se quiser a área filtrante, a taxa de filtração." },
    ],
    unidades: [
      "Dimensões: m · Volume: m³",
      "Vazão: m³/h e L/s",
      "Perdas e pressões: mca",
      "Potência: cv · Taxa de filtração: m³/h·m²",
    ],
    dica: "Circuito fechado com superfície livre: a altura manométrica não soma desnível. Perda dos equipamentos, pressão nos retornos e taxa de filtração não têm valor padrão; sem a taxa, não há área filtrante.",
  },
  "esgoto-infiltracao": {
    subtitulo: "Guia dos dados de entrada para o sumidouro por teste de percolação e leitura da sondagem.",
    grupos: [
      { n: 1, titulo: "Contribuição de esgoto", descricao: "Pessoas × contribuição por pessoa (sem valor padrão) ou o volume diário direto. V é o esgoto a infiltrar por dia." },
      { n: 2, titulo: "Coeficiente de infiltração do solo", descricao: "Pelos furos do teste de percolação (tempo e rebaixamento): t = tempo ÷ rebaixamento e Ci = 490 ÷ (t + 2,5); vale o furo mais lento. Ou informe o Ci direto." },
      { n: 3, titulo: "Sumidouro e sondagem", descricao: "Diâmetro, unidades, profundidade do topo, se o fundo conta como área (padrão: só a parede lateral), nível d'água da sondagem e distância mínima do fundo ao lençol (padrão 1,5 m). A = V ÷ Ci; H = A ÷ (unidades·π·D)." },
    ],
    unidades: [
      "Volume: L/dia · Ci: L/m²·dia",
      "Tempo: min · Rebaixamento: cm",
      "Diâmetro, profundidades e distâncias: m · Área: m²",
    ],
    dica: "A NBR 7229 e a NBR 13969 foram substituídas pela NBR 17076:2024: a curva de Ci, os 1,5 m ao lençol e o uso só da parede lateral vêm das normas antigas e da prática, e o engenheiro confere na norma nova. Vala, filtro e distâncias a poços e divisas ficam de fora.",
  },
};

export function getGuia(slug: string): GuiaMeta | undefined {
  return GUIAS[slug];
}
