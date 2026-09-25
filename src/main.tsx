import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { installConsoleApi } from './lib/consoleApi.ts';
import './styles.css';

installConsoleApi();

const host = document.getElementById('root');
if (!host) throw new Error('#root missing from index.html');

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
