import axios from "axios";

const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("sgipc_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const loginAdmin = async (payload) => {
  const { data } = await api.post("/admin/login", payload);
  return data;
};

export const getHandles = async () => {
  const { data } = await api.get("/admin/handles");
  return data;
};

export const createHandle = async (payload) => {
  const { data } = await api.post("/admin/handles", payload);
  return data;
};

export const updateHandle = async (id, payload) => {
  const { data } = await api.put(`/admin/handles/${id}`, payload);
  return data;
};

export const deleteHandle = async (id) => {
  const { data } = await api.delete(`/admin/handles/${id}`);
  return data;
};

export const forceRefreshHandle = async (id) => {
  const { data } = await api.post(`/admin/handles/${id}/refresh`);
  return data;
};

export const getStandings = async () => {
  const { data } = await api.get("/standings");
  return data;
};

export const getInactiveStandings = async () => {
  const { data } = await api.get("/standings/inactive");
  return data;
};

export const submitReactivationRequest = async (handle) => {
  const { data } = await api.post("/request/reactivate", { handle });
  return data;
};

export const getVjudgeStandings = async () => {
  const { data } = await api.get("/vjudge/standings");
  return data;
};

export const getVjudgeTeams = async () => {
  const { data } = await api.get("/admin/vjudge/teams");
  return data;
};

export const createVjudgeTeam = async (payload) => {
  const { data } = await api.post("/admin/vjudge/teams", payload);
  return data;
};

export const updateVjudgeTeam = async (id, payload) => {
  const { data } = await api.patch(`/admin/vjudge/teams/${id}`, payload);
  return data;
};

export const deleteVjudgeTeam = async (id) => {
  const { data } = await api.delete(`/admin/vjudge/teams/${id}`);
  return data;
};

export const refreshVjudgeTeam = async (id) => {
  const { data } = await api.post(`/admin/vjudge/teams/${id}/refresh`);
  return data;
};

export const refreshAllVjudgeContests = async () => {
  const { data } = await api.post("/admin/vjudge/refresh-all");
  return data;
};

export const getVjudgeContests = async () => {
  const { data } = await api.get("/admin/vjudge/contests");
  return data;
};

export const createVjudgeContest = async (payload) => {
  const { data } = await api.post("/admin/vjudge/contests", payload);
  return data;
};

export const updateVjudgeContest = async (id, payload) => {
  const { data } = await api.patch(`/admin/vjudge/contests/${id}`, payload);
  return data;
};

export const deleteVjudgeContest = async (id) => {
  const { data } = await api.delete(`/admin/vjudge/contests/${id}`);
  return data;
};

export const syncVjudgeContests = async () => {
  const { data } = await api.post("/admin/vjudge/contests/sync");
  return data;
};

export const syncVjudgeContest = async (id) => {
  const { data } = await api.post(`/admin/vjudge/contests/${id}/sync`);
  return data;
};

export const getVjudgeConfig = async () => {
  const { data } = await api.get("/admin/vjudge/config");
  return data;
};

export const updateVjudgeConfig = async (payload) => {
  const { data } = await api.put("/admin/vjudge/config", payload);
  return data;
};

export const updateAdminCredentials = async (payload) => {
  const { data } = await api.put("/admin/profile", payload);
  return data;
};

export const submitHandleRequest = async (payload) => {
  const { data } = await api.post("/request/handle", payload);
  return data;
};

export const submitTeamRequest = async (payload) => {
  const { data } = await api.post("/request/team", payload);
  return data;
};

export const getRequests = async (status) => {
  const { data } = await api.get("/admin/requests", {
    params: status ? { status } : undefined,
  });
  return data;
};

export const approveRequest = async (id) => {
  const { data } = await api.post(`/admin/requests/${id}/approve`);
  return data;
};

export const rejectRequest = async (id) => {
  const { data } = await api.post(`/admin/requests/${id}/reject`);
  return data;
};

export const updatePasskey = async (payload) => {
  const { data } = await api.put("/admin/passkey", payload);
  return data;
};

// ─── TFC Public API ──────────────────────────────────────────────────────────
export const getTfcStandings = async (params) => {
  const { data } = await api.get("/tfc/standings", { params });
  return data;
};

export const getTfcParticipants = async () => {
  const { data } = await api.get("/tfc/participants");
  return data;
};

export const getTfcParticipant = async (id) => {
  const { data } = await api.get(`/tfc/participants/${id}`);
  return data;
};

export const submitTfcRequest = async (payload) => {
  const { data } = await api.post("/tfc/request", payload);
  return data;
};

export const submitTfcReport = async (payload) => {
  const { data } = await api.post("/tfc/reports", payload);
  return data;
};

// ─── TFC Admin API ───────────────────────────────────────────────────────────
export const getAdminTfcRequests = async () => {
  const { data } = await api.get("/admin/tfc/requests");
  return data;
};

export const approveAdminTfcRequest = async (id) => {
  const { data } = await api.post(`/admin/tfc/requests/${id}/approve`);
  return data;
};

export const approveAllAdminTfcRequests = async () => {
  const { data } = await api.post("/admin/tfc/requests/approve-all");
  return data;
};

export const rejectAdminTfcRequest = async (id) => {
  const { data } = await api.post(`/admin/tfc/requests/${id}/reject`);
  return data;
};

export const getAdminTfcParticipationMatrix = async () => {
  const { data } = await api.get("/admin/tfc/participation-matrix");
  return data;
};

export const toggleAdminTfcParticipation = async (payload) => {
  const { data } = await api.post("/admin/tfc/participation-matrix/toggle", payload);
  return data;
};

export const getAdminTfcConfig = async () => {
  const { data } = await api.get("/admin/tfc/config");
  return data;
};

export const updateAdminTfcConfig = async (payload) => {
  const { data } = await api.patch("/admin/tfc/config", payload);
  return data;
};

export const getAdminTfcParticipants = async () => {
  const { data } = await api.get("/admin/tfc/participants");
  return data;
};

export const createAdminTfcParticipant = async (payload) => {
  const { data } = await api.post("/admin/tfc/participants", payload);
  return data;
};

export const updateAdminTfcParticipant = async (id, payload) => {
  const { data } = await api.patch(`/admin/tfc/participants/${id}`, payload);
  return data;
};

export const deleteAdminTfcParticipant = async (id) => {
  const { data } = await api.delete(`/admin/tfc/participants/${id}`);
  return data;
};

export const getAdminTfcContests = async () => {
  const { data } = await api.get("/admin/tfc/contests");
  return data;
};

export const createAdminTfcContest = async (payload) => {
  const { data } = await api.post("/admin/tfc/contests", payload);
  return data;
};

export const updateAdminTfcContest = async (id, payload) => {
  const { data } = await api.patch(`/admin/tfc/contests/${id}`, payload);
  return data;
};

export const deleteAdminTfcContest = async (id) => {
  const { data } = await api.delete(`/admin/tfc/contests/${id}`);
  return data;
};

export const syncAdminTfcContests = async () => {
  const { data } = await api.post("/admin/tfc/contests/sync");
  return data;
};

export const syncAdminTfcContest = async (id) => {
  const { data } = await api.post(`/admin/tfc/contests/${id}/sync`);
  return data;
};

export const getAdminTfcReports = async () => {
  const { data } = await api.get("/admin/tfc/reports");
  return data;
};

export const updateAdminTfcReport = async (id, payload) => {
  const { data } = await api.patch(`/admin/tfc/reports/${id}`, payload);
  return data;
};

export const deleteAdminTfcReport = async (id) => {
  const { data } = await api.delete(`/admin/tfc/reports/${id}`);
  return data;
};


/* WQ2LDzMUdnmNOGns */