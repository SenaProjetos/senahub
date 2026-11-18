---
titulo: Estudo de cargas e demanda por concessionária
descricao: Estudo preliminar de demanda de edificações de múltiplas unidades, pelo método da concessionária, na aba Estudos do projeto.
resumo: Levantamento de iluminação e tomadas por ambiente, cálculos de demanda (carga instalada ou área útil), CMDs, CPG e entrada, e o relatório em PDF, Word e Excel para o memorial.
tags: [estudos, cargas, demanda, concessionária, cmd, cpg, entrada, relatório, elétrico]
palavras-chave: [levantamento de cargas, demanda, carga instalada, área útil, neoenergia, equatorial, cemig, celesc, copel, enel, energisa, centro de medição, cmd, cpg, disjuntor, seção do cabo, lux, habitação, nbr 5410]
sinonimos: [calculadora de cargas e demanda, cálculo de demanda, demanda provável, memorial de cálculo elétrico]
---

# Estudo de cargas e demanda por concessionária

## Objetivo

Fazer o **estudo preliminar de demanda** de um empreendimento (sem a planta de pontos): o levantamento de
iluminação e tomadas por ambiente, a demanda pelo **método da concessionária escolhida**, a divisão em
**centros de medição (CMD)** e o **CPG**, e a entrada (corrente, disjuntor e seção do cabo sugeridos). No fim,
o engenheiro confere os dados e gera o relatório para anexar ao memorial de cálculo ou descritivo.

Concessionárias: **Neoenergia, Equatorial, Cemig, Celesc, Copel, Enel e Energisa**. Cada estudo usa só os
valores da concessionária escolhida.

## Como acessar

- Abra o projeto → aba **Estudos** → **Novo estudo** → escolha **Cargas e demanda por concessionária** → **Criar estudo**.
- Ver exige a permissão de usar as ferramentas e enxergar o projeto. Editar é do **responsável de disciplina**
  do projeto (ou de quem atua em disciplina alheia).
- Enquanto o motor de cálculo estiver **em validação**, só quem gere as ferramentas vê a aba. O aviso aparece no
  topo do estudo.

## Como usar

No topo do estudo ficam o nome, o botão **Salvar** (ou **Ctrl+S**) e o cartão com os dados gerais:
**Concessionária**, **Distribuidora** (opcional), **Tipo de empreendimento**, **Sistema de tensão** (220/127 V
ou 380/220 V), **Ligação** e o **Critério de iluminação** (habitação ou iluminância em lux). O estudo segue em
três etapas; o número de cada uma vira um ✓ quando ela tem conteúdo.

### Etapa 1 — Levantamento

1. **Novo levantamento** descreve um tipo de unidade (ex.: "Flat tipo A", "Loja"). Dentro dele, **Adicionar
   pavimento** e **Adicionar ambiente**.
2. Em cada ambiente, informe área e perímetro e os pontos de tomada (de uso geral e de uso específico).
3. **Habitação:** a calculadora sugere a iluminação e as tomadas mínimas pela NBR 5410 (o número aparece em
   azul). Você pode trocar o valor; o digitado sempre vale.
4. **Iluminância (lux):** informe o pé-direito do estudo e cadastre as **Luminárias deste estudo** (L1, L2…,
   com fluxo, potência e FP). No ambiente, escolha a atividade (o Em é sugerido por ela), Fu, Fm e a luminária;
   a quantidade sugerida e a iluminância final são calculadas.
5. O resumo dos levantamentos mostra a carga de cada tipo de unidade antes de montar os cálculos.

### Etapa 2 — Demandas

1. **Demanda por carga instalada:** um cálculo com linhas (descrição, tipo de carga, quantidade, potência, FP e
   FD). Escolha os levantamentos do escopo e a **Quantidade (× N)**, e use **Trazer do levantamento** para criar
   as linhas com os totais. Se o levantamento mudar depois, a linha avisa; **Atualizar do levantamento** traz o
   valor novo (ela nunca muda sozinha).
2. Onde a concessionária tem tabela de FD por número de aparelhos, o FD sugerido aparece em azul; escolha a
   tabela em **Tabela do FD** quando houver mais de uma. Sem tabela, o FD é digitado.
3. **Iluminação e tomadas por uso (degraus de carga):** em **Tabela do FD**, escolha a tabela de degraus e, logo
   abaixo, o **Uso da edificação** (hotel, escritório, escola…). As linhas do cálculo com a mesma tabela e o mesmo uso
   somam a carga (× N), que percorre os degraus da norma; cada linha recebe o FD equivalente, em azul. O relatório
   mostra a conta degrau por degrau.
4. **Demanda por área útil:** os tipos de apartamento (nome, quantidade e área útil). Copel e Enel calculam só
   pela carga instalada.
5. **Papel na demanda do empreendimento** diz como o cálculo entra no total (condomínio, incêndio, cargas
   especiais, lojas, recarga…). Cálculo sem papel é uma unidade individual: tem entrada própria na etapa 3, mas
   não entra no prédio.
6. O **Resumo da demanda** mostra a composição do empreendimento e os **Avisos** (valor abaixo do critério da
   norma, valor fora da tabela, atendimento esperado: baixa ou média tensão).

### Etapa 3 — Centros e entradas

1. Crie os **CMDs** e distribua neles os apartamentos e os medidores de condomínio e de incêndio. Informe a
   **Capacidade do CMD (medidores)** para a calculadora avisar quando passar.
2. A demanda de cada CMD é calculada pelos apartamentos dele; a do **CPG**, pelo total de apartamentos do
   prédio — por isso a demanda do CPG **não é a soma** das demandas dos CMDs.
3. Em cada CMD, no CPG e em cada unidade individual, escolha as condições de instalação (método, isolação,
   material, condutores carregados, temperatura, agrupamento): a calculadora sugere corrente, disjuntor, seção,
   neutro e proteção. A seção é só pela capacidade de condução, **sem queda de tensão**.
4. **Responsável técnico:** nome, CREA e a declaração "Conferi os dados e os valores sugeridos e assumo a
   responsabilidade por este estudo".

### Relatório

Na etapa 3, no cartão **Relatório**: **Baixar PDF**, **Baixar Word** ou **Baixar Excel**. O relatório sai com
o que está **salvo** — salve antes de baixar. Ele traz o timbrado da empresa (Configurações → Empresa) e sete
seções: identificação e responsável técnico; premissas, normas e edições; levantamento; cálculos de demanda;
centros de medição e entradas; avisos e observações; fontes dos valores. O Excel tem uma aba por etapa.

A **fonte de cada valor** (norma, edição, tabela e item) aparece só no relatório, nas seções 2 e 7 — a tela
mostra o valor e o aviso, sem a norma.

## Dados não conferidos

Sem a declaração marcada ou sem o CREA, o relatório sai com a marca **"Dados não conferidos por responsável
técnico"**. Marque a declaração e informe o CREA para tirá-la; a data da conferência entra no relatório.

## Cuidados

- É um **estudo preliminar**: os valores sugeridos são os da norma e o projeto luminotécnico e a planta de pontos
  que chegarem depois prevalecem.
- Quando o relatório lista uma norma como **"edição a confirmar"** ou **"vale a partir de…"**, confira a edição
  vigente antes de usar o estudo.
- Duas pessoas no mesmo estudo: quem salvar por último recebe o aviso de que outra pessoa alterou o estudo e
  precisa **Recarregar** antes de salvar de novo (nada é sobrescrito sem querer).
- Cada lista (levantamentos, pavimentos, ambientes, cálculos, linhas, CMDs, medidores) tem o menu do botão direito
  e o **⋯** com duplicar, mover e excluir.
