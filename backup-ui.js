(() => {
  'use strict';

  const shell = document.getElementById('app-shell');
  const topbar = document.querySelector('.topbar-right');
  if (!shell || !topbar) return;

  const openButton = document.createElement('button');
  openButton.id = 'backup-open-button';
  openButton.className = 'backup-open-button';
  openButton.type = 'button';
  openButton.textContent = '백업·복원';
  const lockButton = document.getElementById('lock-app-button');
  topbar.insertBefore(openButton, lockButton || null);

  const dialog = document.createElement('dialog');
  dialog.id = 'backup-dialog';
  dialog.className = 'backup-dialog';
  dialog.setAttribute('aria-labelledby', 'backup-dialog-title');
  dialog.innerHTML = `
    <section class="backup-card">
      <header class="backup-heading">
        <div>
          <p class="backup-kicker">DATA SAFETY</p>
          <h2 id="backup-dialog-title">백업 · 복원</h2>
        </div>
        <button id="backup-close-button" class="backup-close-button" type="button" aria-label="창 닫기">×</button>
      </header>
      <p class="backup-intro">가족 구성원, 건강기록, 병원·복약 일정을 JSON 파일로 저장하거나 복원합니다.</p>
      <div class="backup-warning"><strong>건강정보 파일을 안전하게 보관해 주세요.</strong><br>복원하면 현재 건강수첩 데이터가 파일 내용으로 대체됩니다. 복원 전에 내용을 확인하고, 계속하기 전 확인창에서 승인해야 합니다. PIN 설정은 백업에 포함되지 않으며 복원 후에도 유지됩니다.</div>
      <p id="backup-status" class="backup-status" role="status" aria-live="polite">백업 파일에는 가족 건강정보가 포함됩니다. 안전한 개인 기기에 보관해 주세요.</p>
      <div class="backup-actions">
        <button id="download-backup-button" class="backup-button backup-primary" type="button">JSON 백업 다운로드</button>
        <button id="restore-backup-button" class="backup-button backup-secondary" type="button">JSON 파일 복원</button>
        <input id="backup-file-input" type="file" accept=".json,application/json" hidden>
      </div>
      <p class="backup-footnote">백업 파일은 암호화되지 않습니다. 공유·공용 기기에 저장하지 말고, 필요하지 않을 때는 안전하게 삭제하세요.</p>
    </section>`;
  shell.append(dialog);

  let moduleLoading = false;
  let moduleLoaded = false;
  openButton.addEventListener('click', () => {
    if (moduleLoaded || moduleLoading) return;
    if (typeof dialog.showModal !== 'function') {
      const status = document.getElementById('backup-status');
      status.textContent = '현재 브라우저에서는 이 창을 열 수 없습니다. 최신 브라우저를 이용해 주세요.';
      status.classList.add('is-error');
      return;
    }

    moduleLoading = true;
    openButton.disabled = true;
    const script = document.createElement('script');
    script.src = './backup.js';
    script.onload = () => {
      moduleLoading = false;
      moduleLoaded = true;
      openButton.disabled = false;
      dialog.showModal();
    };
    script.onerror = () => {
      moduleLoading = false;
      openButton.disabled = false;
      const status = document.getElementById('backup-status');
      status.textContent = '백업·복원 기능을 불러오지 못했습니다. backup.js 파일이 있는지 확인해 주세요.';
      status.classList.add('is-error');
      dialog.showModal();
    };
    document.body.append(script);
  });
})();
