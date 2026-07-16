/// <reference types="vite/client" />

/** Injected at build time by electron.vite.config.ts (`define: { APP_VERSION: ... }`). */
declare const APP_VERSION: string

interface Window {
  api: import('../../preload/index').ElectronAPI
}
