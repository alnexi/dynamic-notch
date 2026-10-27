export type TaskKind = "media" | "timer" | "alarm" | "custom";
export type TaskSlot = "left" | "right";
export type ContrastMode = "dark-bg" | "light-bg";

export interface ActiveTask {
  id: string;
  kind: TaskKind;
  slot: TaskSlot;
  title: string;
  subtitle?: string;
  icon_base64?: string;
  icon_name: string;
  progress?: number;
  remaining_seconds?: number;
}

export type ProximityLevel = "idle" | "approaching" | "near" | "hovered";

export interface ProximityPayload {
  level: ProximityLevel;
  cursor_x: number;
  cursor_y: number;
  anchor_x: number;
  offset_x: number;
  is_locked: boolean;
  contrast_mode?: ContrastMode;
  active_tasks?: ActiveTask[];
}
