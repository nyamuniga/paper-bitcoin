import './polyfills';
import './nativeSetup';
import './store/themeStore';
import '@fontsource/poppins/300.css';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/poppins/800.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Toaster } from 'react-hot-toast';
import { ErrorBoundary } from './ErrorBoundary';

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <Toaster
        position="bottom-center"
        containerStyle={{
          bottom: 32,
        }}
        toastOptions={{
          duration: 3500,
          className: 'bitnotes-toast',
          style: {
            background: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface)',
            border: '1px solid var(--color-outline-variant)',
            padding: '12px 18px',
            borderRadius: '16px',
            fontSize: '13px',
            fontWeight: '500',
            fontFamily: "'Poppins', sans-serif",
            backdropFilter: 'blur(12px)',
            maxWidth: '90vw',
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#e5a83b',
              secondary: '#0d1713',
            },
            style: {
              border: '1px solid rgba(229, 168, 59, 0.45)',
            },
          },
          error: {
            duration: 4000,
            iconTheme: {
              primary: '#d65d4e',
              secondary: '#ffffff',
            },
            style: {
              border: '1px solid rgba(214, 93, 78, 0.45)',
            },
          },
          loading: {
            iconTheme: {
              primary: '#e5a83b',
              secondary: 'var(--color-surface-container-high)',
            },
          },
        }}
      />
    </ErrorBoundary>
  </React.StrictMode>,
);
