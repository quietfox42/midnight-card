import { useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type Ref } from 'react';
import { NfcIcon } from '../Icons';
import { EASE, play, useReducedMotion } from '../../lib/motion';
import { BRAND, T } from '../../lib/text';
import { useTilt } from './useTilt';

/** 由 App 触发的卡片动效 */
export interface CardFx {
  /** 复制成功：轻按 + 边缘脉冲 + 高光扫过 */
  pulse(): void;
  /** 收到新邮件：卡槽亮起，卡片微微上抬 */
  deliver(): void;
}

interface Props {
  prefix: string | null;
  domain: string | null;
  hours: number;
  onCopy: () => void;
  ref?: Ref<CardFx>;
}

const FLIP_MS = 900;

/**
 * 午夜黑卡。图层从外到内：
 * stage(透视) → intro(开卡入场) → tilt(指针/陀螺仪倾斜) → press(按压/上抬) → flip(换地址翻面) → 正反两面
 * 每层只负责一种 transform，互不覆盖。
 */
export function MidnightCard({ prefix, domain, hours, onCopy, ref }: Props) {
  const reduced = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLSpanElement>(null);
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

  const requestGyro = useTilt({ stage: stageRef, tilt: tiltRef, glare: glareRef, shadow: shadowRef }, !reduced);

  useEffect(() => {
    const from = shownRef.current;
    if (prefix === from) return;
    const el = flipRef.current;
    if (from == null || prefix == null || reduced || !el) {
      show(prefix); // 减少动态时由 CSS 做一次淡入
      return;
    }
    const anim = el.animate(
      [
        { transform: 'rotateY(0deg) scale(1)', easing: EASE.in },
        { transform: 'rotateY(180deg) scale(0.94)', offset: 0.5, easing: EASE.spring },
        { transform: 'rotateY(360deg) scale(1)' },
      ],
      { duration: FLIP_MS },
    );
    const timer = window.setTimeout(() => show(prefix), FLIP_MS / 2);
    return () => {
      window.clearTimeout(timer);
      anim.cancel();
    };
  }, [prefix, reduced]);

  useImperativeHandle(
    ref,
    () => ({
      pulse() {
        play(ringRef.current, [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], {
          duration: reduced ? 500 : 900,
          easing: 'ease-out',
        });
        if (reduced) return;
        play(pressRef.current, [{ transform: 'scale(1)' }, { transform: 'scale(0.965)', offset: 0.28 }, { transform: 'scale(1)' }], {
          duration: 460,
          easing: EASE.out,
        });
        play(
          sheenRef.current,
          [
            { opacity: 0, transform: 'translateX(-75%)' },
            { opacity: 1, offset: 0.3 },
            { opacity: 0, transform: 'translateX(75%)' },
          ],
          { duration: 820, easing: EASE.out },
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
        play(pressRef.current, [{ transform: 'none' }, { transform: 'translateY(-6px)', offset: 0.35 }, { transform: 'none' }], {
          duration: 760,
          easing: EASE.out,
        });
        play(glintRef.current, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 900, delay: 120 });
      },
    }),
    [reduced],
  );

  const ready = shown && domain;
  // 首次出现的地址等开卡动画落定后再逐字浮现
  const addrStyle = { '--d': booted || reduced ? '0ms' : '620ms' } as CSSProperties;

  return (
    <div className="card-stage" ref={stageRef} onPointerDown={requestGyro}>
      <div
        className={`card-intro${reduced ? '' : ' is-animated'}`}
        onAnimationEnd={(e) => e.animationName === 'card-open' && setBooted(true)}
      >
        <span className="card-shadow" ref={shadowRef} aria-hidden="true" />
        <div className="card-tilt" ref={tiltRef}>
          <div className="card-press" ref={pressRef}>
            <div className="card-flip" ref={flipRef}>
              <div className="card-face card-front">
                <span className="card-glare" ref={glareRef} aria-hidden="true" />
                <span className="card-sheen" ref={sheenRef} aria-hidden="true" />
                <span className="card-ring" ref={ringRef} aria-hidden="true" />

                <div className="card-top">
                  <span className="chip" aria-hidden="true">
                    <span className="chip-glint" ref={glintRef} />
                  </span>
                  <NfcIcon />
                  <span className="card-brand">{BRAND}</span>
                </div>

                <div className="card-number">
                  <span className="card-label" id="address-label">
                    {T.addressLabel}
                  </span>
                  {ready ? (
                    <button type="button" className="card-address" aria-describedby="address-label" onClick={onCopy}>
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
                      <span className="visually-hidden">
                        {shown}@{domain}
                      </span>
                    </button>
                  ) : (
                    <span className="card-address is-placeholder" aria-busy="true">
                      <span className="skeleton-bar" style={{ width: '72%' }} />
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
}
