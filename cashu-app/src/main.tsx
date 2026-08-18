import './polyfills';
import './store/themeStore';
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
            fontFamily: 'Poppins, sans-serif',
            backdropFilter: 'blur(12px)',
            maxWidth: '90vw',
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#9e7c38',
              secondary: '#ffffff',
            },
            style: {
              border: '1px solid rgba(158, 124, 56, 0.45)',
            },
          },
          error: {
            duration: 4000,
            iconTheme: {
              primary: '#ba1a1a',
              secondary: '#ffffff',
            },
            style: {
              border: '1px solid rgba(186, 26, 26, 0.45)',
            },
          },
          loading: {
            iconTheme: {
              primary: '#9e7c38',
              secondary: 'var(--color-surface-container-high)',
            },
          },
        }}
      />
    </ErrorBoundary>
  </React.StrictMode>,
);
