// src/App.tsx
import { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from './supabaseClient'; 
import type { Gasto, CategoriaGasto } from './types';

export default function App() {
  // --- 1. ESTADOS DE PERIODOS / SEMANAS ---
  const [semanaActiva, setSemanaActiva] = useState<string>(() => {
    return localStorage.getItem('smartbudget_semana_activa') || 'Julio 2026 - Sem 1';
  });
  
  // Lista de períodos disponibles (se alimenta dinámicamente y permite añadir nuevos)
  const [periodos, setPeriodos] = useState<string[]>(() => {
    const guardados = localStorage.getItem('smartbudget_periodos');
    return guardados ? JSON.parse(guardados) : ['Julio 2026 - Sem 1', 'Julio 2026 - Sem 2'];
  });

  const [nuevoPeriodoNombre, setNuevoPeriodoNombre] = useState<string>('');

  // --- 2. ESTADOS DE PRESUPUESTO ---
  // Guardamos los presupuestos mapeados por período: { 'Semana 1': 150, 'Semana 2': 200 }
  const [presupuestosPorPeriodo, setPresupuestosPorPeriodo] = useState<Record<string, number>>(() => {
    const guardados = localStorage.getItem('smartbudget_presupuestos_map');
    return guardados ? JSON.parse(guardados) : { 'Julio 2026 - Sem 1': 150.00, 'Julio 2026 - Sem 2': 150.00 };
  });

  const [editandoPresupuesto, setEditandoPresupuesto] = useState<boolean>(false);
  const [nuevoPresupuestoInput, setNuevoPresupuestoInput] = useState<string>('');

  // --- 3. ESTADOS DE GASTOS Y TEMA ---
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  
  const [esOscuro, setEsOscuro] = useState<boolean>(() => {
    return localStorage.getItem('smartbudget_tema') === 'dark';
  });

  // --- 4. ESTADOS DE FORMULARIO DE GASTOS ---
  const [nuevoMonto, setNuevoMonto] = useState<string>('');
  const [nuevaCategoria, setNuevaCategoria] = useState<CategoriaGasto>('Comida');
  const [nuevoConcepto, setNuevoConcepto] = useState<string>('');

  // --- 5. EFECTOS (Sincronización Local y Global) ---
  useEffect(() => {
    obtenerGastosDeSupabase();
  }, [semanaActiva]); // ¡Crucial! Cada vez que cambie la semana activa, recarga los gastos desde la nube.

  useEffect(() => {
    localStorage.setItem('smartbudget_semana_activa', semanaActiva);
  }, [semanaActiva]);

  useEffect(() => {
    localStorage.setItem('smartbudget_periodos', JSON.stringify(periodos));
  }, [periodos]);

  useEffect(() => {
    localStorage.setItem('smartbudget_presupuestos_map', JSON.stringify(presupuestosPorPeriodo));
  }, [presupuestosPorPeriodo]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (esOscuro) {
      root.classList.add('dark');
      localStorage.setItem('smartbudget_tema', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('smartbudget_tema', 'light');
    }
  }, [esOscuro]);

  // --- 6. OPERACIONES CLOUD (SUPABASE) ---
  const obtenerGastosDeSupabase = async () => {
    try {
      setCargando(true);
      const { data, error } = await supabase
        .from('gastos')
        .select('*')
        .eq('semana_id', semanaActiva) // FILTRADO REMOTO: Solo descarga los del período actual
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const gastosMapeados: Gasto[] = data.map(item => ({
          id: item.id,
          semanaId: item.semana_id,
          monto: parseFloat(item.monto),
          categoria: item.categoria as CategoriaGasto,
          concepto: item.concepto,
          fechaRegistro: item.fecha_registro
        }));
        setGastos(gastosMapeados);
      }
    } catch (error) {
      console.error("Error al obtener gastos:", error);
    } finally {
      setCargando(false);
    }
  };

  const handleAgregarGasto = async (e: React.FormEvent) => {
    e.preventDefault();
    const montoNumerico = parseFloat(nuevoMonto);
    if (isNaN(montoNumerico) || montoNumerico <= 0) return;

    const conceptoTexto = nuevoConcepto.trim() || 'Gasto sin concepto';
    const fechaActual = new Date().toLocaleDateString();

    try {
      const { data, error } = await supabase
        .from('gastos')
        .insert([
          {
            semana_id: semanaActiva, // Se asocia dinámicamente al período seleccionado
            monto: montoNumerico,
            categoria: nuevaCategoria,
            concepto: conceptoTexto,
            fecha_registro: fechaActual
          }
        ])
        .select();

      if (error) throw error;

      if (data && data[0]) {
        const nuevoGastoAgregado: Gasto = {
          id: data[0].id,
          semanaId: data[0].semana_id,
          monto: parseFloat(data[0].monto),
          categoria: data[0].categoria as CategoriaGasto,
          concepto: data[0].concepto,
          fechaRegistro: data[0].fecha_registro
        };
        
        setGastos([nuevoGastoAgregado, ...gastos]);
        setNuevoMonto(''); 
        setNuevoConcepto(''); 
      }
    } catch (error) {
      console.error("Error al insertar gasto:", error);
    }
  };

  const handleBorrarGasto = async (idParaBorrar: string) => {
    try {
      const { error } = await supabase
        .from('gastos')
        .delete()
        .eq('id', idParaBorrar);

      if (error) throw error;
      setGastos(gastos.filter(gasto => gasto.id !== idParaBorrar));
    } catch (error) {
      console.error("Error al borrar gasto:", error);
    }
  };

  // --- 7. CONTROL DE PERÍODOS NUEVOS ---
  const handleCrearPeriodo = (e: React.FormEvent) => {
    e.preventDefault();
    const nombreLimpio = nuevoPeriodoNombre.trim();
    if (!nombreLimpio || periodos.includes(nombreLimpio)) return;

    setPeriodos([...periodos, nombreLimpio]);
    setPresupuestosPorPeriodo({
      ...presupuestosPorPeriodo,
      [nombreLimpio]: 150.00 // Presupuesto base por defecto
    });
    setSemanaActiva(nombreLimpio); // Saltamos de inmediato al nuevo periodo
    setNuevoPeriodoNombre('');
  };

  const handleGuardarPresupuesto = (e: React.FormEvent) => {
    e.preventDefault();
    const valorNumerico = parseFloat(nuevoPresupuestoInput);
    if (!isNaN(valorNumerico) && valorNumerico >= 0) {
      setPresupuestosPorPeriodo({
        ...presupuestosPorPeriodo,
        [semanaActiva]: valorNumerico
      });
      setEditandoPresupuesto(false);
    }
  };

  // --- 8. CÁLCULOS SOBRE EL PERÍODO ACTIVO ---
  const presupuestoTotal = presupuestosPorPeriodo[semanaActiva] ?? 150.00;
  const totalGastado: number = gastos.reduce((acc, item) => acc + item.monto, 0);
  const disponible: number = presupuestoTotal - totalGastado;
  const porcentajeGastado: number = presupuestoTotal > 0 ? (totalGastado / presupuestoTotal) * 100 : 0;

  const gastosPorCategoria = gastos.reduce((acc, g) => {
    acc[g.categoria] = (acc[g.categoria] || 0) + g.monto;
    return acc;
  }, {} as Record<string, number>);

  // Semáforo dinámico
  let colorSemaforoText = esOscuro ? 'text-emerald-400 bg-emerald-950/40' : 'text-emerald-600 bg-emerald-50'; 
  let colorSemaforoBar = 'bg-emerald-500';
  if (porcentajeGastado >= 85) {
    colorSemaforoText = esOscuro ? 'text-rose-400 bg-rose-950/40' : 'text-rose-600 bg-rose-50';
    colorSemaforoBar = 'bg-rose-500';
  } else if (porcentajeGastado >= 60) {
    colorSemaforoText = esOscuro ? 'text-amber-400 bg-amber-950/40' : 'text-amber-600 bg-amber-50';
    colorSemaforoBar = 'bg-amber-500';
  }

  const exportarPDF = () => {
    const doc = new jsPDF('p', 'mm', 'letter');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("SmartBudget - Reporte Mensual / Semanal", 15, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Ciclo Auditado: ${semanaActiva}`, 15, 26);
    doc.text(`Generado el: ${new Date().toLocaleString()}`, 15, 31);
    doc.setFillColor(248, 250, 252);
    doc.rect(15, 37, 185, 24, "F");
    doc.setFont("helvetica", "bold");
    doc.text("MÉTRICAS DEL PERÍODO SELECCIONADO:", 20, 43);
    doc.setFont("helvetica", "normal");
    doc.text(`Presupuesto Asignado: $${presupuestoTotal.toFixed(2)}`, 20, 53);
    doc.text(`Total Consumido: $${totalGastado.toFixed(2)} (${porcentajeGastado.toFixed(1)}%)`, 85, 53);
    doc.text(`Balance de Cierre: $${disponible.toFixed(2)}`, 145, 53);

    const filasTabla = gastos.map(gasto => [
      gasto.fechaRegistro,
      gasto.concepto,
      gasto.categoria,
      `$${gasto.monto.toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: 69,
      head: [['Fecha de Registro', 'Concepto / Detalle', 'Clasificación', 'Monto Debitado']],
      body: filasTabla,
      headStyles: { fillColor: [30, 41, 59], fontStyle: 'bold' },
      theme: 'striped',
    });
    doc.save(`SmartBudget_${semanaActiva.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className={`min-h-screen flex font-sans antialiased transition-colors duration-200 ${esOscuro ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      
      {/* 1. SIDEBAR IZQUIERDO */}
      <aside className={`w-80 border-r p-6 flex flex-col justify-between hidden md:flex transition-colors duration-200 ${esOscuro ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="space-y-6">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-black text-xl text-white shadow-lg shadow-blue-600/20">S</div>
            <div>
              <h1 className={`text-lg font-bold tracking-tight ${esOscuro ? 'text-white' : 'text-slate-900'}`}>SmartBudget</h1>
              <p className="text-[11px] font-semibold text-emerald-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> Multi-cycle Version
              </p>
            </div>
          </div>

          {/* Modo Claro/Oscuro */}
          <div className={`p-1 rounded-xl flex border ${esOscuro ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
            <button onClick={() => setEsOscuro(false)} className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all ${!esOscuro ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>☀️ Claro</button>
            <button onClick={() => setEsOscuro(true)} className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all ${esOscuro ? 'bg-slate-800 text-blue-400 shadow-sm' : 'text-slate-500'}`}>🌙 Oscuro</button>
          </div>

          {/* SELECTOR DE PERÍODO CRÍTICO */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">Historial de Períodos</label>
            <select 
              value={semanaActiva} 
              onChange={(e) => setSemanaActiva(e.target.value)}
              className={`w-full p-2.5 border rounded-xl font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${esOscuro ? 'bg-slate-900 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
            >
              {periodos.map(p => (
                <option key={p} value={p}>📅 {p}</option>
              ))}
            </select>
          </div>

          {/* FORMULARIO CREAR NUEVA SEMANA */}
          <form onSubmit={handleCrearPeriodo} className={`p-3 border rounded-xl space-y-2 ${esOscuro ? 'bg-slate-900/40 border-slate-800' : 'bg-slate-50/60 border-slate-200'}`}>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Añadir Nuevo Ciclo</p>
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Ej. Agosto - Sem 1" 
                value={nuevoPeriodoNombre} 
                onChange={(e) => setNuevoPeriodoNombre(e.target.value)} 
                className={`flex-1 px-3 py-1.5 text-xs border rounded-lg focus:outline-none ${esOscuro ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
              />
              <button type="submit" className="px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs">+</button>
            </div>
          </form>

          {/* PRESUPUESTO ASIGNADO AL CICLO */}
          <div className={`border rounded-2xl p-4 ${esOscuro ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Presupuesto Asignado</p>
            {editandoPresupuesto ? (
              <form onSubmit={handleGuardarPresupuesto} className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1.5 text-slate-400 text-sm">$</span>
                  <input 
                    type="number" step="0.01" 
                    value={nuevoPresupuestoInput} 
                    onChange={(e) => setNuevoPresupuestoInput(e.target.value)} 
                    className={`w-full border pl-7 pr-3 py-1.5 rounded-xl font-bold text-sm focus:outline-none ${esOscuro ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                    autoFocus
                  />
                </div>
                <button type="submit" className="px-3 bg-emerald-600 text-white font-bold rounded-xl text-xs">✓</button>
              </form>
            ) : (
              <div className="flex justify-between items-baseline">
                <span className={`text-2xl font-black ${esOscuro ? 'text-white' : 'text-slate-900'}`}>${presupuestoTotal.toFixed(2)}</span>
                <button onClick={() => { setNuevoPresupuestoInput(presupuestoTotal.toString()); setEditandoPresupuesto(true); }} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">Editar</button>
              </div>
            )}
          </div>

          {/* Distribución del ciclo */}
          <div className="space-y-2.5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Gastos del Período</p>
            {['Comida', 'Transporte', 'Ocio', 'Fijos'].map((cat) => {
              const totalCat = gastosPorCategoria[cat] || 0;
              const porcCat = totalGastado > 0 ? (totalCat / totalGastado) * 100 : 0;
              return (
                <div key={cat} className={`p-2.5 rounded-xl border ${esOscuro ? 'bg-slate-900/30 border-slate-800/60' : 'bg-slate-50/40 border-slate-150'}`}>
                  <div className="flex justify-between text-xs font-medium mb-1">
                    <span className={esOscuro ? 'text-slate-300' : 'text-slate-600'}>{cat}</span>
                    <span className="text-slate-400">${totalCat.toFixed(2)}</span>
                  </div>
                  <div className={`w-full h-1 rounded-full overflow-hidden ${esOscuro ? 'bg-slate-800' : 'bg-slate-200'}`}>
                    <div className="bg-blue-600 h-full rounded-full" style={{ width: `${porcCat}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={`border-t pt-4 ${esOscuro ? 'border-slate-800' : 'border-slate-200'}`}>
          <button onClick={exportarPDF} disabled={gastos.length === 0} className={`w-full py-3 font-bold text-sm rounded-xl flex items-center justify-center gap-2 border transition-all active:scale-98 ${esOscuro ? 'bg-slate-800 text-white border-slate-700 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'}`}>
            📊 Exportar PDF de este Ciclo
          </button>
        </div>
      </aside>

      {/* 2. ÁREA DE TRABAJO PRINCIPAL */}
      <main className="flex-1 p-6 md:p-10 flex flex-col gap-8 max-w-7xl mx-auto w-full overflow-x-hidden">
        
        {/* Encabezado */}
        <div className={`flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b pb-6 ${esOscuro ? 'border-slate-800' : 'border-slate-200'}`}>
          <div>
            <h2 className={`text-3xl font-extrabold tracking-tight ${esOscuro ? 'text-white' : 'text-slate-900'}`}>{semanaActiva}</h2>
            <p className="text-sm text-slate-400 mt-1">Los datos se guardan y filtran de forma aislada en la base de datos remota.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${colorSemaforoText}`}>
              Consumido: {porcentajeGastado.toFixed(1)}%
            </span>
            <button onClick={obtenerGastosDeSupabase} className={`p-2 border rounded-xl ${esOscuro ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}>🔄</button>
          </div>
        </div>

        {/* METRICAS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className={`border rounded-2xl p-6 shadow-sm ${esOscuro ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Balance del Período</p>
            <p className={`text-4xl font-black mt-2 tracking-tight ${disponible < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>${disponible.toFixed(2)}</p>
            <div className={`w-full h-1.5 rounded-full mt-4 overflow-hidden ${esOscuro ? 'bg-slate-800' : 'bg-slate-100'}`}>
              <div className={`h-full ${colorSemaforoBar}`} style={{ width: `${Math.min(porcentajeGastado, 100)}%` }}></div>
            </div>
          </div>

          <div className={`border rounded-2xl p-6 shadow-sm ${esOscuro ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gastado en este Ciclo</p>
            <p className={`text-4xl font-black mt-2 tracking-tight ${esOscuro ? 'text-white' : 'text-slate-900'}`}>${totalGastado.toFixed(2)}</p>
            <p className="text-[11px] text-slate-400 mt-3">Exclusivo de este período</p>
          </div>

          <div className={`border rounded-2xl p-6 shadow-sm ${esOscuro ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Operaciones</p>
            <p className="text-4xl font-black mt-2 text-blue-600 dark:text-blue-400 tracking-tight">{gastos.length}</p>
            <p className="text-[11px] text-slate-400 mt-3">Registradas para {semanaActiva}</p>
          </div>
        </div>

        {/* FORMULARIO */}
        <div className={`border rounded-2xl p-6 shadow-sm ${esOscuro ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
          <h3 className={`text-base font-bold mb-4 flex items-center gap-2 ${esOscuro ? 'text-white' : 'text-slate-900'}`}>⚡ Cargar Gasto a {semanaActiva}</h3>
          <form onSubmit={handleAgregarGasto} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-2">Monto ($)</label>
              <input type="number" step="0.01" placeholder="0.00" value={nuevoMonto} onChange={(e) => setNuevoMonto(e.target.value)} className={`w-full p-3 border rounded-xl font-bold text-base focus:outline-none focus:ring-2 focus:ring-blue-500 ${esOscuro ? 'bg-slate-900 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-2">Clasificación</label>
              <select value={nuevaCategoria} onChange={(e) => setNuevaCategoria(e.target.value as CategoriaGasto)} className={`w-full p-3 border rounded-xl font-medium text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${esOscuro ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>
                <option value="Comida">🍔 Comida y Alimentos</option>
                <option value="Transporte">🚗 Movilidad y Transporte</option>
                <option value="Ocio">🎬 Entretenimiento y Ocio</option>
                <option value="Fijos">🏠 Servicios y Gastos Fijos</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-2">Concepto</label>
              <input type="text" placeholder="Ej. Uber o Supermercado" value={nuevoConcepto} onChange={(e) => setNuevoConcepto(e.target.value)} className={`w-full p-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${esOscuro ? 'bg-slate-900 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} />
            </div>
            <button type="submit" className="w-full p-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-all shadow-md active:scale-98">Registrar Transacción</button>
          </form>
        </div>

        {/* TABLA DE AUDITORÍA */}
        <div className={`border rounded-2xl overflow-hidden shadow-sm flex-1 flex flex-col ${esOscuro ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className={`p-5 border-b flex justify-between items-center ${esOscuro ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'}`}>
            <h3 className={`text-base font-bold ${esOscuro ? 'text-white' : 'text-slate-900'}`}>Desglose de Gastos del Período</h3>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`border-b text-xs font-bold uppercase tracking-wider ${esOscuro ? 'bg-slate-900/60 border-slate-800 text-slate-400' : 'bg-slate-50/70 border-slate-200 text-slate-500'}`}>
                  <th className="p-4 pl-6">Fecha</th>
                  <th className="p-4">Concepto</th>
                  <th className="p-4">Categoría</th>
                  <th className="p-4 text-right">Monto</th>
                  <th className="p-4 text-center pr-6">Acción</th>
                </tr>
              </thead>
              <tbody className={`divide-y text-sm ${esOscuro ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {cargando ? (
                  <tr><td colSpan={5} className="p-10 text-center text-slate-400 font-medium animate-pulse">Filtrando registros en la nube...</td></tr>
                ) : gastos.length === 0 ? (
                  <tr><td colSpan={5} className="p-10 text-center text-slate-400">No hay gastos guardados para {semanaActiva}.</td></tr>
                ) : (
                  gastos.map((gasto) => (
                    <tr key={gasto.id} className={`transition-colors ${esOscuro ? 'hover:bg-slate-900/40' : 'hover:bg-slate-50/50'}`}>
                      <td className="p-4 pl-6 font-medium text-slate-400">{gasto.fechaRegistro}</td>
                      <td className={`p-4 font-semibold ${esOscuro ? 'text-white' : 'text-slate-900'}`}>{gasto.concepto}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${esOscuro ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>{gasto.categoria}</span>
                      </td>
                      <td className={`p-4 text-right font-bold ${esOscuro ? 'text-slate-100' : 'text-slate-900'}`}>-${gasto.monto.toFixed(2)}</td>
                      <td className="p-4 text-center pr-6">
                        <button onClick={() => handleBorrarGasto(gasto.id)} className={`px-3 py-1.5 font-bold rounded-lg border text-xs transition-colors ${esOscuro ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-900/50' : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200'}`}>Eliminar</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  );
}