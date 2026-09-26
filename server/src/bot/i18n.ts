import type { Category, Lang, ReportStatus } from '@prisma/client';

const kk = {
  chooseLang: 'Тілді таңдаңыз / Выберите язык 👇',
  langSet: 'Тіл: қазақша 🇰🇿',
  welcome: (name: string) =>
    `Сәлем, ${name}! 👋\n\n<b>«Таза Каспий»</b> — Каспий жағалауындағы ластану туралы хабарлау сервисі.\n\nФото жіберіңіз — ЖИ талдайды, әкімдік шара қолданады, ал сіз нәтижесін көресіз 🌊`,
  menuReport: '📸 Ластануды хабарлау',
  menuMap: '🗺 Карта',
  menuCleanups: '🧹 Сенбіліктер',
  menuMy: '📋 Менің хабарламаларым',
  menuLang: '🌐 Тіл',
  askPhoto: '📸 Ластанған жердің фотосын жіберіңіз.',
  askLocation:
    '📍 Енді орнын жіберіңіз: төмендегі батырманы басыңыз немесе 📎 → «Геопозиция» арқылы картадан нүкте таңдаңыз.',
  btnSendLocation: '📍 Геолокацияны жіберу',
  needLocation: '📍 Орынды батырма арқылы немесе 📎 → «Геопозиция» арқылы жіберіңіз.',
  outsideRegion: 'Бұл нүкте Маңғыстау облысынан тыс сияқты 🤔 Жағалаудағы нүктені жіберіңіз.',
  askComment: '💬 Қысқаша түсініктеме жазыңыз (міндетті емес) немесе «Өткізу» басыңыз.',
  btnSkip: '⏭ Өткізу',
  btnCancel: '❌ Болдырмау',
  cancelled: 'Тоқтатылды. Басты мәзір 👇',
  analyzingAi: '⏳ ЖИ талдап жатыр…',
  analyzing: '⏳ Өңдеп жатырмыз…',
  notPollution:
    '🤔 Фотода ластану көрінбейді.\nЛастанған жерді жақынырақ түсіріп, басқа фото жіберіңіз.',
  aiResult: (cat: string, sev: number, summary: string, zone: string | null) =>
    `🔍 <b>ЖИ анықтады:</b> ${cat} · Қауіптілік ${sev}/5\n<i>${summary}</i>${zone ? `\n📍 ${zone}` : ''}`,
  askConfirm: 'Дұрыс па?',
  lowConfidence: '❓ <b>ЖИ толық сенімді емес. Санат дұрыс па?</b>',
  mockChoose: (zone: string | null) =>
    `📝 Фото қабылданды${zone ? ` · 📍 ${zone}` : ''}.\n\n<b>Ластану түрін таңдаңыз:</b>`,
  btnOk: '✅ Дұрыс',
  btnChange: '✏️ Санатты өзгерту',
  chooseCategory: '<b>Санатты таңдаңыз:</b>',
  categorySet: (cat: string) => `Санат: ${cat}`,
  registered: (code: string, link: string) =>
    `✅ Хабарламаңыз тіркелді: <b>${code}</b>\nКартада: ${link}\n\nМәртебесі өзгерген сайын хабарлаймыз 🔔`,
  duplicateNote: (code: string) =>
    `ℹ️ Бұл жер туралы бұрын да хабарланған — <b>${code}</b> хабарламасына біріктірілді.`,
  error: 'Кешіріңіз, қате шықты, қайталап көріңіз 🙏',
  tooBig: 'Файл тым үлкен — 10 МБ-тан аспауы керек.',
  notImage: 'Бұл сурет емес сияқты. Фото жіберіңіз 📸',
  unknown: 'Мәзірдегі батырмаларды қолданыңыз 👇 немесе бірден фото жіберіңіз 📸',
  mapText: (link: string) => `🗺 Жағалаудың ластану картасы:\n${link}`,
  btnOpenMap: '🗺 Картаны ашу',
  myEmpty: 'Сізде әзірге хабарлама жоқ. 📸 батырмасын басып, алғашқысын жіберіңіз!',
  myTitle: '📋 <b>Соңғы хабарламаларыңыз:</b>',
  cleanupsEmpty: '🧹 Жақын арада сенбілік жоспарланбаған. Жаңасы болса, хабарлаймыз!',
  cleanupsTitle: '🧹 <b>Жақындағы сенбіліктер:</b>',
  cleanupLine: (title: string, when: string, where: string, zone: string, n: number, max: number) =>
    `<b>${title}</b>\n🗓 ${when}\n📍 ${zone} — ${where}\n👥 ${n}/${max}`,
  btnJoin: '🙋 Қатысамын',
  joined: 'Тамаша! Сіз тіркелдіңіз ✅',
  alreadyJoined: 'Сіз бұған дейін тіркелгенсіз 👍',
  cleanupFull: 'Өкінішке қарай, орын қалмады 😔',
  statusChanged: (code: string, status: string) => `🔔 <b>${code}</b>: ${status}`,
  reason: (r: string) => `Себебі: ${r}`,
  executorLine: (name: string) => `Орындаушы: ${name}`,
  resolvedThanks: (code: string) => `✅ <b>${code}</b>\nРақмет! Жағалау тазарды 🌊`,
  before: 'Дейін',
  after: 'Кейін',
  // ── исполнитель ──
  menuTasks: '🧰 Менің тапсырмаларым',
  linkUsage: 'Қолданылуы: /link КОД\nКодты әкімдіктің панелінен алыңыз.',
  linkBad: 'Код табылмады 🤔 Әкімдіктен кодты тексеріңіз.',
  linkOk: (name: string) =>
    `✅ Сіз <b>«${name}»</b> орындаушысы ретінде тіркелдіңіз.
Жаңа тапсырмалар осында келеді 🔔`,
  taskNew: (
    code: string,
    cat: string,
    sev: number,
    zone: string,
    summary: string,
    comment: string | null,
  ) =>
    `🆕 <b>Жаңа тапсырма: ${code}</b>
${cat} · Қауіптілік ${sev}/5
📍 ${zone}
<i>${summary}</i>${
      comment
        ? `
💬 «${comment}»`
        : ''
    }`,
  taskGo: '👇 Орны. Орынға жеткенде «Жұмысты бастадым» басыңыз.',
  btnStart: '🚀 Жұмысты бастадым',
  btnDone: '✅ Орындалды',
  taskStarted: (code: string) =>
    `🚧 <b>${code}</b>: жұмыс басталды. Аяқтағанда «Орындалды» басыңыз.`,
  askAfterPhoto: (code: string) =>
    `📸 <b>${code}</b>: тазаланған жердің «кейін» фотосын жіберіңіз.`,
  taskClosed: (code: string) =>
    `✅ <b>${code}</b> жабылды. Рақмет! Тұрғын «дейін/кейін» фотосын алады 🌊`,
  taskNotYours: 'Бұл тапсырма сізге тағайындалмаған немесе жабылған.',
  taskReassigned: (code: string) => `ℹ️ ${code} тапсырмасы басқа орындаушыға берілді.`,
  tasksEmpty: 'Белсенді тапсырма жоқ 👍',
  tasksTitle: '🧰 <b>Белсенді тапсырмалар:</b>',
  // ── субботники ──
  cleanupNew: (title: string, when: string, where: string, zone: string) =>
    `🧹 <b>Жаңа сенбілік!</b>

<b>${title}</b>
🗓 ${when}
📍 ${zone} — ${where}

Жағалауды бірге тазалайық 💪`,
};

type Dict = typeof kk;

const ru: Dict = {
  chooseLang: kk.chooseLang,
  langSet: 'Язык: русский 🇷🇺',
  welcome: (name) =>
    `Привет, ${name}! 👋\n\n<b>«Таза Каспий»</b> — сервис, чтобы сообщать о загрязнении берега Каспия.\n\nОтправьте фото — ИИ проанализирует, акимат примет меры, а вы увидите результат 🌊`,
  menuReport: '📸 Сообщить о загрязнении',
  menuMap: '🗺 Карта',
  menuCleanups: '🧹 Субботники',
  menuMy: '📋 Мои сообщения',
  menuLang: '🌐 Язык',
  askPhoto: '📸 Отправьте фото загрязнения.',
  askLocation:
    '📍 Теперь отправьте место: нажмите кнопку ниже или выберите точку на карте через 📎 → «Геопозиция».',
  btnSendLocation: '📍 Отправить геолокацию',
  needLocation: '📍 Отправьте место кнопкой или через 📎 → «Геопозиция».',
  outsideRegion:
    'Похоже, точка за пределами Мангистауской области 🤔 Отправьте точку на побережье.',
  askComment: '💬 Добавьте короткий комментарий (необязательно) или нажмите «Пропустить».',
  btnSkip: '⏭ Пропустить',
  btnCancel: '❌ Отмена',
  cancelled: 'Отменено. Главное меню 👇',
  analyzingAi: '⏳ ИИ анализирует…',
  analyzing: '⏳ Обрабатываем…',
  notPollution:
    '🤔 На фото не видно загрязнения.\nСфотографируйте загрязнённое место поближе и отправьте другое фото.',
  aiResult: (cat, sev, summary, zone) =>
    `🔍 <b>ИИ определил:</b> ${cat} · Опасность ${sev}/5\n<i>${summary}</i>${zone ? `\n📍 ${zone}` : ''}`,
  askConfirm: 'Верно?',
  lowConfidence: '❓ <b>ИИ не до конца уверен. Категория верна?</b>',
  mockChoose: (zone) =>
    `📝 Фото принято${zone ? ` · 📍 ${zone}` : ''}.\n\n<b>Выберите тип загрязнения:</b>`,
  btnOk: '✅ Верно',
  btnChange: '✏️ Изменить категорию',
  chooseCategory: '<b>Выберите категорию:</b>',
  categorySet: (cat) => `Категория: ${cat}`,
  registered: (code, link) =>
    `✅ Ваше сообщение зарегистрировано: <b>${code}</b>\nНа карте: ${link}\n\nСообщим, когда статус изменится 🔔`,
  duplicateNote: (code) => `ℹ️ Об этом месте уже сообщали — объединено с <b>${code}</b>.`,
  error: 'Извините, произошла ошибка, попробуйте ещё раз 🙏',
  tooBig: 'Файл слишком большой — не более 10 МБ.',
  notImage: 'Похоже, это не изображение. Отправьте фото 📸',
  unknown: 'Используйте кнопки меню 👇 или просто отправьте фото 📸',
  mapText: (link) => `🗺 Карта загрязнений побережья:\n${link}`,
  btnOpenMap: '🗺 Открыть карту',
  myEmpty: 'У вас пока нет сообщений. Нажмите 📸, чтобы отправить первое!',
  myTitle: '📋 <b>Ваши последние сообщения:</b>',
  cleanupsEmpty: '🧹 Ближайших субботников пока нет. Сообщим, когда появятся!',
  cleanupsTitle: '🧹 <b>Ближайшие субботники:</b>',
  cleanupLine: (title, when, where, zone, n, max) =>
    `<b>${title}</b>\n🗓 ${when}\n📍 ${zone} — ${where}\n👥 ${n}/${max}`,
  btnJoin: '🙋 Участвую',
  joined: 'Отлично! Вы записаны ✅',
  alreadyJoined: 'Вы уже записаны 👍',
  cleanupFull: 'К сожалению, мест больше нет 😔',
  statusChanged: (code, status) => `🔔 <b>${code}</b>: ${status}`,
  reason: (r) => `Причина: ${r}`,
  executorLine: (name) => `Исполнитель: ${name}`,
  resolvedThanks: (code) => `✅ <b>${code}</b>\nСпасибо! Берег стал чище 🌊`,
  before: 'До',
  after: 'После',
  menuTasks: '🧰 Мои задачи',
  linkUsage: 'Использование: /link КОД\nКод выдаётся в панели акимата.',
  linkBad: 'Код не найден 🤔 Проверьте код у акимата.',
  linkOk: (name) =>
    `✅ Вы зарегистрированы как исполнитель <b>«${name}»</b>.
Новые задачи будут приходить сюда 🔔`,
  taskNew: (code, cat, sev, zone, summary, comment) =>
    `🆕 <b>Новая задача: ${code}</b>
${cat} · Опасность ${sev}/5
📍 ${zone}
<i>${summary}</i>${
      comment
        ? `
💬 «${comment}»`
        : ''
    }`,
  taskGo: '👇 Место. Когда будете на месте, нажмите «Начал работу».',
  btnStart: '🚀 Начал работу',
  btnDone: '✅ Выполнено',
  taskStarted: (code) => `🚧 <b>${code}</b>: работа начата. По завершении нажмите «Выполнено».`,
  askAfterPhoto: (code) => `📸 <b>${code}</b>: отправьте фото «после» убранного места.`,
  taskClosed: (code) => `✅ <b>${code}</b> закрыта. Спасибо! Житель получит фото «до/после» 🌊`,
  taskNotYours: 'Эта задача не назначена вам или уже закрыта.',
  taskReassigned: (code) => `ℹ️ Задача ${code} передана другому исполнителю.`,
  tasksEmpty: 'Активных задач нет 👍',
  tasksTitle: '🧰 <b>Активные задачи:</b>',
  cleanupNew: (title, when, where, zone) =>
    `🧹 <b>Новый субботник!</b>

<b>${title}</b>
🗓 ${when}
📍 ${zone} — ${where}

Давайте уберём берег вместе 💪`,
};

export const dict: Record<Lang, Dict> = { kk, ru };

export const CATEGORY_LABEL: Record<Category, Record<Lang, string>> = {
  TRASH: { kk: '🗑 Тұрмыстық қоқыс', ru: '🗑 Бытовой мусор' },
  PLASTIC: { kk: '🧴 Пластик қоқыс', ru: '🧴 Пластиковый мусор' },
  OIL: { kk: '🛢 Мұнай ластануы', ru: '🛢 Нефтяное загрязнение' },
  DEAD_ANIMAL: { kk: '🦭 Өлі жануар', ru: '🦭 Мёртвое животное' },
  SEWAGE: { kk: '🚱 Ағынды сулар', ru: '🚱 Сточные воды' },
  CONSTRUCTION: { kk: '🧱 Құрылыс қалдықтары', ru: '🧱 Строительный мусор' },
  OTHER: { kk: '❔ Басқа', ru: '❔ Другое' },
};

export const STATUS_LABEL: Record<ReportStatus, Record<Lang, string>> = {
  NEW: { kk: '🆕 Жаңа', ru: '🆕 Новое' },
  CONFIRMED: { kk: '☑️ Расталды', ru: '☑️ Подтверждено' },
  ASSIGNED: { kk: '👷 Орындаушы тағайындалды', ru: '👷 Назначен исполнитель' },
  IN_PROGRESS: { kk: '🚧 Жұмыс жүріп жатыр', ru: '🚧 В работе' },
  RESOLVED: { kk: '✅ Тазаланды', ru: '✅ Убрано' },
  REJECTED: { kk: '❌ Қабылданбады', ru: '❌ Отклонено' },
};

/** Экранирование для parse_mode HTML — всё, что пришло от пользователя или ИИ. */
export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
