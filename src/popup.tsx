import "../input.css";
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PopupApp } from './PopupApp';

const container = document.getElementById('popupBody');
if (container) {
  const root = createRoot(container);
  root.render(<PopupApp />);
}
