/**
 * Leaving the admin for the login page.
 *
 * Its own module so it is one line to stub: an admin fetch that answers 401 has
 * to take the operator somewhere, and a test asserting that should not have to
 * fight jsdom's navigation.
 */
export const LOGIN_PATH = "/admin/login";

export function goToLogin() {
  window.location.href = LOGIN_PATH;
}
