import Swal from "sweetalert2";

// Configuración personalizada para desactivar animaciones
// Esto soluciona el problema de alertas congeladas en Windows con animaciones desactivadas
const MySwal = Swal.mixin({
  showClass: {
    popup: "", // Desactiva animación de entrada
    backdrop: "swal2-backdrop-show", // Mantiene el backdrop visible pero sin animación compleja
    icon: "", // Desactiva animación de icono
  },
  hideClass: {
    popup: "", // Desactiva animación de salida
  },
  // Asegura que el backdrop no tenga transiciones que puedan fallar
  backdrop: `
    rgba(0,0,123,0.4)
    left top
    no-repeat
  `,
});

export default MySwal;
