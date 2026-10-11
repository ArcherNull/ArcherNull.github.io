/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SDK_APP_ID: string
  readonly VITE_SDK_SECRET_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
