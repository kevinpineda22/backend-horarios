// src/controllers/horariosController.js
import { supabaseAxios } from "../services/supabaseAxios.js";
import {
  generateScheduleByShift,
  buildEditedDayBlocks,
  buildSundayBlocks,
  isoWeekday,
  getDayInfo,
  allocateHoursRandomly,
  getLegalCapForDay, // <-- Importación correcta
  getRegularDailyCap, // <-- Importación correcta
  getPayableExtraCapForDay, // <-- Importación correcta
} from "../utils/schedule.js";
import { getJornadaBaseVigente } from "./phConfigController.js";
import { getHolidaySet } from "../utils/holidays.js";
import { format, parseISO, isValid, addDays } from "date-fns";
import { sendEmail } from "../services/emailService.js";
import { buildScheduleConfig } from "../services/phConfigService.js";
import { getQuincenaRange } from "../utils/quincena.js";
import {
  writeAuditEvent,
  auditUserFromReq,
  resolveEmpleadoNombre,
} from "../utils/auditoria.js";

// --- Constantes y Helpers ---
const toFixedNumber = (value) => Number(Number(value || 0).toFixed(2));
const MAX_OVERTIME_PER_DAY = 4;

// URL pública donde el colaborador consulta su horario (ingresa su cédula).
const PUBLIC_CONSULTA_URL =
  process.env.PUBLIC_CONSULTA_URL || "https://merkahorro.com/consulta-horarios";

// Construye el HTML del correo de notificación de horario. Se usa tanto al
// crear el horario como al reenviarlo manualmente tras editarlo.
const buildHorarioEmailHtml = (nombre, fechaInicio, fechaFin) => `
    <!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Horario Asignado</title></head>
    <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e0e0e0;">
        <div style="background-color: #210d65; color: #ffffff; text-align: center; padding: 25px;">
            <h1 style="margin: 0; font-size: 24px;">📅 Horario Asignado</h1>
        </div>
        <div style="padding: 30px;">
            <p style="font-size: 18px; color: #210d65; margin: 0 0 20px 0;">Hola <strong>${nombre}</strong>,</p>
            <p style="color: #333333; font-size: 16px; margin: 0 0 20px 0; line-height: 1.5;">
                Te informamos que tu horario laboral fue generado/actualizado y ya está disponible:
            </p>
            <div style="background-color: #f8f9ff; border-left: 3px solid #210d65; padding: 15px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0; color: #333333; font-size: 16px;"><strong>Período asignado:</strong></p>
                <p style="font-size: 18px; color: #210d65; text-align: center; margin: 0; font-weight: bold;">
                    ${fechaInicio} al ${fechaFin}
                </p>
            </div>
            <div style="text-align: center; margin-top: 30px;">
                <a href="${PUBLIC_CONSULTA_URL}" style="background-color: #210d65; color: #ffffff; text-decoration: none; padding: 12px 30px; font-size: 16px; font-weight: bold;">
                    Ver Mi Horario
                </a>
            </div>
        </div>
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
            <p style="margin: 0; color: #666666; font-size: 14px;">Este es un mensaje automatizado.</p>
        </div>
    </div>
    </body></html>`;

// Envía el correo de horario a un empleado. Devuelve un objeto de estado con
// { sent, error, empleado } (nunca lanza: el correo no debe tumbar el flujo).
const enviarCorreoHorario = async (empleadoId, fechaInicio, fechaFin) => {
  const status = { sent: false, error: null, empleado: null };
  try {
    const {
      data: [emp],
      error: empErr,
    } = await supabaseAxios.get(
      `/empleados?select=nombre_completo,correo_electronico&id=eq.${empleadoId}`
    );
    if (empErr || !emp) {
      status.error = "No se pudo obtener datos del empleado";
      return status;
    }
    status.empleado = emp.nombre_completo;
    if (!emp.correo_electronico) {
      status.error = "Empleado sin correo";
      return status;
    }
    const subject = `📅 Horario asignado: ${fechaInicio} al ${fechaFin}`;
    const htmlContent = buildHorarioEmailHtml(
      emp.nombre_completo,
      fechaInicio,
      fechaFin
    );
    await sendEmail(emp.correo_electronico, subject, htmlContent);
    status.sent = true;
    return status;
  } catch (emailError) {
    status.error = `Error enviando correo: ${emailError.message}`;
    return status;
  }
};

// Carga la config de negocio (límites del panel) sin romper la generación si la
// BD falla o está vacía: en ese caso devuelve null y el motor usa sus defaults
// legales. Así el cableado es no-destructivo hasta que un admin configure.
const loadScheduleConfigSafe = async () => {
  try {
    return await buildScheduleConfig();
  } catch (e) {
    console.warn(
      "No se pudo cargar config de horarios, usando defaults legales:",
      e?.message || e
    );
    return null;
  }
};

const BLOCKING_NOVEDADES = new Set([
  "Incapacidades",
  "Licencias",
  "Vacaciones",
  "Permisos",
  "Estudio",
  "Día de la Familia",
]);

// ¿La novedad es un bloqueo PARCIAL (resta horas del día) en vez de un bloqueo
// de día completo? Lo son el Estudio con días de estudio y el Permiso por horas.
// Estas se pasan al motor como `partialObservations` y NO frenan la generación.
const isPartialObservation = (obs) =>
  Boolean(
    (obs?.tipo === "Estudio" &&
      Array.isArray(obs?.details?.dias_estudio) &&
      obs.details.dias_estudio.length > 0) ||
      (obs?.tipo === "Permisos" &&
        Array.isArray(obs?.details?.horas_permiso) &&
        obs.details.horas_permiso.length > 0)
  );

const parseDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }
  const strValue = `${value}`.trim();
  if (!strValue) return null;
  const normalized = strValue.length > 10 ? strValue.slice(0, 10) : strValue;
  const parsed = parseISO(normalized + "T00:00:00");
  return isValid(parsed) ? parsed : null;
};

const toISODateString = (date) => format(date, "yyyy-MM-dd");

const inferEndDate = (startDate, endCandidate, details) => {
  let inferred = parseDateOnly(endCandidate);
  if (!inferred || inferred < startDate) {
    const duration = Number(details?.duracion_dias);
    if (!Number.isNaN(duration) && duration > 0) {
      inferred = addDays(startDate, duration - 1);
    }
  }
  if ((!inferred || inferred < startDate) && details?.diasIncapacidad) {
    let parsedNumber = NaN;
    if (typeof details.diasIncapacidad === "number") {
      parsedNumber = details.diasIncapacidad;
    } else if (typeof details.diasIncapacidad === "string") {
      const match = details.diasIncapacidad.match(/\d+/);
      if (match) parsedNumber = Number(match[0]);
    }
    if (!Number.isNaN(parsedNumber) && parsedNumber > 0) {
      inferred = addDays(startDate, parsedNumber - 1);
    }
  }
  if (!inferred || inferred < startDate) {
    inferred = startDate;
  }
  return inferred;
};

const normalizeBlockingObservation = (rawObs) => {
  if (!rawObs || !BLOCKING_NOVEDADES.has(rawObs.tipo_novedad)) return null;
  const details =
    rawObs.details && typeof rawObs.details === "object" ? rawObs.details : {};
  let startCandidate = null,
    endCandidate = null;

  switch (rawObs.tipo_novedad) {
    case "Vacaciones":
      startCandidate = details.fecha_inicio_vacaciones || rawObs.fecha_novedad;
      if (details.fecha_fin_vacaciones)
        endCandidate = details.fecha_fin_vacaciones;
      else if (details.fecha_regreso_vacaciones) {
        const regreso = parseDateOnly(details.fecha_regreso_vacaciones);
        if (regreso) endCandidate = toISODateString(addDays(regreso, -1));
      }
      if (!endCandidate) endCandidate = startCandidate;
      break;
    case "Licencias":
      startCandidate = details.fecha_inicio || rawObs.fecha_novedad;
      endCandidate = details.fecha_termino || details.fecha_inicio;
      break;
    case "Incapacidades":
      startCandidate = details.fecha_inicio || rawObs.fecha_novedad;
      endCandidate = details.fecha_fin || details.fecha_inicio;
      break;
    case "Permisos":
    case "Día de la Familia":
      startCandidate =
        details.fecha_inicio ||
        (details.fecha_propuesta_dia_familia &&
        rawObs.tipo_novedad === "Día de la Familia"
          ? details.fecha_propuesta_dia_familia
          : null) ||
        rawObs.fecha_novedad;
      endCandidate =
        details.fecha_fin ||
        details.fecha_inicio ||
        (details.fecha_propuesta_dia_familia &&
        rawObs.tipo_novedad === "Día de la Familia"
          ? details.fecha_propuesta_dia_familia
          : null) ||
        rawObs.fecha_novedad;
      break;
    case "Estudio":
      if (
        details.dias_estudio &&
        Array.isArray(details.dias_estudio) &&
        details.dias_estudio.length > 0
      ) {
        const sorted = [...details.dias_estudio].sort((a, b) =>
          a.fecha.localeCompare(b.fecha)
        );
        startCandidate = sorted[0].fecha;
        endCandidate = sorted[sorted.length - 1].fecha;
      } else {
        startCandidate = details.fecha_inicio || rawObs.fecha_novedad;
        endCandidate =
          details.fecha_fin || details.fecha_inicio || rawObs.fecha_novedad;
      }
      break;
    default:
      startCandidate = rawObs.fecha_novedad;
      endCandidate = rawObs.fecha_novedad;
      break;
  }

  const startDate = parseDateOnly(startCandidate);
  if (!startDate) return null;
  const endDate = inferEndDate(startDate, endCandidate, details);

  return {
    id: rawObs.id,
    tipo: rawObs.tipo_novedad,
    observacion: rawObs.observacion || "",
    start: toISODateString(startDate),
    end: toISODateString(endDate),
    rawStart: startDate,
    rawEnd: endDate,
    details: details,
  };
};

const fetchBlockingObservationsInRange = async (
  empleadoId,
  startDate,
  endDate
) => {
  const { data, error } = await supabaseAxios.get(
    `/observaciones?select=id,tipo_novedad,observacion,fecha_novedad,details&empleado_id=eq.${empleadoId}&order=fecha_novedad.desc`
  );
  if (error) throw error;
  return (data || [])
    .map(normalizeBlockingObservation)
    .filter(Boolean)
    .filter((obs) => obs.rawEnd >= startDate && obs.rawStart <= endDate);
};

const serializeObservationForResponse = (obs) => ({
  id: obs.id,
  tipo: obs.tipo,
  observacion: obs.observacion,
  fecha_inicio: obs.start,
  fecha_fin: obs.end,
  rawStart: obs.rawStart,
  rawEnd: obs.rawEnd,
});

// --- Endpoints ---

export const getHorariosByEmpleadoId = async (req, res) => {
  const { empleado_id } = req.params;
  const { incluir_archivados = "false" } = req.query;
  try {
    let url = `/horarios?select=*&empleado_id=eq.${empleado_id}`;
    if (incluir_archivados === "false") {
      url += `&estado_visibilidad=eq.publico`;
    }
    url += `&order=fecha_inicio.desc`;
    const { data, error } = await supabaseAxios.get(url);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error("Error fetching horarios:", e);
    res
      .status(500)
      .json({ message: "Error fetching horarios", error: e.message });
  }
};

// Núcleo reutilizable: acumulado de horas extra de la quincena de `fecha` vs.
// el máximo configurable. Devuelve null si la fecha es inválida.
const computeExtrasQuincena = async (empleadoId, fecha, cfg) => {
  const rango = getQuincenaRange(fecha);
  if (!rango) return null;
  const { data } = await supabaseAxios.get(
    `/horarios?select=dias&empleado_id=eq.${empleadoId}&estado_visibilidad=eq.publico&fecha_inicio=lte.${rango.fin}&fecha_fin=gte.${rango.inicio}`
  );
  let acumulado = 0;
  for (const h of data || []) {
    for (const dia of h.dias || []) {
      if (dia.fecha >= rango.inicio && dia.fecha <= rango.fin) {
        acumulado += Number(dia.horas_extra || 0);
      }
    }
  }
  acumulado = toFixedNumber(acumulado);
  const maxRaw = cfg?.limites?.maxExtraPorQuincena;
  const maximo = maxRaw == null || maxRaw === "" ? null : Number(maxRaw);
  return {
    quincena_inicio: rango.inicio,
    quincena_fin: rango.fin,
    acumulado,
    maximo,
    alcanzado: maximo != null && acumulado >= maximo,
    superado: maximo != null && acumulado > maximo,
  };
};

// Escribe auditoría (best-effort) para los días cuyo horario cambió. Spec 5.2 / 8.
const writeAuditEntries = async ({
  horarioId,
  empleadoId,
  previousMap,
  nuevosDias,
  usuario,
  tipoCambio = "edicion_manual",
}) => {
  try {
    const empleadoNombre = await resolveEmpleadoNombre(empleadoId);
    const rows = [];
    for (const d of nuevosDias) {
      const prev = previousMap.get(d.fecha);
      const prevH = Number(prev?.horas || 0);
      const newH = Number(d.horas || 0);
      const prevEnt = prev?.jornada_entrada ?? null;
      const newEnt = d.jornada_entrada ?? null;
      const prevSal = prev?.jornada_salida ?? null;
      const newSal = d.jornada_salida ?? null;
      if (prevH === newH && prevEnt === newEnt && prevSal === newSal) continue;
      rows.push({
        horario_id: horarioId,
        empleado_id: empleadoId,
        empleado_nombre: empleadoNombre,
        dia_afectado: d.fecha,
        tipo_cambio: tipoCambio,
        valor_anterior: { horas: prevH, entrada: prevEnt, salida: prevSal },
        valor_nuevo: { horas: newH, entrada: newEnt, salida: newSal },
        usuario_email: usuario?.email || null,
        usuario_nombre: usuario?.nombre || usuario?.email || null,
      });
    }
    if (rows.length) await supabaseAxios.post("/ph_auditoria_horario", rows);
    return rows.length;
  } catch (e) {
    console.error("No se pudo escribir auditoría (no bloquea):", e?.message || e);
    return 0;
  }
};

// GET /horarios/auditoria/:empleado_id?horario_id=&limit=  (spec 5.2 / 8)
// Consulta el historial de cambios auditados (quién, cuándo, antes → después).
export const getAuditoria = async (req, res) => {
  const { empleado_id } = req.params;
  const { horario_id } = req.query;
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  try {
    let url = `/ph_auditoria_horario?select=*`;
    if (empleado_id && empleado_id !== "todos") {
      url += `&empleado_id=eq.${empleado_id}`;
    }
    if (horario_id) url += `&horario_id=eq.${horario_id}`;
    url += `&order=fecha_cambio.desc&limit=${limit}`;

    const { data, error } = await supabaseAxios.get(url);
    if (error) throw error;
    res.json(Array.isArray(data) ? data : []);
  } catch (e) {
    console.error("Error consultando auditoría:", e?.message || e);
    res
      .status(500)
      .json({ message: "Error consultando auditoría", error: e?.message });
  }
};

// GET /horarios/informe-extras?desde=&hasta=&sede_id=   (spec 4.2)
// Informe AGREGADO de horas extra: quién hizo extras en el rango y cuántas,
// agrupado por sede. Existe para que Gestión Humana deje de revisar colaborador
// por colaborador: resuelve en 3 queries lo que antes eran N (una por empleado).
// Sin `desde`/`hasta` usa la quincena actual (que es como se controla el tope).
export const getInformeExtras = async (req, res) => {
  const { sede_id } = req.query;
  try {
    // 1. Rango: el pedido, o la quincena de hoy como defecto.
    const hoy = new Date().toISOString().slice(0, 10);
    let desde = req.query.desde;
    let hasta = req.query.hasta;
    if (!desde || !hasta) {
      const q = getQuincenaRange(hoy);
      desde = desde || q.inicio;
      hasta = hasta || q.fin;
    }
    if (!parseDateOnly(desde) || !parseDateOnly(hasta)) {
      return res.status(400).json({ message: "Fechas inválidas." });
    }
    if (hasta < desde) {
      return res.status(400).json({ message: "La fecha fin es anterior al inicio." });
    }

    // 2. Colaboradores (opcionalmente de una sede) + catálogo de sedes.
    let empleadosUrl = `/empleados?select=id,nombre_completo,cedula,sede_id&estado=eq.activo&order=nombre_completo.asc`;
    if (sede_id) empleadosUrl += `&sede_id=eq.${sede_id}`;
    const [empRes, sedesRes] = await Promise.all([
      supabaseAxios.get(empleadosUrl),
      supabaseAxios.get(`/sedes?select=id,nombre&order=nombre.asc`),
    ]);
    const empleados = empRes.data || [];
    const sedes = sedesRes.data || [];
    const nombreSede = new Map(sedes.map((s) => [s.id, s.nombre]));

    // Dotación por sede: permite decir "3 de 12 colaboradores hicieron extras"
    // incluso para una sede donde nadie hizo (no aparece en el desglose).
    const empleadosPorSede = empleados.reduce((acc, e) => {
      const key = e.sede_id || "sin-sede";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    if (empleados.length === 0) {
      return res.json({
        desde,
        hasta,
        maximo_quincena: null,
        es_quincena: false,
        total_extras: 0,
        total_empleados: 0,
        empleados_por_sede: {},
        sedes: [],
        empleados: [],
      });
    }

    // 3. Horarios públicos que TOCAN el rango, de esos colaboradores.
    const ids = empleados.map((e) => e.id).join(",");
    const { data: horarios, error } = await supabaseAxios.get(
      `/horarios?select=empleado_id,dias&estado_visibilidad=eq.publico` +
        `&empleado_id=in.(${ids})&fecha_inicio=lte.${hasta}&fecha_fin=gte.${desde}`
    );
    if (error) throw error;

    // 4. Agregar por colaborador, contando SOLO los días dentro del rango (una
    //    semana puede cruzar el borde de la quincena).
    const acumPorEmpleado = new Map();
    for (const h of horarios || []) {
      for (const dia of h.dias || []) {
        if (!dia?.fecha || dia.fecha < desde || dia.fecha > hasta) continue;
        const extra = Number(dia.horas_extra || 0);
        if (!(extra > 0)) continue;
        if (!acumPorEmpleado.has(h.empleado_id)) {
          acumPorEmpleado.set(h.empleado_id, { total: 0, detalle: [] });
        }
        const acc = acumPorEmpleado.get(h.empleado_id);
        acc.total += extra;
        acc.detalle.push({
          fecha: dia.fecha,
          descripcion: dia.descripcion || null,
          horas_extra: toFixedNumber(extra),
          horas: toFixedNumber(dia.horas),
          es_domingo: isoWeekday(dia.fecha) === 7,
          festivo_trabajado: Boolean(dia.festivo_trabajado),
        });
      }
    }

    // 5. Tope de la quincena: solo aplica si el rango ES exactamente una quincena.
    const cfg = await loadScheduleConfigSafe();
    const maxRaw = cfg?.limites?.maxExtraPorQuincena;
    const maximo = maxRaw == null || maxRaw === "" ? null : Number(maxRaw);
    const q = getQuincenaRange(desde);
    const esQuincena = Boolean(q && q.inicio === desde && q.fin === hasta);

    // 6. Solo los que HICIERON extras, de mayor a menor.
    const filas = empleados
      .filter((e) => acumPorEmpleado.has(e.id))
      .map((e) => {
        const acc = acumPorEmpleado.get(e.id);
        const total = toFixedNumber(acc.total);
        return {
          empleado_id: e.id,
          nombre_completo: e.nombre_completo,
          cedula: e.cedula,
          sede_id: e.sede_id,
          sede_nombre: nombreSede.get(e.sede_id) || "Sin sede",
          total_extra: total,
          dias_con_extra: acc.detalle.length,
          // El tope es por quincena: marcarlo en otro rango sería mentir.
          supera_maximo: esQuincena && maximo != null && total > maximo,
          detalle: acc.detalle.sort((a, b) => a.fecha.localeCompare(b.fecha)),
        };
      })
      .sort((a, b) => b.total_extra - a.total_extra);

    // 7. Totales por sede (solo sedes con extras en el rango).
    const porSede = new Map();
    for (const f of filas) {
      const key = f.sede_id || "sin-sede";
      if (!porSede.has(key)) {
        porSede.set(key, {
          sede_id: f.sede_id,
          sede_nombre: f.sede_nombre,
          total_extra: 0,
          empleados_con_extra: 0,
        });
      }
      const s = porSede.get(key);
      s.total_extra = toFixedNumber(s.total_extra + f.total_extra);
      s.empleados_con_extra += 1;
    }

    res.json({
      desde,
      hasta,
      maximo_quincena: maximo,
      es_quincena: esQuincena,
      total_extras: toFixedNumber(filas.reduce((s, f) => s + f.total_extra, 0)),
      total_empleados: empleados.length,
      empleados_por_sede: empleadosPorSede,
      sedes: [...porSede.values()].sort((a, b) => b.total_extra - a.total_extra),
      empleados: filas,
    });
  } catch (e) {
    console.error("Error armando el informe de extras:", e);
    res
      .status(500)
      .json({ message: "Error armando el informe de extras", error: e.message });
  }
};

// GET /horarios/extras-quincena/:empleado_id?fecha=YYYY-MM-DD  (spec 4.2)
export const getExtrasQuincena = async (req, res) => {
  const { empleado_id } = req.params;
  const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);
  try {
    const cfg = await loadScheduleConfigSafe();
    const result = await computeExtrasQuincena(empleado_id, fecha, cfg);
    if (!result) return res.status(400).json({ message: "Fecha inválida." });
    res.json(result);
  } catch (e) {
    console.error("Error calculando extras de quincena:", e);
    res
      .status(500)
      .json({ message: "Error calculando extras de quincena", error: e.message });
  }
};

// POST /horarios/notificar/:empleado_id
// Reenvía manualmente el correo de horario al colaborador. Pensado para usarse
// DESPUÉS de que el admin edita el horario base (el envío automático solo ocurre
// al crearlo). Usa el rango del horario público vigente, o fecha_inicio/fecha_fin
// del body si se envían.
export const notificarHorario = async (req, res) => {
  const { empleado_id } = req.params;
  let { fecha_inicio, fecha_fin } = req.body || {};
  try {
    if (!fecha_inicio || !fecha_fin) {
      // Solo semanas VIGENTES o FUTURAS: como los horarios son acumulativos, el
      // histórico completo haría que el correo anunciara un rango de meses.
      const hoy = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabaseAxios.get(
        `/horarios?select=fecha_inicio,fecha_fin&empleado_id=eq.${empleado_id}&estado_visibilidad=eq.publico&fecha_fin=gte.${hoy}&order=fecha_inicio.asc`
      );
      if (error) throw error;
      if (!data || data.length === 0) {
        return res.status(404).json({
          message:
            "El colaborador no tiene un horario vigente o futuro para notificar.",
        });
      }
      fecha_inicio = data[0].fecha_inicio;
      fecha_fin = data.reduce(
        (max, h) => (h.fecha_fin > max ? h.fecha_fin : max),
        data[0].fecha_fin
      );
    }

    const emailStatus = await enviarCorreoHorario(
      empleado_id,
      fecha_inicio,
      fecha_fin
    );
    if (!emailStatus.sent) {
      return res.status(422).json({
        message: emailStatus.error || "No se pudo enviar el correo.",
        email_notification: emailStatus,
      });
    }

    // Auditoría best-effort del reenvío manual.
    await writeAuditEvent({
      empleadoId: empleado_id,
      tipoCambio: "notificacion_horario",
      valorNuevo: {
        accion: "Correo de horario reenviado",
        rango: `${fecha_inicio} → ${fecha_fin}`,
        destino: emailStatus.empleado,
      },
      usuario: auditUserFromReq(req),
    });

    res.json({
      message: `Correo enviado a ${emailStatus.empleado}.`,
      email_notification: emailStatus,
    });
  } catch (e) {
    console.error("Error notificando horario:", e);
    res
      .status(500)
      .json({ message: "Error al enviar la notificación", error: e.message });
  }
};

export const createHorario = async (req, res) => {
  try {
    const {
      empleado_id,
      fecha_inicio,
      fecha_fin,
      working_weekdays,
      holiday_overrides,
      sunday_overrides,
      creado_por,
    } = req.body;

    const scheduleStart = parseDateOnly(fecha_inicio);
    const scheduleEnd = parseDateOnly(fecha_fin);
    if (!scheduleStart || !scheduleEnd)
      return res.status(400).json({ message: "Fechas inválidas." });
    if (scheduleEnd < scheduleStart)
      return res.status(400).json({ message: "Fecha fin anterior a inicio." });

    const blockingObservations = await fetchBlockingObservationsInRange(
      empleado_id,
      scheduleStart,
      scheduleEnd
    );

    const realBlockers = blockingObservations.filter(
      (obs) => !isPartialObservation(obs)
    );

    if (realBlockers.length) {
      return res.status(409).json({
        message: "Conflicto: Periodo bloqueado por novedades existentes.",
        bloqueos: realBlockers.map(serializeObservationForResponse),
      });
    }

    const partialObservations = blockingObservations.filter(
      isPartialObservation
    );

    const holidaySet = getHolidaySet(fecha_inicio, fecha_fin);
    const cfg = await loadScheduleConfigSafe();

    // Turno base del colaborador (spec 3.1). Sin turno asignado no se puede generar.
    const asignacion = await getJornadaBaseVigente(empleado_id);
    const turno = asignacion?.ph_jornadas || null;
    if (!turno) {
      return res.status(409).json({
        message:
          "El colaborador no tiene un turno base asignado. Asígnale una jornada (07-16 o 09-18) antes de generar el horario.",
      });
    }

    // Días efectivos: los del turno, opcionalmente acotados por working_weekdays.
    let diasEfectivos = Array.isArray(turno.dias_aplica)
      ? turno.dias_aplica
      : [1, 2, 3, 4, 5, 6];
    if (Array.isArray(working_weekdays) && working_weekdays.length) {
      diasEfectivos = diasEfectivos.filter((d) => working_weekdays.includes(d));
    }
    const turnoEff = { ...turno, dias_aplica: diasEfectivos };

    const { schedule: horariosSemanales } = generateScheduleByShift(
      fecha_inicio,
      fecha_fin,
      turnoEff,
      holidaySet,
      holiday_overrides || {},
      sunday_overrides || {},
      partialObservations,
      cfg
    );

    // Los horarios son ACUMULATIVOS: generar una semana nueva NO borra ni oculta
    // las que ya existen. Solo se archivan las semanas que SE SOLAPAN con el
    // rango que se está generando (regenerar = reemplazar ese tramo).
    await archivarHorariosSolapados(empleado_id, fecha_inicio, fecha_fin);

    const creatorValue =
      typeof creado_por === "string" && creado_por.trim().length > 0
        ? creado_por.trim()
        : null;

    const payloadSemanales = horariosSemanales.map((h) => ({
      ...h,
      empleado_id,
      tipo: "semanal",
      estado_visibilidad: "publico",
      creado_por: creatorValue,
    }));
    const { data: dataSemanales, error: errorSemanales } =
      await supabaseAxios.post("/horarios", payloadSemanales, {
        headers: { Prefer: "return=representation" },
      });
    if (errorSemanales) throw errorSemanales;

    // Compensación de estudio (spec 6.2): el día de estudio se paga COMPLETO; la
    // parte que cubre el COLABORADOR sale de sus EXTRAS acumulados (metadato
    // estudio_compensa_banco por día, topeado por parámetro) y el resto lo cubre
    // la EMPRESA (estudio_cubre_empresa). Los "extras acumulados" son un valor
    // DERIVADO de los días registrados (ver computeExtrasQuincena), NO una tabla
    // de saldo: por eso acá no se debita nada, solo se reporta el resumen.
    const sumarMetadatoEstudio = (campo) =>
      toFixedNumber(
        horariosSemanales.reduce(
          (acc, w) =>
            acc + (w.dias || []).reduce((s, d) => s + Number(d[campo] || 0), 0),
          0
        )
      );
    const cubiertoColaborador = sumarMetadatoEstudio("estudio_compensa_banco");
    const cubiertoEmpresa = sumarMetadatoEstudio("estudio_cubre_empresa");
    const estudioCompensacion =
      cubiertoColaborador > 0 || cubiertoEmpresa > 0
        ? {
            cubierto_colaborador: cubiertoColaborador,
            cubierto_empresa: cubiertoEmpresa,
          }
        : null;

    // NO se envía correo al crear. La notificación es EXCLUSIVAMENTE manual:
    // el admin la dispara con el botón "Enviar correo" (POST /horarios/notificar).
    // Así el correo nunca sale hasta que el admin revisa/ajusta el horario.

    // Auditoría: generación de horario (spec 5.2 / 8).
    await writeAuditEvent({
      empleadoId: empleado_id,
      tipoCambio: "creacion_horario",
      valorNuevo: {
        accion: "Horario generado",
        rango: `${fecha_inicio} → ${fecha_fin}`,
        semanas: (dataSemanales || []).length,
      },
      usuario: auditUserFromReq(req),
    });

    res.status(201).json({
      horarios: dataSemanales || [],
      compensacion_estudio: estudioCompensacion,
    });
  } catch (e) {
    console.error("Error detallado en createHorario:", e);
    res.status(500).json({
      message: "Error creating horario",
      error: e.message,
      stack: e.stack,
    });
  }
};

// --- FUNCIÓN updateHorario CORREGIDA ---
export const updateHorario = async (req, res) => {
  const { id } = req.params;
  const { dias } = req.body;
  try {
    // Límites efectivos (panel o fallback legal). Mismo criterio que la generación.
    const cfg = await loadScheduleConfigSafe();

    // 1. Obtener el horario actual
    const {
      data: [current],
      error: fetchError,
    } = await supabaseAxios.get(
      `/horarios?select=id,empleado_id,fecha_inicio,fecha_fin,dias&id=eq.${id}`
    );
    if (fetchError) throw fetchError;
    if (!current) {
      return res.status(404).json({ message: "Horario no encontrado" });
    }
    if (!Array.isArray(dias) || dias.length === 0) {
      return res.status(400).json({
        message: "El payload debe incluir 'dias' como un arreglo válido.",
      });
    }

    // Quién hace el cambio (para auditoría) y turno base (para bloques correctos).
    const usuario = auditUserFromReq(req);
    const asignacion = await getJornadaBaseVigente(current.empleado_id);
    const turno = asignacion?.ph_jornadas || null;

    // 2. Validar fechas y parsear días
    const parsedDays = dias
      .map((day) => ({
        ...day,
        horas: Number(day.horas || 0),
        parsedDate: parseDateOnly(day.fecha),
      }))
      .filter((day) => day.parsedDate);

    if (!parsedDays.length || parsedDays.length !== dias.length) {
      return res.status(400).json({
        message:
          "Todos los días deben incluir una fecha válida en formato YYYY-MM-DD.",
      });
    }

    // 3. Verificar bloqueos
    const minDate = parsedDays.reduce(
      (acc, day) => (day.parsedDate < acc ? day.parsedDate : acc),
      parsedDays[0].parsedDate
    );
    const maxDate = parsedDays.reduce(
      (acc, day) => (day.parsedDate > acc ? day.parsedDate : acc),
      parsedDays[0].parsedDate
    );
    const blockingObservations = await fetchBlockingObservationsInRange(
      current.empleado_id,
      minDate,
      maxDate
    );

    if (blockingObservations.length) {
      // Ignorar bloqueos PARCIALES (estudio con días / permiso por horas):
      // restan horas pero no impiden asignar el resto del día.
      const realBlockers = blockingObservations.filter(
        (obs) => !isPartialObservation(obs)
      );

      const conflicts = [];
      for (const obs of realBlockers) {
        const conflictDays = parsedDays
          .filter(
            (day) =>
              day.horas > 0 &&
              day.parsedDate >= obs.rawStart &&
              day.parsedDate <= obs.rawEnd
          )
          .map((day) => ({
            fecha: day.fecha,
            horas: day.horas,
            descripcion: day.descripcion,
          }));

        if (conflictDays.length) {
          conflicts.push({
            ...serializeObservationForResponse(obs),
            dias_conflictivos: conflictDays,
          });
        }
      }
      if (conflicts.length) {
        const conflictDetails = conflicts
          .map(
            (c) =>
              `<li>${c.tipo} (${format(c.rawStart, "dd/MM")} - ${format(
                c.rawEnd,
                "dd/MM"
              )}) bloquea: ${c.dias_conflictivos
                .map((d) => d.descripcion || d.fecha)
                .join(", ")}</li>`
          )
          .join("");
        return res.status(409).json({
          message:
            "Conflicto: No se pueden asignar horas a días bloqueados por novedades.",
          bloqueos: conflicts,
          htmlMessage: `No se pueden guardar los cambios porque algunos días con horas asignadas ahora están bloqueados:<ul>${conflictDetails}</ul> Ajusta las horas a 0 para esos días.`,
        });
      }
    }

    // 4. Datos previos (para la auditoría: comparar antes → después).
    const previousDays = Array.isArray(current?.dias) ? current.dias : [];
    const previousDayMap = new Map(previousDays.map((day) => [day.fecha, day]));

    // 5. Recalcular horas base, extra y bloques.
    const updatedDiasRecalculated = [];
    let legalSum = 0,
      payableExtraSum = 0,
      totalSum = 0;

    for (const dayDataFromFrontend of parsedDays) {
      const day = { ...dayDataFromFrontend };
      const wd = isoWeekday(day.parsedDate);
      const totalHours = day.horas;

      const regularCap = getRegularDailyCap(wd);
      // Domingo trabajado: no tiene jornada legal (regularCap=0), pero se admite
      // como día completo (mismo techo que L-V: 10 + 4 de máximo diario).
      const overtimeLimit =
        wd === 7 ? 14 : regularCap + MAX_OVERTIME_PER_DAY;

      if (totalHours > overtimeLimit + 1e-6) {
        return res.status(400).json({
          message: `Límite diario (${overtimeLimit}h) excedido en ${day.fecha}`,
        });
      }

      const legalCapForDay = getLegalCapForDay(wd, cfg);
      const payableExtraCap = getPayableExtraCapForDay(wd);

      const base = Math.min(totalHours, legalCapForDay);
      const extra = Math.max(0, totalHours - base);
      // Domingo: todas las horas son extra y 100% pagables (no tiene tope legal).
      const payableExtra =
        wd === 7 ? extra : Math.min(extra, payableExtraCap);

      legalSum = toFixedNumber(legalSum + base);
      payableExtraSum = toFixedNumber(payableExtraSum + payableExtra);
      totalSum = toFixedNumber(totalSum + totalHours);

      day.horas_base = base;
      day.horas_extra = extra;

      if (totalHours > 0 && wd === 7) {
        // Domingo trabajado: bloque continuo desde la entrada del turno; todas
        // las horas quedan como extra (base ya = 0 porque el tope legal es 0).
        const customEntrada = day.entrada_editada ? day.jornada_entrada : null;
        const { bloques, entrada, salida } = buildSundayBlocks(
          day.fecha,
          turno,
          totalHours,
          customEntrada
        );
        day.bloques = bloques;
        day.jornada_entrada = entrada;
        day.jornada_salida = salida;
        day.domingo_estado = null;
        day.domingo_trabajado = true;
      } else if (totalHours > 0) {
        if (turno) {
          // Modelo nuevo: bloques según el turno del colaborador.
          // Si el admin fijó una entrada manual para este día (entrada_editada),
          // se respeta como hora de entrada y el bloque se arma desde ahí.
          const customEntrada = day.entrada_editada
            ? day.jornada_entrada
            : null;
          const { bloques, entrada, salida } = buildEditedDayBlocks(
            day.fecha,
            turno,
            wd,
            totalHours,
            customEntrada
          );
          day.bloques = bloques;
          day.jornada_entrada = entrada;
          day.jornada_salida = salida;
        } else {
          // Fallback (colaborador sin turno base): modelo anterior.
          const dayInfo = getDayInfo(
            wd,
            false,
            null,
            Boolean(day.jornada_reducida),
            day.tipo_jornada_reducida || "salir-temprano"
          );
          const { blocks, entryTime, exitTime } = allocateHoursRandomly(
            day.fecha,
            dayInfo,
            totalHours
          );
          day.bloques = blocks;
          day.jornada_entrada = entryTime;
          day.jornada_salida = exitTime;
        }
      } else {
        day.horas_base = 0;
        day.horas_extra = 0;
        day.bloques = null;
        day.jornada_entrada = null;
        day.jornada_salida = null;
        if (totalHours <= 0) {
          day.horas_reducidas_manualmente = null;
          day.horas_originales = null;
        }
      }

      delete day.parsedDate;
      updatedDiasRecalculated.push(day);
    }

    // 6. Control de extras: la spec (4.2) los controla por QUINCENA con ALERTA
    //    VISUAL (sección 8), no por bloqueo semanal ni banco. Acá solo se aplican
    //    los topes DIARIOS legales (jornada 8h L-V / 4h Sáb + máximo diario),
    //    validados por día en el bucle anterior (getLegalCapForDay / overtimeLimit).

    // 7. Preparar payload final y actualizar horario
    const updatePayload = {
      dias: updatedDiasRecalculated,
      total_horas_semana: totalSum,
      // allow_overtime: allowOvertime, // <-- LÍNEA ELIMINADA
    };
    const { error: updateError } = await supabaseAxios.patch(
      `/horarios?id=eq.${id}`,
      updatePayload
    );
    if (updateError) throw updateError;

    // 8. Auditoría de los cambios + aviso de extras por quincena (spec 5.2 / 4.2)
    const cambiosAuditados = await writeAuditEntries({
      horarioId: id,
      empleadoId: current.empleado_id,
      previousMap: previousDayMap,
      nuevosDias: updatedDiasRecalculated,
      usuario,
    });

    let extras_quincena = [];
    try {
      const q1 = await computeExtrasQuincena(
        current.empleado_id,
        current.fecha_inicio,
        cfg
      );
      if (q1) extras_quincena.push(q1);
      const q2 = await computeExtrasQuincena(
        current.empleado_id,
        current.fecha_fin,
        cfg
      );
      if (q2 && q2.quincena_inicio !== q1?.quincena_inicio)
        extras_quincena.push(q2);
    } catch (_) {
      /* el aviso de quincena no debe tumbar el guardado */
    }

    // 10. Enviar respuesta exitosa
    res.json({
      message: "Horario actualizado con éxito.",
      total_horas: totalSum,
      horas_legales: legalSum,
      horas_extras_pagables: payableExtraSum,
      cambios_auditados: cambiosAuditados,
      extras_quincena,
    });
  } catch (e) {
    console.error("Error updating horarios:", e);
    res.status(500).json({
      message: "Error al actualizar el horario",
      error: e.response?.data?.message || e.message,
      details: e.response?.data || e.stack,
    });
  }
};

// POST /horarios/intercambio  (spec 5.1: intercambio de turnos entre colaboradores)
// Para una fecha, A pasa a trabajar la ventana de B y B la de A (mismas horas,
// distinto horario). Recalcula bloques de ese día en ambos y audita el cambio.
export const intercambiarTurnos = async (req, res) => {
  const { empleado_a, empleado_b, fecha } = req.body;
  if (!empleado_a || !empleado_b || !fecha) {
    return res
      .status(400)
      .json({ message: "empleado_a, empleado_b y fecha son requeridos." });
  }
  if (empleado_a === empleado_b) {
    return res
      .status(400)
      .json({ message: "Los colaboradores deben ser distintos." });
  }
  try {
    const usuario = auditUserFromReq(req);
    const wd = isoWeekday(parseDateOnly(fecha));

    const [asigA, asigB] = await Promise.all([
      getJornadaBaseVigente(empleado_a),
      getJornadaBaseVigente(empleado_b),
    ]);
    const turnoA = asigA?.ph_jornadas || null;
    const turnoB = asigB?.ph_jornadas || null;
    if (!turnoA || !turnoB) {
      return res.status(409).json({
        message: "Ambos colaboradores deben tener un turno base asignado.",
      });
    }

    // Aplica `nuevoTurno` al día `fecha` del horario público del colaborador.
    const aplicarTurnoEnDia = async (empleadoId, nuevoTurno) => {
      const { data } = await supabaseAxios.get(
        `/horarios?select=id,dias&empleado_id=eq.${empleadoId}&estado_visibilidad=eq.publico&fecha_inicio=lte.${fecha}&fecha_fin=gte.${fecha}`
      );
      const horario = data?.[0];
      if (!horario) return { ok: false, motivo: "sin horario en esa fecha" };
      const dias = Array.isArray(horario.dias) ? horario.dias : [];
      const prevMap = new Map(dias.map((d) => [d.fecha, { ...d }]));
      const dia = dias.find((d) => d.fecha === fecha);
      if (!dia) return { ok: false, motivo: "el día no está en el horario" };

      const { bloques, entrada, salida } = buildEditedDayBlocks(
        fecha,
        nuevoTurno,
        wd,
        Number(dia.horas || 0)
      );
      dia.bloques = bloques;
      dia.jornada_entrada = entrada;
      dia.jornada_salida = salida;

      const { error } = await supabaseAxios.patch(
        `/horarios?id=eq.${horario.id}`,
        { dias }
      );
      if (error) throw error;
      await writeAuditEntries({
        horarioId: horario.id,
        empleadoId,
        previousMap: prevMap,
        nuevosDias: [dia],
        usuario,
        tipoCambio: "intercambio_turno",
      });
      return { ok: true };
    };

    const [ra, rb] = await Promise.all([
      aplicarTurnoEnDia(empleado_a, turnoB),
      aplicarTurnoEnDia(empleado_b, turnoA),
    ]);
    if (!ra.ok || !rb.ok) {
      return res.status(409).json({
        message: "No se pudo intercambiar (alguno no tiene horario ese día).",
        detalle: { a: ra, b: rb },
      });
    }
    res.json({ message: `Turnos intercambiados para ${fecha}`, fecha });
  } catch (e) {
    console.error("Error intercambiando turnos:", e);
    res
      .status(500)
      .json({ message: "Error intercambiando turnos", error: e.message });
  }
};

// DELETE /horarios/:id
export const deleteHorario = async (req, res) => {
  const { id } = req.params;
  try {
    // Leemos el horario antes de borrarlo, para dejar constancia en la auditoría.
    const { data: previo } = await supabaseAxios.get(
      `/horarios?select=empleado_id,fecha_inicio,fecha_fin&id=eq.${id}`
    );
    const horarioPrevio = previo?.[0] || null;

    const { error, count } = await supabaseAxios.delete(
      `/horarios?id=eq.${id}`,
      { count: "exact" }
    );
    if (error && error.code !== "PGRST204") throw error;
    if (count === 0) {
      console.warn(`Intento de eliminar horario ${id} no encontrado.`);
      return res
        .status(204)
        .json({ message: "Horario no encontrado o ya eliminado." });
    }

    // Auditoría: eliminación de horario (spec 5.2 / 8).
    if (horarioPrevio) {
      await writeAuditEvent({
        horarioId: id,
        empleadoId: horarioPrevio.empleado_id,
        tipoCambio: "eliminacion_horario",
        valorAnterior: {
          accion: "Horario eliminado",
          rango: `${horarioPrevio.fecha_inicio} → ${horarioPrevio.fecha_fin}`,
        },
        usuario: {
          email: req.body?.usuario_email || null,
          nombre: req.body?.usuario_nombre || req.body?.usuario_email || null,
        },
      });
    }

    res.json({ message: "Horario eliminado correctamente" });
  } catch (e) {
    console.error("Error eliminando horario:", e);
    res.status(500).json({
      message: "Error al eliminar el horario",
      error: e.response?.data?.message || e.message,
    });
  }
};

// PATCH /horarios/archivar
export const archivarHorarios = async (req, res) => {
  const { empleado_id } = req.body;
  if (!empleado_id)
    return res.status(400).json({ message: "ID de empleado requerido." });
  try {
    await supabaseAxios.patch(
      `/horarios?empleado_id=eq.${empleado_id}&estado_visibilidad=eq.publico`,
      { estado_visibilidad: "archivado" }
    );
    res.json({ message: "Horarios archivados." });
  } catch (e) {
    console.error("Error archivando horarios:", e);
    res.status(500).json({ message: "Error al archivar." });
  }
};

// Archiva SOLO los horarios públicos del colaborador cuyo rango se solapa con
// [fechaInicio, fechaFin]. Se usa al generar: regenerar un tramo reemplaza las
// semanas de ESE tramo y deja intactas las demás (semanas acumulativas).
// Solape = existente.fecha_inicio <= nuevo.fecha_fin && existente.fecha_fin >= nuevo.fecha_inicio.
const archivarHorariosSolapados = async (empleadoId, fechaInicio, fechaFin) => {
  try {
    const { count, error } = await supabaseAxios.patch(
      `/horarios?empleado_id=eq.${empleadoId}&estado_visibilidad=eq.publico` +
        `&fecha_inicio=lte.${fechaFin}&fecha_fin=gte.${fechaInicio}`,
      { estado_visibilidad: "archivado" },
      { count: "exact" }
    );
    if (error) throw error;
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `${count || 0} horarios solapados archivados para ${empleadoId} (${fechaInicio} → ${fechaFin}).`
      );
    }
  } catch (e) {
    console.error(`Error archivando solapados para ${empleadoId}:`, e);
    throw e;
  }
};
