import { useEffect, useState } from "react";

type DevInfo = {
  name: string;
  roleLine: string;
  contactsLine: string;
  detailsLine: string;
};

const DEV_INFO: DevInfo = {
  name: "Про розробника",
  roleLine: "Розробник вебсистеми криптографічного захисту файлів",
  contactsLine: "Telegram: @saniadom",
  detailsLine: "Технології: TypeScript • React • Express • Web Crypto API",
};

export default function AppHeader() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <header className="mp-header">
        <div className="mp-titleBlock">
          <div className="mp-title">
            Розроблення вебсистеми для забезпечення криптографічної безпеки файлів
          </div>
          <div className="mp-subtitle">Дзюбенко Олександр Миколайович Група 5Пі-22б</div>
        </div>

        <button
          className="mp-infoBtn"
          onClick={() => setIsOpen(true)}
          aria-label="Про розробника"
          title="Про розробника"
        >
          i
        </button>
      </header>

      {isOpen && (
        <div
          className="mp-modalOverlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsOpen(false)}
        >
          <div className="mp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mp-modalTop">
              <div className="mp-modalTitle">Про розробника</div>
              <button
                className="mp-closeBtn"
                onClick={() => setIsOpen(false)}
                aria-label="Закрити"
                title="Закрити"
              >
                ×
              </button>
            </div>

            <div className="mp-modalBody">
              <div className="mp-devName">{DEV_INFO.name}</div>
              <div className="mp-devLine">{DEV_INFO.roleLine}</div>
              <div className="mp-devLine">{DEV_INFO.contactsLine}</div>
              <div className="mp-devLine">{DEV_INFO.detailsLine}</div>

              <div className="mp-divider" />

              <div className="mp-devLine" style={{ marginBottom: 10 }}>
                Примітка
              </div>
              <div className="mp-note">
                Система працює у браузері та шифрує лише ті файли, які користувач завантажує вручну.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
