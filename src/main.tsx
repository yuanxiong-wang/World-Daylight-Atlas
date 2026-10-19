import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initializeNative } from './utils/platform';

if (import.meta.env.MODE === 'ios') document.documentElement.classList.add('native-app');
void initializeNative().catch(error => console.error('Native lifecycle initialization failed', error));

createRoot(document.getElementById('root')!).render(<App />);

