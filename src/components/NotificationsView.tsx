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


const decodeApplicationServerKey = (value: string): Uint8Array => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = window.atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

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
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState('');

  useEffect(() => {
    void loadNotifications();
  }, [currentUser.id]);

  useEffect(() => {
    let active = true;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    void navigator.serviceWorker.getRegistration('/').then(async (registration) => {
      if (!registration) return;
      const subscription = await registration.pushManager.getSubscription();
      if (!active) return;
      if (subscription) {
        try {
          // Reconcile an existing browser subscription with the authenticated user's server record.
          await api.savePushSubscription(subscription.toJSON());
          if (active) setPushEnabled(true);
        } catch {
          if (active) setPushEnabled(false);
        }
      } else {
        setPushEnabled(false);
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const loadNotifications = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.getNotifications();
      setNotifications(res.notifications);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEnablePush = async () => {
    setPushBusy(true);
    setPushMessage('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        throw new Error('This browser does not support Web Push notifications.');
      }
      const config = await api.getPushPublicKey();
      if (!config.enabled || !config.publicKey) throw new Error('Push notifications are not configured on the server yet.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Allow notifications in your browser settings to receive new-order alerts.');
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeApplicationServerKey(config.publicKey) as BufferSource,
      });
      await api.savePushSubscription(subscription.toJSON());
      setPushEnabled(true);
      setPushMessage('Push notifications are enabled for new live eBay orders.');
    } catch (error) {
      setPushMessage(error instanceof Error ? error.message : 'Push notifications could not be enabled.');
    } finally {
      setPushBusy(false);
    }
  };

  const handleDisablePush = async () => {
    setPushBusy(true);
    setPushMessage('');
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await api.removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setPushEnabled(false);
      setPushMessage('Push notifications have been disabled on this device.');
    } catch (error) {
      setPushMessage(error instanceof Error ? error.message : 'Push notifications could not be disabled.');
    } finally {
      setPushBusy(false);
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
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Live eBay Order Notifications <span className="text-sm font-medium text-gray-500">({notifications.length})</span></h1>
          <p className="text-xs text-gray-500">Only verified new orders imported from connected live eBay seller accounts are shown here. Legacy and unverified alerts are hidden.</p>
        </div>
        <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
          <button type="button" onClick={pushEnabled ? handleDisablePush : handleEnablePush} disabled={pushBusy}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 transition hover:bg-indigo-100 disabled:cursor-wait disabled:opacity-60 sm:w-auto">
            <Bell className="h-4 w-4" />
            {pushBusy ? 'Please wait…' : pushEnabled ? 'Disable Push on This Device' : 'Enable Push Notifications'}
          </button>
          {pushMessage && <p role="status" className="max-w-sm text-xs text-gray-600 sm:text-right">{pushMessage}</p>}
          <p className="max-w-sm text-[10px] text-gray-400 sm:text-right">On iPhone/iPad, install this app to the Home Screen before enabling Web Push.</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xs divide-y divide-gray-100">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-xs">
            No new live eBay orders have been received.
          </div>
        ) : (
          notifications.map((n, index) => (
            <div
              key={n.id}
              className={`flex flex-col gap-3 p-3 transition sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:p-4 ${
                n.isDismissed ? 'opacity-50 bg-gray-50/50' : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex min-w-0 items-start space-x-3"><span className="mt-1 text-[10px] font-mono text-gray-400">#{index + 1}</span>
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
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-words font-bold text-gray-900 text-xs">{n.title}</span>
                    {getSeverityBadge(n.severity)}
                    <span className="text-[10px] font-mono text-gray-400">
                      {n.createdAt.replace('T', ' ').split('.')[0]}
                    </span>
                  </div>
                  <p className="break-words text-xs text-gray-600">{n.message}</p>
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
                  className="w-full shrink-0 rounded border border-gray-300 px-2.5 py-2 text-xs text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 sm:w-auto sm:py-1"
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
