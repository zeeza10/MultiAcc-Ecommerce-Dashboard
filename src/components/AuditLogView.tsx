import React, { useState, useEffect } from 'react';
import { History, Search, Download, ShieldCheck, Eye } from 'lucide-react';
import { api } from '../services/api';
import { AuditLogEntry, User, SystemConfig } from '../types';

interface AuditLogViewProps {
  currentUser: User;
  config: SystemConfig;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ currentUser, config }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  useEffect(() => {
    loadLogs();
  }, [currentUser.id]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await api.getAuditLogs();
      setLogs(res.logs);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = logs.filter(
    (l) =>
      !search ||
      l.entity.toLowerCase().includes(search.toLowerCase()) ||
      l.actorName.toLowerCase().includes(search.toLowerCase()) ||
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      (l.notes && l.notes.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">System Audit Log</h1>
          <p className="text-xs text-gray-500">
            Append-only security and operational audit trail preserving who, when, what, before and after snapshots (SRS FR-AUD-01, AT-14).
          </p>
        </div>

        <div className="flex items-center space-x-1.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-md font-semibold">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>7-Year Retention Policy Active (SEC-08)</span>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-2xs flex items-center justify-between text-xs">
        <div className="flex-1 max-w-md relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search audit trail by actor, action, entity..."
            className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Timestamp (UTC)</th>
                <th className="py-2.5 px-3">Actor / User</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3">Target Entity</th>
                <th className="py-2.5 px-3">Entity ID</th>
                <th className="py-2.5 px-3">Audit Details</th>
                <th className="py-2.5 px-3 text-right">Snapshots</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 transition">
                  <td className="py-2.5 px-3 font-mono text-[11px] text-gray-500">
                    {log.timestamp.replace('T', ' ').split('.')[0]}
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-gray-900">{log.actorName}</td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        log.action === 'CREATE'
                          ? 'bg-blue-100 text-blue-800'
                          : log.action === 'UPDATE'
                          ? 'bg-indigo-100 text-indigo-800'
                          : log.action === 'VOID'
                          ? 'bg-rose-100 text-rose-800'
                          : log.action === 'APPROVE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-medium text-gray-900">{log.entity}</td>
                  <td className="py-2.5 px-3 font-mono text-gray-500 text-[11px]">{log.entityId}</td>
                  <td className="py-2.5 px-3 text-gray-600">{log.notes || '—'}</td>
                  <td className="py-2.5 px-3 text-right">
                    {(log.beforeSnapshot || log.afterSnapshot) && (
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="px-2 py-1 text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded transition font-medium"
                      >
                        Inspect Diff
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedLog && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-gray-200 p-5 space-y-4 text-xs">
            <div className="flex justify-between items-center border-b border-gray-200 pb-3">
              <h3 className="text-sm font-bold text-gray-900">
                Audit Snapshot Diff: {selectedLog.entity} ({selectedLog.entityId})
              </h3>
              <button onClick={() => setSelectedLog(null)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="font-bold text-gray-700 block mb-1">Before Snapshot</span>
                <pre className="bg-slate-900 text-slate-100 p-3 rounded text-[10px] font-mono max-h-56 overflow-y-auto">
                  {selectedLog.beforeSnapshot
                    ? JSON.stringify(selectedLog.beforeSnapshot, null, 2)
                    : '// No prior snapshot (Create event)'}
                </pre>
              </div>

              <div>
                <span className="font-bold text-gray-700 block mb-1">After Snapshot</span>
                <pre className="bg-slate-900 text-emerald-300 p-3 rounded text-[10px] font-mono max-h-56 overflow-y-auto">
                  {selectedLog.afterSnapshot
                    ? JSON.stringify(selectedLog.afterSnapshot, null, 2)
                    : '// Record deleted / voided'}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-gray-200">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-semibold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
