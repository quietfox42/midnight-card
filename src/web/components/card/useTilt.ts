import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { load, save } from '../../lib/storage';

const MAX_DEG = 10; // 最大倾斜角
const PRESS_GAIN = 0.55; // 手指按住时，按下的那一点下沉多少（相对满幅）
const DRAG_RANGE = 140; // 横向拖动多少 px 算满幅
const SCROLL_RANGE = 280; // 页面滚动多少 px 时卡片仰到最大
const SCROLL_DEG = 9;
const GYRO_RANGE = 22; // 手机相对“平时握持姿势”偏转多少度算满幅
const BASE_DRIFT = 0.006; // 基准姿势缓慢跟随，握持角度变了也会自动回正
// 弹簧参数：略欠阻尼，松手回正时有一点点回弹
const STIFFNESS = 0.11;
const DAMPING = 0.74;
const VISIBLE_RATIO = 0.35; // 卡片露出不足这个比例就算离屏
const GYRO_KEY = 'mc.gyro';
const COARSE = '(hover: none) and (pointer: coarse)';

export interface TiltTargets {
  stage: RefObject<HTMLElement | null>;
  tilt: RefObject<HTMLElement | null>;
  glare: RefObject<HTMLElement | null>;
  spec: RefObject<HTMLElement | null>;
  foil: RefObject<HTMLElement | null>;
  shadow: RefObject<HTMLElement | null>;
}

type PermissionRequest = () => Promise<string>;

/** iOS 13+ 需要在用户手势里申请陀螺仪权限，其它平台没有这个方法 */
function permissionRequest(): PermissionRequest | undefined {
  const ctor = (globalThis as { DeviceOrientationEvent?: { requestPermission?: PermissionRequest } }).DeviceOrientationEvent;
  return ctor?.requestPermission?.bind(ctor);
}

const clamp = (v: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));

/**
 * 卡片 3D 倾斜与光泽。输入来源（可叠加）：
 * - 鼠标悬停：指针所在处下沉；
 * - 手指按住：按下的那一点下沉，横向拖动时跟手转动（纵向交给页面滚动）；
 * - 陀螺仪：Android 直接开启，iOS 在第一次点卡片时申请；
 * - 页面滚动：卡片滑走时向后仰，高光随之移动——没有陀螺仪的手机也“活”着。
 * 每帧直接写 transform，不经过 React；静止或离屏后停掉 rAF。
 * 返回 requestGyro：在用户点击卡片时调用，用于 iOS 申请权限。
 */
export function useTilt(targets: TiltTargets, enabled: boolean, onVisible?: (visible: boolean) => void) {
  const attachGyro = useRef<() => void>(() => {});
  const gyroOn = useRef(false);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  // 离屏检测和倾斜开关无关：减少动态效果时操作条也需要知道卡片在不在屏幕上
  useEffect(() => {
    const st = targets.stage.current;
    if (!st) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        // 只剩一小条时地址已经看不清，算作离屏
        const visible = entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO;
        st.classList.toggle('is-offscreen', !visible);
        onVisibleRef.current?.(visible);
        st.dispatchEvent(new CustomEvent('mc:visible', { detail: visible }));
      },
      { threshold: [0, VISIBLE_RATIO] },
    );
    io.observe(st);
    return () => io.disconnect();
  }, [targets.stage]);

  useEffect(() => {
    const st = targets.stage.current;
    const t = targets.tilt.current;
    const g = targets.glare.current;
    const sp = targets.spec.current;
    const fo = targets.foil.current;
    const sh = targets.shadow.current;
    if (!enabled || !st || !t) return;

    const cur = { x: 0, y: 0 };
    const vel = { x: 0, y: 0 };
    let hover = { x: 0, y: 0 };
    let touch = { x: 0, y: 0 };
    let gyro = { x: 0, y: 0 };
    let scroll = 0;
    let visible = true;
    let raf = 0;

    const goal = () => ({
      x: clamp(hover.x + touch.x + gyro.x),
      y: clamp(hover.y + touch.y + gyro.y),
    });

    const render = () => {
      raf = 0;
      const gl = goal();
      vel.x = (vel.x + (gl.x - cur.x) * STIFFNESS) * DAMPING;
      vel.y = (vel.y + (gl.y - cur.y) * STIFFNESS) * DAMPING;
      cur.x += vel.x;
      cur.y += vel.y;
      const settled =
        Math.abs(gl.x - cur.x) < 0.001 && Math.abs(gl.y - cur.y) < 0.001 && Math.abs(vel.x) < 0.0005 && Math.abs(vel.y) < 0.0005;
      if (settled) {
        cur.x = gl.x;
        cur.y = gl.y;
        vel.x = vel.y = 0;
      }
      const rx = -cur.y * MAX_DEG + scroll * SCROLL_DEG;
      const ry = cur.x * MAX_DEG;
      t.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      const mag = Math.min(1, Math.hypot(cur.x, cur.y + scroll * 0.6));
      if (g) {
        g.style.transform = `translate3d(${(cur.x * 28).toFixed(2)}%, ${(cur.y * 28 - scroll * 18).toFixed(2)}%, 0)`;
        g.style.opacity = (0.35 + 0.65 * mag).toFixed(3);
      }
      if (sp) sp.style.transform = `translate3d(${(cur.x * 34 + cur.y * 10 + scroll * 30).toFixed(2)}%, 0, 0)`;
      if (fo) fo.style.transform = `rotate(${(cur.x * 70 - cur.y * 40 + scroll * 60).toFixed(1)}deg)`;
      if (sh) sh.style.transform = `translate3d(${(-cur.x * 12).toFixed(1)}px, ${(-cur.y * 6 + scroll * 10).toFixed(1)}px, 0) scaleX(${(1 - scroll * 0.12).toFixed(3)})`;
      if (!settled) raf = requestAnimationFrame(render);
    };
    const kick = () => {
      if (!raf && visible) raf = requestAnimationFrame(render);
    };

    // ---- 鼠标 ----
    const pos = (e: PointerEvent) => {
      const r = st.getBoundingClientRect();
      return { x: clamp(((e.clientX - r.left) / r.width) * 2 - 1), y: clamp(((e.clientY - r.top) / r.height) * 2 - 1) };
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      hover = pos(e);
      kick();
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      hover = { x: 0, y: 0 };
      kick();
    };

    // ---- 手指：按住下沉 + 横向拖动 ----
    let touchId: number | null = null;
    let start = { x: 0, y: 0 };
    let press = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || touchId !== null) return;
      touchId = e.pointerId;
      start = { x: e.clientX, y: e.clientY };
      const p = pos(e);
      press = { x: p.x * PRESS_GAIN, y: p.y * PRESS_GAIN };
      touch = press;
      kick();
    };
    const onTouchMove = (e: PointerEvent) => {
      if (e.pointerId !== touchId) return;
      const dx = (e.clientX - start.x) / DRAG_RANGE;
      touch = { x: clamp(press.x + dx), y: press.y };
      kick();
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== touchId) return;
      touchId = null;
      touch = { x: 0, y: 0 };
      kick();
    };

    // ---- 陀螺仪 ----
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
      gyro = { x: clamp((x - base.x) / GYRO_RANGE), y: clamp((y - base.y) / GYRO_RANGE) };
      kick();
    };

    // ---- 滚动 ----
    const onScroll = () => {
      const s = clamp(window.scrollY / SCROLL_RANGE, 0, 1);
      if (Math.abs(s - scroll) < 0.002) return;
      scroll = s;
      kick();
    };

    const onVisibleChange = (e: Event) => {
      visible = (e as CustomEvent<boolean>).detail;
      if (visible) {
        onScroll();
        kick();
      }
    };

    st.addEventListener('pointermove', onMove);
    st.addEventListener('pointerleave', onLeave);
    st.addEventListener('pointerdown', onDown);
    st.addEventListener('mc:visible', onVisibleChange);
    window.addEventListener('pointermove', onTouchMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('scroll', onScroll, { passive: true });
    attachGyro.current = () => {
      if (gyroOn.current) return;
      gyroOn.current = true;
      window.addEventListener('deviceorientation', onOrient);
    };
    // 不需要权限的平台（Android 等）直接开启
    if (window.matchMedia(COARSE).matches && !permissionRequest()) attachGyro.current();
    onScroll();

    return () => {
      st.removeEventListener('pointermove', onMove);
      st.removeEventListener('pointerleave', onLeave);
      st.removeEventListener('pointerdown', onDown);
      st.removeEventListener('mc:visible', onVisibleChange);
      window.removeEventListener('pointermove', onTouchMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('deviceorientation', onOrient);
      gyroOn.current = false;
      attachGyro.current = () => {};
      cancelAnimationFrame(raf);
      for (const el of [t, g, sp, fo, sh]) el?.style.removeProperty('transform');
      g?.style.removeProperty('opacity');
    };
  }, [enabled, targets]);

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
