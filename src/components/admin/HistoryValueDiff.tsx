/**
 * LAB418 — renders one history row's old → new value, collapsed to a single
 * truncated line by default with a "Show more" toggle. Long/multiline values
 * (HTML notes converted to plain text, JSON line_items, …) would otherwise
 * blow up the row — see the Activity page screenshot that flagged this.
 */
import { useState } from "react";
import { fmtValue, isLongValue, truncateValue } from "../../lib/historyFormat";

export default function HistoryValueDiff({
  field,
  oldValue,
  newValue,
  className = "",
}: {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const oldText = fmtValue(field, oldValue);
  const newText = fmtValue(field, newValue);
  const long = isLongValue(oldText) || isLongValue(newText);
  const showFull = expanded || !long;

  return (
    <div className={className}>
      <p className={showFull ? "whitespace-pre-wrap break-words" : "truncate"}>
        <span className="text-gray-400 line-through decoration-gray-300">
          {showFull ? oldText : truncateValue(oldText)}
        </span>
        {" → "}
        <span className="font-medium text-gray-800">
          {showFull ? newText : truncateValue(newText)}
        </span>
      </p>
      {long && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="text-[10px] font-semibold text-gray-400 hover:text-gray-600 mt-0.5"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
