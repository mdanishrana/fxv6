/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vite-plugin-pwa/info" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
    readonly VITE_API_KEY: string
    // more env variables...
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
