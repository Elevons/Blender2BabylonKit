import "./styles/hub.css";

import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { App } from "./hub/App";
import { GuiEditorPage } from "./editors/GuiEditorPage";
import { NpeEditorPage } from "./editors/NpeEditorPage";
import { NmeEditorPage } from "./editors/NmeEditorPage";
import { NgeEditorPage } from "./editors/NgeEditorPage";
import { NrgeEditorPage } from "./editors/NrgeEditorPage";
import { SfeEditorPage } from "./editors/SfeEditorPage";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/editors/gui" element={<GuiEditorPage />} />
        <Route path="/editors/npe" element={<NpeEditorPage />} />
        <Route path="/editors/nme" element={<NmeEditorPage />} />
        <Route path="/editors/nge" element={<NgeEditorPage />} />
        <Route path="/editors/nrge" element={<NrgeEditorPage />} />
        <Route path="/editors/sfe" element={<SfeEditorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
