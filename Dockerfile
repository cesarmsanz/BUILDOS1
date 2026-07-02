FROM node:20-alpine

WORKDIR /app

# Instalar dependencias si better-sqlite3 esta disponible
RUN apk add --no-cache python3 make g++ sqlite-dev 2>/dev/null || true

COPY package.json ./
RUN npm install --production --no-audit --no-fund 2>/dev/null || echo "Sin dependencias opcionales"

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
