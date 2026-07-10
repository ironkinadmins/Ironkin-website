import { getSession, isStaffSession } from "./api/_auth.js";

const STAFF_ONLY_PATHS = new Set([
  "/admin",
  "/admin.html",
  "/staff-handbook",
  "/staff-handbook.html"
]);

// These pages contain bingo board/game data and must never be available
// to logged-out visitors. The API routes are protected separately too.
const SIGNED_IN_ONLY_PATHS = new Set([
  "/battleship-bingo",
  "/battleship-bingo.html",
  "/battleship-stats",
  "/battleship-stats.html"
]);

function normalizePath(pathname) {
  return pathname.replace(/\/+$/, "") || "/";
}

function isStaffOnlyPath(pathname) {
  return STAFF_ONLY_PATHS.has(normalizePath(pathname));
}

function isSignedInOnlyPath(pathname) {
  return SIGNED_IN_ONLY_PATHS.has(normalizePath(pathname));
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  const staffOnly = isStaffOnlyPath(url.pathname);
  const signedInOnly = isSignedInOnlyPath(url.pathname);

  if (!staffOnly && !signedInOnly) {
    return next();
  }

  const session = await getSession(request, env);

  if (!session) {
    const loginUrl = new URL("/api/auth/login", url.origin);
    return Response.redirect(loginUrl.toString(), 302);
  }

  if (staffOnly && !isStaffSession(session)) {
    const homeUrl = new URL("/index.html", url.origin);
    homeUrl.searchParams.set("error", "staff_required");
    return Response.redirect(homeUrl.toString(), 302);
  }

  return next();
}
