"use client";

import { FC, useMemo } from 'react';

interface MonthlyData {
  name: string;
  [key: string]: number | string;
}

interface MonthlyDataTableProps {
  title: string;
  data: MonthlyData[];
  columns: { key: string; label: string }[];
  fileName: string;
}

const MonthlyDataTable: FC<MonthlyDataTableProps> = ({ title, data, columns, fileName }) => {

  const totals = useMemo(() => {
    const totalsRow: MonthlyData = { name: '合計' };
    columns.slice(1).forEach(col => {
      totalsRow[col.key] = data.reduce((sum, row) => sum + (Number(row[col.key]) || 0), 0);
    });
    return totalsRow;
  }, [data, columns]);

  const handleDownload = () => {
    const headers = columns.map(c => c.label);
    const csvRows = [headers.join(',')];

    for (const row of data) {
      const values = columns.map(col => row[col.key]);
      csvRows.push(values.join(','));
    }
    
    // Add totals row to CSV
    const totalValues = columns.map(col => totals[col.key]);
    csvRows.push(totalValues.join(','));


    const csvString = csvRows.join('\n');
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md mt-4">
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-lg font-semibold">{title}</h4>
        <button
          onClick={handleDownload}
          className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
        >
          CSVダウンロード
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              {columns.map(col => (
                <th key={col.key} scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-black divide-y divide-gray-200 dark:divide-gray-700">
            {data.map((row, index) => (
              <tr key={index}>
                {columns.map(col => (
                  <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {typeof row[col.key] === 'number' ? (row[col.key] as number).toLocaleString() : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 dark:bg-gray-900">
            <tr>
              {columns.map(col => (
                <th key={col.key} scope="row" className="px-6 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-200">
                  {typeof totals[col.key] === 'number' ? (totals[col.key] as number).toLocaleString() : totals[col.key]}
                </th>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default MonthlyDataTable;