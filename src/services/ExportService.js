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
