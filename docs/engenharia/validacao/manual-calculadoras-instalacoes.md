---
titulo: Calculadoras de instalações e aba Estudos
descricao: Reservatórios, corrente e demanda, bomba de recalque, bomba de piscina, destino final do esgoto e o levantamento de cargas por projeto.
resumo: Guia de uso das calculadoras de instalações (hidrossanitário e elétrico) e da aba Estudos do projeto: o que cada campo pede, quais fórmulas e hipóteses entram na conta, o que não é calculado e um exemplo conferível de cada uma.
tags: [ferramentas, instalações, reservatórios, corrente, demanda, bomba, recalque, piscina, esgoto, sumidouro, estudos, levantamento de cargas]
palavras-chave: [reservatório, reserva de incêndio, corrente de projeto, fator de demanda, bomba de recalque, altura manométrica, bomba de piscina, recirculação, sumidouro, percolação, sondagem, estudos, cargas]
sinonimos: [calculadoras hidráulicas, calculadoras elétricas, levantamento de carga, carga instalada]
---

# Calculadoras de instalações e aba Estudos

> **RASCUNHO PARA VALIDAÇÃO — ainda não publicado no manual.** Estas calculadoras só aparecem para quem tem
> `ferramentas:gerir` até um engenheiro da casa validar fórmulas e tabelas (fichas nesta pasta). O texto fica FORA de
> `docs/manual/` de propósito: lá, qualquer página abre em `/ajuda/...` para todo usuário logado (cliente do portal
> incluído), mesmo fora do índice. Depois da validação, vira a página do manual (ver "Para publicar" no fim).

## Para que servem

São calculadoras de **pré-dimensionamento** para a equipe de instalações. Cada uma mostra o resultado na tela, gera a
**memória de cálculo** (PDF, Word, Excel) com as fórmulas e as hipóteses, e guarda o cálculo para reabrir depois.
**Não substituem o projeto do engenheiro responsável**: a memória sai com o aviso de responsabilidade técnica (ART/RRT).

Regras que valem para todas:

- **Valor que a norma não fixa e a casa não definiu não vem preenchido.** Aparece um aviso até a pessoa digitar (por
  exemplo: reserva técnica de incêndio, contribuição de esgoto por pessoa, perda de carga do filtro, taxa de filtração,
  potência de cada carga, fator de demanda).
- Os **valores padrão** que existem (dias de reserva, coeficiente C, rendimento…) são **prática de projeto** e aparecem
  nos dados de entrada da memória, para o engenheiro ver o que foi usado.
- Números saem com **vírgula decimal**. Campos aceitam vírgula ou ponto.
- Quando a calculadora ainda está **em validação**, a memória traz o selo "EM VALIDAÇÃO — não usar em projeto".

---

## 1. Reservatórios (inferior e superior)

**Chave:** `reservatorios` · **Normas:** NBR 5626 e NBR 13714 (a norma não fixa consumo por pessoa).

**O que pede**

| Grupo | Campos |
|---|---|
| 1. Consumo | ocupação (tabela de valores usuais ou "personalizada"), quantidade de unidades (pessoas, leitos, alunos, refeições, automóveis, m²) e consumo por unidade (a tabela sugere; digitar substitui) |
| 2. Reserva e reservatórios | dias de reserva (padrão 2), sistema (inferior + superior, só superior ou só inferior), parcela do consumo no inferior (padrão 60 %), alturas úteis (opcionais) |
| 3. Reserva técnica de incêndio | nenhuma, volume informado, ou calculada (hidrantes × vazão × tempo); em qual reservatório fica |

**Fórmulas**

- Consumo diário: `CD = unidades × consumo por unidade`
- Reserva de consumo: `V_res = CD × dias`
- Dois reservatórios: inferior = `fração × V_res`; superior = `(1 − fração) × V_res`. Um só reservatório recebe tudo.
- RTI calculada: `RTI = hidrantes × vazão (L/min) × tempo (min)`; soma-se ao reservatório escolhido.
- Área em planta (se houver altura útil): `A = V (m³) ÷ h`; o lado do quadrado equivalente é `√A`.

**Hipóteses a conferir:** tabela de consumo por unidade (valores usuais da literatura, não da NBR 5626); 2 dias de reserva;
divisão 60/40 entre inferior e superior; reserva de incêndio sempre digitada (vem da instrução técnica do Corpo de
Bombeiros do estado).

**Exemplo:** residência de padrão médio, 20 pessoas (150 L/dia cada), 2 dias, inferior + superior a 60 %.
CD = 3 000 L; reserva = 6 000 L; **inferior = 3 600 L; superior = 2 400 L**. Com RTI de 2 hidrantes × 125 L/min × 60 min no
superior: RTI = 15 000 L e superior = 17 400 L.

---

## 2. Corrente e demanda

**Chave:** `corrente-demanda` · **Norma:** NBR 5410 (Tabelas 40 e 42).

**O que pede**

| Grupo | Campos |
|---|---|
| 1. Cargas | uma linha por carga: descrição, quantidade, potência unitária (W), tensão, ligação (mono/trifásica), fator de potência, rendimento (motores), fator de demanda (%) |
| 2. Condições de instalação | isolação (PVC 70 °C ou EPR/XLPE 90 °C), temperatura ambiente, circuitos agrupados; FCT e FCA manuais (opcionais) |
| 3. Alimentação geral | tensão e ligação da alimentação |

**Fórmulas (por linha)**

- Potência absorvida: `P_abs = qtd × P ÷ η`
- Potência aparente: `S = P_abs ÷ fp`
- Corrente de projeto: `Ib = P_abs ÷ (k · V · fp)`, com `k = 1` (monofásica) ou `√3` (trifásica)
- Corrente corrigida: `Ib′ = Ib ÷ (FCT × FCA)` — a comparar com a capacidade de condução dos condutores
- Demanda: `P_dem = P_abs × fd`

**Totais:** potência instalada; demanda em kW e em kVA (**soma aritmética** das potências aparentes, a favor da
segurança); fator de potência médio; corrente total da demanda `= S_dem ÷ (k · V)` da alimentação.

**Fatores:** FCT pela Tabela 40 (referência 30 °C, PVC e EPR); FCA pela Tabela 42, condutores em feixe ou em conduto
fechado (1 a 20 ou mais circuitos). **Fator de demanda não é da NBR 5410**: vem da concessionária e é digitado por linha
(100 % se a carga funciona toda junta). Alerta quando `FCT × FCA < 0,5`.

**Não faz:** escolher seção de condutor ou disjuntor; método de instalação fora da linha considerada (use os fatores manuais).

**Exemplo:** chuveiro de 5 500 W, 220 V monofásico, fp 1, 30 °C, 1 circuito → `Ib = 25,00 A` e `Ib′ = 25,00 A`.
Com PVC a 40 °C e 3 circuitos agrupados: FCT 0,87, FCA 0,70 e `Ib′ = 41,05 A`.

---

## 3. Bomba de recalque

**Chave:** `bomba-recalque` · **Norma:** NBR 5626.

**O que pede**

| Grupo | Campos |
|---|---|
| 1. Vazão | consumo diário (informado ou por ocupação) e horas de funcionamento da bomba (padrão 6 h) |
| 2. Desníveis e tubulações | altura de sucção (negativa se afogada), altura de recalque, comprimento real e equivalente (Leq) da sucção e do recalque, DN (automático ou escolhido), coeficiente C (padrão 140) |
| 3. Conjunto motor-bomba | rendimento (padrão 60 %) |

**Fórmulas**

- Vazão: `Q = CD ÷ horas`
- Diâmetro de Forchheimer: `D = 1,3 · (h/24)^¼ · √Q` (Q em m³/s)
- DN do recalque: o menor DN comercial de PVC soldável (NBR 5648) com diâmetro **interno** maior ou igual a D; sucção: o DN
  imediatamente acima
- Velocidade: `v = 4Q ÷ (πD²)`; alerta acima de 3,0 m/s (recalque) e 2,0 m/s (sucção)
- Perda unitária (Hazen-Williams): `J = 10,643 · Q^1,85 · C^-1,85 · D^-4,87` (m/m)
- Perda no trecho: `hf = J · (L + Leq)`
- Altura manométrica: `Hm = Hg + hf recalque + hf sucção`, com `Hg = altura de sucção + altura de recalque`
- Potência: `P (cv) = 9810 · Q · Hm ÷ (η · 735,5)`; margem por faixa (50 % até 2 cv, 30 % até 5, 20 % até 10, 15 % até 20,
  10 % acima) e **motor comercial** imediatamente acima

**Não faz:** NPSH disponível (confira com a curva da bomba); tabela de conexões (o Leq é digitado); curva da bomba.

**Exemplo:** 30 000 L/dia em 6 h, sucção 2 m (3 m + 5 m de Leq), recalque 18 m (25 m + 15 m de Leq), C = 140, η = 60 % →
Q = 5 m³/h; recalque DN40, sucção DN50; **Hm = 23,02 mca**; P = 0,71 cv; com margem 1,07 cv; **motor de 1,5 cv**.

---

## 4. Bomba de piscina

**Chave:** `bomba-piscina` · **Norma:** NBR 10339.

**O que pede**

| Grupo | Campos |
|---|---|
| 1. Piscina | forma (retangular, circular ou volume informado), dimensões, profundidade média, uso (define o tempo de recirculação sugerido) |
| 2. Tubulações | comprimento real e equivalente da sucção e do retorno, DN (automático ou escolhido), coeficiente C (padrão 140) |
| 3. Equipamentos e bomba | perda no filtro e equipamentos (mca) e pressão nos retornos (mca) — **sem padrão**; rendimento (padrão 50 %); taxa de filtração (opcional) |

**Fórmulas**

- Volume: retangular `C × L × h`; circular `π·D²/4 × h`; ou o volume informado
- Vazão de recirculação: `Q = V ÷ tempo` (residencial 6 h, uso coletivo 4 h, infantil ou rasa 2 h)
- DN da sucção: menor DN com `v ≤ 1,8 m/s`; do retorno: menor DN com `v ≤ 3,0 m/s`
- Perdas e potência: as mesmas fórmulas de Hazen-Williams, potência e motor da bomba de recalque
- **Altura manométrica:** `Hm = hf sucção + hf retorno + perda nos equipamentos + pressão nos retornos` — circuito fechado
  com superfície livre, **sem desnível geométrico**
- Área filtrante (só com a taxa informada): `A = Q ÷ taxa`

**Exemplo:** piscina 8 × 4 m, profundidade média 1,5 m, uso residencial, sucção 4 m + 6 m de Leq, retorno 10 m + 8 m de
Leq, filtro 4 mca, retornos 2 mca, C = 140, η = 50 % → V = 48 m³; Q = 8 m³/h (2,222 L/s); sucção DN50, retorno DN40;
**Hm = 9,60 mca**; P = 0,57 cv; com margem 0,85 cv; **motor de 1 cv**.

---

## 5. Destino final do esgoto (sumidouro)

**Chave:** `esgoto-infiltracao` · **Norma citada:** NBR 17076:2024.

> A NBR 7229:1993 e a NBR 13969:1997 foram substituídas pela NBR 17076:2024. O texto da norma nova **ainda não foi lido**
> por quem escreveu a calculadora: a curva do coeficiente de infiltração, a distância ao lençol e o uso só da parede lateral
> vêm das normas antigas e da prática. O engenheiro confere cada item na NBR 17076:2024 e na exigência do órgão sanitário local.

**O que pede**

| Grupo | Campos |
|---|---|
| 1. Contribuição de esgoto | pessoas × contribuição por pessoa (**sem padrão**) ou o volume diário direto |
| 2. Coeficiente de infiltração | os furos do teste de percolação (tempo e rebaixamento de cada um) ou o Ci informado |
| 3. Sumidouro e sondagem | diâmetro, unidades, profundidade do topo, se o fundo conta (padrão: só a parede), nível d'água da sondagem, distância mínima do fundo ao lençol (padrão 1,5 m) |

**Fórmulas**

- Volume diário: `V = pessoas × contribuição`
- Por furo: `t = tempo ÷ rebaixamento` (min/cm); `Ci = 490 ÷ (t + 2,5)` (L/m²·dia). **Vale o furo mais lento** (menor Ci)
- Área de infiltração: `A = V ÷ Ci`; por unidade `A_un = A ÷ unidades`
- Profundidade útil: `H = (A_un − fundo) ÷ (π·D)`, com o fundo `π·D²/4` só se a opção estiver ligada
- Fundo do sumidouro: `topo + H`
- Sondagem: `H_max = nível d'água − distância mínima − topo`; se o fundo passa disso, o número de unidades iguais que cabe
  acima do lençol é `n = ⌈A ÷ (π·D·H_max + fundo)⌉`

**Não faz:** vala de infiltração, filtro anaeróbio, camada impenetrável, distâncias a poços, divisas e edificações, tanque
séptico. **Não recusa solo pouco permeável** (não há limite de aptidão).

**Exemplo:** 5 pessoas × 150 L/dia; furos (10 min/1 cm), (40 min/2 cm), (30 min/3 cm); D = 1,2 m; 2 unidades; topo a
0,5 m; nível d'água a 6 m; distância mínima 1,5 m → Ci por furo 39,2 · 21,78 · 39,2 (**adotado 21,78**); V = 750 L/dia;
A = 34,44 m²; H = 4,57 m; fundo a 5,07 m. Lençol: H máximo 4,0 m, **não respeitado**; **3 unidades resolvem** (H = 3,05 m).

---

## 6. Aba Estudos (levantamento de cargas do projeto)

**Onde:** dentro do projeto, aba **Estudos** (`/projetos/[id]/estudos`). Hoje só aparece para quem tem `ferramentas:gerir`
(motor em validação); depois da validação, aparece para quem usa as ferramentas e enxerga o projeto.

**Para que serve:** fazer o levantamento de cargas elétricas do projeto, por **ambiente**, no lugar de planilhas. Cada
projeto pode ter vários estudos (por exemplo "Edificação principal" e "Casa de apoio").

**Como funciona**

1. **Novo estudo** → dê um nome.
2. Adicione **ambientes** (sala, cozinha, quadro de força…) e as **cargas** de cada um. Os campos são os da calculadora
   Corrente e demanda, mais o **tipo do ponto** (iluminação, tomada de uso geral, tomada de uso específico, outro), que só
   agrupa os subtotais e não altera a conta.
3. Defina as condições de instalação e a alimentação geral (valem para o estudo todo) e, se quiser, a **fonte dos fatores de
   demanda** (ela sai na memória) e observações.
4. **Salvar** (botão ou Ctrl+S). O estudo é gravado inteiro; se outra pessoa salvou antes, o sistema avisa e pede para
   recarregar (nada é sobrescrito sem aviso). Linhas totalmente em branco ficam de fora.
5. **Memória** em PDF, Word ou Excel pelo ⋯ (usa a última versão salva).

**A conta é a da calculadora Corrente e demanda** (as fórmulas da seção 2): o mesmo motor roda sobre a lista de todas as
cargas. O estudo mostra: subtotal por ambiente, subtotal por tipo de ponto, totais (potência instalada, demanda em kW e
kVA, fator de potência médio, corrente total) e a corrente por carga. Os subtotais dos ambientes somam **exatamente** o total.

**O que é gravado:** só o que a pessoa digitou. **O resultado nunca é gravado**: ao validar o motor, os estudos já criados
passam a mostrar números do motor validado. Nenhuma potência, fator de potência ou fator de demanda vem preenchido.

**Quem pode:** ver exige `ferramentas:usar` e enxergar o projeto; criar, editar, duplicar e excluir exige ser responsável
por uma disciplina do projeto ou poder atuar em disciplina alheia. Cada salvamento fica na auditoria, e a própria tela traz
a lista "Alterações" (quem salvou e quando). Limites: 200 cargas e 30 ambientes por estudo, 20 estudos por projeto.

---

## O que o engenheiro validador precisa conferir

As fichas em `docs/engenharia/validacao/` trazem as tabelas de fórmulas, hipóteses e casos de teste para assinar:
`reservatorios.md`, `corrente-demanda.md` (com o adendo sobre o Estudos), `bomba-recalque.md`, `bomba-piscina.md` e
`esgoto-infiltracao.md`. Os exemplos acima são os mesmos casos de teste das fichas e dos testes automáticos: o resultado na
tela deve bater com eles.

## Para publicar (depois da validação)

1. Aplicar os ajustes pedidos na ficha (se mudar fórmula ou tabela, incrementar `versaoCalc` e validar de novo).
2. Preencher `validacao` no registro de cada calculadora (`src/modules/ferramentas/registry.ts`).
3. Mover este arquivo para `docs/manual/engenharia/calculadoras-instalacoes.md`, remover o quadro "RASCUNHO PARA
   VALIDAÇÃO", acrescentar a página ao `docs/manual/search-index.json`, ao `docs/manual/engenharia/README.md` e ao
   catálogo de `ferramentas.md`, e registrar em `novidades.md`.
