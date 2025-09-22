import { supabaseAxios } from "../services/supabaseAxios.js";
import {
  generateScheduleForRange56,
  getDailyCapacity,
  isoWeekday,
  WEEKLY_LEGAL_LIMIT,
  WEEKLY_EXTRA_LIMIT,
  getDayInfo,
  allocateHoursRandomly,
} from "../utils/schedule.js";
import { getHolidaySet } from "../utils/holidays.js";
import { format } from "date-fns";
import { sendEmail } from "../services/emailService.js";

export const getHorariosByEmpleadoId = async (req, res) => {
  const { empleado_id } = req.params;
  try {
    const url = `/horarios?select=*&empleado_id=eq.${empleado_id}&order=fecha_inicio.desc`;
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
    } = req.body;
    const lider_id = req.user.id;

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

    await archivarHorariosPorEmpleado(empleado_id);

    const payloadSemanales = horariosSemanales.map((horario) => ({
      empleado_id,
      lider_id,
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
    }

    // Respuesta incluyendo el estado del email
    res.status(201).json({
      ...dataSemanales,
      email_notification: emailStatus,
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
    let legalSum = 0;
    let extraSum = 0;
    let totalSum = 0;

    for (let i = 0; i < updatedDias.length; i++) {
      const d = updatedDias[i];
      const wd = isoWeekday(new Date(d.fecha));
      const totalHours = Number(d.horas || 0);
      const isReduced = Boolean(d.jornada_reducida);
      const tipoJornadaReducida = d.tipo_jornada_reducida || 'salir-temprano';

      const dailyCap = getDailyCapacity(wd, false, null);
      if (totalHours > dailyCap + 1e-6) {
        return res
          .status(400)
          .json({ message: `Capacidad excedida (${dailyCap}h) en ${d.fecha}` });
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
        const dayInfo = getDayInfo(wd, false, null, isReduced, tipoJornadaReducida);
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

    if (legalSum > WEEKLY_LEGAL_LIMIT + 1e-6) {
      return res.status(400).json({
        message: `Excede ${WEEKLY_LEGAL_LIMIT}h legales semanales (${legalSum.toFixed(
          2
        )}h).`,
      });
    }
    if (extraSum > WEEKLY_EXTRA_LIMIT + 1e-6) {
      return res.status(400).json({
        message: `Excede ${WEEKLY_EXTRA_LIMIT}h extras semanales (${extraSum.toFixed(
          2
        )}h).`,
      });
    }

    const updatePayload = {
      dias: updatedDias,
      total_horas_semana: totalSum,
    };

    await supabaseAxios.patch(`/horarios?id=eq.${id}`, updatePayload);
    res.json({ message: "Updated" });
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
    await supabaseAxios.patch(`/horarios?empleado_id=eq.${empleado_id}`, {
      estado_visibilidad: "archivado",
    });
    res.json({ message: "Horarios del empleado archivados con éxito." });
  } catch (e) {
    console.error("Error archivando horarios:", e);
    res.status(500).json({ message: "Error al archivar los horarios." });
  }
};

const archivarHorariosPorEmpleado = async (empleadoId) => {
  try {
    const { data: horariosPublicos } = await supabaseAxios.get(
      `/horarios?select=id&empleado_id=eq.${empleadoId}&estado_visibilidad=eq.publico`
    );
    if (horariosPublicos && horariosPublicos.length > 0) {
      await supabaseAxios.patch(
        `/horarios?empleado_id=eq.${empleadoId}&estado_visibilidad=eq.publico`,
        { estado_visibilidad: "archivado" }
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
