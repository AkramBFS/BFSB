import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Local self-hosted fontsource imports (offline-first, no CDN)
import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/500.css';
import '@fontsource/newsreader/600.css';
import '@fontsource/newsreader/400-italic.css';

import '@fontsource/lora/400.css';
import '@fontsource/lora/500.css';
import '@fontsource/lora/600.css';

import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';

import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';

import '@fontsource/cairo/400.css';
import '@fontsource/cairo/500.css';
import '@fontsource/cairo/600.css';

import '@fontsource/tajawal/400.css';
import '@fontsource/tajawal/500.css';
import '@fontsource/tajawal/700.css';

import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';

import '@fontsource/fira-code/400.css';
import '@fontsource/fira-code/500.css';

// KaTeX stylesheet for mathematical formulas
import 'katex/dist/katex.min.css';

// Base styling and design tokens
import './index.css';

import App from './App.jsx';
import { ToastProvider } from './components/Toast';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>
);
