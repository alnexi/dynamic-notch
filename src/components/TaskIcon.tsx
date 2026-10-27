import { ActiveTask } from "../types/tasks";

interface TaskIconProps {
  task: ActiveTask;
}

export function TaskIcon({ task }: TaskIconProps) {
  // 1. Artwork / cover image takes highest precedence
  if (task.icon_base64) {
    return (
      <div className="task-icon-wrapper" title={`${task.title} — ${task.subtitle || ""}`}>
        <img
          src={task.icon_base64}
          alt={task.title}
          className="task-icon-artwork"
          loading="eager"
        />
      </div>
    );
  }

  // 2. Identify application icon or fallback based on kind / name
  const nameLower = (task.icon_name || "").toLowerCase();

  return (
    <div
      className={`task-icon-wrapper task-kind-${task.kind}`}
      title={`${task.title}${task.subtitle ? ` (${task.subtitle})` : ""}`}
    >
      {renderIconSvg(task.kind, nameLower)}
    </div>
  );
}

function renderIconSvg(kind: string, nameLower: string) {
  // App-specific logos where applicable
  if (nameLower.includes("spotify")) {
    return (
      <svg className="task-svg-icon app-spotify" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.625.625 0 01-.86.208c-2.357-1.44-5.324-1.766-8.818-.968a.626.626 0 11-.278-1.22c3.824-.875 7.103-.503 9.748 1.12a.625.625 0 01.208.86zm1.223-2.723a.782.782 0 01-1.077.257c-2.698-1.658-6.81-2.14-9.999-1.171a.782.782 0 11-.453-1.498c3.642-1.106 8.192-.568 11.272 1.335a.783.783 0 01.257 1.077zm.106-2.834C14.686 8.948 9.36 8.77 6.275 9.707a.939.939 0 11-.546-1.797c3.553-1.078 9.444-.867 13.238 1.385a.94.94 0 01-1.052 1.572z" />
      </svg>
    );
  }

  if (nameLower.includes("chrome")) {
    return (
      <svg className="task-svg-icon app-chrome" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 3.6a6.4 6.4 0 015.542 3.2h-5.542a3.2 3.2 0 00-3.09 2.4H5.975A6.4 6.4 0 0112 5.6zm-3.2 6.4a3.2 3.2 0 014.8-2.771l-2.771 4.8A3.187 3.187 0 018.8 12zm3.2 6.4a6.4 6.4 0 01-5.542-3.2h5.542a3.2 3.2 0 003.09-2.4h2.933A6.4 6.4 0 0112 18.4z" />
      </svg>
    );
  }

  // Kind-based fallbacks
  switch (kind) {
    case "media":
      return (
        <svg className="task-svg-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
        </svg>
      );
    case "timer":
      return (
        <svg className="task-svg-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A8.962 8.962 0 0012 4c-4.97 0-9 4.03-9 9s4.02 9 9 9a8.994 8.994 0 007.03-14.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
        </svg>
      );
    case "alarm":
      return (
        <svg className="task-svg-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22 5.72l-4.6-3.86-1.29 1.53 4.6 3.86L22 5.72zM7.88 3.39L6.6 1.86 2 5.71l1.29 1.53 4.59-3.85zM12.5 8H11v6l4.75 2.85.75-1.23-4-2.37V8zM12 4c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19.23 5.77 20.65l.62-.62c1.55 1.23 3.5 1.97 5.61 1.97 4.97 0 9-4.03 9-9s-4.03-9-9-9zm0 16c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
        </svg>
      );
    default:
      return (
        <svg className="task-svg-icon" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="5" />
        </svg>
      );
  }
}
