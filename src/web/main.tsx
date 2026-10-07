import { render } from 'preact';
import './styles/tokens.css';
import './styles/base.css';
import './styles/card.css';
import './styles/dock.css';
import './styles/inbox.css';
import './styles/detail.css';
import './styles/sheet.css';
import './styles/toast.css';
import { App } from './App';
import { perfTier } from './lib/motion';

perfTier(); // 先写好 <html data-perf>，首帧 CSS 就能按档位降级

render(<App />, document.getElementById('root')!);
