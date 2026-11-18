import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import CategoryPage from './pages/CategoryPage';
import AllToolsPage from './pages/AllToolsPage';
import ToolPage from './pages/ToolPage';
import Privacy from './pages/Privacy';
import About from './pages/About';
import Support from './pages/Support';
import Credits from './pages/Credits';
import AppDownload from './pages/AppDownload';
import ActionPage from './pages/ActionPage';
import NotFound from './pages/NotFound';
import { SearchProvider } from './lib/searchContext';
import { ThemeProvider } from './lib/themeContext';
import { WorkspaceProvider } from './lib/workspaceContext';
import { useI18n } from './lib/i18n';
import { tr } from './lib/i18n';

// The Video Editor workspace is a full-screen page without the site header and footer.
const VideoEditorWorkspace = lazy(() => import('./tools/video/editor/Workspace'));

export default function App() {
  // Re-render the whole tree when the language changes (state inside tools is kept).
  useI18n();
  return (
    <BrowserRouter>
      <ThemeProvider>
        <WorkspaceProvider>
          <SearchProvider>
            <Routes>
              <Route
                path="/editor/video/:id"
                element={
                  <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-ink-3">{tr("Opening editor…")}</div>}>
                    <VideoEditorWorkspace />
                  </Suspense>
                }
              />
              <Route
                path="*"
                element={
                  <Layout>
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/privacy" element={<Privacy />} />
                      <Route path="/about" element={<About />} />
                      <Route path="/support" element={<Support />} />
                      <Route path="/credits" element={<Credits />} />
                      <Route path="/app" element={<AppDownload />} />
                      <Route path="/tools" element={<AllToolsPage />} />
                      <Route path="/tools/:category" element={<CategoryPage />} />
                      <Route path="/tools/:category/:slug" element={<ToolPage />} />
                      <Route path="/:action" element={<ActionPage />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Layout>
                }
              />
            </Routes>
          </SearchProvider>
        </WorkspaceProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
