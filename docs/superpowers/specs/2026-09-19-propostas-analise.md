# Propostas comerciais — análise das propostas reais (Fase G, entrada)

> Diagnóstico, nada implementado. Base: **163 propostas em PDF** enviadas pela Sena entre jan/2025 e
> fev/2026 (`D:\propostas`), texto extraído com `pdftotext` e analisado por script. Os números
> abaixo são contagens sobre esse conjunto, não estimativas. O desenho que sai daqui depende das
> decisões do §6.

## 1. O documento é o mesmo esqueleto em quase todas

Toda proposta tem **as mesmas 10 seções, na mesma ordem**:

| # | Seção | Aparece em | Natureza |
|---|---|---|---|
| 1 | Descrição dos serviços | 163 | **varia** — lista de disciplinas + objeto (área, endereço, tipologia) |
| 2 | Considerações do projeto/serviço | 145 | **varia por disciplina** — é o "escopo por disciplina" |
| 3 | Valor dos serviços | 162 | **varia** — tabela por disciplina + total + observação de pacote |
| 4 | Condições de pagamento e prazos | 161 | **varia** — parcelas, marcos, prazos |
| 5 | Não estão inclusos | 162 | padrão — 22 variantes, 1 domina (97×) |
| 6 | Competências da contratada | 162 | padrão — 4 frases em quase todas + variações por tipo |
| 7 | Competências da contratante | 162 | padrão + **condicionais** (sondagem, teste de absorção) |
| 8 | Dados bancários | 162 | constante (mas veja §3.4) |
| 9 | Alterações | 161 | padrão — 2 redações |
| 10 | Validade | 162 | constante — 30 dias (152) ou 20 dias (10) |

Três ordens de seção cobrem 122 das 163 propostas. As diferenças são de **nome** da seção
("do projeto" × "do serviço", "da contratada" × "do contratado"), não de estrutura.

**Consequência:** metade do documento (seções 5 a 10) é texto padrão com poucas variantes. O
trabalho real — e onde os erros aparecem — está nas seções 1 a 4.

## 2. O que varia, e como

### 2.1 Escopo por disciplina (seção 2)
É uma **biblioteca informal de parágrafos**, reaproveitada por cópia. Exemplos recorrentes:
- PCI: "segue as normas técnicas brasileiras e o **COSCIP** (Pernambuco)…" — 16 propostas.
- Instalações elétricas: "…normas específicas da **Neoenergia**…" — 29 propostas.
- Estrutural: "concreto armado, fundação direta com sapatas isoladas, **confirmar após sondagem**" ou
  "fundação a definir após sondagem".
- Arquitetônico: lista de pranchas (planta baixa civil, piso, forro, layout…).
- "Fornecimento de ART definitiva", "Listas de Quantitativos".

São ~120 parágrafos distintos, mas poucos por disciplina; a variação real é **parâmetro**
(estado/norma, concessionária, tipo de fundação, área), não texto novo.

### 2.2 Tipos de proposta
Pelo conteúdo, há famílias com seções e cláusulas próprias:
- **Projetos (multidisciplinar / complementares)** — o grosso (~120).
- **Estrutural** isolado (fundação, sondagem, ensaios).
- **Laudo** técnico — objeto é vistoria; "não inclusos" cita ensaios e quebra de estrutura;
  contratada "registra ART do laudo".
- **Aprovação / PCI no Corpo de Bombeiros** — seções extras **Local e endereço** e **Documentos
  necessários** (contrato social, RG/CPF, memorial do condomínio…).
- **Cliente corporativo** (Santander, Localiza, via gerenciadora) — pagamento por **nota fiscal +
  ordem de compra em 20/30 dias**, sem sinal; prazos em dias após acionamento.

### 2.3 Pagamento (seção 4)
Não há um plano padrão: 102 textos distintos em 161. Os marcos se repetem — **sinal**, **entrega
das pré-formas/projetos básicos**, **entrega dos executivos**, **aprovação/protocolo** no órgão,
**datas fixas** (30/60/90 dias) — combinados em percentuais que mudam a cada proposta (50/50,
40/60, 30/30/40, 30/25/20/20/5…).

### 2.4 Revisões
Versões sucessivas da mesma proposta (Astrotur 10/03 → 13/03 → 18/03; Skyfit ×5; Localiza R01)
mudam **principalmente o plano de pagamento**; o escopo e os valores por disciplina quase não
mudam. Hoje cada revisão é um arquivo novo, sem histórico ligado.

### 2.5 Pacote
23 propostas dizem que "os valores consideram a contratação de todos os itens"; 5, que "disciplina
isolada é novo orçamento"; 12 têm mais de um total. O preço por disciplina **não é aditivo** — é
um pacote, e isso precisa ser dito no documento.

## 3. O que o processo manual está custando — erros em documentos enviados

Conferidos por script contra a própria proposta (não contra suposição):

### 3.1 Plano de pagamento — 4 das 35 propostas com parcelas em % e R$ têm erro
Separado em dois tipos, porque não pesam igual:

**O dinheiro não fecha (1):**
| Proposta | Erro |
|---|---|
| Edif. Vitória (Eng. Flávio) | 3ª parcela "40%" escrita como R$ 23.750 (é 50%). **As parcelas somam R$ 52.250 para um total de R$ 47.500** — cobra R$ 4.750 a mais. |

**O percentual escrito está errado, os valores estão certos (3):**
| Proposta | Erro |
|---|---|
| Villa Lunda (Olinda) | 3ª parcela rotulada "50%" é R$ 42.000 (40%); percentuais somam 110%, valores fecham em R$ 105.000. |
| Astrotur 13/03 e 18/03 | parcela de 90 dias rotulada "25%" é R$ 13.015 (20%); valores fecham. Na versão de 18/03 o **texto contradiz a tabela do próprio documento** (tabela diz 20%). Passou por duas revisões. |

### 3.2 Valor por extenso errado — 12 ocorrências em 10 propostas
(Descontados parênteses que não são extenso, como "(tipo split)", e grafias aceitas como "um mil".)
Vários mostram **cópia de proposta anterior**: o número foi atualizado, o extenso não.
- Selfit Caruaru: R$ 1.980,00 "(dois mil novecentos e setenta)"; R$ 2.805,00 "(três mil setecentos e quarenta)".
- Villa Lunda: R$ 105.000,00 "(cento e cinco reais)".
- Escola Paulo Freire: R$ 22.000,00 "(vinte e sete mil)"; Localiza Butantã: R$ 3.500,00 "(quatro mil)";
  Pituba: R$ 5.500,00 "(cinco mil)"; Edif. Porto: R$ 26.000,00 "(vinte e seis mil e quinhentos)";
  Campo do Coqueiro (×2), Selfit Petrópolis; e dois de grafia: Escola Tamboatá ("neve mil"),
  Botocenter ("oito centos").
- O mesmo acontece com prazos: Vitória, "45 (quarenta) dias".

### 3.3 Norma de outro estado
As duas propostas de **Milagres/AL** (Záphis, cliente real) citam o **COSCIP de Pernambuco** como
norma de PCI — parágrafo copiado de proposta de PE.

### 3.4 Identidade da empresa divergente
Circulam **dois e-mails** (`senaestruturas` em 136, `senaprojetos` em 27) e **duas contas
bancárias** (Ag. 7474 em 128, Ag. 3757 em 34). Proposta copiada leva junto dado bancário/contato
de outra época — risco de pagamento em conta errada.

**Leitura:** nenhum desses erros é de engenharia; todos são de montagem manual — soma, extenso,
cópia. São exatamente os que um documento gerado a partir de dado estruturado não comete.

## 4. O que o sistema já tem

- `Proposta` + `PropostaItem` (disciplina do catálogo + valor) + `PropostaCondicao` (descrição +
  percentual/valor) + `PropostaVersao` (valores estruturados, snapshot, **PDF congelado por versão**).
- Proposta **externa** (ADR-0005): PDF feito fora + linhas por disciplina — hoje a via real.
- Página pública `/a/proposta/[token]` e PDF impresso dela — **renderização congelada** (ADR-21 §6).
- **Estúdio de Documentos**: gerador de relatório por **bandas** (cabeçalho, detalhe que repete por
  linha de uma coleção, rodapé), tokens `[Campo]`, fonte `proposta` (itens como linhas),
  visibilidade condicional por elemento, **blocos reutilizáveis**, PDF.
  **O que ele não faz hoje (verificado no código):** cada banda tem **altura fixa** e os elementos são
  posicionados com altura fixa e `overflow: hidden` (`doc-render.tsx`). Uma cláusula de tamanho
  variável — o escopo de uma disciplina tem de 1 a 10 linhas — é **cortada**. Para servir às
  propostas, o Estúdio precisaria de "banda que cresce com o texto" (mudança no motor de
  renderização e na paginação, que hoje divide altura fixa pela área útil).
  Também não tem onde morar: o **plano de pagamento** (marcos + % → valores + extenso) e o **texto de
  escopo por disciplina**.
- `ConfigSistema` `empresa.dados` (timbrado do holerite) — lugar natural para os dados da empresa.

## 5. Direção proposta (a validar)

Montar a proposta a partir de **peças estruturadas**, e o texto sair delas:

1. **Biblioteca de cláusulas** — parágrafos por seção e por disciplina/tipo, com parâmetros
   (`[UF]`, `[NormaPCI]`, `[Concessionaria]`, `[Area]`, `[TipoFundacao]`). Resolve 2.1 e 3.3.
2. **Modelos de proposta** por família (§2.2) — quais seções, quais cláusulas por padrão, plano de
   pagamento sugerido, validade. Escolher o modelo monta 80% do documento.
3. **Plano de pagamento estruturado** — marcos + percentuais; o sistema **calcula** valores e
   extenso e **recusa** percentuais que não somam 100%. Resolve 3.1 e 3.2.
4. **Dados da empresa num lugar só** (timbrado, e-mail, conta) — resolve 3.4.
5. **Versão = snapshot do documento inteiro** (já existe) — cada revisão guarda o PDF enviado.
6. A proposta **externa** continua como saída de emergência enquanto a nova se prova.

## 6. Decisões necessárias antes do desenho

A primeira decide o tamanho de todo o resto; as demais só fazem sentido depois dela.

1. **Formato de saída** — PDF gerado pelo sistema (edição só no sistema) **ou** Word gerado pelo
   sistema, ajustado no Word e reenviado como PDF (proposta externa)?
2. **Quem mantém a biblioteca** de cláusulas e os modelos — só a diretoria, ou qualquer um do
   Comercial?
3. **Liberdade no texto por proposta** — pode editar livremente o parágrafo dentro de uma
   proposta, ou só escolher cláusulas e preencher parâmetros?
4. **Página pública** — as propostas novas continuam **sem** link público (como a externa) ou
   ganham link? (Qualquer mudança lá é decisão própria — ADR-21 §6.)
5. **Correção das propostas em aberto** com erro aritmético (§3.1) — alguma ainda está em
   negociação e precisa de errata?
