import { ActiveTask, ContrastMode } from "../types/tasks";
import { Clock } from "./Clock";
import { TaskIcon } from "./TaskIcon";

interface SmartCapsuleProps {
  activeTasks: ActiveTask[];
  contrastMode: ContrastMode;
}

export function SmartCapsule({ activeTasks, contrastMode }: SmartCapsuleProps) {
  const leftTasks = activeTasks.filter((t) => t.slot === "left");
  const rightTasks = activeTasks.filter((t) => t.slot === "right");

  return (
    <div className={`capsule-smart-layout contrast-${contrastMode}`}>
      {/* Left Slot: Primary indicators such as media playback cover/icon */}
      <div className="capsule-slot slot-left">
        {leftTasks.map((task) => (
          <TaskIcon key={task.id} task={task} />
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
