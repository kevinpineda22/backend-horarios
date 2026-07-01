import { describe, it, expect } from "vitest";
import { generateScheduleByShift } from "../utils/schedule.js";

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Smoke test del motor de horarios â€” compensaciÃ³n de estudio (spec 6.2).
//
// Red de seguridad ANTES de reconciliar el banco de horas al modelo de
// "extras reales acumulados". Fija el comportamiento esperado de los Casos 1 y 2
// de la EspecificaciÃ³n TÃ©cnica para que cualquier cambio futuro que lo rompa
// salte acÃ¡.
//
// El cÃ¡lculo de semana asume servidor en UTC (igual que Vercel). Correr con:
//   TZ=UTC npx vitest run src/tests/schedule.estudio.test.js
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Turno base 07:00â€“16:00 (L-V 8h netas con 1h de descanso) / SÃ¡bado 07:00â€“11:00 (4h).
const TURNO = {
  hora_entrada: "07:00:00",
  hora_salida: "16:00:00",
  sabado_entrada: "07:00:00",
  sabado_salida: "11:00:00",
  dias_aplica: [1, 2, 3, 4, 5, 6],
};

// Semana ISO de referencia: lunes 2024-01-08 â€¦ sÃ¡bado 2024-01-13.
const LUNES = "2024-01-08";
const SABADO = "2024-01-13";

// Genera la semana y devuelve el dÃ­a pedido (busca en todas las semanas).
const generarDia = (fecha, partialObservations = []) => {
  const { schedule } = generateScheduleByShift(
    LUNES,
    SABADO,
    TURNO,
    new Map(), // holidaySet vacÃ­o
    {}, // holidayOverrides
    {}, // sundayOverrides
    partialObservations,
    null // cfg null => tope colaborador por defecto = 4 (spec)
  );
  return schedule.flatMap((w) => w.dias).find((d) => d.fecha === fecha);
};

describe("CompensaciÃ³n de estudio (spec 6.2)", () => {
  it("Caso 1 â€” estudio sÃ¡bado completo (4h): lo cubre todo el colaborador", () => {
    // Luisa CÃ³rdoba: sÃ¡bado de 4h, estudio toda la jornada (07:00â€“11:00).
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
    expect(dia.horas).toBe(4); // el dÃ­a se paga COMPLETO (cubierto)
  });

  it("Caso 2 â€” estudio dÃ­a laboral completo (8h): 4h colaborador / 4h empresa", () => {
    // David Ãvalo: lunes de 8h netas, estudio toda la jornada (07:00â€“16:00).
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
    expect(dia.horas).toBe(8); // el dÃ­a se paga COMPLETO (cubierto)
  });

  it("RegresiÃ³n â€” sin estudio: jornada normal sin metadatos de compensaciÃ³n", () => {
    const lunes = generarDia(LUNES);
    expect(lunes.horas).toBe(8); // L-V: 8h netas
    expect(lunes.horas_estudio).toBeUndefined();
    expect(lunes.estudio_compensa_banco).toBeUndefined();
    expect(lunes.estudio_cubre_empresa).toBeUndefined();

    const sabado = generarDia(SABADO);
    expect(sabado.horas).toBe(4); // SÃ¡bado: 4h derivadas del turno
    expect(sabado.horas_estudio).toBeUndefined();
  });

  it("RegresiÃ³n â€” la semana completa suma 44h (8h L-V + 4h SÃ¡b)", () => {
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

describe("Estudio de dÃ­a completo â€” modos libre / redistribuir", () => {
  const VIERNES = "2024-01-12";

  const generarSemana = (obs) =>
    generateScheduleByShift(LUNES, SABADO, TURNO, new Map(), {}, {}, obs, null)
      .schedule;

  it("modo 'libre': el dÃ­a no se trabaja (0h) y no se recupera", () => {
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
    // L-J (8Ã—4=32) + SÃ¡b 4 = 36; el viernes queda en 0.
    expect(schedule[0].total_horas_semana).toBe(36);
  });

  it("modo 'redistribuir': las horas del dÃ­a se reparten sobre los dÃ­as trabajados", () => {
    // SÃ¡bado (4h) repartido sobre L-V (5 dÃ­as) â†’ +0.8h c/u, sÃ¡bado en 0.
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
    expect(lunes.horas).toBeCloseTo(10, 2);
    // Las horas redistribuidas del sábado NO son extra: son compensación y
    // cuentan como horas legales/base del día que las recibe.
    expect(lunes.horas_extra).toBeCloseTo(0, 2);
    expect(lunes.horas_base).toBeCloseTo(10, 2);
    expect(lunes.horas_redistribuidas).toBeCloseTo(2, 2);

    // El total semanal se conserva (las 4h se mueven, no se pierden).
    expect(schedule[0].total_horas_semana).toBeCloseTo(44, 2);
  });
});

