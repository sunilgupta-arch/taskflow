/**
 * Auth utilities — manage user state, role checks, login/logout.
 */

let currentUser = null;

export function getUser() {
  return currentUser;
}

export function setUser(user) {
  currentUser = user;
}

export function isLoggedIn() {
  return !!currentUser;
}

export function hasRole(...roles) {
  return currentUser && roles.includes(currentUser.role_name);
}

export function isAdmin() {
  return hasRole('LOCAL_ADMIN', 'CLIENT_ADMIN');
}

export function isManager() {
  return hasRole('LOCAL_MANAGER', 'CLIENT_MANAGER');
}

export function isAdminOrManager() {
  return hasRole('LOCAL_ADMIN', 'CLIENT_ADMIN', 'LOCAL_MANAGER', 'CLIENT_MANAGER');
}

export function isLocalOrg() {
  return currentUser && currentUser.org_type === 'LOCAL';
}

export function isClientOrg() {
  return currentUser && currentUser.org_type === 'CLIENT';
}

export async function fetchProfile() {
  try {
    const res = await fetch('/auth/profile', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.success && data.data?.user) {
      currentUser = data.data.user;
      return currentUser;
    }
    return null;
  } catch {
    return null;
  }
}

export async function logout(reason = null) {
  try {
    await fetch('/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ logout_reason: reason }),
    });
  } catch { /* ignore */ }
  currentUser = null;
  window.location.hash = '/login';
}
