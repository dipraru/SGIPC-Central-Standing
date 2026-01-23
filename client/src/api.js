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
  await api.delete(`/admin/handles/${id}`);
};

export const getStandings = async () => {
  const { data } = await api.get("/standings");
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
  await api.delete(`/admin/vjudge/teams/${id}`);
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
  await api.delete(`/admin/vjudge/contests/${id}`);
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

/* WQ2LDzMUdnmNOGns */