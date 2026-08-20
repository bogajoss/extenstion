import "../input.css";
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { OverlayApp } from './OverlayApp';

export class FinderOverlay {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private reactRoot: Root | null = null;
  private isOpen: boolean = false;

  constructor() {
    this.createDom();
  }

  private createDom(): void {
    if (document.getElementById('post-finder-overlay-host')) {
      return;
    }

    this.host = document.createElement('div');
    this.host.id = 'post-finder-overlay-host';
    this.host.style.position = 'fixed';
    this.host.style.zIndex = '2147483647';
    this.host.style.top = '0';
    this.host.style.left = '0';
    this.host.style.width = '0';
    this.host.style.height = '0';
    this.host.style.overflow = 'visible';

    this.shadow = this.host.attachShadow({ mode: 'open' });

    // Link the compiled Tailwind stylesheet directly
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('styles.css');
    this.shadow.appendChild(link);

    // Supplementary styles for dialog positioning
    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; }
      .dialog-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2147483647;
        padding: 16px;
      }
      .dialog-box {
        width: 880px;
        max-width: 96vw;
        height: 720px;
        max-height: 94vh;
      }
    `;
    this.shadow.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.id = 'overlayWrapper';
    this.shadow.appendChild(wrapper);

    document.documentElement.appendChild(this.host);

    this.reactRoot = createRoot(wrapper);
    this.renderReact();
  }

  public open(): void {
    this.isOpen = true;
    this.renderReact();
  }

  public close(): void {
    this.isOpen = false;
    this.renderReact();
  }

  public toggle(): void {
    this.isOpen = !this.isOpen;
    this.renderReact();
  }

  private renderReact() {
    if (this.reactRoot) {
      this.reactRoot.render(
        <OverlayApp 
          isOpen={this.isOpen} 
          onClose={() => this.close()} 
          onToggle={() => this.toggle()} 
        />
      );
    }
  }
}

// Auto-initialize when injected
const overlay = new FinderOverlay();
// Expose toggle to window so content scripts can call it
(window as any).toggleFinderOverlay = () => {
  overlay.toggle();
};
