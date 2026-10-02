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
      <div class="backup-warning"><strong>복원하면 현재 건강수첩 데이터가 파일 내용으로 대체됩니다.</strong><br>파일 검증 후 확인창에서 승인해야 저장됩니다. PIN과 보호자 프로필 정보는 백업 파일에 포함되지 않으며 복원 후에도 유지됩니다.</div>
      <p id="backup-status" class="backup-status" role="status" aria-live="polite">백업 파일에는 가족 건강정보가 포함됩니다. 안전한 개인 기기에 보관해 주세요.</p>
      <div class="backup-actions">
        <button id="download-backup-button" class="backup-button backup-secondary" type="button">일반 JSON 백업 다운로드</button>
        <button id="encrypted-export-toggle" class="backup-button backup-primary" type="button" aria-expanded="false" aria-controls="encrypted-export-panel">비밀번호 보호 백업 만들기</button>
        <button id="restore-backup-button" class="backup-button backup-secondary" type="button">JSON 백업 파일 복원</button>
        <input id="backup-file-input" type="file" accept=".json,application/json" hidden>
      </div>
      <section id="encrypted-export-panel" class="backup-password-panel" hidden>
        <h3>암호화된 백업 만들기</h3>
        <p>12자 이상의 백업 비밀번호를 정하세요. 비밀번호는 저장하지 않습니다. 잊으면 이 파일을 복원할 수 없습니다.</p>
        <form id="encrypted-export-form" class="backup-password-form">
          <label for="encrypted-export-password">백업 비밀번호</label>
          <input id="encrypted-export-password" type="password" minlength="12" maxlength="1024" autocomplete="new-password" required>
          <label for="encrypted-export-confirm">비밀번호 확인</label>
          <input id="encrypted-export-confirm" type="password" minlength="12" maxlength="1024" autocomplete="new-password" required>
          <div class="backup-password-actions">
            <button class="backup-button backup-primary" type="submit">암호화 파일 다운로드</button>
            <button id="encrypted-export-cancel" class="backup-button backup-tertiary" type="button">취소</button>
          </div>
        </form>
      </section>
      <section id="encrypted-restore-panel" class="backup-password-panel" hidden>
        <h3>암호화 백업 복원</h3>
        <p>이 백업 파일을 만들 때 사용한 비밀번호를 입력하세요.</p>
        <form id="encrypted-restore-form" class="backup-password-form">
          <label for="encrypted-restore-password">백업 비밀번호</label>
          <input id="encrypted-restore-password" type="password" maxlength="1024" autocomplete="current-password" required>
          <div class="backup-password-actions">
            <button class="backup-button backup-primary" type="submit">비밀번호 확인 후 복원 진행</button>
            <button id="encrypted-restore-cancel" class="backup-button backup-tertiary" type="button">취소</button>
          </div>
        </form>
      </section>
      <p class="backup-footnote">일반 JSON 파일은 암호화되지 않습니다. 암호화 백업은 파일 내용을 보호하지만, 비밀번호를 잊으면 복원할 수 없습니다. 두 파일 모두 안전한 개인 저장 공간에 보관하세요.</p>
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
