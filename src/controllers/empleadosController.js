// src/controllers/empleadosController.js
import { supabaseAxios } from '../services/supabaseAxios.js';
import { Buffer } from 'buffer';

// Lógica para parsear archivos CSV o XLSX.
// Nota: Deberás instalar librerías como 'csv-parser' o 'xlsx'
// para manejar archivos de producción. Este es un ejemplo simplificado.
const parseFile = async (file) => {
  return new Promise((resolve, reject) => {
    // Si el archivo es un buffer (como en Multer), lo procesamos.
    // Aquí se asume que el archivo tiene un formato que se puede convertir a string.
    try {
      const data = file.buffer.toString('utf8');
      
      // En este ejemplo, asumimos que es un CSV con una estructura conocida.
      // En una aplicación real, usarías una librería de parseo.
      const lines = data.trim().split('\n');
      const headers = lines[0].split(',');
      const result = lines.slice(1).map(line => {
        const values = line.split(',');
        return headers.reduce((obj, header, index) => {
          obj[header.trim()] = values[index].trim();
          return obj;
        }, {});
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
const findOrCreateId = async (tableName, name) => {
    if (!name) return null;
    try {
        const { data: existingData, error } = await supabaseAxios.get(`/${tableName}?select=id&nombre=eq.${name}`);
        if (error) throw error;
        
        if (existingData && existingData.length > 0) {
            return existingData[0].id;
        } else {
            const { data: newData, error: createError } = await supabaseAxios.post(`/${tableName}`, [{ nombre: name }]);
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
    const { data, error } = await supabaseAxios.get('/empleados?select=*&order=nombre_completo.asc');
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
    
    // Busca o crea la empresa y la sede para obtener los IDs
    const empresaUuid = await findOrCreateId('empresas', empresa_id);
    const sedeUuid = await findOrCreateId('sedes', sede_id);
    
    const payload = {
        cedula,
        nombre_completo,
        rol,
        empresa_id: empresaUuid,
        sede_id: sedeUuid,
        estado: 'activo'
    };
    
    // Realiza la inserción en la tabla de 'empleados'
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

    // Usa upsert para insertar o actualizar registros, evitando el error de duplicado.
    const { data, error } = await supabaseAxios.post(
      '/empleados', 
      empleadosToInsert.map(emp => ({ ...emp, estado: 'activo' })),
      {
        params: {
          on_conflict: 'cedula' // Clave única para el upsert
        }
      }
    );

    if (error) {
        if (error.code === '23505') {
            return res.status(409).json({ message: 'Ya existe un empleado con esa cédula.' });
        }
        throw error;
    }
    
    let nuevos = 0;
    let actualizados = 0;
    nuevos = data.length;
    
    res.status(200).json({
      message: 'Empleados procesados con éxito.',
      nuevos,
      actualizados: 0 // Valor de marcador de posición
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
