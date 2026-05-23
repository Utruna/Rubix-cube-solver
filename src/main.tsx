import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { I18nProvider } from './i18n'
import { CubeStoreProvider } from './store/cubeStore'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <CubeStoreProvider>
        <App />
      </CubeStoreProvider>
    </I18nProvider>
  </React.StrictMode>
)
