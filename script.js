(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const STORAGE = {
    theme: "bayes_theme",
    decimals: "bayes_decimals",
    motion: "bayes_motion",
    score: "bayes_score",
    diff: "bayes_diff",
    streak: "bayes_streak",
    hyp: "bayes_hyp",
    privacy: "bayes_privacy_seen"
  };

  const state = {
    theme: "midnight",
    decimals: 4,
    motion: "auto",
    score: 0,
    diff: 2,
    streak: 0,
    hypRows: []
  };

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const isNum = (n) => Number.isFinite(n);

  const nowTime = () => {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const toast = (() => {
    const el = $("#toast");
    let t = null;
    const show = (msg) => {
      if (!el) return;
      el.textContent = msg;
      el.classList.add("is-on");
      if (t) clearTimeout(t);
      t = setTimeout(() => el.classList.remove("is-on"), 1800);
    };
    return { show };
  })();

  const fmt = (x, decimals = state.decimals) => {
    if (!isNum(x)) return "—";
    const d = clamp(decimals, 0, 10);
    const s = x.toFixed(d);
    return s.replace(/\.?0+$/, (m) => (m.startsWith(".") ? "" : m));
  };

  const fmtPct = (p) => {
    if (!isNum(p)) return "—";
    const v = clamp(p, 0, 1) * 100;
    const d = v >= 10 ? 2 : 3;
    return `${fmt(v, d)}%`;
  };

  const parseP = (raw) => {
    const s = String(raw ?? "").trim().replace(",", ".");
    if (!s) return NaN;
    const n = Number(s);
    if (!Number.isFinite(n)) return NaN;
    return n;
  };

  const sanitizeText = (s) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();

  const bayesBinaryPosterior = (prior, like, altLike) => {
    const p = clamp(prior, 0, 1);
    const l = clamp(like, 0, 1);
    const a = clamp(altLike, 0, 1);
    const num = l * p;
    const den = num + a * (1 - p);
    if (den === 0) return NaN;
    return num / den;
  };

  const medicalPosterior = (prev, sens, spec) => {
    const p = clamp(prev, 0, 1);
    const se = clamp(sens, 0, 1);
    const sp = clamp(spec, 0, 1);
    const fpr = 1 - sp;
    const num = se * p;
    const den = num + fpr * (1 - p);
    const ppv = den === 0 ? NaN : num / den;
    const numNeg = (1 - se) * p;
    const denNeg = numNeg + sp * (1 - p);
    const pdNeg = denNeg === 0 ? NaN : numNeg / denNeg;
    const npvNum = sp * (1 - p);
    const npvDen = npvNum + (1 - se) * p;
    const npv = npvDen === 0 ? NaN : npvNum / npvDen;
    return { ppv, pdNeg, npv, fpr };
  };

  const confusionCounts = (N, prev, sens, spec) => {
    const p = clamp(prev, 0, 1);
    const se = clamp(sens, 0, 1);
    const sp = clamp(spec, 0, 1);
    const tp = N * p * se;
    const fn = N * p * (1 - se);
    const tn = N * (1 - p) * sp;
    const fp = N * (1 - p) * (1 - sp);
    return { tp, fn, tn, fp };
  };

  const oddsFromP = (p) => {
    const x = clamp(p, 0, 1);
    if (x === 1) return Infinity;
    if (x === 0) return 0;
    return x / (1 - x);
  };

  const pFromOdds = (o) => {
    if (!isNum(o)) return NaN;
    if (o === Infinity) return 1;
    if (o <= 0) return 0;
    return o / (1 + o);
  };

  const applySettings = () => {
    document.body.dataset.theme = state.theme;
    $("#scoreValue").textContent = String(state.score);
    $("#diffValue").textContent = String(state.diff);
    $("#streakValue").textContent = String(state.streak);
    $("#themeSelect").value = state.theme;
    $("#decSelect").value = String(state.decimals);
    $("#motionSelect").value = state.motion;
    document.documentElement.style.scrollBehavior =
      state.motion === "reduced" ? "auto" : "smooth";
  };

  const loadState = () => {
    const t = localStorage.getItem(STORAGE.theme);
    const d = localStorage.getItem(STORAGE.decimals);
    const m = localStorage.getItem(STORAGE.motion);
    const s = localStorage.getItem(STORAGE.score);
    const df = localStorage.getItem(STORAGE.diff);
    const st = localStorage.getItem(STORAGE.streak);
    const hyp = localStorage.getItem(STORAGE.hyp);

    if (t) state.theme = t;
    if (d && Number.isFinite(Number(d))) state.decimals = clamp(Number(d), 0, 10);
    if (m) state.motion = m;
    if (s && Number.isFinite(Number(s))) state.score = Math.max(0, Math.floor(Number(s)));
    if (df && Number.isFinite(Number(df))) state.diff = clamp(Math.floor(Number(df)), 1, 5);
    if (st && Number.isFinite(Number(st))) state.streak = Math.max(0, Math.floor(Number(st)));

    if (hyp) {
      try {
        const rows = JSON.parse(hyp);
        if (Array.isArray(rows)) state.hypRows = rows.slice(0, 8);
      } catch {}
    }
  };

  const saveState = () => {
    localStorage.setItem(STORAGE.theme, state.theme);
    localStorage.setItem(STORAGE.decimals, String(state.decimals));
    localStorage.setItem(STORAGE.motion, state.motion);
    localStorage.setItem(STORAGE.score, String(state.score));
    localStorage.setItem(STORAGE.diff, String(state.diff));
    localStorage.setItem(STORAGE.streak, String(state.streak));
    localStorage.setItem(STORAGE.hyp, JSON.stringify(state.hypRows));
  };

  const switchPanel = (name) => {
    $$(".tab").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === name));
    $$(".panel").forEach((p) => p.classList.toggle("is-active", p.dataset.panel === name));
    const main = $("#main");
    if (main) main.scrollIntoView({ block: "start" });
    if (name === "medical") renderMedical();
    if (name === "multi") renderMulti();
    if (name === "tutor") renderTutorContext();
  };

  const attachTabs = () => {
    $$(".tab").forEach((b) => {
      b.addEventListener("click", () => switchPanel(b.dataset.tab));
    });
  };

  const attachStepper = () => {
    $$("#stepper .step").forEach((s) => {
      s.addEventListener("click", () => s.classList.toggle("is-on"));
    });
  };

  const mini = (() => {
    const priorEl = $("#miniPrior");
    const likeEl = $("#miniLike");
    const altEl = $("#miniAlt");
    const outEl = $("#miniPosterior");
    const stepsEl = $("#miniSteps");
    const btnRand = $("#miniRandom");
    const btnExplain = $("#miniExplain");

    const read = () => ({
      prior: parseP(priorEl.value),
      like: parseP(likeEl.value),
      alt: parseP(altEl.value)
    });

    const set = (p, l, a) => {
      priorEl.value = fmt(clamp(p, 0, 1), 4);
      likeEl.value = fmt(clamp(l, 0, 1), 4);
      altEl.value = fmt(clamp(a, 0, 1), 4);
      stepsEl.textContent = "";
      update();
    };

    const update = () => {
      const { prior, like, alt } = read();
      const post = bayesBinaryPosterior(prior, like, alt);
      outEl.textContent = `${fmt(post)} (${fmtPct(post)})`;
      if (stepsEl.dataset.expanded === "1") explain();
    };

    const explain = () => {
      const { prior, like, alt } = read();
      const p = clamp(prior, 0, 1);
      const l = clamp(like, 0, 1);
      const a = clamp(alt, 0, 1);
      const num = l * p;
      const den = num + a * (1 - p);
      const post = den === 0 ? NaN : num / den;
      stepsEl.dataset.expanded = "1";
      stepsEl.innerHTML = [
        line(`1) Prior: <span class="mono">P(H) = ${fmt(p)}</span>`),
        line(`2) Likelihood: <span class="mono">P(E|H) = ${fmt(l)}</span>`),
        line(`3) Alternative likelihood: <span class="mono">P(E|¬H) = ${fmt(a)}</span>`),
        line(`4) Evidence: <span class="mono">P(E) = P(E|H)P(H) + P(E|¬H)P(¬H) = ${fmt(num)} + ${fmt(a * (1 - p))} = ${fmt(den)}</span>`),
        line(`5) Posterior: <span class="mono">P(H|E) = ${fmt(num)} / ${fmt(den)} = ${fmt(post)} (${fmtPct(post)})</span>`)
      ].join("");
    };

    const line = (html) => `<div class="step-line">${html}</div>`;

    const rand = () => {
      const p = Math.random() * 0.5;
      const l = 0.55 + Math.random() * 0.44;
      const a = Math.random() * 0.45;
      set(p, l, a);
      toast.show("Mini‑example randomized");
    };

    const wire = () => {
      [priorEl, likeEl, altEl].forEach((el) => el.addEventListener("input", update));
      btnRand.addEventListener("click", rand);
      btnExplain.addEventListener("click", () => {
        stepsEl.dataset.expanded = "1";
        explain();
      });
      update();
    };

    return { wire, set, read, explain };
  })();

  const medical = (() => {
    const prevR = $("#prevRange");
    const prevI = $("#prevInput");
    const sensR = $("#sensRange");
    const sensI = $("#sensInput");
    const specR = $("#specRange");
    const specI = $("#specInput");
    const ppvOut = $("#ppvOut");
    const pdnegOut = $("#pdnegOut");
    const ppvExplain = $("#ppvExplain");
    const pdnegExplain = $("#pdnegExplain");
    const tpCell = $("#tpCell");
    const fnCell = $("#fnCell");
    const fpCell = $("#fpCell");
    const tnCell = $("#tnCell");
    const chart = $("#medicalChart");
    const steps = $("#medicalSteps");

    const N = 10000;

    const read = () => ({
      prev: parseP(prevI.value),
      sens: parseP(sensI.value),
      spec: parseP(specI.value)
    });

    const syncPair = (range, input) => {
      range.addEventListener("input", () => {
        input.value = fmt(parseFloat(range.value), 4);
        renderMedical();
      });
      input.addEventListener("input", () => {
        const v = parseP(input.value);
        if (Number.isFinite(v)) range.value = String(clamp(v, 0, 1));
        renderMedical();
      });
    };

    const render = () => {
      const { prev, sens, spec } = read();
      const p = clamp(prev, 0, 1);
      const se = clamp(sens, 0, 1);
      const sp = clamp(spec, 0, 1);
      prevR.value = String(p);
      sensR.value = String(se);
      specR.value = String(sp);

      const { ppv, pdNeg, npv, fpr } = medicalPosterior(p, se, sp);
      ppvOut.textContent = `${fmt(ppv)} (${fmtPct(ppv)})`;
      pdnegOut.textContent = `${fmt(pdNeg)} (${fmtPct(pdNeg)})`;

      ppvExplain.textContent = `Using Bayes: P(D|+) = (P(+|D)P(D)) / (P(+|D)P(D) + P(+|¬D)P(¬D)). Here P(+|¬D) = 1−specificity = ${fmt(fpr)}.`;
      pdnegExplain.textContent = `After a negative: P(D|−) = (P(−|D)P(D)) / (P(−|D)P(D) + P(−|¬D)P(¬D)).`;

      const c = confusionCounts(N, p, se, sp);
      tpCell.textContent = `TP ${fmt(c.tp, 0)}`;
      fnCell.textContent = `FN ${fmt(c.fn, 0)}`;
      fpCell.textContent = `FP ${fmt(c.fp, 0)}`;
      tnCell.textContent = `TN ${fmt(c.tn, 0)}`;

      steps.innerHTML = [
        stepLine(`1) Prior prevalence: <span class="mono">P(D) = ${fmt(p)}</span>`),
        stepLine(`2) Sensitivity: <span class="mono">P(+|D) = ${fmt(se)}</span>`),
        stepLine(`3) False positive rate: <span class="mono">P(+|¬D) = 1−P(−|¬D) = 1−${fmt(sp)} = ${fmt(1 - sp)}</span>`),
        stepLine(`4) Evidence: <span class="mono">P(+) = ${fmt(se * p)} + ${fmt((1 - sp) * (1 - p))} = ${fmt(se * p + (1 - sp) * (1 - p))}</span>`),
        stepLine(`5) Posterior: <span class="mono">P(D|+) = ${fmt(ppv)} (${fmtPct(ppv)})</span>`),
        stepLine(`6) NPV (optional): <span class="mono">P(¬D|−) = ${fmt(npv)} (${fmtPct(npv)})</span>`)
      ].join("");

      drawMedicalChart(chart, p, ppv);
      renderTutorContext();
    };

    const stepLine = (html) => `<div class="step-line">${html}</div>`;

    const drawMedicalChart = (canvas, prior, post) => {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      const pad = 52;
      const baseY = h - pad;
      const leftX = pad;
      const rightX = w - pad;
      const barW = 150;

      const bg = getComputedStyle(document.body).getPropertyValue("--surface").trim() || "rgba(255,255,255,.06)";
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const axis = getComputedStyle(document.body).getPropertyValue("--muted").trim() || "rgba(255,255,255,.7)";
      ctx.strokeStyle = axis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, pad);
      ctx.lineTo(pad, baseY);
      ctx.lineTo(w - pad, baseY);
      ctx.stroke();

      const a1 = getComputedStyle(document.body).getPropertyValue("--accent").trim();
      const a2 = getComputedStyle(document.body).getPropertyValue("--accent-2").trim();

      const maxV = 1;
      const barH = (v) => (baseY - pad) * (clamp(v, 0, maxV) / maxV);

      ctx.fillStyle = a1 || "#60a5fa";
      const priorH = barH(prior);
      ctx.fillRect(leftX + 40, baseY - priorH, barW, priorH);

      ctx.fillStyle = a2 || "#f43f5e";
      const postH = barH(post);
      ctx.fillRect(rightX - barW - 40, baseY - postH, barW, postH);

      ctx.fillStyle = axis;
      ctx.font = `600 16px ${getComputedStyle(document.body).fontFamily}`;
      ctx.fillText("Prior P(D)", leftX + 54, baseY + 30);
      ctx.fillText("Posterior P(D|+)", rightX - barW - 36, baseY + 30);

      ctx.font = `700 18px ${getComputedStyle(document.body).fontFamily}`;
      ctx.fillText(fmtPct(prior), leftX + 74, baseY - priorH - 14);
      ctx.fillText(fmtPct(post), rightX - barW - 8, baseY - postH - 14);
    };

    const set = (prev, sens, spec) => {
      prevI.value = fmt(clamp(prev, 0, 1), 4);
      sensI.value = fmt(clamp(sens, 0, 1), 4);
      specI.value = fmt(clamp(spec, 0, 1), 4);
      prevR.value = String(clamp(prev, 0, 1));
      sensR.value = String(clamp(sens, 0, 1));
      specR.value = String(clamp(spec, 0, 1));
      render();
    };

    const wire = () => {
      syncPair(prevR, prevI);
      syncPair(sensR, sensI);
      syncPair(specR, specI);
      $("#medicalReset").addEventListener("click", () => {
        set(0.01, 0.95, 0.98);
        toast.show("Medical example reset");
      });
      $("#medicalToQuiz").addEventListener("click", () => {
        switchPanel("quiz");
        quiz.start("medical");
      });
      render();
    };

    return { wire, render, read, set };
  })();

  const multi = (() => {
    const body = $("#hypBody");
    const chart = $("#multiChart");
    const evidenceLine = $("#evidenceLine");
    const evidenceValue = $("#evidenceValue");
    const narrative = $("#multiNarrative");

    const defaultRows = () => [
      { name: "H1", prior: 0.5, like: 0.6 },
      { name: "H2", prior: 0.5, like: 0.4 }
    ];

    const normalizePriors = (rows) => {
      const sum = rows.reduce((a, r) => a + clamp(parseP(r.prior), 0, 1), 0);
      if (sum <= 0) return rows;
      return rows.map((r) => ({ ...r, prior: clamp(parseP(r.prior), 0, 1) / sum }));
    };

    const compute = (rows) => {
      const cleaned = rows.map((r) => ({
        name: sanitizeText(r.name || "H"),
        prior: clamp(parseP(r.prior), 0, 1),
        like: clamp(parseP(r.like), 0, 1)
      }));

      const un = cleaned.map((r) => r.prior * r.like);
      const Z = un.reduce((a, x) => a + x, 0);
      const post = Z === 0 ? cleaned.map(() => NaN) : un.map((x) => x / Z);
      return { cleaned, un, Z, post };
    };

    const rowTpl = (r, idx, un, post) => {
      const nameId = `hname-${idx}`;
      const priorId = `hprior-${idx}`;
      const likeId = `hlike-${idx}`;
      return `<tr data-idx="${idx}">
        <td><input id="${nameId}" value="${escapeAttr(r.name)}" aria-label="Hypothesis name ${idx + 1}" /></td>
        <td class="num"><input id="${priorId}" value="${fmt(r.prior)}" aria-label="Prior ${idx + 1}" /></td>
        <td class="num"><input id="${likeId}" value="${fmt(r.like)}" aria-label="Likelihood ${idx + 1}" /></td>
        <td class="num mono">${fmt(un)}</td>
        <td class="num mono"><b>${fmt(post)}</b> <span class="muted small">(${fmtPct(post)})</span></td>
        <td><button class="btn ghost" type="button" data-del="${idx}">Remove</button></td>
      </tr>`;
    };

    const escapeAttr = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

    const render = () => {
      if (!state.hypRows.length) state.hypRows = defaultRows();
      state.hypRows = state.hypRows.slice(0, 8);

      const { cleaned, un, Z, post } = compute(state.hypRows);
      const html = cleaned.map((r, i) => rowTpl(r, i, un[i], post[i])).join("");
      body.innerHTML = html;

      evidenceLine.textContent = `P(E) = ${cleaned.map((r, i) => `P(E|${r.name})P(${r.name})`).join(" + ")}`;
      evidenceValue.textContent = `Evidence value P(E) = ${fmt(Z)}. Posterior is unnormalized value divided by P(E).`;

      const maxI = post.reduce((best, v, i) => (v > post[best] ? i : best), 0);
      const bestName = cleaned[maxI]?.name ?? "—";
      const bestPost = post[maxI];
      const second = [...post].map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v)[1];
      const gap = second ? bestPost - second.v : bestPost;

      narrative.innerHTML = [
        stepLine(`Most supported hypothesis after evidence: <b>${escapeHtml(bestName)}</b> with posterior <span class="mono">${fmt(bestPost)} (${fmtPct(bestPost)})</span>.`),
        stepLine(`Normalization constant: <span class="mono">P(E) = ${fmt(Z)}</span>. If you forget to normalize, your “posteriors” will not sum to 1.`),
        stepLine(`Separation: top‑2 posterior gap is <span class="mono">${fmt(gap)}</span>. Larger gaps mean clearer evidence.`)
      ].join("");

      wireRowInputs();
      drawMultiChart(chart, cleaned, post);
      renderTutorContext();
      saveState();
    };

    const escapeHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const stepLine = (html) => `<div class="step-line">${html}</div>`;

    const drawMultiChart = (canvas, rows, post) => {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const pad = 54;
      const baseY = h - pad;
      const left = pad;
      const right = w - pad;
      const bg = getComputedStyle(document.body).getPropertyValue("--surface").trim() || "rgba(255,255,255,.06)";
      const axis = getComputedStyle(document.body).getPropertyValue("--muted").trim() || "rgba(255,255,255,.7)";
      const a1 = getComputedStyle(document.body).getPropertyValue("--accent").trim();
      const a2 = getComputedStyle(document.body).getPropertyValue("--accent-2").trim();

      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = axis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, pad);
      ctx.lineTo(pad, baseY);
      ctx.lineTo(right, baseY);
      ctx.stroke();

      const n = rows.length;
      const span = right - left;
      const groupW = span / Math.max(1, n);
      const bw = Math.max(14, Math.min(48, groupW * 0.25));
      const maxV = 1;

      ctx.font = `600 13px ${getComputedStyle(document.body).fontFamily}`;
      ctx.fillStyle = axis;

      for (let i = 0; i < n; i++) {
        const x = left + i * groupW + groupW * 0.5;
        const prior = clamp(rows[i].prior, 0, 1);
        const po = clamp(post[i], 0, 1);
        const h1 = (baseY - pad) * (prior / maxV);
        const h2 = (baseY - pad) * (po / maxV);

        ctx.fillStyle = a1 || "#60a5fa";
        ctx.fillRect(x - bw - 8, baseY - h1, bw, h1);

        ctx.fillStyle = a2 || "#f43f5e";
        ctx.fillRect(x + 8, baseY - h2, bw, h2);

        ctx.fillStyle = axis;
        const label = rows[i].name.length > 10 ? rows[i].name.slice(0, 10) + "…" : rows[i].name;
        ctx.fillText(label, x - 14, baseY + 26);
      }
    };

    const wireRowInputs = () => {
      $$("tr[data-idx]").forEach((tr) => {
        const idx = Number(tr.dataset.idx);
        const inputs = tr.querySelectorAll("input");
        inputs.forEach((inp) => {
          inp.addEventListener("input", () => {
            const cells = tr.querySelectorAll("input");
            const name = cells[0].value;
            const prior = cells[1].value;
            const like = cells[2].value;
            state.hypRows[idx] = { name, prior, like };
            render();
          });
        });
      });

      $$("button[data-del]").forEach((b) => {
        b.addEventListener("click", () => {
          const idx = Number(b.dataset.del);
          state.hypRows.splice(idx, 1);
          if (state.hypRows.length < 2) state.hypRows.push({ name: "H2", prior: 0.5, like: 0.4 });
          render();
          toast.show("Hypothesis removed");
        });
      });
    };

    const setRows = (rows) => {
      state.hypRows = rows.slice(0, 8);
      render();
    };

    const wire = () => {
      $("#addHyp").addEventListener("click", () => {
        state.hypRows.push({ name: `H${state.hypRows.length + 1}`, prior: 0.1, like: 0.5 });
        render();
        toast.show("Hypothesis added");
      });

      $("#normalizePriors").addEventListener("click", () => {
        state.hypRows = normalizePriors(state.hypRows);
        render();
        toast.show("Priors normalized");
      });

      $("#loadExampleSpam").addEventListener("click", () => {
        setRows([
          { name: "Spam", prior: 0.20, like: 0.60 },
          { name: "Ham", prior: 0.80, like: 0.05 }
        ]);
        toast.show("Spam example loaded");
      });

      render();
    };

    return { wire, render, setRows, compute };
  })();

  const quiz = (() => {
    const qEl = $("#quizQuestion");
    const aEl = $("#quizAnswers");
    const fbEl = $("#quizFeedback");
    const exEl = $("#quizExplain");
    const nextBtn = $("#quizNext");
    const hintBtn = $("#quizHint");

    let current = null;
    let locked = false;
    let mode = "mix";

    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    const genMedical = (diff) => {
      const prev = diff <= 2 ? rand(0.002, 0.05) : rand(0.0005, 0.08);
      const sens = diff <= 2 ? rand(0.85, 0.98) : rand(0.70, 0.995);
      const spec = diff <= 2 ? rand(0.85, 0.99) : rand(0.70, 0.999);
      const { ppv } = medicalPosterior(prev, sens, spec);
      const prompt = `A test has prevalence P(D)=${fmt(prev, 4)}, sensitivity P(+|D)=${fmt(sens, 4)}, and specificity P(−|¬D)=${fmt(spec, 4)}. What is P(D|+)?`;
      const correct = ppv;
      return {
        kind: "mc",
        topic: "medical",
        prompt,
        correct,
        hint: `Compute P(+|¬D)=1−specificity and apply Bayes: (se·prev)/(se·prev + fpr·(1−prev)).`,
        explain: () => explainMedical(prev, sens, spec)
      };
    };

    const explainMedical = (prev, sens, spec) => {
      const p = clamp(prev, 0, 1);
      const se = clamp(sens, 0, 1);
      const sp = clamp(spec, 0, 1);
      const fpr = 1 - sp;
      const num = se * p;
      const den = num + fpr * (1 - p);
      const ppv = den === 0 ? NaN : num / den;
      return [
        line(`Prior prevalence: <span class="mono">P(D)=${fmt(p)}</span>`),
        line(`Sensitivity: <span class="mono">P(+|D)=${fmt(se)}</span>`),
        line(`False positive rate: <span class="mono">P(+|¬D)=1−${fmt(sp)}=${fmt(fpr)}</span>`),
        line(`Evidence: <span class="mono">P(+)=${fmt(num)}+${fmt(fpr * (1 - p))}=${fmt(den)}</span>`),
        line(`Posterior: <b class="mono">P(D|+)=${fmt(ppv)} (${fmtPct(ppv)})</b>`)
      ].join("");
    };

    const genMulti = (diff) => {
      const k = diff <= 2 ? 3 : diff === 3 ? 4 : 5;
      const names = ["A", "B", "C", "D", "E", "F"].slice(0, k).map((x) => `H${x}`);
      let priors = names.map(() => rand(0.05, 1));
      const sum = priors.reduce((a, x) => a + x, 0);
      priors = priors.map((x) => x / sum);
      const likes = names.map(() => rand(0.05, 0.95));
      const rows = names.map((n, i) => ({ name: n, prior: priors[i], like: likes[i] }));
      const { post } = multi.compute(rows);
      const idx = post.reduce((best, v, i) => (v > post[best] ? i : best), 0);
      const prompt = `Evidence E is observed. Which hypothesis is most supported (highest posterior) after updating?`;
      const choices = rows.map((r, i) => ({
        label: `${r.name} (prior ${fmt(r.prior, 3)}, like ${fmt(r.like, 3)})`,
        value: i
      }));
      const correct = idx;
      return {
        kind: "choice",
        topic: "multi",
        prompt,
        correct,
        choices,
        hint: `Compute unnormalized values prior×likelihood; the largest wins after normalization.`,
        explain: () => explainMulti(rows)
      };
    };

    const explainMulti = (rows) => {
      const { cleaned, un, Z, post } = multi.compute(rows);
      const lines = cleaned.map((r, i) => {
        return line(`${r.name}: <span class="mono">${fmt(r.prior, 4)}×${fmt(r.like, 4)}=${fmt(un[i], 6)}</span> → posterior <b class="mono">${fmt(post[i], 4)}</b>`);
      });
      lines.push(line(`Normalize by <span class="mono">P(E)=Σ prior×like = ${fmt(Z, 6)}</span>. Posteriors sum to 1.`));
      return lines.join("");
    };

    const genOdds = (diff) => {
      const p = diff <= 2 ? rand(0.05, 0.5) : rand(0.01, 0.8);
      const bf = diff <= 2 ? rand(1.5, 8) : rand(0.2, 12);
      const post = pFromOdds(oddsFromP(p) * bf);
      const prompt = `Given prior P(H)=${fmt(p, 4)} and Bayes factor BF=${fmt(bf, 4)}, what is posterior P(H|E)?`;
      return {
        kind: "mc",
        topic: "odds",
        prompt,
        correct: post,
        hint: `Convert prior to odds p/(1−p), multiply by BF, convert back odds/(1+odds).`,
        explain: () => [
          line(`Prior odds: <span class="mono">${fmt(oddsFromP(p), 6)}</span>`),
          line(`Posterior odds: <span class="mono">${fmt(oddsFromP(p) * bf, 6)}</span>`),
          line(`Posterior probability: <b class="mono">${fmt(post)} (${fmtPct(post)})</b>`)
        ].join("")
      };
    };

    const buildMC = (correct) => {
      const c = clamp(correct, 0, 1);
      const options = new Set();
      options.add(fmtPct(c));
      const spread = Math.max(0.02, (0.18 / (state.diff + 1)));
      while (options.size < 4) {
        const v = clamp(c + rand(-spread, spread), 0, 1);
        options.add(fmtPct(v));
      }
      const arr = Array.from(options).map((t) => ({
        label: t,
        value: Number(t.replace("%", "")) / 100
      }));
      arr.sort(() => Math.random() - 0.5);
      return arr;
    };

    const line = (html) => `<div class="step-line">${html}</div>`;

    const ask = () => {
      locked = false;
      fbEl.textContent = "";
      exEl.innerHTML = "";
      aEl.innerHTML = "";

      const diff = state.diff;
      const type = mode === "medical" ? "medical" : mode === "multi" ? "multi" : mode === "odds" ? "odds" : pick(["medical", "multi", "odds"]);
      current = type === "medical" ? genMedical(diff) : type === "multi" ? genMulti(diff) : genOdds(diff);

      qEl.textContent = current.prompt;

      if (current.kind === "choice") {
        current.choices.forEach((c) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "answer";
          b.textContent = c.label;
          b.addEventListener("click", () => grade(c.value, b));
          aEl.appendChild(b);
        });
      } else {
        const opts = buildMC(current.correct);
        opts.forEach((o) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "answer";
          b.textContent = o.label;
          b.addEventListener("click", () => grade(o.value, b));
          aEl.appendChild(b);
        });
      }
    };

    const grade = (ans, btn) => {
      if (locked) return;
      locked = true;

      const ok = current.kind === "choice"
        ? ans === current.correct
        : Math.abs(ans - current.correct) <= 0.01;

      const buttons = $$(".answer", aEl);
      buttons.forEach((b) => b.setAttribute("disabled", "disabled"));

      if (ok) {
        btn.classList.add("is-correct");
        state.streak += 1;
        const gain = 10 + state.diff * 4 + Math.min(20, state.streak * 2);
        state.score += gain;
        fbEl.textContent = `Correct. +${gain} score.`;
        if (state.streak % 3 === 0 && state.diff < 5) state.diff += 1;
      } else {
        btn.classList.add("is-wrong");
        state.streak = 0;
        if (state.diff > 1) state.diff -= 1;
        fbEl.textContent = "Not quite. Review the explanation and try again.";
        const correctBtn = buttons.find((b, i) => {
          if (current.kind === "choice") return i === current.correct;
          const v = Number(b.textContent.replace("%", "")) / 100;
          return Math.abs(v - current.correct) <= 0.0001;
        });
        if (correctBtn) correctBtn.classList.add("is-correct");
      }

      $("#scoreValue").textContent = String(state.score);
      $("#diffValue").textContent = String(state.diff);
      $("#streakValue").textContent = String(state.streak);
      exEl.innerHTML = current.explain();
      saveState();
    };

    const hint = () => {
      if (!current) return;
      fbEl.textContent = current.hint;
    };

    const start = (m) => {
      mode = m || "mix";
      ask();
    };

    const wire = () => {
      nextBtn.addEventListener("click", () => ask());
      hintBtn.addEventListener("click", () => hint());
      start("mix");
    };

    return { wire, start };
  })();

  const tutor = (() => {
    const logEl = $("#chatLog");
    const inputEl = $("#chatInput");
    const sendBtn = $("#chatSend");

    const push = (role, text) => {
      const msg = document.createElement("div");
      msg.className = `msg ${role}`;
      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.textContent = text;
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = role === "user" ? `You · ${nowTime()}` : `Tutor · ${nowTime()}`;
      const wrap = document.createElement("div");
      wrap.appendChild(bubble);
      wrap.appendChild(meta);
      msg.appendChild(wrap);
      logEl.appendChild(msg);
      logEl.scrollTop = logEl.scrollHeight;
    };

    const currentMedicalSummary = () => {
      const { prev, sens, spec } = medical.read();
      const { ppv, pdNeg } = medicalPosterior(prev, sens, spec);
      return `P(D)=${fmt(clamp(prev,0,1),4)}, P(+|D)=${fmt(clamp(sens,0,1),4)}, P(-|¬D)=${fmt(clamp(spec,0,1),4)} ⇒ P(D|+)=${fmt(ppv)} (${fmtPct(ppv)}), P(D|-)=${fmt(pdNeg)} (${fmtPct(pdNeg)})`;
    };

    const currentMultiSummary = () => {
      const rows = state.hypRows.length ? state.hypRows : [];
      const { cleaned, post } = multi.compute(rows.length ? rows : [{ name:"H1", prior:0.5, like:0.6 },{ name:"H2", prior:0.5, like:0.4 }]);
      const top = post.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v)[0];
      const best = cleaned[top.i];
      return `${cleaned.length} hypotheses. Top posterior: ${best.name} = ${fmt(post[top.i])} (${fmtPct(post[top.i])}).`;
    };

    const respond = (q) => {
      const raw = sanitizeText(q);
      const s = raw.toLowerCase().trim();

      const lines = (...xs) => xs.filter(Boolean).join("\n");

      const toProb = (t) => {
        const x = String(t).trim();
        if (!x) return null;
        const isPct = x.endsWith("%");
        const n = Number(x.replace("%",""));
        if (!Number.isFinite(n)) return null;
        const p = isPct ? n / 100 : n;
        return clamp(p, 0, 1);
      };

      const pick = (...res) => {
        for (const r of res) {
          const m = s.match(r);
          if (m && m[1] != null) {
            const p = toProb(m[1]);
            if (p != null) return p;
          }
        }
        return null;
      };

      const cmd = s.startsWith("/") ? s.split(/\s+/)[0] : null;

      if (cmd === "/clear") {
        if (logEl) logEl.innerHTML = "";
        return "Cleared the chat.";
      }

      if (cmd === "/medical") { switchPanel("medical"); return "Opened Medical test Bayes."; }
      if (cmd === "/multi") { switchPanel("multi"); return "Opened Multi‑hypothesis Bayes."; }
      if (cmd === "/quiz") { switchPanel("quiz"); return "Opened the Quiz."; }
      if (cmd === "/learn") { switchPanel("learn"); return "Opened Learn."; }
      if (cmd === "/calc") { switchPanel("tools"); return "Opened Tools & Calculator."; }
      if (cmd === "/privacy") { const d=$("#privacyDialog"); if(d) try{d.showModal();}catch{d.setAttribute("open","");} return "Opened Privacy."; }

      if (s.includes("ppv") || s.includes("p(d|+)") || s.includes("p(d| +") || s.includes("p(d|positive") || s.includes("posterior after a positive")) {
        const prev = pick(/prev(?:alence)?\s*[:=]?\s*([0-9.]+%?)/, /prior\s*[:=]?\s*([0-9.]+%?)/, /\bp\(d\)\s*=?\s*([0-9.]+%?)/);
        const sens = pick(/sens(?:itivity)?\s*[:=]?\s*([0-9.]+%?)/, /\bp\(\+\|d\)\s*=?\s*([0-9.]+%?)/, /\bp\(\+\|d\)\s*=?\s*([0-9.]+%?)/);
        const spec = pick(/spec(?:ificity)?\s*[:=]?\s*([0-9.]+%?)/, /\bp\(-\|\s*¬d\)\s*=?\s*([0-9.]+%?)/, /\bp\(-\|not\s*d\)\s*=?\s*([0-9.]+%?)/);
        if (prev != null && sens != null && spec != null) {
          const { ppv, pdNeg, fpr } = medicalPosterior(prev, sens, spec);
          return lines(
            "Computed from your numbers:",
            `1) Prior prevalence P(D) = ${fmt(prev)} (${fmtPct(prev)})`,
            `2) Sensitivity P(+|D) = ${fmt(sens)} (${fmtPct(sens)})`,
            `3) Specificity P(-|¬D) = ${fmt(spec)} (${fmtPct(spec)})`,
            `4) False positive rate P(+|¬D) = 1 - specificity = ${fmt(fpr)} (${fmtPct(fpr)})`,
            "",
            `Posterior (PPV) P(D|+) = ${fmt(ppv)} (${fmtPct(ppv)})`,
            `Posterior after a negative P(D|-) = ${fmt(pdNeg)} (${fmtPct(pdNeg)})`,
            "",
            "Tip: If PPV feels low, the usual cause is a low base rate (prevalence)."
          );
        }
      }

      const replies = [
        {
          test: /(bayes('|’)? theorem.*simple|explain.*bayes.*simple|explain bayes simply|what is bayes)/,
          run: () => lines(
            "Bayes’ theorem updates a belief when you see evidence:",
            "Posterior ∝ Prior × Likelihood.",
            "",
            "In symbols:",
            "P(H|E) = P(E|H)·P(H) / P(E)",
            "",
            "Where P(E) is the evidence rate (a normalizer)."
          )
        },
        {
          test: /(derive|proof|where does bayes come from)/,
          run: () => lines(
            "Bayes comes directly from the definition of conditional probability:",
            "P(H|E) = P(H∩E) / P(E) and P(E|H) = P(H∩E) / P(H).",
            "Rearrange P(H∩E) and substitute:",
            "P(H|E) = P(E|H)·P(H) / P(E)."
          )
        },
        {
          test: /(what is|define)\s+prior|explain\s+prior/,
          run: () => lines(
            "Prior P(H) is your belief before the current evidence.",
            "In real problems, the prior often represents a base rate or historical frequency.",
            "If you ignore the prior, you risk the base‑rate fallacy."
          )
        },
        {
          test: /(what is|define)\s+likelihood|explain\s+likelihood/,
          run: () => lines(
            "Likelihood P(E|H) measures how compatible the evidence is with a hypothesis.",
            "It is not the probability the hypothesis is true.",
            "A common mistake is swapping P(E|H) with P(H|E)."
          )
        },
        {
          test: /(what is|define)\s+evidence|explain\s+p\(e\)|what is p\(e\)/,
          run: () => lines(
            "Evidence P(E) is the overall probability of seeing the evidence under all possibilities.",
            "Binary case: P(E) = P(E|H)P(H) + P(E|¬H)P(¬H).",
            "Multi‑hypothesis: P(E) = Σ_i P(E|H_i)P(H_i)."
          )
        },
        {
          test: /(what is|define)\s+posterior|explain\s+posterior/,
          run: () => lines(
            "Posterior P(H|E) is the updated belief after seeing evidence.",
            "It is proportional to prior×likelihood and then normalized by P(E)."
          )
        },
        {
          test: /odds|bayes factor|likelihood ratio/,
          run: () => lines(
            "Odds form is often the cleanest way to update:",
            "Posterior odds = Prior odds × Bayes factor.",
            "",
            "Bayes factor (likelihood ratio): BF = P(E|H) / P(E|¬H).",
            "If BF > 1, evidence supports H; if BF < 1, it supports ¬H."
          )
        },
        {
          test: /base\s*rate|base\s*rate\s*fallacy/,
          run: () => lines(
            "Base‑rate fallacy is ignoring the prior prevalence.",
            "Even a 'good' test can have many false positives when the condition is rare.",
            "Use the Medical panel and watch PPV change as prevalence changes."
          )
        },
        {
          test: /(ppv|positive predictive|p\(d\|\+\))/,
          run: () => lines(
            "PPV is P(D|+): probability of disease given a positive test.",
            "It is not the same as sensitivity.",
            "",
            "PPV = (sensitivity × prevalence) / (sensitivity × prevalence + falsePositiveRate × (1 - prevalence))."
          )
        },
        {
          test: /(npv|negative predictive|p\(d\|-\)|p\(not.*d\|-\))/,
          run: () => lines(
            "NPV is P(¬D|−): probability of no disease given a negative test.",
            "The Medical panel also shows P(D|−), which is 1 - NPV."
          )
        },
        {
          test: /sensitivity|true positive rate|p\(\+\|d\)/,
          run: () => lines(
            "Sensitivity is P(+|D): among truly positive cases, how often the test is positive.",
            "Higher sensitivity reduces false negatives."
          )
        },
        {
          test: /specificity|true negative rate|p\(-\|/,
          run: () => lines(
            "Specificity is P(-|¬D): among truly negative cases, how often the test is negative.",
            "Higher specificity reduces false positives."
          )
        },
        {
          test: /(false positive|why.*false positive)/,
          run: () => lines(
            "False positives happen because no test is perfect:",
            "False positive rate = 1 - specificity = P(+|¬D).",
            "",
            "If ¬D is common (low prevalence), even a small false positive rate can create many positives overall."
          )
        },
        {
          test: /(confusion matrix|frequency table|10,000)/,
          run: () => lines(
            "A confusion matrix translates probabilities into expected counts in a population.",
            "It makes base‑rate effects intuitive (how many true vs false positives).",
            "Use the Medical panel: it computes expected counts for N=10,000."
          )
        },
        {
          test: /(sequential|update over time|multiple pieces of evidence)/,
          run: () => lines(
            "With independent evidence pieces E1, E2, ... you can update sequentially:",
            "Start with a prior, update with E1 to get a posterior, then treat that posterior as the new prior for E2, and so on.",
            "In odds form: multiply Bayes factors."
          )
        },
        {
          test: /explain\s+the\s+medical|medical\s+calculator|explain\s+medical\s+now/,
          run: () => lines(
            "Here is the Medical panel using the current inputs:",
            currentMedicalSummary(),
            "",
            "Interpretation:",
            "1) Prevalence sets the base rate.",
            "2) Sensitivity controls false negatives.",
            "3) Specificity controls false positives.",
            "4) PPV can be much lower than sensitivity when prevalence is low."
          )
        },
        {
          test: /explain\s+multi|multi\s+hypothesis|normalize|normalization/,
          run: () => lines(
            "Multi‑hypothesis Bayes uses the same idea but normalizes across many hypotheses:",
            "Posterior(H_i) = prior(H_i)×likelihood(E|H_i) / Σ_j prior(H_j)×likelihood(E|H_j).",
            "",
            "Current Multi panel summary:",
            currentMultiSummary()
          )
        },
        {
          test: /(give|generate).*(practice|problem).*(medical)/,
          run: () => { quiz.start("medical"); switchPanel("quiz"); return "Opened a medical-test practice problem in the Quiz tab."; }
        },
        {
          test: /(give|generate).*(practice|problem).*(base rate|trap)/,
          run: () => { quiz.start("medical"); switchPanel("quiz"); return "Opened a base-rate practice problem in the Quiz tab."; }
        },
        {
          test: /(give|generate).*(practice|problem).*(multi)/,
          run: () => { quiz.start("multi"); switchPanel("quiz"); return "Opened a multi-hypothesis practice problem in the Quiz tab."; }
        },
        {
          test: /(give|generate).*(practice|problem)/,
          run: () => { quiz.start("mix"); switchPanel("quiz"); return "Opened a mixed Bayes practice problem in the Quiz tab."; }
        },
        {
          test: /help|how\s+to\s+use|workflow/,
          run: () => lines(
            "Recommended workflow:",
            "1) Learn: understand prior/likelihood/posterior.",
            "2) Medical: see PPV/NPV and the confusion matrix.",
            "3) Multi‑hypothesis: see normalization and evidence P(E).",
            "4) Quiz: practice until you can do it from memory.",
            "",
            "Commands: /medical /multi /quiz /calc /clear"
          )
        }
      ];

      for (const r of replies) {
        if (r.test.test(s)) return r.run();
      }

      if (s.includes("bayes")) {
        return lines(
          "Tell me what you want to compute or understand.",
          "Examples:",
          "• \"Explain prior\"",
          "• \"Explain medical now\"",
          "• \"prev=1% sens=95% spec=98% compute PPV\"",
          "• \"Give me a practice problem\""
        );
      }

      return lines(
        "I can help with priors, likelihoods, posteriors, base rates, medical tests (PPV/NPV), and multi‑hypothesis normalization.",
        "Try: \"Explain medical now\" or \"Give me a practice problem\".",
        "Commands: /medical /multi /quiz /calc /clear"
      );
    };

    const send = () => {
      const text = sanitizeText(inputEl.value);
      if (!text) return;
      inputEl.value = "";
      push("user", text);
      const reply = respond(text);
      push("bot", reply);
      renderTutorContext();
    };

    const wire = () => {
      sendBtn.addEventListener("click", send);
      inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") send();
      });
      $$(".chip").forEach((c) => {
        c.addEventListener("click", () => {
          inputEl.value = c.dataset.chip;
          inputEl.focus();
          send();
        });
      });
      push("bot", "Hi. I’m your offline Bayes tutor. Ask about priors, likelihoods, posteriors, or request a practice problem.");
    };

    return { wire };
  })();

  const tools = (() => {
    const priorEl = $("#oddsPrior");
    const bfEl = $("#oddsBF");
    const postEl = $("#oddsPosterior");
    const explainEl = $("#oddsExplain");

    const calcExpr = $("#calcExpr");
    const calcOut = $("#calcOut");
    const calcHelp = $("#calcHelp");

    const convP = $("#convP");
    const convOdds = $("#convOdds");
    const convLog = $("#convLogOdds");
    const convOddsIn = $("#convOddsIn");
    const convPOut = $("#convPOut");

    const updateOdds = () => {
      const p = clamp(parseP(priorEl.value), 0, 1);
      const bf = parseP(bfEl.value);
      if (!isNum(bf) || bf <= 0) {
        postEl.textContent = "—";
        explainEl.textContent = "Bayes factor must be positive.";
        return;
      }
      const post = pFromOdds(oddsFromP(p) * bf);
      postEl.textContent = `${fmt(post)} (${fmtPct(post)})`;
      explainEl.textContent = `Prior odds=${fmt(oddsFromP(p),6)}. Posterior odds=prior odds×BF=${fmt(oddsFromP(p)*bf,6)}. Convert back to probability.`;
    };

    const tokenize = (src) => {
      const s = src.replace(/\s+/g, "");
      const tokens = [];
      let i = 0;
      const isDigit = (c) => /[0-9]/.test(c);
      const isAlpha = (c) => /[a-zA-Z_]/.test(c);

      while (i < s.length) {
        const c = s[i];
        if ("+-*/()^,".includes(c)) {
          tokens.push({ t: "op", v: c });
          i++;
          continue;
        }
        if (c === "*") {
          tokens.push({ t: "op", v: "*" });
          i++;
          continue;
        }
        if (c === "."
          || isDigit(c)
          || (c === "-" && (i === 0 || (tokens[tokens.length - 1]?.t === "op" && tokens[tokens.length - 1]?.v !== ")")) && (isDigit(s[i + 1]) || s[i + 1] === "."))) {
          let j = i + 1;
          while (j < s.length && (isDigit(s[j]) || s[j] === ".")) j++;
          const num = Number(s.slice(i, j));
          tokens.push({ t: "num", v: num });
          i = j;
          continue;
        }
        if (isAlpha(c)) {
          let j = i + 1;
          while (j < s.length && /[a-zA-Z0-9_]/.test(s[j])) j++;
          tokens.push({ t: "id", v: s.slice(i, j) });
          i = j;
          continue;
        }
        return null;
      }
      return tokens;
    };

    const fn = {
      sqrt: (x) => Math.sqrt(x),
      ln: (x) => Math.log(x),
      log: (x) => Math.log10(x),
      exp: (x) => Math.exp(x),
      abs: (x) => Math.abs(x),
      min: (a, b) => Math.min(a, b),
      max: (a, b) => Math.max(a, b)
    };

    const consts = { pi: Math.PI, e: Math.E };

    const precedence = (op) => {
      if (op === "^") return 4;
      if (op === "*" || op === "/") return 3;
      if (op === "+" || op === "-") return 2;
      return 0;
    };

    const rightAssoc = (op) => op === "^";

    const toRPN = (tokens) => {
      const out = [];
      const stack = [];
      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        if (tok.t === "num") out.push(tok);
        else if (tok.t === "id") {
          const next = tokens[i + 1];
          if (next && next.t === "op" && next.v === "(") stack.push(tok);
          else {
            const key = tok.v.toLowerCase();
            if (!(key in consts)) return null;
            out.push({ t: "num", v: consts[key] });
          }
        } else if (tok.t === "op" && tok.v === ",") {
          while (stack.length && !(stack[stack.length - 1].t === "op" && stack[stack.length - 1].v === "(")) out.push(stack.pop());
          if (!stack.length) return null;
        } else if (tok.t === "op" && tok.v === "(") {
          stack.push(tok);
        } else if (tok.t === "op" && tok.v === ")") {
          while (stack.length && !(stack[stack.length - 1].t === "op" && stack[stack.length - 1].v === "(")) out.push(stack.pop());
          if (!stack.length) return null;
          stack.pop();
          const top = stack[stack.length - 1];
          if (top && top.t === "id") out.push(stack.pop());
        } else if (tok.t === "op") {
          const op1 = tok.v;
          while (stack.length) {
            const top = stack[stack.length - 1];
            if (top.t === "op" && "+-*/^".includes(top.v)) {
              const op2 = top.v;
              if ((rightAssoc(op1) && precedence(op1) < precedence(op2)) || (!rightAssoc(op1) && precedence(op1) <= precedence(op2))) out.push(stack.pop());
              else break;
            } else break;
          }
          stack.push(tok);
        } else return null;
      }
      while (stack.length) {
        const t = stack.pop();
        if (t.t === "op" && (t.v === "(" || t.v === ")")) return null;
        out.push(t);
      }
      return out;
    };

    const evalRPN = (rpn) => {
      const st = [];
      for (const tok of rpn) {
        if (tok.t === "num") st.push(tok.v);
        else if (tok.t === "op") {
          const b = st.pop();
          const a = st.pop();
          if (!isNum(a) || !isNum(b)) return NaN;
          if (tok.v === "+") st.push(a + b);
          else if (tok.v === "-") st.push(a - b);
          else if (tok.v === "*") st.push(a * b);
          else if (tok.v === "/") st.push(a / b);
          else if (tok.v === "^") st.push(Math.pow(a, b));
          else return NaN;
        } else if (tok.t === "id") {
          const key = tok.v.toLowerCase();
          const f = fn[key];
          if (!f) return NaN;
          const arity = f.length;
          if (arity === 1) {
            const a = st.pop();
            if (!isNum(a)) return NaN;
            st.push(f(a));
          } else if (arity === 2) {
            const b = st.pop();
            const a = st.pop();
            if (!isNum(a) || !isNum(b)) return NaN;
            st.push(f(a, b));
          } else return NaN;
        } else return NaN;
      }
      return st.length === 1 ? st[0] : NaN;
    };

    const safeCalc = (expr) => {
      const tokens = tokenize(expr);
      if (!tokens) return { ok: false, err: "Parse error" };
      const rpn = toRPN(tokens);
      if (!rpn) return { ok: false, err: "Invalid expression" };
      const val = evalRPN(rpn);
      if (!Number.isFinite(val)) return { ok: false, err: "Result is not finite" };
      return { ok: true, val };
    };

    const updateConverters = () => {
      const p = clamp(parseP(convP.value), 0, 1);
      const odds = oddsFromP(p);
      const logOdds = odds === 0 ? -Infinity : odds === Infinity ? Infinity : Math.log(odds);
      convOdds.textContent = isNum(odds) ? fmt(odds, 6) : "—";
      convLog.textContent = (logOdds === Infinity || logOdds === -Infinity) ? String(logOdds) : fmt(logOdds, 6);

      const oIn = parseP(convOddsIn.value);
      const pOut = pFromOdds(oIn);
      convPOut.textContent = `${fmt(pOut)} (${fmtPct(pOut)})`;
    };

    const wire = () => {
      [priorEl, bfEl].forEach((el) => el.addEventListener("input", updateOdds));
      updateOdds();

      $("#calcEval").addEventListener("click", () => {
        const expr = sanitizeText(calcExpr.value);
        if (!expr) return;
        const r = safeCalc(expr);
        if (!r.ok) {
          calcOut.textContent = "—";
          calcHelp.textContent = r.err;
          return;
        }
        calcOut.textContent = fmt(r.val, 10);
        calcHelp.textContent = "Functions: sqrt(x), ln(x), log(x), exp(x), abs(x), min(a,b), max(a,b). Constants: pi, e. Use ^ for exponent.";
      });

      $("#calcClear").addEventListener("click", () => {
        calcExpr.value = "";
        calcOut.textContent = "";
        calcHelp.textContent = "";
      });

      [convP, convOddsIn].forEach((el) => el.addEventListener("input", updateConverters));
      updateConverters();
    };

    return { wire, safeCalc };
  })();

  const scenarios = () => {
    $$("button[data-scenario]").forEach((b) => {
      b.addEventListener("click", () => {
        const s = b.dataset.scenario;
        if (s === "medical-rare") {
          medical.set(0.01, 0.95, 0.98);
          switchPanel("medical");
        } else if (s === "medical-sensor") {
          medical.set(0.002, 0.99, 0.97);
          switchPanel("medical");
        } else if (s === "multi-spam") {
          multi.setRows([
            { name: "Spam", prior: 0.20, like: 0.60 },
            { name: "Ham", prior: 0.80, like: 0.05 }
          ]);
          switchPanel("multi");
        } else if (s === "multi-coin") {
          const fair = Math.pow(0.5, 10);
          const biased = Math.pow(0.8, 10);
          multi.setRows([
            { name: "Fair", prior: 0.80, like: fair },
            { name: "Biased (p=0.8)", prior: 0.20, like: biased }
          ]);
          switchPanel("multi");
        }
        toast.show("Scenario loaded");
      });
    });

    $$("button[data-tab-jump]").forEach((b) => {
      b.addEventListener("click", () => switchPanel(b.dataset.tabJump));
    });
  };

  const settings = () => {
    const dlg = $("#settingsDialog");
    $("#settingsBtn").addEventListener("click", () => dlg.showModal());

    $("#themeSelect").addEventListener("change", (e) => {
      state.theme = e.target.value;
      applySettings();
      renderMedical();
      renderMulti();
      saveState();
      toast.show("Theme updated");
    });

    $("#decSelect").addEventListener("change", (e) => {
      state.decimals = clamp(Number(e.target.value), 0, 10);
      applySettings();
      renderMedical();
      renderMulti();
      mini.explain();
      saveState();
      toast.show("Formatting updated");
    });

    $("#motionSelect").addEventListener("change", (e) => {
      state.motion = e.target.value;
      applySettings();
      saveState();
      toast.show("Motion updated");
    });

    $("#resetAll").addEventListener("click", () => {
      localStorage.removeItem(STORAGE.theme);
      localStorage.removeItem(STORAGE.decimals);
      localStorage.removeItem(STORAGE.motion);
      localStorage.removeItem(STORAGE.score);
      localStorage.removeItem(STORAGE.diff);
      localStorage.removeItem(STORAGE.streak);
      localStorage.removeItem(STORAGE.hyp);
      state.theme = "midnight";
      state.decimals = 4;
      state.motion = "auto";
      state.score = 0;
      state.diff = 2;
      state.streak = 0;
      state.hypRows = [];
      applySettings();
      multi.render();
      medical.render();
      toast.show("Reset complete");
      dlg.close();
    });
  };

  const renderMedical = () => medical.render();
  const renderMulti = () => multi.render();

  const wireLearnJumps = () => {
    $("#jumpMedical").addEventListener("click", () => switchPanel("medical"));
    $("#jumpMulti").addEventListener("click", () => switchPanel("multi"));
  };

  const renderTutorContext = () => {
    const ctxMed = $("#ctxMedical");
    const ctxMul = $("#ctxMulti");
    if (ctxMed) ctxMed.textContent = medical ? (tutorMedicalLine()) : "—";
    if (ctxMul) ctxMul.textContent = tutorMultiLine();
  };

  const tutorMedicalLine = () => {
    const { prev, sens, spec } = medical.read();
    const { ppv } = medicalPosterior(prev, sens, spec);
    return `P(D)=${fmt(clamp(prev,0,1),4)} · P(+|D)=${fmt(clamp(sens,0,1),4)} · P(-|¬D)=${fmt(clamp(spec,0,1),4)} ⇒ P(D|+)=${fmt(ppv)} (${fmtPct(ppv)})`;
  };

  const tutorMultiLine = () => {
    const rows = state.hypRows.length ? state.hypRows : [{ name: "H1", prior: 0.5, like: 0.6 }, { name: "H2", prior: 0.5, like: 0.4 }];
    const { cleaned, post } = multi.compute(rows);
    const top = post.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v)[0];
    const best = cleaned[top.i];
    return `${cleaned.length} hypotheses → top: ${best.name} ${fmt(post[top.i])} (${fmtPct(post[top.i])})`;
  };

  const selfTests = () => {
    const out = $("#selfTestOut");
    const checks = [];

    const closeEnough = (a, b, eps = 1e-10) => Math.abs(a - b) <= eps;

    const t1 = bayesBinaryPosterior(0.1, 0.8, 0.2);
    checks.push(closeEnough(t1, (0.8*0.1)/((0.8*0.1)+(0.2*0.9))));

    const m1 = medicalPosterior(0.01, 0.95, 0.98).ppv;
    checks.push(closeEnough(m1, (0.95*0.01)/((0.95*0.01)+(0.02*0.99)), 1e-12));

    const rows = [{ name:"A", prior:0.2, like:0.6 }, { name:"B", prior:0.8, like:0.05 }];
    const { post } = multi.compute(rows);
    checks.push(closeEnough(post[0] + post[1], 1, 1e-12));
    checks.push(post[0] > post[1]);

    const p = 0.2;
    const bf = 5;
    const postOdds = pFromOdds(oddsFromP(p) * bf);
    checks.push(closeEnough(postOdds, pFromOdds((p/(1-p))*bf)));

    const expr = "(0.95*0.01)/((0.95*0.01)+(0.02*0.99))";
    const r = tools.safeCalc(expr);
    checks.push(r.ok && closeEnough(r.val, m1, 1e-12));

    const ok = checks.every(Boolean);
    if (out) out.textContent = ok ? "Self‑tests passed (numeric checks OK)." : "Self‑tests failed (check calculations).";
    return ok;
  };

  const init = () => {
    loadState();
    applySettings();
    attachTabs();
    attachStepper();
    wireLearnJumps();

    mini.wire();
    medical.wire();
    multi.wire();
    quiz.wire();
    tutor.wire();
    tools.wire();
    scenarios();
    settings();
    privacy.wire();

    selfTests();
    switchPanel("learn");
  };


  const privacy = (() => {
    const banner = $("#privacyBanner");
    const okBtn = $("#privacyOk");
    const moreBtn = $("#privacyMore");
    const clearBtn = $("#privacyClear");
    const clearBtn2 = $("#privacyClear2");
    const dlg = $("#privacyDialog");
    const openBtn = $("#openPrivacy");
    const termsBtn = $("#openTerms");
    const termsDlg = $("#termsDialog");
    const yearEl = $("#copyYear");

    const readSeen = () => {
      try { return localStorage.getItem(STORAGE.privacy) === "1"; } catch { return true; }
    };

    const writeSeen = () => {
      try { localStorage.setItem(STORAGE.privacy, "1"); } catch {}
    };

    const showBanner = () => {
      if (!banner) return;
      banner.hidden = false;
    };

    const hideBanner = () => {
      if (!banner) return;
      banner.hidden = true;
    };

    const clearSaved = () => {
      try {
        Object.values(STORAGE).forEach((k) => localStorage.removeItem(k));
      } catch {}
      state.theme = "midnight";
      state.decimals = 4;
      state.motion = "auto";
      state.score = 0;
      state.diff = "normal";
      state.streak = 0;
      state.hypRows = [];
      applySettings();
      if ($("#decSelect")) $("#decSelect").value = String(state.decimals);
      if ($("#motionSelect")) $("#motionSelect").value = String(state.motion);
      if ($("#themeSelect")) $("#themeSelect").value = String(state.theme);
      if ($("#diffSelect")) $("#diffSelect").value = String(state.diff);
      renderMedical();
      renderMulti();
      renderTutorContext();
      toast.show("Saved data cleared.");
    };

    const openPrivacy = () => {
      if (!dlg) return;
      try { dlg.showModal(); } catch { dlg.setAttribute("open",""); }
    };

    const openCopyright = () => {
      if (!termsDlg) return;
      try { termsDlg.showModal(); } catch { termsDlg.setAttribute("open",""); }
    };

    const wire = () => {
      if (yearEl) yearEl.textContent = String(new Date().getFullYear());
      if (!readSeen()) showBanner();
      okBtn && okBtn.addEventListener("click", () => { writeSeen(); hideBanner(); });
      moreBtn && moreBtn.addEventListener("click", () => openPrivacy());
      clearBtn && clearBtn.addEventListener("click", () => clearSaved());
      clearBtn2 && clearBtn2.addEventListener("click", () => clearSaved());
      openBtn && openBtn.addEventListener("click", () => openPrivacy());
      termsBtn && termsBtn.addEventListener("click", () => openCopyright());
    };

    return { wire, clearSaved };
  })();

  document.addEventListener("DOMContentLoaded", init);
})();