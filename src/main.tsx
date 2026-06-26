import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SpacetimeDBProvider } from 'spacetimedb/react'
import './index.css'
import App from './App.tsx'
import { connectionBuilder } from './lib/spacetime/client'
import { ConnectionBridge } from './lib/spacetime/ConnectionBridge'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <ConnectionBridge>
        <App />
      </ConnectionBridge>
    </SpacetimeDBProvider>
  </StrictMode>,
)
