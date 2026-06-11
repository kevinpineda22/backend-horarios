# Contrato de configuración — Programador de Horarios (PH)

> El **idioma compartido** entre el panel del admin (escribe) y el motor de
> horarios (lee). Define exactamente qué guarda el administrador y con qué forma.
> Mientras este contrato no cambie, panel y motor se entienden.

- **Escribe:** panel admin → `ph_parametros_globales`, `ph_jornadas`, etc.
- **Lee:** `src/services/phConfigService.js` → motor `src/utils/schedule.js`.
- **Regla de oro:** ningún valor de ejemplo de este documento se siembra en BD.
  Son *ilustraciones del formato*, no datos. El admin pone los reales.

---

## 1. `ph_parametros_globales` (clave / valor JSONB)

| `clave` | Tipo de `valor` | Formato / ejemplo ilustrativo | Lo usa |
|---------|-----------------|-------------------------------|--------|
| `limite_legal_semanal`   | number | `44` | Límite de horas legales por semana |
| `limite_extra_semanal`   | number | `12` | Tope de extras pagables por semana |
| `limite_total_semanal`   | number | `56` | Tope total (legales + extras) por semana |
| `max_extra_por_dia`      | number | `4`  | Máximo de extras en un día |
| `max_extra_por_quincena` | number | `24` | Máximo de extras acumuladas por quincena (req. 4.2) |
| `limite_legal_diario`    | object | `{ "semana": 8, "sabado": 4 }` | Cap legal por tipo de día |
| `horas_festivo_trabajado`| number | `6`  | Horas de un festivo que se trabaja |
| `descansos`              | array  | `[{ "nombre": "desayuno", "inicio": "09:00", "duracion_min": 15 }, { "nombre": "almuerzo", "inicio": "12:00", "duracion_min": 45 }]` | Pausas que se restan de la jornada |
| `modelo_quincena`        | object | `{ "tipo": "fijo" }` ó `{ "tipo": "personalizado", "dia_corte": 15 }` | Cómo se delimita la quincena (req. 4.2 / Fase 6) |

> Estas 9 claves son **obligatorias** antes de generar horarios nuevos.
> `phConfigService.assertConfigCompleta()` lo valida.

### Modelo de quincena
- `{ "tipo": "fijo" }` → quincenas calendario: del 1 al 15 y del 16 a fin de mes.
- `{ "tipo": "personalizado", "dia_corte": N }` → corta el día N (1ª quincena
  hasta N, 2ª desde N+1).

La lógica de cálculo de quincena se implementa en **Fase 6**; aquí solo se fija
el formato del parámetro.

---

## 2. `ph_jornadas` (lapsos base / turnos)

Cada fila es un turno que el admin crea. El motor deriva de aquí los lapsos y la
capacidad, en lugar de tenerlos clavados en el código.

| Columna | Ejemplo | Significado |
|---------|---------|-------------|
| `nombre` | `"Turno A"` | Etiqueta legible |
| `sede_id` | `<uuid>` ó `null` | Sede dueña; `null` = jornada global |
| `hora_entrada` | `07:00` | Entrada L-V |
| `hora_salida` | `16:00` | Salida L-V |
| `sabado_entrada` | `07:00` | Entrada sábado (regla 2.3 como dato) |
| `sabado_salida` | `11:00` | Salida sábado (regla 2.3 como dato) |
| `dias_aplica` | `{1,2,3,4,5,6}` | Días ISO en que aplica (1=Lun … 7=Dom) |
| `capacidad_diaria` | `9.0` ó `null` | Si `null`, se deriva de entrada→salida − descansos |

### Derivación de capacidades (motor)
A partir de una jornada + parámetros, el motor calcula por día:

```
capRegularDia  = capacidad_diaria  (o (salida − entrada) − descansos del día)
capLegalDia    = limite_legal_diario.sabado   si es sábado
                 limite_legal_diario.semana    si es L-V
                 0                               si es domingo
capExtraPagable = max(0, capRegularDia − capLegalDia)   (acotado por max_extra_por_dia)
```

Así, **un solo lugar** define las horas: la jornada (dato del admin) + los caps
legales (parámetro del admin). Nada en el código.

---

## 3. Tablas de apoyo (formatos breves)

- **`ph_sede_config`** → `{ sede_id, jornada_id, cupos }`. La suma de cupos por
  sede modela la distribución obligatoria (ej. 2 + 2).
- **`ph_asignacion_jornada`** → `{ empleado_id, jornada_id, vigente_desde,
  vigente_hasta }`. `vigente_hasta = null` ⇒ asignación actual.
- **`ph_auditoria_horario`** → `{ horario_id, empleado_id, dia_afectado,
  tipo_cambio, valor_anterior, valor_nuevo, usuario_email, usuario_nombre }`.
- **`ph_notificacion_destinatarios`** → `{ tipo_novedad, correo, nombre, activo }`.

---

## 4. Objeto `config` normalizado (lo que el motor recibe)

`phConfigService.buildScheduleConfig()` arma este objeto desde la BD:

```jsonc
{
  "limites": {
    "legalSemanal": 44, "extraSemanal": 12, "totalSemanal": 56,
    "maxExtraPorDia": 4, "maxExtraPorQuincena": 24,
    "legalDiarioSemana": 8, "legalDiarioSabado": 4,
    "horasFestivoTrabajado": 6
  },
  "descansos": [ { "nombre": "almuerzo", "inicio": "12:00", "duracion_min": 45 } ],
  "modeloQuincena": { "tipo": "fijo" },
  "jornadas": [ /* filas de ph_jornadas activas */ ]
}
```

El motor (`schedule.js`) pasará a recibir este `config` como argumento en lugar
de leer constantes internas. **Esa es la cirugía de la Fase 2 (siguiente paso).**
