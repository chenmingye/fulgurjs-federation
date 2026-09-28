import { createElement, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'

createRoot(document.getElementById('root')!).render(
  createElement(StrictMode, null, createElement(BrowserRouter, null, createElement(App))),
)
