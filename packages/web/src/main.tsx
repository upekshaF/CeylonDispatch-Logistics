import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";
import { StoreProvider } from "./lib/mock/react.js";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </React.StrictMode>,
);
