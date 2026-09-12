import React, { useEffect, useState, useMemo } from "react";
import {
  createHandle,
  deleteHandle,
  forceRefreshHandle,
  getHandles,
  updateHandle,
  createVjudgeContest,
  createVjudgeTeam,
  deleteVjudgeContest,
  deleteVjudgeTeam,
  refreshVjudgeTeam,
  refreshAllVjudgeContests,
  getVjudgeConfig,
  getVjudgeContests,
  getVjudgeTeams,
  updateVjudgeTeam,
  updateVjudgeConfig,
  updateVjudgeContest,
  updateAdminCredentials,
  getRequests,
  approveRequest,
  rejectRequest,
  updatePasskey,
  getTfcStandings,
  getAdminTfcRequests,
  approveAdminTfcRequest,
  approveAllAdminTfcRequests,
  rejectAdminTfcRequest,
  getAdminTfcParticipants,
  createAdminTfcParticipant,
  updateAdminTfcParticipant,
  deleteAdminTfcParticipant,
  getAdminTfcContests,
  createAdminTfcContest,
  updateAdminTfcContest,
  deleteAdminTfcContest,
  syncAdminTfcContests,
  syncAdminTfcContest,
  syncVjudgeContests,
  syncVjudgeContest,
  getAdminTfcReports,
  updateAdminTfcReport,
  deleteAdminTfcReport,
  getAdminTfcParticipationMatrix,
  toggleAdminTfcParticipation,
  getAdminTfcConfig,
  updateAdminTfcConfig,
  getTfcContestStandings,
} from "../api.js";
import { BatchSelect } from "../components/BatchSelect.jsx";
import { BatchFilter } from "../components/BatchFilter.jsx";
import { ContestHistoryModal } from "../components/ContestHistoryModal.jsx";
import { TfcSettingsModal } from "../components/TfcSettingsModal.jsx";
import { computeBatchOptions, SortIcon } from "./Standings.jsx";

// ─── Session Tab Persistence ──────────────────────────────────────────────────
const ADMIN_TAB_KEY = "sgipc_admin_tab";
const getInitialAdminTab = () => {
  try { return sessionStorage.getItem(ADMIN_TAB_KEY) || "individual"; } catch { return "individual"; }
};
const saveAdminTab = (tab) => {
  try { sessionStorage.setItem(ADMIN_TAB_KEY, tab); } catch {}
};

// ─── Batch Utilities ──────────────────────────────────────────────────────────
const extractBatchDigits = (b) => { const m = (b || "").match(/(\d{2})$/); return m ? m[1] : null; };
const normalizeBatch     = (b) => { const d = extractBatchDigits(b); return d ? `2K${d}` : null; };

const emptyMember = () => ({ name: "", roll: "", batch: "" });

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState(getInitialAdminTab);
  const switchTab = (tab) => { setActiveTab(tab); saveAdminTab(tab); };

  // Data states
  const [handles, setHandles] = useState([]);
  const [vjudgeTeams, setVjudgeTeams] = useState([]);
  const [vjudgeContests, setVjudgeContests] = useState([]);
  const [vjudgeConfig, setVjudgeConfig] = useState({ eloMode: "normal" });
  const [requests, setRequests] = useState([]);
  const [requestsCount, setRequestsCount] = useState(0);

  // Load states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState("");

  // Filters & search
  const [selectedBatches, setSelectedBatches] = useState([]);
  const [batchFilterOpen, setBatchFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [addHandleModalOpen, setAddHandleModalOpen] = useState(false);
  const [newHandle, setNewHandle] = useState("");
  const [newName, setNewName] = useState("");
  const [newRoll, setNewRoll] = useState("");
  const [newBatch, setNewBatch] = useState("");
  const [isAddingHandle, setIsAddingHandle] = useState(false);
  const [addHandleError, setAddHandleError] = useState("");

  const [addTeamModalOpen, setAddTeamModalOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamVjudgeHandle, setTeamVjudgeHandle] = useState("");
  const [teamMembers, setTeamMembers] = useState([emptyMember(), emptyMember(), emptyMember()]);
  const [isAddingTeam, setIsAddingTeam] = useState(false);
  const [addTeamError, setAddTeamError] = useState("");

  const [addContestModalOpen, setAddContestModalOpen] = useState(false);
  const [contestIdInput, setContestIdInput] = useState("");
  const [contestTitleInput, setContestTitleInput] = useState("");
  const [isAddingContest, setIsAddingContest] = useState(false);

  const [handleDetailModal, setHandleDetailModal] = useState(null); // handle object | null
  const [teamDetailModal, setTeamDetailModal] = useState(null); // team object | null
  const [requestDetailModal, setRequestDetailModal] = useState(null); // request object | null
  const [deleteModal, setDeleteModal] = useState(null); // { type: 'handle' | 'team' | 'contest', id: string, name: string } | null
  const [isDeleting, setIsDeleting] = useState(false);

  // ─── TFC States ────────────────────────────────────────────────────────────
  const [tfcSubtab, setTfcSubtab] = useState("requests");
  const [tfcRequests, setTfcRequests] = useState([]);
  const [tfcParticipants, setTfcParticipants] = useState([]);
  const [tfcContests, setTfcContests] = useState([]);
  const [tfcReports, setTfcReports] = useState([]);
  const [tfcLoading, setTfcLoading] = useState(false);
  const [tfcError, setTfcError] = useState("");

  const [addTfcPartModalOpen, setAddTfcPartModalOpen] = useState(false);
  const [tfcPartName, setTfcPartName] = useState("");
  const [tfcPartRoll, setTfcPartRoll] = useState("");
  const [tfcPartBatch, setTfcPartBatch] = useState("");
  const [tfcPartHandles, setTfcPartHandles] = useState([""]);
  const [tfcPartCf, setTfcPartCf] = useState("");
  const [tfcPartPlaylist, setTfcPartPlaylist] = useState("");
  const [isAddingTfcPart, setIsAddingTfcPart] = useState(false);
  const [tfcPartError, setTfcPartError] = useState("");

  const [addTfcContestModalOpen, setAddTfcContestModalOpen] = useState(false);
  const [tfcContestIdInput, setTfcContestIdInput] = useState("");
  const [tfcContestTitleInput, setTfcContestTitleInput] = useState("");
  const [isAddingTfcContest, setIsAddingTfcContest] = useState(false);

  const [tfcRequestDetailModal, setTfcRequestDetailModal] = useState(null);
  const [tfcReportDetailModal, setTfcReportDetailModal] = useState(null);
  const [approvingTfcRequestId, setApprovingTfcRequestId] = useState(null);
  const [rejectingTfcRequestId, setRejectingTfcRequestId] = useState(null);
  const [isApprovingAllTfc, setIsApprovingAllTfc] = useState(false);

  // Admin TFC Standings state
  const [tfcStandingsData, setTfcStandingsData] = useState([]);
  const [tfcStandingsMap, setTfcStandingsMap] = useState({ normal: [], "gain-only": [], "zero-participation": [] });
  const [tfcStandingsType, setTfcStandingsType] = useState("normal");
  const [tfcStandingsSearch, setTfcStandingsSearch] = useState("");
  const [tfcStandingsBatches, setTfcStandingsBatches] = useState([]);
  const [tfcStandingsSortField, setTfcStandingsSortField] = useState("rank");
  const [tfcStandingsSortDir, setTfcStandingsSortDir] = useState("asc");
  const [adminContestHistoryTarget, setAdminContestHistoryTarget] = useState(null);
  const [adminVisibleStandingsCount, setAdminVisibleStandingsCount] = useState(50);
  const [isTfcSettingsOpen, setIsTfcSettingsOpen] = useState(false);
  const [tfcStandingsMinContests, setTfcStandingsMinContests] = useState(0);

  // Admin TFC Participation Matrix state
  const [participationContests, setParticipationContests] = useState([]);
  const [participationMatrix, setParticipationMatrix] = useState([]);
  const [participationSearch, setParticipationSearch] = useState("");
  const [participationBatches, setParticipationBatches] = useState([]);
  const [togglingCell, setTogglingCell] = useState(null);

  // Admin TFC Participants subtab filters
  const [tfcPartSearch, setTfcPartSearch] = useState("");
  const [tfcPartBatches, setTfcPartBatches] = useState([]);

  // Admin TFC Requests subtab filters
  const [tfcRequestSearch, setTfcRequestSearch] = useState("");
  const [tfcRequestBatches, setTfcRequestBatches] = useState([]);

  // Admin TFC Contests and Reports subtab searches
  const [tfcContestSearch, setTfcContestSearch] = useState("");
  const [tfcReportSearch, setTfcReportSearch] = useState("");

  // Admin TFC Contest Standings subtab state
  const [adminSelectedContestId, setAdminSelectedContestId] = useState("");
  const [adminContestStandingsData, setAdminContestStandingsData] = useState(null);
  const [adminContestStandingsLoading, setAdminContestStandingsLoading] = useState(false);
  const [adminContestStandingsError, setAdminContestStandingsError] = useState("");
  const [adminContestSearchQuery, setAdminContestSearchQuery] = useState("");
  const [adminVisibleContestCount, setAdminVisibleContestCount] = useState(50);
  const adminContestStandingsCache = React.useRef({});

  // Admin TFC User-View Top-N Limit Configuration
  const [tfcTopNLimit, setTfcTopNLimit] = useState(10);
  const [isSavingTfcConfig, setIsSavingTfcConfig] = useState(false);
  const [tfcConfigToast, setTfcConfigToast] = useState("");

  // Editing states
  const [editingHandleId, setEditingHandleId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [editingRoll, setEditingRoll] = useState("");
  const [editingBatch, setEditingBatch] = useState("");

  const [editingTeamId, setEditingTeamId] = useState(null);
  const [editingTeamName, setEditingTeamName] = useState("");
  const [editingTeamAliases, setEditingTeamAliases] = useState("");

  const [editingContestId, setEditingContestId] = useState(null);
  const [editingContestValue, setEditingContestValue] = useState("");
  const [editingContestTitle, setEditingContestTitle] = useState("");
  const [editingContestEnabled, setEditingContestEnabled] = useState(true);

  // Request actions
  const [approvingRequestId, setApprovingRequestId] = useState(null);
  const [rejectingRequestId, setRejectingRequestId] = useState(null);
  const [requestSuccessId, setRequestSuccessId] = useState(null);

  // Admin settings modals
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [credentialTab, setCredentialTab] = useState("username");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [credMessage, setCredMessage] = useState("");
  const [credError, setCredError] = useState("");

  const [showPasskeyModal, setShowPasskeyModal] = useState(false);
  const [passkeyValue, setPasskeyValue] = useState("");
  const [passkeyConfirm, setPasskeyConfirm] = useState("");
  const [passkeyMessage, setPasskeyMessage] = useState("");

  const handleAuthError = (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem("sgipc_token");
      window.location.href = "/admin";
      return true;
    }
    return false;
  };

  // ── Ranks Pre-computation ──────────────────────────────────────────────────
  // ── Column Sorting State (ephemeral, resets on refresh) ────────────────────
  const [sortField, setSortField] = useState(null); // null | 'handle' | 'maxRating' | 'solvedCount' | 'standingRating'
  const [sortDir,   setSortDir]   = useState('desc');

  const handleSortClick = (field) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDir(field === 'handle' ? 'asc' : 'desc');
    }
  };

  const sortedHandles = useMemo(() => {
    if (!sortField) return handles;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...handles].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (sortField === 'handle') {
        valA = (a.name || a.handle || "").toLowerCase();
        valB = (b.name || b.handle || "").toLowerCase();
        return valA.localeCompare(valB) * dir;
      }
      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
      if (valA !== valB) return (valA - valB) * dir;
      if ((b.standingRating || 0) !== (a.standingRating || 0)) return (b.standingRating || 0) - (a.standingRating || 0);
      return (b.maxRating || 0) - (a.maxRating || 0);
    });
  }, [handles, sortField, sortDir]);

  const globalRankMap = useMemo(() => {
    const m = new Map();
    sortedHandles.forEach((h, i) => m.set(String(h._id || h.id), i + 1));
    return m;
  }, [sortedHandles]);

  const practiceRankMap = useMemo(() => {
    const m = new Map();
    const sorted = [...handles].sort((a, b) => {
      if ((b.standingRating || 0) !== (a.standingRating || 0)) {
        return (b.standingRating || 0) - (a.standingRating || 0);
      }
      if ((b.maxRating || 0) !== (a.maxRating || 0)) {
        return (b.maxRating || 0) - (a.maxRating || 0);
      }
      return (a.roll || "").localeCompare(b.roll || "", undefined, { numeric: true, sensitivity: "base" });
    });
    sorted.forEach((h, i) => m.set(String(h._id || h.id), i + 1));
    return m;
  }, [handles]);

  const cfMaxRankMap = useMemo(() => {
    const m = new Map();
    const sorted = [...handles].sort((a, b) => {
      if ((b.maxRating || 0) !== (a.maxRating || 0)) {
        return (b.maxRating || 0) - (a.maxRating || 0);
      }
      return (a.roll || "").localeCompare(b.roll || "", undefined, { numeric: true, sensitivity: "base" });
    });
    sorted.forEach((h, i) => m.set(String(h._id || h.id), i + 1));
    return m;
  }, [handles]);

  const availableBatches = useMemo(() => {
    const s = new Set();
    handles.forEach((r) => { const n = normalizeBatch(r.batch); if (n) s.add(n); });
    return Array.from(s).sort();
  }, [handles]);

  const formBatchOptions = useMemo(() => {
    return computeBatchOptions(handles, vjudgeTeams);
  }, [handles, vjudgeTeams]);

  const filteredHandles = useMemo(() => {
    let list = sortedHandles;
    if (selectedBatches.length > 0) {
      list = list.filter((r) => {
        const d = extractBatchDigits(r.batch);
        return d && selectedBatches.some((b) => extractBatchDigits(b) === d);
      });
    }
    const q = searchQuery.toLowerCase().trim();
    if (!q) return list;
    return list.filter(
      (r) =>
        (r.handle || "").toLowerCase().includes(q) ||
        (r.name   || "").toLowerCase().includes(q) ||
        (r.roll   || "").toLowerCase().includes(q)
    );
  }, [sortedHandles, selectedBatches, searchQuery]);

  const toggleBatch = (b) =>
    setSelectedBatches((p) => (p.includes(b) ? p.filter((x) => x !== b) : [...p, b]));

  // ── Data Loaders ───────────────────────────────────────────────────────────
  const loadHandles = async () => {
    try {
      setLoading(true);
      const data = await getHandles();
      setHandles(data);
      setError("");
    } catch (err) {
      if (!handleAuthError(err)) setError("Failed to load handles.");
    } finally {
      setLoading(false);
    }
  };

  const loadVjudge = async () => {
    try {
      const [teamsData, contestsData, configData] = await Promise.all([
        getVjudgeTeams(),
        getVjudgeContests(),
        getVjudgeConfig(),
      ]);
      setVjudgeTeams(teamsData);
      setVjudgeContests(contestsData);
      setVjudgeConfig(configData);
    } catch (err) {
      handleAuthError(err);
    }
  };

  const loadRequests = async () => {
    try {
      setRequestsLoading(true);
      const data = await getRequests("pending");
      setRequests(data);
      setRequestsCount(data.length);
      setRequestsError("");
    } catch (err) {
      if (!handleAuthError(err)) setRequestsError("Failed to load requests.");
    } finally {
      setRequestsLoading(false);
    }
  };

  const loadTfc = async () => {
    try {
      setTfcLoading(true);
      const [reqs, parts, conts, reps, standingsRes, matrixRes, configRes] = await Promise.all([
        getAdminTfcRequests().catch(() => []),
        getAdminTfcParticipants().catch(() => []),
        getAdminTfcContests().catch(() => []),
        getAdminTfcReports().catch(() => []),
        getTfcStandings().catch(() => ({ standings: [], standingsByType: {} })),
        getAdminTfcParticipationMatrix().catch(() => ({ contests: [], matrix: [] })),
        getAdminTfcConfig().catch(() => ({ topNLimit: 10 })),
      ]);
      setTfcRequests(reqs || []);
      setTfcParticipants(parts || []);
      setTfcContests(conts || []);
      setTfcReports(reps || []);
      if (typeof configRes?.topNLimit === "number") {
        setTfcTopNLimit(configRes.topNLimit);
      }
      if (typeof configRes?.adminMinParticipation === "number") {
        setTfcStandingsMinContests(configRes.adminMinParticipation);
      }
      if (typeof configRes?.adminTopNLimit === "number") {
        setAdminVisibleStandingsCount(configRes.adminTopNLimit > 0 ? configRes.adminTopNLimit : 999999);
      }
      if (standingsRes?.standingsByType) {
        setTfcStandingsMap(standingsRes.standingsByType);
      }
      setTfcStandingsData(standingsRes?.standings || []);
      setParticipationContests(matrixRes?.contests || []);
      setParticipationMatrix(matrixRes?.matrix || []);
      setTfcError("");
    } catch (err) {
      if (!handleAuthError(err)) setTfcError("Failed to load TFC data.");
    } finally {
      setTfcLoading(false);
    }
  };

  useEffect(() => {
    loadHandles();
    loadVjudge();
    loadRequests();
    loadTfc();
  }, []);

  // ── Create Handle ──────────────────────────────────────────────────────────
  const handleCreateHandle = async () => {
    setAddHandleError("");
    if (!newHandle.trim()) return setAddHandleError("Codeforces handle is required.");
    setIsAddingHandle(true);
    try {
      await createHandle({
        handle: newHandle.trim(),
        name: newName.trim(),
        roll: newRoll.trim(),
        batch: newBatch.trim(),
      });
      setNewHandle(""); setNewName(""); setNewRoll(""); setNewBatch("");
      setAddHandleModalOpen(false);
      await loadHandles();
    } catch (err) {
      setAddHandleError(err?.response?.data?.message || "Failed to add handle.");
    } finally {
      setIsAddingHandle(false);
    }
  };

  // ── Create Team ────────────────────────────────────────────────────────────
  const updateTeamMember = (idx, field, val) =>
    setTeamMembers((p) => p.map((m, i) => (i === idx ? { ...m, [field]: val } : m)));

  const handleCreateTeam = async () => {
    setAddTeamError("");
    if (!teamName.trim()) return setAddTeamError("Team name is required.");
    if (!teamVjudgeHandle.trim()) return setAddTeamError("Team VJudge handle is required.");
    for (let i = 0; i < 3; i++) {
      const m = teamMembers[i];
      if (!m.name.trim() || !m.roll.trim() || !m.batch.trim())
        return setAddTeamError(`All fields (Name, Roll, Batch) for Member ${i + 1} are required.`);
    }

    setIsAddingTeam(true);
    try {
      await createVjudgeTeam({ name: teamName.trim(), aliases: [teamVjudgeHandle.trim()], members: teamMembers });
      setTeamName(""); setTeamVjudgeHandle(""); setTeamMembers([emptyMember(), emptyMember(), emptyMember()]);
      setAddTeamModalOpen(false);
      await loadVjudge();
    } catch (err) {
      setAddTeamError(err?.response?.data?.message || "Failed to add team.");
    } finally {
      setIsAddingTeam(false);
    }
  };

  // ── Create Contest ─────────────────────────────────────────────────────────
  const handleCreateContest = async () => {
    if (!contestIdInput.trim()) return;
    setIsAddingContest(true);
    try {
      await createVjudgeContest({ contestId: contestIdInput.trim(), title: contestTitleInput.trim() });
      setContestIdInput(""); setContestTitleInput("");
      setAddContestModalOpen(false);
      await loadVjudge();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to add contest.");
    } finally {
      setIsAddingContest(false);
    }
  };

  // ── Handle Inline Edit ─────────────────────────────────────────────────────
  const startEditingHandle = (row) => {
    setEditingHandleId(row._id);
    setEditingName(row.name || "");
    setEditingRoll(row.roll || "");
    setEditingBatch(row.batch || "");
  };

  const saveEditingHandle = async (id) => {
    try {
      await updateHandle(id, { name: editingName.trim(), roll: editingRoll.trim(), batch: editingBatch.trim() });
      setEditingHandleId(null);
      await loadHandles();
    } catch (err) { alert(err?.response?.data?.message || "Failed to update handle."); }
  };

  const confirmExecuteDelete = async () => {
    if (!deleteModal || isDeleting) return;
    const { type, id } = deleteModal;
    setIsDeleting(true);
    try {
      if (type === "handle") {
        await deleteHandle(id);
        setHandles((prev) => prev.filter((h) => (h._id || h.id) !== id && h.handle !== id));
        await loadHandles();
      } else if (type === "team") {
        await deleteVjudgeTeam(id);
        setVjudgeTeams((prev) => prev.filter((t) => (t._id || t.id) !== id && t.name !== id));
        await loadVjudge();
      } else if (type === "contest") {
        await deleteVjudgeContest(id);
        setVjudgeContests((prev) => prev.filter((c) => (c._id || c.id) !== id && String(c.contestId) !== String(id)));
        await loadVjudge();
      } else if (type === "tfc_participant") {
        await deleteAdminTfcParticipant(id);
        setTfcParticipants((prev) => prev.filter((p) => (p._id || p.id) !== id && p.roll !== id));
        await loadTfc();
      } else if (type === "tfc_contest") {
        await deleteAdminTfcContest(id);
        setTfcContests((prev) => prev.filter((c) => (c._id || c.id) !== id && String(c.contestId) !== String(id)));
        await loadTfc();
      } else if (type === "tfc_report") {
        await deleteAdminTfcReport(id);
        setTfcReports((prev) => prev.filter((r) => (r._id || r.id) !== id));
        await loadTfc();
      } else if (type === "request") {
        await rejectRequest(id);
        await loadRequests();
      } else if (type === "tfc_request") {
        await rejectAdminTfcRequest(id);
        await loadTfc();
      }
      setDeleteModal(null);
    } catch (err) {
      if (!handleAuthError(err)) {
        alert(err?.response?.data?.message || "Failed to delete.");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // ── TFC Action Handlers ───────────────────────────────────────────────────
  const handleApproveTfcRequest = async (id) => {
    setApprovingTfcRequestId(id);
    try {
      await approveAdminTfcRequest(id);
      await loadTfc();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to approve TFC request.");
    } finally {
      setApprovingTfcRequestId(null);
    }
  };

  const handleRejectTfcRequest = async (id) => {
    setRejectingTfcRequestId(id);
    try {
      await rejectAdminTfcRequest(id);
      await loadTfc();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to reject TFC request.");
    } finally {
      setRejectingTfcRequestId(null);
    }
  };

  const handleApproveAllTfcRequests = async () => {
    const count = tfcRequests.filter((r) => r.status === "pending").length;
    if (count === 0) return;
    if (!window.confirm(`Are you sure you want to approve all ${count} pending TFC requests?`)) {
      return;
    }
    setIsApprovingAllTfc(true);
    try {
      const res = await approveAllAdminTfcRequests();
      await loadTfc();
      alert(res?.message || `Approved all ${count} requests successfully.`);
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to approve all TFC requests.");
    } finally {
      setIsApprovingAllTfc(false);
    }
  };

  const handleToggleParticipation = async (participantId, contestId, currentExcluded) => {
    const cellKey = `${participantId}-${contestId}`;
    if (togglingCell === cellKey) return;
    setTogglingCell(cellKey);
    const newExcluded = !currentExcluded;

    // Optimistic update
    setParticipationMatrix((prev) =>
      prev.map((row) => {
        if (row.id === participantId) {
          const updatedEx = newExcluded
            ? Array.from(new Set([...(row.excludedContests || []), Number(contestId)]))
            : (row.excludedContests || []).filter((id) => Number(id) !== Number(contestId));
          return { ...row, excludedContests: updatedEx };
        }
        return row;
      })
    );

    try {
      await toggleAdminTfcParticipation({
        participantId,
        contestId: Number(contestId),
        excluded: newExcluded,
      });
      // Background reload standings
      getTfcStandings().then((data) => {
        if (data?.standingsByType) setTfcStandingsMap(data.standingsByType);
        setTfcStandingsData(data?.standings || []);
      }).catch(() => {});
    } catch (err) {
      // Revert optimistic update
      setParticipationMatrix((prev) =>
        prev.map((row) => {
          if (row.id === participantId) {
            const revertedEx = currentExcluded
              ? Array.from(new Set([...(row.excludedContests || []), Number(contestId)]))
              : (row.excludedContests || []).filter((id) => Number(id) !== Number(contestId));
            return { ...row, excludedContests: revertedEx };
          }
          return row;
        })
      );
      alert(err?.response?.data?.message || "Failed to update contest exclusion.");
    } finally {
      setTogglingCell(null);
    }
  };

  const handleSaveTfcTopNLimit = async (limitVal) => {
    const val = parseInt(limitVal, 10);
    if (isNaN(val) || val < 0) {
      return alert("Please enter a valid positive number or 0 for unlimited.");
    }
    setIsSavingTfcConfig(true);
    setTfcConfigToast("");
    try {
      await updateAdminTfcConfig({ topNLimit: val });
      setTfcTopNLimit(val);
      setTfcConfigToast(`✓ User view limit saved: Top ${val > 0 ? val : "All"} participants will be shown.`);
      setTimeout(() => setTfcConfigToast(""), 4000);
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to update TFC configuration.");
    } finally {
      setIsSavingTfcConfig(false);
    }
  };

  const toggleTfcStandingsBatch = (b) => {
    setTfcStandingsBatches((prev) =>
      prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]
    );
  };

  const toggleParticipationBatch = (b) => {
    setParticipationBatches((prev) =>
      prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]
    );
  };

  // Available batches for Admin TFC Standings
  const adminTfcStandingsBatches = useMemo(() => {
    const s = new Set();
    const list = tfcStandingsMap[tfcStandingsType] || tfcStandingsData;
    list.forEach((r) => {
      const b = normalizeBatch(r.batch);
      if (b) s.add(b);
    });
    return Array.from(s).sort((a, b) => {
      const na = parseInt(extractBatchDigits(a) || "0", 10);
      const nb = parseInt(extractBatchDigits(b) || "0", 10);
      return nb - na;
    });
  }, [tfcStandingsMap, tfcStandingsType, tfcStandingsData]);

  // Displayed Full Standings for Admin
  const displayedAdminTfcStandings = useMemo(() => {
    const rawList = tfcStandingsMap[tfcStandingsType] || tfcStandingsData;
    let list = rawList.slice();

    // 1. Filter out participants not meeting the configured minimum contest participation
    if (tfcStandingsMinContests > 0) {
      list = list.filter((r) => (r.contests || 0) >= tfcStandingsMinContests);
    }

    // 2. Filter by batch FIRST!
    if (tfcStandingsBatches.length > 0) {
      list = list.filter((r) => {
        const b = normalizeBatch(r.batch);
        return b && tfcStandingsBatches.includes(b);
      });
    }

    // 3. Sort strictly by rating descending so we establish canonical ranks in this batch/configuration
    list.sort((a, b) => {
      const diff = (Number(b.rating) || 0) - (Number(a.rating) || 0);
      if (diff !== 0) return diff;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });

    // 4. Assign true standings ranking in this batch selection!
    list = list.map((r, idx) => ({
      ...r,
      globalRank: r.globalRank || r.rank,
      batchRank: idx + 1,
      rank: idx + 1, // Standings rank for this batch!
    }));

    // 5. Filter by search query (if admin searches within this batch)
    if (tfcStandingsSearch.trim()) {
      const q = tfcStandingsSearch.trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r.name && r.name.toLowerCase().includes(q)) ||
          (r.roll && r.roll.toLowerCase().includes(q)) ||
          (r.codeforcesHandle && r.codeforcesHandle.toLowerCase().includes(q)) ||
          (r.vjudgeHandles && r.vjudgeHandles.some((h) => h.toLowerCase().includes(q)))
      );
    }

    // 6. User column sort (if clicking headers)
    if (tfcStandingsSortField !== "rank" || tfcStandingsSortDir !== "asc") {
      list.sort((a, b) => {
        let valA = a[tfcStandingsSortField];
        let valB = b[tfcStandingsSortField];
        if (tfcStandingsSortField === "rank" || tfcStandingsSortField === "contests") {
          valA = Number(valA) || 0;
          valB = Number(valB) || 0;
        } else if (tfcStandingsSortField === "rating") {
          valA = Number(a.rating) || 0;
          valB = Number(b.rating) || 0;
        } else {
          valA = String(valA || "").toLowerCase();
          valB = String(valB || "").toLowerCase();
        }
        if (valA < valB) return tfcStandingsSortDir === "asc" ? -1 : 1;
        if (valA > valB) return tfcStandingsSortDir === "asc" ? 1 : -1;
        return 0;
      });
    }

    return list;
  }, [tfcStandingsMap, tfcStandingsType, tfcStandingsData, tfcStandingsMinContests, tfcStandingsBatches, tfcStandingsSearch, tfcStandingsSortField, tfcStandingsSortDir]);

  // Available batches for Participation Matrix
  const adminParticipationBatches = useMemo(() => {
    const s = new Set();
    participationMatrix.forEach((r) => {
      const b = normalizeBatch(r.batch);
      if (b) s.add(b);
    });
    return Array.from(s).sort((a, b) => {
      const na = parseInt(extractBatchDigits(a) || "0", 10);
      const nb = parseInt(extractBatchDigits(b) || "0", 10);
      return nb - na;
    });
  }, [participationMatrix]);

  // Displayed Participation Matrix
  const displayedParticipationMatrix = useMemo(() => {
    let list = participationMatrix.slice();

    if (participationBatches.length > 0) {
      list = list.filter((r) => {
        const b = normalizeBatch(r.batch);
        return b && participationBatches.includes(b);
      });
    }

    if (participationSearch.trim()) {
      const q = participationSearch.trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r.name && r.name.toLowerCase().includes(q)) ||
          (r.roll && r.roll.toLowerCase().includes(q)) ||
          (r.vjudgeHandles && r.vjudgeHandles.some((h) => h.toLowerCase().includes(q)))
      );
    }

    return list;
  }, [participationMatrix, participationBatches, participationSearch]);

  // Available batches for TFC Participants subtab
  const adminTfcPartBatches = useMemo(() => {
    const s = new Set();
    tfcParticipants.forEach((r) => {
      const b = normalizeBatch(r.batch);
      if (b) s.add(b);
    });
    return Array.from(s).sort((a, b) => {
      const na = parseInt(extractBatchDigits(a) || "0", 10);
      const nb = parseInt(extractBatchDigits(b) || "0", 10);
      return nb - na;
    });
  }, [tfcParticipants]);

  // Displayed TFC Participants
  const displayedAdminTfcParticipants = useMemo(() => {
    let list = tfcParticipants.slice();

    if (tfcPartBatches.length > 0) {
      list = list.filter((r) => {
        const b = normalizeBatch(r.batch);
        return b && tfcPartBatches.includes(b);
      });
    }

    if (tfcPartSearch.trim()) {
      const q = tfcPartSearch.trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r.name && r.name.toLowerCase().includes(q)) ||
          (r.roll && r.roll.toLowerCase().includes(q)) ||
          (r.codeforcesHandle && r.codeforcesHandle.toLowerCase().includes(q)) ||
          (r.vjudgeHandles && r.vjudgeHandles.some((h) => h.toLowerCase().includes(q))) ||
          (r.playlistUrl && r.playlistUrl.toLowerCase().includes(q))
      );
    }

    return list;
  }, [tfcParticipants, tfcPartBatches, tfcPartSearch]);

  // Available batches for TFC Requests subtab
  const adminTfcRequestBatches = useMemo(() => {
    const s = new Set();
    tfcRequests.forEach((r) => {
      const b = normalizeBatch(r.batch);
      if (b) s.add(b);
    });
    return Array.from(s).sort((a, b) => {
      const na = parseInt(extractBatchDigits(a) || "0", 10);
      const nb = parseInt(extractBatchDigits(b) || "0", 10);
      return nb - na;
    });
  }, [tfcRequests]);

  // Displayed TFC Requests
  const displayedAdminTfcRequests = useMemo(() => {
    let list = tfcRequests.filter((r) => r.status === "pending");

    if (tfcRequestBatches.length > 0) {
      list = list.filter((r) => {
        const b = normalizeBatch(r.batch);
        return b && tfcRequestBatches.includes(b);
      });
    }

    if (tfcRequestSearch.trim()) {
      const q = tfcRequestSearch.trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r.name && r.name.toLowerCase().includes(q)) ||
          (r.roll && r.roll.toLowerCase().includes(q)) ||
          (r.codeforcesHandle && r.codeforcesHandle.toLowerCase().includes(q)) ||
          (r.vjudgeHandles && r.vjudgeHandles.some((h) => h.toLowerCase().includes(q)))
      );
    }

    return list;
  }, [tfcRequests, tfcRequestBatches, tfcRequestSearch]);

  // Displayed TFC Contests
  const displayedAdminTfcContests = useMemo(() => {
    let list = tfcContests.slice();
    if (tfcContestSearch.trim()) {
      const q = tfcContestSearch.trim().toLowerCase();
      list = list.filter(
        (c) =>
          String(c.contestId).includes(q) ||
          (c.title && c.title.toLowerCase().includes(q))
      );
    }
    return list;
  }, [tfcContests, tfcContestSearch]);

  // Displayed TFC Reports
  const displayedAdminTfcReports = useMemo(() => {
    let list = tfcReports.filter((r) => r.status === "pending");
    if (tfcReportSearch.trim()) {
      const q = tfcReportSearch.trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r.participantName && r.participantName.toLowerCase().includes(q)) ||
          (r.participantRoll && r.participantRoll.toLowerCase().includes(q)) ||
          (r.videoTitle && r.videoTitle.toLowerCase().includes(q)) ||
          (r.category && r.category.toLowerCase().includes(q)) ||
          (r.explanation && r.explanation.toLowerCase().includes(q))
      );
    }
    return list;
  }, [tfcReports, tfcReportSearch]);

  // Auto-select contest for Admin Contest Standings subtab
  useEffect(() => {
    if (tfcContests.length > 0 && !adminSelectedContestId) {
      setAdminSelectedContestId(String(tfcContests[0].contestId));
    }
  }, [tfcContests, adminSelectedContestId]);

  // Fetch single contest standings for Admin Contest Standings subtab
  useEffect(() => {
    if (!adminSelectedContestId) return;
    const cacheKey = String(adminSelectedContestId);
    if (adminContestStandingsCache.current[cacheKey]) {
      setAdminContestStandingsData(adminContestStandingsCache.current[cacheKey]);
      setAdminContestStandingsLoading(false);
      return;
    }

    let isMounted = true;
    setAdminContestStandingsLoading(true);
    setAdminContestStandingsError("");

    getTfcContestStandings(adminSelectedContestId)
      .then((data) => {
        if (isMounted) {
          adminContestStandingsCache.current[cacheKey] = data;
          setAdminContestStandingsData(data);
        }
      })
      .catch(() => {
        if (isMounted) setAdminContestStandingsError("Failed to load contest standings.");
      })
      .finally(() => {
        if (isMounted) setAdminContestStandingsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [adminSelectedContestId]);

  // Displayed Admin Contest Standings
  const displayedAdminContestStandings = useMemo(() => {
    if (!adminContestStandingsData?.standings) return [];
    let list = adminContestStandingsData.standings;
    if (adminContestSearchQuery.trim()) {
      const q = adminContestSearchQuery.trim().toLowerCase();
      list = list.filter((item) => {
        return (
          (item.name && item.name.toLowerCase().includes(q)) ||
          (item.roll && item.roll.toLowerCase().includes(q)) ||
          (item.teamName && item.teamName.toLowerCase().includes(q)) ||
          (item.codeforcesHandle && item.codeforcesHandle.toLowerCase().includes(q)) ||
          (item.vjudgeHandles && item.vjudgeHandles.some((h) => h.toLowerCase().includes(q)))
        );
      });
    }
    return list;
  }, [adminContestStandingsData, adminContestSearchQuery]);

  const handleQuickAddUnregisteredParticipant = (vjudgeHandle) => {
    setTfcPartName("");
    setTfcPartRoll("");
    setTfcPartBatch("");
    setTfcPartHandles([vjudgeHandle]);
    setTfcPartCf("");
    setTfcPartPlaylist("");
    setTfcPartError("");
    setAddTfcPartModalOpen(true);
  };

  const handleCreateTfcParticipant = async () => {
    setTfcPartError("");
    if (!tfcPartName.trim() || !tfcPartRoll.trim() || !tfcPartBatch.trim()) {
      return setTfcPartError("Name, roll, and batch are required.");
    }
    const cleanHandles = tfcPartHandles.map((h) => h.trim()).filter(Boolean);
    if (!cleanHandles.length) {
      return setTfcPartError("At least one VJudge handle is required.");
    }
    setIsAddingTfcPart(true);
    try {
      await createAdminTfcParticipant({
        name: tfcPartName.trim(),
        roll: tfcPartRoll.trim(),
        batch: tfcPartBatch.trim().toUpperCase(),
        vjudgeHandles: cleanHandles,
        codeforcesHandle: tfcPartCf.trim(),
        playlistUrl: tfcPartPlaylist.trim(),
      });
      setTfcPartName("");
      setTfcPartRoll("");
      setTfcPartBatch("");
      setTfcPartHandles([""]);
      setTfcPartCf("");
      setTfcPartPlaylist("");
      setAddTfcPartModalOpen(false);
      await loadTfc();
    } catch (err) {
      setTfcPartError(err?.response?.data?.message || "Failed to add participant.");
    } finally {
      setIsAddingTfcPart(false);
    }
  };

  const handleCreateTfcContest = async () => {
    if (!tfcContestIdInput.trim()) return;
    setIsAddingTfcContest(true);
    try {
      await createAdminTfcContest({
        contestId: tfcContestIdInput.trim(),
        title: tfcContestTitleInput.trim(),
      });
      setTfcContestIdInput("");
      setTfcContestTitleInput("");
      setAddTfcContestModalOpen(false);
      await loadTfc();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to add TFC contest.");
    } finally {
      setIsAddingTfcContest(false);
    }
  };

  const [isSyncingTfcContests, setIsSyncingTfcContests] = useState(false);
  const [syncingTfcContestId, setSyncingTfcContestId] = useState(null);

  const handleSyncTfcContests = async () => {
    if (isSyncingTfcContests) return;
    try {
      setIsSyncingTfcContests(true);
      const res = await syncAdminTfcContests();
      alert(res?.message || "TFC contests synced successfully.");
      await loadTfc();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to sync TFC contests.");
    } finally {
      setIsSyncingTfcContests(false);
    }
  };

  const handleSyncSingleTfcContest = async (id) => {
    if (syncingTfcContestId) return;
    try {
      setSyncingTfcContestId(id);
      await syncAdminTfcContest(id);
      await loadTfc();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to sync contest.");
    } finally {
      setSyncingTfcContestId(null);
    }
  };

  const [isSyncingVjudgeContests, setIsSyncingVjudgeContests] = useState(false);
  const [syncingVjudgeContestId, setSyncingVjudgeContestId] = useState(null);

  const handleSyncVjudgeContests = async () => {
    if (isSyncingVjudgeContests) return;
    try {
      setIsSyncingVjudgeContests(true);
      const res = await syncVjudgeContests();
      alert(res?.message || "VJudge contests synced successfully.");
      await loadVjudge();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to sync VJudge contests.");
    } finally {
      setIsSyncingVjudgeContests(false);
    }
  };

  const handleSyncSingleVjudgeContest = async (id) => {
    if (syncingVjudgeContestId) return;
    try {
      setSyncingVjudgeContestId(id);
      await syncVjudgeContest(id);
      await loadVjudge();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to sync VJudge contest.");
    } finally {
      setSyncingVjudgeContestId(null);
    }
  };

  const handleUpdateReportStatus = async (id, status) => {
    try {
      await updateAdminTfcReport(id, { status });
      await loadTfc();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to update report status.");
    }
  };

  const [refreshingHandleId, setRefreshingHandleId] = useState(null);
  const handleForceRefresh = async (id, handle) => {
    if (!id || refreshingHandleId) return;
    try {
      setRefreshingHandleId(id);
      const result = await forceRefreshHandle(id);
      alert(result?.message || `${handle} refreshed successfully.`);
      await loadHandles();
    } catch (err) {
      if (!handleAuthError(err)) {
        alert(err?.response?.data?.message || "Force refresh failed.");
      }
    } finally {
      setRefreshingHandleId(null);
    }
  };

  const [refreshingTeamId, setRefreshingTeamId] = useState(null);
  const handleRefreshTeam = async (id, teamName) => {
    if (!id || refreshingTeamId) return;
    try {
      setRefreshingTeamId(id);
      const result = await refreshVjudgeTeam(id);
      alert(result?.message || `Team ${teamName} refreshed successfully.`);
      await loadVjudge();
    } catch (err) {
      if (!handleAuthError(err)) {
        alert(err?.response?.data?.message || "Team refresh failed.");
      }
    } finally {
      setRefreshingTeamId(null);
    }
  };

  const [isRefreshingAllVjudge, setIsRefreshingAllVjudge] = useState(false);
  const handleRefreshAllVjudge = async () => {
    if (isRefreshingAllVjudge) return;
    try {
      setIsRefreshingAllVjudge(true);
      const result = await refreshAllVjudgeContests();
      alert(result?.message || "VJudge contests refreshed successfully.");
      await loadVjudge();
    } catch (err) {
      if (!handleAuthError(err)) {
        alert(err?.response?.data?.message || "Failed to refresh VJudge standings.");
      }
    } finally {
      setIsRefreshingAllVjudge(false);
    }
  };

  // ── Request Approval ───────────────────────────────────────────────────────
  const handleApproveRequest = async (id) => {
    if (approvingRequestId || rejectingRequestId) return;
    try {
      setApprovingRequestId(id);
      setRequestSuccessId(null);
      await approveRequest(id);
      await loadRequests();
      await loadHandles();
      await loadVjudge();
      setRequestSuccessId(id);
      setTimeout(() => setRequestSuccessId(null), 1200);
    } catch (err) {
      setRequestsError(err?.response?.data?.message || "Unable to approve request");
    } finally {
      setApprovingRequestId(null);
    }
  };

  const handleRejectRequest = async (id) => {
    if (approvingRequestId || rejectingRequestId) return;
    try {
      setRejectingRequestId(id);
      setRequestSuccessId(null);
      await rejectRequest(id);
      await loadRequests();
      setRequestSuccessId(id);
      setTimeout(() => setRequestSuccessId(null), 1200);
    } catch (err) {
      setRequestsError(err?.response?.data?.message || "Unable to reject request");
    } finally {
      setRejectingRequestId(null);
    }
  };

  // ── Passkey & Admin Profile ────────────────────────────────────────────────
  const handleUpdatePasskey = async () => {
    setPasskeyMessage("");
    if (!passkeyValue.trim() || !passkeyConfirm.trim()) return setPasskeyMessage("Passkey fields required.");
    if (passkeyValue.trim() !== passkeyConfirm.trim()) return setPasskeyMessage("Passkeys do not match.");
    try {
      await updatePasskey({ newPasskey: passkeyValue.trim() });
      setPasskeyMessage("Passkey updated successfully.");
      setPasskeyValue(""); setPasskeyConfirm("");
      setTimeout(() => setShowPasskeyModal(false), 1200);
    } catch (err) { setPasskeyMessage(err?.response?.data?.message || "Failed to update passkey."); }
  };

  const handleUpdateCredentials = async () => {
    setCredMessage(""); setCredError("");
    if (!currentPassword) return setCredError("Current password is required.");
    if (credentialTab === "username" && !newUsername.trim()) return setCredError("New username is required.");
    if (credentialTab === "password") {
      if (!newPassword) return setCredError("New password is required.");
      if (!confirmPassword) return setCredError("Confirm password is required.");
      if (newPassword !== confirmPassword) return setCredError("New password and confirm password do not match.");
    }
    try {
      await updateAdminCredentials({
        currentPassword,
        newUsername: credentialTab === "username" ? newUsername.trim() : undefined,
        newPassword: credentialTab === "password" ? newPassword : undefined,
      });
      setCredMessage("Credentials updated successfully!");
      setCurrentPassword(""); setNewUsername(""); setNewPassword(""); setConfirmPassword("");
      setTimeout(() => setShowCredentialsModal(false), 1200);
    } catch (err) { setCredError(err?.response?.data?.message || "Failed to update credentials."); }
  };

  const logout = () => {
    localStorage.removeItem("sgipc_token");
    window.location.href = "/admin";
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="container">
      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <div className="hero">
        <div className="hero-inner">
          <div>
            <span className="badge">Admin Panel</span>
            <h1>SGIPC <span className="accent">Management</span></h1>
            <p>Manage standings, handles, teams, and request approvals</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="secondary sm" onClick={() => { setShowCredentialsModal(true); setCredMessage(""); setCredError(""); }}>
              🔑 Account Credentials
            </button>
            <button className="secondary sm" onClick={() => { setShowPasskeyModal(true); setPasskeyMessage(""); }}>
              🔒 Update Passkey
            </button>
            <button className="danger sm" onClick={logout}>
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* ── TABS (PERSISTENT VIA SESSIONSTORAGE) ───────────────────────────── */}
      <div className="tabs">
        <button className={`tab ${activeTab === "individual" ? "active" : ""}`} onClick={() => switchTab("individual")}>
          🏆 Individual Handles
        </button>
        <button className={`tab ${activeTab === "team" ? "active" : ""}`} onClick={() => switchTab("team")}>
          👥 Teams &amp; Contests
        </button>
        <button className={`tab ${activeTab === "requests" ? "active" : ""}`} onClick={() => switchTab("requests")}>
          📥 Requests
          {requestsCount > 0 && (
            <span style={{ marginLeft: 6, background: "var(--danger)", color: "#fff", borderRadius: 999, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>
              {requestsCount}
            </span>
          )}
        </button>
        <button className={`tab ${activeTab === "tfc" ? "active" : ""}`} onClick={() => switchTab("tfc")}>
          🎯 TFC Corner
          {(tfcRequests.filter((r) => r.status === "pending").length > 0 || tfcReports.filter((r) => r.status === "pending").length > 0) && (
            <span style={{ marginLeft: 6, background: "var(--danger)", color: "#fff", borderRadius: 999, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>
              {tfcRequests.filter((r) => r.status === "pending").length + tfcReports.filter((r) => r.status === "pending").length}
            </span>
          )}
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          INDIVIDUAL HANDLES TAB
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "individual" && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Codeforces Participants ({filteredHandles.length})</h2>
              <p className="card-subtitle">Active individual standings participants</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="secondary sm" onClick={loadHandles} disabled={loading}>
                {loading ? "Refreshing…" : "↻ Refresh"}
              </button>
              <button className="primary sm" onClick={() => { setAddHandleError(""); setAddHandleModalOpen(true); }}>
                ＋ Add Participant
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          {!loading && handles.length > 0 && (
            <div className="filter-bar">
              <div className="filter-section">
                <button className="secondary sm" onClick={() => setBatchFilterOpen(!batchFilterOpen)}>
                  🎓 Batch{selectedBatches.length > 0 && (
                    <span style={{ marginLeft: 5, background: "var(--primary)", color: "#fff", borderRadius: 999, padding: "0 6px", fontSize: 10, fontWeight: 700 }}>
                      {selectedBatches.length}
                    </span>
                  )}
                </button>
                {selectedBatches.map((b) => (
                  <span key={b} className="batch-tag" onClick={() => toggleBatch(b)}>
                    {b} <span>×</span>
                  </span>
                ))}
                {selectedBatches.length > 0 && (
                  <button className="secondary sm" onClick={() => setSelectedBatches([])}>Clear</button>
                )}
              </div>
              <div style={{ width: "100%", maxWidth: 340 }}>
                <div className="search-wrapper">
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    placeholder="Search handle, name or roll..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && <button className="search-clear" onClick={() => setSearchQuery("")}>×</button>}
                </div>
              </div>
            </div>
          )}

          {batchFilterOpen && availableBatches.length > 0 && (
            <div className="batch-dropdown">
              {availableBatches.map((b) => (
                <label key={b} className={`batch-checkbox-label ${selectedBatches.includes(b) ? "selected" : ""}`}>
                  <input type="checkbox" checked={selectedBatches.includes(b)} onChange={() => toggleBatch(b)} style={{ width: "auto", accentColor: "var(--primary)" }} />
                  {b}
                </label>
              ))}
            </div>
          )}

          {loading && <div className="empty-state"><div className="loading-spinner" /><p>Loading handles...</p></div>}
          {!loading && error && <div className="notice error">{error}</div>}
          {!loading && !error && filteredHandles.length === 0 && (
            <div className="empty-state"><p>No handles found.</p></div>
          )}

          {!loading && filteredHandles.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>#</th>
                  <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSortClick("handle")}>
                    Handle / Name <SortIcon active={sortField === "handle"} direction={sortDir} />
                  </th>
                  <th>Roll</th>
                  <th>Batch</th>
                  <th style={{ width: 95, cursor: "pointer", userSelect: "none" }} onClick={() => handleSortClick("maxRating")}>
                    CF Max <SortIcon active={sortField === "maxRating"} direction={sortDir} />
                  </th>
                  <th style={{ width: 85, cursor: "pointer", userSelect: "none" }} onClick={() => handleSortClick("solvedCount")}>
                    Solved <SortIcon active={sortField === "solvedCount"} direction={sortDir} />
                  </th>
                  <th style={{ width: 115, cursor: "pointer", userSelect: "none" }} onClick={() => handleSortClick("standingRating")}>
                    Practice <SortIcon active={sortField === "standingRating"} direction={sortDir} />
                  </th>
                  <th style={{ width: 50, textAlign: "center" }}>Info</th>
                  <th style={{ width: 140, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHandles.map((row, idx) => {
                  const isEditing = editingHandleId === row._id;
                  const currentRank = globalRankMap.get(String(row._id || row.id)) ?? (idx + 1);
                  return (
                    <tr key={row._id}>
                      <td style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontSize: 13 }}>
                        {currentRank}
                      </td>
                      <td>
                        <a href={`https://codeforces.com/profile/${row.handle}`} target="_blank" rel="noopener noreferrer" className="handle-name">
                          {row.handle}
                        </a>
                        {isEditing ? (
                          <div style={{ marginTop: 4 }}>
                            <input
                              type="text"
                              placeholder="Full Name"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              style={{ padding: "3px 6px", fontSize: 12 }}
                            />
                          </div>
                        ) : (
                          row.name && <div className="handle-sub">{row.name}</div>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input type="text" value={editingRoll} onChange={(e) => setEditingRoll(e.target.value)} style={{ padding: "4px 8px" }} />
                        ) : (
                          <span className="text-mono">{row.roll || "—"}</span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input type="text" value={editingBatch} onChange={(e) => setEditingBatch(e.target.value)} style={{ padding: "4px 8px" }} />
                        ) : (
                          <span className="text-mono">{normalizeBatch(row.batch) || row.batch || "—"}</span>
                        )}
                      </td>
                      <td><span className="stat-badge rating">{row.maxRating || "—"}</span></td>
                      <td><span className="stat-badge solved">{row.solvedCount || 0}</span></td>
                      <td style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--primary)" }}>{row.standingRating || 1000}</td>
                      <td style={{ textAlign: "center" }}>
                        <button className="icon-btn" onClick={() => setHandleDetailModal(row)} title="View details">👁</button>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          {isEditing ? (
                            <>
                              <button className="primary xs" onClick={() => saveEditingHandle(row._id || row.id)}>Save</button>
                              <button className="secondary xs" onClick={() => setEditingHandleId(null)}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button className="secondary xs" onClick={() => startEditingHandle(row)}>Edit</button>
                              <button
                                className="secondary xs"
                                onClick={() => handleForceRefresh(row._id || row.id, row.handle)}
                                disabled={refreshingHandleId === (row._id || row.id)}
                                title="Force re-fetch from Codeforces and re-activate if inactive"
                                style={refreshingHandleId === (row._id || row.id) ? { opacity: 0.6 } : {}}
                              >
                                {refreshingHandleId === (row._id || row.id) ? "⏳" : "🔄"}
                              </button>
                              <button
                                className="danger xs"
                                onClick={() => setDeleteModal({ type: "handle", id: row._id || row.id, name: row.name ? `${row.name} (${row.handle})` : row.handle })}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TEAM STANDINGS TAB
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "team" && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2>VJudge Teams ({vjudgeTeams.length})</h2>
              <p className="card-subtitle">Manage teams for team contest standings</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="secondary sm" onClick={loadVjudge} disabled={loading}>
                {loading ? "Refreshing…" : "↻ Refresh"}
              </button>
              <button className="secondary sm" onClick={handleRefreshAllVjudge} disabled={isRefreshingAllVjudge}>
                {isRefreshingAllVjudge ? "Refreshing VJudge…" : "↻ Refresh VJudge Standings"}
              </button>
              <button className="primary sm" onClick={() => { setAddTeamError(""); setAddTeamModalOpen(true); }}>
                ＋ Add Team
              </button>
            </div>
          </div>

          {/* Teams Table */}
          {vjudgeTeams.length === 0 ? (
            <div className="empty-state"><p>No teams registered yet.</p></div>
          ) : (
            <table className="table" style={{ marginBottom: 32 }}>
              <thead>
                <tr>
                  <th style={{ width: 44 }}>#</th>
                  <th>Team Name</th>
                  <th>VJudge Handle</th>
                  <th style={{ width: 50, textAlign: "center" }}>Info</th>
                  <th style={{ width: 140, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {vjudgeTeams.map((team, idx) => {
                  const isEditing = editingTeamId === team._id;
                  return (
                    <tr key={team._id}>
                      <td style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{idx + 1}</td>
                      <td>
                        {isEditing ? (
                          <input type="text" value={editingTeamName} onChange={(e) => setEditingTeamName(e.target.value)} style={{ padding: "4px 8px" }} />
                        ) : (
                          <strong style={{ color: "var(--text-primary)" }}>{team.name}</strong>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input type="text" value={editingTeamAliases} onChange={(e) => setEditingTeamAliases(e.target.value)} style={{ padding: "4px 8px" }} />
                        ) : (
                          <span className="text-mono" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                            {team.aliases?.join(", ") || "—"}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button className="icon-btn" onClick={() => setTeamDetailModal(team)} title="View team details">
                          👁
                        </button>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          {isEditing ? (
                            <>
                              <button className="primary xs" onClick={async () => {
                                const aliases = editingTeamAliases.split(",").map((x) => x.trim()).filter(Boolean);
                                await updateVjudgeTeam(team._id || team.id, { name: editingTeamName.trim(), aliases });
                                setEditingTeamId(null);
                                await loadVjudge();
                              }}>Save</button>
                              <button className="secondary xs" onClick={() => setEditingTeamId(null)}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button className="secondary xs" onClick={() => {
                                setEditingTeamId(team._id || team.id);
                                setEditingTeamName(team.name);
                                setEditingTeamAliases(team.aliases?.join(", ") || "");
                              }}>Edit</button>
                              <button
                                className="secondary xs"
                                onClick={() => handleRefreshTeam(team._id || team.id, team.name)}
                                disabled={refreshingTeamId === (team._id || team.id)}
                                title="Refresh team rankings from VJudge"
                                style={refreshingTeamId === (team._id || team.id) ? { opacity: 0.6 } : {}}
                              >
                                {refreshingTeamId === (team._id || team.id) ? "⏳" : "🔄"}
                              </button>
                              <button
                                className="danger xs"
                                onClick={() => setDeleteModal({ type: "team", id: team._id || team.id, name: team.name })}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div className="section-divider" />

          {/* Contests Section */}
          <div className="card-header" style={{ marginTop: 24, flexWrap: "wrap", gap: 10 }}>
            <div>
              <h2>VJudge Contests ({vjudgeContests.length})</h2>
              <p className="card-subtitle">Contests included in team rating calculation</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="secondary sm"
                onClick={handleSyncVjudgeContests}
                disabled={isSyncingVjudgeContests}
              >
                {isSyncingVjudgeContests ? "Syncing Ranks…" : "🔄 Sync Ranks from VJudge"}
              </button>
              <button className="secondary sm" onClick={() => setAddContestModalOpen(true)}>
                ＋ Add Contest
              </button>
            </div>
          </div>

          {vjudgeContests.length === 0 ? (
            <div className="empty-state"><p>No contests added yet.</p></div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Contest ID</th>
                  <th>Title</th>
                  <th style={{ width: 120 }}>Rank Data</th>
                  <th style={{ width: 90 }}>Status</th>
                  <th style={{ width: 180, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {vjudgeContests.map((c) => {
                  const isEditing = editingContestId === c._id;
                  const isEnabled = c.enabled !== false;
                  const hasData = Array.isArray(c.ranklist) && c.ranklist.length > 0;
                  const isSyncingThis = syncingVjudgeContestId === c._id;
                  return (
                    <tr key={c._id}>
                      <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                        {isEditing ? (
                          <input type="text" value={editingContestValue} onChange={(e) => setEditingContestValue(e.target.value)} style={{ padding: "3px 6px", width: 90 }} />
                        ) : (
                          c.contestId
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input type="text" value={editingContestTitle} onChange={(e) => setEditingContestTitle(e.target.value)} style={{ padding: "3px 6px", width: "100%" }} />
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontWeight: 600 }}>{c.title || "Untitled Contest"}</span>
                            <button
                              className="icon-btn"
                              title="Edit contest"
                              style={{ padding: "2px 4px", fontSize: 13 }}
                              onClick={() => {
                                setEditingContestId(c._id);
                                setEditingContestValue(String(c.contestId || ""));
                                setEditingContestTitle(c.title || "");
                              }}
                            >
                              ✏️
                            </button>
                          </div>
                        )}
                      </td>
                      <td>
                        {hasData ? (
                          <span style={{ fontSize: 12, color: "var(--success)" }}>
                            ✓ {c.ranklist.length} ranks
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--warning)" }}>
                            ⚠ Not synced
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          className={isEnabled ? "success xs" : "secondary xs"}
                          style={{
                            padding: "3px 10px",
                            borderRadius: "999px",
                            fontWeight: 600,
                            fontSize: 11,
                            background: isEnabled ? "var(--success-light)" : "var(--bg-subtle)",
                            color: isEnabled ? "var(--success)" : "var(--text-muted)",
                            border: `1px solid ${isEnabled ? "var(--success)" : "var(--border)"}`,
                            cursor: "pointer"
                          }}
                          onClick={async () => {
                            try {
                              await updateVjudgeContest(c._id, { enabled: !isEnabled });
                              await loadVjudge();
                            } catch (err) {
                              if (!handleAuthError(err)) {
                                alert(err?.response?.data?.message || "Failed to update contest status.");
                              }
                            }
                          }}
                        >
                          {isEnabled ? "● Enabled" : "○ Disabled"}
                        </button>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          {isEditing ? (
                            <>
                              <button className="primary xs" onClick={async () => {
                                try {
                                  await updateVjudgeContest(c._id, { contestId: editingContestValue.trim(), title: editingContestTitle.trim() });
                                  setEditingContestId(null);
                                  await loadVjudge();
                                } catch (err) {
                                  alert(err?.response?.data?.message || "Failed to update contest.");
                                }
                              }}>Save</button>
                              <button className="secondary xs" onClick={() => setEditingContestId(null)}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button
                                className="secondary xs"
                                disabled={isSyncingThis}
                                onClick={() => handleSyncSingleVjudgeContest(c._id)}
                              >
                                {isSyncingThis ? "Syncing…" : "Sync"}
                              </button>
                              <button className="danger xs" onClick={() => setDeleteModal({ type: "contest", id: c._id || c.id, name: c.title || `Contest #${c.contestId}` })}>Delete</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          REQUESTS TAB
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "requests" && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Pending Requests ({requests.length})</h2>
              <p className="card-subtitle">User requests for handles, team registrations &amp; reactivations</p>
            </div>
            <button className="secondary sm" onClick={loadRequests}>↻ Refresh</button>
          </div>

          {requestsLoading && <div className="empty-state"><div className="loading-spinner" /><p>Loading requests...</p></div>}
          {!requestsLoading && requestsError && <div className="notice error">{requestsError}</div>}
          {!requestsLoading && !requestsError && requests.length === 0 && (
            <div className="empty-state"><p>🎉 No pending requests right now.</p></div>
          )}

          {!requestsLoading && !requestsError && requests.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Type</th>
                  <th>Details</th>
                  <th style={{ width: 50, textAlign: "center" }}>Info</th>
                  <th style={{ width: 180, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((reqItem) => (
                  <tr key={reqItem._id}>
                    <td>
                      <span style={{
                        display: "inline-block",
                        padding: "3px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "capitalize",
                        background: reqItem.type === "reactivation" ? "var(--info-light)" : reqItem.type === "handle" ? "var(--success-light)" : "var(--warning-light)",
                        color: reqItem.type === "reactivation" ? "var(--info)" : reqItem.type === "handle" ? "var(--success)" : "var(--warning)",
                        border: `1px solid ${reqItem.type === "reactivation" ? "var(--info-border)" : reqItem.type === "handle" ? "var(--success-border)" : "var(--warning-border)"}`,
                      }}>
                        {reqItem.type}
                      </span>
                    </td>
                    <td>
                      {reqItem.type === "handle" && (
                        <div>
                          <span className="handle-name" style={{ textDecoration: "none", cursor: "default" }}>{reqItem.handle}</span>
                          <div className="handle-sub">
                            {reqItem.name && <span>{reqItem.name}</span>}
                            {reqItem.name && reqItem.batch && " · "}
                            {reqItem.batch && <span className="text-mono">{normalizeBatch(reqItem.batch) || reqItem.batch}</span>}
                          </div>
                        </div>
                      )}
                      {reqItem.type === "reactivation" && (
                        <div>
                          <span className="handle-name" style={{ textDecoration: "none", cursor: "default" }}>{reqItem.handle}</span>
                          <div className="handle-sub">
                            {reqItem.name && <span>{reqItem.name}</span>}
                            {reqItem.name && reqItem.batch && " · "}
                            {reqItem.batch && <span className="text-mono">{normalizeBatch(reqItem.batch) || reqItem.batch}</span>}
                          </div>
                        </div>
                      )}
                      {reqItem.type === "team" && (
                        <div>
                          <strong style={{ color: "var(--text-primary)" }}>{reqItem.teamName}</strong>
                          <div className="handle-sub">{reqItem.teamHandles}</div>
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button className="icon-btn" onClick={() => setRequestDetailModal(reqItem)} title="View details">👁</button>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                        <button
                          className="success sm"
                          onClick={() => handleApproveRequest(reqItem._id)}
                          disabled={approvingRequestId === reqItem._id || rejectingRequestId === reqItem._id}
                        >
                          {approvingRequestId === reqItem._id ? "Approving…" : "Approve"}
                        </button>
                        <button
                          className="danger sm"
                          onClick={() =>
                            setDeleteModal({
                              type: "request",
                              id: reqItem._id,
                              name: reqItem.type === "team" ? `Team: ${reqItem.teamName}` : `${reqItem.name || reqItem.handle} (${reqItem.handle})`,
                            })
                          }
                          disabled={approvingRequestId === reqItem._id || rejectingRequestId === reqItem._id}
                        >
                          Reject
                        </button>
                        {requestSuccessId === reqItem._id && <span style={{ color: "var(--success)", fontWeight: 600, fontSize: 12 }}>✓ Done</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TFC CORNER MANAGEMENT TAB
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "tfc" && (
        <div className="card">
          <div className="card-header" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
            <div>
              <h2>TFC Corner Management</h2>
              <p className="card-subtitle">Manage TFC contestant requests, full standings, participation configuration &amp; anonymous reports</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button className="secondary sm" onClick={loadTfc}>↻ Refresh TFC</button>
              <button
                className="secondary sm"
                onClick={() => setIsTfcSettingsOpen(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}
                title="Configure public and admin TFC standings settings"
              >
                <span>⚙️ Standings Settings</span>
              </button>
              {tfcSubtab === "requests" && tfcRequests.filter((r) => r.status === "pending").length > 0 && (
                <button
                  className="success sm"
                  onClick={handleApproveAllTfcRequests}
                  disabled={isApprovingAllTfc}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <span>{isApprovingAllTfc ? "Approving All…" : `✓ Approve All (${tfcRequests.filter((r) => r.status === "pending").length})`}</span>
                </button>
              )}
              {tfcSubtab === "participants" && (
                <button className="primary sm" onClick={() => setAddTfcPartModalOpen(true)}>＋ Add Participant</button>
              )}
              {tfcSubtab === "contests" && (
                <>
                  <button
                    className="secondary sm"
                    onClick={handleSyncTfcContests}
                    disabled={isSyncingTfcContests}
                  >
                    {isSyncingTfcContests ? "Syncing Ranks…" : "🔄 Sync Ranks from VJudge"}
                  </button>
                  <button className="primary sm" onClick={() => setAddTfcContestModalOpen(true)}>＋ Add Contest</button>
                </>
              )}
            </div>
          </div>

          {/* Subtabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 12, flexWrap: "wrap" }}>
            {[
              { id: "requests", label: "📥 Requests", count: tfcRequests.filter((r) => r.status === "pending").length },
              { id: "standings", label: "🏆 Full Standings", count: tfcStandingsData.length },
              { id: "contest_standings", label: "🎯 Contest Standings", count: tfcContests.length },
              { id: "participation", label: "⚙️ Participation Config", count: participationMatrix.length },
              { id: "participants", label: "👥 Participants", count: tfcParticipants.length },
              { id: "contests", label: "🎯 Contests", count: tfcContests.length },
              { id: "reports", label: "🚩 Reports", count: tfcReports.filter((r) => r.status === "pending").length },
            ].map((sub) => {
              const active = tfcSubtab === sub.id;
              return (
                <button
                  key={sub.id}
                  onClick={() => setTfcSubtab(sub.id)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "var(--radius)",
                    fontSize: 13,
                    fontWeight: active ? 700 : 500,
                    background: active ? "var(--primary)" : "var(--bg-subtle)",
                    color: active ? "#ffffff" : "var(--text-secondary)",
                    border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{sub.label}</span>
                  {sub.count > 0 && (
                    <span style={{
                      background: active ? "#ffffff" : "var(--primary)",
                      color: active ? "var(--primary)" : "#ffffff",
                      borderRadius: 999,
                      padding: "1px 6px",
                      fontSize: 10,
                      fontWeight: 800,
                    }}>
                      {sub.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {tfcLoading && <div className="empty-state"><div className="loading-spinner" /><p>Loading TFC data...</p></div>}
          {!tfcLoading && tfcError && <div className="notice error">{tfcError}</div>}

          {/* Subtab 1: TFC Requests */}
          {!tfcLoading && tfcSubtab === "requests" && (
            <div>
              {tfcRequests.filter((r) => r.status === "pending").length === 0 ? (
                <div className="empty-state"><p>🎉 No pending TFC requests.</p></div>
              ) : (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        type="text"
                        placeholder="Search name, roll, handle..."
                        value={tfcRequestSearch}
                        onChange={(e) => setTfcRequestSearch(e.target.value)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "var(--radius)",
                          border: "1px solid var(--border)",
                          fontSize: 13,
                          minWidth: 220,
                        }}
                      />
                      <BatchFilter
                        batches={adminTfcRequestBatches}
                        selectedBatches={tfcRequestBatches}
                        onChange={setTfcRequestBatches}
                        placeholder="Filter Batches"
                      />
                      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        Showing <strong>{displayedAdminTfcRequests.length}</strong> of {tfcRequests.filter((r) => r.status === "pending").length} requests
                      </div>
                    </div>
                    <button
                      className="success sm"
                      onClick={handleApproveAllTfcRequests}
                      disabled={isApprovingAllTfc}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <span>{isApprovingAllTfc ? "Approving All…" : `✓ Approve All (${tfcRequests.filter((r) => r.status === "pending").length})`}</span>
                    </button>
                  </div>

                  {displayedAdminTfcRequests.length === 0 ? (
                    <div className="empty-state"><p>No requests match the selected search or batch filter.</p></div>
                  ) : (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Contestant</th>
                          <th>Roll &amp; Batch</th>
                          <th>Handles</th>
                          <th>Recordings Link</th>
                          <th style={{ width: 180, textAlign: "right" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedAdminTfcRequests.map((reqItem) => (
                          <tr key={reqItem._id}>
                            <td>
                              <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{reqItem.name}</div>
                            </td>
                            <td>
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                                {reqItem.roll} · <span className="badge" style={{ padding: "1px 6px", fontSize: 11 }}>{normalizeBatch(reqItem.batch) || reqItem.batch}</span>
                              </div>
                            </td>
                            <td>
                              <div style={{ fontSize: 12 }}>
                                {reqItem.codeforcesHandle && <div>CF: <strong>{reqItem.codeforcesHandle}</strong></div>}
                                {reqItem.vjudgeHandles && reqItem.vjudgeHandles.length > 0 && (
                                  <div style={{ color: "var(--text-muted)", marginTop: 2 }}>
                                    VJ: {reqItem.vjudgeHandles.join(", ")}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td>
                              {reqItem.playlistUrl ? (
                                <a href={reqItem.playlistUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--primary)", textDecoration: "none" }}>
                                  Playlist Link ↗
                                </a>
                              ) : (
                                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>None</span>
                              )}
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                <button
                                  className="success sm"
                                  onClick={() => handleApproveTfcRequest(reqItem._id)}
                                  disabled={approvingTfcRequestId === reqItem._id || rejectingTfcRequestId === reqItem._id}
                                >
                                  {approvingTfcRequestId === reqItem._id ? "Approving…" : "Approve"}
                                </button>
                                <button
                                  className="danger sm"
                                  onClick={() =>
                                    setDeleteModal({
                                      type: "tfc_request",
                                      id: reqItem._id,
                                      name: `TFC Request from ${reqItem.name} (${reqItem.roll})`,
                                    })
                                  }
                                  disabled={approvingTfcRequestId === reqItem._id || rejectingTfcRequestId === reqItem._id}
                                >
                                  Reject
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Subtab 2: TFC Standings (Fully Redesigned Full Standings) */}
          {!tfcLoading && tfcSubtab === "standings" && (
            <div>

              {/* ── 2. Redesigned Toolbar: Rating Engine + Settings Button ── */}
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius, 8px)",
                  padding: "14px 16px",
                  marginBottom: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {/* Row 1: Rating Engine Switcher & Settings */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                      Rating Model:
                    </span>
                    {[
                      { id: "normal", label: "Standard Elo", icon: "⭐" },
                      { id: "gain-only", label: "Gain Only", icon: "📈" },
                      { id: "zero-participation", label: "Participation Weighted", icon: "⚖️" },
                    ].map((t) => {
                      const active = tfcStandingsType === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTfcStandingsType(t.id)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: active ? 700 : 500,
                            background: active ? "var(--primary)" : "var(--bg-subtle)",
                            color: active ? "#ffffff" : "var(--text-secondary)",
                            border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            transition: "all 0.15s ease",
                          }}
                        >
                          <span>{t.icon}</span>
                          <span>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    className="secondary sm"
                    onClick={() => setIsTfcSettingsOpen(true)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}
                    title="Configure public and admin standings parameters"
                  >
                    <span>⚙️ Settings</span>
                  </button>
                </div>

                {/* Row 2: Inline Batch Filter Chips (NO MODAL OVERLAP!) */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                    🎓 Batch:
                  </span>
                  <button
                    type="button"
                    onClick={() => setTfcStandingsBatches([])}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: tfcStandingsBatches.length === 0 ? 700 : 500,
                      background: tfcStandingsBatches.length === 0 ? "var(--primary)" : "var(--bg-subtle)",
                      color: tfcStandingsBatches.length === 0 ? "#ffffff" : "var(--text-secondary)",
                      border: `1px solid ${tfcStandingsBatches.length === 0 ? "var(--primary)" : "var(--border)"}`,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    All Batches
                  </button>
                  {adminTfcStandingsBatches.map((b) => {
                    const isSelected = tfcStandingsBatches.includes(b);
                    return (
                      <button
                        key={b}
                        type="button"
                        onClick={() => toggleTfcStandingsBatch(b)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: isSelected ? 700 : 500,
                          background: isSelected ? "var(--primary-light, rgba(99, 102, 241, 0.15))" : "var(--bg-subtle)",
                          color: isSelected ? "var(--primary)" : "var(--text-secondary)",
                          border: `1px solid ${isSelected ? "var(--primary)" : "var(--border)"}`,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span>{b}</span>
                        {isSelected && <span style={{ fontWeight: 800, fontSize: 10 }}>✓</span>}
                      </button>
                    );
                  })}
                  {tfcStandingsBatches.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setTfcStandingsBatches([])}
                      style={{
                        background: "none",
                        border: "none",
                        fontSize: 11,
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        textDecoration: "underline",
                        padding: "4px 6px",
                      }}
                    >
                      Clear batches ({tfcStandingsBatches.length})
                    </button>
                  )}
                </div>

                {/* Row 3: Search + Quick Min Contests Filter + Active Count */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", flex: 1 }}>
                    <div style={{ position: "relative", minWidth: 260, maxWidth: 360, flex: 1 }}>
                      <input
                        type="text"
                        placeholder="Search participant, roll, handle..."
                        value={tfcStandingsSearch}
                        onChange={(e) => setTfcStandingsSearch(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "7px 32px 7px 12px",
                          borderRadius: "var(--radius)",
                          border: "1px solid var(--border)",
                          background: "var(--bg-input, var(--bg-card))",
                          color: "var(--text-primary)",
                          fontSize: 13,
                        }}
                      />
                      {tfcStandingsSearch && (
                        <button
                          type="button"
                          onClick={() => setTfcStandingsSearch("")}
                          style={{
                            position: "absolute",
                            right: 8,
                            top: "50%",
                            transform: "translateY(-50%)",
                            background: "transparent",
                            border: "none",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            fontSize: 14,
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>

                    {/* Quick Min Contests Filter */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                        Contests:
                      </span>
                      {[
                        { label: "All", value: 0 },
                        { label: "1+", value: 1 },
                        { label: "2+", value: 2 },
                        { label: "3+", value: 3 },
                        { label: "5+", value: 5 },
                      ].map((opt) => {
                        const active = tfcStandingsMinContests === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setTfcStandingsMinContests(opt.value)}
                            style={{
                              padding: "3px 8px",
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: active ? 700 : 500,
                              background: active ? "var(--primary)" : "var(--bg-subtle)",
                              color: active ? "#ffffff" : "var(--text-secondary)",
                              border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
                              cursor: "pointer",
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>

                    {(tfcStandingsSearch || tfcStandingsBatches.length > 0 || tfcStandingsMinContests > 0) && (
                      <button
                        type="button"
                        className="secondary xs"
                        onClick={() => {
                          setTfcStandingsSearch("");
                          setTfcStandingsBatches([]);
                          setTfcStandingsMinContests(0);
                        }}
                        style={{ color: "var(--text-muted)" }}
                      >
                        Reset Filters
                      </button>
                    )}
                  </div>

                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Showing <strong>{Math.min(displayedAdminTfcStandings.length, adminVisibleStandingsCount)}</strong> of <strong>{displayedAdminTfcStandings.length}</strong> participants
                  </div>
                </div>
              </div>

              {/* ── 3. Redesigned Table ── */}
              {displayedAdminTfcStandings.length === 0 ? (
                <div className="empty-state">
                  <p>No participants match the selected filters or no TFC standings computed yet.</p>
                </div>
              ) : (
                <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius, 8px)" }}>
                  <table className="table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th
                          style={{ width: 80, cursor: "pointer" }}
                          onClick={() => {
                            if (tfcStandingsSortField === "rank") {
                              setTfcStandingsSortDir((d) => (d === "asc" ? "desc" : "asc"));
                            } else {
                              setTfcStandingsSortField("rank");
                              setTfcStandingsSortDir("asc");
                            }
                          }}
                        >
                          Rank <SortIcon field="rank" sortField={tfcStandingsSortField} sortDir={tfcStandingsSortDir} />
                        </th>
                        <th
                          style={{ cursor: "pointer" }}
                          onClick={() => {
                            if (tfcStandingsSortField === "name") {
                              setTfcStandingsSortDir((d) => (d === "asc" ? "desc" : "asc"));
                            } else {
                              setTfcStandingsSortField("name");
                              setTfcStandingsSortDir("asc");
                            }
                          }}
                        >
                          Contestant <SortIcon field="name" sortField={tfcStandingsSortField} sortDir={tfcStandingsSortDir} />
                        </th>
                        <th
                          style={{ width: 95, cursor: "pointer" }}
                          onClick={() => {
                            if (tfcStandingsSortField === "batch") {
                              setTfcStandingsSortDir((d) => (d === "asc" ? "desc" : "asc"));
                            } else {
                              setTfcStandingsSortField("batch");
                              setTfcStandingsSortDir("desc");
                            }
                          }}
                        >
                          Batch <SortIcon field="batch" sortField={tfcStandingsSortField} sortDir={tfcStandingsSortDir} />
                        </th>
                        <th>Handles</th>
                        <th
                          style={{ width: 110, textAlign: "center", cursor: "pointer" }}
                          onClick={() => {
                            if (tfcStandingsSortField === "contests") {
                              setTfcStandingsSortDir((d) => (d === "asc" ? "desc" : "asc"));
                            } else {
                              setTfcStandingsSortField("contests");
                              setTfcStandingsSortDir("desc");
                            }
                          }}
                        >
                          Contests <SortIcon field="contests" sortField={tfcStandingsSortField} sortDir={tfcStandingsSortDir} />
                        </th>
                        <th
                          style={{ width: 130, textAlign: "right", cursor: "pointer" }}
                          onClick={() => {
                            if (tfcStandingsSortField === "rating") {
                              setTfcStandingsSortDir((d) => (d === "asc" ? "desc" : "asc"));
                            } else {
                              setTfcStandingsSortField("rating");
                              setTfcStandingsSortDir("desc");
                            }
                          }}
                        >
                          TFC Rating <SortIcon field="rating" sortField={tfcStandingsSortField} sortDir={tfcStandingsSortDir} />
                        </th>
                        <th style={{ width: 130, textAlign: "center" }}>Recordings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedAdminTfcStandings.slice(0, adminVisibleStandingsCount).map((p, idx) => (
                        <tr key={p.id || p._id || idx}>
                          <td>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  minWidth: 32,
                                  height: 28,
                                  padding: "0 8px",
                                  borderRadius: 999,
                                  fontSize: 12,
                                  fontWeight: 800,
                                  fontFamily: "var(--font-mono)",
                                  background:
                                    p.rank === 1
                                      ? "linear-gradient(135deg, #fbbf24 0%, #d97706 100%)"
                                      : p.rank === 2
                                      ? "linear-gradient(135deg, #cbd5e1 0%, #64748b 100%)"
                                      : p.rank === 3
                                      ? "linear-gradient(135deg, #fbcfe8 0%, #db2777 100%)"
                                      : "var(--bg-subtle)",
                                  color: p.rank <= 3 ? "#ffffff" : "var(--text-primary)",
                                  border: `1px solid ${p.rank <= 3 ? "transparent" : "var(--border)"}`,
                                  boxShadow: p.rank <= 3 ? "0 2px 8px rgba(0,0,0,0.15)" : "none",
                                }}
                                title={p.globalRank && p.globalRank !== p.rank ? `Configured Rank: #${p.rank} (Overall Global: #${p.globalRank})` : `Rank #${p.rank}`}
                              >
                                #{p.rank}
                              </span>
                              {p.globalRank && p.globalRank !== p.rank && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    color: "var(--text-muted)",
                                    fontFamily: "var(--font-mono)",
                                    marginTop: 2,
                                    whiteSpace: "nowrap",
                                  }}
                                  title={`Overall Global Rank across all participants: #${p.globalRank}`}
                                >
                                  (Global #{p.globalRank})
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>{p.name}</div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: 1 }}>
                              Roll: {p.roll}
                            </div>
                          </td>
                          <td>
                            <span className="badge" style={{ padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                              {normalizeBatch(p.batch) || p.batch}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontSize: 12 }}>
                              {p.codeforcesHandle && (
                                <div>
                                  CF:{" "}
                                  <a
                                    href={`https://codeforces.com/profile/${p.codeforcesHandle}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}
                                  >
                                    {p.codeforcesHandle} ↗
                                  </a>
                                </div>
                              )}
                              {p.vjudgeHandles && p.vjudgeHandles.length > 0 && (
                                <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 2 }}>
                                  VJ: {p.vjudgeHandles.join(", ")}
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <button
                              type="button"
                              onClick={() => setAdminContestHistoryTarget(p)}
                              title="Click to inspect all participated contests"
                              style={{
                                background: (p.contests || 0) > 0 ? "rgba(99, 102, 241, 0.1)" : "var(--bg-subtle)",
                                border: `1px solid ${(p.contests || 0) > 0 ? "rgba(99, 102, 241, 0.3)" : "var(--border)"}`,
                                color: (p.contests || 0) > 0 ? "var(--primary)" : "var(--text-muted)",
                                padding: "4px 12px",
                                borderRadius: 999,
                                fontWeight: 700,
                                fontFamily: "var(--font-mono)",
                                fontSize: 12,
                                cursor: (p.contests || 0) > 0 ? "pointer" : "default",
                                transition: "all 0.15s ease",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                              }}
                            >
                              <span>{p.contests || 0}</span>
                              {(p.contests || 0) > 0 && <span style={{ fontSize: 11 }}>📊</span>}
                            </button>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 800, fontSize: 15, color: "var(--primary)", fontFamily: "var(--font-mono)" }}>
                              {p.ratingDisplay || Math.round(p.rating || 0)}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                              {p.wins || 0}W · {p.losses || 0}L
                            </div>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {p.playlistUrl ? (
                              <a
                                href={p.playlistUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="secondary xs"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  fontSize: 11,
                                  textDecoration: "none",
                                  padding: "4px 10px",
                                }}
                              >
                                <span>📺 Videos</span>
                              </a>
                            ) : (
                              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>No Playlist</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {displayedAdminTfcStandings.length > adminVisibleStandingsCount && (
                    <div style={{ display: "flex", justifyContent: "center", gap: 10, padding: "16px", background: "var(--bg-subtle)", borderTop: "1px solid var(--border)" }}>
                      <button
                        type="button"
                        className="secondary sm"
                        onClick={() => setAdminVisibleStandingsCount((c) => c + 50)}
                        style={{ fontWeight: 600 }}
                      >
                        Load More ({displayedAdminTfcStandings.length - adminVisibleStandingsCount} remaining)
                      </button>
                      <button
                        type="button"
                        className="primary sm"
                        onClick={() => setAdminVisibleStandingsCount(displayedAdminTfcStandings.length)}
                        style={{ fontWeight: 600 }}
                      >
                        Show All ({displayedAdminTfcStandings.length})
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Subtab: Admin Contest Standings */}
          {!tfcLoading && tfcSubtab === "contest_standings" && (
            <div>
              {/* Contest Selector Bar */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>
                    Select Contest:
                  </label>
                  <select
                    value={adminSelectedContestId}
                    onChange={(e) => {
                      setAdminSelectedContestId(e.target.value);
                      setAdminVisibleContestCount(50);
                    }}
                    style={{
                      padding: "7px 14px",
                      borderRadius: "var(--radius)",
                      border: "1px solid var(--border)",
                      fontSize: 13,
                      fontWeight: 600,
                      minWidth: 260,
                      maxWidth: 400,
                      background: "var(--bg-input, var(--bg-card))",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                    }}
                  >
                    {tfcContests.map((c) => (
                      <option key={c.contestId} value={c.contestId}>
                        #{c.contestId} — {c.title || `Contest #${c.contestId}`} ({c.ranklist?.length || c.participantsCount || 0} participants)
                      </option>
                    ))}
                  </select>

                  {adminSelectedContestId && (
                    <a
                      href={`https://vjudge.net/contest/${adminSelectedContestId}#rank`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="secondary sm"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontWeight: 700,
                        borderColor: "rgba(59, 130, 246, 0.4)",
                        color: "var(--primary)",
                        textDecoration: "none",
                        padding: "6px 12px",
                      }}
                      title="View original contest standings on VJudge"
                    >
                      <span>🌐 Open VJudge</span>
                      <span style={{ fontSize: 11 }}>↗</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Stats Bar & Search */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                {adminContestStandingsData && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span
                      style={{
                        background: "var(--bg-subtle)",
                        border: "1px solid var(--border)",
                        borderRadius: 999,
                        padding: "3px 10px",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--text-secondary)",
                      }}
                    >
                      👥 <strong>{adminContestStandingsData.totalParticipants}</strong> Total
                    </span>
                    <span
                      style={{
                        background: "rgba(16, 185, 129, 0.1)",
                        border: "1px solid rgba(16, 185, 129, 0.2)",
                        borderRadius: 999,
                        padding: "3px 10px",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--success)",
                      }}
                    >
                      ✓ <strong>{adminContestStandingsData.registeredCount}</strong> Added in TFC
                    </span>
                    {adminContestStandingsData.unregisteredCount > 0 && (
                      <span
                        style={{
                          background: "rgba(245, 158, 11, 0.1)",
                          border: "1px solid rgba(245, 158, 11, 0.2)",
                          borderRadius: 999,
                          padding: "3px 10px",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#d97706",
                        }}
                      >
                        ⚠ <strong>{adminContestStandingsData.unregisteredCount}</strong> Unadded
                      </span>
                    )}
                  </div>
                )}

                <div style={{ width: "100%", maxWidth: 320, marginLeft: "auto" }}>
                  <div className="search-wrapper">
                    <span className="search-icon">🔍</span>
                    <input
                      type="text"
                      placeholder="Search contestant, roll, handle..."
                      value={adminContestSearchQuery}
                      onChange={(e) => setAdminContestSearchQuery(e.target.value)}
                    />
                    {adminContestSearchQuery && (
                      <button className="search-clear" onClick={() => setAdminContestSearchQuery("")}>×</button>
                    )}
                  </div>
                </div>
              </div>

              {adminContestStandingsLoading && (
                <div className="empty-state">
                  <div className="loading-spinner" />
                  <p>Loading contest standings...</p>
                </div>
              )}

              {!adminContestStandingsLoading && adminContestStandingsError && (
                <div className="notice error">{adminContestStandingsError}</div>
              )}

              {!adminContestStandingsLoading && !adminContestStandingsError && displayedAdminContestStandings.length === 0 && (
                <div className="empty-state">
                  <p>{adminContestSearchQuery ? "No contestants match your search." : "No standings recorded for this contest."}</p>
                </div>
              )}

              {!adminContestStandingsLoading && !adminContestStandingsError && displayedAdminContestStandings.length > 0 && (
                <>
                  <div className="vjudge-table-container">
                    <table className="vjudge-table">
                      <thead>
                        <tr>
                          <th style={{ width: 65, textAlign: "center" }}>Rank</th>
                          <th>Team / Contestant</th>
                          <th style={{ width: 90, textAlign: "center" }}>Score</th>
                          <th style={{ width: 120, textAlign: "right" }}>Penalty</th>
                          <th style={{ width: 100, textAlign: "center" }}>Tries</th>
                          <th style={{ width: 130, textAlign: "right" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedAdminContestStandings.slice(0, adminVisibleContestCount).map((row, idx) => (
                          <tr
                            key={`${row.teamName}-${idx}`}
                            style={{ background: !row.isRegistered ? "rgba(245, 158, 11, 0.03)" : undefined }}
                          >
                            <td style={{ textAlign: "center" }}>
                              <div
                                className={`vjudge-rank-badge ${
                                  row.rank === 1 ? "rank-1" : row.rank === 2 ? "rank-2" : row.rank === 3 ? "rank-3" : "rank-other"
                                }`}
                              >
                                {row.rank === 1 ? "👑 1" : `#${row.rank}`}
                              </div>
                            </td>
                            <td>
                              {row.isRegistered ? (
                                <div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    <strong style={{ fontSize: 14, color: "var(--text-primary)" }}>
                                      {row.name}
                                    </strong>
                                    {row.batch && (
                                      <span className="badge" style={{ padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>
                                        {normalizeBatch(row.batch) || row.batch}
                                      </span>
                                    )}
                                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                                      Roll: {row.roll || "—"}
                                    </span>
                                  </div>
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
                                    <a
                                      href={`https://vjudge.net/user/${encodeURIComponent(row.teamName)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="vjudge-handle-link"
                                      title="Open VJudge user profile"
                                    >
                                      <span>VJ: {row.teamName}</span>
                                      <span style={{ fontSize: 9 }}>↗</span>
                                    </a>
                                    {row.codeforcesHandle && (
                                      <a
                                        href={`https://codeforces.com/profile/${encodeURIComponent(row.codeforcesHandle)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                          fontSize: 11,
                                          color: "var(--text-secondary)",
                                          textDecoration: "none",
                                          fontWeight: 600,
                                        }}
                                      >
                                        CF: {row.codeforcesHandle} ↗
                                      </a>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    <a
                                      href={`https://vjudge.net/user/${encodeURIComponent(row.teamName)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        fontWeight: 700,
                                        fontFamily: "var(--font-mono)",
                                        fontSize: 14,
                                        color: "#d97706",
                                        textDecoration: "none",
                                      }}
                                      title="Open VJudge user profile"
                                    >
                                      {row.teamName} ↗
                                    </a>
                                    <span
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 700,
                                        color: "#d97706",
                                        background: "rgba(245, 158, 11, 0.12)",
                                        padding: "1px 6px",
                                        borderRadius: 4,
                                        border: "1px solid rgba(245, 158, 11, 0.25)",
                                      }}
                                    >
                                      Not Added Yet
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                                    VJudge Handle (not registered in TFC database)
                                  </div>
                                </div>
                              )}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <div className={`vjudge-solved-badge ${row.solved === 0 ? "zero" : ""}`}>
                                {row.solved}
                              </div>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <div className="vjudge-penalty-text">
                                {Math.round(row.penalty).toLocaleString()}
                              </div>
                              <div className="vjudge-penalty-sub">
                                ({Math.floor(row.penalty / 60)}m)
                              </div>
                            </td>
                            <td style={{ textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                              {row.submissions || 0}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {!row.isRegistered ? (
                                <button
                                  type="button"
                                  className="primary xs"
                                  onClick={() => handleQuickAddUnregisteredParticipant(row.teamName)}
                                  style={{ fontSize: 11, padding: "3px 8px" }}
                                >
                                  ＋ Add to TFC
                                </button>
                              ) : (
                                <span style={{ fontSize: 11, color: "var(--success)", fontWeight: 600 }}>
                                  ✓ Registered
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {displayedAdminContestStandings.length > adminVisibleContestCount && (
                    <div style={{ textAlign: "center", padding: "16px 0" }}>
                      <button
                        type="button"
                        className="secondary sm"
                        onClick={() => setAdminVisibleContestCount((c) => c + 50)}
                        style={{ fontWeight: 600 }}
                      >
                        Load More ({displayedAdminContestStandings.length - adminVisibleContestCount} remaining)
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Subtab 3: TFC Participation Matrix & Contest Exclusions */}
          {!tfcLoading && tfcSubtab === "participation" && (
            <div>
              {/* Info & Instructions Notice */}
              <div
                style={{
                  background: "linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(59, 130, 246, 0.05) 100%)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "12px 16px",
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)", marginBottom: 2 }}>
                    ⚙️ Participation &amp; Screen Recording Exclusions
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    Contests marked with a green badge <strong style={{ color: "#059669" }}>[✓ Included]</strong> are counted towards ratings.
                    If a participant did not submit screen recording, click the cell to mark it <strong style={{ color: "#dc2626" }}>[✕ Excluded]</strong> so that contest is omitted from their rating.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="secondary xs" onClick={loadTfc}>↻ Reload Matrix</button>
                </div>
              </div>

              {/* Filters */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
                <input
                  type="text"
                  placeholder="Search contestant name, roll, handle..."
                  value={participationSearch}
                  onChange={(e) => setParticipationSearch(e.target.value)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                    fontSize: 13,
                    minWidth: 240,
                  }}
                />
                <BatchFilter
                  batches={adminParticipationBatches}
                  selectedBatches={participationBatches}
                  onChange={setParticipationBatches}
                  placeholder="Filter Batches"
                />
                <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" }}>
                  Showing <strong>{displayedParticipationMatrix.length}</strong> participants · <strong>{participationContests.length}</strong> contests
                </div>
              </div>

              {displayedParticipationMatrix.length === 0 ? (
                <div className="empty-state"><p>No participants match your filter.</p></div>
              ) : participationContests.length === 0 ? (
                <div className="empty-state"><p>No active TFC contests found.</p></div>
              ) : (
                <div className="matrix-table-container">
                  <table className="matrix-table">
                    <thead>
                      <tr>
                        <th className="sticky-col">Contestant</th>
                        {participationContests.map((c) => (
                          <th key={c._id || c.contestId} style={{ minWidth: 120 }}>
                            <div style={{ fontWeight: 800, color: "var(--text-primary)" }}>#{c.contestId}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 }} title={c.title}>
                              {c.title || `Contest #${c.contestId}`}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayedParticipationMatrix.map((row) => {
                        const totalParticipated = participationContests.filter((c) => row.participation?.[c.contestId]?.participated).length;
                        const totalExcluded = participationContests.filter((c) => row.excludedContests?.some((id) => Number(id) === Number(c.contestId))).length;
                        const countedCount = Math.max(0, totalParticipated - totalExcluded);

                        return (
                          <tr key={row.id}>
                            <td className="sticky-col">
                              <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{row.name}</div>
                              <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: 1 }}>
                                {row.roll} · <span className="badge" style={{ padding: "0 4px", fontSize: 10 }}>{normalizeBatch(row.batch) || row.batch}</span>
                              </div>
                              <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: totalExcluded > 0 ? "#dc2626" : "var(--success)", background: totalExcluded > 0 ? "rgba(239, 68, 68, 0.1)" : "rgba(16, 185, 129, 0.1)", padding: "1px 6px", borderRadius: 4 }}>
                                  {countedCount} Counted {totalExcluded > 0 ? `(${totalExcluded} Excluded)` : ""}
                                </span>
                                {row.playlistUrl && (
                                  <a href={row.playlistUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "var(--primary)", textDecoration: "none" }}>
                                    Playlist ↗
                                  </a>
                                )}
                              </div>
                            </td>
                            {participationContests.map((c) => {
                              const isExcluded = row.excludedContests?.some((id) => Number(id) === Number(c.contestId));
                              const pData = row.participation?.[c.contestId];
                              const isToggling = togglingCell === `${row.id}-${c.contestId}`;

                              if (pData?.participated) {
                                return (
                                  <td key={c.contestId}>
                                    <button
                                      type="button"
                                      className={`matrix-cell-btn ${isExcluded ? "excluded" : "included"}`}
                                      onClick={() => handleToggleParticipation(row.id, c.contestId, isExcluded)}
                                      disabled={isToggling}
                                      title={isExcluded ? "Click to include in rating" : "Click to exclude (no screen recording)"}
                                    >
                                      <span className="matrix-icon">{isToggling ? "…" : isExcluded ? "✕" : "✓"}</span>
                                      <span className="matrix-text">{isExcluded ? "Excluded" : `Rank #${pData.rank}`}</span>
                                      <span className="matrix-sub">{isExcluded ? `(Was #${pData.rank})` : `(${pData.solved || 0} solved)`}</span>
                                    </button>
                                  </td>
                                );
                              }

                              return (
                                <td key={c.contestId}>
                                  <button
                                    type="button"
                                    className={`matrix-cell-btn ${isExcluded ? "excluded" : "unparticipated"}`}
                                    onClick={() => handleToggleParticipation(row.id, c.contestId, isExcluded)}
                                    disabled={isToggling}
                                    title={isExcluded ? "Marked excluded. Click to remove exclusion." : "Did not participate. Click to toggle exclusion."}
                                  >
                                    <span className="matrix-icon">{isToggling ? "…" : isExcluded ? "✕" : "—"}</span>
                                    <span className="matrix-text">{isExcluded ? "Excluded" : "No Sub"}</span>
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Subtab: TFC Participants */}
          {!tfcLoading && tfcSubtab === "participants" && (
            <div>
              {/* Filter bar */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    type="text"
                    placeholder="Search name, roll, handle..."
                    value={tfcPartSearch}
                    onChange={(e) => setTfcPartSearch(e.target.value)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "var(--radius)",
                      border: "1px solid var(--border)",
                      fontSize: 13,
                      minWidth: 220,
                    }}
                  />
                  <BatchFilter
                    batches={adminTfcPartBatches}
                    selectedBatches={tfcPartBatches}
                    onChange={setTfcPartBatches}
                    placeholder="Filter Batches"
                  />
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  Showing <strong>{displayedAdminTfcParticipants.length}</strong> of {tfcParticipants.length} participants
                </div>
              </div>

              {displayedAdminTfcParticipants.length === 0 ? (
                <div className="empty-state">
                  <p>{tfcParticipants.length === 0 ? "No TFC participants added yet." : "No participants match your search or batch filter."}</p>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Contestant</th>
                      <th>Roll</th>
                      <th>Batch</th>
                      <th>Handles</th>
                      <th>Recordings</th>
                      <th style={{ width: 100, textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedAdminTfcParticipants.map((p) => (
                      <tr key={p._id}>
                        <td><strong style={{ color: "var(--text-primary)" }}>{p.name}</strong></td>
                        <td style={{ fontFamily: "var(--font-mono)" }}>{p.roll}</td>
                        <td><span className="badge" style={{ padding: "2px 6px", fontSize: 11 }}>{normalizeBatch(p.batch) || p.batch}</span></td>
                        <td>
                          <div style={{ fontSize: 12 }}>
                            {p.codeforcesHandle && <div>CF: {p.codeforcesHandle}</div>}
                            {p.vjudgeHandles && p.vjudgeHandles.length > 0 && (
                              <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
                                VJ: {p.vjudgeHandles.join(", ")}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          {p.playlistUrl ? (
                            <a href={p.playlistUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--primary)" }}>
                              View Playlist ↗
                            </a>
                          ) : (
                            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>None</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button
                              className="danger xs"
                              onClick={() => setDeleteModal({ type: "tfc_participant", id: p._id, name: p.name })}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Subtab: TFC Contests */}
          {!tfcLoading && tfcSubtab === "contests" && (
            <div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <input
                  type="text"
                  placeholder="Search contest ID, title..."
                  value={tfcContestSearch}
                  onChange={(e) => setTfcContestSearch(e.target.value)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                    fontSize: 13,
                    minWidth: 220,
                  }}
                />
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  Showing <strong>{displayedAdminTfcContests.length}</strong> of {tfcContests.length} contests
                </div>
              </div>

              {displayedAdminTfcContests.length === 0 ? (
                <div className="empty-state">
                  <p>{tfcContests.length === 0 ? "No TFC contests added yet." : "No contests match your search."}</p>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Contest ID</th>
                      <th>Title</th>
                      <th style={{ width: 120 }}>Rank Data</th>
                      <th style={{ width: 100 }}>Status</th>
                      <th style={{ width: 150, textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedAdminTfcContests.map((c) => {
                      const isEnabled = c.enabled !== false;
                      const hasData = Array.isArray(c.ranklist) && c.ranklist.length > 0;
                      const isSyncingThis = syncingTfcContestId === c._id;
                      return (
                        <tr key={c._id}>
                          <td style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{c.contestId}</td>
                          <td><strong>{c.title || `TFC Contest #${c.contestId}`}</strong></td>
                          <td>
                            {hasData ? (
                              <span style={{ fontSize: 12, color: "var(--success)" }}>
                                ✓ {c.ranklist.length} ranks
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: "var(--warning)" }}>
                                ⚠ Not synced
                              </span>
                            )}
                          </td>
                          <td>
                            <button
                              className={isEnabled ? "success xs" : "secondary xs"}
                              style={{
                                padding: "3px 10px",
                                borderRadius: "999px",
                                fontWeight: 600,
                                fontSize: 11,
                                background: isEnabled ? "var(--success-light)" : "var(--bg-subtle)",
                                color: isEnabled ? "var(--success)" : "var(--text-muted)",
                                border: `1px solid ${isEnabled ? "var(--success)" : "var(--border)"}`,
                                cursor: "pointer",
                              }}
                              onClick={async () => {
                                try {
                                  await updateAdminTfcContest(c._id, { enabled: !isEnabled });
                                  await loadTfc();
                                } catch (err) {
                                  alert("Failed to toggle contest status.");
                                }
                              }}
                            >
                              {isEnabled ? "● Enabled" : "○ Disabled"}
                            </button>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                              <button
                                className="secondary xs"
                                disabled={isSyncingThis}
                                onClick={() => handleSyncSingleTfcContest(c._id)}
                              >
                                {isSyncingThis ? "Syncing…" : "Sync"}
                              </button>
                              <button
                                className="danger xs"
                                onClick={() => setDeleteModal({ type: "tfc_contest", id: c._id, name: c.title || `Contest #${c.contestId}` })}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Subtab: Anonymous Video Reports */}
          {!tfcLoading && tfcSubtab === "reports" && (
            <div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <input
                  type="text"
                  placeholder="Search contestant, video, explanation..."
                  value={tfcReportSearch}
                  onChange={(e) => setTfcReportSearch(e.target.value)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                    fontSize: 13,
                    minWidth: 240,
                  }}
                />
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  Showing <strong>{displayedAdminTfcReports.length}</strong> of {tfcReports.length} reports
                </div>
              </div>

              {displayedAdminTfcReports.length === 0 ? (
                <div className="empty-state">
                  <p>{tfcReports.length === 0 ? "🎉 No anonymous video reports received." : "No reports match your search."}</p>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Contestant</th>
                      <th>Video &amp; Category</th>
                      <th>Explanation &amp; Timestamps</th>
                      <th style={{ width: 140, textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedAdminTfcReports.map((rep) => (
                      <tr key={rep._id}>
                        <td>
                          <span style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "capitalize",
                            background: rep.status === "resolved" ? "var(--success-light)" : rep.status === "reviewed" ? "var(--info-light)" : "var(--danger-light)",
                            color: rep.status === "resolved" ? "var(--success)" : rep.status === "reviewed" ? "var(--info)" : "var(--danger)",
                            border: `1px solid ${rep.status === "resolved" ? "var(--success-border)" : rep.status === "reviewed" ? "var(--info-border)" : "var(--danger-border)"}`,
                          }}>
                            {rep.status}
                          </span>
                        </td>
                        <td>
                          <strong>{rep.participantName}</strong>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                            Roll: {rep.participantRoll}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
                            {rep.videoTitle || "Contest Recording"}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                            Tag: <em>{rep.category}</em>
                          </div>
                          {rep.videoUrl && (
                            <a href={rep.videoUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--primary)" }}>
                              Watch Video ↗
                            </a>
                          )}
                        </td>
                        <td>
                          <div style={{ fontSize: 12, color: "var(--text-secondary)", maxWidth: 300, lineHeight: 1.4 }}>
                            {rep.explanation}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                            Reported: {new Date(rep.createdAt).toLocaleString()}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                            {rep.status === "pending" && (
                              <button className="primary xs" onClick={() => handleUpdateReportStatus(rep._id, "reviewed")}>
                                Reviewed
                              </button>
                            )}
                            {rep.status !== "resolved" && (
                              <button className="success xs" onClick={() => handleUpdateReportStatus(rep._id, "resolved")}>
                                Resolve
                              </button>
                            )}
                            <button className="danger xs" onClick={() => setDeleteModal({ type: "tfc_report", id: rep._id, name: `Report for ${rep.participantName}` })}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: ADD PARTICIPANT HANDLE
          ════════════════════════════════════════════════════════════════════ */}
      {addHandleModalOpen && (
        <div className="modal-overlay" onClick={() => setAddHandleModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Participant Handle</h2>
              <button className="modal-close" onClick={() => setAddHandleModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              {addHandleError && <div className="notice error" style={{ marginBottom: 12 }}>{addHandleError}</div>}
              <div style={{ display: "grid", gap: 12 }}>
                <div className="field">
                  <label>Codeforces Handle *</label>
                  <input type="text" value={newHandle} onChange={(e) => setNewHandle(e.target.value)} placeholder="e.g. tourist" />
                </div>
                <div className="field">
                  <label>Full Name</label>
                  <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" />
                </div>
                <div className="field">
                  <label>Roll Number</label>
                  <input type="text" value={newRoll} onChange={(e) => setNewRoll(e.target.value)} placeholder="Roll" />
                </div>
                <div className="field">
                  <label>Batch</label>
                  <BatchSelect
                    value={newBatch}
                    onChange={setNewBatch}
                    options={formBatchOptions}
                    placeholder="Select Batch"
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setAddHandleModalOpen(false)}>Cancel</button>
              <button className="primary" onClick={handleCreateHandle} disabled={isAddingHandle}>
                {isAddingHandle ? "Adding…" : "Add Handle"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: ADD TEAM (3 MEMBERS FORM)
          ════════════════════════════════════════════════════════════════════ */}
      {addTeamModalOpen && (
        <div className="modal-overlay" onClick={() => setAddTeamModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Team (3 Members)</h2>
              <button className="modal-close" onClick={() => setAddTeamModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              {addTeamError && <div className="notice error" style={{ marginBottom: 12 }}>{addTeamError}</div>}
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Team Name *</label>
                <input type="text" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team Name (e.g. KUET_Alpha)" />
              </div>
              <div className="field" style={{ marginBottom: 16 }}>
                <label>VJudge Team Handle *</label>
                <input type="text" value={teamVjudgeHandle} onChange={(e) => setTeamVjudgeHandle(e.target.value)} placeholder="Team VJudge handle for rankings" />
              </div>

              {[0, 1, 2].map((i) => (
                <div key={i} className="member-section">
                  <div className="member-section-label">Member {i + 1}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <div className="field">
                      <label>Full Name *</label>
                      <input type="text" value={teamMembers[i].name} onChange={(e) => updateTeamMember(i, "name", e.target.value)} placeholder="Name" />
                    </div>
                    <div className="field">
                      <label>Roll Number *</label>
                      <input type="text" value={teamMembers[i].roll} onChange={(e) => updateTeamMember(i, "roll", e.target.value)} placeholder="Roll" />
                    </div>
                    <div className="field">
                      <label>Batch *</label>
                      <BatchSelect
                        value={teamMembers[i].batch}
                        onChange={(val) => updateTeamMember(i, "batch", val)}
                        options={formBatchOptions}
                        placeholder="Select Batch *"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setAddTeamModalOpen(false)}>Cancel</button>
              <button className="primary" onClick={handleCreateTeam} disabled={isAddingTeam}>
                {isAddingTeam ? "Saving…" : "Save Team"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: ADD CONTEST
          ════════════════════════════════════════════════════════════════════ */}
      {addContestModalOpen && (
        <div className="modal-overlay" onClick={() => setAddContestModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add VJudge Contest</h2>
              <button className="modal-close" onClick={() => setAddContestModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: "grid", gap: 12 }}>
                <div className="field">
                  <label>Contest ID *</label>
                  <input type="text" value={contestIdInput} onChange={(e) => setContestIdInput(e.target.value)} placeholder="e.g. 123456" />
                </div>
                <div className="field">
                  <label>Contest Title (Optional)</label>
                  <input type="text" value={contestTitleInput} onChange={(e) => setContestTitleInput(e.target.value)} placeholder="Title" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setAddContestModalOpen(false)}>Cancel</button>
              <button className="primary" onClick={handleCreateContest} disabled={isAddingContest}>
                {isAddingContest ? "Adding…" : "Add Contest"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: HANDLE DETAIL (WITH PRACTICE & CF MAX RANKS)
          ════════════════════════════════════════════════════════════════════ */}
      {handleDetailModal && (
        <div className="modal-overlay" onClick={() => setHandleDetailModal(null)}>
          <div className="modal-content" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Participant Details</h2>
              <button className="modal-close" onClick={() => setHandleDetailModal(null)}>×</button>
            </div>
            <div className="modal-body">
              {[
                ["Handle",                <a href={`https://codeforces.com/profile/${handleDetailModal.handle}`} target="_blank" rel="noopener noreferrer" className="handle-name">{handleDetailModal.handle}</a>],
                ["Name",                  handleDetailModal.name  || "Not provided"],
                ["Roll",                  handleDetailModal.roll  || "Not provided"],
                ["Batch",                 normalizeBatch(handleDetailModal.batch) || handleDetailModal.batch || "Not provided"],
                ["CF Max Rating",         <span className="stat-badge rating">{handleDetailModal.maxRating || "—"}</span>],
                ["Practice Rating",       <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{handleDetailModal.standingRating || 1000}</span>],
                ["Global Rank (Practice)",<span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--primary)" }}>#{practiceRankMap.get(String(handleDetailModal._id || handleDetailModal.id)) ?? "?"}</span>],
                ["Global Rank (CF Max)",  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--warning)" }}>#{cfMaxRankMap.get(String(handleDetailModal._id || handleDetailModal.id)) ?? "?"}</span>],
              ].map(([label, value]) => (
                <div key={label} className="detail-row">
                  <span className="detail-label">{label}</span>
                  <span className="detail-value">{value}</span>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setHandleDetailModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: TEAM DETAIL
          ════════════════════════════════════════════════════════════════════ */}
      {teamDetailModal && (
        <div className="modal-overlay" onClick={() => setTeamDetailModal(null)}>
          <div className="modal-content" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Team Details</h2>
              <button className="modal-close" onClick={() => setTeamDetailModal(null)}>×</button>
            </div>
            <div className="modal-body">
              {[
                ["Team Name", teamDetailModal.name],
                ["VJudge Handle", (teamDetailModal.aliases || []).join(", ") || "—"],
              ].map(([label, value]) => (
                <div key={label} className="detail-row">
                  <span className="detail-label">{label}</span>
                  <span className="detail-value">{value}</span>
                </div>
              ))}

              <div style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 8 }}>
                  Team Members
                </h3>
                {teamDetailModal.members && teamDetailModal.members.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {teamDetailModal.members.map((m, idx) => (
                      <div key={idx} style={{ background: "var(--bg-subtle)", padding: "8px 12px", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name || `Member ${idx + 1}`}</div>
                          {m.roll && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Roll: {m.roll}</div>}
                        </div>
                        {m.batch && (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
                            {normalizeBatch(m.batch) || m.batch}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No member details recorded.</p>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setTeamDetailModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: REQUEST DETAIL
          ════════════════════════════════════════════════════════════════════ */}
      {requestDetailModal && (
        <div className="modal-overlay" onClick={() => setRequestDetailModal(null)}>
          <div className="modal-content" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Request Details</h2>
              <button className="modal-close" onClick={() => setRequestDetailModal(null)}>×</button>
            </div>
            <div className="modal-body">
              {requestDetailModal.type === "handle" && [
                ["Type", "Individual Handle"],
                ["Handle", <a href={`https://codeforces.com/profile/${requestDetailModal.handle}`} target="_blank" rel="noopener noreferrer" className="handle-name">{requestDetailModal.handle}</a>],
                ["Name",  requestDetailModal.name  || "Not provided"],
                ["Roll",  requestDetailModal.roll  || "Not provided"],
                ["Batch", normalizeBatch(requestDetailModal.batch) || requestDetailModal.batch || "Not provided"],
              ].map(([label, value]) => (
                <div key={label} className="detail-row"><span className="detail-label">{label}</span><span className="detail-value">{value}</span></div>
              ))}
              {requestDetailModal.type === "reactivation" && [
                ["Type", "Reactivation Request"],
                ["Handle", <a href={`https://codeforces.com/profile/${requestDetailModal.handle}`} target="_blank" rel="noopener noreferrer" className="handle-name">{requestDetailModal.handle}</a>],
                ["Name",  requestDetailModal.name  || "Not provided"],
                ["Batch", normalizeBatch(requestDetailModal.batch) || requestDetailModal.batch || "Not provided"],
              ].map(([label, value]) => (
                <div key={label} className="detail-row"><span className="detail-label">{label}</span><span className="detail-value">{value}</span></div>
              ))}
              {requestDetailModal.type === "team" && (
                <>
                  <div className="detail-row"><span className="detail-label">Type</span><span className="detail-value">Team Request</span></div>
                  <div className="detail-row"><span className="detail-label">Team Name</span><span className="detail-value" style={{ fontWeight: 700 }}>{requestDetailModal.teamName}</span></div>
                  <div className="detail-row"><span className="detail-label">VJudge Handles</span><span className="detail-value" style={{ fontFamily: "var(--font-mono)" }}>{requestDetailModal.teamHandles}</span></div>
                  {requestDetailModal.teamMembers && requestDetailModal.teamMembers.length > 0 && (
                    <>
                      <div style={{ marginTop: 14, marginBottom: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)" }}>Team Members</div>
                      {requestDetailModal.teamMembers.map((m, i) => (
                        <div key={i} style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 12px", marginBottom: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--primary)", marginBottom: 4 }}>{m.handle}</div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{m.name} · {m.roll} · <span style={{ fontFamily: "var(--font-mono)" }}>{normalizeBatch(m.batch) || m.batch}</span></div>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setRequestDetailModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: ADMIN CREDENTIALS
          ════════════════════════════════════════════════════════════════════ */}
      {showCredentialsModal && (
        <div className="modal-overlay" onClick={() => setShowCredentialsModal(false)}>
          <div className="modal-content" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Account Credentials</h2>
              <button className="modal-close" onClick={() => setShowCredentialsModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="tabs" style={{ marginBottom: 14 }}>
                <button className={`tab ${credentialTab === "username" ? "active" : ""}`} onClick={() => setCredentialTab("username")}>Username</button>
                <button className={`tab ${credentialTab === "password" ? "active" : ""}`} onClick={() => setCredentialTab("password")}>Password</button>
              </div>

              {credMessage && <div className="notice success" style={{ marginBottom: 12 }}>{credMessage}</div>}
              {credError && <div className="notice error" style={{ marginBottom: 12 }}>{credError}</div>}

              {credentialTab === "username" && (
                <div style={{ display: "grid", gap: 12 }}>
                  <div className="field">
                    <label>Current Password *</label>
                    <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" />
                  </div>
                  <div className="field">
                    <label>New Username *</label>
                    <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="New username" />
                  </div>
                </div>
              )}
              {credentialTab === "password" && (
                <div style={{ display: "grid", gap: 12 }}>
                  <div className="field">
                    <label>Current Password *</label>
                    <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" />
                  </div>
                  <div className="field">
                    <label>New Password *</label>
                    <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" />
                  </div>
                  <div className="field">
                    <label>Confirm New Password *</label>
                    <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setShowCredentialsModal(false)}>Cancel</button>
              <button className="primary" onClick={handleUpdateCredentials}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: UPDATE PASSKEY
          ════════════════════════════════════════════════════════════════════ */}
      {showPasskeyModal && (
        <div className="modal-overlay" onClick={() => setShowPasskeyModal(false)}>
          <div className="modal-content" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Update SGIPC Passkey</h2>
              <button className="modal-close" onClick={() => setShowPasskeyModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {passkeyMessage && <div className="notice info" style={{ marginBottom: 12 }}>{passkeyMessage}</div>}
              <div style={{ display: "grid", gap: 12 }}>
                <div className="field">
                  <label>New Passkey *</label>
                  <input type="password" value={passkeyValue} onChange={(e) => setPasskeyValue(e.target.value)} placeholder="Enter new passkey" />
                </div>
                <div className="field">
                  <label>Confirm Passkey *</label>
                  <input type="password" value={passkeyConfirm} onChange={(e) => setPasskeyConfirm(e.target.value)} placeholder="Confirm passkey" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setShowPasskeyModal(false)}>Cancel</button>
              <button className="primary" onClick={handleUpdatePasskey}>Update Passkey</button>
            </div>
          </div>
        </div>
      )}
      {/* ════════════════════════════════════════════════════════════════════
          MODAL: DELETE CONFIRMATION
          ════════════════════════════════════════════════════════════════════ */}
      {deleteModal && (
        <div className="modal-overlay" onClick={() => !isDeleting && setDeleteModal(null)}>
          <div className="modal-content" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ color: "var(--danger)", display: "flex", alignItems: "center", gap: 8 }}>
                <span>⚠️</span> Confirm {deleteModal.type.includes("request") ? "Reject Request" : "Delete"}
              </h2>
              <button className="modal-close" onClick={() => !isDeleting && setDeleteModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: "0 0 12px", fontSize: 15, color: "var(--text-primary)", fontWeight: 500 }}>
                Are you sure you want to {deleteModal.type.includes("request") ? "reject and remove the request for" : "delete"}{" "}
                <strong style={{ color: "var(--primary)" }}>{deleteModal.name}</strong>?
              </p>
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
                {deleteModal.type.includes("request")
                  ? "This will reject this registration request and remove it from the pending list. This action cannot be undone."
                  : `This will permanently remove this ${deleteModal.type.replace("tfc_", "TFC ")} and its associated records from SGIPC Standings. This action cannot be undone.`}
              </p>
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setDeleteModal(null)} disabled={isDeleting}>
                Cancel
              </button>
              <button
                className="danger"
                onClick={confirmExecuteDelete}
                disabled={isDeleting}
                style={{ minWidth: 100, fontWeight: 700 }}
              >
                {isDeleting ? "Processing…" : deleteModal.type.includes("request") ? "Reject Request" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ════════════════════════════════════════════════════════════════════
          MODAL: ADD TFC PARTICIPANT
          ════════════════════════════════════════════════════════════════════ */}
      {addTfcPartModalOpen && (
        <div className="modal-overlay" onClick={() => setAddTfcPartModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add TFC Participant</h2>
              <button className="modal-close" onClick={() => setAddTfcPartModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              {tfcPartError && <div className="notice error" style={{ marginBottom: 12 }}>{tfcPartError}</div>}
              <div style={{ display: "grid", gap: 12 }}>
                <div className="field">
                  <label>Full Name *</label>
                  <input type="text" value={tfcPartName} onChange={(e) => setTfcPartName(e.target.value)} placeholder="Full Name" />
                </div>
                <div className="field">
                  <label>Roll Number *</label>
                  <input type="text" value={tfcPartRoll} onChange={(e) => setTfcPartRoll(e.target.value)} placeholder="Roll Number" />
                </div>
                <div className="field">
                  <label>Batch *</label>
                  <BatchSelect
                    value={tfcPartBatch}
                    onChange={setTfcPartBatch}
                    options={formBatchOptions}
                    placeholder="Select Batch *"
                  />
                </div>
                <div className="field">
                  <label>VJudge Handle(s) *</label>
                  <input
                    type="text"
                    value={tfcPartHandles.join(", ")}
                    onChange={(e) => setTfcPartHandles(e.target.value.split(",").map((s) => s.trim()))}
                    placeholder="comma-separated handles"
                  />
                </div>
                <div className="field">
                  <label>Codeforces Handle</label>
                  <input type="text" value={tfcPartCf} onChange={(e) => setTfcPartCf(e.target.value)} placeholder="CF handle" />
                </div>
                <div className="field">
                  <label>YouTube Playlist Link</label>
                  <input type="url" value={tfcPartPlaylist} onChange={(e) => setTfcPartPlaylist(e.target.value)} placeholder="https://youtube.com/playlist?list=..." />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setAddTfcPartModalOpen(false)}>Cancel</button>
              <button className="primary" onClick={handleCreateTfcParticipant} disabled={isAddingTfcPart}>
                {isAddingTfcPart ? "Adding…" : "Add Participant"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: ADD TFC CONTEST
          ════════════════════════════════════════════════════════════════════ */}
      {addTfcContestModalOpen && (
        <div className="modal-overlay" onClick={() => setAddTfcContestModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add TFC Contest</h2>
              <button className="modal-close" onClick={() => setAddTfcContestModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: "grid", gap: 12 }}>
                <div className="field">
                  <label>VJudge Contest ID *</label>
                  <input type="number" value={tfcContestIdInput} onChange={(e) => setTfcContestIdInput(e.target.value)} placeholder="e.g. 598123" />
                </div>
                <div className="field">
                  <label>Contest Title (Optional)</label>
                  <input type="text" value={tfcContestTitleInput} onChange={(e) => setTfcContestTitleInput(e.target.value)} placeholder="Auto-fetched from VJudge if blank" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setAddTfcContestModalOpen(false)}>Cancel</button>
              <button className="primary" onClick={handleCreateTfcContest} disabled={isAddingTfcContest}>
                {isAddingTfcContest ? "Adding…" : "Add Contest"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contest History Breakdown Modal */}
      <ContestHistoryModal
        isOpen={Boolean(adminContestHistoryTarget)}
        onClose={() => setAdminContestHistoryTarget(null)}
        contestant={adminContestHistoryTarget}
      />

      {/* TFC Standings Configuration Modal */}
      <TfcSettingsModal
        isOpen={isTfcSettingsOpen}
        onClose={() => setIsTfcSettingsOpen(false)}
        onConfigSaved={(newCfg) => {
          if (newCfg.adminMinParticipation !== undefined) {
            setTfcStandingsMinContests(Number(newCfg.adminMinParticipation) || 0);
          }
          if (newCfg.adminTopNLimit !== undefined) {
            setAdminVisibleStandingsCount(newCfg.adminTopNLimit > 0 ? newCfg.adminTopNLimit : 999999);
          }
          if (newCfg.publicTopNLimit !== undefined) {
            setTfcTopNLimit(newCfg.publicTopNLimit);
          }
          loadTfc();
        }}
      />
    </div>
  );
};

export default AdminDashboard;

