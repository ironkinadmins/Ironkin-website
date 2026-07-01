import { getSession, isStaffSession } from "./api/_auth.js";

const STAFF_ONLY_PATHS = new Set([
  "/admin",
  "/admin.html",
  "/staff-handbook",
  "/staff-handbook.html"
]);

function isStaffOnlyPath(pathname) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return STAFF_ONLY_PATHS.has(normalized);
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (!isStaffOnlyPath(url.pathname)) {
    return next();
  }

  const session = await getSession(request, env);

  if (!session) {
    const loginUrl = new URL("/api/auth/login", url.origin);
    return Response.redirect(loginUrl.toString(), 302);
  }

  if (!isStaffSession(session)) {
    const homeUrl = new URL("/index.html", url.origin);
    homeUrl.searchParams.set("error", "staff_required");
    return Response.redirect(homeUrl.toString(), 302);
  }

  return next();
}
