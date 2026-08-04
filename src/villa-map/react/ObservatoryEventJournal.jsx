// 天象图鉴 — the wall book's reading view. A modal catalogue of every rare
// celestial event; witnessed entries show their story and first-seen date,
// unwitnessed ones stay as teasing silhouettes. Pure presentation: the
// sighting data lives in localStorage via observatory-event-journal.js and
// is owned by VillaMap.
import {
  OBSERVATORY_RARE_EVENT_IDS,
  OBSERVATORY_RARE_EVENTS
} from "../observatory-events.js";
import {
  countObservatoryEventSightings
} from "../observatory-event-journal.js";

function formatFirstSeen(timestamp) {
  if (!Number.isFinite(timestamp)) return null;
  try {
    return new Date(timestamp).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  } catch {
    return null;
  }
}

export function ObservatoryEventJournal({ journal, onClose }) {
  const seenCount = countObservatoryEventSightings(journal);
  const total = OBSERVATORY_RARE_EVENT_IDS.length;

  return (
    <section
      className="villa-map-journal"
      role="dialog"
      aria-modal="true"
      aria-label="天象图鉴"
    >
      <header className="villa-map-journal-header">
        <h2>天象图鉴</h2>
        <p>
          已收录 {seenCount} / {total} 种稀有天象
          {seenCount === 0 && " —— 关灯观星，静静等待。"}
          {seenCount > 0 && seenCount < total && " —— 夜空还藏着更多惊喜。"}
          {seenCount === total && " —— 这片夜空的全部秘密都属于你了！"}
        </p>
        <button type="button" onClick={onClose} aria-label="合上图鉴">
          合上 (Esc)
        </button>
      </header>
      <ul className="villa-map-journal-grid">
        {OBSERVATORY_RARE_EVENT_IDS.map((id) => {
          const definition = OBSERVATORY_RARE_EVENTS[id];
          const sighting = journal?.sightings?.[id];
          const firstSeen = formatFirstSeen(sighting?.firstSeenAt);
          return (
            <li
              key={id}
              className={
                sighting
                  ? "villa-map-journal-card is-seen"
                  : "villa-map-journal-card"
              }
            >
              <h3>{sighting ? definition.label : "？？？"}</h3>
              {sighting ? (
                <>
                  <p>{definition.journal}</p>
                  <p className="villa-map-journal-meta">
                    目击 {sighting.count} 次
                    {firstSeen && ` · 初见于 ${firstSeen}`}
                  </p>
                </>
              ) : (
                <p>尚未目击。关灯观星时，它可能随时降临。</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
