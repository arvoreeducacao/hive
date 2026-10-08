(function () {
  const ext = globalThis.browser || globalThis.chrome;
  const PT = /^pt/i.test(navigator.language || "");
  const SAY = PT
    ? {
      lead: "Grava reuniões do Google Meet pelas legendas. Abra uma chamada e use o botão Gravar ao lado dos botões do Meet.",
      aveiaAs: (email) => (email ? `Conectada como ${email}` : "Conectada"), aveiaNone: "Ainda não conectada.", aveiaOff: "Esta instalação não tem um endereço do Aveia configurado. Grave pelo Hive.", aveiaExpired: "A conexão expirou.", connect: "Entrar no Aveia para conectar", out: "Desconectar",
      hiveReady: "Pronto neste computador.", hiveMissing: "Não encontrei o Hive neste computador. Só quem tem o app instalado grava nele.", hiveShut: "O Hive está fechado. Abra o app para gravar nele.", hiveOff: "Desmarcado no menu da chamada.",
      localTitle: "Desenvolvimento", localOff: "Para conectar a um Aveia rodando em localhost, permita o acesso e abra /conectar-extensao nele.", localOn: "Acesso a localhost permitido. Abra /conectar-extensao no Aveia local para conectar.", localAllow: "Permitir localhost",
      hiveOnly: "Hive · legendas do Meet", language: "Idioma das legendas", languageSay: "Ao gravar, a extensão põe as legendas do Meet neste idioma."
    }
    : {
      lead: "Records Google Meet calls from their captions. Open a call and use the Record button beside Meet's own buttons.",
      aveiaAs: (email) => (email ? `Connected as ${email}` : "Connected"), aveiaNone: "Not connected yet.", aveiaOff: "This install has no Aveia address configured. Record with the Hive.", aveiaExpired: "The connection expired.", connect: "Sign in to Aveia to connect", out: "Disconnect",
      hiveReady: "Ready on this computer.", hiveMissing: "The Hive was not found on this computer. Only people with the app installed record in it.", hiveShut: "The Hive is closed. Open the app to record in it.", hiveOff: "Unticked in the call's menu.",
      localTitle: "Development", localOff: "To connect to an Aveia running on localhost, allow the access and open /conectar-extensao on it.", localOn: "Access to localhost allowed. Open /conectar-extensao on the local Aveia to connect.", localAllow: "Allow localhost",
      hiveOnly: "Hive · Meet captions", language: "Caption language", languageSay: "When recording, the extension sets Meet's captions to this language."
    };
  const at = (id) => document.getElementById(id);
  const tongue = globalThis.AveiaCaptionLanguage;
  const LOCAL = globalThis.AveiaOrigin ? globalThis.AveiaOrigin.LOCAL_PATTERNS : ["http://localhost/*", "http://127.0.0.1/*"];
  const wanted = () => (ext.scripting || !ext.contentScripts ? { origins: LOCAL, permissions: ["scripting"] } : { origins: LOCAL });

  function draw(state) {
    const aveia = (state && state.destinations && state.destinations.aveia) || {};
    const hive = (state && state.destinations && state.destinations.hive) || {};
    at("aveia-say").textContent = aveia.available ? SAY.aveiaAs(aveia.email) : aveia.configured === false ? SAY.aveiaOff : aveia.expired ? SAY.aveiaExpired : SAY.aveiaNone;
    at("aveia-connect").hidden = !!aveia.available || !/^https?:\/\//.test(aveia.connectUrl || "");
    if (!at("aveia-connect").hidden) at("aveia-connect").href = aveia.connectUrl;
    at("aveia-out").hidden = !aveia.available;
    at("hive-say").textContent = hive.available ? SAY.hiveReady : hive.enabled === false && !hive.known ? SAY.hiveOff : hive.error === "no-host" || !hive.known ? SAY.hiveMissing : SAY.hiveShut;
  }

  async function drawLocal() {
    let allowed = false;
    try { allowed = await ext.permissions.contains(wanted()); } catch {}
    at("local-say").textContent = allowed ? SAY.localOn : SAY.localOff;
    at("local-allow").hidden = allowed;
  }

  async function drawLanguage() {
    let kept;
    try { kept = (await ext.storage.local.get("captionLanguage")).captionLanguage; } catch {}
    at("language-pick").value = tongue.prefOf(kept);
  }

  const AVEIA_ON = !!(globalThis.AveiaOrigin && globalThis.AveiaOrigin.DEFAULT_BASE);
  if (!AVEIA_ON) {
    at("name").textContent = SAY.hiveOnly;
    document.title = SAY.hiveOnly;
    at("aveia-part").hidden = true;
    at("local-part").hidden = true;
  }
  at("lead").textContent = SAY.lead;
  at("language-label").textContent = SAY.language;
  at("language-say").textContent = SAY.languageSay;
  for (const code of tongue.CODES) {
    const one = document.createElement("option");
    one.value = code;
    one.textContent = tongue.labelOf(code, PT);
    at("language-pick").appendChild(one);
  }
  at("language-pick").addEventListener("change", async () => {
    try { await ext.storage.local.set({ captionLanguage: tongue.prefOf(at("language-pick").value) }); } catch {}
    drawLanguage();
  });
  at("aveia-connect").textContent = SAY.connect;
  at("aveia-out").textContent = SAY.out;
  at("local-title").textContent = SAY.localTitle;
  at("local-allow").textContent = SAY.localAllow;
  at("aveia-out").addEventListener("click", async () => draw(await ext.runtime.sendMessage({ type: "aveia-sign-out" })));
  at("local-allow").addEventListener("click", async () => {
    try { await ext.permissions.request(wanted()); } catch {}
    try { await ext.runtime.sendMessage({ type: "aveia-local" }); } catch {}
    drawLocal();
  });
  ext.runtime.sendMessage({ type: "aveia-state", refresh: true }).then(draw, () => draw(null));
  drawLocal();
  drawLanguage();
})();
