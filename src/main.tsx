import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AuthGate } from './auth/AuthGate';
import './index.css';

createRoot(document.getElementById('root')!).render(<AuthGate><App /></AuthGate>);
