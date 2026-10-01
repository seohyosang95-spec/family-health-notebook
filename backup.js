(() => {
  'use strict';

  const STORAGE_KEY = 'dajeong-family-health-v1';
  const BACKUP_FORMAT = 'dajeong-family-health-backup';
  const BACKUP_VERSION = 1;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_ITEMS = 10000;
  const RELATIONSHIPS = new Set(['본인', '배우자', '자녀', '부모님', '형제·자매', '기타']);
  const RECORD_TYPES = new Set(['checkup', 'symptom', 'test', 'note']);
  const SCHEDULE_TYPES = new Set(['hospital', 'medication']);
  const BLOOD_TYPES = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown']);

  const openButton = document.getElementById('backup-open-button');
  const dialog = document.getElementById('backup-dialog');
  const closeButton = document.getElementById('backup-close-button');
  const downloadButton = document.getElementById('download-backup-button');
  const restoreButton = document.getElementById('restore-backup-button');
  const fileInput = document.getElementById('backup-file-input');
  const status = document.getElementById('backup-status');

  if (!openButton || !dialog || !downloadButton || !restoreButton || !fileInput || !status) return;

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isISODate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(0);
    date.setHours(0, 0, 0, 0);
    date.setFullYear(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function isISOTime(value) {
    if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false;
    const [hour, minute] = value.split(':').map(Number);
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
  }

  function validText(value, maxLength, { allowEmpty = true } = {}) {
    return typeof value === 'string' && value.length <= maxLength && (allowEmpty || value.trim().length > 0);
  }

  function validateData(data) {
    if (!isObject(data) || !Array.isArray(data.members) || !Array.isArray(data.records) || !Array.isArray(data.schedules)) {
      throw new Error('가족 구성원, 건강기록, 일정 목록이 모두 포함된 파일인지 확인해 주세요.');
    }
    if (data.members.length > MAX_ITEMS || data.records.length > MAX_ITEMS || data.schedules.length > MAX_ITEMS) {
      throw new Error('파일에 포함된 데이터가 너무 많아 불러올 수 없습니다.');
    }

    const memberIds = new Set();
    const members = data.members.map((item) => {
      if (!isObject(item) || !validText(item.id, 100, { allowEmpty: false }) || !validText(item.name, 40, { allowEmpty: false }) ||
          !RELATIONSHIPS.has(item.relationship) || !(item.birthDate === '' || isISODate(item.birthDate)) ||
          !BLOOD_TYPES.has(item.bloodType) || !validText(item.allergies, 160) || !validText(item.note, 500) ||
          !validText(item.createdAt, 40)) {
        throw new Error('가족 구성원 정보에 올바르지 않거나 누락된 항목이 있습니다. 기존 데이터는 변경하지 않았습니다.');
      }
      if (memberIds.has(item.id)) throw new Error('중복된 구성원 식별자가 있어 파일을 불러올 수 없습니다. 기존 데이터는 변경하지 않았습니다.');
      memberIds.add(item.id);
      return {
        id: item.id,
        name: item.name.trim(),
        relationship: item.relationship,
        birthDate: item.birthDate,
        bloodType: item.bloodType,
        allergies: item.allergies,
        note: item.note,
        createdAt: item.createdAt
      };
    });

    function validateUniqueIds(items, label) {
      const ids = new Set();
      for (const item of items) {
        if (!isObject(item) || !validText(item.id, 100, { allowEmpty: false }) || ids.has(item.id)) {
          throw new Error(`${label}의 식별자가 올바르지 않거나 중복되었습니다. 기존 데이터는 변경하지 않았습니다.`);
        }
        ids.add(item.id);
      }
    }

    validateUniqueIds(data.records, '건강기록');
    validateUniqueIds(data.schedules, '일정');

    const records = data.records.map((item) => {
      if (!memberIds.has(item.memberId) || !RECORD_TYPES.has(item.type) || !validText(item.title, 80, { allowEmpty: false }) ||
          !isISODate(item.date) || !validText(item.detail, 600) || !validText(item.createdAt, 40)) {
        throw new Error('건강기록의 구성원 연결이나 날짜·내용이 올바르지 않습니다. 기존 데이터는 변경하지 않았습니다.');
      }
      return {
        id: item.id,
        memberId: item.memberId,
        type: item.type,
        title: item.title.trim(),
        date: item.date,
        detail: item.detail,
        createdAt: item.createdAt
      };
    });

    const schedules = data.schedules.map((item) => {
      if (!memberIds.has(item.memberId) || !SCHEDULE_TYPES.has(item.type) || !validText(item.title, 80, { allowEmpty: false }) ||
          !isISODate(item.date) || !(item.time === '' || isISOTime(item.time)) || !validText(item.detail, 400) || !validText(item.createdAt, 40)) {
        throw new Error('병원·복약 일정의 구성원 연결이나 날짜·시간·내용이 올바르지 않습니다. 기존 데이터는 변경하지 않았습니다.');
      }
      return {
        id: item.id,
        memberId: item.memberId,
        type: item.type,
        title: item.title.trim(),
        date: item.date,
        time: item.time,
        detail: item.detail,
        createdAt: item.createdAt
      };
    });

    return { members, records, schedules };
  }

  function normalizeCurrentData(parsed) {
    if (!isObject(parsed) || !Array.isArray(parsed.members) || !Array.isArray(parsed.records) || !Array.isArray(parsed.schedules)) {
      throw new Error('현재 저장된 건강수첩 데이터를 읽을 수 없습니다. 먼저 브라우저 저장 상태를 확인해 주세요.');
    }

    const members = parsed.members.map((item) => {
      if (!isObject(item) || typeof item.id !== 'string' || !item.id || typeof item.name !== 'string' || !item.name.trim()) return null;
      return {
        id: item.id.slice(0, 100),
        name: item.name.slice(0, 40).trim(),
        relationship: RELATIONSHIPS.has(item.relationship) ? item.relationship : '기타',
        birthDate: isISODate(item.birthDate) ? item.birthDate : '',
        bloodType: BLOOD_TYPES.has(item.bloodType) ? item.bloodType : 'unknown',
        allergies: typeof item.allergies === 'string' ? item.allergies.slice(0, 160) : '',
        note: typeof item.note === 'string' ? item.note.slice(0, 500) : '',
        createdAt: typeof item.createdAt === 'string' ? item.createdAt.slice(0, 40) : ''
      };
    }).filter(Boolean);
    const memberIds = new Set(members.map((member) => member.id));

    const records = parsed.records.map((item) => {
      if (!isObject(item) || typeof item.id !== 'string' || !item.id || typeof item.memberId !== 'string' || !memberIds.has(item.memberId) ||
          typeof item.title !== 'string' || !item.title.trim() || !isISODate(item.date)) return null;
      return {
        id: item.id.slice(0, 100),
        memberId: item.memberId.slice(0, 100),
        type: RECORD_TYPES.has(item.type) ? item.type : 'note',
        title: item.title.slice(0, 80).trim(),
        date: item.date,
        detail: typeof item.detail === 'string' ? item.detail.slice(0, 600) : '',
        createdAt: typeof item.createdAt === 'string' ? item.createdAt.slice(0, 40) : ''
      };
    }).filter(Boolean);

    const schedules = parsed.schedules.map((item) => {
      if (!isObject(item) || typeof item.id !== 'string' || !item.id || typeof item.memberId !== 'string' || !memberIds.has(item.memberId) ||
          typeof item.title !== 'string' || !item.title.trim() || !isISODate(item.date)) return null;
      return {
        id: item.id.slice(0, 100),
        memberId: item.memberId.slice(0, 100),
        type: SCHEDULE_TYPES.has(item.type) ? item.type : 'hospital',
        title: item.title.slice(0, 80).trim(),
        date: item.date,
        time: isISOTime(item.time) ? item.time : '',
        detail: typeof item.detail === 'string' ? item.detail.slice(0, 400) : '',
        createdAt: typeof item.createdAt === 'string' ? item.createdAt.slice(0, 40) : ''
      };
    }).filter(Boolean);

    return validateData({ members, records, schedules });
  }

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }

  function countsText(data) {
    return `가족 구성원 ${data.members.length}명 · 건강기록 ${data.records.length}건 · 병원·복약 일정 ${data.schedules.length}건`;
  }

  function openDialog() {
    setStatus('백업 파일에는 가족 건강정보가 포함됩니다. 안전한 개인 기기에 보관해 주세요.');
    if (typeof dialog.showModal !== 'function') {
      setStatus('현재 브라우저에서는 이 창을 열 수 없습니다. 최신 브라우저를 이용해 주세요.', true);
      return;
    }
    dialog.showModal();
  }

  function downloadBackup() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const current = raw === null ? { members: [], records: [], schedules: [] } : normalizeCurrentData(JSON.parse(raw));
      const backup = {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        ...current
      };
      const contents = `${JSON.stringify(backup, null, 2)}\n`;
      const blob = new Blob([contents], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `dajeong-health-backup-${today}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(`백업 파일을 만들었습니다. ${countsText(current)}. PIN 정보는 백업에 포함되지 않습니다.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '백업 파일을 만들지 못했습니다. 브라우저 저장 공간을 확인해 주세요.', true);
    }
  }

  function validateBackupFile(parsed) {
    if (!isObject(parsed) || parsed.format !== BACKUP_FORMAT || parsed.version !== BACKUP_VERSION ||
        typeof parsed.exportedAt !== 'string' || !Number.isFinite(Date.parse(parsed.exportedAt))) {
      throw new Error('지원하지 않거나 형식이 올바르지 않은 백업 파일입니다. 기존 데이터는 변경하지 않았습니다.');
    }
    return validateData(parsed);
  }

  function persistImportedData(imported) {
    let previousRaw;
    try {
      previousRaw = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      throw new Error('현재 저장 데이터에 접근할 수 없어 복원하지 않았습니다.');
    }

    const serialized = JSON.stringify(imported);
    try {
      window.localStorage.setItem(STORAGE_KEY, serialized);
      if (window.localStorage.getItem(STORAGE_KEY) !== serialized) {
        throw new Error('저장 결과를 확인하지 못했습니다.');
      }
    } catch (error) {
      try {
        const currentRaw = window.localStorage.getItem(STORAGE_KEY);
        if (currentRaw !== previousRaw) {
          if (previousRaw === null) {
            window.localStorage.removeItem(STORAGE_KEY);
          } else {
            window.localStorage.setItem(STORAGE_KEY, previousRaw);
          }
          if (window.localStorage.getItem(STORAGE_KEY) !== previousRaw) {
            throw new Error('이전 데이터 복구 결과를 확인하지 못했습니다.');
          }
        }
      } catch (rollbackError) {
        throw new Error('복원 저장에 실패했고 이전 데이터를 자동으로 복구하지 못했습니다. 브라우저 저장 공간을 확인한 뒤 데이터를 확인해 주세요.');
      }
      throw new Error('복원 데이터를 저장하지 못해 기존 데이터를 유지했습니다. 브라우저 저장 공간을 확인해 주세요.');
    }
  }

  async function restoreBackup(file) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setStatus('파일 크기가 10MB를 넘습니다. 기존 데이터는 변경하지 않았습니다.', true);
      return;
    }

    let imported;
    try {
      const parsed = JSON.parse(await file.text());
      imported = validateBackupFile(parsed);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '파일을 읽지 못했습니다. JSON 백업 파일인지 확인해 주세요. 기존 데이터는 변경하지 않았습니다.', true);
      return;
    }

    let confirmed = false;
    try {
      if (typeof window.confirm !== 'function') {
        setStatus('복원 확인 창을 사용할 수 없어 복원하지 않았습니다. 기존 데이터는 그대로입니다.', true);
        return;
      }
      confirmed = window.confirm(
        `이 백업으로 현재 건강수첩 데이터를 모두 바꿀까요?\n\n${countsText(imported)}\n\n기존 가족 구성원·건강기록·일정은 백업 내용으로 대체됩니다. PIN 설정은 변경되지 않습니다.`
      ) === true;
    } catch (error) {
      setStatus('복원 확인 창을 표시하지 못해 복원하지 않았습니다. 기존 데이터는 그대로입니다.', true);
      return;
    }
    if (!confirmed) {
      setStatus('복원을 취소했습니다. 기존 데이터는 변경되지 않았습니다.');
      return;
    }

    try {
      persistImportedData(imported);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '복원에 실패했습니다. 기존 데이터가 유지되었습니다.', true);
      return;
    }

    setStatus('복원했습니다. 잠금 상태를 다시 적용하기 위해 화면을 새로고침합니다.');
    window.location.reload();
  }

  openButton.addEventListener('click', openDialog);
  if (closeButton) closeButton.addEventListener('click', () => dialog.close());
  downloadButton.addEventListener('click', downloadBackup);
  restoreButton.addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    await restoreBackup(file);
    fileInput.value = '';
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
})();
