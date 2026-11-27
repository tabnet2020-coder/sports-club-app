/* global QRCode, XLSX, Html5Qrcode */
import { calculateBMI, calculateRemaining, hashSerial } from './utils/core.js';

// ==================== SECURITY & ACTIVATION CONFIG ====================
    const KEYS = {
      CLUB: 'sfc_club_settings_v1',
      MEMBERS: 'sfc_members_v1',
      USERS: 'sfc_users_v2',
      ATTENDANCE: 'sfc_attendance_v1',
      VISITORS: 'sfc_visitors_v1',
      LICENSE: 'sfc_license_ip_v1',
      SESSION_USER: 'sfc_session_user_v2'
    };

    const VISITOR_PASS = 'tabzed6699';

    // Valid Activation Keys (Hashed — plain keys are in private activation_keys.txt)
    const VALID_KEY_HASHES = [
      '878135ffd0a6d9c9',
      '52ebc4b70ff32091',
      'a8e475301de6337d',
      'e70d9445bc099ebf',
      '61d6a1ec8fcd00e9',
      '9db08e2af8608fd5',
      '27f52170a69f9ecd',
      '435b297f54909a01',
      '79fa4ae06cf11149',
      'f6ccf4da281f05c7',
      '2c77bb8113b6e609',
      'd6e92633bdddb9f5',
      'a0cbc55976913c51',
      'e823d0ef466af71b',
      'a18d1e9dfe8d1299',
      '5999a269293d1e6f',
      '25c88b2dd7617e51',
      '61699d6d4261b8c5',
      '1d2ebc264ba8bf17',
      '4427c1aa1e4dbb0d',
      '4882704b29fff4bb',
      '7fe905cf1707cd59',
      '617792a1504ca76d',
      'b3ae3eeb708afb43',
      'bf36f87182ddb687'
    ];

    // hashSerial imported from ./utils/core.js

    const DEFAULT_CLUB = {
      name: 'نادي اللياقة الذكي',
      tagline: 'صحتك ولياقتك تبدأ بخطوة ذكية كل يوم',
      address: 'سبها، ليبيا',
      mapUrl: '',
      appUrl: window.location.href
    };

    const DEFAULT_ADMIN = {
      id: 'ADMIN-MAIN',
      fullName: 'الأدمن الرئيسي',
      username: 'mo7eb',
      password: 'tabzed6699@#',
      role: 'الأدمن الرئيسي',
      active: true,
      protected: true
    };

    const TIPS = {
      morning: [
        'ابدأ يومك بكوبين من الماء وتمارين إطالة لمدة 10 دقائق لتنشيط الدورة الدموية.',
        'وجبة إفطار غنية بالبروتين والشوفان تمنحك طاقة ثابتة طوال تمرين الصباح.',
        'الإحماء الجيد قبل رفع الأوزان يحمي المفاصل ويضاعف كفاءة التمرين.',
        'التنفس العميق والمنتظم أثناء التمارين يقلل الإجهاد ويزيد القدرة على التحمل.'
      ],
      evening: [
        'تمارين التهدئة والإطالة بعد تمرين المساء تساعد العضلات على الاستشفاء السريع.',
        'احرص على شرب كمية كافية من الماء وتناول وجبة خفيفة غنية بالبروتين بعد التمرين.',
        'النوم الجيد لمدة 7–8 ساعات هو جزء أساسي من بناء العضلات وحرق الدهون.',
        'تجنب الكافيين قبل النوم بـ 5 ساعات للحفاظ على جودة الاستشفاء الليلي.'
      ]
    };

    function loadUsersWithMigration() {
      let users = JSON.parse(localStorage.getItem(KEYS.USERS) || 'null');
      if (!users) {
        // Migrate non-admin users from old v1 key if present
        const oldUsers = JSON.parse(localStorage.getItem('sfc_users_v1') || '[]');
        const others = oldUsers.filter(u => u.id !== 'ADMIN-MAIN');
        users = [DEFAULT_ADMIN, ...others];
      } else {
        const idx = users.findIndex(u => u.id === 'ADMIN-MAIN');
        if (idx === -1) users.unshift(DEFAULT_ADMIN);
        else users[idx] = { ...DEFAULT_ADMIN };
      }
      localStorage.setItem(KEYS.USERS, JSON.stringify(users));
      return users;
    }

    let state = {
      club: JSON.parse(localStorage.getItem(KEYS.CLUB) || 'null') || { ...DEFAULT_CLUB },
      members: JSON.parse(localStorage.getItem(KEYS.MEMBERS) || '[]'),
      users: loadUsersWithMigration(),
      attendance: JSON.parse(localStorage.getItem(KEYS.ATTENDANCE) || '[]'),
      visitors: JSON.parse(localStorage.getItem(KEYS.VISITORS) || '[]'),
      license: JSON.parse(localStorage.getItem(KEYS.LICENSE) || 'null'),
      activeUser: JSON.parse(sessionStorage.getItem(KEYS.SESSION_USER) || 'null'),
      currentIp: null,
      tipPeriod: new Date().getHours() < 15 ? 'morning' : 'evening',
      tipIndex: 0,
      sessionId: 'SES-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      scanner: null,
      deferredPrompt: null
    };

    function persist() {
      localStorage.setItem(KEYS.CLUB, JSON.stringify(state.club));
      localStorage.setItem(KEYS.MEMBERS, JSON.stringify(state.members));
      localStorage.setItem(KEYS.USERS, JSON.stringify(state.users));
      localStorage.setItem(KEYS.ATTENDANCE, JSON.stringify(state.attendance));
      localStorage.setItem(KEYS.VISITORS, JSON.stringify(state.visitors));
      if (state.license) localStorage.setItem(KEYS.LICENSE, JSON.stringify(state.license));
      else localStorage.removeItem(KEYS.LICENSE);
      if (state.activeUser) sessionStorage.setItem(KEYS.SESSION_USER, JSON.stringify(state.activeUser));
      else sessionStorage.removeItem(KEYS.SESSION_USER);
    }

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 3400);
    }

    // ==================== PUBLIC IP DETECTION & LICENSE CHECK ====================
    async function fetchPublicIp() {
      const endpoints = [
        async () => {
          const r = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
          const d = await r.json();
          return d.ip;
        },
        async () => {
          const r = await fetch('https://api64.ipify.org?format=json', { cache: 'no-store' });
          const d = await r.json();
          return d.ip;
        },
        async () => {
          const r = await fetch('https://ipwho.is/', { cache: 'no-store' });
          const d = await r.json();
          return d.ip;
        }
      ];
      for (const fn of endpoints) {
        try {
          const ip = await fn();
          if (ip && typeof ip === 'string') return ip.trim();
        } catch (_) {}
      }
      return null;
    }

    function isMobileDevice() {
      return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth <= 820;
    }

    function isIOSDevice() {
      return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function isStandaloneMode() {
      return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    }

    function openActivationFromPublic() {
      document.getElementById('publicHomeView').classList.remove('active');
      document.getElementById('activationGate').classList.add('active');
    }

    function handleSmartInstall() {
      if (isStandaloneMode()) {
        return showToast('✅ التطبيق مثبّت بالفعل على جهازك');
      }
      if (state.deferredPrompt) {
        state.deferredPrompt.prompt();
        state.deferredPrompt.userChoice.then((choice) => {
          if (choice.outcome === 'accepted') {
            showToast('✅ جاري تثبيت التطبيق على هاتفك...');
            const b = document.getElementById('smartInstallBanner');
            if (b) b.style.display = 'none';
          }
          state.deferredPrompt = null;
          document.getElementById('installPwaBtn').style.display = 'none';
        });
        return;
      }
      // Show clear OS-specific direct instructions (iOS Safari or Android Chrome)
      const title = document.getElementById('installGuideTitle');
      const body = document.getElementById('installGuideBody');
      if (isIOSDevice()) {
        title.textContent = '📲 تثبيت التطبيق على الآيفون (iOS)';
        body.innerHTML = `
          <div>1️⃣ افتح الرابط في متصفح <strong>Safari</strong>.</div>
          <div>2️⃣ اضغط على زر <strong>المشاركة (⬆️)</strong> في أسفل الشاشة.</div>
          <div>3️⃣ اختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong> ثم اضغط <strong>إضافة</strong>.</div>
        `;
      } else {
        title.textContent = '📲 تثبيت التطبيق على الأندرويد (Android)';
        body.innerHTML = `
          <div>1️⃣ اضغط على قائمة المتصفح <strong>(⋮)</strong> في أعلى الشاشة.</div>
          <div>2️⃣ اختر <strong>تثبيت التطبيق (Install App)</strong> أو <strong>إضافة إلى الشاشة الرئيسية</strong>.</div>
          <div>3️⃣ اضغط <strong>تثبيت</strong> وسيظهر التطبيق فوراً بين تطبيقاتك.</div>
        `;
      }
      document.getElementById('installGuideModal').classList.add('open');
    }

    async function enforceSecurityGates() {
      const activationGate = document.getElementById('activationGate');
      const loginGate = document.getElementById('loginGate');
      const publicHome = document.getElementById('publicHomeView');
      const appShell = document.getElementById('appShell');
      const ipPill = document.getElementById('detectedIpPill');
      const actErr = document.getElementById('activationError');

      activationGate.classList.remove('active');
      loginGate.classList.remove('active');
      publicHome.classList.remove('active');
      appShell.classList.remove('unlocked');

      // Hide install banner if already installed as standalone app
      const smartBanner = document.getElementById('smartInstallBanner');
      if (smartBanner) smartBanner.style.display = isStandaloneMode() ? 'none' : 'flex';

      state.currentIp = await fetchPublicIp();
      if (state.currentIp) {
        ipPill.textContent = '🌐 IP الجهاز الحالي: ' + state.currentIp;
      } else {
        ipPill.textContent = '⚠️ تعذر الاتصال بالإنترنت للتحقق من IP';
      }

      const lic = state.license;
      const isValidStoredHash = lic && VALID_KEY_HASHES.includes(lic.keyHash);
      const ipMatches = !state.currentIp || !lic?.boundIp || lic.boundIp === state.currentIp;

      // Mobile Phone Mode: Show Public Club Home Interface (no internal details) until user logs in!
      if (isMobileDevice() && !state.activeUser) {
        renderPublicHome();
        publicHome.classList.add('active');
        // If opened via QR code (?install=1) on iOS, gently guide installation
        if (new URLSearchParams(window.location.search).get('install') === '1' && !isStandaloneMode() && isIOSDevice()) {
          setTimeout(() => handleSmartInstall(), 700);
        }
        return;
      }

      // If logged in on mobile (Member, Coach, or Admin), unlock appShell directly
      if (isMobileDevice() && state.activeUser) {
        appShell.classList.add('unlocked');
        renderAll();
        return;
      }

      // Desktop Mode: Enforce Serial & IP Activation
      if (!lic || !isValidStoredHash) {
        activationGate.classList.add('active');
        return;
      }

      if (!ipMatches) {
        actErr.style.display = 'block';
        actErr.innerHTML = `⛔ تم رصد تغيير في عنوان IP الجهاز!<br>العنوان المفعّل: <strong>${lic.boundIp}</strong><br>العنوان الحالي: <strong>${state.currentIp}</strong><br>يرجى إعادة التفعيل بسيريال صالح لهذا الجهاز.`;
        activationGate.classList.add('active');
        logVisitorAction('رفض وصول: عدم تطابق IP التفعيل');
        return;
      }

      if (!state.activeUser) {
        state.activeUser = DEFAULT_ADMIN;
        persist();
      }

      appShell.classList.add('unlocked');
      renderAll();
    }

    function renderPublicHome() {
      document.title = state.club.name;
      document.getElementById('pubClubName').textContent = state.club.name;
      document.getElementById('pubClubTagline').textContent = state.club.tagline;
      document.getElementById('pubAddressText').textContent = state.club.address;
      document.getElementById('footerAddress').textContent = state.club.address;
      document.getElementById('pubMapFrame').src = getEmbedMapSrc();
      renderTip();
    }

    async function activateLicense(e) {
      e.preventDefault();
      const input = document.getElementById('serialKeyInput').value.trim().toUpperCase();
      const errBox = document.getElementById('activationError');
      errBox.style.display = 'none';

      if (!state.currentIp) {
        state.currentIp = await fetchPublicIp();
      }
      if (!state.currentIp) {
        errBox.style.display = 'block';
        errBox.textContent = '⚠️ يلزم الاتصال بالإنترنت للتحقق من عنوان IP الجهاز وتفعيل السيريال.';
        return;
      }

      const hashed = hashSerial(input);
      if (!VALID_KEY_HASHES.includes(hashed)) {
        errBox.style.display = 'block';
        errBox.textContent = '❌ مفتاح التفعيل غير صحيح! يرجى التأكد من السيريال والمحاولة مرة أخرى.';
        logVisitorAction('محاولة تفعيل فاشلة بسيريال خاطئ');
        return;
      }

      state.license = {
        keyHash: hashed,
        maskedKey: input.slice(0, 8) + '-****-' + input.slice(-4),
        boundIp: state.currentIp,
        activatedAt: new Date().toLocaleString('ar-LY')
      };
      persist();
      document.getElementById('serialKeyInput').value = '';
      logVisitorAction('تفعيل النظام بنجاح على IP: ' + state.currentIp);
      showToast('✅ تم تفعيل النظام وربطه بـ IP الجهاز بنجاح');
      enforceSecurityGates();
    }

    function deactivateLicense() {
      if (!state.activeUser || !state.activeUser.protected) {
        return showToast('هذه الصلاحية للأدمن الرئيسي فقط');
      }
      if (!confirm('هل تريد إلغاء تفعيل هذا الجهاز؟ سيُطلب إدخال مفتاح تفعيل جديد.')) return;
      state.license = null;
      state.activeUser = null;
      persist();
      logVisitorAction('إلغاء تفعيل الجهاز من قبل الأدمن الرئيسي');
      enforceSecurityGates();
    }

    function handleGateLogin(e) {
      e.preventDefault();
      const un = document.getElementById('gateUsername').value.trim();
      const pw = document.getElementById('gatePassword').value;
      const errBox = document.getElementById('loginError');
      errBox.style.display = 'none';

      const found = state.users.find(u => u.username === un && u.password === pw);
      if (!found) {
        errBox.style.display = 'block';
        errBox.textContent = '❌ اسم المستخدم أو كلمة المرور غير صحيحة.';
        logVisitorAction('محاولة دخول فاشلة لاسم المستخدم: ' + un);
        return;
      }
      if (!found.active) {
        errBox.style.display = 'block';
        errBox.textContent = '⛔ هذا الحساب معطّل حالياً. تواصل مع الأدمن الرئيسي.';
        return;
      }

      state.activeUser = found;
      persist();
      document.getElementById('gateUsername').value = '';
      document.getElementById('gatePassword').value = '';
      logVisitorAction('تسجيل دخول ناجح: ' + (found.protected ? 'الأدمن الرئيسي' : found.fullName));
      showToast('مرحباً بك، ' + (found.protected ? 'الأدمن الرئيسي' : found.fullName));
      enforceSecurityGates();
    }

    function logoutUser() {
      openLoginModal();
    }

    // ==================== VISITOR LOGGING ====================
    function getDeviceSummary() {
      const ua = navigator.userAgent;
      const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
      const os = /Windows/i.test(ua) ? 'Windows' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Mac/i.test(ua) ? 'macOS' : 'Linux';
      const browser = /Edg/i.test(ua) ? 'Edge' : /Chrome/i.test(ua) ? 'Chrome' : /Firefox/i.test(ua) ? 'Firefox' : /Safari/i.test(ua) ? 'Safari' : 'Browser';
      return `${isMobile ? 'هاتف' : 'حاسوب'} • ${os} • ${browser}`;
    }

    function logVisitorAction(action) {
      const userLabel = state.activeUser
        ? (state.activeUser.protected ? 'الأدمن الرئيسي' : `${state.activeUser.fullName} (${state.activeUser.role})`)
        : 'غير مسجل';
      const entry = {
        time: new Date().toLocaleString('ar-LY'),
        sessionId: state.sessionId,
        ip: state.currentIp || '—',
        action,
        user: userLabel,
        device: getDeviceSummary()
      };
      state.visitors.unshift(entry);
      if (state.visitors.length > 1000) state.visitors.length = 1000;
      persist();
    }

    // ==================== NAVIGATION ====================
    function switchTab(tabName, btnEl) {
      const hasFullAccess = state.activeUser && (state.activeUser.protected || state.activeUser.role === 'أدمن' || state.activeUser.role === 'مدرب' || state.activeUser.role === 'مدربة');
      if (tabName === 'users' && !hasFullAccess) {
        return showToast('قسم المستخدمين مخصص للأدمن والمدربين فقط');
      }
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.sport-btn').forEach(b => b.classList.remove('active'));
      const target = document.getElementById('tab-' + tabName);
      if (target) target.classList.add('active');
      if (btnEl) btnEl.classList.add('active');
      if (tabName !== 'barcode') stopCameraScanner();
      logVisitorAction('الانتقال إلى قسم: ' + tabName);
    }

    // ==================== TIPS ====================
    function renderTip() {
      const list = TIPS[state.tipPeriod];
      const isMorning = state.tipPeriod === 'morning';
      const titleText = isMorning ? '☀️ تلميح الصباح الرياضي' : '🌙 تلميح المساء الرياضي';
      const bodyText = list[state.tipIndex % list.length];
      document.getElementById('tipPeriodTitle').textContent = titleText;
      document.getElementById('tipContent').textContent = bodyText;
      const pt = document.getElementById('pubTipTitle');
      const pc = document.getElementById('pubTipContent');
      if (pt) pt.textContent = titleText;
      if (pc) pc.textContent = bodyText;
    }
    function toggleTipPeriod() {
      state.tipPeriod = state.tipPeriod === 'morning' ? 'evening' : 'morning';
      state.tipIndex = 0;
      renderTip();
    }
    function nextTip() {
      state.tipIndex++;
      renderTip();
    }

    // ==================== CLUB BRAND, LOCATION & QR ====================
    function getEffectiveMapLink() {
      if (state.club.mapUrl && state.club.mapUrl.trim()) return state.club.mapUrl.trim();
      return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(state.club.address || 'سبها، ليبيا');
    }

    function getEmbedMapSrc() {
      const q = encodeURIComponent(state.club.address || 'سبها، ليبيا');
      return `https://maps.google.com/maps?q=${q}&t=&z=14&ie=UTF8&iwloc=&output=embed`;
    }

    function renderQR(containerId, text, size = 150) {
      const el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = '';
      if (typeof QRCode !== 'undefined') {
        new QRCode(el, { text: text || 'https://example.com', width: size, height: size, colorDark: '#0f172a', colorLight: '#ffffff' });
      }
    }

    function renderClubUI() {
      document.title = state.club.name + ' - إدارة النادي الرياضي';
      document.getElementById('headerClubName').textContent = state.club.name;
      document.getElementById('headerClubTagline').textContent = state.club.tagline;
      document.getElementById('dashAddressText').textContent = state.club.address;
      document.getElementById('footerAddress').textContent = state.club.address;
      document.getElementById('clubAddressInput').value = state.club.address;
      document.getElementById('clubMapUrlInput').value = state.club.mapUrl || '';
      const appUrl = state.club.appUrl || window.location.href;
      document.getElementById('appUrlInput').value = appUrl;
      document.getElementById('dashAppUrlLabel').textContent = appUrl;

      const mapLink = getEffectiveMapLink();
      renderQR('dashLocationQr', mapLink, 145);
      renderQR('settingsLocationQr', mapLink, 155);
      const qrInstallUrl = appUrl.includes('?') ? appUrl + '&install=1' : appUrl + '?install=1';
      renderQR('dashAppQr', qrInstallUrl, 145);
      renderQR('settingsAppQr', qrInstallUrl, 155);
      document.getElementById('dashMapFrame').src = getEmbedMapSrc();

      // Top bar badge: hide personal name for Main Admin and show only "الأدمن الرئيسي"
      if (state.activeUser) {
        const badgeText = state.activeUser.protected
          ? '👤 الأدمن الرئيسي'
          : `👤 ${state.activeUser.fullName} (${state.activeUser.role})`;
        document.getElementById('activeUserBadge').textContent = badgeText;
      }

      // License details card
      if (state.license) {
        document.getElementById('licenseDetailsGrid').innerHTML = `
          <div><strong>المفتاح المفعّل:</strong> <code dir="ltr">${state.license.maskedKey}</code></div>
          <div><strong>IP المرتبط:</strong> <code dir="ltr">${state.license.boundIp}</code></div>
          <div><strong>تاريخ التفعيل:</strong> ${state.license.activatedAt}</div>
        `;
        document.getElementById('deactivateBtn').style.display =
          (state.activeUser && state.activeUser.protected) ? 'inline-flex' : 'none';
      }
    }

    function openClubSettingsModal() {
      document.getElementById('inputClubName').value = state.club.name;
      document.getElementById('inputClubTagline').value = state.club.tagline;
      document.getElementById('clubSettingsModal').classList.add('open');
    }

    function saveClubBrand() {
      const name = document.getElementById('inputClubName').value.trim();
      const tagline = document.getElementById('inputClubTagline').value.trim();
      if (!name) return showToast('يرجى إدخال اسم النادي');
      state.club.name = name;
      state.club.tagline = tagline || DEFAULT_CLUB.tagline;
      persist();
      renderClubUI();
      closeModal('clubSettingsModal');
      logVisitorAction('تحديث اسم النادي إلى: ' + name);
      showToast('تم تحديث اسم النادي بنجاح');
    }

    function saveClubLocation() {
      state.club.address = document.getElementById('clubAddressInput').value.trim() || 'سبها، ليبيا';
      state.club.mapUrl = document.getElementById('clubMapUrlInput').value.trim();
      persist();
      renderClubUI();
      logVisitorAction('تحديث عنوان النادي والخريطة');
      showToast('تم تحديث العنوان والباركود والخريطة بنجاح');
    }

    function saveAppUrl() {
      const url = document.getElementById('appUrlInput').value.trim();
      if (!url) return showToast('يرجى إدخال رابط التطبيق');
      state.club.appUrl = url;
      persist();
      renderClubUI();
      logVisitorAction('تحديث رابط تثبيت التطبيق');
      showToast('تم تحديث باركود تثبيت التطبيق');
    }

    // ==================== REGISTRATION & MEMBERS ====================
    function calcBMI() {
      const { value, status } = calculateBMI(
        document.getElementById('mWeight').value,
        document.getElementById('mHeight').value
      );
      const out = document.getElementById('mBmiDisplay');
      out.value = value !== null ? `${value.toFixed(1)} (${status})` : '';
    }

    function calcRemaining() {
      const rem = calculateRemaining(
        document.getElementById('mTotalFee').value,
        document.getElementById('mPaidAmount').value
      );
      document.getElementById('mRemaining').value = rem.toFixed(2);
    }

    function toggleDiseaseFields() {
      document.getElementById('diseaseBox').style.display =
        document.getElementById('mHasDisease').value === 'نعم' ? 'block' : 'none';
    }

    function toggleInjuryFields() {
      document.getElementById('injuryBox').style.display =
        document.getElementById('mHasInjury').value === 'نعم' ? 'block' : 'none';
    }

    function resetRegistrationForm() {
      document.getElementById('memberForm').reset();
      document.getElementById('editMemberId').value = '';
      document.getElementById('regFormTitle').textContent = '📝 استمارة تسجيل مشترك جديد';
      loadSavedTheme();
    document.getElementById('mPayDate').value = new Date().toISOString().split('T')[0];
      document.getElementById('mBmiDisplay').value = '';
      toggleDiseaseFields();
      toggleInjuryFields();
    }

    function saveMember(e) {
      e.preventDefault();
      const editId = document.getElementById('editMemberId').value;
      const checkedDiseases = Array.from(document.querySelectorAll('input[name="diseases"]:checked')).map(c => c.value);
      const otherDisease = document.getElementById('mOtherDisease').value.trim();
      if (otherDisease) checkedDiseases.push(otherDisease);

      const totalFee = parseFloat(document.getElementById('mTotalFee').value) || 0;
      const paidAmount = parseFloat(document.getElementById('mPaidAmount').value) || 0;

      const memberData = {
        id: editId || ('CLUB-' + (1000 + state.members.length + 1) + '-' + Math.floor(10 + Math.random() * 89)),
        name: document.getElementById('mName').value.trim(),
        age: document.getElementById('mAge').value,
        phone: document.getElementById('mPhone').value.trim(),
        weight: document.getElementById('mWeight').value,
        height: document.getElementById('mHeight').value,
        bmi: document.getElementById('mBmiDisplay').value,
        hasDisease: document.getElementById('mHasDisease').value,
        diseases: document.getElementById('mHasDisease').value === 'نعم' ? checkedDiseases : [],
        hasInjury: document.getElementById('mHasInjury').value,
        injuryLocation: document.getElementById('mHasInjury').value === 'نعم' ? document.getElementById('mInjuryLocation').value.trim() : '',
        measurements: {
          armRight: document.getElementById('mArmRight').value || '-',
          armLeft: document.getElementById('mArmLeft').value || '-',
          thighRight: document.getElementById('mThighRight').value || '-',
          thighLeft: document.getElementById('mThighLeft').value || '-',
          glutes: document.getElementById('mGlutes').value || '-',
          waist: document.getElementById('mWaist').value || '-',
          chest: document.getElementById('mChest').value || '-',
          shoulders: document.getElementById('mShoulders').value || '-'
        },
        shift: document.getElementById('mShift').value,
        coach: document.getElementById('mCoach').value.trim(),
        totalFee,
        paidAmount,
        remaining: Math.max(0, totalFee - paidAmount),
        paymentMethod: document.getElementById('mPaymentMethod').value,
        payDate: document.getElementById('mPayDate').value || new Date().toISOString().split('T')[0],
        notes: document.getElementById('mNotes').value.trim(),
        accountUsername: (document.getElementById('mAccountUsername').value.trim() || document.getElementById('mPhone').value.trim()),
        accountPassword: (document.getElementById('mAccountPassword').value.trim() || '1234'),
        createdAt: new Date().toISOString()
      };

      if (editId) {
        const idx = state.members.findIndex(m => m.id === editId);
        if (idx !== -1) {
          memberData.plan = state.members[idx].plan || null;
          memberData.sharedImages = state.members[idx].sharedImages || [];
          state.members[idx] = memberData;
        }
        logVisitorAction('تعديل بيانات مشترك: ' + memberData.name);
        showToast('تم تحديث بيانات المشترك بنجاح');
      } else {
        state.members.unshift(memberData);
        logVisitorAction('تسجيل مشترك جديد: ' + memberData.name);
        showToast('تم تسجيل المشترك وإصدار الباركود: ' + memberData.id);
      }

      persist();
      renderAll();
      resetRegistrationForm();
      openMemberProfile(memberData.id);
    }

    function editMember(id) {
      const m = state.members.find(x => x.id === id);
      if (!m) return;
      document.getElementById('editMemberId').value = m.id;
      document.getElementById('regFormTitle').textContent = '✏️ تعديل بيانات المشترك: ' + m.name;
      document.getElementById('mName').value = m.name;
      document.getElementById('mAge').value = m.age;
      document.getElementById('mPhone').value = m.phone;
      document.getElementById('mWeight').value = m.weight;
      document.getElementById('mHeight').value = m.height;
      calcBMI();
      document.getElementById('mHasDisease').value = m.hasDisease || 'لا';
      toggleDiseaseFields();
      document.querySelectorAll('input[name="diseases"]').forEach(c => {
        c.checked = (m.diseases || []).includes(c.value);
      });
      document.getElementById('mHasInjury').value = m.hasInjury || 'لا';
      toggleInjuryFields();
      document.getElementById('mInjuryLocation').value = m.injuryLocation || '';
      const ms = m.measurements || {};
      document.getElementById('mArmRight').value = ms.armRight !== '-' ? ms.armRight : '';
      document.getElementById('mArmLeft').value = ms.armLeft !== '-' ? ms.armLeft : '';
      document.getElementById('mThighRight').value = ms.thighRight !== '-' ? ms.thighRight : '';
      document.getElementById('mThighLeft').value = ms.thighLeft !== '-' ? ms.thighLeft : '';
      document.getElementById('mGlutes').value = ms.glutes !== '-' ? ms.glutes : '';
      document.getElementById('mWaist').value = ms.waist !== '-' ? ms.waist : '';
      document.getElementById('mChest').value = ms.chest !== '-' ? ms.chest : '';
      document.getElementById('mShoulders').value = ms.shoulders !== '-' ? ms.shoulders : '';
      document.getElementById('mShift').value = m.shift;
      document.getElementById('mCoach').value = m.coach;
      document.getElementById('mTotalFee').value = m.totalFee;
      document.getElementById('mPaidAmount').value = m.paidAmount;
      calcRemaining();
      document.getElementById('mPaymentMethod').value = m.paymentMethod;
      document.getElementById('mPayDate').value = m.payDate;
      document.getElementById('mNotes').value = m.notes || '';
      document.getElementById('mAccountUsername').value = m.accountUsername || m.phone || '';
      document.getElementById('mAccountPassword').value = m.accountPassword || '1234';
      switchTab('register', document.querySelector('[data-tab=register]'));
    }

    function deleteMember(id) {
      if (!confirm('هل أنت متأكد من حذف هذا المشترك نهائياً؟')) return;
      const m = state.members.find(x => x.id === id);
      state.members = state.members.filter(x => x.id !== id);
      persist();
      renderAll();
      logVisitorAction('حذف مشترك: ' + (m ? m.name : id));
      showToast('تم حذف المشترك');
    }

    function renderMembersTable() {
      const q = (document.getElementById('searchMember').value || '').toLowerCase();
      const shift = document.getElementById('filterShift').value;
      const pay = document.getElementById('filterPayment').value;

      const coachScope = (document.getElementById('filterCoachScope')?.value) || 'all';
      const filtered = state.members.filter(m => {
        const matchQ = m.name.toLowerCase().includes(q) || m.phone.includes(q) || m.id.toLowerCase().includes(q);
        const matchShift = !shift || m.shift === shift;
        const matchPay = !pay || (pay === 'paid' ? m.remaining <= 0 : m.remaining > 0);
        const matchCoach = coachScope !== 'mine' || !state.activeUser || (m.coach || '').toLowerCase().includes((state.activeUser.fullName || '').toLowerCase());
        return matchQ && matchShift && matchPay && matchCoach;
      });

      const tbody = document.getElementById('membersTbody');
      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#64748b;padding:24px;">لا يوجد مشتركون مطابقون للبحث حالياً.</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(m => `
        <tr>
          <td><strong>${m.id}</strong></td>
          <td>${m.name}</td>
          <td>${m.age}</td>
          <td>${m.phone}</td>
          <td><span class="badge badge-teal">${m.shift}</span></td>
          <td>${m.coach}</td>
          <td>${m.paidAmount} / ${m.totalFee} د.ل</td>
          <td>${m.remaining <= 0 ? '<span class="badge badge-green">خالص</span>' : `<span class="badge badge-amber">متبقي ${m.remaining} د.ل</span>`}</td>
          <td>
            <button class="btn btn-primary btn-sm" title="الملف الكامل" onclick="openMemberProfile('${m.id}')">👁️</button>
            <button class="btn btn-success btn-sm" title="جدول التمرين والغذاء والصور" onclick="openMemberPlansTab('${m.id}')">🥗</button>
            <button class="btn btn-secondary btn-sm" title="تعديل" onclick="editMember('${m.id}')">✏️</button>
            <button class="btn btn-danger btn-sm" title="حذف" onclick="deleteMember('${m.id}')">🗑️</button>
          </td>
        </tr>
      `).join('');
    }

    function openMemberProfile(id) {
      const m = state.members.find(x => x.id === id);
      if (!m) return;
      const ms = m.measurements || {};
      const body = document.getElementById('memberProfileBody');
      body.innerHTML = `
        <div class="grid-2" style="align-items:center;">
          <div>
            <h3 style="margin:0 0 8px;color:#0f766e;">${m.name}</h3>
            <p style="margin:4px 0;"><strong>الباركود:</strong> ${m.id}</p>
            <p style="margin:4px 0;"><strong>العمر:</strong> ${m.age} سنة | <strong>الهاتف:</strong> ${m.phone}</p>
            <p style="margin:4px 0;"><strong>الوزن:</strong> ${m.weight} كجم | <strong>الطول:</strong> ${m.height} سم | <strong>BMI:</strong> ${m.bmi}</p>
            <p style="margin:4px 0;"><strong>الفترة:</strong> ${m.shift} | <strong>المدربة:</strong> ${m.coach}</p>
            <p style="margin:4px 0;"><strong>الأمراض:</strong> ${m.hasDisease === 'نعم' ? (m.diseases.join('، ') || 'نعم') : 'لا يوجد'}</p>
            <p style="margin:4px 0;"><strong>الإصابات:</strong> ${m.hasInjury === 'نعم' ? (m.injuryLocation || 'نعم') : 'لا يوجد'}</p>
          </div>
          <div class="qr-box">
            <div id="profileMemberQr"></div>
            <small style="margin-top:6px;font-weight:700;">${m.id}</small>
          </div>
        </div>
        <div class="form-section-title">قياسات الجسم (سم)</div>
        <div class="grid-4" style="font-size:0.88rem;">
          <div>الذراع اليمنى: <strong>${ms.armRight}</strong></div>
          <div>الذراع اليسرى: <strong>${ms.armLeft}</strong></div>
          <div>الفخذ الأيمن: <strong>${ms.thighRight}</strong></div>
          <div>الفخذ الأيسر: <strong>${ms.thighLeft}</strong></div>
          <div>المؤخرة: <strong>${ms.glutes}</strong></div>
          <div>الخصر: <strong>${ms.waist}</strong></div>
          <div>الصدر: <strong>${ms.chest}</strong></div>
          <div>الأكتاف: <strong>${ms.shoulders}</strong></div>
        </div>
        <div class="form-section-title">بيانات الدخول لحساب المشترك</div>
        <p style="margin:6px 0;">اسم المستخدم: <strong>${m.accountUsername || m.phone}</strong> | كلمة المرور: <strong>${m.accountPassword || '1234'}</strong></p>
        <div class="form-section-title">البيانات المالية</div>
        <p style="margin:6px 0;">الإجمالي: <strong>${m.totalFee} د.ل</strong> | المدفوع: <strong>${m.paidAmount} د.ل</strong> | المتبقي: <strong>${m.remaining} د.ل</strong> | طريقة الدفع: <strong>${m.paymentMethod}</strong> (${m.payDate})</p>
        <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-success" onclick="closeModal('memberProfileModal'); openMemberPlansTab('${m.id}')">🥗 جدول التمرين والتغذية والصور</button>
          <button class="btn btn-primary" onclick="printMemberCard('${m.id}')">🖨️ طباعة بطاقة العضوية (A4)</button>
          <button class="btn btn-secondary" onclick="closeModal('memberProfileModal')">إغلاق</button>
        </div>
      `;
      document.getElementById('memberProfileModal').classList.add('open');
      setTimeout(() => renderQR('profileMemberQr', m.id, 130), 60);
    }

    // ==================== PRINT A4 CARD & POSTER ====================
    function printMemberCard(id) {
      const m = state.members.find(x => x.id === id);
      if (!m) return;
      const area = document.getElementById('printArea');
      area.innerHTML = `
        <div style="border:3px solid #0f766e;border-radius:18px;padding:24px;max-width:650px;margin:0 auto;font-family:Cairo,sans-serif;">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #ccfbf1;padding-bottom:14px;margin-bottom:16px;">
            <div>
              <h1 style="margin:0;color:#0f766e;">${state.club.name}</h1>
              <p style="margin:4px 0 0;color:#475569;">بطاقة عضوية رسمية</p>
            </div>
            <div id="printCardQr"></div>
          </div>
          <p><strong>الاسم:</strong> ${m.name}</p>
          <p><strong>رقم العضوية:</strong> ${m.id}</p>
          <p><strong>الهاتف:</strong> ${m.phone} | <strong>العمر:</strong> ${m.age} سنة</p>
          <p><strong>فترة التمارين:</strong> ${m.shift} | <strong>المدربة:</strong> ${m.coach}</p>
          <p><strong>تاريخ التسجيل:</strong> ${m.payDate} | <strong>المدفوع:</strong> ${m.paidAmount} د.ل (المتبقي: ${m.remaining} د.ل)</p>
          <hr style="margin:18px 0;border:none;border-top:1px dashed #cbd5e1;" />
          <p style="font-size:0.85rem;color:#475569;margin:0;">العنوان: ${state.club.address} | إدارة النظام: عمر الطابوني (0923482662)</p>
        </div>
      `;
      renderQR('printCardQr', m.id, 110);
      setTimeout(() => window.print(), 250);
    }

    function printInstallPoster() {
      const appUrl = state.club.appUrl || window.location.href;
      const area = document.getElementById('printArea');
      area.innerHTML = `
        <div style="text-align:center;border:4px solid #0f766e;border-radius:24px;padding:40px 28px;font-family:Cairo,sans-serif;">
          <h1 style="color:#0f766e;font-size:2.2rem;margin:0 0 10px;">${state.club.name}</h1>
          <p style="font-size:1.2rem;color:#334155;margin:0 0 28px;">امسح الباركود بكاميرا هاتفك لتثبيت التطبيق الرسمي للنادي</p>
          <div id="printPosterQr" style="display:inline-block;padding:18px;border:2px dashed #14b8a6;border-radius:16px;"></div>
          <p style="margin-top:22px;font-size:1rem;color:#0f766e;font-weight:700;word-break:break-all;">${appUrl}</p>
          <hr style="margin:28px 0;border:none;border-top:1px solid #cbd5e1;" />
          <p style="font-size:1rem;color:#1e293b;"><strong>العنوان:</strong> ${state.club.address}</p>
          <p style="font-size:0.95rem;color:#475569;">تطوير وإدارة النظام: عمر الطابوني | الهاتف: 0923482662 | tabnet2020@gmail.com</p>
        </div>
      `;
      renderQR('printPosterQr', appUrl, 240);
      setTimeout(() => window.print(), 250);
    }

    // ==================== BARCODE CHECK-IN & ATTENDANCE ====================
    function checkInByBarcode(codeOverride) {
      const code = (codeOverride || document.getElementById('manualBarcodeInput').value || '').trim();
      if (!code) return showToast('يرجى إدخال أو مسح رمز الباركود');
      const m = state.members.find(x => x.id.toLowerCase() === code.toLowerCase());
      const box = document.getElementById('scanResultBox');
      if (!m) {
        box.innerHTML = `<div style="color:#dc2626;font-weight:800;">❌ لم يتم العثور على مشترك بهذا الباركود: ${code}</div>`;
        return;
      }

      const record = {
        time: new Date().toLocaleString('ar-LY'),
        dateKey: new Date().toISOString().split('T')[0],
        memberId: m.id,
        memberName: m.name,
        shift: m.shift,
        coach: m.coach
      };
      state.attendance.unshift(record);
      persist();
      renderStats();
      renderAttendanceTable();
      logVisitorAction('تسجيل حضور بالباركود: ' + m.name);

      box.innerHTML = `
        <div style="text-align:right;background:#f0fdfa;padding:16px;border-radius:12px;border:1.5px solid #99f6e4;">
          <h3 style="margin:0 0 8px;color:#059669;">✅ تم تسجيل الحضور بنجاح</h3>
          <p style="margin:4px 0;"><strong>الاسم:</strong> ${m.name} (${m.id})</p>
          <p style="margin:4px 0;"><strong>الفترة:</strong> ${m.shift} | <strong>المدربة:</strong> ${m.coach}</p>
          <p style="margin:4px 0;"><strong>الحالة المالية:</strong> ${m.remaining <= 0 ? 'خالص الدفع' : 'متبقي ' + m.remaining + ' د.ل'}</p>
          <button class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="openMemberProfile('${m.id}')">عرض الملف الكامل</button>
        </div>
      `;
      document.getElementById('manualBarcodeInput').value = '';
      showToast('تم تسجيل حضور: ' + m.name);
    }

    function startCameraScanner() {
      if (typeof Html5Qrcode === 'undefined') return showToast('مكتبة الكاميرا غير متوفرة حالياً');
      stopCameraScanner();
      state.scanner = new Html5Qrcode('qrReader');
      state.scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          stopCameraScanner();
          checkInByBarcode(decodedText);
        }
      ).catch(() => showToast('تعذر فتح الكاميرا — تأكد من منح الإذن وتشغيل الموقع عبر HTTPS'));
    }

    function stopCameraScanner() {
      if (state.scanner) {
        state.scanner.stop().catch(() => {}).finally(() => { state.scanner = null; });
      }
    }

    function renderAttendanceTable() {
      const tbody = document.getElementById('attendanceTbody');
      if (!state.attendance.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b;padding:18px;">لا توجد سجلات حضور بعد.</td></tr>';
        return;
      }
      tbody.innerHTML = state.attendance.slice(0, 100).map(a => `
        <tr>
          <td>${a.time}</td>
          <td><strong>${a.memberId}</strong></td>
          <td>${a.memberName}</td>
          <td><span class="badge badge-teal">${a.shift}</span></td>
          <td>${a.coach}</td>
        </tr>
      `).join('');
    }

    // ==================== USERS MANAGEMENT ====================
    function addUser(e) {
      e.preventDefault();
      const username = document.getElementById('uUsername').value.trim();
      if (state.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        return showToast('اسم المستخدم موجود مسبقاً');
      }
      const user = {
        id: 'USR-' + Date.now(),
        fullName: document.getElementById('uFullName').value.trim(),
        username,
        password: document.getElementById('uPassword').value,
        role: document.getElementById('uRole').value,
        active: true,
        protected: false
      };
      state.users.push(user);
      persist();
      renderUsersTable();
      document.getElementById('userForm').reset();
      logVisitorAction('إضافة مستخدم جديد: ' + user.fullName);
      showToast('تمت إضافة المستخدم بنجاح');
    }

    function toggleUserStatus(id) {
      const u = state.users.find(x => x.id === id);
      if (!u || u.protected) return;
      u.active = !u.active;
      persist();
      renderUsersTable();
    }

    function deleteUser(id) {
      const u = state.users.find(x => x.id === id);
      if (!u || u.protected) return showToast('لا يمكن حذف الأدمن الرئيسي للنظام');
      if (!confirm('حذف المستخدم ' + u.fullName + '؟')) return;
      state.users = state.users.filter(x => x.id !== id);
      persist();
      renderUsersTable();
      logVisitorAction('حذف مستخدم: ' + u.fullName);
    }

    function renderUsersTable() {
      const tbody = document.getElementById('usersTbody');
      tbody.innerHTML = state.users.map(u => `
        <tr>
          <td><strong>${u.protected ? 'الأدمن الرئيسي' : u.fullName}</strong> ${u.protected ? '<span class="badge badge-teal">مسؤول النظام</span>' : ''}</td>
          <td>${u.protected ? '••••••••' : u.username}</td>
          <td>${u.role}</td>
          <td>${u.active ? '<span class="badge badge-green">نشط</span>' : '<span class="badge badge-red">معطل</span>'}</td>
          <td>
            ${u.protected ? '<span style="color:#64748b;font-size:0.8rem;">محمي</span>' : `
              <button class="btn btn-secondary btn-sm" onclick="toggleUserStatus('${u.id}')">${u.active ? 'تعطيل' : 'تفعيل'}</button>
              <button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}')">حذف</button>
            `}
          </td>
        </tr>
      `).join('');
    }

    function openLoginModal() {
      document.getElementById('loginUsername').value = '';
      document.getElementById('loginPassword').value = '';
      document.getElementById('loginModal').classList.add('open');
    }

    function findAccountByCredentials(un, pw) {
      // 1. Check staff/admin/coach accounts
      const staff = state.users.find(u => u.username === un && u.password === pw);
      if (staff) return staff;
      // 2. Check registered member accounts
      const member = state.members.find(m => (m.accountUsername || m.phone) === un && (m.accountPassword || '1234') === pw);
      if (member) {
        return {
          id: member.id,
          fullName: member.name,
          username: member.accountUsername || member.phone,
          role: 'مشترك',
          memberId: member.id,
          active: true,
          protected: false
        };
      }
      return null;
    }

    function applyRoleVisibility() {
      const u = state.activeUser;
      const navGrid = document.querySelector('.nav-grid');
      const usersBtn = document.getElementById('usersNavBtn');
      if (!u) return;

      if (u.role === 'مشترك') {
        // Hide staff navigation and show Member Personal Portal
        if (navGrid) navGrid.style.display = 'none';
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        const portal = document.getElementById('tab-member-portal');
        if (portal) portal.classList.add('active');
        renderMemberPortal(u.memberId);
      } else {
        if (navGrid) navGrid.style.display = 'grid';
        // Grant full permissions to Admins and Coaches (مدرب / مدربة)
        const hasFullPermissions = u.protected || u.role === 'أدمن' || u.role === 'مدرب' || u.role === 'مدربة';
        if (usersBtn) usersBtn.style.display = hasFullPermissions ? 'flex' : 'none';
        // Ensure a valid tab is active
        const portal = document.getElementById('tab-member-portal');
        if (portal && portal.classList.contains('active')) {
          switchTab('dashboard', document.querySelector('[data-tab=dashboard]'));
        }
      }
    }

    function renderMemberPortal(memberId) {
      const m = state.members.find(x => x.id === memberId);
      const body = document.getElementById('memberPortalBody');
      const attBody = document.getElementById('memberPortalAttendanceTbody');
      const printBtn = document.getElementById('portalPrintCardBtn');
      if (!m || !body) return;
      const ms = m.measurements || {};
      if (printBtn) printBtn.onclick = () => printMemberCard(m.id);

      body.innerHTML = `
        <div class="grid-2" style="align-items:center;">
          <div>
            <h3 style="margin:0 0 8px;color:#0f766e;">مرحباً، ${m.name}</h3>
            <p style="margin:4px 0;"><strong>رقم العضوية (الباركود):</strong> ${m.id}</p>
            <p style="margin:4px 0;"><strong>العمر:</strong> ${m.age} سنة | <strong>الهاتف:</strong> ${m.phone}</p>
            <p style="margin:4px 0;"><strong>الوزن:</strong> ${m.weight} كجم | <strong>الطول:</strong> ${m.height} سم | <strong>BMI:</strong> ${m.bmi}</p>
            <p style="margin:4px 0;"><strong>فترة التمارين:</strong> ${m.shift} | <strong>المدرب/المدربة:</strong> ${m.coach}</p>
          </div>
          <div class="qr-box">
            <div id="portalMemberQr"></div>
            <small style="margin-top:6px;font-weight:700;">${m.id}</small>
          </div>
        </div>
        <div class="form-section-title">قياسات الجسم (سم)</div>
        <div class="grid-4" style="font-size:0.88rem;">
          <div>الذراع اليمنى: <strong>${ms.armRight}</strong></div>
          <div>الذراع اليسرى: <strong>${ms.armLeft}</strong></div>
          <div>الفخذ الأيمن: <strong>${ms.thighRight}</strong></div>
          <div>الفخذ الأيسر: <strong>${ms.thighLeft}</strong></div>
          <div>المؤخرة: <strong>${ms.glutes}</strong></div>
          <div>الخصر: <strong>${ms.waist}</strong></div>
          <div>الصدر: <strong>${ms.chest}</strong></div>
          <div>الأكتاف: <strong>${ms.shoulders}</strong></div>
        </div>
        <div class="form-section-title">الحالة المالية</div>
        <p style="margin:6px 0;">الاشتراك: <strong>${m.totalFee} د.ل</strong> | المدفوع: <strong>${m.paidAmount} د.ل</strong> | المتبقي: <strong>${m.remaining} د.ل</strong></p>
      `;
      setTimeout(() => renderQR('portalMemberQr', m.id, 135), 60);

      // Render Member Workout & Diet Plan in Portal
      const planBody = document.getElementById('memberPortalPlanBody');
      const printPlanBtn = document.getElementById('portalPrintPlanBtn');
      if (printPlanBtn) printPlanBtn.onclick = () => printSelectedMemberPlan(m.id);
      const p = m.plan;
      if (planBody) {
        if (!p) {
          planBody.innerHTML = '<p style="color:#64748b;text-align:center;padding:14px;">لم يقم المدرب بإضافة جدول التمرين والنظام الغذائي بعد.</p>';
        } else {
          planBody.innerHTML = `
            <p style="margin:0 0 10px;font-size:0.82rem;color:#64748b;">آخر تحديث: ${p.updatedAt || ''} • بواسطة: <strong>${p.updatedBy || m.coach}</strong></p>
            <div class="form-section-title">🏋️ جدول التمرين الأسبوعي</div>
            <div class="plan-grid">
              <div class="plan-box"><h4>السبت</h4><p>${p.sat || '—'}</p></div>
              <div class="plan-box"><h4>الأحد</h4><p>${p.sun || '—'}</p></div>
              <div class="plan-box"><h4>الإثنين</h4><p>${p.mon || '—'}</p></div>
              <div class="plan-box"><h4>الثلاثاء</h4><p>${p.tue || '—'}</p></div>
              <div class="plan-box"><h4>الأربعاء</h4><p>${p.wed || '—'}</p></div>
              <div class="plan-box"><h4>الخميس</h4><p>${p.thu || '—'}</p></div>
              <div class="plan-box"><h4>الجمعة</h4><p>${p.fri || '—'}</p></div>
              <div class="plan-box"><h4>ملاحظات التمرين</h4><p>${p.workoutNotes || '—'}</p></div>
            </div>
            <div class="form-section-title">🥗 النظام الغذائي اليومي</div>
            <div class="plan-grid">
              <div class="plan-box"><h4>الإفطار</h4><p>${p.breakfast || '—'}</p></div>
              <div class="plan-box"><h4>وجبة خفيفة 1</h4><p>${p.snack1 || '—'}</p></div>
              <div class="plan-box"><h4>الغداء</h4><p>${p.lunch || '—'}</p></div>
              <div class="plan-box"><h4>وجبة خفيفة 2</h4><p>${p.snack2 || '—'}</p></div>
              <div class="plan-box"><h4>العشاء</h4><p>${p.dinner || '—'}</p></div>
              <div class="plan-box"><h4>السوائل والمكملات</h4><p>${p.supplements || '—'}</p></div>
            </div>
          `;
        }
      }

      // Render Member Shared Images Gallery
      renderSharedImagesGallery(m.id, 'memberPortalImagesGallery', false);

      const myAtt = state.attendance.filter(a => a.memberId === m.id);
      if (!myAtt.length) {
        attBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#64748b;padding:16px;">لا توجد سجلات حضور مسجلة بعد.</td></tr>';
      } else {
        attBody.innerHTML = myAtt.map(a => `
          <tr><td>${a.time}</td><td><span class="badge badge-teal">${a.shift}</span></td><td>${a.coach}</td></tr>
        `).join('');
      }
    }

    function renderCoachesDatalist() {
      const dl = document.getElementById('coachesDatalist');
      if (!dl) return;
      const coaches = state.users.filter(u => (u.role === 'مدرب' || u.role === 'مدربة') && u.active);
      dl.innerHTML = coaches.map(c => `<option value="${c.fullName}"></option>`).join('');
    }

    function performModalLogin() {
      const un = document.getElementById('loginUsername').value.trim();
      const pw = document.getElementById('loginPassword').value;
      const found = findAccountByCredentials(un, pw);
      if (!found) return showToast('بيانات الدخول غير صحيحة');
      if (!found.active) return showToast('هذا الحساب معطل');
      state.activeUser = found;
      persist();
      document.getElementById('publicHomeView').classList.remove('active');
      document.getElementById('appShell').classList.add('unlocked');
      renderAll();
      closeModal('loginModal');
      logVisitorAction('تبديل المستخدم إلى: ' + (found.protected ? 'الأدمن الرئيسي' : `${found.fullName} (${found.role})`));
      showToast('مرحباً بك، ' + (found.protected ? 'الأدمن الرئيسي' : found.fullName));
    }


    // ==================== WORKOUT, DIET PLANS & SHARED LAB IMAGES ====================
    function openMemberPlansTab(memberId) {
      switchTab('plans', document.querySelector('[data-tab=plans]'));
      renderPlanMemberSelect(memberId);
      loadSelectedMemberPlan();
    }

    function renderPlanMemberSelect(preselectId) {
      const sel = document.getElementById('planMemberSelect');
      if (!sel) return;
      const currentVal = preselectId || sel.value;
      if (!state.members.length) {
        sel.innerHTML = '<option value="">لا يوجد مشتركون مسجلون بعد</option>';
        return;
      }
      sel.innerHTML = state.members.map(m =>
        `<option value="${m.id}">${m.name} (${m.id}) — المدرب: ${m.coach || 'غير محدد'}</option>`
      ).join('');
      if (currentVal && state.members.some(m => m.id === currentVal)) {
        sel.value = currentVal;
      }
    }

    function loadSelectedMemberPlan() {
      const sel = document.getElementById('planMemberSelect');
      const healthBox = document.getElementById('planMemberHealthSummary');
      const meta = document.getElementById('planUpdatedMeta');
      const gallery = document.getElementById('staffSharedImagesGallery');
      const m = state.members.find(x => x.id === (sel ? sel.value : ''));

      const fields = ['planSat','planSun','planMon','planTue','planWed','planThu','planFri','planWorkoutNotes',
                      'dietBreakfast','dietSnack1','dietLunch','dietSnack2','dietDinner','dietSupplements'];
      if (!m) {
        fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        if (healthBox) healthBox.style.display = 'none';
        if (meta) meta.textContent = '';
        if (gallery) gallery.innerHTML = '<p style="color:#64748b;">اختر مشتركاً لعرض صوره المشتركة.</p>';
        return;
      }

      if (healthBox) {
        const dis = m.hasDisease === 'نعم' ? (m.diseases?.join('، ') || 'نعم') : 'لا يوجد';
        const inj = m.hasInjury === 'نعم' ? (m.injuryLocation || 'نعم') : 'لا يوجد';
        healthBox.style.display = 'block';
        healthBox.innerHTML = `<strong>ملخص صحي للمشترك (${m.name}):</strong> الوزن: ${m.weight} كجم | الطول: ${m.height} سم | BMI: ${m.bmi || '-'} | <strong>الأمراض:</strong> ${dis} | <strong>الإصابات:</strong> ${inj}`;
      }

      const p = m.plan || {};
      document.getElementById('planSat').value = p.sat || '';
      document.getElementById('planSun').value = p.sun || '';
      document.getElementById('planMon').value = p.mon || '';
      document.getElementById('planTue').value = p.tue || '';
      document.getElementById('planWed').value = p.wed || '';
      document.getElementById('planThu').value = p.thu || '';
      document.getElementById('planFri').value = p.fri || '';
      document.getElementById('planWorkoutNotes').value = p.workoutNotes || '';
      document.getElementById('dietBreakfast').value = p.breakfast || '';
      document.getElementById('dietSnack1').value = p.snack1 || '';
      document.getElementById('dietLunch').value = p.lunch || '';
      document.getElementById('dietSnack2').value = p.snack2 || '';
      document.getElementById('dietDinner').value = p.dinner || '';
      document.getElementById('dietSupplements').value = p.supplements || '';

      if (meta) {
        meta.textContent = p.updatedAt ? `آخر تحديث: ${p.updatedAt} بواسطة ${p.updatedBy || 'المدرب'}` : 'لم يتم إعداد برنامج لهذا المشترك بعد.';
      }

      renderSharedImagesGallery(m.id, 'staffSharedImagesGallery', true);
    }

    function saveMemberPlan(e) {
      e.preventDefault();
      const memberId = document.getElementById('planMemberSelect').value;
      const m = state.members.find(x => x.id === memberId);
      if (!m) return showToast('يرجى اختيار مشترك أولاً');

      m.plan = {
        sat: document.getElementById('planSat').value.trim(),
        sun: document.getElementById('planSun').value.trim(),
        mon: document.getElementById('planMon').value.trim(),
        tue: document.getElementById('planTue').value.trim(),
        wed: document.getElementById('planWed').value.trim(),
        thu: document.getElementById('planThu').value.trim(),
        fri: document.getElementById('planFri').value.trim(),
        workoutNotes: document.getElementById('planWorkoutNotes').value.trim(),
        breakfast: document.getElementById('dietBreakfast').value.trim(),
        snack1: document.getElementById('dietSnack1').value.trim(),
        lunch: document.getElementById('dietLunch').value.trim(),
        snack2: document.getElementById('dietSnack2').value.trim(),
        dinner: document.getElementById('dietDinner').value.trim(),
        supplements: document.getElementById('dietSupplements').value.trim(),
        updatedAt: new Date().toLocaleString('ar-LY'),
        updatedBy: state.activeUser ? (state.activeUser.protected ? 'الأدمن الرئيسي' : state.activeUser.fullName) : 'المدرب'
      };
      persist();
      loadSelectedMemberPlan();
      logVisitorAction('تحديث جدول التمرين والغذاء للمشترك: ' + m.name);
      showToast('✅ تم حفظ جدول التمرين والنظام الغذائي بنجاح');
    }

    function compressImageFile(file, maxDim = 1024, quality = 0.72) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          };
          img.onerror = reject;
          img.src = ev.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    async function uploadMemberImage(e, sourceMode) {
      e.preventDefault();
      const memberId = sourceMode === 'member'
        ? (state.activeUser && state.activeUser.memberId)
        : document.getElementById('planMemberSelect').value;

      const m = state.members.find(x => x.id === memberId);
      if (!m) return showToast('يرجى اختيار مشترك أولاً');

      const fileInput = document.getElementById(sourceMode === 'member' ? 'memberImgFile' : 'staffImgFile');
      const catEl = document.getElementById(sourceMode === 'member' ? 'memberImgCategory' : 'staffImgCategory');
      const noteEl = document.getElementById(sourceMode === 'member' ? 'memberImgNote' : 'staffImgNote');

      const file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) return showToast('يرجى اختيار صورة');

      try {
        const dataUrl = await compressImageFile(file, 1024, 0.72);
        if (!Array.isArray(m.sharedImages)) m.sharedImages = [];
        m.sharedImages.unshift({
          id: 'IMG-' + Date.now(),
          dataUrl,
          category: catEl.value,
          note: noteEl.value.trim(),
          sharedWithCoach: m.coach || 'المدرب',
          uploadedBy: state.activeUser ? (state.activeUser.protected ? 'الأدمن الرئيسي' : state.activeUser.fullName) : m.name,
          uploadedAt: new Date().toLocaleString('ar-LY'),
          coachReply: ''
        });
        try {
          persist();
        } catch (quotaErr) {
          m.sharedImages.shift();
          return showToast('⚠️ مساحة التخزين ممتلئة — احذف بعض الصور القديمة أولاً');
        }

        fileInput.value = '';
        noteEl.value = '';
        if (sourceMode === 'member') {
          renderSharedImagesGallery(m.id, 'memberPortalImagesGallery', false);
        } else {
          renderSharedImagesGallery(m.id, 'staffSharedImagesGallery', true);
        }
        logVisitorAction(`رفع صورة (${catEl.value}) للمشترك: ${m.name}`);
        showToast('✅ تم رفع الصورة ومشاركتها مع المدرب بنجاح');
      } catch (err) {
        showToast('❌ تعذر معالجة الصورة، يرجى تجربة صورة أخرى');
      }
    }

    function saveCoachImageReply(memberId, imgId) {
      const m = state.members.find(x => x.id === memberId);
      if (!m || !m.sharedImages) return;
      const img = m.sharedImages.find(i => i.id === imgId);
      if (!img) return;
      const input = document.getElementById('reply-' + imgId);
      if (!input) return;
      img.coachReply = input.value.trim();
      img.repliedBy = state.activeUser ? (state.activeUser.protected ? 'الأدمن الرئيسي' : state.activeUser.fullName) : 'المدرب';
      img.repliedAt = new Date().toLocaleString('ar-LY');
      persist();
      renderSharedImagesGallery(memberId, 'staffSharedImagesGallery', true);
      logVisitorAction('إضافة رد المدرب على صورة تحليل للمشترك: ' + m.name);
      showToast('✅ تم حفظ رد المدرب على الصورة');
    }

    function deleteSharedImage(memberId, imgId, galleryContainerId, canReply) {
      if (!confirm('هل تريد حذف هذه الصورة؟')) return;
      const m = state.members.find(x => x.id === memberId);
      if (!m || !m.sharedImages) return;
      m.sharedImages = m.sharedImages.filter(i => i.id !== imgId);
      persist();
      renderSharedImagesGallery(memberId, galleryContainerId, canReply);
      showToast('تم حذف الصورة');
    }

    function openImageLightbox(memberId, imgId) {
      const m = state.members.find(x => x.id === memberId);
      if (!m || !m.sharedImages) return;
      const img = m.sharedImages.find(i => i.id === imgId);
      if (!img) return;
      document.getElementById('lightboxTitle').textContent = `🖼️ ${img.category} — ${m.name}`;
      document.getElementById('lightboxImgEl').src = img.dataUrl;
      document.getElementById('lightboxMeta').innerHTML = `<strong>الملاحظة:</strong> ${img.note || 'لا توجد ملاحظة'} | <strong>بواسطة:</strong> ${img.uploadedBy} (${img.uploadedAt})`;
      const rep = document.getElementById('lightboxReply');
      if (img.coachReply) {
        rep.style.display = 'block';
        rep.innerHTML = `<strong>رد المدرب (${img.repliedBy || ''}):</strong> ${img.coachReply}`;
      } else {
        rep.style.display = 'none';
      }
      const dl = document.getElementById('lightboxDownloadBtn');
      dl.href = img.dataUrl;
      dl.download = `${m.name}_${img.category}.jpg`;
      document.getElementById('imageLightboxModal').classList.add('open');
    }

    function renderSharedImagesGallery(memberId, containerId, canReply) {
      const el = document.getElementById(containerId);
      if (!el) return;
      const m = state.members.find(x => x.id === memberId);
      const imgs = (m && Array.isArray(m.sharedImages)) ? m.sharedImages : [];
      if (!imgs.length) {
        el.innerHTML = '<p style="color:#64748b;grid-column:1/-1;text-align:center;padding:14px;">لا توجد صور تحاليل أو مرفقات مشتركة بعد.</p>';
        return;
      }
      el.innerHTML = imgs.map(img => `
        <div class="shared-img-card">
          <img src="${img.dataUrl}" class="shared-img-thumb" alt="${img.category}" onclick="openImageLightbox('${memberId}', '${img.id}')" />
          <div class="shared-img-body">
            <div><span class="badge badge-teal">${img.category}</span></div>
            <div style="font-weight:700;color:#1e293b;">${img.note || 'بدون ملاحظة'}</div>
            <div style="font-size:0.76rem;color:#64748b;">📅 ${img.uploadedAt} • مشترك مع: ${img.sharedWithCoach || 'المدرب'}</div>
            ${img.coachReply ? `<div class="coach-reply-box"><strong>💬 رد المدرب:</strong> ${img.coachReply}</div>` : ''}
            ${canReply ? `
              <div style="display:flex;gap:6px;margin-top:4px;">
                <input type="text" id="reply-${img.id}" value="${(img.coachReply || '').replace(/"/g, '&quot;')}" placeholder="اكتب رد/ملاحظة المدرب..." style="padding:6px 8px;font-size:0.8rem;" />
                <button class="btn btn-primary btn-sm" onclick="saveCoachImageReply('${memberId}', '${img.id}')">حفظ</button>
              </div>
            ` : ''}
            <div style="display:flex;gap:6px;margin-top:auto;padding-top:6px;">
              <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="openImageLightbox('${memberId}', '${img.id}')">🔍 تكبير</button>
              <button class="btn btn-danger btn-sm" onclick="deleteSharedImage('${memberId}', '${img.id}', '${containerId}', ${canReply})">🗑️</button>
            </div>
          </div>
        </div>
      `).join('');
    }

    function printSelectedMemberPlan(memberIdOverride) {
      const memberId = memberIdOverride || document.getElementById('planMemberSelect')?.value;
      const m = state.members.find(x => x.id === memberId);
      if (!m) return showToast('يرجى اختيار مشترك أولاً');
      const p = m.plan || {};
      const area = document.getElementById('printArea');
      area.innerHTML = `
        <div style="font-family:Cairo,sans-serif;border:3px solid #0f766e;border-radius:16px;padding:22px;">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #ccfbf1;padding-bottom:10px;margin-bottom:14px;">
            <div>
              <h1 style="margin:0;color:#0f766e;font-size:1.5rem;">${state.club.name}</h1>
              <p style="margin:2px 0 0;color:#475569;">برنامج التمرين والنظام الغذائي</p>
            </div>
            <div style="text-align:left;font-size:0.88rem;">
              <div><strong>المشترك:</strong> ${m.name} (${m.id})</div>
              <div><strong>المدرب/المدربة:</strong> ${m.coach || '-'} | <strong>BMI:</strong> ${m.bmi || '-'}</div>
            </div>
          </div>
          <h3 style="background:#f0fdfa;padding:6px 10px;color:#0f766e;border-right:4px solid #0f766e;">🏋️ جدول التمرين الأسبوعي</h3>
          <table style="width:100%;border-collapse:collapse;font-size:0.86rem;margin-bottom:14px;">
            <tr><th style="border:1px solid #cbd5e1;padding:6px;width:90px;">السبت</th><td style="border:1px solid #cbd5e1;padding:6px;">${p.sat || '—'}</td></tr>
            <tr><th style="border:1px solid #cbd5e1;padding:6px;">الأحد</th><td style="border:1px solid #cbd5e1;padding:6px;">${p.sun || '—'}</td></tr>
            <tr><th style="border:1px solid #cbd5e1;padding:6px;">الإثنين</th><td style="border:1px solid #cbd5e1;padding:6px;">${p.mon || '—'}</td></tr>
            <tr><th style="border:1px solid #cbd5e1;padding:6px;">الثلاثاء</th><td style="border:1px solid #cbd5e1;padding:6px;">${p.tue || '—'}</td></tr>
            <tr><th style="border:1px solid #cbd5e1;padding:6px;">الأربعاء</th><td style="border:1px solid #cbd5e1;padding:6px;">${p.wed || '—'}</td></tr>
            <tr><th style="border:1px solid #cbd5e1;padding:6px;">الخميس</th><td style="border:1px solid #cbd5e1;padding:6px;">${p.thu || '—'}</td></tr>
            <tr><th style="border:1px solid #cbd5e1;padding:6px;">الجمعة</th><td style="border:1px solid #cbd5e1;padding:6px;">${p.fri || '—'}</td></tr>
            <tr><th style="border:1px solid #cbd5e1;padding:6px;">ملاحظات</th><td style="border:1px solid #cbd5e1;padding:6px;">${p.workoutNotes || '—'}</td></tr>
          </table>
          <h3 style="background:#f0fdfa;padding:6px 10px;color:#0f766e;border-right:4px solid #0f766e;">🥗 النظام الغذائي اليومي</h3>
          <table style="width:100%;border-collapse:collapse;font-size:0.86rem;">
            <tr><th style="border:1px solid #cbd5e1;padding:6px;width:130px;">الإفطار</th><td style="border:1px solid #cbd5e1;padding:6px;">${p.breakfast || '—'}</td></tr>
            <tr><th style="border:1px solid #cbd5e1;padding:6px;">سناك 1</th><td style="border:1px solid #cbd5e1;padding:6px;">${p.snack1 || '—'}</td></tr>
            <tr><th style="border:1px solid #cbd5e1;padding:6px;">الغداء</th><td style="border:1px solid #cbd5e1;padding:6px;">${p.lunch || '—'}</td></tr>
            <tr><th style="border:1px solid #cbd5e1;padding:6px;">سناك 2</th><td style="border:1px solid #cbd5e1;padding:6px;">${p.snack2 || '—'}</td></tr>
            <tr><th style="border:1px solid #cbd5e1;padding:6px;">العشاء</th><td style="border:1px solid #cbd5e1;padding:6px;">${p.dinner || '—'}</td></tr>
            <tr><th style="border:1px solid #cbd5e1;padding:6px;">السوائل والمكملات</th><td style="border:1px solid #cbd5e1;padding:6px;">${p.supplements || '—'}</td></tr>
          </table>
          <p style="margin-top:16px;font-size:0.8rem;color:#475569;">العنوان: ${state.club.address} | إدارة النظام: عمر الطابوني (0923482662)</p>
        </div>
      `;
      setTimeout(() => window.print(), 200);
    }

    // ==================== EXPORT EXCEL & CSV ====================
    function buildMemberExportRows() {
      return state.members.map(m => ({
        'اسم النادي': state.club.name,
        'الباركود': m.id,
        'الاسم الكامل': m.name,
        'العمر': m.age,
        'الهاتف': m.phone,
        'الوزن (كجم)': m.weight,
        'الطول (سم)': m.height,
        'BMI': m.bmi,
        'يعاني من أمراض': m.hasDisease,
        'تفاصيل الأمراض': (m.diseases || []).join('، '),
        'إصابات سابقة': m.hasInjury,
        'مكان الإصابة': m.injuryLocation || '',
        'الذراع اليمنى': m.measurements?.armRight || '',
        'الذراع اليسرى': m.measurements?.armLeft || '',
        'الفخذ الأيمن': m.measurements?.thighRight || '',
        'الفخذ الأيسر': m.measurements?.thighLeft || '',
        'المؤخرة': m.measurements?.glutes || '',
        'الخصر': m.measurements?.waist || '',
        'الصدر': m.measurements?.chest || '',
        'الأكتاف': m.measurements?.shoulders || '',
        'فترة التمارين': m.shift,
        'اسم المدربة': m.coach,
        'قيمة الاشتراك': m.totalFee,
        'المدفوع': m.paidAmount,
        'المتبقي': m.remaining,
        'طريقة الدفع': m.paymentMethod,
        'تاريخ الدفع': m.payDate,
        'ملاحظات': m.notes || ''
      }));
    }

    function exportMembersExcel() {
      if (!state.members.length) return showToast('لا يوجد مشتركون للتصدير');
      const rows = buildMemberExportRows();
      if (typeof XLSX !== 'undefined') {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'المشتركون');
        XLSX.writeFile(wb, `سجل_المشتركين_${new Date().toISOString().split('T')[0]}.xlsx`);
        logVisitorAction('تصدير سجل المشتركين إلى Excel');
        showToast('تم تصدير ملف Excel بنجاح');
      } else {
        exportMembersCSV();
      }
    }

    function exportMembersCSV() {
      if (!state.members.length) return showToast('لا يوجد مشتركون للتصدير');
      const rows = buildMemberExportRows();
      const headers = Object.keys(rows[0]);
      const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `سجل_المشتركين_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      logVisitorAction('تصدير سجل المشتركين إلى CSV');
    }

    // ==================== VISITOR LOG MODAL ====================
    function openVisitorLogPrompt() {
      document.getElementById('visitorPasswordInput').value = '';
      document.getElementById('visitorAuthGate').style.display = 'block';
      document.getElementById('visitorLogContent').style.display = 'none';
      document.getElementById('visitorModal').classList.add('open');
    }

    function unlockVisitorLog() {
      const val = document.getElementById('visitorPasswordInput').value;
      if (val !== VISITOR_PASS) return showToast('❌ كلمة المرور غير صحيحة');
      document.getElementById('visitorAuthGate').style.display = 'none';
      document.getElementById('visitorLogContent').style.display = 'block';
      renderVisitorTable();
    }

    function closeVisitorLog() {
      document.getElementById('visitorAuthGate').style.display = 'block';
      document.getElementById('visitorLogContent').style.display = 'none';
      closeModal('visitorModal');
    }

    function renderVisitorTable() {
      const q = (document.getElementById('visitorSearch').value || '').toLowerCase();
      const filtered = state.visitors.filter(v =>
        (v.action || '').toLowerCase().includes(q) ||
        (v.user || '').toLowerCase().includes(q) ||
        (v.device || '').toLowerCase().includes(q) ||
        (v.ip || '').toLowerCase().includes(q) ||
        (v.sessionId || '').toLowerCase().includes(q)
      );
      document.getElementById('vTotalEvents').textContent = state.visitors.length;
      document.getElementById('vTotalSessions').textContent = new Set(state.visitors.map(v => v.sessionId)).size;
      document.getElementById('visitorTbody').innerHTML = filtered.map(v => `
        <tr>
          <td>${v.time}</td>
          <td><code>${v.sessionId}</code></td>
          <td><code>${v.ip || '—'}</code></td>
          <td>${v.action}</td>
          <td>${v.user}</td>
          <td>${v.device}</td>
        </tr>
      `).join('');
    }

    function exportVisitorLogExcel() {
      if (!state.visitors.length) return showToast('السجل فارغ');
      if (typeof XLSX !== 'undefined') {
        const ws = XLSX.utils.json_to_sheet(state.visitors);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'سجل_الزوار');
        XLSX.writeFile(wb, `سجل_الزوار_${new Date().toISOString().split('T')[0]}.xlsx`);
      }
    }

    function clearVisitorLog() {
      if (!confirm('هل تريد مسح سجل الزوار بالكامل؟')) return;
      state.visitors = [];
      persist();
      renderVisitorTable();
      showToast('تم مسح سجل الزوار');
    }

    // ==================== STATS & HELPERS ====================
    function renderStats() {
      const todayKey = new Date().toISOString().split('T')[0];
      const todayCount = state.attendance.filter(a => a.dateKey === todayKey).length;
      const totalPaid = state.members.reduce((s, m) => s + (Number(m.paidAmount) || 0), 0);
      const totalRem = state.members.reduce((s, m) => s + (Number(m.remaining) || 0), 0);

      document.getElementById('statTotalMembers').textContent = state.members.length;
      document.getElementById('statTodayAttendance').textContent = todayCount;
      document.getElementById('statTotalPaid').textContent = totalPaid.toFixed(0) + ' د.ل';
      document.getElementById('statTotalRemaining').textContent = totalRem.toFixed(0) + ' د.ل';
    }

    function closeModal(id) {
      document.getElementById(id).classList.remove('open');
    }

    function renderAll() {
      renderClubUI();
      renderTip();
      renderStats();
      renderMembersTable();
      renderAttendanceTable();
      renderUsersTable();
      renderCoachesDatalist();
      renderPlanMemberSelect();
      loadSelectedMemberPlan();
      applyRoleVisibility();
    }

    // ==================== PWA INSTALL & SERVICE WORKER ====================
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.deferredPrompt = e;
      document.getElementById('installPwaBtn').style.display = 'inline-flex';
      const btn = document.getElementById('smartInstallBtn');
      if (btn) btn.textContent = '⬇️ تثبيت التطبيق الآن (ضغطة واحدة)';
    });

    function triggerPwaInstall() {
      if (!state.deferredPrompt) return showToast('يمكنك التثبيت من قائمة المتصفح (إضافة إلى الشاشة الرئيسية)');
      state.deferredPrompt.prompt();
      state.deferredPrompt.userChoice.then(() => {
        state.deferredPrompt = null;
        document.getElementById('installPwaBtn').style.display = 'none';
      });
    }

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      });
    }


    // ==================== COLOR THEMES ENGINE ====================
    const THEME_KEY = 'sfc_ui_theme_v1';
    const THEME_PRESETS = {
      teal: {
        primary: '#0f766e', primaryDark: '#115e59', accent: '#14b8a6',
        softBg: '#f0fdfa', softBorder: '#99f6e4',
        bgStart: '#f0fdfa', bgMid: '#f8fafc', bgEnd: '#ecfeff'
      },
      rose: {
        primary: '#be185d', primaryDark: '#9d174d', accent: '#f43f5e',
        softBg: '#fff1f2', softBorder: '#fecdd3',
        bgStart: '#fff1f2', bgMid: '#fdf2f8', bgEnd: '#fff5f7'
      },
      purple: {
        primary: '#6d28d9', primaryDark: '#5b21b6', accent: '#8b5cf6',
        softBg: '#f5f3ff', softBorder: '#ddd6fe',
        bgStart: '#f5f3ff', bgMid: '#faf5ff', bgEnd: '#eef2ff'
      },
      blue: {
        primary: '#1d4ed8', primaryDark: '#1e40af', accent: '#3b82f6',
        softBg: '#eff6ff', softBorder: '#bfdbfe',
        bgStart: '#eff6ff', bgMid: '#f8fafc', bgEnd: '#e0f2fe'
      },
      orange: {
        primary: '#c2410c', primaryDark: '#9a3412', accent: '#f97316',
        softBg: '#fff7ed', softBorder: '#fed7aa',
        bgStart: '#fff7ed', bgMid: '#fffbeb', bgEnd: '#fef3c7'
      }
    };

    function shadeHex(hex, percent) {
      const num = parseInt(hex.replace('#', ''), 16);
      const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + Math.round(2.55 * percent)));
      const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + Math.round(2.55 * percent)));
      const b = Math.min(255, Math.max(0, (num & 0xff) + Math.round(2.55 * percent)));
      return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    function setCssVars(vars) {
      const root = document.documentElement;
      const map = {
        '--primary': vars.primary,
        '--primary-dark': vars.primaryDark,
        '--accent': vars.accent,
        '--soft-bg': vars.softBg,
        '--soft-border': vars.softBorder,
        '--bg-grad-start': vars.bgStart,
        '--bg-grad-mid': vars.bgMid,
        '--bg-grad-end': vars.bgEnd
      };
      Object.entries(map).forEach(([k, v]) => {
        if (v) root.style.setProperty(k, v);
        else root.style.removeProperty(k);
      });
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme && vars.primary) metaTheme.setAttribute('content', vars.primary);
    }

    function updateThemeSelectionUI(activeId) {
      document.querySelectorAll('.theme-option').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.themeId === activeId);
      });
    }

    function applyTheme(themeId, silent = false) {
      if (themeId === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        setCssVars({});
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) metaTheme.setAttribute('content', '#0f172a');
      } else {
        document.body.removeAttribute('data-theme');
        const preset = THEME_PRESETS[themeId] || THEME_PRESETS.teal;
        setCssVars(preset);
      }
      localStorage.setItem(THEME_KEY, JSON.stringify({ type: 'preset', id: themeId }));
      updateThemeSelectionUI(themeId);
      if (!silent) showToast('🎨 تم تغيير ستايل الواجهة بنجاح');
    }

    function applyCustomColor(hex, silent = false) {
      if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
      document.body.removeAttribute('data-theme');
      setCssVars({
        primary: hex,
        primaryDark: shadeHex(hex, -14),
        accent: shadeHex(hex, 14),
        softBg: shadeHex(hex, 82),
        softBorder: shadeHex(hex, 55),
        bgStart: shadeHex(hex, 85),
        bgMid: '#f8fafc',
        bgEnd: shadeHex(hex, 80)
      });
      localStorage.setItem(THEME_KEY, JSON.stringify({ type: 'custom', hex }));
      updateThemeSelectionUI('custom');
      const picker = document.getElementById('customThemeColor');
      if (picker) picker.value = hex;
      if (!silent) showToast('🎨 تم تطبيق اللون المخصص بنجاح');
    }

    function loadSavedTheme() {
      try {
        const saved = JSON.parse(localStorage.getItem(THEME_KEY) || 'null');
        if (!saved) return;
        if (saved.type === 'custom' && saved.hex) applyCustomColor(saved.hex, true);
        else if (saved.id) applyTheme(saved.id, true);
      } catch (_) {}
    }

    function openThemeModal() {
      document.getElementById('themeModal').classList.add('open');
    }

    // ==================== INIT ====================
    document.getElementById('mPayDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('footerAddress').textContent = state.club.address;
    enforceSecurityGates().then(() => {
      logVisitorAction('زيارة جديدة للتطبيق');
    });

// Expose handlers to global window scope for inline HTML event attributes
Object.assign(window, {
  activateLicense,
  addUser,
  applyRoleVisibility,
  buildMemberExportRows,
  calcBMI,
  calcRemaining,
  checkInByBarcode,
  clearVisitorLog,
  closeModal,
  closeVisitorLog,
  compressImageFile,
  deactivateLicense,
  deleteMember,
  deleteSharedImage,
  deleteUser,
  editMember,
  enforceSecurityGates,
  exportMembersCSV,
  exportMembersExcel,
  exportVisitorLogExcel,
  fetchPublicIp,
  findAccountByCredentials,
  getDeviceSummary,
  getEffectiveMapLink,
  getEmbedMapSrc,
  handleGateLogin,
  handleSmartInstall,
  isIOSDevice,
  isMobileDevice,
  isStandaloneMode,
  loadSelectedMemberPlan,
  loadUsersWithMigration,
  logVisitorAction,
  logoutUser,
  nextTip,
  openActivationFromPublic,
  applyCustomColor,
  applyTheme,
  openClubSettingsModal,
  openThemeModal,
  openImageLightbox,
  openLoginModal,
  openMemberPlansTab,
  openMemberProfile,
  openVisitorLogPrompt,
  performModalLogin,
  persist,
  printInstallPoster,
  printMemberCard,
  printSelectedMemberPlan,
  renderAll,
  renderAttendanceTable,
  renderClubUI,
  renderCoachesDatalist,
  renderMemberPortal,
  renderMembersTable,
  renderPlanMemberSelect,
  renderPublicHome,
  renderQR,
  renderSharedImagesGallery,
  renderStats,
  renderTip,
  renderUsersTable,
  renderVisitorTable,
  resetRegistrationForm,
  saveAppUrl,
  saveClubBrand,
  saveClubLocation,
  saveCoachImageReply,
  saveMember,
  saveMemberPlan,
  showToast,
  startCameraScanner,
  stopCameraScanner,
  switchTab,
  toggleDiseaseFields,
  toggleInjuryFields,
  toggleTipPeriod,
  toggleUserStatus,
  triggerPwaInstall,
  unlockVisitorLog,
  uploadMemberImage
});
