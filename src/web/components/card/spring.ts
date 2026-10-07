// 卡片倾斜用的二维弹簧。参数按 60fps 一帧标定；按真实帧间隔缩放，120Hz 和 30fps 屏上的手感与 60Hz 一致。

/** 略欠阻尼：松手回正时有一点点回弹 */
export const STIFFNESS = 0.11;
export const DAMPING = 0.74;
const FRAME_MS = 1000 / 60;
/** 掉帧（切后台回来等）时最多按这么长积分，避免一步跳过头 */
const MAX_DT = 64;

export interface Vec {
  x: number;
  y: number;
}

export interface SpringState {
  cur: Vec;
  vel: Vec;
}

/**
 * 推进一步，返回是否已经静止（静止时直接吸附到目标）。
 * k = dt / 16.67：一帧 60fps 时与原来逐帧公式完全相同。
 */
export function stepSpring(s: SpringState, goal: Vec, dtMs: number): boolean {
  const k = Math.min(MAX_DT, Math.max(0, dtMs)) / FRAME_MS;
  const damp = DAMPING ** k;
  s.vel.x = (s.vel.x + (goal.x - s.cur.x) * STIFFNESS * k) * damp;
  s.vel.y = (s.vel.y + (goal.y - s.cur.y) * STIFFNESS * k) * damp;
  s.cur.x += s.vel.x * k;
  s.cur.y += s.vel.y * k;
  const settled =
    Math.abs(goal.x - s.cur.x) < 0.001 &&
    Math.abs(goal.y - s.cur.y) < 0.001 &&
    Math.abs(s.vel.x) < 0.0005 &&
    Math.abs(s.vel.y) < 0.0005;
  if (settled) {
    s.cur.x = goal.x;
    s.cur.y = goal.y;
    s.vel.x = s.vel.y = 0;
  }
  return settled;
}
