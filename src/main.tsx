import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import App from './app/App';
import './index.css';

// VITE_ROUTER=memory builds a self-contained single-file demo for embedded hosts that do not control the URL.
const useMemoryRouter = import.meta.env.VITE_ROUTER === 'memory';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {useMemoryRouter ? (
      <MemoryRouter>
        <App />
      </MemoryRouter>
    ) : (
      <BrowserRouter useTransitions={false} basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <App />
      </BrowserRouter>
    )}
  </React.StrictMode>,
);
