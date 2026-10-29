(() => {
  "use strict";

  const OFFICIAL_GROUPS = [
    {
      name: "法律・政治",
      items: [
        ["101", "法律一般・法学・事典"],
        ["102", "憲法"],
        ["115", "行政法"],
        ["116", "環境法"],
        ["117", "租税法"],
        ["118", "情報・メディア法"],
        ["104", "民法"],
        ["119", "民法-民法総則"],
        ["120", "民法-物権法"],
        ["121", "民法-債権総論・債権各論"],
        ["122", "民法-親族・相続"],
        ["123", "土地法・不動産法"],
        ["105", "商法・会社法"],
        ["124", "消費者法"],
        ["106", "刑法"],
        ["125", "刑事政策・少年法"],
        ["126", "医事法"],
        ["107", "司法"],
        ["108", "民事訴訟法"],
        ["109", "刑事訴訟法"],
        ["127", "労働法"],
        ["128", "社会保障法"],
        ["129", "知的財産法"],
        ["130", "経済法・金融法・産業法"],
        ["131", "国際法・国際政治"],
        ["132", "国際私法"],
        ["133", "法哲学・法社会学・比較法、法制史、法と心理（法と関連領域）等"],
        ["134", "外国法"],
        ["135", "政治学・行政学"],
        ["136", "コンメンタール・注釈書"],
        ["137", "資格試験"],
        ["114", "講座・全集・増刊・別冊・その他"]
      ]
    },
    {
      name: "経済",
      items: [
        ["213", "経済一般"],
        ["214", "経済学"],
        ["201", "経済理論"],
        ["215", "マクロ経済学"],
        ["216", "ミクロ経済学"],
        ["203", "経済学史・経済思想史"],
        ["204", "経済史"],
        ["217", "経済学各論（公共経済学・都市経済学・環境経済学等）"],
        ["205", "国際経済・開発経済・各国経済"],
        ["206", "日本経済"],
        ["218", "計量経済学・統計学"],
        ["219", "財政学"],
        ["207", "金融"],
        ["208", "経済政策"],
        ["209", "経営・会計"],
        ["210", "産業・労働"],
        ["220", "社会保障・社会政策"],
        ["221", "ビジネス"],
        ["212", "増刊・別冊・その他"]
      ]
    },
    {
      name: "社会・福祉・教育・文化・歴史",
      items: [
        ["308", "社会一般・ノンフィクション"],
        ["301", "社会学"],
        ["309", "メディア論"],
        ["303", "福祉・教育"],
        ["310", "環境問題"],
        ["304", "文化"],
        ["311", "哲学・宗教・民俗学・文化人類学"],
        ["306", "歴史"],
        ["307", "講座・全集・その他"]
      ]
    },
    {
      name: "心理・医学",
      items: [
        ["405", "心理学-総論　基礎心理"],
        ["408", "臨床心理"],
        ["409", "発達心理・教育心理"],
        ["410", "社会心理"],
        ["404", "精神医学"],
        ["401", "医学・看護"],
        ["402", "家庭医学"],
        ["406", "講座・増刊・別冊・その他"]
      ]
    },
    {
      name: "数学・物理学・科学",
      items: [
        ["513", "科学一般・科学への招待"],
        ["501", "数学一般・数学への招待"],
        ["515", "数理パズル・折り紙"],
        ["502", "数学史・伝記"],
        ["503", "数学教育"],
        ["504", "線形代数"],
        ["505", "微分積分・解析学・微分方程式"],
        ["506", "代数学・数論"],
        ["507", "幾何学"],
        ["508", "確率・統計"],
        ["509", "応用数学"],
        ["510", "論理・数学基礎論"],
        ["511", "情報科学・コンピュータ"],
        ["512", "物理・数理物理"],
        ["516", "天文学・宇宙科学"],
        ["517", "地球科学"],
        ["518", "化学"],
        ["519", "生物科学・バイオ科学"],
        ["520", "工学"],
        ["521", "環境科学"],
        ["514", "講座・全集・辞典・事典・増刊・別冊・その他"]
      ]
    }
  ];

  const OTHER_GROUP = "その他・未分類";
  const idToName = new Map();
  const nameToGroup = new Map();
  const groupToNames = new Map();
  const officialNames = new Set();
  const unmatchedNames = new Set();

  for (const group of OFFICIAL_GROUPS) {
    const names = [];
    for (const [id, name] of group.items) {
      idToName.set(id, name);
      nameToGroup.set(name, group.name);
      officialNames.add(name);
      names.push(name);
    }
    groupToNames.set(group.name, names);
  }

  const major = document.getElementById("genreMajor");
  const minor = document.getElementById("genreMinor");
  const compatibility = document.getElementById("genre");
  const clear = document.getElementById("clear");

  if (!major || !minor || !compatibility) return;

  function ensureCompatibilityOption(value) {
    if (!value) return;
    if ([...compatibility.options].some((option) => option.value === value)) return;
    compatibility.add(new Option(value, value));
  }

  function addMajorOptions() {
    major.replaceChildren(new Option("すべて", ""));
    for (const group of OFFICIAL_GROUPS) {
      major.add(new Option(group.name, group.name));
      ensureCompatibilityOption(group.name);
    }
    if (unmatchedNames.size) {
      major.add(new Option(OTHER_GROUP, OTHER_GROUP));
      ensureCompatibilityOption(OTHER_GROUP);
    }
  }

  function smallNames(groupName) {
    if (groupName === OTHER_GROUP) {
      return [...unmatchedNames].sort((a, b) => a.localeCompare(b, "ja"));
    }
    return groupToNames.get(groupName) || [];
  }

  function fillMinor(groupName, selected = "") {
    const names = smallNames(groupName);
    minor.replaceChildren(new Option(groupName ? "すべて" : "大分類を選択", ""));
    minor.disabled = !groupName;
    for (const name of names) minor.add(new Option(name, name));
    if (selected && names.includes(selected)) minor.value = selected;
  }

  function registerUnmatched(name) {
    if (!name || officialNames.has(name) || unmatchedNames.has(name)) return;
    unmatchedNames.add(name);
    const selectedMajor = major.value;
    const selectedMinor = minor.value;
    addMajorOptions();
    if ([...major.options].some((option) => option.value === selectedMajor)) {
      major.value = selectedMajor;
      fillMinor(selectedMajor, selectedMinor);
    }
  }

  function groupForGenre(name) {
    if (!name) return "";
    if (groupToNames.has(name)) return name;
    if (nameToGroup.has(name)) return nameToGroup.get(name);
    if (unmatchedNames.has(name)) return OTHER_GROUP;
    return "";
  }

  function isGroupMatch(genres, value) {
    if (!Array.isArray(genres)) return false;
    if (value === OTHER_GROUP) return genres.some((name) => !officialNames.has(name));
    const names = groupToNames.get(value);
    return Boolean(names && genres.some((name) => names.includes(name)));
  }

  function proxiedGenres(genres) {
    if (!Array.isArray(genres)) return genres;
    for (const name of genres) registerUnmatched(String(name || "").trim());
    return new Proxy(genres, {
      get(target, prop) {
        if (prop === "includes") {
          return (value, fromIndex = 0) => {
            if (groupToNames.has(value) || value === OTHER_GROUP) {
              return isGroupMatch(target, value);
            }
            return Array.prototype.includes.call(target, value, fromIndex);
          };
        }
        const result = Reflect.get(target, prop, target);
        return typeof result === "function" ? result.bind(target) : result;
      }
    });
  }

  function prepareBookPayload(payload) {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.books)) return payload;

    if (payload.books.length && Array.isArray(payload.books[0])) {
      const columns = Array.isArray(payload.columns) ? payload.columns : [];
      const genreIndex = columns.indexOf("genres");
      if (genreIndex >= 0) {
        for (const row of payload.books) {
          if (Array.isArray(row) && Array.isArray(row[genreIndex])) {
            row[genreIndex] = proxiedGenres(row[genreIndex]);
          }
        }
      }
    } else {
      for (const book of payload.books) {
        if (book && Array.isArray(book.genres)) book.genres = proxiedGenres(book.genres);
      }
    }
    return payload;
  }

  function isBookSearchRequest(input) {
    const raw = typeof input === "string" ? input : input?.url;
    if (!raw) return false;
    try {
      const url = new URL(raw, location.href);
      return /\/data\/books-search\.json$/.test(url.pathname);
    } catch (_) {
      return false;
    }
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    if (!isBookSearchRequest(args[0]) || !response.ok) return response;

    return new Proxy(response, {
      get(target, prop) {
        if (prop === "json") {
          return async () => prepareBookPayload(await target.json());
        }
        const result = Reflect.get(target, prop, target);
        return typeof result === "function" ? result.bind(target) : result;
      }
    });
  };

  const nativeReplaceState = history.replaceState.bind(history);
  history.replaceState = (state, title, url) => {
    if (typeof url !== "string" && !(url instanceof URL)) {
      return nativeReplaceState(state, title, url);
    }
    try {
      const parsed = new URL(String(url), location.href);
      const params = parsed.searchParams;
      const rawGenre = String(params.get("genre") || "").trim();
      const genre = idToName.get(rawGenre) || rawGenre;

      if (genre && groupToNames.has(genre)) {
        params.set("genre_group", genre);
        params.delete("genre");
      } else if (genre) {
        params.set("genre", genre);
        const inferred = groupForGenre(genre);
        if (inferred) params.set("genre_group", inferred);
      }
      const normalized = `${parsed.pathname}${params.toString() ? `?${params}` : ""}${parsed.hash}`;
      return nativeReplaceState(state, title, normalized);
    } catch (_) {
      return nativeReplaceState(state, title, url);
    }
  };

  function canonicalizeInitialUrlForApp() {
    const parsed = new URL(location.href);
    const params = parsed.searchParams;
    const rawGenre = String(params.get("genre") || "").trim();
    const mappedGenre = idToName.get(rawGenre) || rawGenre;
    let group = String(params.get("genre_group") || "").trim();

    if (mappedGenre && groupToNames.has(mappedGenre) && !group) group = mappedGenre;
    if (mappedGenre && !group) group = groupForGenre(mappedGenre);

    if (rawGenre && mappedGenre !== rawGenre) params.set("genre", mappedGenre);
    if (group && !params.get("genre_group")) params.set("genre_group", group);

    // app.js は既存互換の genre だけを読むため、大分類のみのURLでは初期化中だけ
    // genre に大分類を補う。最初の syncUrl() で genre_group のみへ正規化される。
    if (group && !mappedGenre) params.set("genre", group);

    const normalized = `${parsed.pathname}${params.toString() ? `?${params}` : ""}${parsed.hash}`;
    if (normalized !== `${location.pathname}${location.search}${location.hash}`) {
      nativeReplaceState(history.state, "", normalized);
    }
  }

  function setCompatibility(value, notify = true) {
    ensureCompatibilityOption(value);
    compatibility.value = value;
    if (notify) compatibility.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function syncVisibleFromCompatibility() {
    const value = String(compatibility.value || "").trim();
    const group = groupForGenre(value);

    if (!value || !group) {
      major.value = "";
      fillMinor("");
      return;
    }

    if (![...major.options].some((option) => option.value === group)) addMajorOptions();
    major.value = group;
    if (group === value) {
      fillMinor(group);
    } else {
      fillMinor(group, value);
    }
  }

  major.addEventListener("change", () => {
    fillMinor(major.value);
    setCompatibility(major.value);
  });

  minor.addEventListener("change", () => {
    setCompatibility(minor.value || major.value);
  });

  clear?.addEventListener("click", () => {
    setTimeout(syncVisibleFromCompatibility, 0);
  });

  const observer = new MutationObserver(() => {
    syncVisibleFromCompatibility();
  });
  observer.observe(compatibility, { childList: true });

  addMajorOptions();
  fillMinor("");
  canonicalizeInitialUrlForApp();

  // app.js の prepareItems()/restoreUrl() 後に表示側も確実に同期する。
  setTimeout(syncVisibleFromCompatibility, 0);
  setTimeout(syncVisibleFromCompatibility, 100);
})();
