import '../styles/global.css';
import { App } from './lifecycle';

const app = new App();
app.start().catch((error) => {
  console.error('[app] failed to start', error);
  document.documentElement.classList.add('boot-failed');
  document.querySelector('.loader')?.remove();
});
