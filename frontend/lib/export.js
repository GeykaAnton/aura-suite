// Exportación de reportes a Excel (.xlsx) y PDF. Se ejecuta en el navegador.
import { CATEGORY_LABELS, METHOD_LABELS, STATUS_LABELS, dateTime, label } from './format';

const nf = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function exportExcel(rows, summary, range) {
  const { default: writeXlsxFile } = await import('write-excel-file');
  const bold = (value) => ({ type: String, value, fontWeight: 'bold' });
  const num = (value) => ({ type: Number, value: Number(value), format: '#,##0.00' });
  const str = (value) => ({ type: String, value: value ?? '' });

  const data = [
    [bold(`Aura Suite · Reporte ${range.from} a ${range.to}`)],
    [str('Ingresos (USD)'), num(summary.ingresos)],
    [str('Egresos (USD)'), num(summary.egresos)],
    [str('Neto (USD)'), num(summary.neto)],
    [str('Por cobrar / fiado (USD)'), num(summary.porCobrar)],
    [],
    ['Fecha', 'Tipo', 'Estado', 'Categoría', 'Descripción', 'Cliente/Proveedor', 'Medio de pago', 'Monto', 'Moneda', 'Tasa Bs/$', 'Monto USD', 'Monto Bs'].map(bold),
    ...rows.map((t) => [
      str(dateTime(t.occurred_at)),
      str(t.type === 'ingreso' ? 'Ingreso' : 'Egreso'),
      str(label(STATUS_LABELS, t.status)),
      str(label(CATEGORY_LABELS, t.category_slug)),
      str(t.description),
      str(t.counterparty),
      str(label(METHOD_LABELS, t.payment_method)),
      num(t.amount),
      str(t.currency),
      num(t.rate_used),
      num(t.amount_usd),
      num(t.amount_ves),
    ]),
  ];

  await writeXlsxFile(data, {
    columns: [24, 10, 18, 22, 36, 22, 18, 12, 8, 10, 12, 14].map((width) => ({ width })),
    fileName: `aura-reporte-${range.from}_a_${range.to}.xlsx`,
  });
}
export async function exportPdf(rows, summary, range, businessName) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFontSize(18);
  doc.text('Aura Suite · Reporte financiero', 14, 16);
  doc.setFontSize(10);
  doc.text(`${businessName ?? ''}  ·  ${range.from} a ${range.to}  ·  Cifras en USD (equivalente a la tasa del día de cada registro)`, 14, 23);
  doc.text(
    `Ingresos: $${nf.format(summary.ingresos)}   Egresos: $${nf.format(summary.egresos)}   Neto: $${nf.format(summary.neto)}   Por cobrar: $${nf.format(summary.porCobrar)}`,
    14, 30,
  );

  autoTable(doc, {
    startY: 36,
    head: [['Fecha', 'Tipo', 'Estado', 'Categoría', 'Descripción', 'Medio', 'Monto', 'USD', 'Bs']],
    body: rows.map((t) => [
      dateTime(t.occurred_at), t.type === 'ingreso' ? 'Ingreso' : 'Egreso', label(STATUS_LABELS, t.status),
      label(CATEGORY_LABELS, t.category_slug), t.description ?? '', label(METHOD_LABELS, t.payment_method),
      `${nf.format(t.amount)} ${t.currency}`, nf.format(t.amount_usd), nf.format(t.amount_ves),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [219, 39, 119] },
    columnStyles: { 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
  });

  doc.save(`aura-reporte-${range.from}_a_${range.to}.pdf`);
}

