import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './clinic-unified.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
