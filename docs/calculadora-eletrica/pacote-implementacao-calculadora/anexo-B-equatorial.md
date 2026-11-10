# Anexo B — Equatorial

Valores literais das normas, "a conferir" até a validação.

## 1. Documentos e edições
| Documento | Edição | Conteúdo usado |
|---|---|---|
| NT.00004 | Rev. 08, 30/12/2025 | EMUC: método de demanda, limites, tabelas |
| NT.00001 | Rev. 09, com Nota Técnica 004/2026 (publicada 27/10/2026; integral em 24/02/2027) | Baixa tensão: tabelas de entrada, gatilhos de estudo |
| NT.00002 | Rev. 10 (29/05/2025) | Média tensão; planilhas de quadro de cargas |
| NT.00042 | Rev. 04, 26/12/2025 | Recarga de veículos elétricos |

A Nota Técnica entra como a edição vigente, com aviso de confirmação até 24/02/2027.

## 2. Método de demanda — EMUC (NT.00004, 6.11)
- Puramente residencial: D = D1 × 1,2 + D2 + D3. D1 = S × f (S: Tabela 25; f: Tabela 26); D2 = condomínio por carga instalada; D3 = recarga (NT.00042).
- Tipo e duplex: D = D1 × 1,2 + D3 × 1,4 + D2 + D4, com D3 = S × f + (a + b), a = sauna e b = aquecedor de banheira.
- Misto: D = D1 × 1,2 + D2 + D3 (lojas, por carga instalada) + D4 (recarga).
- Apartamentos de áreas diferentes: média ponderada. Acima de 1.000 m²: Y = 0,034939 × X^0,895075. Vários blocos: demanda por torre.
- Apart-hotel: carga instalada, e não área útil (6.11.8).
- Carga instalada (6.11.4.1): D = a+b+c+d+e+f+g+h, com a = iluminação e tomadas (Tabelas 4 ou 5); b1 a b5 = chuveiros, aquecedores, fornos e fogões, lavadoras e outros (Tabela 7); c = ar-condicionado (Tabelas 8 e 9); d = motores (Tabela 13); e = solda a transformador (100% / 70% / 40% / 30%); f = raios X (100% / 10%); g = hidromassagem (Tabela 10); h = recarga.

## 3. Tabelas (estrutura)
| Tabela | Chave | Resultado |
|---|---|---|
| 25 | faixa de área útil | kVA por apartamento (nota 58: valores mínimos) |
| 26 | nº de apartamentos | f (nº equivalente; 20 = 17,44; 50 = 35,34) |
| 4 | tipo de uso não residencial | carga mínima (W/m²) e FD em %, progressivo em kW |
| 5 | residencial | faixas de carga instalada 0–1 … acima de 10 kW (86 … 45%); prédios: 100% nos 10 kW iniciais, 20% nos 110 seguintes, 10% acima de 120 kW |
| 6 e 7 | nº de aparelhos | FD por grupo de equipamento |

FP: lâmpada de descarga kVA = kW ÷ 0,92; incandescente e halógena kVA = kW.

## 4. Atendimento (NT.00004, 5.15; NT.00001)
- Baixa tensão até 75 kW de carga instalada; acima, média tensão, com demanda até 2.500 kW; acima de 2.500 kW, alta tensão.
- Condomínio acima de 75 kW e até 300 kVA pode ser Grupo B: mais de 50% das unidades no Grupo B, solicitação do consumidor e estudo.
- Nota Técnica 004/2026: estudo de rede para ligação trifásica com demanda igual ou superior a 15 kVA (antes 22); recarga acima de 7,4 kW exige projeto.
- NT.00001, Tabelas 1 e 2 (entrada em 220/380 V e 127/220 V) e Tabelas 11 e 12 (monofásico com transformador exclusivo, chave carga instalada).

## 5. Recarga (NT.00042)
FD = 1 no circuito terminal e no de distribuição, salvo controle de recarga (6.4). Potências mínimas, quando a estação é desconhecida: lenta 7 kW, semirrápida 22 kW, rápida 50 kW (Tabela 2, nota 4). Em EMUC, a recarga entra na carga instalada e demanda do condomínio ou das unidades do Grupo B (6.5.2).

## 6. Divergência a conferir
Tabela 25, 181–190 m²: 3,84 (as demais trazem 3,83).

## 7. Fora do cálculo
Planilhas da NT.00002 (transformador recomendado e correção do fator de potência).

## 8. FD da carga instalada, apart-hotel e condomínio (NT.00004)
- **Tabela 5, iluminação e tomadas de uso geral, prédios residenciais:** FD por faixa de carga: 100% nos 10 kW iniciais, 20% nos 110 kW seguintes e 10% acima de 120 kW. Aplica-se à soma de iluminação e tomadas.
- **Tabela 6, aparelhos por quantidade:** FD por nº de aparelhos, por grupo (chuveiro; torneira, aquecedor e ferro; fogão; secadora, lava-louça, forno elétrico e micro-ondas). Exemplo, de 16 a 20 aparelhos: chuveiro 0,28; torneira, aquecedor e ferro 0,42; fogão 0,26; grupo de secadora, lava-louça, forno e micro-ondas 0,40. Tabela completa no PDF.
- **FP:** lâmpada halógena, kVA = kW; lâmpada de descarga, kVA = kW ÷ 0,92. Para os demais tipos, o projetista digita.
- **Apart-hotel (6.11.8):** os apartamentos entram por carga instalada. A contagem de aparelhos do FD conta os aparelhos de todos os apartamentos do escopo. A linha da Tabela 5 aplicável e a contagem por grupo ficam a confirmar com a prática da Equatorial.
