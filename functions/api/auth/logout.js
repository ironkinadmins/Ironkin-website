export async function onRequestGet() {

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie":
        "ironkin_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    }
  });
}
