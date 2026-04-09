import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import request from "supertest";

// ── Mocks (ANTES de importar app) ──────────────────────────────

// Mock supabaseAxios & storageClient
vi.mock("../../src/services/supabaseAxios.js", () => {
  const axiosMock = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
  const storageMock = {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => ({
          data: { path: "test-file.png" },
          error: null,
        })),
        getPublicUrl: vi.fn(() => ({
          data: { publicUrl: "https://storage.test/test-file.png" },
        })),
        remove: vi.fn(() => ({ error: null })),
      })),
    },
  };
  return { supabaseAxios: axiosMock, storageClient: storageMock };
});

// Mock email service
vi.mock("../../src/services/emailService.js", () => ({
  sendEmail: vi.fn(() => Promise.resolve({ messageId: "test-123" })),
}));

// ── Imports (DESPUÉS de los mocks) ─────────────────────────────

const { default: app } = await import("../../app.js");
const { supabaseAxios, storageClient } =
  await import("../../src/services/supabaseAxios.js");
const { sendEmail } = await import("../../src/services/emailService.js");

// ── Helpers ────────────────────────────────────────────────────

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

function makeToken(overrides = {}) {
  const payload = {
    sub: "user-123",
    email: "random@gmail.com",
    role: "authenticated",
    ...overrides,
  };
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "1h",
    algorithm: "HS256",
  });
}

function makeHRToken() {
  return makeToken({ email: "asistentegh@merkahorrosas.com" });
}

function makeHRTokenByRole() {
  return makeToken({
    email: "otrapersona@correo.com",
    role: "gestion_humana",
  });
}

// Pequeño PNG real (1x1 pixel transparente)
const REAL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB" +
  "Nl7BcQAAAABJRU5ErkJggg==";

// Pequeño JPEG real (1x1 pixel)
const REAL_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoH" +
  "BwYIDAoMCwsKCwsNCxAQDQ4RDQsOEBEQExMUFRUWHA8XGB0YGBcWFhb/2wBDAQME" +
  "BAUEBQkFBQkWDQsNFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYW" +
  "FhYWFhYWFhYWFhYWFhb/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf" +
  "/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAA" +
  "AAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k=";

// PDF real (cabecera mínima)
const REAL_PDF_BASE64 = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
).toString("base64");

// ── Setup ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: supabaseAxios.post returns created observation
  supabaseAxios.post.mockResolvedValue({
    data: [
      {
        id: "obs-001",
        empleado_id: "emp-001",
        tipo_novedad: "Incapacidades",
        revisada: false,
      },
    ],
    error: null,
  });

  // Default: empleado lookup for email notifications
  supabaseAxios.get.mockResolvedValue({
    data: [{ nombre_completo: "Juan Pérez", cedula: "123456" }],
    error: null,
  });

  // Default: patch success
  supabaseAxios.patch.mockResolvedValue({ error: null });
});

// ════════════════════════════════════════════════════════════════
// 1. EMAILS: verificar destinatarios según tipo de novedad
// ════════════════════════════════════════════════════════════════

describe("Emails por tipo de novedad", () => {
  // sendEmail recibe un string con emails separados por comas (recipients.join(","))
  const SST_EMAILS =
    "auxiliarsst@merkahorrosas.com,sistemageneralsst@merkahorrosas.com,analistajuniordh@merkahorrosas.com,analistadh@merkahorrosas.com,asistentegh@merkahorrosas.com";
  const GENERAL_EMAILS = "asistentegh@merkahorrosas.com";

  const basePayload = {
    empleado_id: "emp-001",
    observacion: "Test observación",
    fecha_novedad: "2026-04-09",
    firma_empleado_base64: REAL_PNG_BASE64,
    firma_lider_base64: REAL_PNG_BASE64,
  };

  it("Incapacidades → email al equipo SST (5 destinatarios)", async () => {
    const res = await request(app)
      .post("/api/observaciones")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        ...basePayload,
        tipo_novedad: "Incapacidades",
        shouldNotify: true,
        details: {
          tipoIncapacidad: "Enfermedad General",
          diasIncapacidad: "Menor a 3 días",
          fecha_inicio: "2026-04-09",
          fecha_fin: "2026-04-10",
        },
        incapacidad_base64: REAL_PNG_BASE64,
        incapacidad_file_name: "incap",
      });

    expect(res.status).toBe(201);
    expect(sendEmail).toHaveBeenCalled();

    const [recipients, subject] = sendEmail.mock.calls[0];
    expect(recipients).toEqual(SST_EMAILS);
    expect(subject).toContain("[ALERTA]");
    expect(subject).toContain("Incapacidades");
    expect(subject).toContain("Juan Pérez");
  });

  it("Restricciones/Recomendaciones → email al equipo SST", async () => {
    const res = await request(app)
      .post("/api/observaciones")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        ...basePayload,
        tipo_novedad: "Restricciones/Recomendaciones",
        shouldNotify: true,
        documento_base64: REAL_PNG_BASE64,
        file_name: "restriccion.png",
      });

    expect(res.status).toBe(201);
    expect(sendEmail).toHaveBeenCalled();

    const [recipients] = sendEmail.mock.calls[0];
    expect(recipients).toEqual(SST_EMAILS);
  });

  it("Licencias → email solo a asistentegh (1 destinatario)", async () => {
    const res = await request(app)
      .post("/api/observaciones")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        ...basePayload,
        tipo_novedad: "Licencias",
        details: {
          sub_tipo_novedad: "Licencia Remunerada",
          duracion_dias: "3",
          fecha_inicio: "2026-04-10",
          fecha_termino: "2026-04-12",
          lider_aprueba: "Admin",
          fecha_aprobacion: "2026-04-09",
          motivo_licencia: "Asuntos personales",
        },
      });

    expect(res.status).toBe(201);
    expect(sendEmail).toHaveBeenCalled();

    const [recipients] = sendEmail.mock.calls[0];
    expect(recipients).toEqual(GENERAL_EMAILS);
  });

  it("Vacaciones → email solo a asistentegh", async () => {
    const res = await request(app)
      .post("/api/observaciones")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        ...basePayload,
        tipo_novedad: "Vacaciones",
        details: {
          periodo_vacacional_ano: "2026",
          fecha_inicio_vacaciones: "2026-05-01",
          fecha_fin_vacaciones: "2026-05-15",
          fecha_regreso_vacaciones: "2026-05-16",
        },
      });

    expect(res.status).toBe(201);
    expect(sendEmail).toHaveBeenCalled();

    const [recipients] = sendEmail.mock.calls[0];
    expect(recipients).toEqual(GENERAL_EMAILS);
  });

  it("Si el envío de email falla, la observación se crea igual (no-blocking)", async () => {
    sendEmail.mockRejectedValueOnce(new Error("SMTP down"));

    const res = await request(app)
      .post("/api/observaciones")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        ...basePayload,
        tipo_novedad: "Préstamos",
        details: {
          monto_solicitado: "500000",
          numero_cuotas: "6",
        },
      });

    // La observación se crea aunque el email falle
    expect(res.status).toBe(201);
  });
});

// ════════════════════════════════════════════════════════════════
// 2. APROBACIÓN: individual vs masiva
// ════════════════════════════════════════════════════════════════

describe("Aprobación individual de observaciones", () => {
  it("PATCH /:id/revisar marca SOLO esa observación (no todas)", async () => {
    const res = await request(app)
      .patch("/api/observaciones/obs-001/revisar")
      .set("Authorization", `Bearer ${makeHRToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Observación marcada como revisada.");

    // Verificar que se llamó con el filtro por ID individual
    expect(supabaseAxios.patch).toHaveBeenCalledWith(
      "/observaciones?id=eq.obs-001",
      { revisada: true },
    );
  });

  it("PATCH /:empleado_id/marcar-revisadas marca TODAS las pendientes del empleado", async () => {
    const res = await request(app)
      .patch("/api/observaciones/emp-001/marcar-revisadas")
      .set("Authorization", `Bearer ${makeHRToken()}`);

    expect(res.status).toBe(200);

    // Verificar el filtro masivo: empleado_id + revisada=false
    expect(supabaseAxios.patch).toHaveBeenCalledWith(
      "/observaciones?empleado_id=eq.emp-001&revisada=eq.false",
      { revisada: true },
    );
  });

  it("Revisar una observación NO afecta las otras del mismo empleado", async () => {
    // Primero revisamos obs-001
    await request(app)
      .patch("/api/observaciones/obs-001/revisar")
      .set("Authorization", `Bearer ${makeHRToken()}`);

    // Segundo: revisamos obs-002
    await request(app)
      .patch("/api/observaciones/obs-002/revisar")
      .set("Authorization", `Bearer ${makeHRToken()}`);

    // Cada llamada debe tener su propio ID
    const calls = supabaseAxios.patch.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe("/observaciones?id=eq.obs-001");
    expect(calls[1][0]).toBe("/observaciones?id=eq.obs-002");
  });
});

// ════════════════════════════════════════════════════════════════
// 3. ARCHIVOS: MIME type correcto según contenido real
// ════════════════════════════════════════════════════════════════

describe("Archivos se suben con MIME correcto", () => {
  it("PNG real → se sube como image/png con extensión .png", async () => {
    await request(app)
      .post("/api/observaciones")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        empleado_id: "emp-001",
        observacion: "Test PNG",
        tipo_novedad: "Permisos",
        fecha_novedad: "2026-04-09",
        details: {
          fecha_inicio: "2026-04-09",
          fecha_fin: "2026-04-10",
        },
        documento_base64: REAL_PNG_BASE64,
        file_name: "permiso",
        firma_empleado_base64: REAL_PNG_BASE64,
        firma_lider_base64: REAL_PNG_BASE64,
      });

    // Verificar que storage.from().upload fue llamado
    const fromMock = storageClient.storage.from;
    expect(fromMock).toHaveBeenCalledWith("documentos-observaciones-ph");

    const uploadCalls = fromMock.mock.results[0].value.upload.mock.calls;

    // Al menos una llamada de upload (documento + firmas)
    expect(uploadCalls.length).toBeGreaterThanOrEqual(1);

    // El primer upload (documento) debe ser PNG
    const [fileName, , options] = uploadCalls[0];
    expect(fileName).toMatch(/\.png$/);
    expect(options.contentType).toBe("image/png");
  });

  it("JPEG real → se sube como image/jpeg con extensión .jpg", async () => {
    await request(app)
      .post("/api/observaciones")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        empleado_id: "emp-001",
        observacion: "Test JPEG",
        tipo_novedad: "Permisos",
        fecha_novedad: "2026-04-09",
        details: {
          fecha_inicio: "2026-04-09",
          fecha_fin: "2026-04-10",
        },
        documento_base64: REAL_JPEG_BASE64,
        file_name: "foto_permiso",
        firma_empleado_base64: REAL_PNG_BASE64,
        firma_lider_base64: REAL_PNG_BASE64,
      });

    const uploadCalls =
      storageClient.storage.from.mock.results[0].value.upload.mock.calls;

    // El primer upload (documento JPEG)
    const [fileName, , options] = uploadCalls[0];
    expect(fileName).toMatch(/\.jpg$/);
    expect(options.contentType).toBe("image/jpeg");
  });

  it("PDF real → se sube como application/pdf con extensión .pdf", async () => {
    await request(app)
      .post("/api/observaciones")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        empleado_id: "emp-001",
        observacion: "Test PDF",
        tipo_novedad: "Restricciones/Recomendaciones",
        fecha_novedad: "2026-04-09",
        documento_base64: REAL_PDF_BASE64,
        file_name: "restriccion",
        firma_empleado_base64: REAL_PNG_BASE64,
        firma_lider_base64: REAL_PNG_BASE64,
      });

    const uploadCalls =
      storageClient.storage.from.mock.results[0].value.upload.mock.calls;

    const [fileName, , options] = uploadCalls[0];
    expect(fileName).toMatch(/\.pdf$/);
    expect(options.contentType).toBe("application/pdf");
  });

  it("Firmas digitales siempre son PNG (vienen del canvas)", async () => {
    await request(app)
      .post("/api/observaciones")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        empleado_id: "emp-001",
        observacion: "Test firmas",
        tipo_novedad: "Préstamos",
        fecha_novedad: "2026-04-09",
        details: { monto_solicitado: "100000", numero_cuotas: "3" },
        firma_empleado_base64: REAL_PNG_BASE64,
        firma_lider_base64: REAL_PNG_BASE64,
      });

    const uploadCalls =
      storageClient.storage.from.mock.results[0].value.upload.mock.calls;

    // Solo firmas (no hay documento adjunto para Préstamos)
    for (const [fileName, , options] of uploadCalls) {
      expect(fileName).toMatch(/\.png$/);
      expect(options.contentType).toBe("image/png");
    }
  });
});

// ════════════════════════════════════════════════════════════════
// 4. AUTH: solo HR puede aprobar
// ════════════════════════════════════════════════════════════════

describe("Control de acceso: solo HR puede revisar", () => {
  it("Sin token → 401", async () => {
    const res = await request(app).patch("/api/observaciones/obs-001/revisar");
    expect(res.status).toBe(401);
  });

  it("Token de usuario normal → 403", async () => {
    const token = makeToken({ email: "empleado@gmail.com" });
    const res = await request(app)
      .patch("/api/observaciones/obs-001/revisar")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("No tienes permisos");
  });

  it("Token HR por email (asistentegh@merkahorrosas.com) from makeHRToken → 200", async () => {
    const res = await request(app)
      .patch("/api/observaciones/obs-001/revisar")
      .set("Authorization", `Bearer ${makeHRToken()}`);

    expect(res.status).toBe(200);
  });

  it("Token HR por email (asistentegh@merkahorrosas.com) → 200", async () => {
    const token = makeToken({ email: "asistentegh@merkahorrosas.com" });
    const res = await request(app)
      .patch("/api/observaciones/obs-001/revisar")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it("Token HR por rol gestion_humana (sin email permitido) → 200", async () => {
    const res = await request(app)
      .patch("/api/observaciones/obs-001/revisar")
      .set("Authorization", `Bearer ${makeHRTokenByRole()}`);

    expect(res.status).toBe(200);
  });

  it("Token HR por app_metadata.role → 200", async () => {
    const token = makeToken({
      email: "nadie@correo.com",
      app_metadata: { role: "gestion_humana" },
    });
    const res = await request(app)
      .patch("/api/observaciones/obs-001/revisar")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it("GET /permissions → canApprove: true para HR", async () => {
    const res = await request(app)
      .get("/api/observaciones/permissions")
      .set("Authorization", `Bearer ${makeHRToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.canApprove).toBe(true);
  });

  it("GET /permissions → canApprove: false para usuario normal", async () => {
    const token = makeToken({ email: "empleado@gmail.com" });
    const res = await request(app)
      .get("/api/observaciones/permissions")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.canApprove).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════
// 5. VALIDACIONES: documentos obligatorios para Incapacidades
// ════════════════════════════════════════════════════════════════

describe("Validaciones de Incapacidades", () => {
  const incapBase = {
    empleado_id: "emp-001",
    observacion: "Incapacidad test",
    tipo_novedad: "Incapacidades",
    fecha_novedad: "2026-04-09",
    firma_empleado_base64: REAL_PNG_BASE64,
    firma_lider_base64: REAL_PNG_BASE64,
  };

  it("Incidente de Trabajo sin documento_incapacidad → 400", async () => {
    const res = await request(app)
      .post("/api/observaciones")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        ...incapBase,
        details: {
          tipoIncapacidad: "Incidente de Trabajo",
          fecha_inicio: "2026-04-09",
          fecha_fin: "2026-04-12",
        },
        // Sin incapacidad_base64
      });

    expect(res.status).toBe(400);
  });

  it("Enfermedad General > 3 días sin historia clínica → 400", async () => {
    const res = await request(app)
      .post("/api/observaciones")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        ...incapBase,
        details: {
          tipoIncapacidad: "Enfermedad General",
          diasIncapacidad: "Mayor a 3 días",
          fecha_inicio: "2026-04-09",
          fecha_fin: "2026-04-15",
        },
        incapacidad_base64: REAL_PNG_BASE64,
        incapacidad_file_name: "incap",
        // Sin historia_base64  → debe fallar
      });

    expect(res.status).toBe(400);
  });

  it("Enfermedad General < 3 días solo necesita incapacidad (sin historia) → 201", async () => {
    const res = await request(app)
      .post("/api/observaciones")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        ...incapBase,
        details: {
          tipoIncapacidad: "Enfermedad General",
          diasIncapacidad: "Menor a 3 días",
          fecha_inicio: "2026-04-09",
          fecha_fin: "2026-04-10",
        },
        incapacidad_base64: REAL_PNG_BASE64,
        incapacidad_file_name: "incap",
        // Sin historia → OK para < 3 días
      });

    expect(res.status).toBe(201);
  });

  it("Restricciones sin documento → 400", async () => {
    const res = await request(app)
      .post("/api/observaciones")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        empleado_id: "emp-001",
        observacion: "Restricción sin doc",
        tipo_novedad: "Restricciones/Recomendaciones",
        fecha_novedad: "2026-04-09",
        firma_empleado_base64: REAL_PNG_BASE64,
        firma_lider_base64: REAL_PNG_BASE64,
        // Sin documento_base64 → debe fallar
      });

    expect(res.status).toBe(400);
  });
});
