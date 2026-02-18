import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  decryptFileAesGcm,
  downloadBlob,
  encryptFileAesGcm,
  encryptFileXorDemo,
  decryptFileXorDemo,
} from "../features/crypto/webcrypto";
import InfoSidebar from "../components/InfoSidebar";

type FileItem = {
  id: string;
  file: File;
  addedAt: number;
};

type LogItem = {
  id: string;
  at: number;
  text: string;
};

type Method = "aesgcm" | "xor-demo";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const n = i === 0 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${n} ${units[i]}`;
}

function makeRandomCode(len = 28): string {
  const bytes = new Uint8Array(Math.ceil((len * 3) / 4) + 8);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
    .slice(0, len);
}

export default function CryptoPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [files, setFiles] = useState<FileItem[]>([]);
  const [log, setLog] = useState<LogItem[]>([
    { id: crypto.randomUUID(), at: Date.now(), text: "Статус: очікування дії…" },
  ]);

  const [method, setMethod] = useState<Method>("aesgcm");

  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);

  const hasFiles = files.length > 0;
  const singleFile = files.length === 1 ? files[0].file : null;

  const lowerName = (singleFile?.name ?? "").toLowerCase();
  const isCfs = lowerName.endsWith(".cfs");
  const isXor = lowerName.endsWith(".xor");

  const isDecryptMode = !!singleFile && (isCfs || isXor);
  const isEncryptMode = !!singleFile && !isDecryptMode;

  const filesCountLabel = useMemo(() => {
    if (!hasFiles) return "Файли не додано";
    if (files.length === 1) return "1 файл додано";
    return `${files.length} файлів додано`;
  }, [files, hasFiles]);

  function pushLog(text: string) {
    setLog((prev) => [{ id: crypto.randomUUID(), at: Date.now(), text }, ...prev].slice(0, 50));
  }

  function openPicker() {
    inputRef.current?.click();
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    const f = fileList[0];
    setFiles([{ id: crypto.randomUUID(), file: f, addedAt: Date.now() }]);
    pushLog(`Обрано файл: ${f.name}`);
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    addFiles(e.target.files);
    e.target.value = "";
  }

  function resetAfterAction() {
    setFiles([]);
    setCode("");
    setShowCode(false);
    setMethod("aesgcm");
  }

  /**
   * Автогенерація коду:
   * - тільки для encrypt-mode (звичайний файл)
   * - для decrypt-mode (.cfs/.xor) код НЕ генеруємо
   * + при decrypt-mode метод визначається розширенням
   */
  useEffect(() => {
    if (!singleFile) return;

    if (isEncryptMode) {
      const newCode = makeRandomCode(28);
      setCode(newCode);
      pushLog("Автоматично згенеровано код доступу для вибраного файлу (збережіть його).");
      return;
    }

    if (isDecryptMode) {
      setCode("");

      if (isCfs) setMethod("aesgcm");
      if (isXor) setMethod("xor-demo");

      pushLog("Режим дешифрування: вставте код, який використовувався при шифруванні.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleFile?.name]);

  async function copyCode() {
    try {
      if (!code) return;
      await navigator.clipboard.writeText(code);
      pushLog("Код скопійовано в буфер обміну.");
    } catch {
      pushLog("Не вдалося скопіювати код (браузер заборонив).");
    }
  }

  function regenerateCodeForFile() {
    if (!isEncryptMode) return;
    const newCode = makeRandomCode(28);
    setCode(newCode);
    pushLog("Згенеровано новий код для поточного файлу (попередній більше не підходить).");
  }

  const codeOk = code.trim().length >= 6;

  const canEncrypt = isEncryptMode && codeOk;
  const canDecrypt = isDecryptMode && codeOk;

  async function onEncrypt() {
    try {
      if (!singleFile || !isEncryptMode) {
        pushLog("Оберіть звичайний файл (не .cfs/.xor) для шифрування.");
        return;
      }
      if (!codeOk) {
        pushLog("Код недійсний (мін. 6 символів).");
        return;
      }

      pushLog(`Шифрування (${method}): ${singleFile.name}`);

      if (method === "aesgcm") {
        const blob = await encryptFileAesGcm(singleFile, code);
        downloadBlob(blob, `encrypted_${singleFile.name}.cfs`);
      } else {
        // ✅ XOR demo через webcrypto.ts, а не "ручний" xorDemoTransform
        const blob = await encryptFileXorDemo(singleFile, code);
        downloadBlob(blob, `encrypted_${singleFile.name}.xor`);
      }

      pushLog("Готово: файл зашифровано та збережено.");
      pushLog("Увага: збережіть код — без нього дешифрування неможливе.");

      resetAfterAction();
    } catch (e) {
      pushLog(`Помилка: ${e instanceof Error ? e.message : "невідома"}`);
    }
  }

  async function onDecrypt() {
    try {
      if (!singleFile || !isDecryptMode) {
        pushLog("Оберіть контейнер .cfs або .xor для дешифрування.");
        return;
      }
      if (!codeOk) {
        pushLog("Вставте правильний код (мін. 6 символів).");
        return;
      }

      pushLog(`Дешифрування (${method}): ${singleFile.name}`);

      if (isCfs) {
        const blob = await decryptFileAesGcm(singleFile, code);
        const outName = singleFile.name.replace(/\.cfs$/i, "");
        downloadBlob(blob, `decrypted_${outName}`);
      } else if (isXor) {
        // ✅ XOR demo через webcrypto.ts
        const blob = await decryptFileXorDemo(singleFile, code);
        const outName = singleFile.name.replace(/\.xor$/i, "");
        downloadBlob(blob, `decrypted_${outName}`);
      } else {
        pushLog("Невідомий формат. Для AES використовуйте .cfs, для XOR demo — .xor.");
        return;
      }

      pushLog("Готово: файл дешифровано та збережено.");
      resetAfterAction();
    } catch (e) {
      pushLog(`Помилка: ${e instanceof Error ? e.message : "невідома"}`);
    }
  }

  return (
    <main className="mp-main">
      <div className="mp-layout">
        <section className="mp-card">
          <div className="mp-cardTitle">Файли</div>

          <input
            ref={inputRef}
            className="mp-fileInputHidden"
            type="file"
            multiple={false}
            onChange={onInputChange}
          />

          <div className="mp-filePicker">
            <button type="button" className="mp-fileBtn" onClick={openPicker}>
              Додати файл
            </button>

            <div className="mp-fileMeta">
              <div className="mp-fileMetaTitle">{filesCountLabel}</div>
              <div className="mp-fileMetaSub">Потік: вибір файла → код → дія → автоскидання.</div>
            </div>
          </div>

          <div className="mp-sectionTitle">Список файлів</div>

          {!hasFiles ? (
            <div className="mp-empty">Додайте файл, щоб продовжити.</div>
          ) : (
            <div className="mp-fileList">
              {files.map((it) => (
                <div key={it.id} className="mp-fileRow">
                  <div className="mp-fileRowMain">
                    <div className="mp-fileName">{it.file.name}</div>
                    <div className="mp-fileInfo">
                      {formatBytes(it.file.size)} • {it.file.type || "unknown"}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="mp-miniBtn"
                    onClick={() => {
                      pushLog(`Файл знято: ${it.file.name}`);
                      setFiles([]);
                      setCode("");
                      setShowCode(false);
                    }}
                    title="Очистити"
                    aria-label="Очистити"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <label className="mp-label" style={{ marginTop: 14 }}>
            Метод
            <div className="mp-selectWrap">
              <select
                className="mp-select"
                value={method}
                onChange={(e) => setMethod(e.target.value as Method)}
                disabled={!hasFiles || isDecryptMode}
                title={
                  !hasFiles ? "Спочатку оберіть файл" : isDecryptMode ? "Метод визначено форматом файла" : ""
                }
              >
                <option value="aesgcm">AES-256-GCM (рекомендовано)</option>
                <option value="xor-demo">XOR (demo)</option>
              </select>
            </div>

            <span className="mp-hint">
              XOR — демонстраційний метод (не криптостійкий). Для реального шифрування — AES-256-GCM.
            </span>
          </label>

          <label className="mp-label">
            Код доступу (ключ)
            <div className="mp-inputWrap">
              <input
                className="mp-input mp-inputWithIcon"
                type={showCode ? "text" : "password"}
                placeholder={
                  isDecryptMode
                    ? "Вставте код для дешифрування…"
                    : hasFiles
                      ? "Код згенеровано автоматично…"
                      : "Спочатку додайте файл…"
                }
                value={code}
                onChange={(e) => {
                  if (isDecryptMode) setCode(e.target.value);
                }}
                readOnly={!isDecryptMode}
                aria-readonly={!isDecryptMode}
                title={!isDecryptMode ? "Код генерується автоматично для файла" : ""}
              />

              <button
                type="button"
                className="mp-eyeBtn"
                onClick={() => setShowCode((v) => !v)}
                aria-label={showCode ? "Приховати" : "Показати"}
                title={showCode ? "Приховати" : "Показати"}
              >
                {showCode ? "🙈" : "👁️"}
              </button>
            </div>

            <div className="mp-rowBtns">
              <button
                type="button"
                className="mp-miniActionBtn"
                onClick={regenerateCodeForFile}
                disabled={!isEncryptMode}
                title={!isEncryptMode ? "Доступно лише для шифрування" : "Згенерувати новий код"}
              >
                Новий код
              </button>

              <button
                type="button"
                className="mp-miniActionBtn mp-miniActionBtnSecondary"
                onClick={copyCode}
                disabled={!code}
              >
                Скопіювати
              </button>
            </div>

            <span className="mp-hint">
              {isDecryptMode
                ? "Для дешифрування потрібен той самий код, що був при шифруванні."
                : "Код генерується автоматично після вибору файла. Збережіть його: без коду дешифрування неможливе."}
            </span>
          </label>

          <div className="mp-actions" style={{ marginTop: 10 }}>
            <button
              className="mp-btn"
              type="button"
              disabled={!canEncrypt}
              onClick={onEncrypt}
              title={!canEncrypt ? "Оберіть звичайний файл і дочекайтесь коду" : "Шифрувати"}
            >
              Шифрувати
            </button>

            <button
              className="mp-btn mp-btnSecondary"
              type="button"
              disabled={!canDecrypt}
              onClick={onDecrypt}
              title={!canDecrypt ? "Оберіть .cfs/.xor і вставте код" : "Дешифрувати"}
            >
              Дешифрувати
            </button>
          </div>

          <div className="mp-sectionTitle">Історія</div>
          <div className="mp-history">
            {log.map((x) => (
              <div key={x.id} className="mp-historyRow">
                <div className="mp-historyTime">
                  {new Date(x.at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}
                </div>
                <div className="mp-historyText">{x.text}</div>
              </div>
            ))}
          </div>
        </section>

        <InfoSidebar />
      </div>
    </main>
  );
}
