// 内联图标：不引入图标库，不加载外部资源
import type { SVGAttributes } from 'preact';

const base: SVGAttributes<SVGSVGElement> = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
};

export const CopyIcon = () => (
  <svg {...base}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
  </svg>
);

export const RenewIcon = () => (
  <svg {...base}>
    <path d="M19.5 12a7.5 7.5 0 0 1-13.2 4.9" />
    <path d="M4.5 12a7.5 7.5 0 0 1 13.2-4.9" />
    <path d="M18 3.5v4h-4" />
    <path d="M6 20.5v-4h4" />
  </svg>
);

export const EditIcon = () => (
  <svg {...base}>
    <path d="M4.5 19.5h4l10-10a2.83 2.83 0 0 0-4-4l-10 10v4Z" />
    <path d="m13 7 4 4" />
  </svg>
);

export const BackIcon = () => (
  <svg {...base}>
    <path d="M15 5 8 12l7 7" />
  </svg>
);

export const LinkIcon = () => (
  <svg {...base} width={16} height={16}>
    <path d="M14 4.5h5.5V10" />
    <path d="M19.5 4.5 11 13" />
    <path d="M18 14v4a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18V7.5A1.5 1.5 0 0 1 5.5 6H10" />
  </svg>
);

export const CheckIcon = () => (
  <svg {...base} width={16} height={16}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const RefreshIcon = () => (
  <svg {...base} width={18} height={18}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 4.5v4h-4" />
  </svg>
);

export const MailIcon = () => (
  <svg {...base} width={28} height={28} strokeWidth={1.2}>
    <rect x="3.5" y="6" width="17" height="12" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </svg>
);

export const NfcIcon = () => (
  <svg {...base} className="card-nfc" strokeWidth={1.5}>
    <path d="M8 8.5a5 5 0 0 1 0 7" />
    <path d="M11.5 6a8.5 8.5 0 0 1 0 12" />
    <path d="M15 3.5a12 12 0 0 1 0 17" />
  </svg>
);

export const ArrowUpIcon = () => (
  <svg {...base} width={16} height={16} strokeWidth={1.8}>
    <path d="M12 19V5" />
    <path d="m6 11 6-6 6 6" />
  </svg>
);
