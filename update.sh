#!/bin/bash
# BuildOS — Script de actualización
# Uso: ./update.sh [version]
# Ejemplo: ./update.sh        → actualiza a la última versión
# Ejemplo: ./update.sh 4.1.0  → actualiza a versión específica

set -e

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="$INSTALL_DIR/backups"
VERSION_URL="https://api.github.com/repos/riverwalk/buildos/releases/latest"
EXPLICIT_VERSION="${1:-}"

echo "═══════════════════════════════════════════════════"
echo "  BuildOS — Actualizador"
echo "  Directorio: $INSTALL_DIR"
echo "═══════════════════════════════════════════════════"

# 1. Verificar que estamos en el directorio correcto
if [ ! -f "$INSTALL_DIR/server.js" ]; then
    echo "❌ Error: No se encontró server.js en $INSTALL_DIR"
    echo "   Ejecuta este script desde el directorio de instalación de BuildOS"
    exit 1
fi

# 2. Obtener versión actual
CURRENT_VERSION=$(grep -o "VERSION = {[^}]*}" "$INSTALL_DIR/server.js" 2>/dev/null | grep -o "major: [0-9]*" | awk '{print $2}')
CURRENT_MINOR=$(grep -o "VERSION = {[^}]*}" "$INSTALL_DIR/server.js" 2>/dev/null | grep -o "minor: [0-9]*" | awk '{print $2}')
CURRENT_PATCH=$(grep -o "VERSION = {[^}]*}" "$INSTALL_DIR/server.js" 2>/dev/null | grep -o "patch: [0-9]*" | awk '{print $2}')
CURRENT="${CURRENT_VERSION:-4}.${CURRENT_MINOR:-0}.${CURRENT_PATCH:-0}"

echo "📦 Versión actual: $CURRENT"

# 3. Obtener última versión disponible
if [ -n "$EXPLICIT_VERSION" ]; then
    LATEST="$EXPLICIT_VERSION"
    echo "📥 Versión solicitada: $LATEST"
else
    echo "🔍 Buscando última versión..."
    LATEST=$(curl -s "$VERSION_URL" | grep '"tag_name":' | sed -E 's/.*"v?([^"]+)".*/\1/')
    if [ -z "$LATEST" ]; then
        echo "⚠️  No se pudo obtener la última versión automáticamente."
        echo "   Usa: ./update.sh X.Y.Z (versión específica)"
        echo "   O descarga manualmente desde: https://github.com/riverwalk/buildos/releases"
        exit 1
    fi
    echo "📥 Última versión: $LATEST"
fi

# 4. Comparar versiones
if [ "$CURRENT" = "$LATEST" ]; then
    echo "✅ Ya estás en la última versión ($CURRENT). No hay nada que actualizar."
    exit 0
fi

echo ""
echo "⚠️  Se actualizará: $CURRENT → $LATEST"
read -p "¿Continuar? (s/N): " CONFIRM
if [ "$CONFIRM" != "s" ] && [ "$CONFIRM" != "S" ]; then
    echo "❌ Cancelado."
    exit 0
fi

# 5. Crear backup
echo ""
echo "💾 Creando backup..."
mkdir -p "$BACKUP_DIR"
BACKUP_NAME="backup-v${CURRENT}-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$BACKUP_DIR/$BACKUP_NAME" -C "$INSTALL_DIR" \
    --exclude='node_modules' \
    --exclude='backups' \
    --exclude='data' \
    --exclude='.env' \
    .
echo "   Backup guardado: backups/$BACKUP_NAME"

# 6. Descargar nueva versión
DOWNLOAD_URL="https://github.com/riverwalk/buildos/archive/refs/tags/v${LATEST}.tar.gz"
TEMP_DIR=$(mktemp -d)

echo ""
echo "⬇️  Descargando v$LATEST..."
if ! curl -sL "$DOWNLOAD_URL" -o "$TEMP_DIR/buildos.tar.gz"; then
    echo "❌ Error descargando. Intentando con zip..."
    DOWNLOAD_URL="https://github.com/riverwalk/buildos/archive/refs/tags/v${LATEST}.zip"
    if ! curl -sL "$DOWNLOAD_URL" -o "$TEMP_DIR/buildos.zip"; then
        echo "❌ No se pudo descargar la versión $LATEST"
        rm -rf "$TEMP_DIR"
        exit 1
    fi
    cd "$TEMP_DIR" && unzip -q buildos.zip
else
    cd "$TEMP_DIR" && tar -xzf buildos.tar.gz
fi

# 7. Encontrar directorio extraído
EXTRACTED_DIR=$(find "$TEMP_DIR" -maxdepth 1 -type d -name "buildos-*" | head -1)
if [ -z "$EXTRACTED_DIR" ]; then
    echo "❌ Error: No se encontró el directorio extraído"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# 8. Actualizar archivos (conservando .env y data/)
echo ""
echo "🔄 Actualizando archivos..."

# Preservar archivos del usuario
cp "$INSTALL_DIR/.env" "$TEMP_DIR/.env.backup" 2>/dev/null || true
cp -r "$INSTALL_DIR/data" "$TEMP_DIR/data.backup" 2>/dev/null || true
cp -r "$INSTALL_DIR/backups" "$TEMP_DIR/backups.backup" 2>/dev/null || true

# Copiar nuevos archivos
rsync -a --exclude='.env' --exclude='data' --exclude='backups' --exclude='node_modules' \
    "$EXTRACTED_DIR/" "$INSTALL_DIR/"

# Restaurar archivos del usuario
cp "$TEMP_DIR/.env.backup" "$INSTALL_DIR/.env" 2>/dev/null || true
cp -r "$TEMP_DIR/data.backup" "$INSTALL_DIR/data" 2>/dev/null || true
cp -r "$TEMP_DIR/backups.backup" "$INSTALL_DIR/backups" 2>/dev/null || true

# 9. Reinstalar dependencias si cambió package.json
echo ""
echo "📦 Verificando dependencias..."
cd "$INSTALL_DIR"
if [ -f "package.json" ]; then
    npm install --production --no-audit --no-fund 2>/dev/null || echo "   (Sin cambios en dependencias)"
fi

# 10. Limpiar
rm -rf "$TEMP_DIR"

# 11. Reiniciar servicio si está corriendo con Docker
if [ -f "docker-compose.yml" ] && docker compose ps | grep -q buildos 2>/dev/null; then
    echo ""
    echo "🐳 Reiniciando contenedor Docker..."
    docker compose down && docker compose up -d
    echo "✅ Contenedor reiniciado. BuildOS v$LATEST está corriendo."
# O con PM2
elif command -v pm2 &> /dev/null && pm2 list | grep -q buildos 2>/dev/null; then
    echo ""
    echo "🔄 Reiniciando con PM2..."
    pm2 restart buildos
    echo "✅ PM2 reiniciado. BuildOS v$LATEST está corriendo."
# O proceso manual
else
    echo ""
    echo "⚠️  Reinicia manualmente el servidor:"
    echo "   npm start"
    echo "   # o"
    echo "   docker compose up -d"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ BuildOS actualizado: v$LATEST"
echo "  💾 Backup: backups/$BACKUP_NAME"
echo "═══════════════════════════════════════════════════"
echo ""
echo "📋 Si algo falla, restaura el backup:"
echo "   tar -xzf backups/$BACKUP_NAME -C $INSTALL_DIR"
