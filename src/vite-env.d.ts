/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/info" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
    readonly VITE_SPACETIMEDB_URI: string
    readonly VITE_SPACETIMEDB_DB: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}