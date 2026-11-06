/* 由 scripts/build.mjs 生成，请改 src/client/index.tsx 后重新 build */
window.__ModuleLoader__.load({
  id: "dsh-api-free-image",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
      "use strict";
      var __defProp = Object.defineProperty;
      var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
      var __getOwnPropNames = Object.getOwnPropertyNames;
      var __hasOwnProp = Object.prototype.hasOwnProperty;
      var __export = (target, all) => {
        for (var name in all)
          __defProp(target, name, { get: all[name], enumerable: true });
      };
      var __copyProps = (to, from, except, desc) => {
        if (from && typeof from === "object" || typeof from === "function") {
          for (let key of __getOwnPropNames(from))
            if (!__hasOwnProp.call(to, key) && key !== except)
              __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
        }
        return to;
      };
      var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

      // src/client/index.tsx
      var index_exports = {};
      __export(index_exports, {
        ApiFreeImageCard: () => ApiFreeImageCard,
        apply: () => apply,
        inject: () => inject
      });
      module.exports = __toCommonJS(index_exports);
      var import_react = require("react");

      // src/config.ts
      var PLUGIN_ID = "dsh-api-free-image";
      var PLUGIN_DISPLAY_NAME = "API免费生图";
      var SIGNUP_URL = "https://cloud.siliconflow.cn/i/Qt3zAfmr";

      // src/client/index.tsx
      var import_jsx_runtime = require("react/jsx-runtime");
      var API_BASE = `/${PLUGIN_ID}/api`;
      var FALLBACK_SIGNUP_URL = SIGNUP_URL;
      var zh = {
        title: PLUGIN_DISPLAY_NAME,
        hint: "输入你的 API Key，",
        link: "去注册获取",
        signupNote: "通过此链接注册可支持本插件开发",
        placeholder: "sk-...",
        save: "保存",
        saving: "保存中…",
        saved: "✅ 已保存，现在可以直接让我画图了",
        cleared: "🗑 已清除本地保存的 Key",
        clear: "清除",
        configured: "已配置",
        notConfigured: "未配置",
        sourceFile: "来源：设置卡片",
        sourceEnv: "来源：环境变量",
        quota: "今日 {today}/{ipd} 张 · 本分钟 {minute}/{ipm} 张",
        remaining: "今日还剩 {remaining} 张",
        modelNote: "模型锁定为 {model}（免费）；不提供 model 参数，防止误调收费模型。",
        saveLocation: "保存位置",
        changeLocation: "更改保存位置",
        resetLocation: "恢复默认",
        picking: "等待选择…",
        hideDocs: "收起说明",
        showDocs: "显示说明",
        hideDocsTitle: "把上面那段说明收起来（下次进来还是收起的）",
        showDocsTitle: "把说明展开",
        docsFailed: "切换说明显示失败：{error}",
        locationSaved: "✅ 保存位置已更新",
        locationReset: "✅ 已恢复默认保存位置",
        loadFailed: "读取本地状态失败：{error}",
        saveFailed: "保存失败：{error}",
        locationFailed: "更改保存位置失败：{error}",
        pickerUnavailable: "当前宿主没有文件夹选择器，请手动填写路径后保存。",
        emptyLocation: "请在设置里选择一个文件夹"
      };
      var en = {
        title: "API free image generation",
        hint: "Paste your API key, ",
        link: "get one here",
        signupNote: "Signing up through this link supports this plugin",
        placeholder: "sk-...",
        save: "Save",
        saving: "Saving…",
        saved: "✅ Saved — image generation is ready",
        cleared: "🗑 Local key removed",
        clear: "Clear",
        configured: "Configured",
        notConfigured: "Not configured",
        sourceFile: "Source: settings card",
        sourceEnv: "Source: environment variable",
        quota: "Today {today}/{ipd} · This minute {minute}/{ipm}",
        remaining: "{remaining} left today",
        modelNote: "Model is locked to {model} (free); there is no model parameter on purpose.",
        saveLocation: "Save location",
        changeLocation: "Change folder",
        resetLocation: "Use default",
        picking: "Waiting for the picker…",
        hideDocs: "Hide docs",
        showDocs: "Show docs",
        hideDocsTitle: "Fold the docs above; it stays folded next time",
        showDocsTitle: "Unfold the docs",
        docsFailed: "Could not toggle the docs: {error}",
        locationSaved: "✅ Save location updated",
        locationReset: "✅ Back to the default folder",
        loadFailed: "Could not read local status: {error}",
        saveFailed: "Save failed: {error}",
        locationFailed: "Could not change the save location: {error}",
        pickerUnavailable: "This host has no folder picker; type a path and save instead.",
        emptyLocation: "Pick a folder in the settings first"
      };
      var CSS = `
      .kfi{display:flex;flex-direction:column;gap:10px;padding:14px 16px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-2,transparent);color:var(--dsw-alias-label-primary);box-sizing:border-box}
      .kfi-head{display:flex;align-items:center;gap:8px;justify-content:space-between}
      .kfi-headRight{display:flex;align-items:center;gap:8px;flex:0 0 auto}
      .kfi-docsBtn{display:inline-flex;align-items:center;gap:5px}
      .kfi-docsBtn svg{width:11px;height:11px;flex:0 0 auto;opacity:.85}
      .kfi-title{display:flex;align-items:center;gap:8px;font-size:14px;line-height:20px;font-weight:600}
      .kfi-mark{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:7px;background:linear-gradient(135deg,#4b8dff,#8f5bff);color:#fff;flex:0 0 auto}
      .kfi-badge{display:inline-flex;align-items:center;gap:4px;font-size:12px;line-height:16px;padding:1px 8px;border-radius:6px;white-space:nowrap}
      .kfi-badge[data-on="true"]{color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-state-success-tertiary,rgba(0,160,90,.12))}
      .kfi-badge[data-on="false"]{color:var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-state-warn-tertiary,rgba(230,140,0,.12))}
      .kfi-hint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
      .kfi-link{color:var(--dsw-alias-state-business-primary);text-decoration:none}
      .kfi-link:hover{text-decoration:underline}
      .kfi-signupNote{margin:2px 0 0;font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary)}
      .kfi-form{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .kfi-input{flex:1 1 220px;min-width:0;height:32px;padding:0 10px;font-size:13px;font-family:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1,transparent);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md,8px);outline:none;transition:border-color 120ms ease}
      .kfi-input::placeholder{color:var(--dsw-alias-label-tertiary)}
      .kfi-input:focus{border-color:var(--dsw-alias-state-business-primary)}
      .kfi-btn{height:32px;padding:0 14px;font-size:13px;font-family:inherit;border-radius:var(--dsw-radius-md,8px);border:1px solid transparent;cursor:pointer;transition:opacity 120ms ease,transform 120ms cubic-bezier(0.23,1,0.32,1);white-space:nowrap}
      .kfi-btn:active{transform:scale(.97)}
      .kfi-btn[data-variant="primary"]{background:var(--dsw-alias-state-business-primary);color:#fff}
      .kfi-btn[data-variant="ghost"]{background:transparent;color:var(--dsw-alias-label-secondary);border-color:var(--dsw-alias-border-l2)}
      .kfi-btn[data-variant="ghost"]:hover{color:var(--dsw-alias-label-primary)}
      .kfi-btn[data-size="sm"]{height:26px;padding:0 10px;font-size:12px}
      .kfi-btn:disabled{opacity:.45;cursor:default;transform:none}
      .kfi-btn:focus-visible,.kfi-input:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
      .kfi-loc{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1)}
      .kfi-locLabel{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);flex:0 0 auto}
      .kfi-path{flex:1 1 200px;min-width:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.08));border-radius:6px;padding:2px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}
      .kfi-meta{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
      .kfi-meta b{font-weight:600;color:var(--dsw-alias-label-secondary)}
      .kfi-note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
      .kfi-msg{font-size:12px;line-height:18px;word-break:break-word}
      .kfi-msg[data-kind="ok"]{color:var(--dsw-alias-state-success-primary)}
      .kfi-msg[data-kind="error"]{color:var(--dsw-alias-state-error-primary)}
      /* 说明收起：只隐藏「紧挨着我们设置卡片」的那一个说明文档块（宿主渲染的 README），
         用 :has() 锁定关系，别的插件页的说明不受影响。 */
      html.kfi-hide-docs section[data-detail-document]:has(+ section[data-plugin-config] .kfi){display:none!important}
      `;
      function fill(template, vars) {
        return template.replace(/\{(\w+)\}/g, (_match, key) => String(vars[key] ?? `{${key}}`));
      }
      async function fetchStatus() {
        const response = await fetch(`${API_BASE}/status`, { headers: { accept: "application/json" } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (payload.ok !== true) throw new Error(payload.error ?? "unknown error");
        return payload;
      }
      function ApiFreeImageCard({ t, pick }) {
        const [status, setStatus] = (0, import_react.useState)(null);
        const [draft, setDraft] = (0, import_react.useState)("");
        const [busy, setBusy] = (0, import_react.useState)(null);
        const [message, setMessage] = (0, import_react.useState)(null);
        const [hideDocs, setHideDocs] = (0, import_react.useState)(false);
        const aliveRef = (0, import_react.useRef)(true);
        const refresh = (0, import_react.useCallback)(async () => {
          const next = await fetchStatus();
          if (aliveRef.current) setStatus(next);
          return next;
        }, []);
        (0, import_react.useEffect)(() => {
          aliveRef.current = true;
          refresh().catch((error) => {
            if (!aliveRef.current) return;
            setMessage({
              kind: "error",
              text: fill(t("loadFailed"), { error: error instanceof Error ? error.message : String(error) })
            });
          });
          return () => {
            aliveRef.current = false;
          };
        }, [refresh, t]);
        (0, import_react.useEffect)(() => {
          if (status === null) return;
          setHideDocs(status.ui?.hideDocs === true);
        }, [status]);
        (0, import_react.useEffect)(() => {
          const root = document.documentElement;
          root.classList.toggle("kfi-hide-docs", hideDocs);
          return () => {
            root.classList.remove("kfi-hide-docs");
          };
        }, [hideDocs]);
        const submitKey = (0, import_react.useCallback)(
          async (value) => {
            setBusy("key");
            setMessage(null);
            try {
              const response = await fetch(`${API_BASE}/key`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ apiKey: value })
              });
              const payload = await response.json();
              if (payload.ok !== true) throw new Error(payload.error ?? `HTTP ${response.status}`);
              await refresh();
              if (aliveRef.current) {
                setDraft("");
                setMessage({ kind: "ok", text: value.trim() === "" ? t("cleared") : t("saved") });
              }
            } catch (error) {
              if (aliveRef.current) {
                setMessage({
                  kind: "error",
                  text: fill(t("saveFailed"), { error: error instanceof Error ? error.message : String(error) })
                });
              }
            } finally {
              if (aliveRef.current) setBusy(null);
            }
          },
          [refresh, t]
        );
        const toggleDocs = (0, import_react.useCallback)(async () => {
          const next = !hideDocs;
          setHideDocs(next);
          setBusy("docs");
          setMessage(null);
          try {
            const response = await fetch(`${API_BASE}/ui-prefs`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ hideDocs: next })
            });
            const payload = await response.json();
            if (payload.ok !== true) throw new Error(payload.error ?? `HTTP ${response.status}`);
            if (aliveRef.current && typeof payload.ui?.hideDocs === "boolean") setHideDocs(payload.ui.hideDocs);
          } catch (error) {
            if (aliveRef.current) {
              setHideDocs(!next);
              setMessage({
                kind: "error",
                text: fill(t("docsFailed"), { error: error instanceof Error ? error.message : String(error) })
              });
            }
          } finally {
            if (aliveRef.current) setBusy(null);
          }
        }, [hideDocs, t]);
        const chooseLocation = (0, import_react.useCallback)(async () => {
          if (pick === void 0) {
            setMessage({ kind: "error", text: t("pickerUnavailable") });
            return;
          }
          setBusy("dir");
          setMessage(null);
          try {
            const picked = await pick();
            if (picked === null) return;
            const response = await fetch(`${API_BASE}/output-dir`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ outputDir: picked })
            });
            const payload = await response.json();
            if (payload.ok !== true) throw new Error(payload.error ?? `HTTP ${response.status}`);
            await refresh();
            if (aliveRef.current) setMessage({ kind: "ok", text: t("locationSaved") });
          } catch (error) {
            if (aliveRef.current) {
              setMessage({
                kind: "error",
                text: fill(t("locationFailed"), { error: error instanceof Error ? error.message : String(error) })
              });
            }
          } finally {
            if (aliveRef.current) setBusy(null);
          }
        }, [pick, refresh, t]);
        const resetLocation = (0, import_react.useCallback)(async () => {
          setBusy("dir");
          setMessage(null);
          try {
            const response = await fetch(`${API_BASE}/output-dir`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ outputDir: "" })
            });
            const payload = await response.json();
            if (payload.ok !== true) throw new Error(payload.error ?? `HTTP ${response.status}`);
            await refresh();
            if (aliveRef.current) setMessage({ kind: "ok", text: t("locationReset") });
          } catch (error) {
            if (aliveRef.current) {
              setMessage({
                kind: "error",
                text: fill(t("locationFailed"), { error: error instanceof Error ? error.message : String(error) })
              });
            }
          } finally {
            if (aliveRef.current) setBusy(null);
          }
        }, [refresh, t]);
        const configured = status?.configured === true;
        const sourceText = status === null ? "" : status.source === "env" ? `${t("sourceEnv")} ${status.envName ?? ""}`.trim() : status.source === "file" ? t("sourceFile") : "";
        const signupUrl = status?.provider.signupUrl ?? FALLBACK_SIGNUP_URL;
        const model = status?.provider.model ?? "Kwai-Kolors/Kolors";
        const busyAny = busy !== null;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "kfi", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "kfi-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "kfi-title", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "kfi-mark", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "3", y: "4", width: "18", height: "16", rx: "3" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "8.5", cy: "9.5", r: "1.5", fill: "currentColor", stroke: "none" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M21 15l-4.5-4.5L7 20" })
              ] }) }),
              t("title")
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "kfi-headRight", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "button",
                {
                  className: "kfi-btn kfi-docsBtn",
                  "data-variant": "ghost",
                  "data-size": "sm",
                  type: "button",
                  "aria-expanded": !hideDocs,
                  title: hideDocs ? t("showDocsTitle") : t("hideDocsTitle"),
                  disabled: busyAny,
                  onClick: () => {
                    if (busyAny) return;
                    void toggleDocs();
                  },
                  children: [
                    hideDocs ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M6 9l6 6 6-6" }) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M6 15l6-6 6 6" }) }),
                    hideDocs ? t("showDocs") : t("hideDocs")
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "kfi-badge", "data-on": configured ? "true" : "false", children: configured ? `✅ ${t("configured")}` : `⚠️ ${t("notConfigured")}` })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "kfi-hint", children: [
              t("hint"),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { className: "kfi-link", href: signupUrl, target: "_blank", rel: "noreferrer noopener", children: t("link") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "kfi-signupNote", children: t("signupNote") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "form",
            {
              className: "kfi-form",
              onSubmit: (event) => {
                event.preventDefault();
                if (busyAny) return;
                void submitKey(draft);
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    className: "kfi-input",
                    type: "password",
                    name: "api-free-image-key",
                    autoComplete: "new-password",
                    spellCheck: false,
                    placeholder: configured && status ? status.maskedKey : t("placeholder"),
                    value: draft,
                    disabled: busyAny,
                    onChange: (event) => setDraft(event.currentTarget.value),
                    "aria-label": t("title")
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "kfi-btn", "data-variant": "primary", type: "submit", disabled: busyAny || draft.trim() === "", children: busy === "key" ? t("saving") : t("save") }),
                status?.source === "file" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    className: "kfi-btn",
                    "data-variant": "ghost",
                    type: "button",
                    disabled: busyAny,
                    onClick: () => {
                      if (busyAny) return;
                      void submitKey("");
                    },
                    children: t("clear")
                  }
                ) : null
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "kfi-loc", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "kfi-locLabel", children: t("saveLocation") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { className: "kfi-path", title: status?.output.dir ?? "", children: status === null ? "…" : status.output.dir }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                className: "kfi-btn",
                "data-variant": "ghost",
                "data-size": "sm",
                type: "button",
                disabled: busyAny,
                onClick: () => {
                  if (busyAny) return;
                  void chooseLocation();
                },
                children: busy === "dir" ? t("picking") : t("changeLocation")
              }
            ),
            status?.output.source === "custom" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                className: "kfi-btn",
                "data-variant": "ghost",
                "data-size": "sm",
                type: "button",
                disabled: busyAny,
                onClick: () => {
                  if (busyAny) return;
                  void resetLocation();
                },
                children: t("resetLocation")
              }
            ) : null
          ] }),
          status !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "kfi-meta", children: [
            sourceText === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: sourceText }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: model }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: fill(t("quota"), {
              today: status.usage.todayCount,
              ipd: status.limits.ipd,
              minute: status.usage.minuteCount,
              ipm: status.limits.ipm
            }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: fill(t("remaining"), { remaining: status.usage.remainingToday }) })
          ] }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "kfi-note", children: fill(t("modelNote"), { model }) }),
          message !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "kfi-msg", "data-kind": message.kind, children: message.text }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("style", { children: CSS })
        ] });
      }
      var inject = ["slots", "locale"];
      function apply(ctx) {
        ctx.effect(() => ctx.locale.register(PLUGIN_ID, { zh, en }), `${PLUGIN_ID}: dictionaries`);
        const t = ctx.locale.bind(PLUGIN_ID);
        let workspace;
        ctx.inject(["uiWorkspace"], (scoped) => {
          workspace = scoped.uiWorkspace;
        });
        const desktopPicker = globalThis.__DSH_DIRECTORY_PICKER__;
        const pick = async () => {
          if (desktopPicker !== void 0) return await desktopPicker.pick();
          if (workspace !== void 0) return await workspace.pickDirectory();
          throw new Error(t("pickerUnavailable"));
        };
        ctx.slots.inject(
          "plugins.bundle.config",
          () => ctx.slots.register(
            {
              name: "plugins.bundle.config",
              key: PLUGIN_ID,
              locale: PLUGIN_ID,
              inject: () => ({ t, pick })
            },
            (ownerProps = {}) => ownerProps.view === "summary" ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ApiFreeImageCard, { t, pick })
          )
        );
      }
    return module.exports;
  },
});
