// Exportación de reportes de incidencias a Excel (.xlsx) y PDF, generados en el navegador.
// Las librerías se cargan solo cuando se pide una exportación (import dinámico), así no pesan en la carga inicial.
import { formatDateTime } from './IncidentService.js'

const COLUMNS = [
  { title: 'N.º', width: 7, value: (i) => i.id },
  { title: 'Título', width: 40, value: (i) => i.titulo },
  { title: 'Departamento', width: 20, value: (i) => i.departamento },
  { title: 'Categoría', width: 20, value: (i) => i.categoria },
  { title: 'Prioridad', width: 11, value: (i) => i.prioridad },
  { title: 'Estado', width: 12, value: (i) => i.estado },
  { title: 'Solicitante', width: 22, value: (i) => i.solicitante },
  { title: 'Agente', width: 22, value: (i) => i.agente || 'Sin asignar' },
  { title: 'Registrada', width: 20, value: (i) => formatDateTime(i.fechaCreacion) },
  { title: 'SLA', width: 12, value: (i) => (i.sla.resolucionVencida ? 'Vencido' : 'En tiempo') }
]

function fileStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`
}

function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const link = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// incidents: la lista ya filtrada; filters: texto que describe los filtros aplicados (para el encabezado).
export async function exportIncidentsToExcel(incidents, { filters = '' } = {}) {
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  const header = COLUMNS.map((c) => ({ value: c.title, fontWeight: 'bold', backgroundColor: '#DBEAFE' }))
  const rows = incidents.map((incident) => COLUMNS.map((c) => {
    const value = c.value(incident)
    return { value, type: typeof value === 'number' ? Number : String }
  }))
  const sheetData = [
    [{ value: 'Reporte de incidencias · TickOps', fontWeight: 'bold', columnSpan: COLUMNS.length }],
    [{ value: `Generado: ${formatDateTime(new Date())} · ${incidents.length} incidencia(s)${filters ? ` · Filtros: ${filters}` : ''}`, columnSpan: COLUMNS.length }],
    [null],
    header,
    ...rows
  ]
  const blob = await writeExcelFile(sheetData, { sheet: 'Incidencias', columns: COLUMNS.map((c) => ({ width: c.width })), stickyRowsCount: 4 }).toBlob()
  download(blob, `incidencias_${fileStamp()}.xlsx`)
}

export async function exportIncidentsToPdf(incidents, { filters = '', summary = [] } = {}) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()

  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(23, 32, 51)
  doc.text('Reporte de incidencias', 40, 44)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100, 116, 139)
  doc.text(`TickOps · Generado el ${formatDateTime(new Date())} · ${incidents.length} incidencia(s)`, 40, 60)
  if (filters) doc.text(`Filtros: ${filters}`, 40, 73, { maxWidth: width - 80 })
  if (summary.length) doc.text(summary.join('   ·   '), 40, filters ? 86 : 73, { maxWidth: width - 80 })

  autoTable(doc, {
    startY: filters || summary.length ? 98 : 80,
    head: [COLUMNS.map((c) => c.title)],
    body: incidents.map((incident) => COLUMNS.map((c) => String(c.value(incident)))),
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    alternateRowStyles: { fillColor: [246, 248, 252] },
    columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 150 } },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      const page = doc.getCurrentPageInfo().pageNumber
      doc.setFontSize(8).setTextColor(148, 163, 184)
      doc.text(`Página ${page}`, width - 40, doc.internal.pageSize.getHeight() - 20, { align: 'right' })
    }
  })
  if (!incidents.length) doc.setFontSize(10).setTextColor(100, 116, 139).text('No hay incidencias con los filtros aplicados.', 40, 130)
  download(doc.output('blob'), `incidencias_${fileStamp()}.pdf`)
}

// Hoja estadística a Excel. rows: [{ nombre, a, b }] como arma StatsPanel; b solo existe al comparar dos rangos.
export async function exportStatisticsToExcel({ groupLabel, rows, totals, previousTotals = null, rangeLabel, previousRangeLabel = '' }) {
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  const compare = Boolean(previousTotals)
  const titles = [groupLabel, 'Resueltas', ...(compare ? ['Resueltas (comparado)', 'Diferencia'] : []), 'Creadas', '% en SLA', 'Horas prom. resolución', 'Abiertas ahora']
  const num = (value) => ({ value: value ?? '', type: typeof value === 'number' ? Number : String })
  const line = (name, a, b) => [
    { value: name, type: String },
    num(a?.resueltas ?? 0),
    ...(compare ? [num(b?.resueltas ?? 0), num((a?.resueltas ?? 0) - (b?.resueltas ?? 0))] : []),
    num(a?.creadas ?? 0),
    num(a?.porcentajeEnTiempo),
    num(a?.horasPromedio),
    num(a?.abiertas ?? b?.abiertas ?? 0)
  ]
  const span = titles.length
  const sheetData = [
    [{ value: 'Estadísticas de incidencias · TickOps', fontWeight: 'bold', columnSpan: span }],
    [{ value: `Generado: ${formatDateTime(new Date())} · Rango: ${rangeLabel}${compare ? ` · Comparado con: ${previousRangeLabel}` : ''}`, columnSpan: span }],
    [null],
    titles.map((title) => ({ value: title, fontWeight: 'bold', backgroundColor: '#DBEAFE' })),
    ...rows.map((row) => line(row.nombre, row.a, row.b)),
    line('TOTAL', { ...totals, abiertas: totals.abiertas }, previousTotals)
  ].map((row, index, all) => (index === all.length - 1 ? row.map((cell) => ({ ...cell, fontWeight: 'bold' })) : row))
  const blob = await writeExcelFile(sheetData, { sheet: 'Estadísticas', columns: titles.map((_, i) => ({ width: i === 0 ? 34 : 16 })), stickyRowsCount: 4 }).toBlob()
  download(blob, `estadisticas_${fileStamp()}.xlsx`)
}
