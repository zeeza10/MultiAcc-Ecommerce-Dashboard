import React, { useState, useEffect } from 'react';
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../services/api';
import { NotificationItem, User, SystemConfig } from '../types';

interface NotificationsViewProps {
  currentUser: User;
  config: SystemConfig;
  onNavigate: (tab: any) => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  currentUser,
  config,
  onNavigate,
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
  }, [currentUser.id]);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const res = await api.getNotifications();
      setNotifications(res.notifications);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await api.dismissNotification(id);
      loadNotifications();
    } catch (err) {
      console.error('Dismiss failed:', err);
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">CRITICAL</span>;
      case 'WARNING':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">WARNING</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">INFO</span>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">System Notifications & Operational Alerts</h1>
          <p className="text-xs text-gray-500">
            Automated monitoring across the 9 SRS alert categories (S16.2) including sync failures, unmapped SKUs, stockout risks, and overdue receivables.
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-2xs divide-y divide-gray-100">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-xs">
            No system notifications. All operations are operating within normal parameters.
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`p-4 flex items-start justify-between gap-4 transition ${
                n.isDismissed ? 'opacity-50 bg-gray-50/50' : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start space-x-3">
                <div className="mt-0.5">
                  {n.severity === 'CRITICAL' ? (
                    <AlertCircle className="w-5 h-5 text-rose-600" />
                  ) : n.severity === 'WARNING' ? (
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  ) : (
                    <Info className="w-5 h-5 text-blue-600" />
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-gray-900 text-xs">{n.title}</span>
                    {getSeverityBadge(n.severity)}
                    <span className="text-[10px] font-mono text-gray-400">
                      {n.createdAt.replace('T', ' ').split('.')[0]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">{n.message}</p>
                  {n.referenceUrl && (
                    <button
                      onClick={() => onNavigate(n.referenceUrl?.replace('/', '') || 'dashboard')}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1 mt-1"
                    >
                      <span>Jump to affected module</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {!n.isDismissed && (
                <button
                  onClick={() => handleDismiss(n.id)}
                  className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-800 border border-gray-300 rounded hover:bg-gray-100 transition shrink-0"
                >
                  Acknowledge & Dismiss
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
