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
  constructor(status, message) {
    super(message);
    this.name = "ServerError";
    this.status = status;
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

  // Wie is dit gezicht? Alleen de kenmerken van het gezicht voor de camera gaan mee.
  recognizeFace(descriptor) {
    return this.request("POST", "/recognize/face", { descriptor: Array.from(descriptor) });
  }

  // Van wie is deze pas?
  recognizeBadge(code) {
    return this.request("POST", "/recognize/badge", { code });
  }

  // Koppelt een pas aan een medewerker zonder pas.
  linkBadge(employeeId, code) {
    return this.request("POST", "/badge/link", { employeeId, code });
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

  async request(method, path, body = null, { passFailure = false } = {}) {
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

    let response;
    try {
      response = await this.fetch(this.base + path, {
        method,
        headers,
        body: body === null ? undefined : JSON.stringify(body),
        credentials: "same-origin",
        cache: "no-store"
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
    if (!data || typeof data !== "object") {
      throw new ServerError(response.status, "De server gaf een antwoord dat niet te lezen is.");
    }
    // De sleutel van de sessie verandert bij inloggen en uitloggen. Het antwoord noemt hem dan.
    if ("csrf" in data) this.csrf = data.csrf || null;

    if (!response.ok && !(passFailure && [502, 503].includes(response.status))) {
      throw new ServerError(response.status, typeof data.message === "string" ? data.message : "Het verzoek is mislukt.");
    }
    return data;
  }
}
