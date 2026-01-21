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

/* WQ2LDzMUdnmNOGns */