import { describe, it, expect } from "vitest";
import { generateScheduleByShift } from "../utils/schedule.js";

// ─────────────────────────────────────────────────────────────────────────────
// Smoke test del motor de horarios — compensación de estudio (spec 6.2).
//
// Red de seguridad ANTES de reconciliar el banco de horas al modelo de
// "extras reales acumulados". Fija el comportamiento esperado de los Casos 1 y 2
// de la Especificación Técnica para que cualquier cambio futuro que lo rompa
// salte acá.
//
// El cálculo de semana asume servidor en UTC (igual que Vercel). Correr con:
//   TZ=UTC npx vitest run src/tests/schedule.estudio.test.js
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

// Genera la semana y devuelve el día pedido (busca en todas las semanas).
const generarDia = (fecha, partialObservations = []) => {
  const { schedule } = generateScheduleByShift(
    LUNES,
    SABADO,
    TURNO,
    new Map(), // holidaySet vacío
    {}, // holidayOverrides
    {}, // sundayOverrides
    partialObservations,
    null // cfg null => tope colaborador por defecto = 4 (spec)
  );
  return schedule.flatMap((w) => w.dias).find((d) => d.fecha === fecha);
};

describe("Compensación de estudio (spec 6.2)", () => {
  it("Caso 1 — estudio sábado completo (4h): lo cubre todo el colaborador", () => {
    // Luisa Córdoba: sábado de 4h, estudio toda la jornada (07:00–11:00).
    const obs = [
      {
        start: SABADO,
        end: SABADO,
        details: { dias_estudio: [{ fecha: SABADO, inicio: "07:00", fin: "11:00" }] },
      },
    ];
    const dia = generarDia(SABADO, obs);

    expect(dia).toBeDefined();
    expect(dia.horas_estudio).toBe(4); // 4h de estudio dentro de la jornada
    expect(dia.estudio_compensa_banco).toBe(4); // colaborador cubre min(4, tope 4) = 4
    expect(dia.estudio_cubre_empresa).toBe(0); // empresa no cubre nada
    expect(dia.horas).toBe(4); // el día se paga COMPLETO (cubierto)
  });

  it("Caso 2 — estudio día laboral completo (8h): 4h colaborador / 4h empresa", () => {
    // David Ávalo: lunes de 8h netas, estudio toda la jornada (07:00–16:00).
    const obs = [
      {
        start: LUNES,
        end: LUNES,
        details: { dias_estudio: [{ fecha: LUNES, inicio: "07:00", fin: "16:00" }] },
      },
    ];
    const dia = generarDia(LUNES, obs);

    expect(dia).toBeDefined();
    expect(dia.horas_estudio).toBe(8); // 8h de estudio dentro de la jornada
    expect(dia.estudio_compensa_banco).toBe(4); // colaborador cubre min(8, tope 4) = 4
    expect(dia.estudio_cubre_empresa).toBe(4); // empresa cubre el resto = 4
    expect(dia.horas).toBe(8); // el día se paga COMPLETO (cubierto)
  });

  it("Regresión — sin estudio: jornada normal sin metadatos de compensación", () => {
    const lunes = generarDia(LUNES);
    expect(lunes.horas).toBe(8); // L-V: 8h netas
    expect(lunes.horas_estudio).toBeUndefined();
    expect(lunes.estudio_compensa_banco).toBeUndefined();
    expect(lunes.estudio_cubre_empresa).toBeUndefined();

    const sabado = generarDia(SABADO);
    expect(sabado.horas).toBe(4); // Sábado: 4h derivadas del turno
    expect(sabado.horas_estudio).toBeUndefined();
  });

  it("Regresión — la semana completa suma 44h (8h L-V + 4h Sáb)", () => {
    const { schedule } = generateScheduleByShift(
      LUNES,
      SABADO,
      TURNO,
      new Map(),
      {},
      {},
      [],
      null
    );
    const totalSemana = schedule[0].total_horas_semana;
    expect(totalSemana).toBe(44);
  });
});

describe("Estudio de día completo — modos libre / redistribuir", () => {
  const VIERNES = "2024-01-12";

  const generarSemana = (obs) =>
    generateScheduleByShift(LUNES, SABADO, TURNO, new Map(), {}, {}, obs, null)
      .schedule;

  it("modo 'libre': el día no se trabaja (0h) y no se recupera", () => {
    const obs = [
      {
        start: VIERNES,
        end: VIERNES,
        details: { modo: "libre", dias_estudio: [{ fecha: VIERNES }] },
      },
    ];
    const schedule = generarSemana(obs);
    const dias = schedule.flatMap((w) => w.dias);
    const viernes = dias.find((d) => d.fecha === VIERNES);

    expect(viernes.horas).toBe(0);
    expect(viernes.es_estudio).toBe(true);
    expect(viernes.estudio_modo).toBe("libre");
    // L-J (8×4=32) + Sáb 4 = 36; el viernes queda en 0.
    expect(schedule[0].total_horas_semana).toBe(36);
  });

  it("modo 'redistribuir': las horas del día se reparten sobre los días trabajados", () => {
    // Sábado (4h) repartido sobre L-V (5 días) → +0.8h c/u, sábado en 0.
    const obs = [
      {
        start: SABADO,
        end: SABADO,
        details: { modo: "redistribuir", dias_estudio: [{ fecha: SABADO }] },
      },
    ];
    const schedule = generarSemana(obs);
    const dias = schedule.flatMap((w) => w.dias);

    const sabado = dias.find((d) => d.fecha === SABADO);
    expect(sabado.horas).toBe(0);
    expect(sabado.estudio_modo).toBe("redistribuir");

    const lunes = dias.find((d) => d.fecha === LUNES);
    expect(lunes.horas).toBeCloseTo(8.8, 2);
    expect(lunes.horas_extra).toBeCloseTo(0.8, 2);

    // El total semanal se conserva (las 4h se mueven, no se pierden).
    expect(schedule[0].total_horas_semana).toBeCloseTo(44, 2);
  });
});
