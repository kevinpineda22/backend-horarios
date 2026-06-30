// src/controllers/empleadosController.js
import { supabaseAxios } from '../services/supabaseAxios.js';
import { Buffer } from 'buffer';
import xlsx from 'xlsx';

// --- FUNCIÓN MEJORADA PARA CONVERTIR FECHAS ---
const excelDateToJSDate = (dateValue) => {
    // Si el valor es una cadena de texto, intenta parsear el formato DD/MM/YYYY
    if (typeof dateValue === 'string') {
        const cleanedValue = dateValue.trim();
        const parts = cleanedValue.split('/');
        // Verifica si tiene 3 partes y los valores son numéricos
        if (parts.length === 3 && !isNaN(Number(parts[0])) && !isNaN(Number(parts[1])) && !isNaN(Number(parts[2]))) {
            const day = String(Number(parts[0])).padStart(2, '0');
            const month = String(Number(parts[1])).padStart(2, '0');
            const year = parts[2];
            // Construye la fecha en formato YYYY-MM-DD
            return `${year}-${month}-${day}`;
        }
    }
    
    // Si el valor es un número, usa la lógica anterior para convertirlo
    if (typeof dateValue === 'number' && !isNaN(dateValue)) {
        const date = new Date(Date.UTC(0, 0, dateValue - 1));
        return date.toISOString().split('T')[0];
    }

    // Si no es un formato válido, devuelve el valor original o null
    return dateValue || null;
};

// --- FUNCIÓN 'parseFile' CORREGIDA ---
const parseFile = async (file) => {
  return new Promise((resolve, reject) => {
    try {
      // Leer el archivo como un libro de trabajo de Excel, que también funciona con CSV
      const workbook = xlsx.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0]; // Obtener el nombre de la primera hoja
      const worksheet = workbook.Sheets[sheetName];

      // Convertir la hoja a JSON. La librería detecta automáticamente el formato.
      const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
      const headers = data.shift(); // Saca la primera fila (encabezados)

      // Reconstruye el JSON con los encabezados y datos correctos
      const result = data.map(row => {
          const obj = {};
          headers.forEach((header, index) => {
              if (header) { // Evitar encabezados nulos
                obj[header.trim()] = row[index];
              }
          });
          return obj;
      });

      resolve(result);
    } catch (e) {
      reject(new Error('Error al parsear el archivo: ' + e.message));
    }
  });
};

/**
 * Función auxiliar para encontrar o crear una empresa/sede y devolver su UUID
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const findOrCreateId = async (tableName, value) => {
  // value puede ser null | '' | 'Nombre' | 'uuid-v4'
  if (!value) return null;
  try {
    // Si parece UUID, lo devolvemos directo sin consulta
    if (UUID_REGEX.test(value)) {
      return value;
    }

    // Si no es UUID, asumimos que es un NOMBRE
    const { data: existingData, error } = await supabaseAxios.get(`/${tableName}?select=id&nombre=eq.${encodeURIComponent(value)}`);
    if (error) throw error;

    if (existingData && existingData.length > 0) {
      return existingData[0].id;
    } else {
      const { data: newData, error: createError } = await supabaseAxios.post(`/${tableName}`, [{ nombre: value }]);
      if (createError) throw createError;
      return newData[0].id;
    }
  } catch (e) {
    console.error(`Error finding or creating ${tableName}:`, e);
    throw e;
  }
};

/**
 * Endpoint para obtener todos los empleados.
 */
export const getEmpleados = async (req, res) => {
  try {
    const params = new URLSearchParams({
      select: '*',
      order: 'nombre_completo.asc',
      ...req.query, // <-- reenviamos filtros como estado=eq.activo, cedula=like.*, etc.
    });

    const { data, error } = await supabaseAxios.get(`/empleados?${params.toString()}`);
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error fetching empleados', error: e.message });
  }
};

/**
 * Endpoint para crear un nuevo empleado manualmente.
 * Ahora 'rol' es opcional y se han añadido nuevos campos.
 */
export const createEmpleado = async (req, res) => {
  try {
    const { cedula, nombre_completo, rol, empresa_id, sede_id, celular, correo_electronico, fecha_contratacion } = req.body;

    const empresaUuid = await findOrCreateId('empresas', empresa_id);
    const sedeUuid    = await findOrCreateId('sedes',    sede_id);

    const payload = {
      cedula,
      nombre_completo,
      rol: rol || null, // Aseguramos que el rol sea nulo si no se envía
      empresa_id: empresaUuid,
      sede_id: sedeUuid,
      celular: celular || null,
      correo_electronico: correo_electronico || null,
      fecha_contratacion: fecha_contratacion || null,
      estado: 'activo'
    };

    const { data } = await supabaseAxios.post('/empleados', [payload]);
    res.status(201).json(data[0]);
  } catch (e) {
    // Cédula duplicada: PostgREST devuelve el código 23505 en el body del error.
    if (e.response?.data?.code === '23505') {
      return res.status(409).json({ message: 'Ya existe un empleado con esta cédula.' });
    }
    console.error(e);
    res.status(500).json({ message: 'Error al crear el empleado', error: e.message });
  }
};

/**
 * Endpoint para la carga masiva de empleados a través de un archivo CSV/Excel.
 * Ahora maneja la nueva estructura del Excel.
 */
export const uploadEmpleados = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: 'No se encontró ningún archivo.' });
    }
    
    const parsedData = await parseFile(file);

    const empleadosToProcess = parsedData.map(row => ({
        celular: row['CELULAR'] || null,
        nombre_completo: row['NOMBRE'] || null,
        cedula: String(row['CEDULA']), 
        sede_id: row['SEDE'] || null,
        correo_electronico: row['CORREO ELECTRONICO'] || null,
        fecha_contratacion: excelDateToJSDate(row['FECHA CONTRATACION']) || null
    }));

    // Obtener todas las cédulas de los empleados existentes
    const { data: existingEmpleados } = await supabaseAxios.get('/empleados?select=cedula');
    const existingCedulas = new Set(existingEmpleados.map(emp => emp.cedula));

    const nuevosEmpleados = [];
    const empleadosActualizados = [];

    await Promise.all(empleadosToProcess.map(async (emp) => {
        // Asumiendo que todos los empleados pertenecen a 'construahorro'
        const empresaUuid = await findOrCreateId('empresas', 'construahorro');
        const sedeUuid = await findOrCreateId('sedes', emp.sede_id);
        
        const empleadoData = {
            cedula: emp.cedula,
            nombre_completo: emp.nombre_completo,
            rol: null, // El rol ahora es nulo, ya que no se proporciona
            celular: emp.celular,
            sede_id: sedeUuid,
            correo_electronico: emp.correo_electronico,
            fecha_contratacion: emp.fecha_contratacion,
            empresa_id: empresaUuid,
            estado: 'activo'
        };

        if (existingCedulas.has(emp.cedula)) {
            empleadosActualizados.push(empleadoData);
        } else {
            nuevosEmpleados.push(empleadoData);
        }
        return empleadoData;
    }));

    let nuevos = 0;
    let actualizados = 0;

    if (nuevosEmpleados.length > 0) {
        const { error } = await supabaseAxios.post(
            '/empleados', 
            nuevosEmpleados,
            { params: { on_conflict: 'cedula' } }
        );
        if (error) throw error;
        nuevos = nuevosEmpleados.length;
    }
    
    if (empleadosActualizados.length > 0) {
        await Promise.all(empleadosActualizados.map(async (emp) => {
            const { error } = await supabaseAxios.patch(`/empleados?cedula=eq.${emp.cedula}`, emp);
            if (error) throw error;
        }));
        actualizados = empleadosActualizados.length;
    }
    
    res.status(200).json({
      message: 'Empleados procesados con éxito.',
      nuevos,
      actualizados
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error al procesar el archivo', error: e.message });
  }
};

/**
 * Endpoint para cambiar la sede de un empleado.
 * Acepta sede_id como UUID o como nombre (lo resuelve igual que en el alta).
 */
export const updateEmpleadoSede = async (req, res) => {
  const { id } = req.params;
  const { sede_id } = req.body;
  if (!sede_id) {
    return res.status(400).json({ message: 'sede_id es requerido.' });
  }
  try {
    const sedeUuid = await findOrCreateId('sedes', sede_id);
    const { error } = await supabaseAxios.patch(`/empleados?id=eq.${id}`, {
      sede_id: sedeUuid,
    });
    if (error) throw error;
    res.json({ message: 'Sede del empleado actualizada.', id, sede_id: sedeUuid });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ message: 'Error al cambiar la sede del empleado', error: e.message });
  }
};

/**
 * Endpoint para actualizar los datos básicos de un empleado.
 * Permite editar cédula, nombre, correo, celular, rol y fecha de contratación.
 * Solo actualiza los campos que llegan en el body (PATCH parcial).
 */
export const updateEmpleadoDatos = async (req, res) => {
  const { id } = req.params;
  const { cedula, nombre_completo, correo_electronico, celular, rol, fecha_contratacion } = req.body;

  // Construimos el payload solo con los campos enviados, para no pisar con null
  // lo que el cliente no quiso tocar.
  const payload = {};
  if (cedula !== undefined) payload.cedula = String(cedula).trim();
  if (nombre_completo !== undefined) payload.nombre_completo = nombre_completo;
  if (correo_electronico !== undefined) payload.correo_electronico = correo_electronico || null;
  if (celular !== undefined) payload.celular = celular || null;
  if (rol !== undefined) payload.rol = rol || null;
  if (fecha_contratacion !== undefined) payload.fecha_contratacion = fecha_contratacion || null;

  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ message: 'No se enviaron campos para actualizar.' });
  }

  if (payload.cedula === '') {
    return res.status(400).json({ message: 'La cédula no puede quedar vacía.' });
  }
  if (payload.nombre_completo !== undefined && !String(payload.nombre_completo).trim()) {
    return res.status(400).json({ message: 'El nombre no puede quedar vacío.' });
  }

  try {
    const { data } = await supabaseAxios.patch(
      `/empleados?id=eq.${id}&select=*`,
      payload,
      { headers: { Prefer: 'return=representation' } }
    );
    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'Empleado no encontrado.' });
    }
    res.json({ message: 'Datos del empleado actualizados.', empleado: data[0] });
  } catch (e) {
    // Cédula duplicada: PostgREST devuelve el código 23505 en el body del error.
    if (e.response?.data?.code === '23505') {
      return res.status(409).json({ message: 'Ya existe otro empleado con esa cédula.' });
    }
    console.error(e);
    res.status(500).json({ message: 'Error al actualizar los datos del empleado', error: e.message });
  }
};

/**
 * Endpoint para actualizar el estado de un empleado (activar/desactivar).
 */
export const toggleEmpleadoStatus = async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;
  
  if (estado !== 'activo' && estado !== 'inactivo') {
    return res.status(400).json({ message: 'El estado proporcionado no es válido.' });
  }
  
  try {
    const { data, error } = await supabaseAxios.patch(`/empleados?id=eq.${id}`, { estado });
    
    if (error) throw error;
    
    res.json({ message: 'Estado del empleado actualizado con éxito.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error al actualizar el estado del empleado', error: e.message });
  }
};