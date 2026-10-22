// A response that also carries a Set-Cookie header (login, logout, delete account).
class Resp {
  constructor(body, cookie) {
    this.body = body;
    this.cookie = cookie || null;
  }
}

const ok = () => ({ ok: true });

module.exports = { Resp, ok };
