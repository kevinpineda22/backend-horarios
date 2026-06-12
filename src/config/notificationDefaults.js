// src/config/notificationDefaults.js
// Fuente única de verdad para los destinatarios de notificación por correo.
// Se usan como SEMILLA / FALLBACK cuando la tabla ph_notificacion_destinatarios
// aún no fue configurada desde el panel. Así el comportamiento de envío sigue
// siendo idéntico al actual hasta que un admin guarde su propia lista.

// Novedades CRÍTICAS (Incapacidades / Restricciones-Recomendaciones) → SST/DH.
export const DEFAULT_SST_EMAILS = [
  "auxiliarsst@merkahorrosas.com",
  "sistemageneralsst@merkahorrosas.com",
  "analistajuniordh@merkahorrosas.com",
  "analistadh@merkahorrosas.com",
  "asistentegh@merkahorrosas.com",
];

// Resto de novedades (no críticas).
export const DEFAULT_GENERAL_EMAILS = ["asistentegh@merkahorrosas.com"];

// Categoría con la que el panel administra los destinatarios críticos.
// La lista plana del panel se guarda bajo este tipo_novedad.
export const TIPO_CRITICA = "critica";
