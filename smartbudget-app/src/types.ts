// 1. Tipo estricto para las categorías
export type CategoriaGasto = 'Comida' | 'Transporte' | 'Ocio' | 'Fijos';

// 2. Estructura de la semana de presupuesto
export interface PresupuestoSemanal {
  id: string;
  fechaInicio: string; 
  fechaFin: string;    
  presupuestoTotal: number;
}

// 3. Estructura de cada gasto individual
export interface Gasto {
  id: string;
  semanaId: string;
  monto: number;
  categoria: CategoriaGasto;
  concepto: string;
  fechaRegistro: string;
}

