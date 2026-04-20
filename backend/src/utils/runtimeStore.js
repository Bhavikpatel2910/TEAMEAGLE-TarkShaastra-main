let nextId = 1;

const memoryCorridors = new Map();
const memoryHistory = new Map();
const memoryAlerts = new Map();

function createId(prefix) {
  return `${prefix}-${Date.now()}-${nextId++}`;
}

function toIso(value) {
  return new Date(value || Date.now()).toISOString();
}

function listCorridors() {
  return Array.from(memoryCorridors.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function getCorridor(id) {
  return memoryCorridors.get(String(id)) || null;
}

function saveCorridor(input) {
  const now = toIso();
  const id = String(input._id || input.id || createId('corridor'));
  const existing = memoryCorridors.get(id);
  const corridor = {
    ...(existing || {}),
    ...input,
    _id: id,
    id,
    createdAt: existing?.createdAt || input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
  memoryCorridors.set(id, corridor);
  return corridor;
}

function listHistory(corridorId, limit = 20) {
  const rows = memoryHistory.get(String(corridorId)) || [];
  return rows.slice(-limit);
}

function saveHistory(input) {
  const corridorId = String(input.corridorId);
  const rows = memoryHistory.get(corridorId) || [];
  const row = {
    ...input,
    _id: String(input._id || createId('sensor')),
    corridorId,
    timestamp: input.timestamp || toIso(),
  };
  rows.push(row);
  memoryHistory.set(corridorId, rows);
  return row;
}

function listAlerts() {
  return Array.from(memoryAlerts.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function saveAlert(input) {
  const now = toIso();
  const id = String(input._id || input.id || createId('alert'));
  const existing = memoryAlerts.get(id);
  const alert = {
    acknowledged: false,
    ...(existing || {}),
    ...input,
    _id: id,
    id,
    createdAt: existing?.createdAt || input.createdAt || now,
  };
  memoryAlerts.set(id, alert);
  return alert;
}

function acknowledgeAlert(id) {
  const current = memoryAlerts.get(String(id));
  if (!current) return null;
  const updated = { ...current, acknowledged: true };
  memoryAlerts.set(String(id), updated);
  return updated;
}

module.exports = {
  getCorridor,
  listAlerts,
  listCorridors,
  listHistory,
  saveAlert,
  saveCorridor,
  saveHistory,
  acknowledgeAlert,
};
