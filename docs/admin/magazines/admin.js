(() => {
  "use strict";

  const selector = document.getElementById("magazine-selector");
  const choices = [...selector.querySelectorAll("[data-magazine-id]")];
  const queryInput = document.getElementById("issue-query");
  const searchButton = document.getElementById("search-button");
  const results = document.getElementById("results");
  const count = document.getElementById("result-count");
  const detailOverlay = document.getElementById("detail-overlay");
  const detailClose = document.getElementById("detail-close");
  const detailContent = document.getElementById("detail-content");
  const newIssueAction = document.getElementById("new-issue-action");
  const newIssueSource = document.getElementById("new-issue-source");
  const newIssueButton = document.getElementById("new-issue-button");

  let issues = [];
  let selectedMagazineId = "";
  let version = Date.now().toString();
  const detailCache = new Map();
  const issueBase = "https://github.com/keisemi/nippyo/issues/new";

  function newIssueUrl() {
    const params = new URLSearchParams();
    params.set("template", "magazine_new.yml");
    return `${issueBase}?${params.toString()}`;
  }

  function publicationUrl(detail, publish) {
    const params = new URLSearchParams();
    params.set("template", publish ? "magazine_restore.yml" : "magazine_hide.yml");
    params.set("title", `${publish ? "[雑誌号再公開]" : "[雑誌号公開停止]"} ${detail.magazine_name} ${detail.issue || ""}`);
    params.set("book_id", String(detail.id || ""));
    params.set("magazine_id", String(detail.magazine_id || ""));
    params.set("magazine_name", String(detail.magazine_name || ""));
    params.set("current_issue", String(detail.issue || ""));
    return `${issueBase}?${params.toString()}`;
  }

  function openPublicationChange(detail, publish) {
    const action = publish ? "公開" : "非公開";
    const ok = window.confirm(
      `「${detail.magazine_name} ${detail.issue || ""}」を${action}にします。\n\n` +
      (publish
        ? "一般公開サイトの最新号・バックナンバー・検索に表示される状態へ戻します。"
        : "書誌データは残したまま、一般公開サイトから表示しない状態にします。") +
      "\n\nGitHubの確認フォームへ進んでよろしいですか？"
    );
    if (!ok) return;
    window.location.href = publicationUrl(detail, publish);
  }

  const ebookLabels = {
    kindle:"Amazon Kindle",
    univcoop:"大学生協",
    google_play:"Google Play",
    itunes:"Apple Books / iTunes",
    jiko_gaku:"自己学習",
    kinoppy:"Kinoppy",
    e_hon:"e-hon",
    ebookjapan:"ebookjapan",
    honto:"honto",
    rakuten_books:"楽天ブックス",
    "7net":"7net",
    fujisan:"Fujisan.co.jp",
    m2plus:"M2PLUS",
    viewn:"ビューン",
    tabho:"タブホ",
    magastore:"マガストア",
  };


  const editFields = [
    ["issue","雑誌月号","input","基本情報"],
    ["issue_number","雑誌通算番号","input","基本情報"],
    ["pub_date","発刊日","input","基本情報"],
    ["format","判型","input","基本情報"],
    ["pages","ページ数","input","基本情報"],
    ["price_body","本体価格","input","基本情報"],
    ["isbn_old","旧ISBN","input","基本情報"],
    ["isbn_new","新ISBN","input","基本情報"],
    ["magazine_code_1","雑誌コード(1)","input","基本情報"],
    ["magazine_code_2","雑誌コード(2)","input","基本情報"],

    ["subtitle_before","前副題","input","特集1"],
    ["feature","特集","input","特集1"],
    ["feature_yomi","特集よみ","input","特集1"],
    ["feature_subtitle","後副題","input","特集1"],
    ["description_heading","特集内容紹介文見出","input","特集1"],
    ["description","特集内容紹介文","textarea","特集1"],

    ["subtitle_before2","前副題2","input","特集2"],
    ["feature2","特集2","input","特集2"],
    ["feature2_yomi","特集2よみ","input","特集2"],
    ["feature2_subtitle","後副題2","input","特集2"],
    ["description_heading2","特集2 内容紹介文見出","input","特集2"],
    ["description2","特集2 内容紹介文","textarea","特集2"],

    ["toc","目次","textarea-large","目次"],

    ["external_link_title_1","外部リンク1 タイトル","input","外部リンク"],
    ["external_link_comment_1","外部リンク1 コメント","textarea","外部リンク"],
    ["external_link_url_1","外部リンク1 URL","input","外部リンク"],
    ["external_link_title_2","外部リンク2 タイトル","input","外部リンク"],
    ["external_link_comment_2","外部リンク2 コメント","textarea","外部リンク"],
    ["external_link_url_2","外部リンク2 URL","input","外部リンク"],
    ["external_link_title_3","外部リンク3 タイトル","input","外部リンク"],
    ["external_link_comment_3","外部リンク3 コメント","textarea","外部リンク"],
    ["external_link_url_3","外部リンク3 URL","input","外部リンク"],

    ["editor","本誌編者","textarea","その他"],
  ];

  const issueFieldIds = {
    issue:"mag_issue",
    issue_number:"issue_number",
    pub_date:"pub_date",
    format:"format",
    pages:"pages",
    price_body:"price_body",
    isbn_old:"isbn_old",
    isbn_new:"isbn_new",
    magazine_code_1:"magazine_code_1",
    magazine_code_2:"magazine_code_2",
    subtitle_before:"subtitle_before",
    feature:"feature",
    feature_yomi:"feature_yomi",
    feature_subtitle:"feature_subtitle",
    description_heading:"description_heading",
    description:"description",
    subtitle_before2:"subtitle_before2",
    feature2:"feature2",
    feature2_yomi:"feature2_yomi",
    feature2_subtitle:"feature2_subtitle",
    description_heading2:"description_heading2",
    description2:"description2",
    toc:"toc",
    external_link_title_1:"external_link_title_1",
    external_link_comment_1:"external_link_comment_1",
    external_link_url_1:"external_link_url_1",
    external_link_title_2:"external_link_title_2",
    external_link_comment_2:"external_link_comment_2",
    external_link_url_2:"external_link_url_2",
    external_link_title_3:"external_link_title_3",
    external_link_comment_3:"external_link_comment_3",
    external_link_url_3:"external_link_url_3",
    editor:"editor",
  };

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[c]);
  }

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[‐-‒–—―−ーｰ]/g, "-")
      .replace(/[・･,，、。\./:;；：()（）\[\]【】「」『』<>＜＞\s-]/g, "");
  }

  function decodeRows(payload) {
    if (!payload || !Array.isArray(payload.columns) || !Array.isArray(payload.issues)) {
      throw new Error("雑誌検索用データの形式が不正です。");
    }
    return payload.issues.map((row) => {
      const item = {};
      payload.columns.forEach((name,index) => { item[name] = row[index]; });
      return item;
    });
  }

  async function readVersion() {
    const stamp = Date.now().toString();
    try {
      const response = await fetch(`../../data/magazine-last-updated.txt?t=${stamp}`, {cache:"no-store"});
      if (response.ok) {
        const value = (await response.text()).trim();
        if (value) return value;
      }
    } catch (_) {}
    return stamp;
  }

  async function loadData() {
    version = await readVersion();
    const [dataResponse,indexResponse] = await Promise.all([
      fetch(`../../data/magazine-admin-search.json?v=${encodeURIComponent(version)}`),
      fetch(`../../data/magazine-admin-search-index.json?v=${encodeURIComponent(version)}`)
    ]);
    if (!dataResponse.ok) throw new Error(`雑誌データを取得できませんでした（HTTP ${dataResponse.status}）`);
    if (!indexResponse.ok) throw new Error(`雑誌検索索引を取得できませんでした（HTTP ${indexResponse.status}）`);

    const payload = await dataResponse.json();
    const indexPayload = await indexResponse.json();
    const rows = decodeRows(payload);

    if (!Array.isArray(indexPayload.search) || indexPayload.search.length !== rows.length) {
      throw new Error("雑誌検索索引と表示データの件数が一致しません。");
    }

    rows.forEach((issue,index) => {
      issue.__search = normalize([
        indexPayload.search[index],
        issue.id,
        issue.magazine_name,
        issue.issue,
        issue.issue_number,
        issue.pub_date,
        issue.feature,
        issue.feature_subtitle,
        issue.feature2,
        issue.feature2_subtitle,
        issue.isbn,
        issue.identifiers,
        Array.isArray(issue.contributors) ? issue.contributors.join(" ") : issue.contributors,
      ].filter(Boolean).join(" "));
    });

    return rows;
  }

  function issueDetailUrl(issue) {
    return `../../books/?${new URLSearchParams({mag:String(issue.id || "")}).toString()}`;
  }

  function backnumberUrl(issue) {
    return `../../magazines/backnumbers/?${new URLSearchParams({magazine:String(issue.magazine_id || "")}).toString()}`;
  }

  function coverUrl(issue) {
    if (!issue.cover) return "";
    return `../../${String(issue.cover).replace(/^\/+/,"")}`;
  }

  function featureText(issue) {
    return [issue.feature, issue.feature_subtitle].filter(Boolean).join("　");
  }

  function yen(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? `${number.toLocaleString("ja-JP")}円` : "";
  }

  function closeDetail() {
    detailOverlay.hidden = true;
    document.body.classList.remove("detail-open");
  }

  async function loadDetail(issue) {
    const key = issue.pub_year ? String(issue.pub_year) : "undated";
    if (!detailCache.has(key)) {
      detailCache.set(key,
        fetch(`../../data/magazine-admin-details/magazine-admin-details-${encodeURIComponent(key)}.json?v=${encodeURIComponent(version)}`)
          .then((response) => {
            if (!response.ok) throw new Error(`詳細データを取得できませんでした（HTTP ${response.status}）`);
            return response.json();
          })
      );
    }
    const payload = await detailCache.get(key);
    const detail = payload ? payload[String(issue.id || "")] : null;
    if (!detail) throw new Error("この号の登録内容が詳細データにありません。");
    return detail;
  }

  function row(label,value) {
    if (value === null || value === undefined || value === "") return "";
    return `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`;
  }

  function renderLinks(title, links, formatter) {
    if (!Array.isArray(links) || !links.length) return "";
    const items = links.map((link) => formatter(link)).join("");
    return `
      <section class="detail-section">
        <h3>${esc(title)}</h3>
        <ul class="detail-link-list">${items}</ul>
      </section>
    `;
  }


  function editSource(detail) {
    const links = Array.isArray(detail.external_links) ? detail.external_links : [];
    const link = (index) => links[index] || {};
    const text = (value) => value === null || value === undefined ? "" : String(value);
    return {
      issue: text(detail.issue),
      issue_number: text(detail.issue_number),
      pub_date: text(detail.pub_date),
      format: text(detail.format),
      pages: text(detail.pages),
      price_body: text(detail.price_body),
      isbn_old: text(detail.isbn_old),
      isbn_new: text(detail.isbn_new),
      magazine_code_1: text(detail.magazine_code_1),
      magazine_code_2: text(detail.magazine_code_2),

      subtitle_before: text(detail.subtitle_before),
      feature: text(detail.feature),
      feature_yomi: text(detail.feature_yomi),
      feature_subtitle: text(detail.feature_subtitle),
      description_heading: text(detail.description_heading),
      description: text(detail.description),

      subtitle_before2: text(detail.subtitle_before2),
      feature2: text(detail.feature2),
      feature2_yomi: text(detail.feature2_yomi),
      feature2_subtitle: text(detail.feature2_subtitle),
      description_heading2: text(detail.description_heading2),
      description2: text(detail.description2),

      toc: text(detail.toc),

      external_link_title_1: text(link(0).title),
      external_link_comment_1: text(link(0).comment),
      external_link_url_1: text(link(0).url),
      external_link_title_2: text(link(1).title),
      external_link_comment_2: text(link(1).comment),
      external_link_url_2: text(link(1).url),
      external_link_title_3: text(link(2).title),
      external_link_comment_3: text(link(2).comment),
      external_link_url_3: text(link(2).url),

      editor: text(detail.editor),
    };
  }

  function editFieldHtml(id,label,kind,value) {
    const wide = kind !== "input" ? " wide" : "";
    if (kind === "textarea" || kind === "textarea-large") {
      const large = kind === "textarea-large" ? " large" : "";
      return `<label class="edit-field${wide}"><span>${esc(label)}</span><textarea id="edit-${esc(id)}" class="${large.trim()}">${esc(value)}</textarea></label>`;
    }
    return `<label class="edit-field"><span>${esc(label)}</span><input id="edit-${esc(id)}" type="text" value="${esc(value)}"></label>`;
  }

  function openEditForm(detail) {
    const source = editSource(detail);
    const groups = [];
    for (const [, , , group] of editFields) {
      if (!groups.includes(group)) groups.push(group);
    }
    const fieldsHtml = groups.map((group) => {
      const fields = editFields
        .filter(([, , , fieldGroup]) => fieldGroup === group)
        .map(([id,label,kind]) => editFieldHtml(id,label,kind,source[id] || ""))
        .join("");
      return `<section class="edit-section"><h3>${esc(group)}</h3><div class="edit-grid">${fields}</div></section>`;
    }).join("");

    detailContent.innerHTML = `
      <p class="detail-kicker">雑誌号編集</p>
      <h2 id="detail-title" class="detail-title">${esc(detail.magazine_name)}　${esc(detail.issue || "")}</h2>
      <p class="edit-intro">現在登録されている値を入力済みにしています。必要な箇所だけ変更してください。変更していない項目はCSVを書き換えません。</p>
      <form id="magazine-edit-form">
        <div class="edit-fixed">
          <div><strong>書籍ID</strong><br><code>${esc(detail.id)}</code></div>
          <div><strong>雑誌</strong><br>${esc(detail.magazine_name)}</div>
          <div><strong>現在の月号</strong><br>${esc(detail.issue || "")}</div>
        </div>
        ${fieldsHtml}
        <div class="edit-submit-box">
          「変更内容を確認する」を押すと、変更した項目だけをGitHubの確認フォームへ渡します。
          <div class="edit-submit-actions">
            <button class="admin-btn" type="submit">変更内容を確認する</button>
            <button class="admin-btn secondary" id="back-to-magazine-detail" type="button">登録内容へ戻る</button>
          </div>
        </div>
      </form>
    `;

    document.getElementById("back-to-magazine-detail").addEventListener("click", () => renderDetail(detail));
    document.getElementById("magazine-edit-form").addEventListener("submit", (event) => {
      event.preventDefault();

      const params = new URLSearchParams();
      params.set("template","magazine_edit.yml");
      params.set("book_id",String(detail.id || ""));
      params.set("magazine_id",String(detail.magazine_id || ""));
      params.set("magazine_name",String(detail.magazine_name || ""));
      params.set("current_issue",String(detail.issue || ""));

      let changes = 0;
      for (const [id] of editFields) {
        const before = String(source[id] || "");
        const after = String(document.getElementById(`edit-${id}`).value || "").trim();
        if (after !== before) {
          params.set(issueFieldIds[id], after === "" && before !== "" ? "__CLEAR__" : after);
          changes += 1;
        }
      }

      if (!changes) {
        window.alert("変更された項目がありません。");
        return;
      }

      const nextIssue = String(document.getElementById("edit-issue").value || "").trim() || String(detail.issue || "");
      params.set("title",`[雑誌号修正] ${detail.magazine_name} ${nextIssue}`);

      const targetUrl = `${issueBase}?${params.toString()}`;
      if (targetUrl.length > 7000) {
        window.alert("変更内容が長いため、一度に確認フォームへ送れません。目次・内容紹介などの長文は、ほかの変更と分けて1項目ずつ更新してください。");
        return;
      }
      window.location.href = targetUrl;
    });
  }


  function nextIssueSource(detail) {
    const text = (value) => value === null || value === undefined ? "" : String(value);
    return {
      book_id: "",
      issue: "",
      issue_number: "",
      pub_date: "",
      format: text(detail.format),
      pages: "",
      price_body: "",
      isbn_old: "",
      isbn_new: "",
      magazine_code_1: "",
      magazine_code_2: "",

      subtitle_before: "",
      feature: "",
      feature_yomi: "",
      feature_subtitle: "",
      description_heading: "",
      description: "",

      subtitle_before2: "",
      feature2: "",
      feature2_yomi: "",
      feature2_subtitle: "",
      description_heading2: "",
      description2: "",

      toc: "",

      external_link_title_1: "",
      external_link_comment_1: "",
      external_link_url_1: "",
      external_link_title_2: "",
      external_link_comment_2: "",
      external_link_url_2: "",
      external_link_title_3: "",
      external_link_comment_3: "",
      external_link_url_3: "",

      editor: text(detail.editor),
    };
  }

  function nextIssueFieldHtml(id,label,kind,value,help="") {
    const wide = kind !== "input" ? " wide" : "";
    const note = help ? `<small style="display:block;margin-top:4px;color:#667164">${esc(help)}</small>` : "";
    if (kind === "textarea" || kind === "textarea-large") {
      const large = kind === "textarea-large" ? " large" : "";
      return `<label class="edit-field${wide}"><span>${esc(label)}</span><textarea id="next-${esc(id)}" class="${large.trim()}">${esc(value)}</textarea>${note}</label>`;
    }
    return `<label class="edit-field"><span>${esc(label)}</span><input id="next-${esc(id)}" type="text" value="${esc(value)}">${note}</label>`;
  }


  function encodeRegistrationPayload(data) {
    return "json1:" + JSON.stringify(data);
  }

  function copyRegistrationPayload(payload) {
    const textarea = document.createElement("textarea");
    textarea.value = payload;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-10000px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } finally {
      textarea.remove();
    }
    if (!copied) {
      throw new Error("登録データをクリップボードへコピーできませんでした。ブラウザのクリップボード利用を許可して、もう一度お試しください。");
    }
  }

  function openNextIssueForm(detail) {
    const source = nextIssueSource(detail);

    const basics = [
      nextIssueFieldHtml("book_id","書籍ID","input",source.book_id,"新しい号の書籍ID。前号のIDは引き継ぎません。"),
      nextIssueFieldHtml("issue","雑誌月号","input",source.issue,"例：2026年12・2027年1月号"),
      nextIssueFieldHtml("issue_number","雑誌通算番号","input",source.issue_number),
      nextIssueFieldHtml("pub_date","発刊日","input",source.pub_date,"例：2026-11-27"),
      nextIssueFieldHtml("format","判型","input",source.format,"前号から自動継承"),
      nextIssueFieldHtml("pages","ページ数","input",source.pages),
      nextIssueFieldHtml("price_body","本体価格","input",source.price_body),
      nextIssueFieldHtml("isbn_old","旧ISBN","input",source.isbn_old),
      nextIssueFieldHtml("isbn_new","新ISBN","input",source.isbn_new),
      nextIssueFieldHtml("magazine_code_1","雑誌コード(1)","input",source.magazine_code_1),
      nextIssueFieldHtml("magazine_code_2","雑誌コード(2)","input",source.magazine_code_2),
    ].join("");

    const feature1 = [
      nextIssueFieldHtml("subtitle_before","前副題","input",""),
      nextIssueFieldHtml("feature","特集","input",""),
      nextIssueFieldHtml("feature_yomi","特集よみ","input",""),
      nextIssueFieldHtml("feature_subtitle","後副題","input",""),
      nextIssueFieldHtml("description_heading","特集内容紹介文見出","input",""),
      nextIssueFieldHtml("description","特集内容紹介文","textarea",""),
    ].join("");

    const feature2 = [
      nextIssueFieldHtml("subtitle_before2","前副題2","input",""),
      nextIssueFieldHtml("feature2","特集2","input",""),
      nextIssueFieldHtml("feature2_yomi","特集2よみ","input",""),
      nextIssueFieldHtml("feature2_subtitle","後副題2","input",""),
      nextIssueFieldHtml("description_heading2","特集2 内容紹介文見出","input",""),
      nextIssueFieldHtml("description2","特集2 内容紹介文","textarea",""),
    ].join("");

    const links = [
      nextIssueFieldHtml("external_link_title_1","外部リンク1 タイトル","input",""),
      nextIssueFieldHtml("external_link_comment_1","外部リンク1 コメント","textarea",""),
      nextIssueFieldHtml("external_link_url_1","外部リンク1 URL","input",""),
      nextIssueFieldHtml("external_link_title_2","外部リンク2 タイトル","input",""),
      nextIssueFieldHtml("external_link_comment_2","外部リンク2 コメント","textarea",""),
      nextIssueFieldHtml("external_link_url_2","外部リンク2 URL","input",""),
      nextIssueFieldHtml("external_link_title_3","外部リンク3 タイトル","input",""),
      nextIssueFieldHtml("external_link_comment_3","外部リンク3 コメント","textarea",""),
      nextIssueFieldHtml("external_link_url_3","外部リンク3 URL","input",""),
    ].join("");

    detailContent.innerHTML = `
      <p class="detail-kicker">次号登録の準備</p>
      <h2 id="detail-title" class="detail-title">${esc(detail.magazine_name)}　次号</h2>
      <p class="edit-intro">
        「${esc(detail.issue || "前号")}」を雛形にしています。
        <strong>雑誌ID・雑誌名・判型・本誌編者</strong>だけを引き継ぎ、
        書籍ID・月号・通巻・発刊日・ISBN・価格・頁数・特集・目次・外部リンクなどは空欄に戻しています。
      </p>

      <div class="edit-fixed">
        <div><strong>雑誌ID</strong><br><code>${esc(detail.magazine_id)}</code></div>
        <div><strong>雑誌名</strong><br>${esc(detail.magazine_name)}</div>
        <div><strong>雛形にした号</strong><br>${esc(detail.issue || "")}</div>
      </div>

      <section class="edit-section">
        <h3>基本情報</h3>
        <div class="edit-grid">${basics}</div>
      </section>

      <section class="edit-section">
        <h3>特集1</h3>
        <div class="edit-grid">${feature1}</div>
      </section>

      <section class="edit-section">
        <h3>特集2</h3>
        <div class="edit-grid">${feature2}</div>
      </section>

      <section class="edit-section">
        <h3>目次</h3>
        <div class="edit-grid">
          ${nextIssueFieldHtml("toc","目次","textarea-large","")}
        </div>
      </section>

      <section class="edit-section">
        <h3>外部リンク</h3>
        <div class="edit-grid">${links}</div>
      </section>

      <section class="edit-section">
        <h3>その他</h3>
        <div class="edit-grid">
          ${nextIssueFieldHtml("editor","本誌編者","textarea",source.editor,"前号から自動継承")}
        </div>
      </section>

      <div class="edit-submit-box">
        <strong>新しい号として登録します。</strong><br>
        「登録内容を確認する」を押すとGitHubの確認フォームが開きます。内容を確認して送信すると、該当誌のCSVへ新しい1行を追加し、臨時サイトを再公開します。<br>
        <strong>注意：</strong>公開前登録の切替は次工程で追加するため、現段階では登録後すぐ公開サイトへ反映されます。
        <div class="edit-submit-actions">
          <button class="admin-btn" id="submit-next-issue" type="button">登録内容を確認する</button>
          <button class="admin-btn secondary" id="back-from-next-issue" type="button">登録内容へ戻る</button>
        </div>
      </div>
    `;

    document.getElementById("back-from-next-issue").addEventListener("click", () => renderDetail(detail));
    document.getElementById("submit-next-issue").addEventListener("click", async () => {
      const submitButton = document.getElementById("submit-next-issue");
      const get = (id) => String(document.getElementById(`next-${id}`)?.value || "").trim();
      const required = [
        ["book_id","書籍ID"],
        ["issue","雑誌月号"],
        ["issue_number","雑誌通算番号"],
        ["pub_date","発刊日"],
      ];
      for (const [id,label] of required) {
        if (!get(id)) {
          window.alert(`${label}を入力してください。`);
          document.getElementById(`next-${id}`)?.focus();
          return;
        }
      }

      if (!/^[A-Za-z0-9_-]+$/.test(get("book_id"))) {
        window.alert("書籍IDは半角英数字・ハイフン・アンダースコアで入力してください。");
        document.getElementById("next-book_id")?.focus();
        return;
      }
      if (!/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(get("pub_date"))) {
        window.alert("発刊日は YYYY-MM-DD 形式で入力してください。");
        document.getElementById("next-pub_date")?.focus();
        return;
      }
      for (const id of ["pages","price_body"]) {
        if (get(id) && !/^\d+$/.test(get(id))) {
          window.alert(`${id === "pages" ? "ページ数" : "本体価格"}は数字のみで入力してください。`);
          document.getElementById(`next-${id}`)?.focus();
          return;
        }
      }
      for (const id of ["external_link_url_1","external_link_url_2","external_link_url_3"]) {
        const value = get(id);
        if (value && !/^https?:\/\//i.test(value)) {
          window.alert("外部リンクURLは http:// または https:// から入力してください。");
          document.getElementById(`next-${id}`)?.focus();
          return;
        }
      }

      const registration = {
        "雛形号の書籍ID": String(detail.id || ""),
        "雛形号の雑誌月号": String(detail.issue || ""),
        "雑誌ID": String(detail.magazine_id || ""),
        "雑誌名": String(detail.magazine_name || ""),
        "新しい書籍ID": get("book_id"),
      };
      for (const [id,label] of editFields) {
        const value = get(id);
        if (value) registration[label] = value;
      }

      submitButton.disabled = true;
      submitButton.textContent = "登録内容を準備中…";
      try {
        const payload = encodeRegistrationPayload(registration);
        copyRegistrationPayload(payload);

        const params = new URLSearchParams();
        params.set("template","magazine_new.yml");
        params.set("title",`[雑誌号新規] ${detail.magazine_name} ${get("issue")}`);
        params.set("source_book_id",String(detail.id || ""));
        params.set("source_issue",String(detail.issue || ""));
        params.set("magazine_id",String(detail.magazine_id || ""));
        params.set("magazine_name",String(detail.magazine_name || ""));
        params.set("new_book_id",get("book_id"));
        params.set("mag_issue",get("issue"));
        params.set("issue_number",get("issue_number"));
        params.set("pub_date",get("pub_date"));

        const targetUrl = `${issueBase}?${params.toString()}`;
        window.alert(
          "登録データをクリップボードにコピーしました。\n\n" +
          "次のGitHub画面で『登録データ』欄をクリックし、Ctrl+Vで貼り付けてから送信してください。"
        );
        window.location.href = targetUrl;
      } catch (error) {
        console.error(error);
        submitButton.disabled = false;
        submitButton.textContent = "登録内容を確認する";
        window.alert(error.message || "登録内容をGitHubへ渡す準備に失敗しました。");
      }
    });
  }

  function renderDetail(detail) {
    const cover = coverUrl(detail);
    const feature1 = featureText(detail);
    const feature2 = [detail.feature2, detail.feature2_subtitle].filter(Boolean).join("　");
    const contributors = Array.isArray(detail.contributors) ? detail.contributors.join("／") : "";
    const identifiers = [
      detail.isbn_old ? `旧ISBN：${detail.isbn_old}` : "",
      detail.isbn_new ? `新ISBN：${detail.isbn_new}` : "",
      detail.magazine_code_1 ? `雑誌コード(1)：${detail.magazine_code_1}` : "",
      detail.magazine_code_2 ? `雑誌コード(2)：${detail.magazine_code_2}` : "",
    ].filter(Boolean).join(" ／ ");

    const external = renderLinks("外部リンク", detail.external_links, (link) => `
      <li>
        <a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.title || link.url)}</a>
        ${link.comment ? `<div class="detail-link-comment">${esc(link.comment)}</div>` : ""}
      </li>
    `);

    const ebooks = renderLinks("電子書籍リンク", detail.ebook_links, (link) => `
      <li><a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(ebookLabels[link.service] || link.service || link.url)}</a></li>
    `);

    detailContent.innerHTML = `
      <div class="detail-header">
        <div>
          ${cover
            ? `<img class="detail-cover" src="${esc(cover)}" alt="${esc(detail.magazine_name)} ${esc(detail.issue)}の表紙">`
            : '<div class="detail-cover-empty">書影なし</div>'}
        </div>
        <div>
          <p class="detail-kicker">現在の登録内容</p>
          <h2 id="detail-title" class="detail-title">${esc(detail.magazine_name)}　${esc(detail.issue || "")}</h2>
          ${feature1 ? `<p class="detail-feature">特集：${esc(feature1)}</p>` : ""}
          ${feature2 ? `<p class="detail-feature">特集2：${esc(feature2)}</p>` : ""}
        </div>
      </div>

      <table class="detail-table">
        <tbody>
          ${row("書籍ID", detail.id)}
          ${row("公開状態", detail.published === false ? "非公開" : "公開中")}
          ${row("雑誌ID", detail.magazine_id)}
          ${row("通巻番号", detail.issue_number)}
          ${row("発刊日", detail.pub_date)}
          ${row("判型", detail.format)}
          ${row("ページ数", detail.pages ? `${detail.pages}頁` : "")}
          ${row("本体価格", yen(detail.price_body))}
          ${row("ISBN", detail.isbn)}
          ${row("その他識別情報", identifiers)}
          ${row("本誌編者", detail.editor)}
          ${row("執筆者等（検索用抽出）", contributors)}
        </tbody>
      </table>

      ${detail.description || detail.description_heading ? `
        <section class="detail-section">
          <h3>${esc(detail.description_heading || "特集内容紹介")}</h3>
          <div class="detail-text">${esc(detail.description || "")}</div>
        </section>
      ` : ""}

      ${detail.description2 || detail.description_heading2 ? `
        <section class="detail-section">
          <h3>${esc(detail.description_heading2 || "特集2 内容紹介")}</h3>
          <div class="detail-text">${esc(detail.description2 || "")}</div>
        </section>
      ` : ""}

      ${detail.toc ? `
        <section class="detail-section">
          <h3>目次</h3>
          <div class="detail-text">${esc(detail.toc)}</div>
        </section>
      ` : ""}

      <section class="detail-section">
        <h3>この号の管理</h3>
        <p>書誌内容の修正と、一般公開サイトへの表示状態の変更は別操作です。</p>
        <div class="edit-submit-actions">
          <button id="open-magazine-edit" class="admin-btn" type="button">この号を修正</button>
          ${detail.published === false
            ? '<button id="restore-magazine" class="admin-btn" type="button">この号を公開する</button>'
            : '<button id="hide-magazine" class="admin-btn danger" type="button">この号を非公開にする</button>'}
        </div>
      </section>

      ${external}
      ${ebooks}
    `;
    document.getElementById("open-magazine-edit")?.addEventListener("click", () => openEditForm(detail));
    document.getElementById("hide-magazine")?.addEventListener("click", () => openPublicationChange(detail, false));
    document.getElementById("restore-magazine")?.addEventListener("click", () => openPublicationChange(detail, true));
  }

  async function openDetail(issue) {
    detailOverlay.hidden = false;
    document.body.classList.add("detail-open");
    detailContent.innerHTML = '<p class="detail-loading">登録内容を読み込んでいます。</p>';
    try {
      const detail = await loadDetail(issue);
      renderDetail(detail);
    } catch (error) {
      console.error(error);
      detailContent.innerHTML = `<div class="detail-error">${esc(error.message || "登録内容を読み込めませんでした。")}</div>`;
    }
  }

  function render(items, total) {
    results.replaceChildren();

    if (!items.length) {
      count.textContent = "該当する号がありません。";
      results.innerHTML = '<div class="empty">検索条件を変えてお試しください。</div>';
      return;
    }

    if (total > items.length) {
      count.textContent = `${total.toLocaleString()}件中${items.length.toLocaleString()}件表示（さらに絞り込んでください）`;
    } else {
      count.textContent = `${total.toLocaleString()}件表示`;
    }

    items.forEach((issue) => {
      const article = document.createElement("article");
      article.className = "issue-card";
      const cover = coverUrl(issue);
      const feature = featureText(issue);
      const contributors = Array.isArray(issue.contributors) ? issue.contributors.slice(0,6).join("／") : "";

      article.innerHTML = `
        <div>
          ${cover
            ? `<img class="issue-cover" src="${esc(cover)}" alt="${esc(issue.magazine_name)} ${esc(issue.issue)}の表紙">`
            : '<div class="issue-cover-empty">書影なし</div>'}
        </div>
        <div>
          <h2>${esc(issue.magazine_name)}　${esc(issue.issue || "（月号未登録）")}</h2>
          ${feature ? `<p class="issue-feature">特集：${esc(feature)}</p>` : ""}
          <div class="issue-meta">
            <span>書籍ID：${esc(issue.id)}</span>
            <span class="status-note">${issue.published === false ? "非公開" : "公開中"}</span>
            ${issue.issue_number ? `<span>通巻：${esc(issue.issue_number)}</span>` : ""}
            ${issue.pub_date ? `<span>発刊日：${esc(issue.pub_date)}</span>` : ""}
            ${issue.isbn ? `<span>ISBN：${esc(issue.isbn)}</span>` : ""}
            ${contributors ? `<span>執筆者等：${esc(contributors)}</span>` : ""}
          </div>
          <div class="issue-actions">
            <button class="admin-btn" type="button" data-detail-id="${esc(issue.id)}">登録内容を確認</button>
            ${issue.published === false ? "" : `<a class="admin-btn secondary" href="${esc(issueDetailUrl(issue))}" target="_blank" rel="noopener noreferrer">公開ページを確認</a>`}
            <a class="admin-btn secondary" href="${esc(backnumberUrl(issue))}" target="_blank" rel="noopener noreferrer">バックナンバーを確認</a>
          </div>
        </div>
      `;

      article.querySelector("[data-detail-id]").addEventListener("click", () => {
        void openDetail(issue);
      });
      results.appendChild(article);
    });
  }

  function runSearch() {
    if (!selectedMagazineId) {
      count.textContent = "雑誌を選んでください。";
      results.replaceChildren();
      return;
    }

    const terms = queryInput.value.trim().split(/\s+/).filter(Boolean).map(normalize);

    const matched = issues.filter((issue) => {
      if (String(issue.magazine_id || "") !== selectedMagazineId) return false;
      return terms.every((term) => String(issue.__search || "").includes(term));
    });

    render(matched.slice(0,50), matched.length);
  }


  function publicationKey(issue) {
    const raw = String(issue?.pub_date || "").trim();
    const match = raw.match(/^(\d{4})[-/.]?(\d{1,2})?[-/.]?(\d{1,2})?/);
    if (match) {
      return Number(match[1]) * 10000 + Number(match[2] || 0) * 100 + Number(match[3] || 0);
    }
    return Number(issue?.pub_year || 0) * 10000;
  }

  function latestIssueForMagazine(magazineId) {
    const candidates = issues.filter((issue) => String(issue.magazine_id || "") === String(magazineId || ""));
    if (!candidates.length) return null;
    return [...candidates].sort((a,b) => {
      const dateDiff = publicationKey(b) - publicationKey(a);
      if (dateDiff) return dateDiff;
      const bNo = Number(String(b.issue_number || "").replace(/\D/g,"")) || 0;
      const aNo = Number(String(a.issue_number || "").replace(/\D/g,"")) || 0;
      if (bNo !== aNo) return bNo - aNo;
      return String(b.id || "").localeCompare(String(a.id || ""), "ja", {numeric:true});
    })[0];
  }

  function updateNewIssueAction() {
    const latest = latestIssueForMagazine(selectedMagazineId);
    if (!latest) {
      newIssueAction.hidden = true;
      newIssueButton.dataset.sourceId = "";
      return;
    }
    const parts = [
      `現在の最新号：${latest.issue || "（月号未登録）"}`,
      latest.issue_number ? `通巻 ${latest.issue_number}` : "",
      latest.pub_date ? `発刊日 ${latest.pub_date}` : "",
      latest.published === false ? "非公開" : "公開中",
    ].filter(Boolean);
    newIssueSource.textContent = parts.join(" ／ ");
    newIssueButton.dataset.sourceId = String(latest.id || "");
    newIssueAction.hidden = false;
  }

  async function openNextIssueFrom(issue) {
    if (!issue) return;
    detailOverlay.hidden = false;
    document.body.classList.add("detail-open");
    detailContent.innerHTML = '<p class="detail-loading">最新号の登録内容を読み込んでいます。</p>';
    try {
      const detail = await loadDetail(issue);
      openNextIssueForm(detail);
    } catch (error) {
      console.error(error);
      detailContent.innerHTML = `<div class="detail-error">${esc(error.message || "最新号の登録内容を読み込めませんでした。")}</div>`;
    }
  }

  function selectMagazine(id) {
    selectedMagazineId = String(id || "");
    choices.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.magazineId === selectedMagazineId);
    });
    queryInput.value = "";
    updateNewIssueAction();
    runSearch();
  }

  async function init() {
    try {
      issues = await loadData();

      choices.forEach((button) => {
        button.addEventListener("click", () => selectMagazine(button.dataset.magazineId));
      });
      searchButton.addEventListener("click", runSearch);
      newIssueButton.addEventListener("click", () => {
        window.location.href = newIssueUrl();
      });
      queryInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") runSearch();
      });

      detailClose.addEventListener("click", closeDetail);
      detailOverlay.addEventListener("click", (event) => {
        if (event.target === detailOverlay) closeDetail();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !detailOverlay.hidden) closeDetail();
      });
    } catch (error) {
      console.error(error);
      count.textContent = "雑誌データを読み込めませんでした。ページを再読み込みしてください。";
    }
  }

  init();
})();
