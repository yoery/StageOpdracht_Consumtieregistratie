/**
 * ServerApi — praat met de API van de server (zie backend/src/Server/Api.php).
 *
 * Alleen gebruikt als de website met een server werkt (SERVER_API in deployment.js). Iedere methode
 * geeft een Promise met de inhoud van het antwoord. Lukt een verzoek niet, dan volgt een ServerError
 * met de status en de melding van de server ("Niet ingelogd.", "Te veel mislukte pogingen...").
 * Status 0 betekent: er is geen verbinding met de server.
 *
 * De cookies van de sessie zet en leest de browser zelf. JavaScript kan er niet bij (HttpOnly). Deze
 * class onthoudt alleen de tweede sleutel van de sessie (`csrf`), die bij ieder schrijvend verzoek
 * meegaat. Zo kan een andere website geen verzoek namens de beheerder of de tablet doen.
 *
 * Verbonden met:
 *   - ServerSync: haalt wijzigingen op en stuurt ze weg;
 *   - ServerMode: inloggen, uitloggen, tablets en de synchronisatie met AFAS.
 */
export class ServerError extends Error {
  // `unreadable`: het antwoord kwam niet van de API (bijvoorbeeld een foutpagina van de proxy terwijl
  // de container opnieuw start).
  constructor(status, message, { unreadable = false } = {}) {
    super(message);
    this.name = "ServerError";
    this.status = status;
    this.unreadable = unreadable;
  }

  // Is de server niet (goed) bereikbaar? Geen verbinding, te lang geen antwoord, een fout op de server
  // of een antwoord dat niet van de API komt. Een leesbare 4xx van de API (zoals "Te veel verzoeken")
  // is een gewoon antwoord.
  static isUnreachable(error) {
    return error?.status === 0 || error?.status >= 500 || error?.unreadable === true;
  }
}

export class ServerApi {
  // `fetchFunction` is mee te geven, zodat de tests een nagebootste server kunnen gebruiken.
  constructor(base, fetchFunction = (...args) => fetch(...args)) {
    this.base = base;
    this.fetch = fetchFunction;
    this.csrf = null;
  }

  // Wie ben ik voor de server: { role: "admin" | "device" | null, email, device, configured }.
  session() {
    return this.request("GET", "/session");
  }

  login(email, password) {
    return this.request("POST", "/login", { email, password });
  }

  logout() {
    return this.request("POST", "/logout", {});
  }

  changePassword(current, next) {
    return this.request("POST", "/account/password", { current, new: next });
  }

  // Wat er sinds een volgnummer is veranderd: { version, changes: [{ collection, id, data }] }.
  pull(since) {
    return this.request("GET", `/changes?since=${encodeURIComponent(since)}`);
  }

  // Stuurt wijzigingen weg. Het antwoord noemt wat de server heeft geweigerd (`rejected`).
  push(changes) {
    return this.request("POST", "/changes", { changes });
  }

  // Hoe lang herkennen en koppelen mogen duren. Iemand staat voor de tablet te wachten: duurt het
  // langer, dan telt het als geen verbinding (status 0) en zegt de tablet dat.
  static RECOGNITION_TIMEOUT_MS = 5000;

  // Wie is dit gezicht? Alleen de kenmerken van het gezicht voor de camera gaan mee.
  recognizeFace(descriptor) {
    return this.request("POST", "/recognize/face", { descriptor: Array.from(descriptor) }, { timeoutMs: ServerApi.RECOGNITION_TIMEOUT_MS });
  }

  // Van wie is deze pas?
  recognizeBadge(code) {
    return this.request("POST", "/recognize/badge", { code }, { timeoutMs: ServerApi.RECOGNITION_TIMEOUT_MS });
  }

  // Koppelt een pas aan een medewerker zonder pas.
  linkBadge(employeeId, code) {
    return this.request("POST", "/badge/link", { employeeId, code }, { timeoutMs: ServerApi.RECOGNITION_TIMEOUT_MS });
  }

  devices() {
    return this.request("GET", "/devices");
  }

  linkDevice(name, pointId) {
    return this.request("POST", "/devices", { name, pointId });
  }

  updateDevice(id, name, pointId) {
    return this.request("POST", "/devices/update", { id, name, pointId });
  }

  revokeDevice(id) {
    return this.request("POST", "/devices/revoke", { id });
  }

  afasStatus() {
    return this.request("GET", "/afas/status");
  }

  // Nu synchroniseren met AFAS. Mislukt de synchronisatie zelf (status 502 of 503), dan komt het
  // antwoord gewoon terug met `ok: false` en de melding, zodat de beheerder ziet wat er mis is.
  afasSync() {
    return this.request("POST", "/afas/sync", {}, { passFailure: true });
  }

  async request(method, path, body = null, { passFailure = false, timeoutMs = 0 } = {}) {
    // Na opstarten zonder verbinding is de sleutel van de sessie nog niet bekend. Die wordt dan
    // eerst opgehaald, anders weigert de server ieder schrijvend verzoek.
    if (method !== "GET" && !this.csrf && path !== "/login") {
      await this.request("GET", "/session").catch(() => {});
    }

    const headers = { Accept: "application/json" };
    if (method !== "GET") {
      headers["Content-Type"] = "application/json";
      // Deze kopregel kan een andere website niet meesturen zonder toestemming van de server.
      headers["X-CR-Client"] = "1";
      if (this.csrf) headers["X-CSRF-Token"] = this.csrf;
    }

    const send = async (signal) => {
      let response;
      try {
        response = await this.fetch(this.base + path, {
          method,
          headers,
          body: body === null ? undefined : JSON.stringify(body),
          credentials: "same-origin",
          cache: "no-store",
          ...(signal ? { signal } : {})
        });
      } catch (error) {
        throw new ServerError(0, "Geen verbinding met de server.");
      }
      let data = null;
      try {
        data = await response.json();
      } catch (error) {
        data = null;
      }
      return { response, data };
    };
    const { response, data } = timeoutMs > 0 ? await this.withTimeout(send, timeoutMs) : await send(null);

    if (!data || typeof data !== "object") {
      throw new ServerError(response.status, "De server gaf een antwoord dat niet te lezen is.", { unreadable: true });
    }
    // De sleutel van de sessie verandert bij inloggen en uitloggen. Het antwoord noemt hem dan.
    if ("csrf" in data) this.csrf = data.csrf || null;

    if (!response.ok && !(passFailure && [502, 503].includes(response.status))) {
      throw new ServerError(response.status, typeof data.message === "string" ? data.message : "Het verzoek is mislukt.");
    }
    return data;
  }

  // Voert `send` uit, maar wacht hooguit `timeoutMs`. Daarna wordt het verzoek afgebroken en volgt
  // een ServerError met status 0, zoals bij geen verbinding.
  async withTimeout(send, timeoutMs) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timer;
    const expired = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        controller?.abort();
        reject(new ServerError(0, "Geen verbinding met de server."));
      }, timeoutMs);
    });
    try {
      return await Promise.race([send(controller?.signal ?? null), expired]);
    } finally {
      clearTimeout(timer);
    }
  }
}
