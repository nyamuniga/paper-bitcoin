import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Toaster } from 'react-hot-toast';

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
    <Toaster position="bottom-center" toastOptions={{
      style: { background: '#1e293b', color: '#fff', border: '1px solid #334155' }
    }} />
  </React.StrictMode>,
);
