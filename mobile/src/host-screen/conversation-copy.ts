import { formatTimeAgo } from '../worktree/agent-row-display'

const english = {
  conversations: 'Conversations',
  newChat: 'New chat',
  untitled: 'New conversation',
  search: 'Search conversations…',
  empty: 'Start a conversation in this project.',
  noProjects: 'Add a project from workspace settings to start chatting.',
  settings: 'More options',
  workspaces: 'Advanced: workspaces',
  back: 'Back to conversations',
  details: 'Conversation details',
  history: 'Conversation history',
  saved: 'Saved conversation',
  transcript: 'Saved transcript',
  offline: 'Waiting for host',
  loading: 'Loading conversations…',
  failed: 'Some conversations could not be loaded. Pull to refresh.',
  failedState: 'Failed',
  legacy:
    'This host lists open chats and saved transcripts. Update Orca to also list closed, empty chats.',
  ssh: 'Open chats on this SSH host. Transcript history is not available through this connection.',
  noAgents: 'No supported agents found on this host.',
  update: 'Update Orca on this host to start or reopen this conversation.',
  workspaceNeeded: 'Create a workspace for this project in advanced settings first.',
  agent: 'Choose an agent',
  accounts: 'Accounts',
  tasks: 'Tasks',
  newWorkspace: 'Add project or workspace',
  close: 'Close',
  working: 'Working',
  monitoring: 'Monitoring',
  blocked: 'Blocked',
  waiting: 'Waiting for input',
  done: 'Done',
  idle: 'Ready',
  interrupted: 'Interrupted',
  unconfirmed: 'Unconfirmed',
  unavailable: 'Could not open this conversation on its host.',
  refresh: 'Refresh',
  host: 'Host',
  workspace: 'Workspace',
  branch: 'Branch',
  model: 'Model'
}

const russian: typeof english = {
  conversations: 'Разговоры',
  newChat: 'Новый чат',
  untitled: 'Новый разговор',
  search: 'Поиск разговоров…',
  empty: 'Начните разговор в этом проекте.',
  noProjects: 'Добавьте проект в настройках рабочих каталогов, чтобы начать разговор.',
  settings: 'Другие действия',
  workspaces: 'Дополнительно: рабочие каталоги',
  back: 'К разговорам',
  details: 'Детали разговора',
  history: 'История разговоров',
  saved: 'Сохранённый разговор',
  transcript: 'Сохранённая переписка',
  offline: 'Ожидание подключения',
  loading: 'Загружаем разговоры…',
  failed: 'Часть разговоров не загрузилась. Потяните список для обновления.',
  failedState: 'Ошибка',
  legacy:
    'Этот хост показывает открытые чаты и сохранённую переписку. Обновите Orca, чтобы видеть также закрытые пустые чаты.',
  ssh: 'Открытые чаты на этом SSH-хосте. История переписки недоступна через это подключение.',
  noAgents: 'На этом хосте не найдено поддерживаемых агентов.',
  update: 'Обновите Orca на этом хосте, чтобы начать или открыть разговор.',
  workspaceNeeded: 'Сначала создайте рабочий каталог проекта в дополнительных настройках.',
  agent: 'Выберите агента',
  accounts: 'Аккаунты',
  tasks: 'Задачи',
  newWorkspace: 'Добавить проект или рабочий каталог',
  close: 'Закрыть',
  working: 'Работает',
  monitoring: 'Наблюдает',
  blocked: 'Заблокирован',
  waiting: 'Ждёт ответа',
  done: 'Готово',
  idle: 'Готов к работе',
  interrupted: 'Остановлен',
  unconfirmed: 'Не подтверждено',
  unavailable: 'Не удалось открыть разговор на его хосте.',
  refresh: 'Обновить',
  host: 'Хост',
  workspace: 'Рабочий каталог',
  branch: 'Ветка',
  model: 'Модель'
}

export function conversationCopy(locale = Intl.DateTimeFormat().resolvedOptions().locale) {
  return locale.toLowerCase().startsWith('ru') ? russian : english
}

export function conversationTimeAgo(
  at: number,
  now: number,
  locale = Intl.DateTimeFormat().resolvedOptions().locale
) {
  const label = formatTimeAgo(at, now)
  if (!locale.toLowerCase().startsWith('ru')) {
    return label
  }
  return label
    .replace('just now', 'сейчас')
    .replace(/m$/, ' мин')
    .replace(/h$/, ' ч')
    .replace(/d$/, ' дн')
}
