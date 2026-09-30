(() => {
  'use strict';

  const STORAGE_KEY = 'dajeong-family-health-v1';
  const RELATIONSHIPS = new Set(['본인', '배우자', '자녀', '부모님', '형제·자매', '기타']);
  const RECORD_TYPES = Object.freeze({
    checkup: '진료',
    symptom: '증상',
    test: '검사 결과',
    note: '건강 메모'
  });
  const SCHEDULE_TYPES = Object.freeze({
    hospital: '병원 방문',
    medication: '복약 일정'
  });
  const BLOOD_TYPES = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown']);
  const AVATAR_TONES = ['', 'member-avatar-tone-1', 'member-avatar-tone-2', 'member-avatar-tone-3', 'member-avatar-tone-4'];

  const elements = {
    storageStatus: document.getElementById('storage-status'),
    familyList: document.getElementById('family-list'),
    memberDetail: document.getElementById('member-detail'),
    memberCount: document.getElementById('member-count'),
    recordCount: document.getElementById('record-count'),
    scheduleCount: document.getElementById('schedule-count'),
    todayLabel: document.getElementById('today-label'),
    memberDialog: document.getElementById('member-dialog'),
    memberForm: document.getElementById('member-form'),
    memberName: document.getElementById('member-name'),
    memberBirthDate: document.getElementById('member-birth-date'),
    toast: document.getElementById('toast')
  };

  let storageAvailable = true;
  let loadNotice = '';
  let toastTimer = 0;
  const state = loadState();
  let selectedMemberId = state.members.length ? state.members[0].id : null;

  function emptyState() {
    return { members: [], records: [], schedules: [] };
  }

  function textValue(value, maxLength = 600) {
    return typeof value === 'string' ? value.slice(0, maxLength) : '';
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

  function normalizeMember(item) {
    if (!item || typeof item !== 'object') return null;
    const id = textValue(item.id, 100);
    const name = textValue(item.name, 40).trim();
    if (!id || !name) return null;

    return {
      id,
      name,
      relationship: RELATIONSHIPS.has(item.relationship) ? item.relationship : '기타',
      birthDate: isISODate(item.birthDate) ? item.birthDate : '',
      bloodType: BLOOD_TYPES.has(item.bloodType) ? item.bloodType : 'unknown',
      allergies: textValue(item.allergies, 160),
      note: textValue(item.note, 500),
      createdAt: textValue(item.createdAt, 40)
    };
  }

  function normalizeRecord(item, memberIds) {
    if (!item || typeof item !== 'object') return null;
    const id = textValue(item.id, 100);
    const memberId = textValue(item.memberId, 100);
    const title = textValue(item.title, 80).trim();
    if (!id || !memberIds.has(memberId) || !title || !isISODate(item.date)) return null;
    const type = Object.prototype.hasOwnProperty.call(RECORD_TYPES, item.type) ? item.type : 'note';
    return {
      id,
      memberId,
      type,
      title,
      date: item.date,
      detail: textValue(item.detail, 600),
      createdAt: textValue(item.createdAt, 40)
    };
  }

  function normalizeSchedule(item, memberIds) {
    if (!item || typeof item !== 'object') return null;
    const id = textValue(item.id, 100);
    const memberId = textValue(item.memberId, 100);
    const title = textValue(item.title, 80).trim();
    if (!id || !memberIds.has(memberId) || !title || !isISODate(item.date)) return null;
    const type = Object.prototype.hasOwnProperty.call(SCHEDULE_TYPES, item.type) ? item.type : 'hospital';
    return {
      id,
      memberId,
      type,
      title,
      date: item.date,
      time: isISOTime(item.time) ? item.time : '',
      detail: textValue(item.detail, 400),
      createdAt: textValue(item.createdAt, 40)
    };
  }

  function loadState() {
    let raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      storageAvailable = false;
      loadNotice = '브라우저 저장 공간을 사용할 수 없습니다. 이 탭을 닫으면 입력한 내용이 사라질 수 있어요.';
      return emptyState();
    }

    if (!raw) return emptyState();

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') throw new Error('저장 데이터 형식이 올바르지 않습니다.');
      const rawMembers = Array.isArray(parsed.members) ? parsed.members : [];
      const members = rawMembers.map(normalizeMember).filter(Boolean);
      const memberIds = new Set(members.map((member) => member.id));
      const rawRecords = Array.isArray(parsed.records) ? parsed.records : [];
      const rawSchedules = Array.isArray(parsed.schedules) ? parsed.schedules : [];
      return {
        members,
        records: rawRecords.map((record) => normalizeRecord(record, memberIds)).filter(Boolean),
        schedules: rawSchedules.map((schedule) => normalizeSchedule(schedule, memberIds)).filter(Boolean)
      };
    } catch (error) {
      loadNotice = '저장된 데이터를 읽지 못해 새 건강수첩을 열었습니다. 이전 브라우저 저장 데이터를 확인해 주세요.';
      return emptyState();
    }
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageAvailable = true;
      return true;
    } catch (error) {
      storageAvailable = false;
      return false;
    }
  }

  function localDateString(date = new Date()) {
    const year = String(date.getFullYear()).padStart(4, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function dateFromISO(value) {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(0);
    date.setHours(0, 0, 0, 0);
    date.setFullYear(year, month - 1, day);
    return date;
  }

  function formatDate(value, options = { year: 'numeric', month: 'long', day: 'numeric' }) {
    if (!isISODate(value)) return '날짜 미정';
    return new Intl.DateTimeFormat('ko-KR', options).format(dateFromISO(value));
  }

  function updateTodayLabel() {
    const today = new Date();
    const value = localDateString(today);
    elements.todayLabel.dateTime = value;
    elements.todayLabel.textContent = new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    }).format(today);
  }

  function updateStorageStatus() {
    const pill = elements.storageStatus.closest('.storage-pill');
    if (!storageAvailable) {
      elements.storageStatus.textContent = '저장 공간을 사용할 수 없음';
      elements.storageStatus.title = '브라우저 저장 공간에 접근할 수 없습니다. 현재 탭을 닫으면 변경 내용이 사라질 수 있습니다.';
      pill.classList.add('is-warning');
    } else {
      elements.storageStatus.textContent = '이 기기에 저장';
      elements.storageStatus.title = '데이터는 이 브라우저의 로컬 저장 공간에 보관됩니다.';
      pill.classList.remove('is-warning');
    }
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
  }

  function avatarInitial(name) {
    const firstCharacter = Array.from((name || '').trim())[0];
    return firstCharacter ? escapeHTML(firstCharacter) : '가';
  }

  function ageLabel(birthDate) {
    if (!isISODate(birthDate)) return '미등록';
    const birth = dateFromISO(birthDate);
    const today = new Date();
    if (birth.getTime() > new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) return '확인 필요';

    let age = today.getFullYear() - birth.getFullYear();
    if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1;
    return `${age}세`;
  }

  function renderFamilyList() {
    if (state.members.length === 0) {
      elements.familyList.innerHTML = `
        <div class="list-empty">
          <span class="list-empty-icon" aria-hidden="true">♡</span>
          <p>아직 등록된 가족이 없어요.<br>첫 구성원을 추가해 보세요.</p>
          <button class="text-button" type="button" data-action="open-member-dialog">구성원 등록하기 <span aria-hidden="true">→</span></button>
        </div>`;
      return;
    }

    elements.familyList.innerHTML = state.members.map((member, index) => {
      const selected = member.id === selectedMemberId;
      const tone = AVATAR_TONES[index % AVATAR_TONES.length];
      const age = ageLabel(member.birthDate);
      const subtitle = age === '미등록' ? `${member.relationship} · 생년월일 미등록` : `${member.relationship} · ${age}`;
      return `
        <button class="family-item${selected ? ' is-selected' : ''}" type="button" data-member-id="${escapeHTML(member.id)}" aria-pressed="${selected ? 'true' : 'false'}">
          <span class="member-avatar member-avatar-small ${tone}" aria-hidden="true">${avatarInitial(member.name)}</span>
          <span class="family-item-copy">
            <span class="family-item-name">${escapeHTML(member.name)}</span>
            <span class="family-item-subtitle">${escapeHTML(subtitle)}</span>
          </span>
          <span class="family-item-arrow" aria-hidden="true">›</span>
        </button>`;
    }).join('');
  }

  function renderProfile(member) {
    const age = ageLabel(member.birthDate);
    const bloodType = member.bloodType === 'unknown' ? '미확인' : member.bloodType;
    const allergies = member.allergies.trim() || '등록된 알레르기 정보가 없습니다.';
    const note = member.note.trim() || '등록된 건강 메모가 없습니다.';
    const allergyClass = member.allergies.trim() ? '' : ' is-unset';
    const noteClass = member.note.trim() ? '' : ' is-unset';

    return `
      <section class="profile-card" aria-labelledby="selected-member-name">
        <div class="profile-top">
          <div class="profile-identity">
            <span class="member-avatar member-avatar-large" aria-hidden="true">${avatarInitial(member.name)}</span>
            <div class="profile-title-copy">
              <p class="profile-overline">FAMILY HEALTH PROFILE</p>
              <h2 id="selected-member-name">${escapeHTML(member.name)}</h2>
              <div class="profile-tags">
                <span class="profile-tag">${escapeHTML(member.relationship)}</span>
                <span class="profile-tag subtle">${escapeHTML(age)}</span>
              </div>
            </div>
          </div>
          <div class="profile-stamp" aria-label="개인 건강정보">
            <span class="profile-stamp-mark" aria-hidden="true">♡</span>
            <span>개인 건강정보</span>
          </div>
        </div>
        <div class="profile-facts">
          <div class="profile-fact"><span>관계</span><strong>${escapeHTML(member.relationship)}</strong></div>
          <div class="profile-fact"><span>생년월일</span><strong>${member.birthDate ? escapeHTML(formatDate(member.birthDate)) : '미등록'}</strong></div>
          <div class="profile-fact"><span>나이</span><strong>${escapeHTML(age)}</strong></div>
          <div class="profile-fact"><span>혈액형</span><strong>${escapeHTML(bloodType)}</strong></div>
        </div>
        <div class="profile-extra">
          <div class="profile-extra-item">
            <span>알레르기 · 주의사항</span>
            <p class="${allergyClass.trim()}">${escapeHTML(allergies)}</p>
          </div>
          <div class="profile-extra-item">
            <span>건강 메모</span>
            <p class="${noteClass.trim()}">${escapeHTML(note)}</p>
          </div>
        </div>
      </section>`;
  }

  function renderRecordEntries(memberId) {
    const records = state.records
      .filter((record) => record.memberId === memberId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

    if (records.length === 0) {
      return `
        <div class="empty-list-state">
          <span class="empty-list-symbol" aria-hidden="true">＋</span>
          <strong>아직 건강 기록이 없어요</strong>
          <p>진료나 증상, 검사 결과를 기록해 보세요.</p>
        </div>`;
    }

    return `<ul class="entry-list">${records.map((record) => {
      const kind = Object.prototype.hasOwnProperty.call(RECORD_TYPES, record.type) ? record.type : 'note';
      return `
        <li class="entry-item">
          <span class="entry-symbol kind-${kind}" aria-hidden="true">${kind === 'checkup' ? '＋' : kind === 'symptom' ? '♡' : kind === 'test' ? '✓' : '✎'}</span>
          <div class="entry-copy">
            <div class="entry-meta"><span class="entry-type kind-${kind}">${escapeHTML(RECORD_TYPES[kind])}</span><time class="entry-date" datetime="${escapeHTML(record.date)}">${escapeHTML(formatDate(record.date))}</time></div>
            <h4>${escapeHTML(record.title)}</h4>
            ${record.detail ? `<p>${escapeHTML(record.detail)}</p>` : ''}
          </div>
          <button class="icon-button delete-button" type="button" data-action="delete-record" data-id="${escapeHTML(record.id)}" aria-label="${escapeHTML(record.title)} 기록 삭제" title="건강 기록 삭제">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.8 6.2h10.4M8 6.2V4.7h4v1.5m-5.7 0 .6 9.1c.1.8.6 1.2 1.4 1.2h3.4c.8 0 1.3-.4 1.4-1.2l.6-9.1M8.3 8.8v4.8m3.4-4.8v4.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </li>`;
    }).join('')}</ul>`;
  }

  function sortSchedules(a, b, today) {
    const aUpcoming = a.date >= today;
    const bUpcoming = b.date >= today;
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    const dateOrder = a.date.localeCompare(b.date);
    if (dateOrder !== 0) return aUpcoming ? dateOrder : -dateOrder;
    return a.time.localeCompare(b.time);
  }

  function renderScheduleEntries(memberId) {
    const today = localDateString();
    const schedules = state.schedules
      .filter((schedule) => schedule.memberId === memberId)
      .sort((a, b) => sortSchedules(a, b, today));

    if (schedules.length === 0) {
      return `
        <div class="empty-list-state">
          <span class="empty-list-symbol" aria-hidden="true">◷</span>
          <strong>등록된 일정이 없어요</strong>
          <p>병원 방문이나 복약 일정을 추가해 보세요.</p>
        </div>`;
    }

    return `<ul class="entry-list">${schedules.map((schedule) => {
      const kind = Object.prototype.hasOwnProperty.call(SCHEDULE_TYPES, schedule.type) ? schedule.type : 'hospital';
      const time = schedule.time ? `<span class="schedule-time">${escapeHTML(schedule.time)}</span>` : '';
      return `
        <li class="entry-item">
          <span class="entry-symbol kind-${kind}" aria-hidden="true">${kind === 'hospital' ? '＋' : '◷'}</span>
          <div class="entry-copy">
            <div class="entry-meta"><span class="entry-type kind-${kind}">${escapeHTML(SCHEDULE_TYPES[kind])}</span><time class="entry-date" datetime="${escapeHTML(schedule.date)}">${escapeHTML(formatDate(schedule.date, { month: 'long', day: 'numeric', weekday: 'short' }))}${time}</time></div>
            <h4>${escapeHTML(schedule.title)}</h4>
            ${schedule.detail ? `<p>${escapeHTML(schedule.detail)}</p>` : ''}
          </div>
          <button class="icon-button delete-button" type="button" data-action="delete-schedule" data-id="${escapeHTML(schedule.id)}" aria-label="${escapeHTML(schedule.title)} 일정 삭제" title="일정 삭제">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.8 6.2h10.4M8 6.2V4.7h4v1.5m-5.7 0 .6 9.1c.1.8.6 1.2 1.4 1.2h3.4c.8 0 1.3-.4 1.4-1.2l.6-9.1M8.3 8.8v4.8m3.4-4.8v4.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </li>`;
    }).join('')}</ul>`;
  }

  function renderHealthSection(memberId) {
    const today = escapeHTML(localDateString());
    return `
      <section class="content-card" aria-labelledby="health-record-title">
        <div class="content-card-heading">
          <div>
            <p class="section-kicker">HEALTH LOG</p>
            <h3 id="health-record-title">건강 기록</h3>
            <p class="section-helper">진료, 증상, 검사 결과를 남겨 보세요.</p>
          </div>
          <button class="button-add" type="button" data-action="toggle-form" data-form="record" aria-controls="health-record-form" aria-expanded="false"><span class="button-plus" aria-hidden="true">＋</span><span class="button-label">기록 추가</span></button>
        </div>
        <form id="health-record-form" class="entry-form" hidden>
          <div class="field-row">
            <label class="field"><span>기록 종류</span>
              <select name="type" required>
                <option value="checkup">진료</option>
                <option value="symptom">증상</option>
                <option value="test">검사 결과</option>
                <option value="note">건강 메모</option>
              </select>
            </label>
            <label class="field"><span>기록 날짜</span><input name="date" type="date" value="${today}" required></label>
          </div>
          <label class="field"><span>제목</span><input name="title" type="text" maxlength="80" placeholder="예: 정기 검진, 두통 증상" required></label>
          <label class="field"><span>상세 메모 <span class="optional-label">선택</span></span><textarea name="detail" rows="3" maxlength="600" placeholder="진료 내용이나 몸 상태를 적어 주세요."></textarea></label>
          <div class="form-actions">
            <button class="button button-secondary" type="button" data-action="close-form" data-form="record">취소</button>
            <button class="button button-primary" type="submit">기록 저장</button>
          </div>
        </form>
        ${renderRecordEntries(memberId)}
      </section>`;
  }

  function renderScheduleSection(memberId) {
    const today = escapeHTML(localDateString());
    return `
      <section class="content-card" aria-labelledby="schedule-title">
        <div class="content-card-heading">
          <div>
            <p class="section-kicker">VISITS & MEDICINE</p>
            <h3 id="schedule-title">병원 · 복약 일정</h3>
            <p class="section-helper">방문 예약과 복용 계획을 관리해요.</p>
          </div>
          <button class="button-add" type="button" data-action="toggle-form" data-form="schedule" aria-controls="schedule-form" aria-expanded="false"><span class="button-plus" aria-hidden="true">＋</span><span class="button-label">일정 추가</span></button>
        </div>
        <form id="schedule-form" class="entry-form" hidden>
          <div class="field-row">
            <label class="field"><span>일정 종류</span>
              <select name="type" required>
                <option value="hospital">병원 방문</option>
                <option value="medication">복약 일정</option>
              </select>
            </label>
            <label class="field"><span>날짜</span><input name="date" type="date" value="${today}" required></label>
          </div>
          <label class="field"><span>일정 이름</span><input name="title" type="text" maxlength="80" placeholder="예: 내과 진료, 혈압약 복용" required></label>
          <div class="field-row">
            <label class="field"><span>시간 <span class="optional-label">선택</span></span><input name="time" type="time"></label>
            <label class="field"><span>장소 · 복용 메모 <span class="optional-label">선택</span></span><input name="detail" type="text" maxlength="400" placeholder="예: 새봄의원, 1정 식후"></label>
          </div>
          <div class="form-actions">
            <button class="button button-secondary" type="button" data-action="close-form" data-form="schedule">취소</button>
            <button class="button button-primary" type="submit">일정 저장</button>
          </div>
        </form>
        ${renderScheduleEntries(memberId)}
      </section>`;
  }

  function renderEmptyDetail() {
    return `
      <section class="empty-detail" aria-labelledby="empty-detail-title">
        <span class="empty-detail-icon" aria-hidden="true">♡</span>
        <h2 id="empty-detail-title">가족 건강수첩을 시작해 보세요</h2>
        <p>가족 구성원을 등록하면 개인별 건강정보를 확인하고, 건강기록과 병원·복약 일정을 차곡차곡 관리할 수 있어요.</p>
        <button class="button button-primary" type="button" data-action="open-member-dialog">첫 가족 구성원 등록</button>
      </section>`;
  }

  function renderMemberDetail(member) {
    return `${renderProfile(member)}
      <div class="records-schedules-grid">
        ${renderHealthSection(member.id)}
        ${renderScheduleSection(member.id)}
      </div>`;
  }

  function renderAll() {
    if (!state.members.some((member) => member.id === selectedMemberId)) {
      selectedMemberId = state.members.length ? state.members[0].id : null;
    }

    const today = localDateString();
    elements.memberCount.innerHTML = `${state.members.length}<span>명</span>`;
    elements.recordCount.innerHTML = `${state.records.length}<span>건</span>`;
    const upcomingSchedules = state.schedules.filter((schedule) => schedule.date >= today).length;
    elements.scheduleCount.innerHTML = `${upcomingSchedules}<span>건</span>`;

    renderFamilyList();
    const selectedMember = state.members.find((member) => member.id === selectedMemberId);
    elements.memberDetail.innerHTML = selectedMember ? renderMemberDetail(selectedMember) : renderEmptyDetail();
    updateTodayLabel();
    updateStorageStatus();
  }

  function showToast(message, kind = 'success') {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle('is-warning', kind === 'warning');
    elements.toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => {
      elements.toast.classList.remove('is-visible');
    }, 3200);
  }

  function saveRenderAndNotify(successMessage) {
    const saved = saveState();
    renderAll();
    if (saved) {
      showToast(successMessage);
    } else {
      showToast('브라우저 저장 공간에 저장하지 못했습니다. 이 탭을 닫으면 변경 내용이 사라질 수 있어요.', 'warning');
    }
  }

  function openMemberDialog() {
    elements.memberForm.reset();
    elements.memberBirthDate.max = localDateString();
    if (typeof elements.memberDialog.showModal === 'function') {
      elements.memberDialog.showModal();
      window.setTimeout(() => elements.memberName.focus(), 0);
    } else {
      showToast('현재 브라우저에서는 등록 창을 열 수 없습니다. 최신 브라우저를 이용해 주세요.', 'warning');
    }
  }

  function setFormOpen(formType, open) {
    const formId = formType === 'record' ? 'health-record-form' : formType === 'schedule' ? 'schedule-form' : '';
    if (!formId) return;
    const form = elements.memberDetail.querySelector(`#${formId}`);
    const trigger = elements.memberDetail.querySelector(`[data-action="toggle-form"][data-form="${formType}"]`);
    if (!form || !trigger) return;
    form.hidden = !open;
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    const label = trigger.querySelector('.button-label');
    const plus = trigger.querySelector('.button-plus');
    if (label) label.textContent = open ? '닫기' : (formType === 'record' ? '기록 추가' : '일정 추가');
    if (plus) plus.textContent = open ? '×' : '＋';
    if (open) {
      const firstInput = form.querySelector('select, input, textarea');
      if (firstInput) firstInput.focus();
    } else {
      form.reset();
    }
  }

  function formString(formData, name) {
    const value = formData.get(name);
    return typeof value === 'string' ? value.trim() : '';
  }

  function handleMemberSubmit(event) {
    event.preventDefault();
    const data = new FormData(elements.memberForm);
    const name = formString(data, 'name');
    const relationship = formString(data, 'relationship');
    const birthDate = formString(data, 'birthDate');
    const bloodType = formString(data, 'bloodType');

    if (!name) {
      elements.memberName.focus();
      showToast('이름을 입력해 주세요.', 'warning');
      return;
    }
    if (birthDate && !isISODate(birthDate)) {
      showToast('생년월일을 확인해 주세요.', 'warning');
      return;
    }

    const member = {
      id: makeId(),
      name: name.slice(0, 40),
      relationship: RELATIONSHIPS.has(relationship) ? relationship : '기타',
      birthDate,
      bloodType: BLOOD_TYPES.has(bloodType) ? bloodType : 'unknown',
      allergies: formString(data, 'allergies').slice(0, 160),
      note: formString(data, 'note').slice(0, 500),
      createdAt: new Date().toISOString()
    };

    state.members.push(member);
    selectedMemberId = member.id;
    elements.memberDialog.close();
    saveRenderAndNotify(`${member.name} 구성원을 등록했습니다.`);
  }

  function handleRecordSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const member = state.members.find((item) => item.id === selectedMemberId);
    if (!member) return;

    const data = new FormData(form);
    const title = formString(data, 'title');
    const date = formString(data, 'date');
    const selectedType = formString(data, 'type');
    if (!title || !isISODate(date)) {
      showToast('제목과 올바른 기록 날짜를 입력해 주세요.', 'warning');
      return;
    }
    const type = Object.prototype.hasOwnProperty.call(RECORD_TYPES, selectedType) ? selectedType : 'note';
    state.records.push({
      id: makeId(),
      memberId: member.id,
      type,
      title: title.slice(0, 80),
      date,
      detail: formString(data, 'detail').slice(0, 600),
      createdAt: new Date().toISOString()
    });
    saveRenderAndNotify('건강 기록을 저장했습니다.');
  }

  function handleScheduleSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const member = state.members.find((item) => item.id === selectedMemberId);
    if (!member) return;

    const data = new FormData(form);
    const title = formString(data, 'title');
    const date = formString(data, 'date');
    const time = formString(data, 'time');
    const selectedType = formString(data, 'type');
    if (!title || !isISODate(date) || (time && !isISOTime(time))) {
      showToast('일정 이름과 올바른 날짜·시간을 입력해 주세요.', 'warning');
      return;
    }
    const type = Object.prototype.hasOwnProperty.call(SCHEDULE_TYPES, selectedType) ? selectedType : 'hospital';
    state.schedules.push({
      id: makeId(),
      memberId: member.id,
      type,
      title: title.slice(0, 80),
      date,
      time,
      detail: formString(data, 'detail').slice(0, 400),
      createdAt: new Date().toISOString()
    });
    saveRenderAndNotify('병원·복약 일정을 저장했습니다.');
  }

  function handleDeleteRecord(id) {
    const record = state.records.find((item) => item.id === id && item.memberId === selectedMemberId);
    if (!record) return;
    if (!window.confirm(`“${record.title}” 건강 기록을 삭제할까요?`)) return;
    state.records = state.records.filter((item) => item.id !== id);
    saveRenderAndNotify('건강 기록을 삭제했습니다.');
  }

  function handleDeleteSchedule(id) {
    const schedule = state.schedules.find((item) => item.id === id && item.memberId === selectedMemberId);
    if (!schedule) return;
    if (!window.confirm(`“${schedule.title}” 일정을 삭제할까요?`)) return;
    state.schedules = state.schedules.filter((item) => item.id !== id);
    saveRenderAndNotify('일정을 삭제했습니다.');
  }

  function handleDocumentClick(event) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('button');
    if (!button) return;

    const action = button.dataset.action;
    if (button.id === 'add-member-button' || action === 'open-member-dialog') {
      openMemberDialog();
      return;
    }

    if (action === 'close-member-dialog') {
      elements.memberDialog.close();
    } else if (action === 'toggle-form') {
      const isOpen = button.getAttribute('aria-expanded') === 'true';
      setFormOpen(button.dataset.form, !isOpen);
    } else if (action === 'close-form') {
      setFormOpen(button.dataset.form, false);
    } else if (action === 'delete-record') {
      handleDeleteRecord(button.dataset.id);
    } else if (action === 'delete-schedule') {
      handleDeleteSchedule(button.dataset.id);
    }
  }

  function initialize() {
    updateTodayLabel();
    elements.familyList.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const memberButton = event.target.closest('[data-member-id]');
      if (!memberButton) return;
      const member = state.members.find((item) => item.id === memberButton.dataset.memberId);
      if (!member) return;
      selectedMemberId = member.id;
      renderAll();
    });

    elements.memberForm.addEventListener('submit', handleMemberSubmit);
    elements.memberDetail.addEventListener('submit', (event) => {
      if (!(event.target instanceof HTMLFormElement)) return;
      if (event.target.id === 'health-record-form') handleRecordSubmit(event);
      if (event.target.id === 'schedule-form') handleScheduleSubmit(event);
    });
    elements.memberDialog.addEventListener('click', (event) => {
      if (event.target === elements.memberDialog) elements.memberDialog.close();
    });
    document.addEventListener('click', handleDocumentClick);

    renderAll();
    if (loadNotice) showToast(loadNotice, 'warning');
  }

  initialize();
})();
