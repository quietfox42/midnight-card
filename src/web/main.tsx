import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// 只引入基础 token + 实际用到的配色，而不是包含全部 30 种配色的 styles.css
import '@radix-ui/themes/tokens/base.css';
import '@radix-ui/themes/tokens/colors/slate.css';
import '@radix-ui/themes/tokens/colors/indigo.css';
import '@radix-ui/themes/tokens/colors/amber.css';
import '@radix-ui/themes/tokens/colors/grass.css';
import '@radix-ui/themes/tokens/colors/red.css';
import '@radix-ui/themes/components.css';
import '@radix-ui/themes/utilities.css';
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
