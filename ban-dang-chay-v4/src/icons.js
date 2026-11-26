import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  Upload,
  Layers3,
  FolderOpen,
  ScanSearch,
  Trash2,
  ShieldCheck,
  ListChecks,
  ClipboardList,
  CheckCheck,
  Download,
  Printer,
} from 'lucide-react';
const icons = {
  upload: Upload,
  layers: Layers3,
  folder: FolderOpen,
  scan: ScanSearch,
  trash: Trash2,
  shield: ShieldCheck,
  list: ListChecks,
  clipboard: ClipboardList,
  check: CheckCheck,
  download: Download,
  printer: Printer,
};

export function mountIcons() {
  document.querySelectorAll('[data-icon]').forEach((el) => {
    let component = icons[el.dataset.icon];
    if (!component) return;
    let span = document.createElement('span');
    span.className = 'lucide-slot';
    span.setAttribute('aria-hidden', 'true');
    el.prepend(span);
    createRoot(span).render(React.createElement(component, { size: 18, strokeWidth: 1.9 }));
  });
}
