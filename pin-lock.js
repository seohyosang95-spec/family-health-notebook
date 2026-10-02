(() => {
  'use strict';

  const PIN_STORAGE_KEY = 'dajeong-family-health-pin-v1';
  const GUARDIAN_STORAGE_KEY = 'dajeong-family-health-guardian-v1';
  const HEALTH_STORAGE_KEY = 'dajeong-family-health-v1';
  const PBKDF2_ITERATIONS = 600000;
  const DEFAULT_IDLE_MINUTES = 5;
  const ALLOWED_IDLE_MINUTES = new Set([1, 5, 10, 15]);

  const app = document.getElementById('app-shell');
  const lockButton = document.getElementById('lock-app-button');
  const logoutButton = document.getElementById('logout-app-button');
  const profileButton = document.getElementById('guardian-settings-button');
  const guardianBadge = document.getElementById('guardian-badge');
  const gate = document.createElement('main');
  gate.id = 'pin-gate';
  gate.className = 'pin-gate';
  gate.setAttribute('aria-labelledby', 'pin-title');
  gate.innerHTML = `
    <section class="pin-card">
      <span class="pin-brand-mark" aria-hidden="true">♡</span>
      <p class="pin-eyebrow">다정한 건강수첩 · 이 기기용 보호자 프로필 및 잠금 해제</p>
      <h1 id="pin-title">건강정보 잠금</h1>
      <p id="pin-description" class="pin-description"></p>
      <form id="pin-form" class="pin-form" novalidate>
        <label id="guardian-name-field" class="pin-field" for="guardian-name-input" hidden><span>보호자 이름</span>
          <input id="guardian-name-input" type="text" maxlength="40" autocomplete="name" autocapitalize="off" spellcheck="false" aria-describedby="pin-error">
        </label>
        <label id="pin-field" class="pin-field" for="pin-input"><span id="pin-label">4자리 PIN</span>
          <input id="pin-input" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" minlength="4" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="pin-error" required>
        </label>
        <label id="pin-confirm-field" class="pin-field" for="pin-confirm" hidden><span>PIN 다시 입력</span>
          <input id="pin-confirm" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" minlength="4" autocomplete="off" autocapitalize="off" spellcheck="false">
        </label>
        <p id="pin-error" class="pin-error" role="status" aria-live="polite"></p>
        <button id="pin-submit" class="pin-submit" type="submit">잠금 해제</button>
      </form>
      <button id="forgot-pin-button" class="forgot-pin-button" type="button" hidden>PIN을 잊으셨나요? 데이터 삭제 초기화</button>
      <p class="pin-security-note">보호자 이름은 이 기기에서 프로필을 구분하기 위한 표시입니다. 서버 계정 로그인이 아닙니다. PIN 잠금은 화면 접근만 제한하며 localStorage의 건강 데이터를 암호화하지 않습니다.</p>
    </section>`;

  if (app) {
    app.hidden = true;
    app.inert = true;
  }
  document.body.prepend(gate);

  const form = document.getElementById('pin-form');
  const nameField = document.getElementById('guardian-name-field');
  const nameInput = document.getElementById('guardian-name-input');
  const pinField = document.getElementById('pin-field');
  const pinInput = document.getElementById('pin-input');
  const confirmInput = document.getElementById('pin-confirm');
  const confirmField = document.getElementById('pin-confirm-field');
  const errorMessage = document.getElementById('pin-error');
  const submitButton = document.getElementById('pin-submit');
  const forgotButton = document.getElementById('forgot-pin-button');

  let mode = 'unlock';
  let appLoaded = false;
  let guardianConfig = null;
  let activityTimer = 0;
  let lastActivityAt = 0;
  let settingsDialog = null;
  let pinResetInProgress = false;

  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('is-visible');
  }

  function clearError() {
    errorMessage.textContent = '';
    errorMessage.classList.remove('is-visible');
  }

  function normalizedName(value) {
    return typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase() : '';
  }

  function validName(value) {
    return typeof value === 'string' && value.normalize('NFKC').trim().length > 0 && value.trim().length <= 40;
  }

  function validPin(value) {
    return /^[0-9]{4}$/.test(value);
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function hexToBytes(value) {
    if (typeof value !== 'string' || !/^(?:[0-9a-f]{2})+$/i.test(value)) return null;
    return Uint8Array.from(value.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
  }

  function readPinConfig() {
    const raw = window.localStorage.getItem(PIN_STORAGE_KEY);
    if (raw === null) return null;
    let config;
    try {
      config = JSON.parse(raw);
    } catch (error) {
      throw new Error('저장된 PIN 설정을 읽을 수 없습니다. PIN 분실 초기화 절차를 확인해 주세요.');
    }
    const salt = config && hexToBytes(config.salt);
    const hash = config && hexToBytes(config.hash);
    if (!config || config.version !== 1 || config.algorithm !== 'PBKDF2-SHA-256' || config.iterations !== PBKDF2_ITERATIONS || !salt || salt.length !== 16 || !hash || hash.length !== 32) {
      throw new Error('PIN 설정 데이터가 올바르지 않습니다. PIN 분실 초기화 절차를 확인해 주세요.');
    }
    return config;
  }

  function readGuardianConfig() {
    const raw = window.localStorage.getItem(GUARDIAN_STORAGE_KEY);
    if (raw === null) return null;
    let config;
    try {
      config = JSON.parse(raw);
    } catch (error) {
      throw new Error('보호자 프로필 설정을 읽을 수 없습니다. 잠금 화면의 데이터 삭제 초기화를 이용해 주세요.');
    }
    if (!config || config.version !== 1 || !validName(config.name) || !ALLOWED_IDLE_MINUTES.has(Number(config.idleMinutes))) {
      throw new Error('보호자 프로필 설정이 올바르지 않습니다. 잠금 화면의 데이터 삭제 초기화를 이용해 주세요.');
    }
    return { version: 1, name: config.name.normalize('NFKC').trim().replace(/\s+/gu, ' '), idleMinutes: Number(config.idleMinutes) };
  }

  async function derivePinHash(pin, salt) {
    if (!window.crypto || !window.crypto.subtle || typeof window.crypto.getRandomValues !== 'function') {
      throw new Error('이 브라우저에서는 안전한 PIN 처리 기능을 사용할 수 없습니다. 최신 브라우저나 localhost 주소에서 다시 열어 주세요.');
    }
    const keyMaterial = await window.crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await window.crypto.subtle.deriveBits({
      name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS
    }, keyMaterial, 256);
    return new Uint8Array(bits);
  }

  function equalBytes(left, right) {
    if (!left || !right || left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
    return difference === 0;
  }

  async function verifyPin(pin, config) {
    if (!config) return false;
    const actual = await derivePinHash(pin, hexToBytes(config.salt));
    return equalBytes(actual, hexToBytes(config.hash));
  }

  async function makePinConfig(pin) {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const hash = await derivePinHash(pin, salt);
    return {
      version: 1,
      algorithm: 'PBKDF2-SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToHex(salt),
      hash: bytesToHex(hash)
    };
  }

  function persistKeyValues(values) {
    const previous = new Map();
    try {
      for (const key of Object.keys(values)) previous.set(key, window.localStorage.getItem(key));
      for (const [key, value] of Object.entries(values)) window.localStorage.setItem(key, value);
      for (const [key, value] of Object.entries(values)) {
        if (window.localStorage.getItem(key) !== value) throw new Error('저장된 설정을 확인하지 못했습니다.');
      }
    } catch (error) {
      let rollbackFailed = false;
      for (const [key, oldValue] of previous.entries()) {
        try {
          if (oldValue === null) window.localStorage.removeItem(key);
          else window.localStorage.setItem(key, oldValue);
          if (window.localStorage.getItem(key) !== oldValue) rollbackFailed = true;
        } catch (rollbackError) {
          rollbackFailed = true;
        }
      }
      throw new Error(rollbackFailed
        ? '설정을 저장하지 못했고 이전 설정 복구도 확인할 수 없습니다. 브라우저 저장 공간을 확인해 주세요.'
        : '설정을 저장하지 못했습니다. 기존 설정은 유지되도록 복구했습니다. 브라우저 저장 공간을 확인해 주세요.');
    }
  }

  function setMode(nextMode, message = '') {
    mode = nextMode;
    clearError();
    pinInput.value = '';
    confirmInput.value = '';
    nameInput.value = '';
    const nameVisible = mode === 'setup' || mode === 'upgrade' || mode === 'unlock';
    nameField.hidden = !nameVisible;
    pinField.hidden = mode === 'broken';
    confirmField.hidden = mode !== 'setup';
    pinInput.required = mode !== 'broken';
    nameInput.required = nameVisible;
    form.hidden = mode === 'broken';
    forgotButton.hidden = mode === 'setup' || pinResetInProgress;

    const title = document.getElementById('pin-title');
    const description = document.getElementById('pin-description');
    const pinLabel = document.getElementById('pin-label');
    if (mode === 'setup') {
      title.textContent = '보호자 프로필 설정';
      description.textContent = '이 기기에서 사용할 보호자 이름과 새 4자리 PIN을 설정해 주세요. PIN은 두 번 입력해야 합니다.';
      pinLabel.textContent = '새 4자리 PIN';
      submitButton.textContent = '프로필과 PIN 설정';
    } else if (mode === 'upgrade') {
      title.textContent = '보호자 프로필 등록';
      description.textContent = '기존 PIN을 확인하고 보호자 이름을 등록합니다. 기존 가족 건강정보와 PIN은 유지됩니다.';
      pinLabel.textContent = '기존 4자리 PIN';
      submitButton.textContent = '기존 PIN 확인 후 등록';
    } else if (mode === 'unlock') {
      title.textContent = '잠금 해제';
      description.textContent = '등록한 보호자 이름과 4자리 PIN을 입력해 이 기기의 건강수첩 잠금을 해제하세요.';
      pinLabel.textContent = '4자리 PIN';
      submitButton.textContent = '잠금 해제';
    } else {
      title.textContent = '잠금 설정을 확인해 주세요';
      description.textContent = message || 'PIN 또는 보호자 프로필을 확인할 수 없습니다. 기존 건강정보를 그대로 공개하지 않습니다. PIN 분실 초기화를 진행하면 이 앱에 저장된 건강정보가 삭제됩니다.';
      submitButton.textContent = '데이터 삭제 초기화';
    }
    if (message) showError(message);
    if (mode !== 'broken') window.setTimeout(() => (mode === 'unlock' || mode === 'setup' || mode === 'upgrade' ? nameInput : pinInput).focus(), 0);
  }

  function updateGuardianDisplay() {
    if (guardianBadge && guardianConfig) {
      guardianBadge.textContent = `보호자 · ${guardianConfig.name}`;
      guardianBadge.hidden = false;
    }
    if (profileButton) profileButton.hidden = false;
    if (logoutButton) logoutButton.hidden = false;
  }

  function stopAutoLockTimer() {
    if (activityTimer) window.clearInterval(activityTimer);
    activityTimer = 0;
  }

  function hideApp() {
    if (app) {
      app.hidden = true;
      app.inert = true;
    }
    gate.hidden = false;
  }

  function lockApp() {
    if (settingsDialog && settingsDialog.open) settingsDialog.close();
    stopAutoLockTimer();
    hideApp();
    setMode('unlock');
    window.setTimeout(() => nameInput.focus(), 0);
  }

  function recordActivity() {
    if (!app || app.hidden || !guardianConfig) return;
    lastActivityAt = Date.now();
  }

  function checkAutoLock() {
    if (!app || app.hidden || !guardianConfig || document.visibilityState === 'hidden') return;
    const idleLimit = guardianConfig.idleMinutes * 60 * 1000;
    if (Date.now() - lastActivityAt >= idleLimit) {
      showError('일정 시간 사용하지 않아 자동으로 잠겼습니다. 보호자 이름과 PIN으로 잠금을 해제해 주세요.');
      lockApp();
      showError('일정 시간 사용하지 않아 자동으로 잠겼습니다. 보호자 이름과 PIN으로 잠금을 해제해 주세요.');
    }
  }

  function startAutoLockTimer() {
    stopAutoLockTimer();
    lastActivityAt = Date.now();
    activityTimer = window.setInterval(checkAutoLock, 5000);
  }

  function createSettingsDialog() {
    const dialog = document.createElement('dialog');
    dialog.id = 'guardian-settings-dialog';
    dialog.className = 'guardian-settings-dialog';
    dialog.setAttribute('aria-labelledby', 'guardian-settings-title');
    dialog.innerHTML = `
      <section class="guardian-settings-card">
        <header class="guardian-settings-heading">
          <div><p class="pin-eyebrow">이 기기용 프로필</p><h2 id="guardian-settings-title">보호자 설정</h2></div>
          <button class="guardian-close-button" type="button" data-settings-close aria-label="창 닫기">×</button>
        </header>
        <form id="guardian-profile-form" class="guardian-settings-form">
          <label class="pin-field" for="guardian-settings-name">보호자 이름
            <input id="guardian-settings-name" type="text" maxlength="40" autocomplete="name" required>
          </label>
          <label class="pin-field" for="guardian-idle-minutes">사용하지 않을 때 자동 잠금
            <select id="guardian-idle-minutes">
              <option value="1">1분</option><option value="5">5분</option><option value="10">10분</option><option value="15">15분</option>
            </select>
          </label>
          <p id="guardian-settings-status" class="guardian-settings-status" role="status" aria-live="polite"></p>
          <button class="pin-submit" type="submit">프로필 설정 저장</button>
        </form>
        <hr>
        <form id="guardian-pin-change-form" class="guardian-settings-form">
          <h3>PIN 변경</h3>
          <label class="pin-field" for="guardian-current-pin">현재 PIN
            <input id="guardian-current-pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="current-password" required>
          </label>
          <label class="pin-field" for="guardian-new-pin">새 4자리 PIN
            <input id="guardian-new-pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password" required>
          </label>
          <label class="pin-field" for="guardian-new-pin-confirm">새 PIN 다시 입력
            <input id="guardian-new-pin-confirm" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password" required>
          </label>
          <p id="guardian-pin-status" class="guardian-settings-status" role="status" aria-live="polite"></p>
          <button class="pin-submit" type="submit">현재 PIN 확인 후 변경</button>
        </form>
        <p class="guardian-reset-note"><strong>PIN을 잊은 경우:</strong> 서버 복구 기능은 없습니다. 잠금 화면의 PIN 분실 초기화는 두 단계 확인 뒤 이 브라우저에 저장된 건강 데이터까지 삭제합니다. 초기화 후 새 프로필과 PIN을 설정하고, 백업 파일이 있으면 사용자가 직접 복원해야 합니다. PIN만 초기화해 기존 건강정보를 그대로 표시하는 기능은 제공하지 않습니다.</p>
      </section>`;
    document.body.append(dialog);
    return dialog;
  }

  function showApp() {
    if (!app) {
      showError('앱 화면을 찾을 수 없습니다. 페이지를 새로고침해 주세요.');
      return;
    }
    app.hidden = false;
    app.inert = false;
    gate.hidden = true;
    updateGuardianDisplay();
    startAutoLockTimer();
  }

  function startApp() {
    clearError();
    if (!app) {
      showError('앱 화면을 찾을 수 없습니다. 페이지를 새로고침해 주세요.');
      return;
    }
    if (appLoaded) {
      showApp();
      return;
    }
    const script = document.createElement('script');
    script.src = './app.js';
    script.onload = () => {
      appLoaded = true;
      showApp();
    };
    script.onerror = () => {
      app.hidden = true;
      app.inert = true;
      gate.hidden = false;
      showError('앱 기능을 불러오지 못했습니다. 연결된 app.js 파일이 있는지 확인한 뒤 다시 시도해 주세요.');
    };
    document.body.append(script);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    clearError();
    if (mode === 'broken') return;
    const name = nameInput.value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
    const pin = pinInput.value;
    if (!validName(name)) {
      showError('보호자 이름을 입력해 주세요.');
      nameInput.focus();
      return;
    }
    if (!validPin(pin)) {
      showError('PIN은 0부터 9까지 숫자 4자리로 입력해 주세요.');
      pinInput.focus();
      return;
    }
    if (mode === 'setup' && confirmInput.value !== pin) {
      confirmInput.value = '';
      showError('두 PIN이 서로 다릅니다. 다시 확인해 주세요.');
      confirmInput.focus();
      pinInput.value = '';
      return;
    }

    submitButton.disabled = true;
    const originalText = submitButton.textContent;
    submitButton.textContent = '확인 중…';
    try {
      if (mode === 'setup') {
        const pinConfig = await makePinConfig(pin);
        const profile = { version: 1, name, idleMinutes: DEFAULT_IDLE_MINUTES };
        persistKeyValues({
          [PIN_STORAGE_KEY]: JSON.stringify(pinConfig),
          [GUARDIAN_STORAGE_KEY]: JSON.stringify(profile)
        });
        guardianConfig = profile;
        startApp();
      } else if (mode === 'upgrade') {
        const existingPin = readPinConfig();
        if (!(await verifyPin(pin, existingPin))) {
          showError('기존 PIN이 올바르지 않습니다.');
          pinInput.value = '';
          pinInput.focus();
          return;
        }
        const profile = { version: 1, name, idleMinutes: DEFAULT_IDLE_MINUTES };
        persistKeyValues({ [GUARDIAN_STORAGE_KEY]: JSON.stringify(profile) });
        guardianConfig = profile;
        startApp();
      } else if (mode === 'unlock') {
        const profile = readGuardianConfig();
        const pinConfig = readPinConfig();
        if (!profile || !pinConfig) {
          setMode('broken', 'PIN 또는 보호자 프로필 설정이 없어 안전하게 잠금을 해제할 수 없습니다. 건강정보를 보존한 채 PIN을 복구할 수는 없습니다.');
          return;
        }
        if (normalizedName(name) !== normalizedName(profile.name)) {
          showError('보호자 이름 또는 PIN을 확인해 주세요.');
          nameInput.value = '';
          pinInput.value = '';
          nameInput.focus();
          return;
        }
        if (!(await verifyPin(pin, pinConfig))) {
          showError('보호자 이름 또는 PIN을 확인해 주세요.');
          pinInput.value = '';
          pinInput.focus();
          return;
        }
        guardianConfig = profile;
        startApp();
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : '잠금 설정을 저장하거나 확인하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.');
    } finally {
      pinInput.value = '';
      confirmInput.value = '';
      submitButton.disabled = mode === 'broken';
      submitButton.textContent = mode === 'setup' ? '프로필과 PIN 설정' : mode === 'upgrade' ? '기존 PIN 확인 후 등록' : '잠금 해제';
      if (originalText === '데이터 삭제 초기화') submitButton.textContent = originalText;
    }
  }

  async function resetLostPin() {
    if (pinResetInProgress) return;
    let firstConfirmed = false;
    try {
      firstConfirmed = window.confirm('PIN을 잊으면 기존 PIN을 확인할 수 없습니다. 계속 초기화하면 이 브라우저에 저장된 가족 구성원, 건강기록, 병원·복약 일정과 PIN·보호자 프로필 설정이 삭제됩니다. 백업이 없으면 복구할 수 없습니다. 첫 번째 확인: 데이터 삭제 초기화를 진행할까요?') === true;
    } catch (error) {
      firstConfirmed = false;
    }
    if (!firstConfirmed) {
      showError('초기화를 취소했습니다. 저장된 데이터는 변경하지 않았습니다.');
      return;
    }

    let confirmationPhrase = '';
    try {
      confirmationPhrase = window.prompt('두 번째 확인입니다. 초기화 후에는 앱 데이터가 삭제되고, 새 보호자 프로필·PIN 설정 후 백업이 있다면 직접 복원해야 합니다. 계속하려면 아래에 “데이터 삭제”를 입력하세요.', '');
    } catch (error) {
      confirmationPhrase = null;
    }
    if (confirmationPhrase !== '데이터 삭제') {
      showError('두 번째 확인 문구가 맞지 않거나 취소되어 초기화하지 않았습니다.');
      return;
    }

    pinResetInProgress = true;
    forgotButton.disabled = true;
    showError('저장된 건강정보와 잠금 설정을 안전하게 초기화하는 중입니다…');
    const keys = [HEALTH_STORAGE_KEY, PIN_STORAGE_KEY, GUARDIAN_STORAGE_KEY];
    const previous = new Map();
    try {
      for (const key of keys) previous.set(key, window.localStorage.getItem(key));
      for (const key of keys) window.localStorage.removeItem(key);
      if (keys.some((key) => window.localStorage.getItem(key) !== null)) throw new Error('삭제 결과를 확인하지 못했습니다.');
    } catch (error) {
      let restored = true;
      for (const [key, value] of previous.entries()) {
        try {
          if (value === null) window.localStorage.removeItem(key);
          else window.localStorage.setItem(key, value);
          if (window.localStorage.getItem(key) !== value) restored = false;
        } catch (rollbackError) {
          restored = false;
        }
      }
      pinResetInProgress = false;
      forgotButton.disabled = false;
      showError(restored
        ? '초기화에 실패했습니다. 기존 데이터를 복구했고 변경하지 않았습니다. 브라우저 저장 공간을 확인해 주세요.'
        : '초기화에 실패해 저장 상태를 자동으로 확인·복구하지 못했습니다. 브라우저 저장 데이터를 확인해 주세요.');
      return;
    }

    guardianConfig = null;
    pinResetInProgress = false;
    forgotButton.disabled = false;
    setMode('setup', '초기화했습니다. 새 보호자 이름과 PIN을 설정하세요. 백업 파일이 있다면 설정 후 직접 복원할 수 있습니다.');
  }

  function setSettingsStatus(id, message, isError = false) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('is-error', isError);
  }

  function openSettings() {
    if (!guardianConfig) return;
    if (!settingsDialog) settingsDialog = createSettingsDialog();
    const profileName = document.getElementById('guardian-settings-name');
    const idleSelect = document.getElementById('guardian-idle-minutes');
    const pinChangeForm = document.getElementById('guardian-pin-change-form');
    const profileForm = document.getElementById('guardian-profile-form');
    profileName.value = guardianConfig.name;
    idleSelect.value = String(guardianConfig.idleMinutes);
    setSettingsStatus('guardian-settings-status', '');
    setSettingsStatus('guardian-pin-status', '');
    pinChangeForm.reset();
    if (!settingsDialog.open) settingsDialog.showModal();
    profileName.focus();

    if (!settingsDialog.dataset.bound) {
      settingsDialog.dataset.bound = 'true';
      settingsDialog.addEventListener('click', (event) => {
        if (event.target === settingsDialog || event.target.closest('[data-settings-close]')) settingsDialog.close();
      });
      profileForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const nextName = profileName.value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
        const idleMinutes = Number(idleSelect.value);
        if (!validName(nextName) || !ALLOWED_IDLE_MINUTES.has(idleMinutes)) {
          setSettingsStatus('guardian-settings-status', '보호자 이름과 자동 잠금 시간을 확인해 주세요.', true);
          return;
        }
        const nextProfile = { version: 1, name: nextName, idleMinutes };
        try {
          persistKeyValues({ [GUARDIAN_STORAGE_KEY]: JSON.stringify(nextProfile) });
          guardianConfig = nextProfile;
          updateGuardianDisplay();
          recordActivity();
          setSettingsStatus('guardian-settings-status', '보호자 프로필과 자동 잠금 설정을 저장했습니다.');
        } catch (error) {
          setSettingsStatus('guardian-settings-status', error.message, true);
        }
      });
      pinChangeForm.addEventListener('input', (event) => {
        if (event.target instanceof HTMLInputElement) event.target.value = event.target.value.replace(/[^0-9]/g, '').slice(0, 4);
      });
      pinChangeForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const current = document.getElementById('guardian-current-pin').value;
        const nextPin = document.getElementById('guardian-new-pin').value;
        const repeated = document.getElementById('guardian-new-pin-confirm').value;
        const button = pinChangeForm.querySelector('button[type="submit"]');
        if (!validPin(current) || !validPin(nextPin)) {
          setSettingsStatus('guardian-pin-status', '현재 PIN과 새 PIN을 각각 숫자 4자리로 입력해 주세요.', true);
          return;
        }
        if (nextPin !== repeated) {
          setSettingsStatus('guardian-pin-status', '새 PIN이 서로 다릅니다. 다시 입력해 주세요.', true);
          document.getElementById('guardian-new-pin-confirm').value = '';
          return;
        }
        button.disabled = true;
        button.textContent = '확인 중…';
        try {
          const oldConfig = readPinConfig();
          if (!(await verifyPin(current, oldConfig))) {
            setSettingsStatus('guardian-pin-status', '현재 PIN이 올바르지 않아 변경하지 않았습니다.', true);
            return;
          }
          const newConfig = await makePinConfig(nextPin);
          persistKeyValues({ [PIN_STORAGE_KEY]: JSON.stringify(newConfig) });
          pinChangeForm.reset();
          setSettingsStatus('guardian-pin-status', 'PIN을 변경했습니다. 다음 잠금 해제부터 새 PIN을 사용하세요.');
        } catch (error) {
          setSettingsStatus('guardian-pin-status', error instanceof Error ? error.message : 'PIN을 변경하지 못했습니다.', true);
        } finally {
          button.disabled = false;
          button.textContent = '현재 PIN 확인 후 변경';
        }
      });
    }
  }

  form.addEventListener('submit', handleSubmit);
  for (const input of [pinInput, confirmInput]) {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^0-9]/g, '').slice(0, 4);
      clearError();
    });
  }
  nameInput.addEventListener('input', clearError);
  forgotButton.addEventListener('click', resetLostPin);
  if (lockButton) lockButton.addEventListener('click', lockApp);
  if (logoutButton) logoutButton.addEventListener('click', lockApp);
  if (profileButton) profileButton.addEventListener('click', openSettings);
  for (const eventName of ['pointerdown', 'keydown', 'touchstart', 'click', 'scroll']) {
    document.addEventListener(eventName, recordActivity, { passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkAutoLock();
  });

  try {
    const pinConfig = readPinConfig();
    guardianConfig = readGuardianConfig();
    const hasHealthData = window.localStorage.getItem(HEALTH_STORAGE_KEY) !== null;
    if (!pinConfig && (guardianConfig || hasHealthData)) {
      setMode('broken', 'PIN 설정이 없지만 저장된 건강정보 또는 보호자 프로필이 있습니다. 안전한 PIN 복구는 제공되지 않으므로 건강정보를 보존한 채 잠금을 해제하지 않습니다. 데이터 삭제 초기화 후 새 프로필을 설정하거나, 저장된 일반 JSON 백업이 있다면 초기화 후 직접 복원하세요.');
    } else if (!pinConfig) {
      setMode('setup');
    } else if (!guardianConfig) {
      setMode('upgrade');
    } else {
      setMode('unlock');
    }
  } catch (error) {
    setMode('broken', error instanceof Error ? error.message : '잠금 설정을 읽지 못했습니다.');
  }

  if (!window.crypto || !window.crypto.subtle) {
    showError('안전한 PIN 처리 기능을 사용할 수 없습니다. 최신 브라우저 또는 localhost에서 열어 주세요.');
    submitButton.disabled = true;
  }
  if (!window.crypto || !window.crypto.subtle || typeof window.crypto.getRandomValues !== 'function') {
    if (mode === 'broken') forgotButton.disabled = false;
  }
})();
