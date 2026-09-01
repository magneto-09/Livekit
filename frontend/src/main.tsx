import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { BrowserRouter } from "react-router-dom"

import { ErrorBoundary } from "react-error-boundary"

import { ThemeProvider } from "@/components/theme-provider.tsx"
import { Toaster } from "@/components/ui/sonner.tsx"
import "@livekit/components-styles"
import App from "./App.tsx"
import TechnicalError from "./components/error-boundaries/TechnicalError.tsx"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary fallbackRender={() => <TechnicalError />}>
      <ThemeProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
        <Toaster position="top-right" />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
)
