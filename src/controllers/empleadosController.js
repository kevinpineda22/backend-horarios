// src/controllers/empleadosController.js
import { supabaseAxios } from '../services/supabaseAxios.js';
import { Buffer } from 'buffer';
import xlsx from 'xlsx';

// Lógica para parsear archivos CSV o XLSX usando la librería 'xlsx'.
const parseFile = async (file) => {
  return new Promise((resolve, reject) => {
    try {
      const workbook = xlsx.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet);
      resolve(data);
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
 */
export const createEmpleado = async (req, res) => {
  try {
    const { cedula, nombre_completo, rol, empresa_id, sede_id } = req.body;

    const empresaUuid = await findOrCreateId('empresas', empresa_id);
    const sedeUuid    = await findOrCreateId('sedes',    sede_id);

    const payload = {
      cedula,
      nombre_completo,
      rol,
      empresa_id: empresaUuid,
      sede_id: sedeUuid,
      estado: 'activo'
    };

    const { data, error } = await supabaseAxios.post('/empleados', [payload]);
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ message: 'Ya existe un empleado con esta cédula.' });
      }
      throw error;
    }
    res.status(201).json(data[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error al crear el empleado', error: e.message });
  }
};

/**
 * Endpoint para la carga masiva de empleados a través de un archivo CSV/Excel.
 */
export const uploadEmpleados = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: 'No se encontró ningún archivo.' });
    }
    
    const empleadosToInsert = await parseFile(file);

    // Obtener todas las cédulas de los empleados existentes
    const { data: existingEmpleados } = await supabaseAxios.get('/empleados?select=cedula');
    const existingCedulas = new Set(existingEmpleados.map(emp => emp.cedula));

    const nuevosEmpleados = [];
    const empleadosActualizados = [];

    const empleadosWithIds = await Promise.all(empleadosToInsert.map(async (emp) => {
        const empresaUuid = await findOrCreateId('empresas', emp.empresa_id);
        const sedeUuid = await findOrCreateId('sedes', emp.sede_id);
        
        const empleadoData = {
            cedula: emp.cedula,
            nombre_completo: emp.nombre_completo,
            rol: emp.rol,
            empresa_id: empresaUuid,
            sede_id: sedeUuid,
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

    // Insertar nuevos empleados
    if (nuevosEmpleados.length > 0) {
        const { error } = await supabaseAxios.post(
            '/empleados', 
            nuevosEmpleados,
            {
              params: {
                on_conflict: 'cedula'
              }
            }
        );
        if (error) throw error;
        nuevos = nuevosEmpleados.length;
    }
    
    // Actualizar empleados existentes
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