import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function readProjectFile(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(`../${relativePath}`, import.meta.url)),
    "utf8"
  );
}

const panel = readProjectFile(
  "src/villa-map/react/ObservatoryQualityPanel.jsx"
);
const styles = readProjectFile(
  "src/villa-map/react/ObservatoryQualityPanel.css"
);

test("the player quality panel has a controlled five-choice props contract", () => {
  assert.match(
    panel,
    /export function ObservatoryQualityPanel\(\{\s*open,\s*preference,\s*activeQuality,\s*maximumQuality,\s*onSelect,\s*onClose\s*\}\)/
  );
  assert.match(panel, /if \(!open\) return null;/);
  assert.match(
    panel,
    /"auto" \| "high" \| "medium" \| "low" \| "minimum"/
  );
  assert.match(panel, /onClick=\{\(\) => onSelect\(option\.id\)\}/);

  for (const [id, label] of [
    ["auto", "Auto"],
    ["high", "High"],
    ["medium", "Medium"],
    ["low", "Low"],
    ["minimum", "Minimum"]
  ]) {
    assert.match(panel, new RegExp(`id: "${id}"[\\s\\S]*?label: "${label}"`));
  }

  assert.doesNotMatch(panel, /localStorage|sessionStorage/);
  assert.doesNotMatch(panel, /addEventListener|removeEventListener/);
});

test("the rendered copy explains Auto and reports actual and maximum tiers", () => {
  assert.match(panel, />观星台画质</);
  assert.match(panel, /Auto 会在画质与流畅度之间自动寻找平衡/);
  assert.match(panel, /推荐：根据设备能力和实时帧率自动调整/);
  assert.match(panel, /当前实际档位/);
  assert.match(panel, /设备建议上限/);
  assert.match(panel, /displayQuality\(activeQuality\)/);
  assert.match(panel, /displayQuality\(maximumQuality\)/);
  assert.match(panel, /当前正在运行/);
  assert.match(panel, /手动锁定 High 可能降低帧率/);
});

test("the dialog is labelled, keyboard-closeable and visibly focusable", () => {
  assert.match(panel, /role="dialog"/);
  assert.match(panel, /aria-modal="true"/);
  assert.match(panel, /aria-labelledby=\{titleId\}/);
  assert.match(panel, /aria-describedby=\{descriptionId\}/);
  assert.match(panel, /role="group"[\s\S]*?aria-label="选择观星台画质"/);
  assert.match(panel, /aria-pressed=\{selected\}/);
  assert.match(panel, /aria-live="polite"/);
  assert.match(panel, /aria-label="关闭画质设置"[\s\S]*?onClick=\{onClose\}[\s\S]*?autoFocus/);
  assert.match(
    panel,
    /if \(event\.key !== "Escape"\) return;[\s\S]*?event\.preventDefault\(\);[\s\S]*?event\.stopPropagation\(\);[\s\S]*?onClose\(\);/
  );
  assert.match(panel, /onKeyDown=\{handleKeyDown\}/);
  assert.match(
    styles,
    /\.observatory-quality-panel__close:focus-visible,[\s\S]*?\.observatory-quality-panel__option:focus-visible[\s\S]*?outline:/
  );
});

