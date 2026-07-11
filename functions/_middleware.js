import { getSession, isStaffSession } from "./api/_auth.js";
import { requireBingoTeam } from "./api/bingo/_teamAuthorization.js";

const STAFF_ONLY_PATHS = new Set([
  "/admin",
  "/admin.html",
  "/staff-handbook",
  "/staff-handbook.html"
]);

// These pages contain bingo board/game data and must never be available
// to logged-out visitors. The API routes are protected separately too.
const SIGNED_IN_ONLY_PATHS = new Set([
  "/battleship-stats",
  "/battleship-stats.html",
  "/team-1",
  "/team-1.html",
  "/team-2",
  "/team-2.html"
]);

const NO_CACHE_PATHS = new Set([
  "/battleship-bingo",
  "/battleship-bingo.html",
  "/team-1",
  "/team-1.html",
  "/team-2",
  "/team-2.html"
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

  const normalizedPath = normalizePath(url.pathname);
  const requiredTeam = normalizedPath === "/team-1" || normalizedPath === "/team-1.html"
    ? "team1"
    : normalizedPath === "/team-2" || normalizedPath === "/team-2.html"
      ? "team2"
      : null;

  if (requiredTeam) {
    const bingoUser = await requireBingoTeam(request, env, requiredTeam);
    if (!bingoUser.ok) {
      const homeUrl = new URL("/index.html", url.origin);
      homeUrl.searchParams.set("error", bingoUser.status === 401 ? "signin_required" : "bingo_team_required");
      return Response.redirect(homeUrl.toString(), 302);
    }
  }

  const response = await next();

  const noCache = NO_CACHE_PATHS.has(normalizePath(url.pathname));

  // Prevent browsers and edge caches from keeping an older Battleship Bingo page.
  // The HTML will therefore pick up the newest versioned JavaScript automatically,
  // without requiring every player to perform a hard refresh.
  if (signedInOnly || noCache) {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  return response;
}
