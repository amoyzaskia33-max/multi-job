import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";

import AppLayout from "./components/AppLayout";
import Agents from "./pages/Agents";
import Builder from "./pages/Builder";
import Connectors from "./pages/Connectors";
import Home from "./pages/Home";
import Jobs from "./pages/Jobs";
import Runs from "./pages/Runs";
import Settings from "./pages/Settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 2,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/builder" element={<Builder />} />
            <Route path="/runs" element={<Runs />} />
            <Route path="/connectors" element={<Connectors />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
        <Toaster richColors position="top-right" />
      </Router>
    </QueryClientProvider>
  );
}
