import { useId } from "react";

import "./ObservatoryQualityPanel.css";

const QUALITY_OPTIONS = Object.freeze([
  Object.freeze({
    id: "auto",
    label: "Auto",
    description: "推荐：根据设备能力和实时帧率自动调整。"
  }),
  Object.freeze({
    id: "high",
    label: "High",
    description: "最高星体密度、精细黑洞和体积星云。"
  }),
  Object.freeze({
    id: "medium",
    label: "Medium",
    description: "保留完整特效，并兼顾大多数电脑的流畅度。"
  }),
  Object.freeze({
    id: "low",
    label: "Low",
    description: "减少星体数量并关闭体积渲染，优先保持流畅。"
  }),
  Object.freeze({
    id: "minimum",
    label: "Minimum",
    description: "仅保留基础高清星空，适合性能受限的设备。"
  })
]);

const QUALITY_LABELS = Object.freeze({
  high: "High",
  medium: "Medium",
  low: "Low",
  minimum: "Minimum"
});

function displayQuality(quality) {
  return QUALITY_LABELS[quality] ?? String(quality || "未知");
}

/**
 * @typedef {"auto" | "high" | "medium" | "low" | "minimum"}
 * ObservatoryQualityPreference
 */

/**
 * Controlled player-facing quality dialog. Persistence and runtime quality
 * changes belong to its parent so the panel remains reusable and testable.
 *
 * @param {{
 *   open: boolean,
 *   preference: ObservatoryQualityPreference,
 *   activeQuality: string,
 *   maximumQuality: string,
 *   onSelect: (preference: ObservatoryQualityPreference) => void,
 *   onClose: () => void
 * }} props
 */
export function ObservatoryQualityPanel({
  open,
  preference,
  activeQuality,
  maximumQuality,
  onSelect,
  onClose
}) {
  const titleId = useId();
  const descriptionId = useId();

  if (!open) return null;

  const handleKeyDown = (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  return (
    <div className="observatory-quality-panel" onKeyDown={handleKeyDown}>
      <section
        className="observatory-quality-panel__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="observatory-quality-panel__header">
          <div>
            <p className="observatory-quality-panel__eyebrow">OBSERVATORY DISPLAY</p>
            <h2 id={titleId}>观星台画质</h2>
          </div>
          <button
            className="observatory-quality-panel__close"
            type="button"
            aria-label="关闭画质设置"
            onClick={onClose}
            autoFocus
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <p id={descriptionId} className="observatory-quality-panel__description">
          选择星空、R 模式与黑洞特效的渲染精度。Auto 会在画质与流畅度之间自动寻找平衡。
        </p>

        <div
          className="observatory-quality-panel__choices"
          role="group"
          aria-label="选择观星台画质"
        >
          {QUALITY_OPTIONS.map((option) => {
            const selected = preference === option.id;
            const currentlyActive = activeQuality === option.id;

            return (
              <button
                key={option.id}
                className="observatory-quality-panel__option"
                type="button"
                aria-pressed={selected}
                data-quality-preference={option.id}
                data-active-quality={currentlyActive ? "true" : "false"}
                onClick={() => onSelect(option.id)}
              >
                <span className="observatory-quality-panel__option-label">
                  {option.label}
                  {option.id === "auto" && (
                    <span className="observatory-quality-panel__recommended">推荐</span>
                  )}
                </span>
                <span className="observatory-quality-panel__option-description">
                  {option.description}
                </span>
                {currentlyActive && (
                  <span className="observatory-quality-panel__active-marker">
                    当前正在运行
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <dl className="observatory-quality-panel__status" aria-live="polite">
          <div>
            <dt>当前实际档位</dt>
            <dd>{displayQuality(activeQuality)}</dd>
          </div>
          <div>
            <dt>设备建议上限</dt>
            <dd>{displayQuality(maximumQuality)}</dd>
          </div>
        </dl>

        <p className="observatory-quality-panel__note">
          手动锁定 High 可能降低帧率；遇到 WebGL 资源失败时，安全回退仍会生效。
        </p>
      </section>
    </div>
  );
}

