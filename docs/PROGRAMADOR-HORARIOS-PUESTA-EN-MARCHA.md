# Programador de Horarios — Puesta en marcha (datos + correo)

> Guía operativa para dejar el sistema listo para usar. El **código ya cumple el 100% de la spec**.
> Lo que falta acá NO es código: son **datos** que se cargan en Supabase/panel e **infra** (correo).
> Última actualización: 2026-06-16.

---

## 0. Resumen / checklist

- [ ] **Turno base** asignado a cada colaborador (sin esto, generar horario tira 409).
- [ ] **Cupos 2+2** por sede (spec 2.2).
- [ ] **4 correos** de incapacidad cargados (spec 7.3).
- [ ] **Correo saliente** funcionando (hoy Outlook tira 535 en Vercel → migrar a Resend/Brevo).
- [ ] **Redeploy del backend** en Vercel (para que tome el endpoint de auditoría nuevo).
- [ ] **Frontend** desplegado a merkahorro.com (o probar local con `npm run dev`).

> Para cada dato hay **dos caminos**: el **panel** (recomendado, sin tocar la base) o **SQL** (más rápido para carga masiva). Elegí uno.

---

## 1. Turno base por colaborador (spec 3.1)

**Por qué:** el motor deriva TODO del turno (jornada L-V, sábado, bloques). Sin turno base, `POST /api/horarios` responde **409**.

### Opción A — Panel (recomendada)
Programador de Horarios → seleccionar colaborador → panel **"Turno base"** → elegir `07:00 - 16:00` o `09:00 - 18:00` → guardar.

### Opción B — SQL (uno por colaborador)
```sql
-- Asigna turno base vigente desde hoy. Reemplazá cédula y turno.
insert into public.ph_asignacion_jornada (empleado_id, jornada_id, vigente_desde, creado_por)
select e.id, j.id, current_date, 'seed-sql'
from public.empleados e, public.ph_jornadas j
where e.cedula = '1234567890'          -- ← cédula del colaborador
  and j.nombre = '07:00 - 16:00';      -- ← '07:00 - 16:00' o '09:00 - 18:00'
```
> ⚠️ Si el colaborador YA tiene un turno vigente, primero cerralo (`update ... set vigente_hasta = current_date where empleado_id = ... and vigente_hasta is null`) o usá el panel, que lo hace solo.

---

## 2. Cupos 2+2 por sede (spec 2.2)

**Por qué:** cada sede debe tener 2 colaboradores en `07-16` y 2 en `09-18`. Esto alimenta la **alerta blanda** (avisa, no bloquea) al asignar.

### Opción A — Panel (recomendada)
Configuración → **"Sedes y Cupos"** → por cada sede, poner `2` en cada turno → guardar.

### Opción B — SQL (todas las sedes de una, cupos = 2 en ambos turnos)
```sql
insert into public.ph_sede_config (sede_id, jornada_id, cupos)
select s.id, j.id, 2
from public.sedes s
cross join public.ph_jornadas j
where j.nombre in ('07:00 - 16:00', '09:00 - 18:00')
on conflict (sede_id, jornada_id) do update set cupos = excluded.cupos;
```

---

## 3. Cuatro correos de incapacidad (spec 7.3)

**Por qué:** al registrar una incapacidad, el sistema notifica a Valentina Flórez, Laura Obando, Laura Melisa Caro y Laura Ariza. Hoy hay un **fallback** a la lista SST; cargar estos 4 hace que reciban ELLAS.

### Opción A — Panel (recomendada)
Configuración → **"Destinatarios"** → agregar los 4 correos → guardar. (Internamente quedan como `tipo_novedad = 'critica'`.)

### Opción B — SQL (reemplaza la lista crítica completa, igual que el panel)
```sql
-- Mirror exacto de lo que hace el panel: borra la lista crítica y la recarga.
delete from public.ph_notificacion_destinatarios where tipo_novedad = 'critica';

insert into public.ph_notificacion_destinatarios (correo, tipo_novedad, activo)
values
  ('valentina.florez@CORREO',   'critica', true),   -- ← Valentina Flórez
  ('laura.obando@CORREO',       'critica', true),   -- ← Laura Obando
  ('laura.caro@CORREO',         'critica', true),   -- ← Laura Melisa Caro
  ('laura.ariza@CORREO',        'critica', true);   -- ← Laura Ariza
```
> Reemplazá los `@CORREO` por los correos reales. (No los tengo — completar antes de correr.)

---

## 4. Correo saliente: migrar de Outlook a Resend/Brevo

**Problema:** Outlook/Office365 rechaza el login SMTP en Vercel (error **535**). Sin esto, la notificación de incapacidad (7.3) NO sale, aunque el código esté bien.

**La buena noticia:** `emailService.js` usa **SMTP genérico por env vars** (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `EMAIL_USER`, `EMAIL_PASS`). Por eso **migrar es solo cambiar env vars en Vercel — CERO código.**

### Opción recomendada: Resend (vía SMTP)
1. Crear cuenta en resend.com y **verificar el dominio** `merkahorrosas.com` (registros DNS que te da Resend).
2. Generar una **API Key**.
3. En Vercel → Settings → Environment Variables, poner:
   ```
   SMTP_HOST=smtp.resend.com
   SMTP_PORT=465
   SMTP_SECURE=true
   EMAIL_USER=resend
   EMAIL_PASS=<API_KEY_de_Resend>
   ```
   > El `from` se arma como `"Sistema de Horarios" <EMAIL_USER>`. Con Resend, conviene cambiar `EMAIL_USER` por un remitente verificado (ej. `horarios@merkahorrosas.com`) — eso SÍ es un retoque mínimo de código en `emailService.js` línea 32 si querés un from distinto del user. Avisame y lo hago.

### Alternativa: Brevo (ex-Sendinblue), también por SMTP
```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
EMAIL_USER=<tu-login-SMTP-de-Brevo>
EMAIL_PASS=<tu-SMTP-key-de-Brevo>
```

4. **Redeploy** del backend para que tome las env vars.

### Kill-switch para pruebas
- `EMAIL_ENABLED=false` en Vercel (+ redeploy) **pausa TODO el envío** (no manda nada, solo loguea). Quitarla cuando quieras reactivar.

---

## 5. Verificación final (end-to-end)

1. **Turno base** → asignar a un colaborador de prueba.
2. **Generar horario** → debe salir L-V 8h + Sábado derivado (sin 409).
3. **Editar un día** con extras → ver el **toast de quincena** (alerta, no bloqueo).
4. **Cargar un día de estudio** → ver el **pill "Estudio Xh · col. Yh / emp. Zh"** en el calendario.
5. **Registrar una incapacidad** con `EMAIL_ENABLED=true` → confirmar que llega a los 4 correos.
6. **Auditoría** → entrar a "Auditoría de Cambios" y ver el cambio registrado (antes → después).

---

## 6. Permisos de Gestión Humana (nota de seguridad)

Se removió un gmail personal hardcodeado de la lista de permisos (`observacionesController.js`). Ahora la lista de correos con rol GH se puede **extender por env** sin tocar código:
```
HR_ALLOWED_EMAILS=correo1@dominio.com,correo2@dominio.com
```
Los 5 correos corporativos de GH siguen como base por defecto.
