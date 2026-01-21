import React from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import Standings from "./pages/Standings.jsx";
import AdminLogin from "./pages/AdminLogin.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";

const App = () => {
  const token = localStorage.getItem("sgipc_token");

  return (
    <Routes>
      <Route path="/" element={<Standings />} />
      <Route
        path="/admin"
        element={token ? <AdminDashboard /> : <AdminLogin />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
