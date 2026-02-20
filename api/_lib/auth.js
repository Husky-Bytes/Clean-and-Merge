"use strict";

const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

const SESSION_COOKIE_NAME = "story_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

let oauthClient = null;

function getGoogleClientId() {
  return process.env.GOOGLE_CLIENT_ID || "";
}

function requireSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("Missing SESSION_SECRET.");
  }

  return secret;
}

function getOAuthClient() {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error("Missing GOOGLE_CLIENT_ID.");
  }

  if (!oauthClient) {
    oauthClient = new OAuth2Client(clientId);
  }

  return oauthClient;
}

async function verifyGoogleCredential(credential) {
  if (!credential || typeof credential !== "string") {
    throw new Error("Missing Google credential.");
  }

  const ticket = await getOAuthClient().verifyIdToken({
    idToken: credential,
    audience: getGoogleClientId()
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.sub) {
    throw new Error("Invalid Google token payload.");
  }

  return {
    sub: payload.sub,
    name: payload.name || "User",
    email: payload.email || "",
    picture: payload.picture || ""
  };
}

function setSessionCookie(req, res, user) {
  const secret = requireSessionSecret();
  const token = jwt.sign(
    {
      sub: user.sub,
      name: user.name || "User",
      email: user.email || "",
      picture: user.picture || ""
    },
    secret,
    {
      algorithm: "HS256",
      expiresIn: SESSION_MAX_AGE_SECONDS
    }
  );

  const cookie = buildCookieString(req, SESSION_COOKIE_NAME, token, {
    maxAge: SESSION_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: "Lax",
    path: "/"
  });

  appendSetCookie(res, cookie);
}

function clearSessionCookie(req, res) {
  const cookie = buildCookieString(req, SESSION_COOKIE_NAME, "", {
    maxAge: 0,
    httpOnly: true,
    sameSite: "Lax",
    path: "/"
  });

  appendSetCookie(res, cookie);
}

function getSessionFromRequest(req) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return null;
  }

  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (!payload || !payload.sub) {
      return null;
    }

    return {
      sub: payload.sub,
      name: payload.name || "User",
      email: payload.email || "",
      picture: payload.picture || ""
    };
  } catch (_error) {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  if (!header.trim()) {
    return {};
  }

  return header.split(";").reduce((acc, pair) => {
    const parts = pair.split("=");
    const key = parts.shift();
    if (!key) {
      return acc;
    }

    const trimmedKey = key.trim();
    const value = decodeURIComponent(parts.join("=").trim());
    acc[trimmedKey] = value;
    return acc;
  }, {});
}

function appendSetCookie(res, cookieValue) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", [cookieValue]);
    return;
  }

  if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", existing.concat(cookieValue));
    return;
  }

  res.setHeader("Set-Cookie", [existing, cookieValue]);
}

function buildCookieString(req, name, value, options) {
  const parts = [];
  parts.push(name + "=" + encodeURIComponent(value));
  parts.push("Path=" + (options.path || "/"));
  parts.push("Max-Age=" + (options.maxAge || 0));
  if (options.httpOnly) {
    parts.push("HttpOnly");
  }
  if (options.sameSite) {
    parts.push("SameSite=" + options.sameSite);
  }
  if (shouldUseSecureCookie(req)) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function shouldUseSecureCookie(req) {
  const proto = req.headers["x-forwarded-proto"];
  if (proto === "https") {
    return true;
  }

  const host = req.headers.host || "";
  if (host.startsWith("localhost:") || host.startsWith("127.0.0.1:")) {
    return false;
  }

  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

module.exports = {
  clearSessionCookie,
  getGoogleClientId,
  getSessionFromRequest,
  setSessionCookie,
  verifyGoogleCredential
};
