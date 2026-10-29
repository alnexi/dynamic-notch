import { ActiveTask, ContrastMode, ExpansionMode } from "../types/tasks";
import { Clock } from "./Clock";
import { TaskIcon } from "./TaskIcon";
import { MediaIsland, MediaMeasuredDimensionsPayload } from "./MediaIsland";

interface SmartCapsuleProps {
  activeTasks: ActiveTask[];
  contrastMode: ContrastMode;
  expansionMode?: ExpansionMode;
  onMediaClick?: (e: React.MouseEvent) => void;
  onMediaDimensionsChange?: (dims: MediaMeasuredDimensionsPayload) => void;
}

export function SmartCapsule({
  activeTasks,
  contrastMode,
  expansionMode = "none",
  onMediaClick,
  onMediaDimensionsChange,
}: SmartCapsuleProps) {
  const mediaTask = activeTasks.find((t) => t.kind === "media");
  const leftTasks = activeTasks.filter((t) => t.slot === "left");
  const rightTasks = activeTasks.filter((t) => t.slot === "right");

  // Render the dedicated Dynamic Media Island when expanded in media mode
  if (expansionMode === "media" && mediaTask) {
    return (
      <MediaIsland
        mediaTask={mediaTask}
        rightTasks={rightTasks}
        contrastMode={contrastMode}
        onDimensionsChange={onMediaDimensionsChange}
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
