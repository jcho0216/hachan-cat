import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { prepareAppsInToss, startSafeAreaSync } from './appsInToss';
import './fonts.css';
import './styles.css';

async function start() {
  await prepareAppsInToss().catch(() => undefined);
  startSafeAreaSync();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void start();
