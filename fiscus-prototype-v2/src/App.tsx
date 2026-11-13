import { useEffect, useState } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { DirectoryPage } from "./pages/DirectoryPage.js";
import { CustomerDetailPage } from "./pages/CustomerDetailPage.js";
import { StartAssessmentPage } from "./pages/StartAssessmentPage.js";
import { AssessmentWorkspacePage } from "./pages/AssessmentWorkspacePage.js";
import { AuditLogPage } from "./pages/AuditLogPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { api } from "./api/client.js";
import { useStore } from "./store/useStore.js";

export default function App() {
  const [authState, setAuthState] = useState<"checking" | "authenticated" | "anonymous">("checking");
  const loadBootstrap = useStore((s) => s.loadBootstrap);
  const adoptSessionUser = useStore((s) => s.adoptSessionUser);

  useEffect(() => {
    api
      .session()
      .then((s) => {
        if (s.authenticated && s.userId) adoptSessionUser(s.userId);
        setAuthState(s.authenticated ? "authenticated" : "anonymous");
      })
      .catch(() => setAuthState("anonymous"));
  }, [adoptSessionUser]);

  useEffect(() => {
    if (authState === "authenticated") loadBootstrap();
  }, [authState, loadBootstrap]);

  if (authState === "checking") return null;
  if (authState === "anonymous") {
    return (
      <LoginPage
        onSuccess={(userId) => {
          adoptSessionUser(userId);
          setAuthState("authenticated");
        }}
      />
    );
  }

  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<DirectoryPage />} />
            <Route path="/customers/:customerId" element={<CustomerDetailPage />} />
            <Route path="/start" element={<StartAssessmentPage />} />
            <Route path="/assessments/:assessmentId" element={<AssessmentWorkspacePage />} />
            <Route path="/audit" element={<AuditLogPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  );
}
