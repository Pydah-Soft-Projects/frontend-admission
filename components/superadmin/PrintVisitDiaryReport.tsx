'use client';

import React, { useMemo } from 'react';
import { format } from 'date-fns';

interface Props {
  generatedAt: string;
  filters: {
    startDate: string;
    endDate: string;
    proName?: string;
  };
  data: any[]; // Array of flat visit records
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: '8px',
  marginBottom: '20px',
  fontSize: '10px',
};

const thTdStyle: React.CSSProperties = {
  border: '1px solid #000',
  padding: '6px 8px',
  textAlign: 'left',
};

const headerThStyle: React.CSSProperties = {
  ...thTdStyle,
  backgroundColor: '#f8fafc',
  fontWeight: 'bold',
  textTransform: 'uppercase',
  fontSize: '9px',
  color: '#475569',
};

export default function PrintVisitDiaryReport({
  generatedAt,
  filters,
  data,
}: Props) {
  // Group data by PRO Name and sort within each group
  const groupedData = useMemo(() => {
    const groups: Record<string, { 
      empNo: string; 
      department: string; 
      records: any[];
    }> = {};
    
    data.forEach(item => {
      const pro = item.proName || 'Unassigned';
      if (!groups[pro]) {
        groups[pro] = {
          empNo: item.empNo || '-',
          department: item.department || '-',
          records: []
        };
      }
      groups[pro].records.push(item);
    });

    // Sort records within each PRO group: Mandal -> Village -> Date
    Object.values(groups).forEach(group => {
      group.records.sort((a, b) => {
        const mandalComp = (a.mandal || '').localeCompare(b.mandal || '');
        if (mandalComp !== 0) return mandalComp;
        
        const villageComp = (a.village || '').localeCompare(b.village || '');
        if (villageComp !== 0) return villageComp;
        
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
    });
    
    return groups;
  }, [data]);

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', color: '#0f172a', padding: '15px' }}>
      <div style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>PRO Visit Diary Report</h1>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '6px' }}>
          <div>
            <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>
              <strong>Period:</strong> {format(new Date(filters.startDate + 'T12:00:00'), 'dd-MM-yyyy')} to {format(new Date(filters.endDate + 'T12:00:00'), 'dd-MM-yyyy')}
            </p>
            {filters.proName && (
              <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#64748b' }}>
                <strong>PRO Officer:</strong> {filters.proName}
              </p>
            )}
          </div>
          <p style={{ margin: 0, fontSize: '9px', color: '#94a3b8' }}>Generated: {generatedAt}</p>
        </div>
      </div>

      {Object.keys(groupedData).length > 0 ? (
        Object.entries(groupedData).map(([proName, proData], proIdx) => (
          <div key={proIdx} style={{ marginBottom: '30px' }}>
            <div style={{ 
              backgroundColor: '#f1f5f9', 
              padding: '6px 10px', 
              borderRadius: '4px', 
              marginBottom: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
                <h2 style={{ margin: 0, fontSize: '12px', fontWeight: 'bold', color: '#1e293b' }}>
                  {proName}
                </h2>
                <span style={{ fontSize: '10px', color: '#64748b', backgroundColor: '#fff', padding: '1px 6px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                  Emp No: {proData.empNo}
                </span>
                <span style={{ fontSize: '10px', color: '#64748b', backgroundColor: '#fff', padding: '1px 6px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                  Dept: {proData.department}
                </span>
              </div>
              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>
                {proData.records.length} Visits
              </span>
            </div>

            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...headerThStyle, width: '30px' }}>#</th>
                  <th style={{ ...headerThStyle, width: '70px' }}>Date</th>
                  <th style={headerThStyle}>Student Name</th>
                  <th style={headerThStyle}>Phone</th>
                  <th style={headerThStyle}>Mandal</th>
                  <th style={headerThStyle}>Village/Location</th>
                  <th style={{ ...headerThStyle, width: '100px' }}>Visit Status</th>
                </tr>
              </thead>
              <tbody>
                {proData.records.map((row, idx) => (
                  <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? 'transparent' : '#f8fafc' }}>
                    <td style={{ ...thTdStyle, textAlign: 'center', color: '#000' }}>{idx + 1}</td>
                    <td style={thTdStyle}>{format(new Date(row.date + 'T12:00:00'), 'dd MMM yy')}</td>
                    <td style={thTdStyle}><strong>{row.studentName}</strong></td>
                    <td style={thTdStyle}>{row.phone}</td>
                    <td style={thTdStyle}>{row.mandal}</td>
                    <td style={thTdStyle}>{row.village}</td>
                    <td style={thTdStyle}>
                      <span style={{ 
                        fontWeight: 'bold', 
                        color: row.visitStatus === 'Interested' ? '#059669' : 
                               row.visitStatus === 'Not Interested' ? '#dc2626' : 
                               row.visitStatus === 'Confirmed' ? '#2563eb' : '#475569'
                      }}>
                        {row.visitStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      ) : (
        <div style={{ textAlign: 'center', padding: '60px', border: '1px dashed #e2e8f0', borderRadius: '12px', color: '#94a3b8' }}>
          <p>No visit records found for the selected criteria.</p>
        </div>
      )}

      <div style={{ marginTop: '20px', paddingTop: '12px', borderTop: '1px solid #e2e8f0', fontSize: '10px', color: '#94a3b8', textAlign: 'center' }}>
        <p>© {new Date().getFullYear()} Admission Management System • Confidential Report</p>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { padding: 0; margin: 0; }
          @page { margin: 1.5cm; }
          .no-print { display: none !important; }
          h2 { page-break-after: avoid; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
        }
      `}} />
    </div>
  );
}
