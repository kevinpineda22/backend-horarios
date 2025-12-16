// src/hooks/useEmployeeData.js
import { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import { api } from "../../../services/apiHorarios"; // Asegúrate que la ruta a 'services' sea correcta

export function useEmployeeData(autoSelectFirst = false) {
  const [allEmpleados, setAllEmpleados] = useState([]);
  const [empleados, setEmpleados] = useState([]); // Lista filtrada
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingEmpleados, setLoadingEmpleados] = useState(true);
  const [visibleEmployees, setVisibleEmployees] = useState(10);
  const [selectedEmployee, setSelectedEmployee] = useState(null); // Estado de selección

  // Función para cargar empleados
  const fetchEmpleados = useCallback(async () => {
    setLoadingEmpleados(true);
    setSelectedEmployee(null); // Resetear selección al recargar
    try {
      const { data } = await api.get("/empleados", {
        params: { estado: "eq.activo", order: "nombre_completo.asc" },
      });
      const employeeList = data || [];
      setAllEmpleados(employeeList);
      setEmpleados(employeeList); // Inicialmente mostrar todos

      if (autoSelectFirst && employeeList.length === 1) {
        setSelectedEmployee(employeeList[0]);
      }
    } catch (err) {
      console.error("Error al cargar empleados:", err);
      toast.error(
        "Error al cargar empleados: " +
          (err.response?.data?.message || err.message)
      );
      setAllEmpleados([]);
      setEmpleados([]);
    } finally {
      setLoadingEmpleados(false);
    }
  }, [autoSelectFirst]);

  // Carga inicial
  useEffect(() => {
    fetchEmpleados();
  }, [fetchEmpleados]);

  // Filtrar al buscar
  useEffect(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      setEmpleados(allEmpleados);
      setVisibleEmployees(10);
      return;
    }
    const filtered = allEmpleados.filter(
      (emp) =>
        (emp.cedula || "").includes(query) ||
        (emp.nombre_completo || "").toLowerCase().includes(query)
    );
    setEmpleados(filtered);
    setVisibleEmployees(10);
  }, [searchQuery, allEmpleados]);

  const handleLoadMore = useCallback(() => {
    setVisibleEmployees((v) => v + 10);
  }, []);

  const handleSelectEmployee = useCallback((employee) => {
    setSelectedEmployee(employee);
    setSearchQuery("");
  }, []);

  const handleResetSelection = useCallback(() => {
    setSelectedEmployee(null);
    setSearchQuery(""); // Limpiar búsqueda
    setEmpleados(allEmpleados); // Mostrar todos de nuevo
    setVisibleEmployees(10);
  }, [allEmpleados]);

  return {
    // Estado
    empleados: empleados.slice(0, visibleEmployees), // Solo los visibles
    searchQuery,
    loadingEmpleados,
    selectedEmployee,
    hasMoreEmployees: empleados.length > visibleEmployees,

    // Handlers
    setSearchQuery,
    handleLoadMore,
    handleSelectEmployee,
    handleResetSelection,
    refreshEmployees: fetchEmpleados,
  };
}
