import { useMemo, useState } from "react";

type Item = {
  id: string;
  title: string;
  body: string;
};

export default function InfoSidebar() {
  const items = useMemo<Item[]>(
    () => [
      {
        id: "about",
        title: "Що це за система",
        body:
          "Вебсистема призначена для шифрування та дешифрування файлів. " +
          "Ключ формується на основі ключової фрази користувача для вибраного методу.",
      },
      {
        id: "key",
        title: "Ключова фраза та ключ",
        body:
          "Користувач вводить ключову фразу. На її основі формується криптографічний ключ (внутрішньо), " +
          "який використовується алгоритмом шифрування. Ключова фраза не зберігається.",
      },
      {
        id: "methods",
        title: "Методи шифрування",
        body:
          "AES-256-GCM — сучасний рекомендований режим (конфіденційність + цілісність). " +
          "XOR (demo) — демонстраційний режим для порівняння, не рекомендований для реального захисту.",
      },
      {
        id: "limits",
        title: "Обмеження вебсередовища",
        body:
          "Система працює лише з файлами, які користувач завантажує вручну у браузері. " +
          "Прямого доступу до дисків/розділів ОС та їх шифрування в браузері немає.",
      },
      {
        id: "format",
        title: "Результат шифрування",
        body:
          "Результатом є зашифрований файл (контейнер). Він може містити технічні параметри " +
          "для коректної дешифрації (версія формату, службові дані), але не містить ключову фразу.",
      },
    ],
    []
  );

  // НІЧОГО не відкриваємо при старті
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <aside className="mp-sidebar">
      <div className="mp-sidebarTitle">Інформація</div>

      <div className="mp-acc">
        {items.map((it) => {
          const isOpen = openId === it.id;
          return (
            <div key={it.id} className={`mp-accItem ${isOpen ? "isOpen" : ""}`}>
              <button
                type="button"
                className="mp-accHead"
                onClick={() => setOpenId(isOpen ? null : it.id)}
                aria-expanded={isOpen}
              >
                <span>{it.title}</span>
                <span className="mp-accChevron">{isOpen ? "–" : "+"}</span>
              </button>

              {isOpen && <div className="mp-accBody">{it.body}</div>}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
