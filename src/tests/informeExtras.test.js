import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Informe agregado de horas extra por sede (GET /horarios/informe-extras).
//
// Se mockea Supabase: lo que se prueba acá es la AGREGACIÓN (agrupar por
// colaborador/sede, recortar al rango, marcar quién supera el tope), que es la
// lógica propia. Las queries son responsabilidad de PostgREST.
// ─────────────────────────────────────────────────────────────────────────────

const get = vi.fn();
vi.mock("../services/supabaseAxios.js", () => ({
  supabaseAxios: {
    get: (...args) => get(...args),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("../services/phConfigService.js", () => ({
  buildScheduleConfig: vi.fn(async () => ({
    limites: { maxExtraPorQuincena: 10 },
  })),
}));
vi.mock("../services/emailService.js", () => ({ sendEmail: vi.fn() }));

const { getInformeExtras } = await import("../controllers/horariosController.js");

const SEDE_A = "11111111-1111-1111-1111-111111111111";
const SEDE_B = "22222222-2222-2222-2222-222222222222";

const EMPLEADOS = [
  { id: "e1", nombre_completo: "Ana Gómez", cedula: "111", sede_id: SEDE_A },
  { id: "e2", nombre_completo: "Beto Ruiz", cedula: "222", sede_id: SEDE_A },
  { id: "e3", nombre_completo: "Caro Díaz", cedula: "333", sede_id: SEDE_B },
  { id: "e4", nombre_completo: "Sin Extras", cedula: "444", sede_id: SEDE_B },
];

const SEDES = [
  { id: SEDE_A, nombre: "Sede Centro" },
  { id: SEDE_B, nombre: "Sede Norte" },
];

// Semana que CRUZA el borde de la quincena: 14 y 15 caen dentro (1–15),
// el 16 ya pertenece a la quincena siguiente y NO debe contarse.
const HORARIOS = [
  {
    empleado_id: "e1",
    dias: [
      { fecha: "2024-01-08", horas: 10, horas_extra: 2 },
      { fecha: "2024-01-09", horas: 8, horas_extra: 0 },
      { fecha: "2024-01-14", horas: 6, horas_extra: 6, descripcion: "Domingo" },
      { fecha: "2024-01-16", horas: 10, horas_extra: 2 }, // fuera del rango
    ],
  },
  {
    empleado_id: "e2",
    dias: [{ fecha: "2024-01-10", horas: 9, horas_extra: 1 }],
  },
  {
    empleado_id: "e3",
    dias: [{ fecha: "2024-01-11", horas: 14, horas_extra: 6 }],
  },
  { empleado_id: "e4", dias: [{ fecha: "2024-01-12", horas: 8, horas_extra: 0 }] },
];

const mockDB = ({ empleados = EMPLEADOS, horarios = HORARIOS } = {}) => {
  get.mockImplementation(async (url) => {
    if (url.startsWith("/empleados")) {
      const m = url.match(/sede_id=eq\.([^&]+)/);
      return {
        data: m ? empleados.filter((e) => e.sede_id === m[1]) : empleados,
      };
    }
    if (url.startsWith("/sedes")) return { data: SEDES };
    if (url.startsWith("/horarios")) {
      const ids = url.match(/empleado_id=in\.\(([^)]+)\)/)?.[1].split(",") || [];
      return { data: horarios.filter((h) => ids.includes(h.empleado_id)) };
    }
    return { data: [] };
  });
};

const run = async (query = {}) => {
  const res = {
    statusCode: 200,
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  await getInformeExtras({ query }, res);
  return res;
};

beforeEach(() => {
  get.mockReset();
  mockDB();
});

describe("Informe de extras — agregación", () => {
  it("agrupa por colaborador y ordena de más a menos extras", async () => {
    const { body } = await run({ desde: "2024-01-01", hasta: "2024-01-15" });

    expect(body.empleados.map((e) => e.nombre_completo)).toEqual([
      "Ana Gómez", // 2 + 6 = 8
      "Caro Díaz", // 6
      "Beto Ruiz", // 1
    ]);
    expect(body.empleados[0].total_extra).toBe(8);
    expect(body.empleados[0].dias_con_extra).toBe(2);
    expect(body.total_extras).toBe(15);
  });

  it("excluye a quien no hizo extras, pero lo cuenta en el universo", async () => {
    const { body } = await run({ desde: "2024-01-01", hasta: "2024-01-15" });

    expect(body.empleados.some((e) => e.nombre_completo === "Sin Extras")).toBe(
      false
    );
    expect(body.total_empleados).toBe(4);
  });

  it("reporta la dotación por sede (para el 'X de Y' del encabezado)", async () => {
    const { body } = await run({ desde: "2024-01-01", hasta: "2024-01-15" });

    // Incluye a "Sin Extras" (e4): es dotación, no extras.
    expect(body.empleados_por_sede).toEqual({ [SEDE_A]: 2, [SEDE_B]: 2 });
  });

  it("no cuenta días fuera del rango aunque la semana lo cruce", async () => {
    const { body } = await run({ desde: "2024-01-01", hasta: "2024-01-15" });

    const ana = body.empleados.find((e) => e.nombre_completo === "Ana Gómez");
    // El 2024-01-16 tiene 2h extra pero cae en la quincena siguiente.
    expect(ana.detalle.map((d) => d.fecha)).toEqual([
      "2024-01-08",
      "2024-01-14",
    ]);
    expect(ana.total_extra).toBe(8);
  });

  it("totaliza por sede", async () => {
    const { body } = await run({ desde: "2024-01-01", hasta: "2024-01-15" });

    expect(body.sedes).toEqual([
      {
        sede_id: SEDE_A,
        sede_nombre: "Sede Centro",
        total_extra: 9, // Ana 8 + Beto 1
        empleados_con_extra: 2,
      },
      {
        sede_id: SEDE_B,
        sede_nombre: "Sede Norte",
        total_extra: 6,
        empleados_con_extra: 1,
      },
    ]);
  });

  it("filtra por sede", async () => {
    const { body } = await run({
      desde: "2024-01-01",
      hasta: "2024-01-15",
      sede_id: SEDE_B,
    });

    expect(body.empleados).toHaveLength(1);
    expect(body.empleados[0].nombre_completo).toBe("Caro Díaz");
    expect(body.total_empleados).toBe(2); // solo los de esa sede
  });

  it("marca a quien supera el máximo SOLO si el rango es una quincena", async () => {
    // 1–15 es quincena: Ana (8h) no supera 10h, nadie la supera.
    const quincena = await run({ desde: "2024-01-01", hasta: "2024-01-15" });
    expect(quincena.body.es_quincena).toBe(true);
    expect(quincena.body.maximo_quincena).toBe(10);
    expect(quincena.body.empleados.every((e) => !e.supera_maximo)).toBe(true);

    // Rango arbitrario: el tope por quincena no aplica, no se marca a nadie.
    const arbitrario = await run({ desde: "2024-01-08", hasta: "2024-01-14" });
    expect(arbitrario.body.es_quincena).toBe(false);
    expect(arbitrario.body.empleados.every((e) => !e.supera_maximo)).toBe(true);
  });

  it("marca supera_maximo cuando el acumulado de la quincena pasa el tope", async () => {
    mockDB({
      horarios: [
        {
          empleado_id: "e1",
          dias: [
            { fecha: "2024-01-08", horas: 14, horas_extra: 6 },
            { fecha: "2024-01-09", horas: 14, horas_extra: 6 },
          ],
        },
      ],
    });
    const { body } = await run({ desde: "2024-01-01", hasta: "2024-01-15" });

    expect(body.empleados[0].total_extra).toBe(12);
    expect(body.empleados[0].supera_maximo).toBe(true);
  });

  it("sin fechas usa la quincena actual", async () => {
    const { body } = await run();

    const hoy = new Date().toISOString().slice(0, 10);
    const dia = Number(hoy.slice(8, 10));
    expect(body.desde).toBe(
      dia <= 15 ? `${hoy.slice(0, 7)}-01` : `${hoy.slice(0, 7)}-16`
    );
    expect(body.es_quincena).toBe(true);
  });

  it("rechaza un rango invertido", async () => {
    const res = await run({ desde: "2024-01-15", hasta: "2024-01-01" });
    expect(res.statusCode).toBe(400);
  });

  it("no rompe cuando no hay colaboradores", async () => {
    mockDB({ empleados: [] });
    const { body } = await run({ desde: "2024-01-01", hasta: "2024-01-15" });

    expect(body.empleados).toEqual([]);
    expect(body.total_extras).toBe(0);
  });
});
