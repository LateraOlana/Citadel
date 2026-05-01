/* ============================================================
   CITADEL — daily capital city game
   ============================================================ */

(() => {
  "use strict";

  // ---------- Constants ----------
  const STORAGE_KEY = "citadel:v1";
  const STATS_KEY = "citadel:stats:v1";
  // Anchor for daily puzzle numbering (UTC). Puzzle 1 = this date.
  const PUZZLE_EPOCH = new Date(Date.UTC(2026, 3, 30)); // Apr 30, 2026
  const MAX_DISTANCE_KM = 20015; // half earth's circumference

  // Warmth thresholds (km). Tuned for global play.
  const WARMTH_TIERS = [
    { max: 100,    name: "Scorching", color: "var(--w-blazing)", glow: "rgba(255,42,77,.7)",  emoji: "🟥" },
    { max: 500,    name: "Hot",       color: "var(--w-hot)",     glow: "rgba(239,71,111,.6)", emoji: "🟧" },
    { max: 1500,   name: "Warm",      color: "var(--w-warm)",    glow: "rgba(255,209,102,.5)",emoji: "🟨" },
    { max: 4000,   name: "Cool",      color: "var(--w-cool)",    glow: "rgba(142,154,175,.4)",emoji: "🟦" },
    { max: Infinity,name:"Cold",      color: "var(--w-cold)",    glow: "rgba(74,144,226,.5)", emoji: "⬛" },
  ];

  const DIR_NAMES = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  const DIR_ARROWS = ["↑","↑","↗","↗","→","→","↘","↘","↓","↓","↙","↙","←","←","↖","↖"];

  // ---------- DOM ----------
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  // ---------- State ----------
  let capitals = [];
  let answer = null;       // {city, country, continent, lat, lon}
  let puzzleNum = null;
  let isFreePlay = false;
  let guesses = [];        // [{name, country, lat, lon, distanceKm, bearingDeg}]
  let gameOver = false;
  let map = null;
  let answerLatLng = null;
  let pinMarkers = [];
  let citadelMarker = null;
  let connectorPolyline = null;
  let suggestionIdx = -1;

  // ---------- Math helpers ----------
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;

  /** Great-circle distance, kilometers. */
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(Math.min(1, a)));
  }

  /** Initial bearing from (lat1,lon1) toward (lat2,lon2), 0–360 (0 = N, 90 = E). */
  function bearing(lat1, lon1, lat2, lon2) {
    const φ1 = toRad(lat1), φ2 = toRad(lat2);
    const Δλ = toRad(lon2 - lon1);
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    return (toDeg(θ) + 360) % 360;
  }

  function compassIdxFromBearing(deg) {
    return Math.round(deg / 22.5) % 16;
  }
  function compassNameFromBearing(deg) {
    return DIR_NAMES[compassIdxFromBearing(deg)];
  }
  function compassArrowFromBearing(deg) {
    return DIR_ARROWS[compassIdxFromBearing(deg)];
  }

  function warmthFor(km) {
    return WARMTH_TIERS.find(t => km < t.max) || WARMTH_TIERS[WARMTH_TIERS.length - 1];
  }

  /** Format kilometers with a thousands separator. */
  function fmtKm(km) {
    return Math.round(km).toLocaleString() + " km";
  }

  function escapeHTML(str = "") {
    return String(str).replace(/[&<>"']/g, ch => ({
      "&": "&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[ch]));
  }

  // ---------- Daily seed ----------
  /** Days since epoch (UTC), so all players in any timezone share the same answer per UTC day. */
  function todaysPuzzleNumber() {
    const now = new Date();
    const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const days = Math.floor((utcMidnight - PUZZLE_EPOCH.getTime()) / 86400000);
    return Math.max(1, days + 1);
  }
  /** mulberry32 PRNG seeded by puzzle number → deterministic per-day pick. */
  function pickDaily(puzzleN, list) {
    let s = (puzzleN * 2654435761) >>> 0;
    let t = s + 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return list[Math.floor(r * list.length)];
  }

  function fmtDate(d) {
    return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  }

  // ---------- Persistence ----------
  function saveProgress() {
    if (isFreePlay) return; // free play doesn't persist mid-game
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        puzzleNum,
        guesses: guesses.map(g => g.name),
        won: gameOver && lastIsCorrect()
      }));
    } catch {}
  }
  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }
  function lastIsCorrect() {
    if (guesses.length === 0) return false;
    return guesses[guesses.length - 1].distanceKm < 0.5;
  }

  function loadStats() {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      if (!raw) return defaultStats();
      const s = JSON.parse(raw);
      return Object.assign(defaultStats(), s);
    } catch { return defaultStats(); }
  }
  function defaultStats() {
    return {
      played: 0,
      wins: 0,
      currentStreak: 0,
      maxStreak: 0,
      lastWinPuzzle: null,
      bestGuesses: null, // smallest count for any win
      totalGuesses: 0,
    };
  }
  function saveStats(s) {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch {}
  }
  function recordWin(guessCount) {
    const s = loadStats();
    s.played += 1;
    s.wins += 1;
    s.totalGuesses += guessCount;
    s.bestGuesses = s.bestGuesses == null ? guessCount : Math.min(s.bestGuesses, guessCount);
    if (s.lastWinPuzzle === puzzleNum - 1) s.currentStreak += 1;
    else s.currentStreak = 1;
    s.maxStreak = Math.max(s.maxStreak, s.currentStreak);
    s.lastWinPuzzle = puzzleNum;
    saveStats(s);
    return s;
  }

  // ---------- Toast ----------
  function toast(msg, isError = false) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.toggle("error", isError);
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  // ---------- Map setup ----------
  function setupMap() {
    map = L.map("map", {
      center: [20, 0],
      zoom: 2,
      worldCopyJump: true,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      minZoom: 2,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
  }

  function buildPinIcon(name, tier, isCorrect = false) {
    const html = `
      <div class="pin ${isCorrect ? "correct" : ""}" style="--pin-color: ${tier.color}; --pin-glow: ${tier.glow};">
        <div class="pin-pulse"></div>
        <div class="pin-dot"></div>
        <div class="pin-label">${escapeHTML(name)}</div>
      </div>`;
    return L.divIcon({
      className: "pin-icon",
      html,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }

  function dropPin(g, isCorrect) {
    const tier = warmthFor(g.distanceKm);
    const marker = L.marker([g.lat, g.lon], {
      icon: buildPinIcon(g.name, tier, isCorrect),
      keyboard: false,
    }).addTo(map);
    pinMarkers.push(marker);

    // Connector line from latest guess toward the answer (only revealed on win)
    if (connectorPolyline) {
      map.removeLayer(connectorPolyline);
      connectorPolyline = null;
    }

    // Fit map to all guesses + a sensible bounds (without revealing answer location)
    if (isCorrect) {
      // On win, also show the answer marker
      const trophyIcon = L.divIcon({
        className: "citadel-icon",
        html: `<div class="citadel-marker">🏰</div>`,
        iconSize: [50, 50],
        iconAnchor: [25, 25],
      });
      citadelMarker = L.marker([answer.lat, answer.lon], { icon: trophyIcon }).addTo(map);

      // Draw soft connecting lines to the answer
      const lines = pinMarkers.slice(0, -1).map(m => {
        const ll = m.getLatLng();
        return L.polyline(
          [[ll.lat, ll.lng], [answer.lat, answer.lon]],
          { color: "#ffd166", weight: 1, opacity: .35, dashArray: "4 6" }
        );
      });
      lines.forEach(l => l.addTo(map));

      const bounds = L.latLngBounds(pinMarkers.map(m => m.getLatLng()));
      bounds.extend([answer.lat, answer.lon]);
      map.flyToBounds(bounds.pad(0.4), { duration: 1.2 });
    } else {
      // Center between latest guess and... wait, we can't reveal direction by panning.
      // So pan-to-guess only.
      map.flyTo([g.lat, g.lon], Math.max(map.getZoom(), 3), { duration: 0.9 });
    }
  }

  // ---------- Compass ----------
  function updateCompass(deg, label, isWin = false) {
    const arrow = $("#compass-arrow");
    const ring = arrow.parentElement;
    arrow.style.transform = `rotate(${deg}deg)`;
    $("#compass-label").textContent = label;
    $("#compass").hidden = false;
    if (isWin) {
      ring.classList.add("win");
      $("#compass-label").textContent = "Found!";
    }
  }

  // ---------- Guess list ----------
  function renderGuessList() {
    const ul = $("#guess-list");
    if (guesses.length === 0) {
      ul.innerHTML = `<li class="guess-empty">No guesses yet. The first one's free.</li>`;
      return;
    }
    ul.innerHTML = guesses.map((g, i) => {
      const isLast = i === guesses.length - 1;
      const isCorrect = g.distanceKm < 0.5;
      const tier = warmthFor(g.distanceKm);
      const dir = isCorrect ? "🎯" : compassArrowFromBearing(g.bearingDeg);
      const dist = isCorrect ? "Correct!" : fmtKm(g.distanceKm);
      return `
        <li class="guess-item ${isCorrect ? "correct" : ""}" style="--warmth: ${tier.color};">
          <span class="guess-num">${i + 1}</span>
          <div class="guess-info">
            <div class="guess-name">${escapeHTML(g.name)}</div>
            <div class="guess-country">${escapeHTML(g.country)}</div>
          </div>
          <div class="guess-feedback">
            <span class="guess-arrow">${dir}</span>
            <span class="guess-distance">${escapeHTML(dist)}</span>
          </div>
        </li>`;
    }).reverse().join(""); // newest on top
  }

  function updateCounter() {
    const el = $("#guess-count");
    el.textContent = guesses.length;
    el.classList.add("bump");
    setTimeout(() => el.classList.remove("bump"), 250);
  }

  // ---------- Suggestions ----------
  function updateSuggestions(query) {
    const box = $("#guess-suggestions");
    if (!query || query.length < 1) { box.hidden = true; return; }
    const q = query.trim().toLowerCase();
    const used = new Set(guesses.map(g => g.name.toLowerCase()));
    const matches = capitals
      .filter(c => c.city.toLowerCase().includes(q) || c.country.toLowerCase().includes(q))
      .slice(0, 8);
    if (matches.length === 0) {
      box.innerHTML = `<div class="suggestion-empty">No matching capital. Try another spelling?</div>`;
      box.hidden = false;
      suggestionIdx = -1;
      return;
    }
    box.innerHTML = matches.map((c, i) => {
      const isUsed = used.has(c.city.toLowerCase());
      return `<div class="suggestion ${isUsed ? "used" : ""}" data-name="${escapeHTML(c.city)}" data-i="${i}">
        <span class="suggestion-city">${escapeHTML(c.city)}</span>
        <span class="suggestion-country">${escapeHTML(c.country)}</span>
      </div>`;
    }).join("");
    box.hidden = false;
    suggestionIdx = -1;
  }
  function highlightSuggestion(idx) {
    const items = $$(".suggestion:not(.used)");
    if (items.length === 0) return;
    suggestionIdx = (idx + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle("is-active", i === suggestionIdx));
    items[suggestionIdx]?.scrollIntoView({ block: "nearest" });
  }
  function pickHighlightedSuggestion() {
    const items = $$(".suggestion:not(.used)");
    if (suggestionIdx >= 0 && items[suggestionIdx]) {
      return items[suggestionIdx].dataset.name;
    }
    // If no highlight, take first non-used result
    return items[0]?.dataset.name || null;
  }
  function hideSuggestions() {
    $("#guess-suggestions").hidden = true;
    suggestionIdx = -1;
  }

  // ---------- Submit guess ----------
  function findCapital(name) {
    const norm = name.trim().toLowerCase();
    return capitals.find(c =>
      c.city.toLowerCase() === norm ||
      c.city.toLowerCase().replace(/[''`]/g, "").replace(/\s+/g," ") === norm.replace(/[''`]/g, "").replace(/\s+/g," ")
    );
  }

  function submitGuess(rawName) {
    if (gameOver) return;
    const name = (rawName ?? $("#guess-input").value).trim();
    if (!name) return;
    const cap = findCapital(name);
    if (!cap) {
      toast("Not a recognized capital city.", true);
      return;
    }
    if (guesses.some(g => g.name.toLowerCase() === cap.city.toLowerCase())) {
      toast("You already guessed that one.", true);
      return;
    }

    const km = haversine(cap.lat, cap.lon, answer.lat, answer.lon);
    const deg = bearing(cap.lat, cap.lon, answer.lat, answer.lon);
    const isCorrect = km < 0.5; // safer than == on floats
    const guess = {
      name: cap.city,
      country: cap.country,
      lat: cap.lat,
      lon: cap.lon,
      distanceKm: km,
      bearingDeg: deg,
    };
    guesses.push(guess);

    // Reset input
    $("#guess-input").value = "";
    hideSuggestions();

    // Update UI
    updateCounter();
    renderGuessList();
    dropPin(guess, isCorrect);

    if (isCorrect) {
      updateCompass(deg, "Found!", true);
      gameOver = true;
      saveProgress();
      onWin();
    } else {
      updateCompass(deg, compassNameFromBearing(deg) + " · " + fmtKm(km));
      saveProgress();
    }
  }

  // ---------- Win sequence ----------
  function onWin() {
    $("#guess-input").disabled = true;
    $("#guess-btn").disabled = true;

    // Stats: only update for daily mode
    let stats = loadStats();
    if (!isFreePlay) {
      stats = recordWin(guesses.length);
    }

    // Populate modal
    $("#win-city").textContent = answer.city;
    $("#win-country").textContent = answer.country;
    $("#win-guess-count").textContent = guesses.length;
    $("#win-streak").textContent = isFreePlay ? "—" : stats.currentStreak;
    $("#win-played").textContent = isFreePlay ? "—" : stats.wins;

    renderShareGrid();

    // For free play, allow another round
    $("#play-again-btn").hidden = !isFreePlay;
    $("#win-next-hint").textContent = isFreePlay
      ? "Want another?"
      : "Come back tomorrow for a new citadel.";

    setTimeout(() => {
      $("#win-modal").hidden = false;
      runConfetti(2200);
    }, 700);
  }

  function renderShareGrid() {
    // Build one row per guess: warmth tile + small dir arrow at end
    const rows = guesses.map(g => {
      if (g.distanceKm < 0.5) return "🟩 🎯";
      const tier = warmthFor(g.distanceKm);
      const dir = compassArrowFromBearing(g.bearingDeg);
      return `${tier.emoji} ${dir}`;
    });
    const grid = rows.map(r => `<div class="share-row">${r}</div>`).join("");
    $("#share-grid").innerHTML = grid;
  }

  function buildShareText() {
    const header = isFreePlay
      ? `Citadel · Free play · ${guesses.length} guess${guesses.length === 1 ? "" : "es"}`
      : `Citadel #${puzzleNum} · ${guesses.length} guess${guesses.length === 1 ? "" : "es"}`;
    const lines = guesses.map(g => {
      if (g.distanceKm < 0.5) return "🟩 🎯";
      return `${warmthFor(g.distanceKm).emoji} ${compassArrowFromBearing(g.bearingDeg)}`;
    });
    return [header, ...lines, "https://citadel.game"].join("\n");
  }

  async function shareResult() {
    const text = buildShareText();
    if (navigator.share) {
      try { await navigator.share({ text, title: "Citadel" }); return; } catch {}
    }
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied result to clipboard!");
    } catch {
      toast("Couldn't share — long-press to copy.", true);
    }
  }

  // ---------- Confetti ----------
  function runConfetti(ms = 2000) {
    const canvas = $("#confetti");
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    ctx.scale(dpr, dpr);

    const colors = ["#ffd166", "#ef476f", "#06d6a0", "#fff8e7", "#ff5c8a", "#4a90e2"];
    const N = 140;
    const particles = [];
    for (let i = 0; i < N; i++) {
      particles.push({
        x: innerWidth / 2 + (Math.random() - .5) * 160,
        y: innerHeight / 2 - 40,
        vx: (Math.random() - .5) * 9,
        vy: -Math.random() * 11 - 6,
        ay: 0.32 + Math.random() * 0.08,
        size: 4 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - .5) * 0.3,
        shape: Math.random() < 0.5 ? "rect" : "circle",
      });
    }
    const start = performance.now();
    function frame(now) {
      const t = now - start;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      particles.forEach(p => {
        p.vy += p.ay;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - t / ms);
        if (p.shape === "rect") {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });
      if (t < ms) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    }
    requestAnimationFrame(frame);
  }

  // ---------- Modals ----------
  function openModal(id) { $(id).hidden = false; }
  function closeModal(id) { $(id).hidden = true; }
  function bindModalClosers() {
    document.addEventListener("click", e => {
      if (e.target.matches("[data-close]")) {
        const m = e.target.closest(".modal");
        if (m) m.hidden = true;
      }
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        $$(".modal:not([hidden])").forEach(m => m.hidden = true);
      }
    });
  }

  function refreshStatsModal() {
    const s = loadStats();
    $("#stats-played").textContent = s.played;
    $("#stats-wins").textContent = s.wins;
    $("#stats-streak").textContent = s.currentStreak;
    $("#stats-best").textContent = s.bestGuesses ?? "—";
    const avg = s.wins > 0 ? (s.totalGuesses / s.wins).toFixed(1) : "—";
    $("#stats-avg").textContent = avg;
  }

  // ---------- Game lifecycle ----------
  function startDailyGame() {
    isFreePlay = false;
    puzzleNum = todaysPuzzleNumber();
    answer = pickDaily(puzzleNum, capitals);
    answerLatLng = [answer.lat, answer.lon];
    gameOver = false;
    guesses = [];
    pinMarkers.forEach(m => m.remove()); pinMarkers = [];
    if (citadelMarker) { citadelMarker.remove(); citadelMarker = null; }
    map.eachLayer(l => { if (l instanceof L.Polyline && !(l instanceof L.Rectangle)) map.removeLayer(l); });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18, minZoom: 2,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    map.setView([20, 0], 2);
    $("#compass").hidden = true;
    document.querySelector(".compass-ring")?.classList.remove("win");

    // Update header
    $("#puzzle-num").textContent = `Puzzle #${puzzleNum}`;
    $("#puzzle-date").textContent = fmtDate(new Date());
    $("#puzzle-mode-badge").hidden = true;

    // Restore progress if same puzzle was in progress
    const saved = loadProgress();
    if (saved && saved.puzzleNum === puzzleNum && Array.isArray(saved.guesses)) {
      saved.guesses.forEach(name => submitGuess(name));
      // submitGuess updates UI; if final was a win, modal already opened
    }

    renderGuessList();
    updateCounter();
    $("#guess-input").disabled = false;
    $("#guess-btn").disabled = false;
    $("#guess-input").focus();
  }

  function startFreePlay() {
    isFreePlay = true;
    answer = capitals[Math.floor(Math.random() * capitals.length)];
    answerLatLng = [answer.lat, answer.lon];
    gameOver = false;
    guesses = [];
    pinMarkers.forEach(m => m.remove()); pinMarkers = [];
    if (citadelMarker) { citadelMarker.remove(); citadelMarker = null; }
    map.eachLayer(l => { if (l instanceof L.Polyline && !(l instanceof L.Rectangle)) map.removeLayer(l); });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18, minZoom: 2,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    map.setView([20, 0], 2);
    $("#compass").hidden = true;
    document.querySelector(".compass-ring")?.classList.remove("win");

    $("#puzzle-num").textContent = `Free play`;
    $("#puzzle-date").textContent = "Random capital";
    $("#puzzle-mode-badge").hidden = false;

    renderGuessList();
    updateCounter();
    $("#guess-input").disabled = false;
    $("#guess-btn").disabled = false;
    $("#guess-input").focus();
    toast("New random city — find it!");
  }

  // ---------- Boot ----------
  async function boot() {
    try {
      const res = await fetch("capitals.json", { cache: "no-store" });
      capitals = await res.json();
    } catch (e) {
      toast("Couldn't load city data. Refresh to try again.", true);
      console.error(e);
      return;
    }

    setupMap();
    bindModalClosers();
    bindUI();

    // Show how-to on first visit
    if (!localStorage.getItem("citadel:visited")) {
      $("#how-modal").hidden = false;
      localStorage.setItem("citadel:visited", "1");
    }

    startDailyGame();
  }

  function bindUI() {
    const input = $("#guess-input");

    $("#guess-btn").addEventListener("click", () => submitGuess());
    input.addEventListener("input", () => updateSuggestions(input.value));
    input.addEventListener("focus", () => updateSuggestions(input.value));
    input.addEventListener("blur", () => setTimeout(hideSuggestions, 150));

    input.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        const picked = pickHighlightedSuggestion();
        submitGuess(picked || input.value);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        highlightSuggestion(suggestionIdx + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        highlightSuggestion(suggestionIdx - 1);
      } else if (e.key === "Escape") {
        hideSuggestions();
      }
    });

    $("#guess-suggestions").addEventListener("mousedown", e => {
      const item = e.target.closest(".suggestion");
      if (!item || item.classList.contains("used")) return;
      submitGuess(item.dataset.name);
    });

    $("#how-btn").addEventListener("click", () => openModal("#how-modal"));
    $("#stats-btn").addEventListener("click", () => {
      refreshStatsModal();
      openModal("#stats-modal");
    });
    $("#mode-btn").addEventListener("click", () => {
      if (gameOver || guesses.length === 0 || confirm("Abandon current puzzle and start a free-play round?")) {
        startFreePlay();
      }
    });

    $("#share-btn").addEventListener("click", shareResult);
    $("#play-again-btn").addEventListener("click", () => {
      $("#win-modal").hidden = true;
      startFreePlay();
    });

    $("#reset-stats-btn").addEventListener("click", () => {
      if (confirm("Reset your Citadel stats? This can't be undone.")) {
        localStorage.removeItem(STATS_KEY);
        refreshStatsModal();
        toast("Stats reset.");
      }
    });
  }

  // Wait for both Leaflet and DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
