# Backend Horarios - Enhanced Scheduling System

Sistema de gestión de horarios de empleados con soporte para intervalos de 30 minutos.

## Características Principales

### ✨ Nuevas Funcionalidades - Intervalos de 30 Minutos

- **Programación de precisión**: Soporte para intervalos de 30 minutos (8:00, 8:30, 9:00, 9:30, etc.)
- **Detección de conflictos**: Validación automática de superposiciones de horarios
- **Slots disponibles**: Cálculo inteligente de espacios de tiempo disponibles
- **Validación de alineación**: Verificación automática de alineación a intervalos de 30 minutos

## API Endpoints Mejorados

### 1. Obtener Slots Disponibles
```http
GET /api/horarios/available-slots/:empleado_id/:fecha
```

**Descripción**: Obtiene todos los slots de 30 minutos disponibles para un empleado en una fecha específica.

**Ejemplo de respuesta**:
```json
{
  "fecha": "2024-01-15",
  "empleado_id": "123",
  "availableSlots": [
    {
      "start": "2024-01-15T07:00:00",
      "end": "2024-01-15T07:30:00",
      "duration": 30,
      "startTime": 420,
      "endTime": 450
    },
    {
      "start": "2024-01-15T07:30:00",
      "end": "2024-01-15T08:00:00",
      "duration": 30,
      "startTime": 450,
      "endTime": 480
    }
  ],
  "dayCapacity": 10,
  "existingSchedules": []
}
```

### 2. Validar Conflictos de Horario
```http
POST /api/horarios/validate-schedule
```

**Body**:
```json
{
  "empleado_id": "123",
  "proposed_schedule": {
    "start": "2024-01-15T08:30:00",
    "end": "2024-01-15T10:00:00"
  }
}
```

**Ejemplo de respuesta**:
```json
{
  "isValid": false,
  "hasConflicts": true,
  "conflicts": [
    {
      "conflictingSchedule": {
        "start": "2024-01-15T08:00:00",
        "end": "2024-01-15T09:00:00"
      },
      "overlapStart": "2024-01-15T08:30:00",
      "overlapEnd": "2024-01-15T09:00:00"
    }
  ],
  "proposed_schedule": {
    "start": "2024-01-15T08:30:00",
    "end": "2024-01-15T10:00:00"
  }
}
```

## Funciones de Utilidad

### Generación de Slots de 30 Minutos
```javascript
import { generateHalfHourSlots } from './src/utils/schedule.js';

// Genera slots de 30 minutos entre 8:00 AM (480 min) y 10:00 AM (600 min)
const slots = generateHalfHourSlots(480, 600, 30);
// Resultado: [
//   { start: 480, end: 510, duration: 30 }, // 8:00-8:30
//   { start: 510, end: 540, duration: 30 }, // 8:30-9:00
//   { start: 540, end: 570, duration: 30 }, // 9:00-9:30
//   { start: 570, end: 600, duration: 30 }  // 9:30-10:00
// ]
```

### Validación de Alineación
```javascript
import { isHalfHourAligned } from './src/utils/schedule.js';

console.log(isHalfHourAligned(480)); // true  (8:00)
console.log(isHalfHourAligned(510)); // true  (8:30)
console.log(isHalfHourAligned(495)); // false (8:15)
```

### Asignación Mejorada de Horas
```javascript
import { allocateHoursInHalfHourSlots, getDayInfo } from './src/utils/schedule.js';

const dayInfo = getDayInfo(1, false, null); // Lunes
const result = allocateHoursInHalfHourSlots('2024-01-15', dayInfo, 2.5);

// Resultado: 2.5 horas distribuidas en 5 slots de 30 minutos
```

## Compatibilidad

- ✅ **Backward Compatible**: Los horarios existentes siguen funcionando normalmente
- ✅ **Híbrido**: Soporte tanto para asignación tradicional como intervalos de 30 minutos
- ✅ **Automático**: Usa intervalos de 30 minutos para turnos ≤ 8 horas, tradicional para turnos más largos

## Instalación y Uso

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de Supabase

# Iniciar servidor
npm start
```

## Casos de Uso

### 1. Reuniones de 1.5 horas
```json
{
  "empleado_id": "123",
  "proposed_schedule": {
    "start": "2024-01-15T09:00:00",
    "end": "2024-01-15T10:30:00"
  }
}
```

### 2. Sesiones de 30 minutos
```json
{
  "empleado_id": "123",
  "proposed_schedule": {
    "start": "2024-01-15T14:30:00",
    "end": "2024-01-15T15:00:00"
  }
}
```

### 3. Turnos de medio día (4.5 horas)
```json
{
  "empleado_id": "123",
  "proposed_schedule": {
    "start": "2024-01-15T08:00:00",
    "end": "2024-01-15T12:30:00"
  }
}
```

## Contribuir

1. Fork el proyecto
2. Crear una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir un Pull Request

## Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.