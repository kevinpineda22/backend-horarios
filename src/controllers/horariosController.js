import { supabaseAxios } from "../services/supabaseAxios.js";
import {
  generateScheduleForRange56,
  getDailyCapacity,
  isoWeekday,
  WEEKLY_LEGAL_LIMIT,
  WEEKLY_EXTRA_LIMIT,
  WEEKLY_TOTAL_LIMIT,
  getDayInfo,
  allocateHoursRandomly,
} from "../utils/schedule.js";
import { getHolidaySet } from "../utils/holidays.js";
import { format } from "date-fns";
import { sendEmail } from "../services/emailService.js";
import {
  createOrUpdateExcess,
  fetchAllPendingForEmpleado,
  updateEntry as updateHoursBankEntry,
  resetForSemana,
} from "./hoursBankController.js";

const toFixedNumber = (value) => Number(Number(value || 0).toFixed(2));
const OVERTIME_DAILY_CAP = 16; // Salvaguarda para ediciones manuales con horas extra.

const applyBankedHours = (weeks, bankEntries) => {
  if (!Array.isArray(weeks) || weeks.length === 0) {
    return { bankUpdates: [], summaries: [] };
  }

  const weekSummariesMap = new Map();
  const bankUpdates = [];

  const rotateDays = (days, seed) => {
    if (!days.length) return days;
    const hashSeed = seed
      .split("")
      .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 0);
    const startIndex = Math.abs(hashSeed) % days.length;
    return days.slice(startIndex).concat(days.slice(0, startIndex));
  };

  for (const entry of bankEntries) {
    let remaining = Number(
      entry.horas_pendientes ?? entry.horas_excedidas ?? 0
    );
    if (remaining <= 0) continue;

    let consumed = 0;
    let firstAppliedWeek = null;
    let lastAppliedWeek = null;

    for (const week of weeks) {
      if (remaining <= 0) break;

      let weekApplied = false;
      const diasAjustados = [];

      const candidates = rotateDays(
        (week.dias || []).filter(
          (d) => isoWeekday(d.fecha) !== 7 && Number(d.horas || 0) > 0
        ),
        `${entry.id}-${week.fecha_inicio}`
      );

      for (const day of candidates) {
        const wd = isoWeekday(day.fecha);

        const originalExtra = Number(day.horas_extra || 0);
        const originalBase = Number(day.horas_base || 0);
        let extraRemoved = 0;
        let baseRemoved = 0;

        if (remaining > 0 && originalExtra > 0) {
          extraRemoved = Math.min(originalExtra, remaining);
          day.horas_extra = Math.max(
            0,
            toFixedNumber(originalExtra - extraRemoved)
          );
          day.horas = Math.max(
            0,
            toFixedNumber(Number(day.horas || 0) - extraRemoved)
          );
          remaining = toFixedNumber(remaining - extraRemoved);
          consumed = toFixedNumber(consumed + extraRemoved);
        }

        if (remaining > 0) {
          const updatedBase = Number(day.horas_base || 0);
          if (updatedBase > 0) {
            baseRemoved = Math.min(updatedBase, remaining);
            day.horas_base = Math.max(
              0,
              toFixedNumber(updatedBase - baseRemoved)
            );
            day.horas = Math.max(
              0,
              toFixedNumber(Number(day.horas || 0) - baseRemoved)
            );
            remaining = toFixedNumber(remaining - baseRemoved);
            consumed = toFixedNumber(consumed + baseRemoved);
          }
        }

        if (extraRemoved > 0 || baseRemoved > 0) {
          weekApplied = true;
          day.horas_extra_reducidas = toFixedNumber(
            Number(day.horas_extra_reducidas || 0) + extraRemoved
          );
          day.horas_legales_reducidas = toFixedNumber(
            Number(day.horas_legales_reducidas || 0) + baseRemoved
          );
          day.banco_compensacion_id = entry.id;
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
            Number(day.horas || 0)
          );
          day.bloques = blocks;
          day.jornada_entrada = entryTime;
          day.jornada_salida = exitTime;

          diasAjustados.push({
            fecha: day.fecha,
            banco_id: entry.id,
            horas_extra_reducidas: toFixedNumber(extraRemoved),
            horas_legales_reducidas: toFixedNumber(baseRemoved),
          });
        }

        if (remaining <= 0) break;
      }

      // Si aún quedan horas y no hubo candidatos, intentar con el resto
      if (remaining > 0) {
        for (const day of week.dias || []) {
          if (remaining <= 0) break;
          if (isoWeekday(day.fecha) === 7 || Number(day.horas || 0) <= 0) {
            continue;
          }
          if (candidates.includes(day)) continue;

          const wd = isoWeekday(day.fecha);
          const originalExtra = Number(day.horas_extra || 0);
          const originalBase = Number(day.horas_base || 0);
          let extraRemoved = 0;
          let baseRemoved = 0;

          if (remaining > 0 && originalExtra > 0) {
            extraRemoved = Math.min(originalExtra, remaining);
            day.horas_extra = Math.max(
              0,
              toFixedNumber(originalExtra - extraRemoved)
            );
            day.horas = Math.max(
              0,
              toFixedNumber(Number(day.horas || 0) - extraRemoved)
            );
            remaining = toFixedNumber(remaining - extraRemoved);
            consumed = toFixedNumber(consumed + extraRemoved);
          }

          if (remaining > 0) {
            const updatedBase = Number(day.horas_base || 0);
            if (updatedBase > 0) {
              baseRemoved = Math.min(updatedBase, remaining);
              day.horas_base = Math.max(
                0,
                toFixedNumber(updatedBase - baseRemoved)
              );
              day.horas = Math.max(
                0,
                toFixedNumber(Number(day.horas || 0) - baseRemoved)
              );
              remaining = toFixedNumber(remaining - baseRemoved);
              consumed = toFixedNumber(consumed + baseRemoved);
            }
          }

          if (extraRemoved > 0 || baseRemoved > 0) {
            weekApplied = true;
            day.horas_extra_reducidas = toFixedNumber(
              Number(day.horas_extra_reducidas || 0) + extraRemoved
            );
            day.horas_legales_reducidas = toFixedNumber(
              Number(day.horas_legales_reducidas || 0) + baseRemoved
            );
            day.banco_compensacion_id = entry.id;

            const { blocks, entryTime, exitTime } = allocateHoursRandomly(
              day.fecha,
              getDayInfo(
                wd,
                false,
                null,
                Boolean(day.jornada_reducida),
                day.tipo_jornada_reducida || "salir-temprano"
              ),
              Number(day.horas || 0)
            );
            day.bloques = blocks;
            day.jornada_entrada = entryTime;
            day.jornada_salida = exitTime;

            diasAjustados.push({
              fecha: day.fecha,
              banco_id: entry.id,
              horas_extra_reducidas: toFixedNumber(extraRemoved),
              horas_legales_reducidas: toFixedNumber(baseRemoved),
            });
          }
        }
      }

      if (weekApplied) {
        week.total_horas_semana = toFixedNumber(
          (week.dias || []).reduce((sum, d) => sum + Number(d.horas || 0), 0)
        );

        firstAppliedWeek = firstAppliedWeek || week.fecha_inicio;
        lastAppliedWeek = week.fecha_fin;

        const summaryKey = `${week.fecha_inicio}`;
        if (!weekSummariesMap.has(summaryKey)) {
          weekSummariesMap.set(summaryKey, {
            semana_inicio: week.fecha_inicio,
            semana_fin: week.fecha_fin,
            dias: [],
          });
        }
        const summary = weekSummariesMap.get(summaryKey);
        summary.dias.push(...diasAjustados);
      }
    }

    if (consumed > 0) {
      bankUpdates.push({
        id: entry.id,
        horas_consumidas: toFixedNumber(consumed),
        horas_pendientes: Math.max(0, toFixedNumber(remaining)),
        estado: remaining > 0 ? "parcial" : "aplicado",
        semana_aplicada_inicio: firstAppliedWeek,
        semana_aplicada_fin: lastAppliedWeek,
      });
    }
  }

  return {
    bankUpdates,
    summaries: Array.from(weekSummariesMap.values()),
  };
};

export const getHorariosByEmpleadoId = async (req, res) => {
  const { empleado_id } = req.params;
  const { incluir_archivados = "false" } = req.query;
  try {
    let url = `/horarios?select=*&empleado_id=eq.${empleado_id}`; // Si no se solicitan los archivados, solo mostrar públicos

    if (incluir_archivados === "false") {
      url += `&estado_visibilidad=eq.publico`;
    }

    url += `&order=fecha_inicio.desc`;

    const { data } = await supabaseAxios.get(url);
    res.json(data);
  } catch (e) {
    console.error("Error completo:", e);
    res.status(500).json({ message: "Error fetching horarios" });
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
      apply_banked_hours = false,
      bank_entry_ids = [],
    } = req.body;

    if (!Array.isArray(working_weekdays) || working_weekdays.length === 0) {
      return res
        .status(400)
        .json({ message: "working_weekdays es requerido." });
    }

    const holidaySet = getHolidaySet(fecha_inicio, fecha_fin);

    const { schedule: horariosSemanales } = generateScheduleForRange56(
      fecha_inicio,
      fecha_fin,
      working_weekdays,
      holidaySet,
      holiday_overrides || {},
      sunday_overrides || {}
    );
    let bankUpdates = [];
    let compensationSummaries = [];

    if (apply_banked_hours) {
      const pendientes = await fetchAllPendingForEmpleado(empleado_id);
      const baseSelection = bank_entry_ids.length
        ? pendientes.filter((p) => bank_entry_ids.includes(p.id))
        : pendientes;

      const { bankUpdates: updates, summaries } = applyBankedHours(
        horariosSemanales,
        baseSelection
      );
      bankUpdates = updates;
      compensationSummaries = summaries;
    }

    await archivarHorariosPorEmpleado(empleado_id);

    const payloadSemanales = horariosSemanales.map((horario) => ({
      empleado_id,
      tipo: "semanal",
      dias: horario.dias,
      fecha_inicio: horario.fecha_inicio,
      fecha_fin: horario.fecha_fin,
      total_horas_semana: horario.total_horas_semana,
      estado_visibilidad: "publico",
    }));

    const { data: dataSemanales, error: errorSemanales } =
      await supabaseAxios.post("/horarios", payloadSemanales);
    if (errorSemanales) throw errorSemanales;

    for (const update of bankUpdates) {
      await updateHoursBankEntry(update.id, {
        horas_pendientes: update.horas_pendientes,
        estado: update.estado,
        semana_aplicada_inicio: update.semana_aplicada_inicio,
        semana_aplicada_fin: update.semana_aplicada_fin,
      });
    }

    // Intentar enviar el correo electrónico
    let emailStatus = {
      sent: false,
      error: null,
      empleado: null,
    };

    try {
      const {
        data: [empleado],
        error: empleadoError,
      } = await supabaseAxios.get(
        `/empleados?select=nombre_completo,correo_electronico&id=eq.${empleado_id}`
      );

      if (empleadoError || !empleado) {
        emailStatus.error = "No se pudo obtener los datos del empleado";
        console.error("Error obteniendo empleado:", empleadoError);
      } else if (!empleado.correo_electronico) {
        emailStatus.error =
          "El empleado no tiene correo electrónico registrado";
        emailStatus.empleado = empleado.nombre_completo;
        console.error(
          "El empleado no tiene email registrado:",
          empleado.nombre_completo
        );
      } else {
        const subject = `🗓️ Horario asignado: ${fecha_inicio} al ${fecha_fin}`;
        const publicUrl = "https://merkahorro.com/consulta-horarios";
        const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Horario Asignado</title>
</head>
<body style="font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e0e0e0;">
        <div style="background-color: #210d65; color: #ffffff; text-align: center; padding: 25px;">
            <h1 style="margin: 0; font-size: 24px;">📅 Horario Asignado</h1>
            <p style="margin: 10px 0 0 0; font-size: 16px;">Sistema de Gestión de Horarios</p>
        </div>
        
        <div style="padding: 30px;">
            <p style="font-size: 18px; color: #210d65; margin: 0 0 20px 0;">
                Hola <strong>${empleado.nombre_completo}</strong>,
            </p>
            
            <p style="color: #333333; font-size: 16px; margin: 0 0 20px 0; line-height: 1.5;">
                Te informamos que tu nuevo horario laboral ha sido generado y asignado exitosamente.
            </p>
            
            <div style="background-color: #f8f9ff; border-left: 3px solid #210d65; padding: 15px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0; color: #333333; font-size: 16px;">
                    <strong>Período asignado:</strong>
                </p>
                <p style="font-size: 18px; color: #210d65; text-align: center; margin: 0; font-weight: bold;">
                    ${fecha_inicio} al ${fecha_fin}
                </p>
            </div>
            
            <hr style="border: none; height: 1px; background-color: #e0e0e0; margin: 25px 0;">
            
            <p style="color: #333333; font-size: 16px; text-align: center; margin: 0 0 25px 0; line-height: 1.5;">
                Puedes consultar los detalles completos de tu horario haciendo clic en el siguiente enlace:
            </p>
            
            <div style="text-align: center;">
                <a href="${publicUrl}" style="background-color: #210d65; color: #ffffff; text-decoration: none; padding: 12px 30px; font-size: 16px; font-weight: bold;">
                    Ver Mi Horario
                </a>
            </div>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
            <p style="margin: 0; color: #666666; font-size: 14px;">Este es un mensaje automatizado del sistema de horarios.</p>
            <p style="margin: 5px 0 0 0; font-size: 12px; color: #666666;">
                Si tienes alguna consulta, contacta a tu supervisor directo.
            </p>
        </div>
    </div>
</body>
</html>
              `;

        await sendEmail(empleado.correo_electronico, subject, htmlContent);
        emailStatus.sent = true;
        emailStatus.empleado = empleado.nombre_completo;
        console.log(
          `Correo enviado exitosamente a: ${empleado.correo_electronico}`
        );
      }
    } catch (emailError) {
      emailStatus.error = `Error al enviar correo: ${emailError.message}`;
      console.error("Error enviando email:", emailError);
    } // Respuesta incluyendo el estado del email

    res.status(201).json({
      ...dataSemanales,
      email_notification: emailStatus,
      horas_compensadas: compensationSummaries,
    });
  } catch (e) {
    console.error("Error detallado en createHorario:", e);
    res.status(500).json({
      message: "Error creating horario",
      error: e.message,
      stack: process.env.NODE_ENV === "development" ? e.stack : undefined,
    });
  }
};

export const updateHorario = async (req, res) => {
  const { id } = req.params;
  const { dias } = req.body;
  try {
    const {
      data: [current],
    } = await supabaseAxios.get(`/horarios?select=*&id=eq.${id}`);
    if (!current) {
      return res.status(404).json({ message: "Horario no encontrado" });
    }
    if (!Array.isArray(dias) || dias.length === 0) {
      return res
        .status(400)
        .json({ message: "El payload debe incluir 'dias' como arreglo." });
    }

    const updatedDias = JSON.parse(JSON.stringify(dias));
    const allowOvertime = Boolean(req.body.allow_overtime);
    let legalSum = 0;
    let extraSum = 0;
    let totalSum = 0;

    for (let i = 0; i < updatedDias.length; i++) {
      const d = updatedDias[i];
      const wd = isoWeekday(new Date(d.fecha));
      const totalHours = Number(d.horas || 0);
      const isReduced = Boolean(d.jornada_reducida);
      const tipoJornadaReducida = d.tipo_jornada_reducida || "salir-temprano";

      const dailyCap = getDailyCapacity(wd, false, null);
      const effectiveCap = allowOvertime ? OVERTIME_DAILY_CAP : dailyCap;
      if (totalHours > effectiveCap + 1e-6) {
        const capMsg = allowOvertime
          ? `Capacidad manual excedida (${effectiveCap}h)`
          : `Capacidad excedida (${dailyCap}h)`;
        return res.status(400).json({ message: `${capMsg} en ${d.fecha}` });
      }

      let base, extra;
      if (wd === 7) {
        base = 0;
        extra = 0;
      } else if (wd === 6) {
        base = Math.min(4, totalHours);
        extra = Math.max(0, totalHours - base);
      } else {
        base = Math.min(totalHours, 8);
        extra = Math.max(0, totalHours - base);
      }

      d.horas_base = base;
      d.horas_extra = extra;

      if (totalHours > 0 && wd !== 7) {
        // Pasar el parámetro tipoJornadaReducida a getDayInfo
        const dayInfo = getDayInfo(
          wd,
          false,
          null,
          isReduced,
          tipoJornadaReducida
        );
        const { blocks, entryTime, exitTime } = allocateHoursRandomly(
          d.fecha,
          dayInfo,
          totalHours
        );
        d.bloques = blocks;
        d.jornada_entrada = entryTime;
        d.jornada_salida = exitTime;
      } else {
        d.bloques = null;
        d.jornada_entrada = null;
        d.jornada_salida = null;
      }

      legalSum += base;
      extraSum += extra;
      totalSum += totalHours;
    }

    const updatePayload = {
      dias: updatedDias,
      total_horas_semana: totalSum,
    };

    await supabaseAxios.patch(`/horarios?id=eq.${id}`, updatePayload);

    const exceso = Number((totalSum - WEEKLY_TOTAL_LIMIT).toFixed(2));
    if (exceso > 0) {
      await createOrUpdateExcess({
        empleadoId: current.empleado_id,
        semanaInicio: current.fecha_inicio,
        semanaFin: current.fecha_fin,
        horasExcedidas: exceso,
      });
    } else {
      await resetForSemana({
        empleadoId: current.empleado_id,
        semanaInicio: current.fecha_inicio,
        semanaFin: current.fecha_fin,
      });
    }

    res.json({
      message: "Updated",
      total_horas: toFixedNumber(totalSum),
      horas_legales: toFixedNumber(legalSum),
      horas_extras: toFixedNumber(extraSum),
      horas_excedentes_registradas: exceso > 0 ? exceso : 0,
    });
  } catch (e) {
    console.error("Error updating horarios:", e);
    res.status(500).json({ message: "Error updating" });
  }
};

export const deleteHorario = async (req, res) => {
  const { id } = req.params;
  try {
    await supabaseAxios.delete(`/horarios?id=eq.${id}`);
    res.json({ message: "Deleted" });
  } catch (e) {
    console.error("Error eliminando horario:", e);
    res.status(500).json({ message: "Error deleting horario" });
  }
};

export const archivarHorarios = async (req, res) => {
  const { empleado_id } = req.body;
  if (!empleado_id) {
    return res
      .status(400)
      .json({ message: "El ID del empleado es requerido." });
  }
  try {
    // Cambiar estado a "archivado" en lugar de eliminar
    await supabaseAxios.patch(
      `/horarios?empleado_id=eq.${empleado_id}&estado_visibilidad=eq.publico`,
      {
        estado_visibilidad: "archivado",
      }
    );
    res.json({ message: "Horarios del empleado archivados con éxito." });
  } catch (e) {
    console.error("Error archivando horarios:", e);
    res.status(500).json({ message: "Error al archivar los horarios." });
  }
};

const archivarHorariosPorEmpleado = async (empleadoId) => {
  try {
    // Verificar si hay horarios públicos para archivar
    const { data: horariosPublicos } = await supabaseAxios.get(
      `/horarios?select=id&empleado_id=eq.${empleadoId}&estado_visibilidad=eq.publico`
    );

    if (horariosPublicos && horariosPublicos.length > 0) {
      // Cambiar estado a "archivado" manteniendo los registros
      await supabaseAxios.patch(
        `/horarios?empleado_id=eq.${empleadoId}&estado_visibilidad=eq.publico`,
        { estado_visibilidad: "archivado" }
      );
      console.log(
        `${horariosPublicos.length} horarios archivados para el empleado ${empleadoId}.`
      );
    } else {
      console.log(
        `No se encontraron horarios públicos para el empleado ${empleadoId}. No se archivó nada.`
      );
    }
  } catch (e) {
    console.error(
      `Error archivando horarios para el empleado ${empleadoId}:`,
      e
    );
    throw e;
  }
};
