const STORAGE_KEY = "se-admin";
const ADMIN_PASSWORD = "54321";

export function isAdminMode() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAdminMode(enabled) {
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* localStorage недоступен — режим не сохраняется */
  }
}

export function verifyAdminPassword(password) {
  return password === ADMIN_PASSWORD;
}
