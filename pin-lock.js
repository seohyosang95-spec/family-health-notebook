(() => {
  'use strict';

  const PIN_STORAGE_KEY = 'dajeong-family-health-pin-v1';
  const PBKDF2_ITERATIONS = 600000;

  const app = document.getElementById('app-shell');
  const lockButton = document.getElementById('lock-app-button');
  const gate = document.createElement('main');
  gate.id = 'pin-gate';
  gate.className = 'pin-gate';
  gate.setAttribute('aria-labelledby', 'pin-title');
  gate.innerHTML = `
    <section class="pin-card">
      <span class="pin-brand-mark" aria-hidden="true">♡</span>
      <p class="pin-eyebrow">다정한 건강수첩</p>
      <h1 id="pin-title">가족 건강정보 잠금</h1>
      <p id="pin-description" class="pin-description"></p>
      <form id="pin-form" class="pin-form" novalidate>
        <label class="pin-field" for="pin-input"><span id="pin-label">4자리 PIN</span>
          <input id="pin-input" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" minlength="4" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="pin-error" required>
        </label>
        <label id="pin-confirm-field" class="pin-field" for="pin-confirm" hidden><span>PIN 다시 입력</span>
          <input id="pin-confirm" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" minlength="4" autocomplete="off" autocapitalize="off" spellcheck="false">
        </label>
        <p id="pin-error" class="pin-error" role="status" aria-live="polite"></p>
        <button id="pin-submit" class="pin-submit" type="submit">잠금 해제</button>
      </form>
      <p class="pin-security-note">PIN은 이 브라우저에 솔트와 PBKDF2 해시로 저장되며, PIN 자체는 저장하지 않습니다. 이 잠금은 앱 화면 접근을 제한하지만 건강 데이터를 암호화하지는 않습니다.</p>
    </section>`;

  if (app) {
    app.hidden = true;
    app.inert = true;
  }
  document.body.prepend(gate);

  let mode = 'unlock';
  let appLoaded = false;
  const form = document.getElementById('pin-form');
  const pinInput = document.getElementById('pin-input');
  const confirmInput = document.getElementById('pin-confirm');
  const confirmField = document.getElementById('pin-confirm-field');
  const errorMessage = document.getElementById('pin-error');
  const submitButton = document.getElementById('pin-submit');

  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('is-visible');
  }

  function clearError() {
    errorMessage.textContent = '';
    errorMessage.classList.remove('is-visible');
  }

  function setMode(nextMode) {
    mode = nextMode;
    clearError();
    pinInput.value = '';
    confirmInput.value = '';
    confirmField.hidden = mode !== 'setup';
    document.getElementById('pin-title').textContent = mode === 'setup' ? '4자리 PIN 설정' : '가족 건강정보 잠금';
    document.getElementById('pin-description').textContent = mode === 'setup'
      ? '처음 사용합니다. 가족 건강정보를 보호할 4자리 숫자 PIN을 설정해 주세요.'
      : '건강수첩을 계속 보려면 설정한 4자리 PIN을 입력해 주세요.';
    submitButton.textContent = mode === 'setup' ? 'PIN 설정하고 시작' : '잠금 해제';
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
      throw new Error('저장된 PIN 설정을 읽을 수 없습니다. README의 PIN 복구 안내를 확인해 주세요.');
    }
    const salt = config && hexToBytes(config.salt);
    const hash = config && hexToBytes(config.hash);
    if (!config || config.version !== 1 || config.algorithm !== 'PBKDF2-SHA-256' || config.iterations !== PBKDF2_ITERATIONS || !salt || salt.length !== 16 || !hash || hash.length !== 32) {
      throw new Error('PIN 설정 데이터가 올바르지 않습니다. README의 PIN 복구 안내를 확인해 주세요.');
    }
    return config;
  }

  async function derivePinHash(pin, salt) {
    if (!window.crypto || !window.crypto.subtle || typeof window.crypto.getRandomValues !== 'function') {
      throw new Error('이 브라우저에서는 안전한 PIN 저장 기능을 사용할 수 없습니다. 최신 브라우저나 localhost 주소에서 다시 열어 주세요.');
    }
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']
    );
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

  function validPin(value) {
    return /^[0-9]{4}$/.test(value);
  }

  function startApp() {
    clearError();
    if (!app) {
      showError('앱 화면을 찾을 수 없습니다. 페이지를 새로고침해 주세요.');
      return;
    }
    if (!appLoaded) {
      const script = document.createElement('script');
      script.src = './app.js';
      script.onload = () => {
        appLoaded = true;
        app.hidden = false;
        app.inert = false;
        gate.hidden = true;
      };
      script.onerror = () => {
        app.hidden = true;
        app.inert = true;
        gate.hidden = false;
        showError('앱 기능을 불러오지 못했습니다. 연결된 app.js 파일이 있는지 확인한 뒤 다시 시도해 주세요.');
      };
      document.body.append(script);
    } else {
      app.hidden = false;
      app.inert = false;
      gate.hidden = true;
    }

    if (lockButton && !lockButton.dataset.lockReady) {
      lockButton.dataset.lockReady = 'true';
      lockButton.addEventListener('click', () => window.location.reload());
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    clearError();
    const pin = pinInput.value;
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
    submitButton.textContent = '확인 중…';
    try {
      if (mode === 'setup') {
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const hash = await derivePinHash(pin, salt);
        const config = {
          version: 1,
          algorithm: 'PBKDF2-SHA-256',
          iterations: PBKDF2_ITERATIONS,
          salt: bytesToHex(salt),
          hash: bytesToHex(hash)
        };
        window.localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(config));
        readPinConfig();
        startApp();
      } else {
        const config = readPinConfig();
        if (!config) throw new Error('PIN 설정을 찾을 수 없습니다. 페이지를 새로고침해 주세요.');
        const actual = await derivePinHash(pin, hexToBytes(config.salt));
        if (!equalBytes(actual, hexToBytes(config.hash))) {
          showError('PIN이 올바르지 않습니다. 다시 입력해 주세요.');
          pinInput.value = '';
          pinInput.focus();
          return;
        }
        startApp();
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : 'PIN을 확인하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.');
    } finally {
      pinInput.value = '';
      confirmInput.value = '';
      submitButton.disabled = false;
      submitButton.textContent = mode === 'setup' ? 'PIN 설정하고 시작' : '잠금 해제';
    }
  }

  form.addEventListener('submit', handleSubmit);
  for (const input of [pinInput, confirmInput]) {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^0-9]/g, '').slice(0, 4);
      clearError();
    });
  }

  try {
    const config = readPinConfig();
    setMode(config ? 'unlock' : 'setup');
  } catch (error) {
    setMode('unlock');
    showError(error.message);
    submitButton.disabled = true;
  }

  if (!window.crypto || !window.crypto.subtle) {
    showError('안전한 PIN 처리 기능을 사용할 수 없습니다. 최신 브라우저 또는 localhost에서 열어 주세요.');
    submitButton.disabled = true;
  }
  pinInput.focus();
})();
