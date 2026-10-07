import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'preact/hooks';
import type { CSSProperties, Ref } from 'preact';
import { NfcIcon } from '../Icons';
import { memo } from '../../lib/memo';
import { EASE, haptic, play, useReducedMotion } from '../../lib/motion';
import { BRAND, T } from '../../lib/text';
import { useTilt, type TiltTargets } from './useTilt';

/** 由 App 触发的卡片动效 */
export interface CardFx {
  /** 复制成功：轻按 + 边缘脉冲 + 高光扫过 */
  pulse(): void;
  /** 收到新邮件：卡槽亮起，卡片微微上抬，芯片闪光 */
  deliver(): void;
  /** 下拉刷新松手：卡片点一下头 */
  nod(): void;
}

interface Props {
  prefix: string | null;
  domain: string | null;
  hours: number;
  onCopy: () => void;
  /** 卡片是否还在屏幕里（操作条据此显示迷你地址） */
  onVisible?: (visible: boolean) => void;
  ref?: Ref<CardFx>;
}

const FLIP_MS = 860;

/**
 * 午夜黑卡。图层从外到内：
 * stage(透视) → intro(开卡入场) → tilt(倾斜，JS 每帧写) → press(按压/上抬) → flip(换地址翻面) → 正反两面
 * 每层只负责一种 transform，互不覆盖。
 *
 * 正面的材质（从下到上）：石墨渐变底 → 拉丝纹 → 环境慢扫高光（CSS）→ 跟随倾斜的镜面高光带 →
 * 光斑 → 全息箔边 → 斜切边高光。只有高光层在动，且只动 transform。
 */
export const MidnightCard = memo(function MidnightCard({ prefix, domain, hours, onCopy, onVisible, ref }: Props) {
  const reduced = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLSpanElement>(null);
  const specRef = useRef<HTMLSpanElement>(null);
  const foilRef = useRef<HTMLSpanElement>(null);
  const shadowRef = useRef<HTMLSpanElement>(null);
  const sheenRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const glintRef = useRef<HTMLSpanElement>(null);
  const slotRef = useRef<HTMLSpanElement>(null);

  // 卡面上显示的前缀：换地址时等卡片翻到背面才切换
  const [shown, setShown] = useState(prefix);
  const shownRef = useRef(prefix);
  const show = (p: string | null) => {
    shownRef.current = p;
    setShown(p);
  };
  const [booted, setBooted] = useState(false);
  const [flipping, setFlipping] = useState(false);

  const targets = useMemo<TiltTargets>(
    () => ({ stage: stageRef, tilt: tiltRef, glare: glareRef, spec: specRef, foil: foilRef, shadow: shadowRef }),
    [],
  );
  const requestGyro = useTilt(targets, !reduced, onVisible);

  useEffect(() => {
    const from = shownRef.current;
    if (prefix === from) return;
    const el = flipRef.current;
    if (from == null || prefix == null || reduced || !el) {
      show(prefix); // 减少动态时由 CSS 做一次淡入
      return;
    }
    haptic([8, 60, 14]);
    setFlipping(true);
    const anim = el.animate(
      [
        { transform: 'translate3d(0,0,0) rotateY(0deg) scale(1)', easing: EASE.in },
        { transform: 'translate3d(0,-10px,0) rotateY(180deg) scale(0.92)', offset: 0.5, easing: EASE.spring },
        { transform: 'translate3d(0,0,0) rotateY(360deg) scale(1)' },
      ],
      { duration: FLIP_MS },
    );
    anim.onfinish = () => setFlipping(false);
    const timer = window.setTimeout(() => show(prefix), FLIP_MS / 2);
    return () => {
      window.clearTimeout(timer);
      anim.cancel();
      setFlipping(false);
    };
  }, [prefix, reduced]);

  useImperativeHandle(
    ref ?? null,
    () => ({
      pulse() {
        play(ringRef.current, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], {
          duration: reduced ? 500 : 900,
          easing: 'ease-out',
        });
        if (reduced) return;
        play(pressRef.current, [{ transform: 'scale(1)' }, { transform: 'scale(0.965)', offset: 0.22 }, { transform: 'scale(1)' }], {
          duration: 520,
          easing: EASE.out,
        });
        play(
          sheenRef.current,
          [
            { opacity: 0, transform: 'translate3d(-70%,0,0)' },
            { opacity: 1, offset: 0.25 },
            { opacity: 0, transform: 'translate3d(70%,0,0)' },
          ],
          { duration: 780, easing: EASE.out },
        );
      },
      deliver() {
        if (reduced) {
          play(slotRef.current, [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 700 });
          return;
        }
        play(
          slotRef.current,
          [
            { opacity: 0, transform: 'scaleX(0.2)' },
            { opacity: 1, transform: 'scaleX(1)', offset: 0.3 },
            { opacity: 0, transform: 'scaleX(1)' },
          ],
          { duration: 1400, easing: EASE.out },
        );
        play(pressRef.current, [{ transform: 'none' }, { transform: 'translate3d(0,-8px,0)', offset: 0.35 }, { transform: 'none' }], {
          duration: 820,
          easing: EASE.out,
        });
        play(glintRef.current, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 900, delay: 120 });
      },
      nod() {
        if (reduced) return;
        play(pressRef.current, [{ transform: 'none' }, { transform: 'rotateX(10deg)', offset: 0.3 }, { transform: 'none' }], {
          duration: 640,
          easing: EASE.out,
        });
      },
    }),
    [reduced],
  );

  const ready = shown && domain;
  // 首次出现的地址等开卡动画落定后再逐字浮现
  const addrStyle = {
    '--d': booted || reduced ? '0ms' : '560ms',
    '--len': Math.max(8, shown?.length ?? 8),
  } as CSSProperties;

  return (
    <div className="card-stage" ref={stageRef} onPointerDown={requestGyro}>
      <div
        className={`card-intro${reduced ? '' : ' is-animated'}${booted ? ' is-booted' : ''}`}
        onAnimationEnd={(e) => e.animationName === 'card-open' && setBooted(true)}
      >
        <span className="card-shadow" ref={shadowRef} aria-hidden="true" />
        <div className="card-tilt" ref={tiltRef}>
          <div className={`card-press${flipping ? ' is-flipping' : ''}`} ref={pressRef}>
            <span className="card-edge" aria-hidden="true" />
            <div className="card-flip" ref={flipRef}>
              <div className="card-face card-front">
                <span className="face-brush" aria-hidden="true" />
                <span className="face-drift" aria-hidden="true">
                  <span className="face-spec" ref={specRef} />
                </span>
                <span className="face-glare" ref={glareRef} aria-hidden="true" />
                <span className="face-foil" aria-hidden="true">
                  <span className="foil-spin" ref={foilRef} />
                </span>
                <span className="card-sheen" ref={sheenRef} aria-hidden="true" />
                <span className="card-ring" ref={ringRef} aria-hidden="true" />

                <div className="card-top">
                  <span className="chip" aria-hidden="true">
                    <span className="chip-glint" ref={glintRef} />
                  </span>
                  <NfcIcon />
                  <span className="card-brand">
                    <span className="card-brand-name">{BRAND}</span>
                    <span className="card-brand-tag" aria-hidden="true">
                      {T.cardTag}
                    </span>
                  </span>
                </div>

                <div className="card-number">
                  <span className="card-label" id="address-label">
                    {T.addressLabel}
                  </span>
                  {ready ? (
                    <button
                      type="button"
                      className="card-address"
                      aria-describedby="address-label"
                      aria-label={`${T.copyAddress} ${shown}@${domain}`}
                      onClick={onCopy}
                    >
                      <span className="addr" key={shown} style={addrStyle} aria-hidden="true">
                        <span className="addr-prefix">
                          {Array.from(shown).map((c, i) => (
                            <span className="ch" key={i} style={{ '--i': i } as CSSProperties}>
                              {c}
                            </span>
                          ))}
                        </span>
                        <span className="addr-domain">@{domain}</span>
                      </span>
                    </button>
                  ) : (
                    <span className="card-address is-placeholder" aria-busy="true">
                      <span className="skeleton-bar" style={{ width: '64%', height: '22px' }} />
                      <span className="skeleton-bar" style={{ width: '36%', marginTop: '10px' }} />
                      <span className="visually-hidden">{T.addressPlaceholder}</span>
                    </span>
                  )}
                </div>

                <div className="card-foot">
                  <span>{T.cardFoot(hours)}</span>
                  <span className="card-moon" aria-hidden="true" />
                </div>
              </div>

              <div className="card-face card-back" aria-hidden="true">
                <span className="face-brush" />
                <span className="back-stripe" />
                <span className="back-sign">
                  <span className="back-sign-strip" />
                  <span className="back-holo" />
                </span>
                <span className="back-text">{T.issuing}</span>
                <span className="back-brand">{BRAND}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <span className="card-slot" ref={slotRef} aria-hidden="true" />
    </div>
  );
});
