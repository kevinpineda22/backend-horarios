import { describe, it, expect } from "vitest";
import { generateScheduleByShift } from "../utils/schedule.js";

// ─────────────────────────────────────────────────────────────────────────────
// Smoke test del motor de horarios — Permiso por horas (#2).
//
// A diferencia del estudio (que paga el día completo y compensa con el banco),
// el permiso por horas es una AUSENCIA PARCIAL: se restan SOLO las horas
// marcadas por el admin y esas horas NO se pagan. El día paga menos.
//
// El permiso viaja en details.horas_permiso = [{ fecha, inicio, fin }].
//
// El cálculo de semana asume servidor en UTC (igual que Vercel). Correr con:
//   TZ=UTC npx vitest run src/tests/schedule.permiso.test.js
// ─────────────────────────────────────────────────────────────────────────────

// Turno base 07:00–16:00 (L-V 8h netas con 1h de descanso) / Sábado 07:00–11:00 (4h).
const TURNO = {
  hora_entrada: "07:00:00",
  hora_salida: "16:00:00",
  sabado_entrada: "07:00:00",
  sabado_salida: "11:00:00",
  dias_aplica: [1, 2, 3, 4, 5, 6],
};

// Semana ISO de referencia: lunes 2024-01-08 … sábado 2024-01-13.
const LUNES = "2024-01-08";
const SABADO = "2024-01-13";

const generarDia = (fecha, partialObservations = []) => {
  const { schedule } = generateScheduleByShift(
    LUNES,
    SABADO,
    TURNO,
    new Map(), // holidaySet vacío
    {}, // holidayOverrides
    {}, // sundayOverrides
    partialObservations,
    null // cfg null => topes legales por defecto
  );
  return schedule.flatMap((w) => w.dias).find((d) => d.fecha === fecha);
};

describe("Permiso por horas (#2) — ausencia parcial sin compensación", () => {
  it("permiso de 2h en un día de 8h: el día queda en 6h", () => {
    // Permiso 10:00–12:00 (cae dentro de la presencia, no en descansos).
    const obs = [
      {
        tipo: "Permisos",
        start: LUNES,
        end: LUNES,
        details: {
          horas_permiso: [{ fecha: LUNES, inicio: "10:00", fin: "12:00" }],
        },
      },
    ];
    const dia = generarDia(LUNES, obs);

    expect(dia).toBeDefined();
    expect(dia.horas_permiso).toBe(2); // 2h restadas del turno
    expect(dia.horas).toBe(6); // 8h - 2h
    expect(dia.horas_base).toBe(6);
    expect(dia.horas_extra).toBe(0);
    // No hay metadatos de compensación de estudio.
    expect(dia.horas_estudio).toBeUndefined();
    expect(dia.estudio_compensa_banco).toBeUndefined();
  });

  it("permiso del día completo (07:00–16:00): el día queda en 0h", () => {
    const obs = [
      {
        tipo: "Permisos",
        start: LUNES,
        end: LUNES,
        details: {
          horas_permiso: [{ fecha: LUNES, inicio: "07:00", fin: "16:00" }],
        },
      },
    ];
    const dia = generarDia(LUNES, obs);

    expect(dia).toBeDefined();
    expect(dia.horas).toBe(0);
    expect(dia.horas_base).toBe(0);
    expect(dia.horas_permiso).toBe(8); // se descontó toda la jornada neta
  });

  it("la semana suma 42h cuando hay un permiso de 2h (44 - 2)", () => {
    const obs = [
      {
        tipo: "Permisos",
        start: LUNES,
        end: LUNES,
        details: {
          horas_permiso: [{ fecha: LUNES, inicio: "10:00", fin: "12:00" }],
        },
      },
    ];
    const { schedule } = generateScheduleByShift(
      LUNES,
      SABADO,
      TURNO,
      new Map(),
      {},
      {},
      obs,
      null
    );
    expect(schedule[0].total_horas_semana).toBe(42);
  });

  it("regresión — sin permiso: jornada normal sin metadatos de permiso", () => {
    const lunes = generarDia(LUNES);
    expect(lunes.horas).toBe(8);
    expect(lunes.horas_permiso).toBeUndefined();

    const sabado = generarDia(SABADO);
    expect(sabado.horas).toBe(4);
    expect(sabado.horas_permiso).toBeUndefined();
  });
});
