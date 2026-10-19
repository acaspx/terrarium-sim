import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';

// The 3D view loads on demand, which used to mean only once React had drawn the page. Ask
// for it now, on every route that shows a jar in 3D (the home shelf draws them flat), so it
// downloads while the page renders. It never competes with this file's own download.
if (!['', '#', '#/'].includes(location.hash)) import('./three/Terrarium3D.js').catch(() => {
  // Offline or a failed download: the jar view asks again when it is shown.
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
