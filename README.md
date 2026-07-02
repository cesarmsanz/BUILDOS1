# BuildOS Intranet — Deploy en tu Servidor

## ⚠️ Por qué los datos no se guardan ahora

El link actual (kimi.page) es un **servidor estático** — sirve el HTML como si abrieras un archivo en tu ordenador. Cada vez que recargas, es como si abrieras el archivo de nuevo. Por eso:
- ❌ Los datos se pierden al cerrar la pestaña
- ❌ No hay usuarios ni autenticacion real
- ❌ WhatsApp muestra "cargando contactos" (no hay API detras)

## ✅ Solucion: Backend + Base de datos en TU servidor

Necesitas un servidor propio (VPS, Railway, Render, etc.) donde corre el backend + base de datos. Ahi SI se guardan los datos permanentemente.

---

## 🚀 Opcion 1: Docker (Recomendada — 5 minutos)

Requisitos: Docker y Docker Compose instalados

```bash
# 1. Descomprimir
cd /opt
sudo unzip buildos-intranet.zip -d buildos

# 2. Configurar variables
cd buildos
nano .env
# Editar:
# KIMI_API_KEY=tu-key-de-kimi
# JWT_SECRET=un-texto-secreto-largo-aleatorio
# ADMIN_EMAIL=tu@email.com
# ADMIN_PASSWORD=tu-password

# 3. Levantar todo
docker-compose up -d

# 4. Abrir en navegador
# http://localhost:3000 (o tu dominio)
```

---

## 🚀 Opcion 2: Manual con Node.js

Requisitos: Node.js 18+, npm

```bash
# 1. Descomprimir
cd /opt
sudo unzip buildos-intranet.zip -d buildos
cd buildos

# 2. Instalar dependencias
npm install

# 3. Configurar .env
cp .env.example .env
nano .env
# Editar las variables necesarias

# 4. Iniciar base de datos (SQLite se crea automaticamente)

# 5. Iniciar servidor
npm start

# 6. Abrir en navegador
# http://localhost:3000
```

---

## 🚀 Opcion 3: Railway/Render (Gratuito)

1. Crea cuenta en [Railway](https://railway.app) o [Render](https://render.com)
2. Conecta tu repo de GitHub con este codigo
3. Añade variables de entorno en el panel
4. Deploy automatico

---

## ⚙️ Configuracion de variables (.env)

```env
# === SERVIDOR ===
PORT=3000
NODE_ENV=production

# === AUTENTICACION ===
JWT_SECRET=genera-un-texto-largo-aleatorio-de-64-caracteres-aqui
JWT_EXPIRES_IN=7d

# === IA (Kimi/Moonshot) ===
KIMI_API_KEY=sk-tu-api-key-de-kimi-moonshot
# Opcional: fallback a Anthropic
# ANTHROPIC_API_KEY=sk-ant-tu-key-de-anthropic

# === WHATSAPP (Twilio) ===
TWILIO_ACCOUNT_SID=AC-tu-account-sid-de-twilio
TWILIO_AUTH_TOKEN=tu-auth-token-de-twilio
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# === ADMIN INICIAL ===
ADMIN_EMAIL=admin@riverwalk.es
ADMIN_PASSWORD=tu-password-segura
ADMIN_NAME=Administrador

# === BASE DE DATOS (SQLite por defecto) ===
DATABASE_PATH=./data/buildos.db
```

---

## 📱 Configuracion de WhatsApp (Twilio)

### Paso 1: Crear cuenta en Twilio
1. Ve a [twilio.com/try-twilio](https://www.twilio.com/try-twilio)
2. Registrate con tu email (gratis para empezar)
3. Verifica tu numero de telefono

### Paso 2: Activar WhatsApp Sandbox
1. En el panel de Twilio, busca "Messaging" → "Try it out" → "Send a WhatsApp message"
2. Te daran un numero de sandbox (ej: +1 415 523 8886)
3. Envía el mensaje de union desde tu WhatsApp

### Paso 3: Configurar Webhook
1. En Twilio, ve a tu numero de WhatsApp → "Configure"
2. En "When a message comes in", selecciona "Webhook"
3. URL: `https://TU-DOMINIO/api/whatsapp/webhook`
4. Metodo: HTTP POST

### Paso 4: Obtener credenciales
1. Ve a "Account Info" en el panel de Twilio
2. Copia:
   - **Account SID** (empieza con AC...)
   - **Auth Token**
3. Añadelas al archivo `.env`

### Paso 5: Probar
1. Tu equipo envia mensajes al numero de Twilio
2. Aparecen automaticamente en BuildOS → pestaña Obra → WhatsApp
3. Puedes responder desde la app

---

## 👥 Gestion de Usuarios (Roles)

### Roles disponibles:
| Rol | Permisos |
|-----|----------|
| **admin** | Todo: usuarios, proyectos, configuracion |
| **jefe_obra** | CRUD proyectos, presupuestos, WhatsApp |
| **comercial** | Crear proyectos, editar presupuestos |
| **instalador** | Ver proyectos asignados, reportar incidencias |
| **visualizador** | Solo lectura |

### Crear usuarios:
1. Inicia sesion como admin
2. Ve a "Panel de Admin" → "Usuarios"
3. "Nuevo usuario" → email, nombre, rol
4. El usuario recibe email con link para establecer password

---

## 📁 Estructura del paquete

```
buildos-intranet/
├── docker-compose.yml          # Docker (todo en uno)
├── Dockerfile                  # Imagen del backend
├── .env.example                # Plantilla de variables
├── README.md                   # Este archivo
├── package.json                # Dependencias Node.js
├── server.js                   # Servidor completo (todo en uno)
├── src/
│   ├── db.js                   # Base de datos SQLite + tablas
│   ├── auth.js                 # JWT + bcrypt + roles
│   ├── api.js                  # Todos los endpoints REST
│   ├── ai-proxy.js             # Proxy a Kimi/Moonshot
│   └── whatsapp.js             # Twilio webhook + API
├── data/                       # SQLite database (se crea al iniciar)
└── public/                     # Frontend (BuildOS v4)
    └── index.html              # App completa (7701 lineas)
```

## 🔒 Seguridad
- Passwords hasheados con bcrypt (12 rounds)
- JWT con expiracion de 7 dias
- Refresh tokens automaticos
- CORS configurado para tu dominio
- Rate limiting en API
- Validacion de inputs

## 📞 Soporte
Si necesitas ayuda con el deploy, contacta con tu proveedor de hosting o consulta la documentacion de Docker/Railway.
