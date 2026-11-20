import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext';
import './index.css';

// Register the application service worker for real background Web Push notifications.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((error) => console.error('Push service worker registration failed:', error));
  }, { once: true });
}

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <App />
  </AuthProvider>,
);
