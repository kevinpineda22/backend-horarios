// src/hooks/useScheduleAndBlockingData.js
import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "react-toastify";
import { format, parseISO, addDays } from "date-fns";
import { api } from "../../../services/apiHorarios"; // Ajusta la ruta a tu servicio API
import {
  normalizeBlockingList,
  formatBlockingLabel,
} from "../utils/programadorHorariosUtils"; // Ajusta la ruta a tu archivo utils

export function useScheduleAndBlockingData(employeeId) {
  const [horariosHistory, setHorariosHistory] = useState([]);
  const [blockingObservations, setBlockingObservations] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingBlockings, setLoadingBlockings] = useState(false);

  // Función para cargar el historial de horarios
  const fetchHistory = useCallback(async () => {
    if (!employeeId) {
      setHorariosHistory([]);
      return;
    }
    setLoadingHistory(true);
    try {
      // Llama a la API para obtener horarios (solo públicos/activos)
      const { data } = await api.get(`/horarios/${employeeId}`);
      setHorariosHistory(data || []);
    } catch (err) {
      console.error("Error fetching schedule history:", err);
      toast.error(
        "Error al cargar historial: " +
          (err.response?.data?.message || err.message)
      );
      setHorariosHistory([]); // Limpiar en caso de error
    } finally {
      setLoadingHistory(false);
    }
  }, [employeeId]);

  // Función para cargar las observaciones (bloqueos)
  const fetchObservaciones = useCallback(async () => {
    if (!employeeId) {
      setBlockingObservations([]);
      return;
    }
    setLoadingBlockings(true);
    try {
      // Llama a la API para obtener *todas* las observaciones del empleado
      const { data } = await api.get(`/observaciones/${employeeId}`);
      // Normaliza la data para obtener solo las que bloquean y con fechas válidas
      const normalized = normalizeBlockingList(data || []);
      setBlockingObservations(normalized);
    } catch (err) {
      console.error("Error fetching blocking observations:", err);
      toast.error(
        "Error al cargar bloqueos: " +
          (err.response?.data?.message || err.message)
      );
      setBlockingObservations([]); // Limpiar en caso de error
    } finally {
      setLoadingBlockings(false);
    }
  }, [employeeId]);

  // Efecto que se dispara cuando el employeeId cambia
  useEffect(() => {
    if (employeeId) {
      // Cargar ambos datos concurrentemente
      fetchHistory();
      fetchObservaciones();
    } else {
      // Limpiar si no hay empleado seleccionado
      setHorariosHistory([]);
      setBlockingObservations([]);
    }
  }, [employeeId, fetchHistory, fetchObservaciones]);

  // Función para refrescar manualmente todos los datos
  const refreshAllData = useCallback(async () => {
    if (employeeId) {
      await Promise.all([fetchHistory(), fetchObservaciones()]);
      toast.info("Datos de horario y bloqueos actualizados.");
    }
  }, [employeeId, fetchHistory, fetchObservaciones]);

  // Memoiza un mapa de fechas bloqueadas para búsquedas rápidas (O(1))
  // Clave: 'YYYY-MM-DD', Valor: [Array de objetos de bloqueo]
  const blockingDatesMap = useMemo(() => {
    const map = new Map();
    blockingObservations.forEach((block) => {
      // Lógica especial para Estudio con días específicos
      if (
        block.tipo === "Estudio" &&
        block.details &&
        block.details.dias_estudio &&
        Array.isArray(block.details.dias_estudio) &&
        block.details.dias_estudio.length > 0
      ) {
        // Solo bloquear los días específicos listados
        block.details.dias_estudio.forEach((diaConfig) => {
          // Soporte para nuevo formato (fecha) y viejo formato (dia de semana)
          if (diaConfig.fecha) {
            const ymd = diaConfig.fecha;
            if (!map.has(ymd)) {
              map.set(ymd, []);
            }
            map.get(ymd).push({
              ...block,
              range: `${diaConfig.inicio} - ${diaConfig.fin}`, // Mostrar horario específico
            });
          } else if (diaConfig.dia) {
            // Si es formato antiguo (día de semana), iteramos el rango
            let currentDate = new Date(block.start);
            const endDate = new Date(block.end);
            while (currentDate <= endDate) {
              const currentWd = currentDate.getDay() || 7; // 1=Lunes, 7=Domingo
              if (currentWd === diaConfig.dia) {
                const ymd = format(currentDate, "yyyy-MM-dd");
                if (!map.has(ymd)) {
                  map.set(ymd, []);
                }
                map.get(ymd).push({
                  ...block,
                  range: `${diaConfig.inicio} - ${diaConfig.fin}`,
                });
              }
              currentDate = addDays(currentDate, 1);
            }
          }
        });
        return; // Salir, ya procesamos este bloque especial
      }

      // Lógica estándar para otros bloqueos (rango completo)
      let currentDate = new Date(block.start); // 'start' ya es un objeto Date por normalizeBlockingList
      const endDate = new Date(block.end); // 'end' ya es un objeto Date

      while (currentDate <= endDate) {
        const ymd = format(currentDate, "yyyy-MM-dd"); // Formato '2025-10-17'
        if (!map.has(ymd)) {
          map.set(ymd, []);
        }
        // Añade la info del bloqueo a ese día
        map.get(ymd).push({
          id: block.id,
          tipo: block.tipo,
          observacion: block.observacion,
          range: formatBlockingLabel(block), // Helper para 'dd/MM/yyyy al dd/MM/yyyy'
          start: block.start,
          end: block.end,
        });
        currentDate = addDays(currentDate, 1); // Avanza al siguiente día
      }
    });
    return map;
  }, [blockingObservations]);

  // Memoiza un array de objetos Date para el DayPicker
  const disabledDaysForPicker = useMemo(() => {
    const dates = [];
    blockingObservations.forEach((block) => {
      // Si es tipo Estudio, NO bloqueamos la selección en el picker
      if (block.tipo === "Estudio") return;

      let currentDate = new Date(block.start);
      const endDate = new Date(block.end);
      while (currentDate <= endDate) {
        dates.push(new Date(currentDate)); // DayPicker necesita objetos Date
        currentDate = addDays(currentDate, 1);
      }
    });
    return dates;
  }, [blockingObservations]);

  return {
    // Estado
    horariosHistory,
    blockingObservations, // Lista normalizada
    loading: loadingHistory || loadingBlockings, // Estado de carga combinado

    // Datos procesados
    blockingDatesMap, // Mapa para búsquedas rápidas
    disabledDaysForPicker, // Array de Dates para DayPicker

    // Acciones
    refreshScheduleData: fetchHistory, // Refrescar solo horarios
    refreshBlockingData: fetchObservaciones, // Refrescar solo bloqueos
    refreshAllData, // Refrescar ambos
  };
}
