// Cloudflare Worker: AIS relay (aisstream.io -> your app)
// Secret required: AISSTREAM_KEY
// Optional area in URL: ?box=lat1,lon1,lat2,lon2
export default {
  async fetch(req, env) {
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("AIS relay OK", { status: 200 });
    }
    const url = new URL(req.url);
    const b = (url.searchParams.get("box") || "24.5,54,28.5,58.5").split(",").map(Number);
    if (b.length !== 4 || b.some(isNaN)) return new Response("bad box", { status: 400 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    const up = await fetch("https://stream.aisstream.io/v0/stream", {
      headers: { Upgrade: "websocket" },
    });
    const upstream = up.webSocket;
    if (!upstream) {
      server.close(1011, "upstream failed");
      return new Response(null, { status: 101, webSocket: client });
    }
    upstream.accept();
    upstream.send(JSON.stringify({
      APIKey: env.AISSTREAM_KEY,
      BoundingBoxes: [[[b[0], b[1]], [b[2], b[3]]]],
      FilterMessageTypes: ["PositionReport"],
    }));

    const dec = new TextDecoder();
    upstream.addEventListener("message", (e) => {
      try { server.send(typeof e.data === "string" ? e.data : dec.decode(e.data)); } catch (_) {}
    });
    upstream.addEventListener("close", () => { try { server.close(); } catch (_) {} });
    upstream.addEventListener("error", () => { try { server.close(); } catch (_) {} });
    server.addEventListener("close", () => { try { upstream.close(); } catch (_) {} });

    return new Response(null, { status: 101, webSocket: client });
  },
};
