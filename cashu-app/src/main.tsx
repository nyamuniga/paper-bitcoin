import './polyfills';
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Toaster } from 'react-hot-toast';
import { ErrorBoundary } from './ErrorBoundary';

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <Toaster position="bottom-center" toastOptions={{
        style: { background: '#1e293b', color: '#fff', border: '1px solid #334155' }
      }} />
    </ErrorBoundary>
  </React.StrictMode>,
);
