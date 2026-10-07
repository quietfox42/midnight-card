import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { load, save } from '../../lib/storage';

const MAX_DEG = 9; // 最大倾斜角
const GYRO_RANGE = 22; // 手机相对“平时握持姿势”偏转多少度算满幅
const BASE_DRIFT = 0.006; // 基准姿势缓慢跟随，握持角度变了也会自动回正
const FOLLOW = 0.14; // 每帧向目标靠近的比例（临界阻尼的近似）
const GYRO_KEY = 'mc.gyro';
const COARSE = '(hover: none) and (pointer: coarse)';

interface Targets {
  stage: RefObject<HTMLElement | null>;
  tilt: RefObject<HTMLElement | null>;
  glare: RefObject<HTMLElement | null>;
  shadow: RefObject<HTMLElement | null>;
}

type PermissionRequest = () => Promise<string>;

/** iOS 13+ 需要在用户手势里申请陀螺仪权限，其它平台没有这个方法 */
function permissionRequest(): PermissionRequest | undefined {
  const ctor = (globalThis as { DeviceOrientationEvent?: { requestPermission?: PermissionRequest } }).DeviceOrientationEvent;
  return ctor?.requestPermission?.bind(ctor);
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/**
 * 卡片 3D 倾斜与光泽跟随。鼠标用 pointermove，手机用 deviceorientation。
 * 每帧直接写 transform，不经过 React 渲染；静止后停掉 rAF。
 * 返回 requestGyro：在用户点击卡片时调用，用于 iOS 申请权限。
 */
export function useTilt({ stage, tilt, glare, shadow }: Targets, enabled: boolean) {
  const attachGyro = useRef<() => void>(() => {});
  const gyroOn = useRef(false);

  useEffect(() => {
    const st = stage.current;
    const t = tilt.current;
    const g = glare.current;
    const s = shadow.current;
    if (!enabled || !st || !t) return;

    const cur = { x: 0, y: 0 };
    let goal = { x: 0, y: 0 };
    let raf = 0;

    const render = () => {
      cur.x += (goal.x - cur.x) * FOLLOW;
      cur.y += (goal.y - cur.y) * FOLLOW;
      const settled = Math.abs(goal.x - cur.x) < 0.001 && Math.abs(goal.y - cur.y) < 0.001;
      if (settled) {
        cur.x = goal.x;
        cur.y = goal.y;
      }
      t.style.transform = `rotateX(${(-cur.y * MAX_DEG).toFixed(2)}deg) rotateY(${(cur.x * MAX_DEG).toFixed(2)}deg)`;
      if (g) {
        g.style.transform = `translate3d(${(cur.x * 26).toFixed(2)}%, ${(cur.y * 26).toFixed(2)}%, 0)`;
        g.style.opacity = (0.4 + 0.6 * Math.min(1, Math.hypot(cur.x, cur.y))).toFixed(3);
      }
      if (s) s.style.transform = `translate3d(${(-cur.x * 10).toFixed(1)}px, ${(-cur.y * 6).toFixed(1)}px, 0)`;
      raf = settled ? 0 : requestAnimationFrame(render);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(render);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return; // 触屏交给陀螺仪，避免和滚动抢手势
      const r = st.getBoundingClientRect();
      goal = {
        x: clamp(((e.clientX - r.left) / r.width) * 2 - 1),
        y: clamp(((e.clientY - r.top) / r.height) * 2 - 1),
      };
      kick();
    };
    const onLeave = () => {
      goal = { x: 0, y: 0 };
      kick();
    };

    let base: { x: number; y: number } | null = null;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      const angle = screen.orientation?.angle ?? 0;
      let x = e.gamma;
      let y = e.beta;
      if (angle === 90) [x, y] = [e.beta, -e.gamma];
      else if (angle === 270 || angle === -90) [x, y] = [-e.beta, e.gamma];
      if (!base) base = { x, y };
      base.x += (x - base.x) * BASE_DRIFT;
      base.y += (y - base.y) * BASE_DRIFT;
      goal = { x: clamp((x - base.x) / GYRO_RANGE), y: clamp((y - base.y) / GYRO_RANGE) };
      kick();
    };

    st.addEventListener('pointermove', onMove);
    st.addEventListener('pointerleave', onLeave);
    attachGyro.current = () => {
      if (gyroOn.current) return;
      gyroOn.current = true;
      window.addEventListener('deviceorientation', onOrient);
    };
    // 不需要权限的平台（Android 等）直接开启
    if (window.matchMedia(COARSE).matches && !permissionRequest()) attachGyro.current();

    return () => {
      st.removeEventListener('pointermove', onMove);
      st.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('deviceorientation', onOrient);
      gyroOn.current = false;
      attachGyro.current = () => {};
      cancelAnimationFrame(raf);
      t.style.transform = '';
      if (g) {
        g.style.transform = '';
        g.style.opacity = '';
      }
      if (s) s.style.transform = '';
    };
  }, [enabled, stage, tilt, glare, shadow]);

  return useCallback(() => {
    const ask = permissionRequest();
    if (!enabled || !ask || gyroOn.current || load(GYRO_KEY) === 'denied') return;
    if (!window.matchMedia(COARSE).matches) return;
    ask().then(
      (result) => {
        if (result === 'granted') attachGyro.current();
        else save(GYRO_KEY, 'denied');
      },
      () => {},
    );
  }, [enabled]);
}
