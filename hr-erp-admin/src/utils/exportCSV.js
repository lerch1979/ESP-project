/**
 * Export an array of objects to a CSV file and trigger browser download.
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filename - File name without extension
 * @param {Array<string>} [columns] - Optional ordered column list (defaults to all keys from first row)
 */
export const exportToCSV = (data, filename, columns) => {
  if (!data || data.length === 0) {
    console.warn('exportToCSV: No data to export');
    return;
  }

  const headers = columns || Object.keys(data[0]);

  const escape = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csv = [
    headers.join(','),
    ...data.map(row => headers.map(h => escape(row[h])).join(',')),
  ].join('\n');

  const BOM = '\uFEFF'; // UTF-8 BOM for Excel compatibility
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Format a number for display (Hungarian locale).
 */
export const formatNumber = (val, decimals = 0) => {
  if (val === null || val === undefined) return '—';
  return Number(val).toLocaleString('hu-HU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

/**
 * Format a date for display (Hungarian locale).
 */
export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' });
};
