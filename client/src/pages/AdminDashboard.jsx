import React, { useEffect, useState } from "react";
import {
  createHandle,
  deleteHandle,
  getHandles,
  updateHandle,
} from "../api.js";

const AdminDashboard = () => {
  const [handles, setHandles] = useState([]);
  const [newHandle, setNewHandle] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadHandles = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getHandles();
      setHandles(data);
    } catch (err) {
      if (err?.response?.status === 401) {
        localStorage.removeItem("sgipc_token");
        window.location.href = "/admin";
        return;
      }
      setError("Unable to load handles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHandles();
  }, []);

  const handleCreate = async () => {
    if (!newHandle.trim()) return;
    try {
      await createHandle({ handle: newHandle.trim() });
      setNewHandle("");
      loadHandles();
    } catch (err) {
      setError("Unable to add handle");
    }
  };

  const handleUpdate = async (id) => {
    try {
      await updateHandle(id, { handle: editingValue.trim() });
      setEditingId(null);
      setEditingValue("");
      loadHandles();
    } catch (err) {
      setError("Unable to update handle");
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteHandle(id);
      loadHandles();
    } catch (err) {
      setError("Unable to delete handle");
    }
  };

  const logout = () => {
    localStorage.removeItem("sgipc_token");
    window.location.href = "/admin";
  };

  return (
    <div className="container">
      <div className="hero">
        <span className="badge">Admin Dashboard</span>
        <h1>Manage SGIPC Handles</h1>
        <p>Add, update, or remove Codeforces handles.</p>
      </div>

      <div className="nav">
        <div className="form-row" style={{ maxWidth: 420 }}>
          <input
            type="text"
            placeholder="Add new handle"
            value={newHandle}
            onChange={(event) => setNewHandle(event.target.value)}
          />
          <button className="primary" onClick={handleCreate}>
            Add
          </button>
        </div>
        <button className="secondary" onClick={logout}>
          Logout
        </button>
      </div>

      <div className="card">
        {loading && <p>Loading handles...</p>}
        {!loading && error && <p className="notice">{error}</p>}
        {!loading && !error && handles.length === 0 && (
          <p>No handles added yet.</p>
        )}
        {!loading && !error && handles.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Handle</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {handles.map((row) => (
                <tr key={row._id}>
                  <td>
                    {editingId === row._id ? (
                      <input
                        value={editingValue}
                        onChange={(event) => setEditingValue(event.target.value)}
                      />
                    ) : (
                      row.handle
                    )}
                  </td>
                  <td>
                    <div className="actions">
                      {editingId === row._id ? (
                        <>
                          <button
                            className="primary"
                            onClick={() => handleUpdate(row._id)}
                          >
                            Save
                          </button>
                          <button
                            className="secondary"
                            onClick={() => {
                              setEditingId(null);
                              setEditingValue("");
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="secondary"
                            onClick={() => {
                              setEditingId(row._id);
                              setEditingValue(row.handle);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="primary"
                            onClick={() => handleDelete(row._id)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
