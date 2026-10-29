import { ActiveTask, ContrastMode, ExpansionMode } from "../types/tasks";
import { Clock } from "./Clock";
import { TaskIcon } from "./TaskIcon";
import { MediaIsland, MediaMeasuredDimensionsPayload } from "./MediaIsland";
import { MusicPlayerPanel } from "./MusicPlayerPanel";

interface SmartCapsuleProps {
  activeTasks: ActiveTask[];
  contrastMode: ContrastMode;
  expansionMode?: ExpansionMode;
  onMediaClick?: (e: React.MouseEvent) => void;
  onMediaDimensionsChange?: (dims: MediaMeasuredDimensionsPayload) => void;
  isPlayerPanelOpen?: boolean;
  onBackToBanner?: () => void;
  isDeviceMenuOpen?: boolean;
  setIsDeviceMenuOpen?: (open: boolean | ((prev: boolean) => boolean)) => void;
  onDeviceCountChange?: (count: number) => void;
  onExpandToPlayerPanel?: () => void;
}

export function SmartCapsule({
  activeTasks,
  contrastMode,
  expansionMode = "none",
  onMediaClick,
  onMediaDimensionsChange,
  isPlayerPanelOpen = false,
  onBackToBanner,
  isDeviceMenuOpen = false,
  setIsDeviceMenuOpen,
  onDeviceCountChange,
  onExpandToPlayerPanel,
}: SmartCapsuleProps) {
  const mediaTask = activeTasks.find((t) => t.kind === "media");
  const leftTasks = activeTasks.filter((t) => t.slot === "left");
  const rightTasks = activeTasks.filter((t) => t.slot === "right");

  // Render dedicated Dynamic Media Island or Full Music Player Panel when in media mode
  if (expansionMode === "media" && mediaTask) {
    if (isPlayerPanelOpen) {
      return (
        <MusicPlayerPanel
          mediaTask={mediaTask}
          contrastMode={contrastMode}
          onBackToBanner={onBackToBanner || (() => {})}
          isDeviceMenuOpen={isDeviceMenuOpen}
          setIsDeviceMenuOpen={setIsDeviceMenuOpen || (() => {})}
          onDeviceCountChange={onDeviceCountChange}
        />
      );
    }

    return (
      <MediaIsland
        mediaTask={mediaTask}
        rightTasks={rightTasks}
        contrastMode={contrastMode}
        onDimensionsChange={onMediaDimensionsChange}
        onBannerClick={onExpandToPlayerPanel}
      />
    );
  }

  return (
    <div className={`capsule-smart-layout contrast-${contrastMode}`}>
      {/* Left Slot: Primary indicators such as media playback cover/icon */}
      <div className="capsule-slot slot-left">
        {leftTasks.map((task) => (
          <TaskIcon
            key={task.id}
            task={task}
            onClick={task.kind === "media" ? onMediaClick : undefined}
          />
        ))}
      </div>

      {/* Center Slot: Clock is strictly centered horizontally */}
      <div className="capsule-slot slot-center">
        <Clock />
      </div>

      {/* Right Slot: Timers, alarms, and system tasks */}
      <div className="capsule-slot slot-right">
        {rightTasks.map((task) => (
          <TaskIcon key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}
