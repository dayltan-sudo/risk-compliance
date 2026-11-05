import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted variable fonts. `theme.css` has always named these families, but
// nothing ever loaded them, so headings rendered in Georgia and figures in the
// platform mono. No CDN: the woff2 files ship in the bundle.
import '@fontsource-variable/source-serif-4';
import '@fontsource-variable/jetbrains-mono';

import App from './app/App';
import './styles.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Root element #root not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
