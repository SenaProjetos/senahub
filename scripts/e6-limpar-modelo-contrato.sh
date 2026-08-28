#!/bin/bash

# E6 Parte B: verificar e limpar ModeloContrato em produção
# Uso: bash scripts/e6-limpar-modelo-contrato.sh
# Requer: DATABASE_URL válido, acesso psql

set -e

DB_URL="${DATABASE_URL}"
if [[ -z "$DB_URL" ]]; then
  echo "❌ DATABASE_URL não configurado. Defina a variável de ambiente."
  exit 1
fi

EXPORT_DIR="./backups/modelo-contrato-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$EXPORT_DIR"

echo "🔍 Verificando ModeloContrato em produção..."

# Query 1: contagem e tamanho
RESULT=$(psql "$DB_URL" -t -c "SELECT count(*), COALESCE(sum(length(conteudo)), 0) FROM modelo_contrato;")
COUNT=$(echo "$RESULT" | awk '{print $1}')
SIZE=$(echo "$RESULT" | awk '{print $2}')

echo "  Contagem: $COUNT linhas"
echo "  Tamanho total: $SIZE bytes"

if [[ $COUNT -eq 0 ]]; then
  echo "✅ Nenhuma linha — procedendo com DROP."
  psql "$DB_URL" -c "DROP TABLE modelo_contrato;"
  echo "✅ Tabela dropada."
  exit 0
fi

if [[ $SIZE -lt 1000 ]]; then
  echo "⚠️  Conteúdo vazio (~$SIZE bytes) — procedendo com DROP."
  psql "$DB_URL" -c "DROP TABLE modelo_contrato;"
  echo "✅ Tabela dropada."
  exit 0
fi

echo "⚠️  TEXTO REAL DETECTADO ($SIZE bytes em $COUNT linhas)"
echo "📥 Exportando para $EXPORT_DIR antes do drop..."

# Query 2: exporta CSV
psql "$DB_URL" -c "COPY modelo_contrato TO STDOUT CSV HEADER" > "$EXPORT_DIR/modelo_contrato.csv"
echo "✅ CSV exportado: $EXPORT_DIR/modelo_contrato.csv"

# Query 3: exporta JSON
psql "$DB_URL" -t -c "SELECT json_agg(row_to_json(t)) FROM modelo_contrato t;" > "$EXPORT_DIR/modelo_contrato.json"
echo "✅ JSON exportado: $EXPORT_DIR/modelo_contrato.json"

echo ""
echo "📋 PRÓXIMOS PASSOS (MANUAL):"
echo "  1. Revise os arquivos em $EXPORT_DIR"
echo "  2. Quando tiver certeza, execute:"
echo "     psql \$DATABASE_URL -c 'DROP TABLE modelo_contrato;'"
echo "  3. Depois execute o deploy do código (E6 Parte B)"
echo ""
