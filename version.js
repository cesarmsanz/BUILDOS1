// BuildOS — Sistema de versiones y auto-update
// Añadir esto al final de server.js antes de server.listen()

const VERSION = {
  major: 4,
  minor: 0,
  patch: 0,
  build: '20250703',
  codename: 'Intranet',
  changelog: [
    { v: '4.0.0', date: '2026-07-03', changes: [
      'Intranet completa con auth por email/password',
      'Sistema de roles (admin, jefe_obra, comercial, instalador, visualizador)',
      'Panel de administracion de usuarios',
      'Proxy IA a Kimi/Moonshot con fallback Anthropic',
      'WhatsApp con Twilio (webhook + envio)',
      'Persistencia SQLite',
      'Export PDF de presupuestos',
      'Control de cambios en obra',
      'Pin protection + persistencia localStorage'
    ]},
    { v: '3.0.0', date: '2026-07-02', changes: [
      'Exportacion a PDF con formato Riverwalk',
      'Control de cambios en obra (deltas)',
      'Panel WhatsApp simulado',
      'Persistencia localStorage mejorada',
      'Auth por PIN local'
    ]},
    { v: '2.0.0', date: '2026-07-01', changes: [
      'Calendario Gantt con drag & drop',
      'Cuaderno de medidas',
      'Terminal de obra con IA',
      'Analisis estrategico (KPIs, rappels)',
      'Catálogo de productos, proveedores, instaladores'
    ]},
    { v: '1.0.0', date: '2026-06-30', changes: [
      'Lanzamiento inicial de BuildOS',
      'Presupuesto con 22 capítulos',
      'Plano con canvas (carga PDF/PNG)',
      'Deteccion de estancias con IA',
      'Wizard de proyecto de 7 pasos'
    ]}
  ]
};

module.exports = { VERSION };
