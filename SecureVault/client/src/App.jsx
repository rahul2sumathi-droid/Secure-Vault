import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import { Forgot, Login, Register, Reset } from './pages/AuthPages.jsx';
import Dashboard from './pages/Dashboard.jsx';
import FilesPage from './pages/FilesPage.jsx';
import FileDetail from './pages/FileDetail.jsx';
import AuditLog from './pages/AuditLog.jsx';
import Admin from './pages/Admin.jsx';
import Security from './pages/Security.jsx';

// Client-side role gating is only for navigation. The server enforces every permission.
function Protected({ roles }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Restoring your session..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Layout />;
}

function Guest({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return user ? <Navigate to="/" replace /> : children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Guest><Login /></Guest>} />
      <Route path="/register" element={<Guest><Register /></Guest>} />
      <Route path="/forgot-password" element={<Guest><Forgot /></Guest>} />
      <Route path="/reset-password" element={<Reset />} />

      <Route element={<Protected />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/security" element={<Security />} />
      </Route>
      <Route element={<Protected roles={['owner', 'collaborator']} />}>
        <Route path="/shared" element={<FilesPage scope="shared" />} />
        <Route path="/files/:id" element={<FileDetail />} />
      </Route>
      <Route element={<Protected roles={['owner']} />}>
        <Route path="/files" element={<FilesPage scope="mine" />} />
      </Route>
      <Route element={<Protected roles={['admin', 'auditor']} />}>
        <Route path="/audit" element={<AuditLog />} />
      </Route>
      <Route element={<Protected roles={['admin']} />}>
        <Route path="/admin" element={<Admin />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
