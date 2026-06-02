export async function onRequestGet({ request }) {

  const cookie =
    request.headers.get("Cookie") || "";

  const match =
    cookie.match(/ironkin_session=([^;]+)/);

  if (!match) {
    return Response.json({
      signedIn: false
    });
  }

  try {

    const session =
      JSON.parse(atob(match[1]));

    return Response.json({
      signedIn: true,
      user: session
    });

  } catch {

    return Response.json({
      signedIn: false
    });
  }
}
